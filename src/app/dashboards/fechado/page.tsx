'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { CheckSquare, Clock, FolderOpen, Receipt, Info } from 'lucide-react'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string }
interface Executive { id: number; name: string }

interface ContributionItem {
  id: string
  project: { id: number; name: string; code: string } | null
  contributed_hours: number
  hourly_rate: number
  total_value: number
  description: string | null
  changed_by: { name: string } | null
  created_at: string
}

interface SummaryData {
  base_hours: number
  contribution_hours: number
  consumed_hours: number
  month_consumed_hours: number
  project_count: number
  month_project_count: number
  total_expenses: number
  contributed_hours_history?: ContributionItem[]
}

interface ProjectRow {
  id: number
  name: string
  code: string
  status: string
  base_hours: number
  contribution_hours: number
  sold_hours: number
  start_date: string | null
  in_month: boolean
}

interface ExpenseRow {
  id: number
  project: { id: number; name: string; code: string } | null
  user: { id: number; name: string } | null
  category: string | null
  description: string | null
  amount: number
  expense_date: string
  status: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(1) }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString('pt-BR') }

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
  icon: React.ElementType; accent?: 'default' | 'primary' | 'success' | 'info' | 'warning'
}) {
  const color = accent === 'primary' ? '#00F5FF' : accent === 'success' ? '#10B981' : accent === 'info' ? '#8B5CF6' : accent === 'warning' ? '#F59E0B' : 'var(--brand-text)'
  const bg    = accent === 'primary' ? 'rgba(0,245,255,0.08)' : accent === 'success' ? 'rgba(16,185,129,0.10)' : accent === 'info' ? 'rgba(139,92,246,0.10)' : accent === 'warning' ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.04)'
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

