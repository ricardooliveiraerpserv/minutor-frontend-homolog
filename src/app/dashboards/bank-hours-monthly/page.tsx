'use client'

import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/app-layout'
import React, { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string; start_date?: string | null }
interface Executive { id: number; name: string }

interface SummaryData {
  contracted_hours: number
  accumulated_contracted_hours?: number
  contributed_hours?: number
  consumed_hours: number
  projects_consumed_hours?: number
  projects_month_consumed_hours?: number
  maintenance_consumed_hours?: number
  maintenance_month_consumed_hours?: number
  has_support?: boolean
  month_consumed_hours: number
  hours_balance: number
  exceeded_hours?: number
  amount_to_pay?: number | null
  hourly_rate?: number | null
  contributed_hours_history?: ContributionItem[]
  start_date?: string | null
}

interface ContributionItem {
  id: number
  project: { id: number; name: string; code: string }
  difference: number
  contributed_hours?: number
  hourly_rate?: number
  total_value?: number
  description?: string | null
  changed_by: { name: string } | null
  created_at: string
}

interface ProjectItem {
  id: number
  name: string
  code: string
  status_display: string
  contract_type_display: string
  sold_hours: number | null
  total_contributions_hours: number
  hour_contribution: number | null
  hours_balance: number
  start_date: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(1) + 'h' }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return formatBRL(v ?? 0)
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString('pt-BR') }


function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' | 'primary' }) {
  const color = accent === 'success' ? '#10B981' : accent === 'danger' ? '#EF4444' : accent === 'primary' ? '#00F5FF' : 'var(--brand-text)'
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
      <span className="text-3xl font-extrabold tracking-tight" style={{ color, lineHeight: 1 }}>{value}</span>
    </div>
  )
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 text-sm font-semibold rounded-xl transition-all"
      style={active ? { background: 'var(--brand-primary)', color: '#0A0A0B' } : { color: 'var(--brand-muted)' }}
    >
      {label}
    </button>
  )
}

// ─── Projects Table ───────────────────────────────────────────────────────────

