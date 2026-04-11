'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { BarChart2, Clock, TrendingUp, TrendingDown, AlertCircle, DollarSign, ChevronDown } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer { id: number; name: string }
interface Project  { id: number; name: string; code: string }

interface SummaryData {
  contracted_hours: number
  accumulated_contracted_hours?: number
  contributed_hours: number
  consumed_hours: number
  projects_consumed_hours?: number
  maintenance_consumed_hours?: number
  month_consumed_hours: number
  hours_balance: number
  exceeded_hours: number
  amount_to_pay: number | null
  hourly_rate: number | null
  contributed_hours_history?: ContributionItem[]
}

interface ContributionItem {
  id: number
  project: { id: number; name: string; code: string }
  difference: number
  contributed_hours?: number
  hourly_rate?: number
  total_value?: number
  description?: string
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtH(h: number) { return h.toFixed(1) }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString('pt-BR') }

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function buildMonthOptions() {
  const now   = new Date()
  const opts: { label: string; value: string }[] = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({ label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, value: `${d.getMonth() + 1}/${d.getFullYear()}` })
  }
  return opts
}

const MONTH_OPTIONS = buildMonthOptions()

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label, value, unit = 'h', accent = 'default', icon: Icon,
  monthFilter, onMonthChange, selectedMonth,
}: {
  label: string
  value: string
  unit?: string
  accent?: 'default' | 'primary' | 'success' | 'danger' | 'warning'
  icon?: React.ElementType
  monthFilter?: boolean
  onMonthChange?: (v: string) => void
  selectedMonth?: string
}) {
  const color =
    accent === 'primary' ? '#00F5FF' :
    accent === 'success' ? '#10B981' :
    accent === 'danger'  ? '#EF4444' :
    accent === 'warning' ? '#F59E0B' :
    'var(--brand-text)'

  const bg =
    accent === 'primary' ? 'rgba(0,245,255,0.08)'  :
    accent === 'success' ? 'rgba(16,185,129,0.10)' :
    accent === 'danger'  ? 'rgba(239,68,68,0.10)'  :
    accent === 'warning' ? 'rgba(245,158,11,0.10)' :
    'rgba(255,255,255,0.04)'

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-150"
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon size={13} color={color} />
            </div>
          )}
          <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--brand-subtle)' }}>
            {label}
          </span>
        </div>
        {monthFilter && onMonthChange && (
          <div className="relative shrink-0">
            <select
              value={selectedMonth ?? ''}
              onChange={e => onMonthChange(e.target.value)}
              className="text-[10px] rounded-lg pr-5 pl-2 py-1 appearance-none outline-none cursor-pointer"
              style={{
                background: 'var(--brand-bg)',
                border: '1px solid var(--brand-border)',
                color: 'var(--brand-muted)',
              }}
            >
              <option value="">Mês/Ano</option>
              {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--brand-subtle)' }} />
          </div>
        )}
      </div>
      {/* Value */}
      <div className="flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color, lineHeight: 1 }}>{value}</span>
        {unit && <span className="text-base font-medium mb-0.5" style={{ color: 'var(--brand-muted)' }}>{unit}</span>}
      </div>
    </div>
  )
}

// ─── Breakdown Card ───────────────────────────────────────────────────────────

function ConsumedBreakdownCard({ total, projetos, sustentacao }: { total: number; projetos?: number; sustentacao?: number }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.08)' }}>
          <Clock size={13} color="#00F5FF" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consumo Acumulado</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: '#00F5FF', lineHeight: 1 }}>{fmtH(total)}</span>
        <span className="text-base font-medium mb-0.5" style={{ color: 'var(--brand-muted)' }}>h</span>
      </div>
      {(projetos !== undefined || sustentacao !== undefined) && (
        <div className="flex gap-3 pt-1 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Projetos</p>
            <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(projetos ?? 0)}h</p>
          </div>
          <div className="w-px" style={{ background: 'var(--brand-border)' }} />
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Sustentação</p>
            <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{fmtH(sustentacao ?? 0)}h</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 text-sm font-semibold rounded-xl transition-all"
      style={active
        ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
        : { color: 'var(--brand-muted)' }
      }
    >
      {label}
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 animate-pulse" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="h-3 w-32 rounded mb-4" style={{ background: 'var(--brand-border)' }} />
      <div className="h-10 w-24 rounded" style={{ background: 'var(--brand-border)' }} />
    </div>
  )
}

