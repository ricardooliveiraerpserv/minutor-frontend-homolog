'use client'

import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/app-layout'
import React, { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { Eye, AlertTriangle } from 'lucide-react'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import ProjectTimesheetsModal from '@/components/dashboard/ProjectTimesheetsModal'
import { MonthlyAccrualTable } from '@/components/projects/monthly-accrual-table'
import {
  useMaintenanceInline, exportMaintenanceToXLSX,
  ExportButton, InlineTimesheetsTable, InlineTicketSummaryTable, InlineExpensesTable, TimesheetDetailModal,
} from '@/components/dashboard/MaintenanceInline'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { KpiCard } from '@/components/ui/kpi-card'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string; start_date?: string | null; status?: string; status_display?: string; service_type?: { code?: string | null; name?: string | null } | null }
interface Executive { id: number; name: string }

interface SummaryData {
  contracted_hours: number
  extrato_visivel_cliente?: boolean
  monthly_statement?: any
  monthly_increments?: { year_month: string; hours: number }[] | null
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
  motivo?: string
  changed_by: { name: string } | null
  created_at: string
}

const MOTIVO_LABEL: Record<string, string> = {
  aporte: 'Aporte',
  excedentes: 'Excedentes',
  absorvidas: 'Absorvidas',
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
  consumed_hours: number
  hours_balance: number
  start_date: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(1) + 'h' }

// ── Card informativo FIXO do saldo devedor da CONCRESERV (customer_id 215). ──
// Valores CONGELADOS manualmente (consumo até abr/2026, SEM maio):
//   contratadas = 5653 − 160 (mês maio) = 5493
//   consumidas  = 6199,1 − 168 (apont. maio) = 6031,1
//   saldo       = 5493 − 6031,1 = −538,1
// Fica hardcoded de propósito: quando o cadastro for limpo (aporte/apontamentos
// iniciais), o cálculo dinâmico muda, mas este informativo permanece.
const CONCRESERV_CUSTOMER_ID = 215
const CONCRESERV_SALDO_DEVEDOR = { contratadas: 5493.0, consumidas: 6031.1, saldo: -538.1, referencia: 'consumo até abr/2026' }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return formatBRL(v ?? 0)
}
function fmtDate(s: string) {
  // Sem shift de fuso — mantém DD/MM/AAAA literal do banco.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString('pt-BR')
}


// StatCard local removido — agora usamos KpiCard de '@/components/ui/kpi-card'.

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 text-sm font-semibold rounded-xl transition-all"
      style={active ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' } : { color: 'var(--brand-muted)' }}
    >
      {label}
    </button>
  )
}

// ─── Projects Table ───────────────────────────────────────────────────────────