function ProjectsTable({ items, loading }: { items: ProjectItem[]; loading: boolean }) {
  return (
    <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--brand-border)' }} />
          ))}
        </div>
      ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['Código','Projeto','Status','Tipo','Horas Vendidas','Saldo','Início'].map(col => (
                  <th key={col} className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider ${col === 'Saldo' || col === 'Horas Vendidas' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado.</td></tr>
                : items.map(p => {
                  const balance = p.hours_balance ?? 0
                  const contributions = p.total_contributions_hours || p.hour_contribution || 0
                  return (
                    <tr key={p.id} className="transition-colors" style={{ borderBottom: '1px solid var(--brand-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>{p.code}</span>
                      </td>
                      <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--brand-text)' }}>{p.name}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>{p.status_display}</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.contract_type_display}</td>
                      <td className="px-5 py-3.5 text-right font-medium" style={{ color: 'var(--brand-text)' }}>
                        {p.sold_hours !== null ? (contributions > 0 ? `${p.sold_hours} (+${contributions})` : String(p.sold_hours)) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold" style={{ color: balance >= 0 ? '#10B981' : '#EF4444' }}>{fmtH(balance)}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function BankHoursMonthlyPage() {
  const { user } = useAuth()
  const router = useRouter()
  const isAdmin   = user?.type === 'admin'
  const isCliente = user?.type === 'cliente'

  useEffect(() => {
    if (user && user.type === 'coordenador') router.replace('/timesheets')
  }, [user, router])

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
  const [filterMode, setFilterMode] = useState<'month' | 'period'>('month')

  const [summary,      setSummary]      = useState<SummaryData | null>(null)
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([])
  const [maintList,    setMaintList]    = useState<ProjectItem[]>([])
  const [loadingSummary,  setLoadingSummary]  = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingMaint,    setLoadingMaint]    = useState(false)
  const [activeTab, setActiveTab] = useState<'total' | 'projects' | 'maintenance' | 'indicators'>('total')
  const [indicatorParams, setIndicatorParams] = useState<URLSearchParams>(new URLSearchParams())

  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=100&has_contract_type_name=Banco+de+Horas+Mensal').then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=100').then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    if (!user) return  // aguarda autenticação antes de buscar projetos
    const params = new URLSearchParams({ pageSize: '1000', contract_type_code: 'monthly_hours' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    else if (isCliente && user.customer_id) params.set('customer_id', String(user.customer_id))
    api.get<any>(`/projects?${params}`).then(r => {
      setProjects(Array.isArray(r?.items) ? r.items : [])
    }).catch(() => {})
  }, [user, selectedCustomer, isCliente])

  const fetchSummary = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const now = new Date()
    const toM = refMonth ?? (dateTo ? Number(dateTo.split('-')[1]) : now.getMonth() + 1)
    const toY = refYear  ?? (dateTo ? Number(dateTo.split('-')[0]) : now.getFullYear())
    const params = new URLSearchParams({ month: String(toM), year: String(toY) })
    if (selectedCustomer)                          params.set('customer_id',  String(selectedCustomer))
    else if (isCliente && user?.customer_id)       params.set('customer_id',  String(user.customer_id))
    if (selectedExecutive) params.set('executive_id', String(selectedExecutive))
    if (selectedProject)   params.set('project_id',   String(selectedProject))
    setLoadingSummary(true)
    api.get<any>(`/dashboards/bank-hours-monthly?${params}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [selectedCustomer, selectedExecutive, selectedProject, dateFrom, dateTo, refMonth, refYear, isAdmin, isCliente, user?.customer_id])

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

  const fetchProjectsList = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = buildParams()
    params.set('service_type_name', 'Projeto')
    setLoadingProjects(true)
    api.get<any>(`/dashboards/bank-hours-monthly/projects?${params}`)
      .then(r => setProjectsList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectsList([]))
      .finally(() => setLoadingProjects(false))
  }, [buildParams, isAdmin])

  const fetchMaintList = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = buildParams()
    params.set('service_type_name', 'Sustentação')
    setLoadingMaint(true)
    api.get<any>(`/dashboards/bank-hours-monthly/projects?${params}`)
      .then(r => setMaintList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setMaintList([]))
      .finally(() => setLoadingMaint(false))
  }, [buildParams, isAdmin])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'projects')    fetchProjectsList() }, [fetchProjectsList, activeTab])
  useEffect(() => { if (activeTab === 'maintenance') fetchMaintList()    }, [fetchMaintList, activeTab])
  useEffect(() => { setIndicatorParams(buildParams()) }, [buildParams])

  const hasFilters = !isAdmin || !!selectedProject

  return (
    <AppLayout title="Dashboard — Banco de Horas Mensais">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.08)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00F5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>Banco de Horas Mensais</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>Consumo e saldo de horas por mês e projeto</p>
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
          {/* Filtro de data */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Data</label>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
                {(['month', 'period'] as const).map((mode) => (
                  <button key={mode} onClick={() => setFilterMode(mode)}
                    className="px-3 py-1.5 font-medium transition-colors"
                    style={{ background: filterMode === mode ? 'rgba(0,245,255,0.12)' : 'transparent', color: filterMode === mode ? '#00F5FF' : '#71717a' }}>
                    {mode === 'month' ? 'Mês/Ano' : 'Período'}
                  </button>
                ))}
              </div>
              {filterMode === 'month' ? (
                <MonthYearPicker
                  month={refMonth}
                  year={refYear}
                  onChange={(m, y) => {
                    if (m === 0) { setRefMonth(null); setRefYear(null) }
                    else { setRefMonth(m); setRefYear(y); setDateFrom(''); setDateTo('') }
                  }}
                />
              ) : (
                <DateRangePicker
                  from={dateFrom}
                  to={dateTo}
                  onChange={(f, t) => { setDateFrom(f); setDateTo(t); setRefMonth(null); setRefYear(null) }}
                />
              )}
            </div>
          </div>
        </div>

        {!hasFilters && (
          <div className="rounded-2xl p-16 text-center" style={{ border: '1px dashed var(--brand-border)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(0,245,255,0.06)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00F5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--brand-text)' }}>Nenhum projeto selecionado</p>
            <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
              {isAdmin
                ? 'Selecione um cliente e um projeto para visualizar os dados do dashboard.'
                : 'Selecione um projeto para visualizar os dados do dashboard.'}
            </p>
          </div>
        )}

        {hasFilters && (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <Tab label="Total Geral"  active={activeTab === 'total'}       onClick={() => setActiveTab('total')} />
              <Tab label="Projetos"     active={activeTab === 'projects'}    onClick={() => setActiveTab('projects')} />
              {(summary?.has_support ?? true) && (
                <Tab label="Sustentação" active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} />
              )}
              <Tab label="Indicadores"  active={activeTab === 'indicators'}  onClick={() => setActiveTab('indicators')} />
            </div>

            {/* Total Tab */}
            {activeTab === 'total' && (
              <div className="space-y-4">
                {loadingSummary ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--brand-border)' }} />
                        <div className="h-10 w-20 rounded" style={{ background: 'var(--brand-border)' }} />
                      </div>
                    ))}
                  </div>
                ) : summary ? (
                  <>
                    {/* Row 1 — 4 cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {/* Total Disponível = Acumulado + Aporte, com breakdown mensal */}
                      {(() => {
                        const hrsPerMonth   = summary.contracted_hours ?? 0
                        const accumulated   = summary.accumulated_contracted_hours ?? hrsPerMonth
                        const aporte        = summary.contributed_hours ?? 0
                        const totalDisp     = accumulated + aporte
                        const months        = hrsPerMonth > 0 ? Math.round(accumulated / hrsPerMonth) : 0
                        const startDate     = summary.start_date
                          ? new Date(summary.start_date + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
                          : '—'
                        return (
                          <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Total Contratado</span>
                            <span className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--brand-text)', lineHeight: 1 }}>
                              {fmtH(totalDisp)}
                            </span>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>H/mês</p>
                                <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(hrsPerMonth)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Meses</p>
                                <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{months}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Início</p>
                                <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{startDate}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Aporte</p>
                                <p className="text-sm font-bold" style={{ color: '#a78bfa' }}>{fmtH(aporte)}</p>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {/* Consumo Acumulado with breakdown */}
                      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consumo Acumulado</span>
                        <div className="flex items-end gap-1.5">
                          <span className="text-3xl font-extrabold tracking-tight" style={{ color: '#00F5FF', lineHeight: 1 }}>{fmtH(summary.consumed_hours)}</span>
                        </div>
                        {(summary.projects_consumed_hours !== undefined || summary.maintenance_consumed_hours !== undefined) && (
                          <div className="flex gap-3 pt-1 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Projetos</p>
                              <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(summary.projects_consumed_hours ?? 0)}</p>
                            </div>
                            <div className="w-px" style={{ background: 'var(--brand-border)' }} />
                            <div>
                              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Sustentação</p>
                              <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(summary.maintenance_consumed_hours ?? 0)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <StatCard label="Consumo do Mês" value={fmtH(summary.month_consumed_hours)} />
                      <StatCard
                        label="Saldo de Horas"
                        value={fmtH(summary.hours_balance)}
                        accent={summary.hours_balance >= 0 ? 'success' : 'danger'}
                      />
                    </div>
                    {/* Row 2 — 3 cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <StatCard
                        label="Horas Excedentes"
                        value={fmtH(summary.exceeded_hours ?? 0)}
                        accent={(summary.exceeded_hours ?? 0) > 0 ? 'danger' : undefined}
                      />
                      <StatCard label="Valor Hora"   value={fmtBRL(summary.hourly_rate)} />
                      <StatCard
                        label="Valor a Pagar"
                        value={fmtBRL(summary.amount_to_pay)}
                        accent={(summary.amount_to_pay ?? 0) > 0 ? 'danger' : undefined}
                      />
                    </div>

                    {/* Histórico de Aporte */}
                    {(summary.contributed_hours_history?.length ?? 0) > 0 && (
                      <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                          <h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Histórico de Aporte de Horas</h3>
                        </div>
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                              <tr>
                                {['Projeto','Horas','Valor/h','Total','Descrição','Data','Por'].map(col => (
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
                                  <td className="px-5 py-3 font-bold" style={{ color: '#00F5FF' }}>{(item.contributed_hours ?? item.difference ?? 0).toFixed(0)}h</td>
                                  <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{fmtBRL(item.hourly_rate ?? null)}</td>
                                  <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{fmtBRL(item.total_value ?? null)}</td>
                                  <td className="px-5 py-3 max-w-48 truncate" style={{ color: 'var(--brand-muted)' }}>{item.description || '—'}</td>
                                  <td className="px-5 py-3 text-sm" style={{ color: 'var(--brand-muted)' }}>{fmtDate(item.created_at)}</td>
                                  <td className="px-5 py-3 text-sm" style={{ color: 'var(--brand-muted)' }}>{item.changed_by?.name ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível.</p>
                )}
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              <div className="space-y-4">
                {summary && (
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard label="Consumo Acumulado" value={fmtH(summary.projects_consumed_hours ?? 0)} accent="primary" />
                    <StatCard label="Consumo do Mês"    value={fmtH(summary.projects_month_consumed_hours ?? 0)} />
                  </div>
                )}
                <ProjectsTable items={projectsList} loading={loadingProjects} />
              </div>
            )}

            {/* ── SUSTENTAÇÃO ── */}
            {activeTab === 'maintenance' && (
              <div className="space-y-4">
                {summary && (
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard label="Consumo Acumulado" value={fmtH(summary.maintenance_consumed_hours ?? 0)} accent="primary" />
                    <StatCard label="Consumo do Mês"    value={fmtH(summary.maintenance_month_consumed_hours ?? 0)} />
                  </div>
                )}
                <ProjectsTable items={maintList} loading={loadingMaint} />
              </div>
            )}

            {/* ── INDICADORES ── */}
            {activeTab === 'indicators' && (
              <DashboardIndicators
                basePath="/dashboards/bank-hours-monthly/indicators"
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