// ─── Select filter ────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, children, wide }: {
  label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`rounded-xl px-4 py-2.5 text-sm appearance-none outline-none cursor-pointer ${wide ? 'min-w-64' : 'min-w-36'}`}
        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
      >
        {children}
      </select>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BankHoursFixedPage() {
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('Administrator') || user?.permissions?.includes('admin.full_access') || false

  const now = new Date()
  const currentMonthVal = `${now.getMonth() + 1}/${now.getFullYear()}`

  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects,  setProjects]  = useState<Project[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<number | ''>('')
  const [selectedProject,  setSelectedProject]  = useState<number | ''>('')

  const [summary,      setSummary]      = useState<SummaryData | null>(null)
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([])
  const [maintList,    setMaintList]    = useState<ProjectItem[]>([])

  const [loadingSummary,  setLoadingSummary]  = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingMaint,    setLoadingMaint]    = useState(false)

  // month filters — one per tab
  const [totalMonth,    setTotalMonth]    = useState(currentMonthVal)
  const [projMonth,     setProjMonth]     = useState(currentMonthVal)
  const [maintMonth,    setMaintMonth]    = useState(currentMonthVal)

  const [activeTab, setActiveTab] = useState<'total' | 'projects' | 'maintenance'>('total')

  // month/year from "M/YYYY" string
  const parseMonth = (v: string) => {
    if (!v) return {}
    const [m, y] = v.split('/')
    return { month: m, year: y }
  }

  // Customers
  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=1000').then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  // Projects list
  useEffect(() => {
    const params = new URLSearchParams({ pageSize: '1000', parent_projects_only: 'true' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    api.get<any>(`/projects?${params}`).then(r => setProjects(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [selectedCustomer])

  // Build base params
  const baseParams = useCallback(() => {
    const p = new URLSearchParams()
    if (selectedCustomer) p.set('customer_id', String(selectedCustomer))
    if (selectedProject)  p.set('project_id',  String(selectedProject))
    return p
  }, [selectedCustomer, selectedProject])

  // Summary (Total Geral)
  const fetchSummary = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const p = baseParams()
    const { month, year } = parseMonth(totalMonth)
    if (month) p.set('month', month)
    if (year)  p.set('year',  year)
    setLoadingSummary(true)
    api.get<any>(`/dashboards/bank-hours-fixed?${p}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [baseParams, totalMonth, isAdmin])

  // Projects tab data
  const fetchProjects = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const p = baseParams()
    const { month, year } = parseMonth(projMonth)
    if (month) p.set('month', month)
    if (year)  p.set('year',  year)
    p.set('service_type_name', 'Projeto')
    setLoadingProjects(true)
    api.get<any>(`/dashboards/bank-hours-fixed/projects?${p}`)
      .then(r => setProjectsList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectsList([]))
      .finally(() => setLoadingProjects(false))
  }, [baseParams, projMonth, isAdmin])

  // Maintenance tab data
  const fetchMaintenance = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const p = baseParams()
    const { month, year } = parseMonth(maintMonth)
    if (month) p.set('month', month)
    if (year)  p.set('year',  year)
    p.set('service_type_name', 'Sustentação')
    setLoadingMaint(true)
    api.get<any>(`/dashboards/bank-hours-fixed/projects?${p}`)
      .then(r => setMaintList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setMaintList([]))
      .finally(() => setLoadingMaint(false))
  }, [baseParams, maintMonth, isAdmin])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'projects')    fetchProjects()    }, [fetchProjects, activeTab])
  useEffect(() => { if (activeTab === 'maintenance') fetchMaintenance() }, [fetchMaintenance, activeTab])

  const hasFilters = !isAdmin || (!!selectedCustomer && !!selectedProject)

  // Projects table (shared between Projetos and Sustentação)
  const ProjectsTable = ({ items, loading }: { items: ProjectItem[]; loading: boolean }) => (
    <div className="rounded-2xl overflow-hidden mt-4" style={{ border: '1px solid var(--brand-border)' }}>
      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--brand-border)' }} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
            <thead style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['Código','Projeto','Status','Tipo','Horas Vendidas','Saldo','Início'].map(col => (
                  <th key={col} className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider ${col === 'Saldo' || col === 'Horas Vendidas' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado.</td></tr>
              ) : items.map((p, idx) => {
                const balance = p.hours_balance ?? 0
                const contributions = p.total_contributions_hours || p.hour_contribution || 0
                return (
                  <tr
                    key={p.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--brand-border)' }}
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
                    <td className="px-5 py-3.5 text-right font-bold" style={{ color: balance >= 0 ? '#10B981' : '#EF4444' }}>
                      {fmtH(balance)}h
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <AppLayout title="Dashboard — Banco de Horas Fixo">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.08)' }}>
            <BarChart2 size={16} color="#00F5FF" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>Banco de Horas Fixo</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>Consumo, saldo e histórico de aporte por projeto</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-5 rounded-2xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {isAdmin && (
            <FilterSelect label="Cliente" value={selectedCustomer} onChange={v => { setSelectedCustomer(v === '' ? '' : Number(v)); setSelectedProject('') }} wide>
              <option value="">Todos os clientes</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
          )}
          <FilterSelect label="Projeto" value={selectedProject} onChange={v => setSelectedProject(v === '' ? '' : Number(v))} wide>
            <option value="">Selecione um projeto</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </FilterSelect>
        </div>

        {/* Empty */}
        {!hasFilters && (
          <div className="rounded-2xl p-16 text-center" style={{ border: '1px dashed var(--brand-border)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(0,245,255,0.06)' }}>
              <BarChart2 size={22} color="#00F5FF" />
            </div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--brand-text)' }}>Nenhum projeto selecionado</p>
            <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
              {isAdmin ? 'Selecione um cliente e um projeto para visualizar os dados.' : 'Selecione um projeto para visualizar os dados.'}
            </p>
          </div>
        )}

        {hasFilters && (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <Tab label="Total Geral"  active={activeTab === 'total'}       onClick={() => setActiveTab('total')} />
              <Tab label="Projetos"     active={activeTab === 'projects'}    onClick={() => setActiveTab('projects')} />
              <Tab label="Sustentação"  active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} />
            </div>

            {/* ── TOTAL GERAL ── */}
            {activeTab === 'total' && (
              <div className="space-y-4">
                {loadingSummary ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : summary ? (
                  <>
                    {/* Row 1: 5 cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <MetricCard label="Horas Contratadas" value={fmtH(summary.contracted_hours)} icon={BarChart2} />
                      <MetricCard label="Aporte de Horas"   value={fmtH(summary.contributed_hours)} icon={TrendingUp} />
                      <ConsumedBreakdownCard
                        total={summary.consumed_hours}
                        projetos={summary.projects_consumed_hours}
                        sustentacao={summary.maintenance_consumed_hours}
                      />
                      <MetricCard
                        label="Consumo do Mês"
                        value={fmtH(summary.month_consumed_hours)}
                        icon={Clock}
                        accent="default"
                        monthFilter
                        selectedMonth={totalMonth}
                        onMonthChange={v => setTotalMonth(v)}
                      />
                      <MetricCard
                        label="Saldo de Horas"
                        value={fmtH(summary.hours_balance)}
                        icon={summary.hours_balance >= 0 ? TrendingUp : TrendingDown}
                        accent={summary.hours_balance >= 0 ? 'success' : 'danger'}
                      />
                    </div>

                    {/* Row 2: 3 highlight cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <MetricCard
                        label="Horas Excedentes"
                        value={fmtH(summary.exceeded_hours)}
                        icon={AlertCircle}
                        accent={summary.exceeded_hours > 0 ? 'danger' : 'default'}
                      />
                      <MetricCard label="Valor Hora"   value={fmtBRL(summary.hourly_rate)}   unit="" icon={DollarSign} />
                      <MetricCard
                        label="Valor a Pagar"
                        value={fmtBRL(summary.amount_to_pay)}
                        unit=""
                        icon={DollarSign}
                        accent={(summary.amount_to_pay ?? 0) > 0 ? 'danger' : 'default'}
                      />
                    </div>

                    {/* Histórico de Aporte */}
                    {(summary.contributed_hours_history?.length ?? 0) > 0 && (
                      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                          <h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Histórico de Aporte de Horas</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
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
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível.</p>
                )}
              </div>
            )}

            {/* ── PROJETOS ── */}
            {activeTab === 'projects' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard
                    label="Consumo Acumulado"
                    value={fmtH(summary?.projects_consumed_hours ?? 0)}
                    icon={Clock}
                    accent="primary"
                  />
                  <MetricCard
                    label="Consumo do Mês"
                    value={fmtH(summary?.month_consumed_hours ?? 0)}
                    icon={Clock}
                    monthFilter
                    selectedMonth={projMonth}
                    onMonthChange={v => setProjMonth(v)}
                  />
                </div>
                <ProjectsTable items={projectsList} loading={loadingProjects} />
              </div>
            )}

            {/* ── SUSTENTAÇÃO ── */}
            {activeTab === 'maintenance' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard
                    label="Consumo Acumulado"
                    value={fmtH(summary?.maintenance_consumed_hours ?? 0)}
                    icon={Clock}
                    accent="primary"
                  />
                  <MetricCard
                    label="Consumo do Mês"
                    value={fmtH(summary?.month_consumed_hours ?? 0)}
                    icon={Clock}
                    monthFilter
                    selectedMonth={maintMonth}
                    onMonthChange={v => setMaintMonth(v)}
                  />
                </div>
                <ProjectsTable items={maintList} loading={loadingMaint} />
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