function ProjectsTable({ items, loading, onViewTimesheets }: { items: ProjectItem[]; loading: boolean; onViewTimesheets: (p: ProjectItem) => void }) {
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
                {['Código','Projeto','Status','Tipo','Horas Vendidas','Consumo','Início',''].map(col => (
                  <th key={col} className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider ${['Horas Vendidas','Consumo'].includes(col) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={8} className="py-12 text-center text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado.</td></tr>
                : items.map(p => {
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
                      <td className="px-5 py-3.5 text-right font-medium" style={{ color: 'var(--brand-text)' }}>{fmtH(p.consumed_hours ?? 0)}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                      <td className="px-3 py-3.5 text-right">
                        <button
                          onClick={() => onViewTimesheets(p)}
                          className="p-1.5 rounded-md hover:bg-white/5"
                          style={{ color: 'var(--text-muted)' }}
                          title="Ver apontamentos"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
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
  const canReverseApproval = !!user && user.type !== 'consultor' && user.type !== 'cliente'

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
  const [activeTab, setActiveTab] = useState<'total' | 'projects' | 'maintenance' | 'expenses' | 'indicators'>('total')
  // Modal reutilizável "Ver apontamentos" da aba Projetos.
  const [tsModalProject, setTsModalProject] = useState<ProjectItem | null>(null)

  // Componentes embarcados (Sustentação completa + Despesas)
  const mxKind: 'maintenance' | 'expenses' = activeTab === 'expenses' ? 'expenses' : 'maintenance'
  const { rows: mxRows, loading: mxLoading, ticketSummary: mxTicketSummary, ticketLoading: mxTicketLoading, reload: reloadMx } = useMaintenanceInline({
    enabled: activeTab === 'maintenance' || activeTab === 'expenses',
    kind: mxKind,
    customerId: selectedCustomer || user?.customer_id,
    projectId: selectedProject || null,
    dateFrom,
    dateTo,
  })
  const [mxDetail, setMxDetail] = useState<any | null>(null)
  const [indicatorParams, setIndicatorParams] = useState<URLSearchParams>(new URLSearchParams())

  useEffect(() => {
    if (!user || user.type !== 'admin') return
    api.get<any>('/customers?pageSize=500&has_contract_type_name=Banco+de+Horas+Mensal').then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=100').then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user) return  // aguarda autenticação antes de buscar projetos
    const params = new URLSearchParams({ pageSize: '1000', contract_type_code: 'monthly_hours', parent_projects_only: 'true' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    else if (isCliente && user.customer_id) params.set('customer_id', String(user.customer_id))
    api.get<any>(`/projects?${params}`).then(r => {
      setProjects(Array.isArray(r?.items) ? r.items : [])
    }).catch(() => {})
  }, [user, selectedCustomer, isCliente])

  const fetchSummary = useCallback(() => {
    if (!selectedProject) return
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
    if (!selectedProject) return
    const params = buildParams()
    params.set('service_type_name', 'Projeto')
    setLoadingProjects(true)
    api.get<any>(`/dashboards/bank-hours-monthly/projects?${params}`)
      .then(r => setProjectsList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectsList([]))
      .finally(() => setLoadingProjects(false))
  }, [buildParams, isAdmin])

  const fetchMaintList = useCallback(() => {
    if (!selectedProject) return
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

  // Exige PROJETO selecionado pra todos (sem projeto = estado vazio, não agrega o cliente).
  const hasFilters = !!selectedProject

  // Projeto selecionado + se o contrato é do tipo Sustentação (esconde a aba "Sustentação").
  const selProj = projects.find(p => p.id === selectedProject)
  const isSustentacaoContract = (() => {
    const st = selProj?.service_type
    if (!st) return false
    const c = (st.code ?? '').toLowerCase()
    const n = (st.name ?? '').toLowerCase()
    return c === 'sustentacao' || /sustenta|cloud|bizify/.test(n)
  })()

  // Abas "Sustentação" e "Indicadores" só em contrato de sustentação; "Projetos"
  // sempre (em sustentação lista os projetos-filho). Reseta se some.
  useEffect(() => {
    if (!isSustentacaoContract && (activeTab === 'maintenance' || activeTab === 'indicators')) setActiveTab('total')
  }, [isSustentacaoContract, activeTab])

  // Legenda do "Consumo do Mês" — espelha o período efetivo do summary.
  const MONTH_NAMES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const monthConsumptionHint = (() => {
    if (dateFrom && dateTo) {
      const fmt = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[3]}/${m[2]}/${m[1]}` : s }
      return `Período: ${fmt(dateFrom)} a ${fmt(dateTo)}`
    }
    if (refMonth && refYear) return `${MONTH_NAMES_PT[refMonth - 1]} ${refYear}`
    const now = new Date()
    return `Mês vigente — ${MONTH_NAMES_PT[now.getMonth()]} ${now.getFullYear()}`
  })()

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
            {summary && (summary.contracted_hours ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: 'var(--brand-primary)' }}>
                Contrato mensal · {fmtH(summary.contracted_hours)} contratadas por mês
              </span>
            )}
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
          {/* Status do projeto selecionado — em evidência, cores padrão (verde/vermelho/etc). */}
          {(() => {
            const sel = projects.find(p => String(p.id) === String(selectedProject))
            if (!sel?.status) return null
            const c = (sel.status === 'cancelled' || sel.status === 'finished')
              ? { bg: 'var(--danger-bg)',  fg: 'var(--danger)',  bd: 'var(--danger-border)' }
              : sel.status === 'paused'
              ? { bg: 'var(--warning-bg)', fg: 'var(--warning)', bd: 'var(--warning-border)' }
              : (sel.status === 'started' || sel.status === 'awaiting_start')
              ? { bg: 'var(--success-bg)', fg: 'var(--success)', bd: 'var(--success-border)' }
              : { bg: 'var(--info-bg)',    fg: 'var(--info)',    bd: 'var(--info-border)' }
            return (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Status</label>
                <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold w-fit" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
                  {sel.status_display ?? sel.status}
                </span>
              </div>
            )
          })()}
          {/* Filtro de data */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Data</label>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
                {(['month', 'period'] as const).map((mode) => (
                  <button key={mode} onClick={() => setFilterMode(mode)}
                    className="px-3 py-1.5 font-medium transition-colors"
                    style={{ background: filterMode === mode ? 'var(--primary)' : 'transparent', color: filterMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
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

        {/* Sem projeto selecionado → lista de projetos com botão "Ver". */}
        {!hasFilters && (
          <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                <tr>
                  {['Código','Projeto','Status'].map(col => (
                    <th key={col} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                  ))}
                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado.</td></tr>
                ) : projects.map(p => (
                  <tr key={p.id} className="transition-colors" style={{ borderBottom: '1px solid var(--brand-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>{p.code}</span>
                    </td>
                    <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--brand-text)' }}>{p.name}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>{p.status_display ?? p.status ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedProject(p.id)}
                        className="inline-flex items-center px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{ background: 'var(--brand-primary)', color: 'var(--primary-fg)' }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasFilters && (
          <div className="space-y-6">
            {/* Voltar à lista de projetos */}
            <button
              onClick={() => setSelectedProject('')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              ← Projetos
            </button>
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <Tab label="Total Geral"  active={activeTab === 'total'}       onClick={() => setActiveTab('total')} />
              <Tab label="Projetos"     active={activeTab === 'projects'}    onClick={() => setActiveTab('projects')} />
              {isSustentacaoContract && (
                <Tab label="Sustentação" active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} />
              )}
              <Tab label="Despesas"     active={activeTab === 'expenses'}    onClick={() => setActiveTab('expenses')} />
              {isSustentacaoContract && (
                <Tab label="Indicadores"  active={activeTab === 'indicators'}  onClick={() => setActiveTab('indicators')} />
              )}
            </div>

            {/* Total Tab */}
            {activeTab === 'total' && (
              <div className="space-y-4">
                {/* Saldo devedor INFORMATIVO — fixo, só CONCRESERV (não recalcula) */}
                {Number(selectedCustomer || user?.customer_id) === CONCRESERV_CUSTOMER_ID && (
                  <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} style={{ color: '#EF4444' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
                        Saldo Devedor — ERPSERV <span style={{ opacity: 0.7 }}>(informativo)</span>
                      </span>
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight" style={{ color: '#EF4444', lineHeight: 1 }}>
                      {fmtH(CONCRESERV_SALDO_DEVEDOR.saldo)}
                    </span>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Horas contratadas</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(CONCRESERV_SALDO_DEVEDOR.contratadas)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Horas consumidas</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(CONCRESERV_SALDO_DEVEDOR.consumidas)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Referência</p>
                        <p className="text-sm font-medium" style={{ color: 'var(--brand-muted)' }}>{CONCRESERV_SALDO_DEVEDOR.referencia}</p>
                      </div>
                    </div>
                  </div>
                )}
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
                      <KpiCard label="Consumo do Mês" value={fmtH(summary.month_consumed_hours)} hint={monthConsumptionHint} />
                      <KpiCard
                        label="Saldo de Horas"
                        value={fmtH(summary.hours_balance)}
                        accent={summary.hours_balance >= 0 ? 'success' : 'danger'}
                      />
                    </div>
                    {/* Row 2 — 3 cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Sem valor/hora definido → os 3 cards ficam sem valor (—). */}
                      <KpiCard
                        label="Horas Excedentes"
                        value={summary.hourly_rate != null ? fmtH(summary.exceeded_hours ?? 0) : '—'}
                        accent={summary.hourly_rate != null && (summary.exceeded_hours ?? 0) > 0 ? 'danger' : undefined}
                      />
                      <KpiCard label="Valor Hora"   value={fmtBRL(summary.hourly_rate)} />
                      <KpiCard
                        label="Valor a Pagar"
                        value={summary.hourly_rate != null ? fmtBRL(summary.amount_to_pay) : '—'}
                        accent={summary.hourly_rate != null && (summary.amount_to_pay ?? 0) > 0 ? 'danger' : undefined}
                      />
                    </div>

                    {/* Horas mensais incrementadas (acúmulo do banco mensal) — acima dos aportes.
                        Para o CLIENTE só aparece se a chave extrato_visivel_cliente estiver ligada. */}
                    {(!isCliente || summary.extrato_visivel_cliente !== false) && (
                      <MonthlyAccrualTable
                        variant="brand"
                        startDate={summary.start_date}
                        hoursPerMonth={summary.contracted_hours ?? 0}
                        accumulated={summary.accumulated_contracted_hours ?? null}
                        statement={summary.monthly_statement ?? null}
                        monthlyIncrements={summary.monthly_increments ?? null}
                      />
                    )}

                    {/* Histórico de Aporte — sempre exibido (com estado vazio). */}
                    <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                          <h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Histórico de Aporte de Horas</h3>
                        </div>
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                              <tr>
                                {['Projeto','Horas','Motivo','Valor/h','Total','Descrição','Data','Por'].map(col => (
                                  <th key={col} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(summary.contributed_hours_history?.length ?? 0) === 0 ? (
                                <tr>
                                  <td colSpan={8} className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                                    Nenhum aporte de horas registrado
                                  </td>
                                </tr>
                              ) : summary.contributed_hours_history!.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--brand-border)' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <td className="px-5 py-3" style={{ color: 'var(--brand-text)' }}>{item.project?.code} — {item.project?.name}</td>
                                  <td className="px-5 py-3 font-bold" style={{ color: '#00F5FF' }}>{Number(item.contributed_hours ?? item.difference ?? 0).toFixed(0)}h</td>
                                  <td className="px-5 py-3" style={{ color: 'var(--brand-muted)' }}>{MOTIVO_LABEL[item.motivo ?? 'aporte'] ?? 'Aporte'}</td>
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
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível.</p>
                )}
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              // Aba Projetos IGNORA o filtro de data — lista todos os projetos com
              // consumo acumulado (all-time). Card "Consumo do Mês" removido daqui.
              <div className="space-y-4">
                {summary && (
                  <div className="grid grid-cols-1 gap-4">
                    <KpiCard label="Consumo Acumulado" value={fmtH(summary.projects_consumed_hours ?? 0)} accent="primary" />
                  </div>
                )}
                <ProjectsTable items={projectsList} loading={loadingProjects} onViewTimesheets={setTsModalProject} />
              </div>
            )}

            {/* ── SUSTENTAÇÃO ── */}
            {activeTab === 'maintenance' && isSustentacaoContract && (
              <div className="space-y-4">
                {summary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiCard label="Consumo Acumulado" value={fmtH(summary.maintenance_consumed_hours ?? 0)} accent="primary" />
                    <KpiCard label="Consumo do Mês"    value={fmtH(summary.maintenance_month_consumed_hours ?? 0)} hint={monthConsumptionHint} />
                  </div>
                )}
                <ExportButton onClick={() => exportMaintenanceToXLSX('maintenance', mxRows)} disabled={mxRows.length === 0} />
                <InlineTimesheetsTable rows={mxRows} loading={mxLoading} variant="maintenance" onRowClick={setMxDetail} onReverseApproved={canReverseApproval} onReverseSuccess={reloadMx} />
                <InlineTicketSummaryTable rows={mxTicketSummary} loading={mxTicketLoading} />
              </div>
            )}

            {/* ── DESPESAS ── */}
            {activeTab === 'expenses' && (() => {
              const totalAmount = mxRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
              const toPay = mxRows
                .filter(r => !['rejected','rejeitado','pago','paid'].includes(String(r.status ?? '').toLowerCase()))
                .reduce((s, r) => s + (Number(r.amount) || 0), 0)
              const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard label="Quantidade"    value={String(mxRows.length)} />
                    <KpiCard label="Valor Total"   value={fmtBRL(totalAmount)} />
                    <KpiCard label="Valor a Pagar" value={fmtBRL(toPay)} accent="primary" />
                  </div>
                  <ExportButton onClick={() => exportMaintenanceToXLSX('expenses', mxRows)} disabled={mxRows.length === 0} />
                  <InlineExpensesTable rows={mxRows} loading={mxLoading} />
                </div>
              )
            })()}

            {/* ── INDICADORES ── */}
            {activeTab === 'indicators' && isSustentacaoContract && (
              <DashboardIndicators
                basePath="/dashboards/bank-hours-monthly/indicators"
                params={indicatorParams}
                disabled={!hasFilters}
              />
            )}
          </div>
        )}
      </div>
      {mxDetail && <TimesheetDetailModal ts={mxDetail} onClose={() => setMxDetail(null)} />}
      {/* ─ Modal reutilizável: Ver apontamentos do projeto (filtro + export) ─ */}
      {tsModalProject && (
        <ProjectTimesheetsModal
          projectId={tsModalProject.id}
          projectCode={tsModalProject.code}
          projectName={tsModalProject.name}
          customerId={selectedCustomer || null}
          onClose={() => setTsModalProject(null)}
        />
      )}
    </AppLayout>
  )
}