function NoTrackingNotice() {
  return (
    <div className="flex items-start gap-3 px-5 py-4 rounded-2xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.20)' }}>
      <Info size={16} color="#8B5CF6" className="shrink-0 mt-0.5" />
      <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
        Projetos com contrato <strong style={{ color: 'var(--brand-text)' }}>Fechado</strong> não possuem controle de saldo ou consumo de horas.<br />
        O acompanhamento é feito apenas pelo valor total contratado e seus aportes.
      </p>
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

  const [summary,         setSummary]         = useState<SummaryData | null>(null)
  const [loadingSummary,  setLoadingSummary]  = useState(false)
  const [projectRows,     setProjectRows]     = useState<ProjectRow[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [expenseRows,     setExpenseRows]     = useState<ExpenseRow[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'expenses'>('overview')

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
    const params = new URLSearchParams({ pageSize: '1000', contract_type_code: 'closed', parent_projects_only: 'true' })
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

  const fetchExpenses = useCallback(() => {
    setLoadingExpenses(true)
    api.get<any>(`/dashboards/fechado/expenses?${buildParams()}`)
      .then(r => setExpenseRows(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setExpenseRows([]))
      .finally(() => setLoadingExpenses(false))
  }, [buildParams])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'projects') fetchProjects() }, [activeTab, fetchProjects])
  useEffect(() => { if (activeTab === 'expenses') fetchExpenses() }, [activeTab, fetchExpenses])

  const statusLabel: Record<string, string> = {
    approved: 'Aprovado', pending: 'Pendente', rejected: 'Rejeitado',
    adjustment_requested: 'Ajuste', cancelled: 'Cancelado',
  }
  const statusColor: Record<string, string> = {
    approved: '#10B981', pending: '#F59E0B', rejected: '#EF4444',
    adjustment_requested: '#F59E0B', cancelled: 'var(--brand-muted)',
  }

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
          <Tab label="Despesas"    active={activeTab === 'expenses'}  onClick={() => setActiveTab('expenses')} />
        </div>

        {/* ── VISÃO GERAL ── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {loadingSummary ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : summary ? (
              <div className="space-y-4">
                <NoTrackingNotice />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <MetricCard
                    label="Horas Contratadas"
                    value={fmtH(summary.base_hours)}
                    unit="h"
                    icon={Clock}
                    accent="default"
                  />
                  <MetricCard
                    label="Aportes"
                    value={fmtH(summary.contribution_hours)}
                    unit="h"
                    icon={Clock}
                    accent="success"
                  />
                  <MetricCard
                    label="Total Contratado"
                    value={fmtH(summary.consumed_hours)}
                    unit="h"
                    icon={Clock}
                    accent="primary"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                  <MetricCard
                    label="Total em Despesas"
                    value={fmtBRL(summary.total_expenses)}
                    icon={Receipt}
                    accent="warning"
                  />
                </div>

                {(summary.contributed_hours_history?.length ?? 0) > 0 && (
                  <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                      <h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Histórico de Aporte de Horas</h3>
                    </div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                          <tr>
                            {['Projeto', 'Horas', 'Valor/h', 'Total', 'Descrição', 'Data', 'Por'].map(col => (
                              <th key={col} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {summary.contributed_hours_history!.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--brand-border)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <td className="px-5 py-3" style={{ color: 'var(--brand-text)' }}>{item.project?.code} — {item.project?.name}</td>
                              <td className="px-5 py-3 font-bold" style={{ color: '#00F5FF' }}>{item.contributed_hours}h</td>
                              <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{fmtBRL(item.hourly_rate)}</td>
                              <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{fmtBRL(item.total_value)}</td>
                              <td className="px-5 py-3 max-w-48 truncate" style={{ color: 'var(--brand-muted)' }}>{item.description || '—'}</td>
                              <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{fmtDate(item.created_at)}</td>
                              <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{item.changed_by?.name ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  </div>
                )}
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
          <div className="space-y-4">
            <NoTrackingNotice />
            <div className="rounded-2xl overflow-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
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
                  <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
                    <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                      {['Código', 'Projeto', 'Status', 'Horas Base', 'Aportes', 'Total', 'Início'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projectRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        style={{ borderBottom: idx < projectRows.length - 1 ? '1px solid var(--brand-border)' : undefined }}
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
                        <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtH(row.base_hours)} h</td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: '#8B5CF6' }}>{fmtH(row.contribution_hours)} h</td>
                        <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#00F5FF' }}>{fmtH(row.sold_hours)} h</td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                          {row.start_date ? new Date(row.start_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── DESPESAS ── */}
        {activeTab === 'expenses' && (
          <div className="rounded-2xl overflow-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            {loadingExpenses ? (
              <div className="p-10 text-center">
                <div className="animate-pulse h-4 w-32 mx-auto rounded" style={{ background: 'var(--brand-border)' }} />
              </div>
            ) : expenseRows.length === 0 ? (
              <div className="p-10 text-center">
                <Receipt size={32} className="mx-auto mb-3" style={{ color: 'var(--brand-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhuma despesa encontrada.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Data', 'Projeto', 'Colaborador', 'Categoria', 'Descrição', 'Valor', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{ borderBottom: idx < expenseRows.length - 1 ? '1px solid var(--brand-border)' : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtDate(row.expense_date)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--brand-text)' }}>
                        <span className="font-mono text-xs mr-1" style={{ color: 'var(--brand-muted)' }}>{row.project?.code}</span>
                        {row.project?.name}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--brand-muted)' }}>{row.user?.name ?? '—'}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--brand-muted)' }}>{row.category ?? '—'}</td>
                      <td className="px-4 py-3 max-w-48 truncate" style={{ color: 'var(--brand-muted)' }}>{row.description || '—'}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#F59E0B' }}>{fmtBRL(row.amount)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{
                          background: `${statusColor[row.status] ?? 'var(--brand-muted)'}20`,
                          color: statusColor[row.status] ?? 'var(--brand-muted)',
                        }}>
                          {statusLabel[row.status] ?? row.status}
                        </span>
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
