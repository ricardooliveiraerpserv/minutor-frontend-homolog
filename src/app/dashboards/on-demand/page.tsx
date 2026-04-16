'use client'

import { formatBRL } from '@/lib/format'
import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Zap, Clock, DollarSign } from 'lucide-react'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string }
interface Executive { id: number; name: string }

interface SummaryData {
  consumed_hours: number
  month_consumed_hours: number
  amount_to_pay?: number | null
  hourly_rate?: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(1) }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return formatBRL(v ?? 0)
}

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
  icon: React.ElementType; accent?: 'default' | 'primary' | 'success' | 'danger'
}) {
  const color = accent === 'primary' ? '#00F5FF' : accent === 'success' ? '#10B981' : accent === 'danger' ? '#EF4444' : 'var(--brand-text)'
  const bg    = accent === 'primary' ? 'rgba(0,245,255,0.08)' : accent === 'success' ? 'rgba(16,185,129,0.10)' : accent === 'danger' ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.04)'
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

export default function OnDemandPage() {
  const { user } = useAuth()
  const isAdmin   = user?.type === 'admin'
  const isCliente = user?.type === 'cliente'

  const now = new Date()
  const isoFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const isoLastDay  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`
  const [customers,   setCustomers]   = useState<Customer[]>([])
  const [executives,  setExecutives]  = useState<Executive[]>([])
  const [projects,    setProjects]    = useState<Project[]>([])
  const [selectedCustomer,  setSelectedCustomer]  = useState<number | ''>('')
  const [selectedExecutive, setSelectedExecutive] = useState<number | ''>('')
  const [selectedProject,   setSelectedProject]   = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState(isoFirstDay)
  const [dateTo,   setDateTo]   = useState(isoLastDay)
  const [refMonth, setRefMonth] = useState<number | null>(now.getMonth() + 1)
  const [refYear,  setRefYear]  = useState<number | null>(now.getFullYear())

  const [summary,       setSummary]       = useState<SummaryData | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'indicators'>('overview')
  const [indicatorParams, setIndicatorParams] = useState<URLSearchParams>(new URLSearchParams())

  // Load customers & executives (admin only)
  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=100&has_contract_type_name=On+Demand')
      .then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=100')
      .then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  // Load projects filtered by customer + contract type
  useEffect(() => {
    if (!user) return  // aguarda autenticação antes de buscar projetos
    const params = new URLSearchParams({ pageSize: '1000', contract_type_code: 'on_demand' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    else if (isCliente && user.customer_id) params.set('customer_id', String(user.customer_id))
    api.get<any>(`/projects?${params}`)
      .then(r => setProjects(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [user, selectedCustomer, isCliente])

  const buildParams = useCallback(() => {
    const now = new Date()
    const toM = refMonth ?? (dateTo ? Number(dateTo.split('-')[1]) : now.getMonth() + 1)
    const toY = refYear  ?? (dateTo ? Number(dateTo.split('-')[0]) : now.getFullYear())
    const p = new URLSearchParams({ month: String(toM), year: String(toY) })
    if (dateFrom) {
      const [fromY, fromM] = dateFrom.split('-').map(Number)
      if (fromM !== toM || fromY !== toY) {
        p.set('start_month', String(fromM))
        p.set('start_year',  String(fromY))
      }
    }
    if (selectedCustomer)                    p.set('customer_id',  String(selectedCustomer))
    else if (isCliente && user?.customer_id) p.set('customer_id',  String(user.customer_id))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    if (selectedProject)   p.set('project_id',   String(selectedProject))
    return p
  }, [selectedCustomer, selectedExecutive, selectedProject, dateFrom, dateTo, refMonth, refYear, isCliente, user?.customer_id])

  const fetchSummary = useCallback(() => {
    if (!selectedProject && isAdmin) return
    setLoadingSummary(true)
    api.get<any>(`/dashboards/on-demand?${buildParams()}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [buildParams, isAdmin, refMonth, refYear])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  // Atualiza params para o componente de indicadores sempre que buildParams mudar
  useEffect(() => {
    setIndicatorParams(buildParams())
  }, [buildParams])

  const hasFilters = !isAdmin || !!selectedProject



  return (
    <AppLayout title="Dashboard — On Demand">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.08)' }}>
            <Zap size={16} color="#00F5FF" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>On Demand</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>Consumo de horas por demanda — visão por projeto e período</p>
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
            placeholder="Selecione um projeto"
            wide
          />
          {/* Mês/Ano de referência */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Mês/Ano</label>
            <MonthYearPicker
              month={refMonth}
              year={refYear}
              onChange={(m, y) => {
                if (m === 0) { setRefMonth(null); setRefYear(null) }
                else { setRefMonth(m); setRefYear(y); setDateFrom(''); setDateTo('') }
              }}
            />
          </div>
        </div>

        {/* Empty state */}
        {!hasFilters && (
          <div className="rounded-2xl p-16 flex flex-col items-center gap-4 text-center" style={{ border: '1px dashed var(--brand-border)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.08)' }}>
              <Zap size={22} color="#00F5FF" />
            </div>
            <div>
              <p className="font-semibold mb-1" style={{ color: 'var(--brand-text)' }}>Nenhum projeto selecionado</p>
              <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                {isAdmin ? 'Selecione um cliente e um projeto para carregar os dados.' : 'Selecione um projeto para visualizar os dados de consumo.'}
              </p>
            </div>
          </div>
        )}

        {hasFilters && (
          <div className="space-y-6">
            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <Tab label="Visão Geral"  active={activeTab === 'overview'}    onClick={() => setActiveTab('overview')} />
              <Tab label="Indicadores"  active={activeTab === 'indicators'}  onClick={() => setActiveTab('indicators')} />
            </div>

            {/* ── VISÃO GERAL ── */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {loadingSummary ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : summary ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <MetricCard
                      label="Consumo do Mês"
                      value={fmtH(summary.month_consumed_hours)}
                      unit="h"
                      icon={Clock}
                      accent="primary"
                    />
                    <MetricCard
                      label="Valor Hora"
                      value={fmtBRL(summary.hourly_rate)}
                      icon={DollarSign}
                      accent="default"
                    />
                    <MetricCard
                      label="Valor a Pagar"
                      value={fmtBRL(summary.amount_to_pay)}
                      icon={DollarSign}
                      accent={(summary.amount_to_pay ?? 0) > 0 ? 'danger' : 'success'}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível para o período selecionado.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── INDICADORES ── */}
            {activeTab === 'indicators' && (
              <DashboardIndicators
                basePath="/dashboards/on-demand/indicators"
                params={indicatorParams}
                disabled={!hasFilters}
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
