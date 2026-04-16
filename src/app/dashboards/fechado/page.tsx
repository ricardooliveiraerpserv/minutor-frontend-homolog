'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { CheckSquare, Clock, FolderOpen } from 'lucide-react'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string }
interface Executive { id: number; name: string }

interface SummaryData {
  consumed_hours: number
  month_consumed_hours: number
  project_count: number
  month_project_count: number
}

interface ProjectRow {
  id: number
  name: string
  code: string
  status: string
  sold_hours: number
  start_date: string | null
  in_month: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(1) }

// ─── Components ──────────────────────────────────────────────────────────────

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all"
      style={active ? { background: 'var(--brand-primary)', color: '#0A0A0B' } : { color: 'var(--brand-muted)' }}
    >
      {label}
    </button>
  )
}

function MetricCard({ label, value, unit = '', icon: Icon, accent = 'default' }: {
  label: string; value: string; unit?: string
  icon: React.ElementType; accent?: 'default' | 'primary' | 'success' | 'info'
}) {
  const color = accent === 'primary' ? '#00F5FF' : accent === 'success' ? '#10B981' : accent === 'info' ? '#8B5CF6' : 'var(--brand-text)'
  const bg    = accent === 'primary' ? 'rgba(0,245,255,0.08)' : accent === 'success' ? 'rgba(16,185,129,0.10)' : accent === 'info' ? 'rgba(139,92,246,0.10)' : 'rgba(255,255,255,0.04)'
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: bg }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color, lineHeight: 1 }}>{value}</span>
        {unit && <span className="text-lg font-medium mb-0.5" style={{ color: 'var(--brand-muted)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-6 animate-pulse" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--brand-border)' }} />
      <div className="h-10 w-20 rounded" style={{ background: 'var(--brand-border)' }} />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FechadoPage() {
  const { user } = useAuth()
  const isAdmin   = user?.type === 'admin'
  const isCliente = user?.type === 'cliente'

  const now = new Date()
  const [customers,   setCustomers]   = useState<Customer[]>([])
  const [executives,  setExecutives]  = useState<Executive[]>([])
  const [projects,    setProjects]    = useState<Project[]>([])
  const [selectedCustomer,  setSelectedCustomer]  = useState<number | ''>('')
  const [selectedExecutive, setSelectedExecutive] = useState<number | ''>('')
  const [selectedProject,   setSelectedProject]   = useState<number | ''>('')
  const [refMonth, setRefMonth] = useState<number | null>(now.getMonth() + 1)
  const [refYear,  setRefYear]  = useState<number | null>(now.getFullYear())

  const [summary,        setSummary]        = useState<SummaryData | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [projectRows,    setProjectRows]    = useState<ProjectRow[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'projects'>('overview')

  // Load customers & executives (admin only)
  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=100&has_contract_type_name=Fechado')
      .then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=100')
      .then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  // Load project list for dropdown
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams({ pageSize: '1000', contract_type_name: 'Fechado' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    else if (isCliente && user.customer_id) params.set('customer_id', String(user.customer_id))
    api.get<any>(`/projects?${params}`)
      .then(r => setProjects(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [user, selectedCustomer, isCliente])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({
      month: String(refMonth ?? now.getMonth() + 1),
      year:  String(refYear  ?? now.getFullYear()),
    })
    if (selectedCustomer)                    p.set('customer_id',  String(selectedCustomer))
    else if (isCliente && user?.customer_id) p.set('customer_id',  String(user.customer_id))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    if (selectedProject)   p.set('project_id',   String(selectedProject))
    return p
  }, [selectedCustomer, selectedExecutive, selectedProject, refMonth, refYear, isCliente, user?.customer_id])

  const fetchSummary = useCallback(() => {
    setLoadingSummary(true)
    api.get<any>(`/dashboards/fechado?${buildParams()}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [buildParams])

  const fetchProjects = useCallback(() => {
    setLoadingProjects(true)
    api.get<any>(`/dashboards/fechado/projects?${buildParams()}`)
      .then(r => setProjectRows(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectRows([]))
      .finally(() => setLoadingProjects(false))
  }, [buildParams])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'projects') fetchProjects() }, [activeTab, fetchProjects])

  return (
    <AppLayout title="Dashboard — Fechado">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.10)' }}>
            <CheckSquare size={16} color="#8B5CF6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>Fechado</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>Projetos com contrato fechado — horas vendidas por projeto e período de início</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-5 rounded-2xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {isAdmin && (
            <SearchSelect
              label="Executivo"
              value={String(selectedExecutive)}
              onChange={v => { setSelectedExecutive(v === '' ? '' : Number(v)); setSelectedCustomer(''); setSelectedProject('') }}
              options={executives}
              placeholder="Todos os executivos"
              wide
            />
          )}
          {isAdmin && (
            <SearchSelect
              label="Cliente"
              value={String(selectedCustomer)}
              onChange={v => { setSelectedCustomer(v === '' ? '' : Number(v)); setSelectedExecutive(''); setSelectedProject('') }}
              options={customers}
              placeholder="Todos os clientes"
              wide
            />
          )}
          <SearchSelect
            label="Projeto"
            value={String(selectedProject)}
            onChange={v => setSelectedProject(v === '' ? '' : Number(v))}
            options={projects.map(p => ({ id: p.id, name: `${p.code} — ${p.name}` }))}
            placeholder="Todos os projetos"
            wide
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Mês/Ano</label>
            <MonthYearPicker
              month={refMonth}
              year={refYear}
              onChange={(m, y) => {
                if (m === 0) { setRefMonth(null); setRefYear(null) }
                else { setRefMonth(m); setRefYear(y) }
              }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <Tab label="Visão Geral" active={activeTab === 'overview'}  onClick={() => setActiveTab('overview')} />
          <Tab label="Projetos"    active={activeTab === 'projects'}  onClick={() => setActiveTab('projects')} />
        </div>

        {/* ── VISÃO GERAL ── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {loadingSummary ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : summary ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <MetricCard
                  label="Horas Vendidas (Acumulado)"
                  value={fmtH(summary.consumed_hours)}
                  unit="h"
                  icon={Clock}
                  accent="primary"
                />
                <MetricCard
                  label={`Horas Vendidas (Mês ${refMonth ?? ''}/${refYear ?? ''})`}
                  value={fmtH(summary.month_consumed_hours)}
                  unit="h"
                  icon={Clock}
                  accent="info"
                />
              </div>
            ) : (
              <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível para o período selecionado.</p>
              </div>
            )}
          </div>
        )}

        {/* ── PROJETOS ── */}
        {activeTab === 'projects' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            {loadingProjects ? (
              <div className="p-10 text-center">
                <div className="animate-pulse h-4 w-32 mx-auto rounded" style={{ background: 'var(--brand-border)' }} />
              </div>
            ) : projectRows.length === 0 ? (
              <div className="p-10 text-center">
                <FolderOpen size={32} className="mx-auto mb-3" style={{ color: 'var(--brand-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto fechado encontrado.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    {['Código', 'Projeto', 'Status', 'Horas Vendidas', 'Início', 'No Mês'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projectRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: idx < projectRows.length - 1 ? '1px solid var(--brand-border)' : undefined,
                        background: row.in_month ? 'rgba(139,92,246,0.04)' : undefined,
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--brand-muted)' }}>{row.code}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--brand-text)' }}>{row.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{
                          background: row.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                          color: row.status === 'active' ? '#10B981' : 'var(--brand-muted)',
                        }}>
                          {row.status === 'active' ? 'Ativo' : row.status === 'closed' ? 'Encerrado' : row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#00F5FF' }}>
                        {fmtH(row.sold_hours)} h
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                        {row.start_date ? new Date(row.start_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.in_month
                          ? <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>Sim</span>
                          : <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  )
}
