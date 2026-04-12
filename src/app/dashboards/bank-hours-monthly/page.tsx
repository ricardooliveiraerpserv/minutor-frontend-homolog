'use client'

import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/app-layout'
import React, { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string }
interface Executive { id: number; name: string }

interface SummaryData {
  contracted_hours: number
  accumulated_contracted_hours?: number
  contributed_hours?: number
  consumed_hours: number
  projects_consumed_hours?: number
  maintenance_consumed_hours?: number
  month_consumed_hours: number
  hours_balance: number
  exceeded_hours?: number
  amount_to_pay?: number | null
  hourly_rate?: number | null
  contributed_hours_history?: ContributionItem[]
}

interface ContributionItem {
  id: number
  project: { id: number; name: string; code: string }
  difference: number
  contributed_hours?: number
  hourly_rate?: number
  total_value?: number
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

function FilterSelect({ label, value, onChange, children, wide }: {
  label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`rounded-xl px-4 py-2.5 text-sm appearance-none outline-none cursor-pointer ${wide ? 'min-w-52' : 'min-w-28'}`}
        style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
      >
        {children}
      </select>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' | 'primary' }) {
  const color = accent === 'success' ? '#10B981' : accent === 'danger' ? '#EF4444' : accent === 'primary' ? '#00F5FF' : 'var(--brand-text)'
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
      <span className="text-4xl font-extrabold tracking-tight" style={{ color, lineHeight: 1 }}>{value}</span>
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
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--brand-border)' }} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
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
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function BankHoursMonthlyPage() {
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('Administrator') ||
    user?.permissions?.includes('admin.full_access') || false

  const now = new Date()
  const [customers,   setCustomers]   = useState<Customer[]>([])
  const [executives,  setExecutives]  = useState<Executive[]>([])
  const [projects,    setProjects]    = useState<Project[]>([])
  const [selectedCustomer,  setSelectedCustomer]  = useState<number | ''>('')
  const [selectedExecutive, setSelectedExecutive] = useState<number | ''>('')
  const [selectedProject,   setSelectedProject]   = useState<number | ''>('')
  const [startMonth, setStartMonth] = useState<number>(now.getMonth() + 1)
  const [startYear,  setStartYear]  = useState<number>(now.getFullYear())
  const [month,      setMonth]      = useState<number>(now.getMonth() + 1)
  const [year,       setYear]       = useState<number>(now.getFullYear())

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
    api.get<any>('/customers?pageSize=1000&has_contract_type_name=Banco+de+Horas+Mensal').then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=1000').then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: '1000', parent_projects_only: 'true', contract_type_name: 'Banco de Horas Mensal' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    api.get<any>(`/projects?${params}`).then(r => {
      setProjects(Array.isArray(r?.items) ? r.items : [])
    }).catch(() => {})
  }, [selectedCustomer])

  const fetchSummary = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = new URLSearchParams({ month: String(month), year: String(year) })
    if (selectedCustomer)  params.set('customer_id',  String(selectedCustomer))
    if (selectedExecutive) params.set('executive_id', String(selectedExecutive))
    if (selectedProject)   params.set('project_id',   String(selectedProject))
    setLoadingSummary(true)
    api.get<any>(`/dashboards/bank-hours-monthly?${params}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [selectedCustomer, selectedExecutive, selectedProject, month, year, isAdmin])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ month: String(month), year: String(year) })
    if (startMonth !== month || startYear !== year) {
      p.set('start_month', String(startMonth))
      p.set('start_year',  String(startYear))
    }
    if (selectedCustomer)  p.set('customer_id',  String(selectedCustomer))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    if (selectedProject)   p.set('project_id',   String(selectedProject))
    return p
  }, [selectedCustomer, selectedExecutive, selectedProject, startMonth, startYear, month, year])

  const fetchProjectsList = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = buildParams()
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

  const months = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ]
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

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
            <FilterSelect label="Executivo" value={selectedExecutive} onChange={v => { setSelectedExecutive(v === '' ? '' : Number(v)); setSelectedCustomer(''); setSelectedProject('') }} wide>
              <option value="">Todos os executivos</option>
              {executives.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </FilterSelect>
          )}
          {isAdmin && (
            <FilterSelect label="Cliente" value={selectedCustomer} onChange={v => { setSelectedCustomer(v === '' ? '' : Number(v)); setSelectedExecutive(''); setSelectedProject('') }} wide>
              <option value="">Todos os clientes</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
          )}
          <FilterSelect label="Projeto" value={selectedProject} onChange={v => setSelectedProject(v === '' ? '' : Number(v))} wide>
            <option value="">Selecione um projeto</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </FilterSelect>
          {/* Período range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Período</label>
            <div className="flex items-center gap-2">
              <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
                className="rounded-xl px-3 py-2.5 text-sm appearance-none outline-none cursor-pointer"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select value={startYear} onChange={e => setStartYear(Number(e.target.value))}
                className="rounded-xl px-3 py-2.5 text-sm appearance-none outline-none cursor-pointer"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-xs px-1" style={{ color: 'var(--brand-subtle)' }}>até</span>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="rounded-xl px-3 py-2.5 text-sm appearance-none outline-none cursor-pointer"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="rounded-xl px-3 py-2.5 text-sm appearance-none outline-none cursor-pointer"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
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
              <Tab label="Sustentação"  active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} />
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
                    {/* Row 1 — 5 cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <StatCard label="Horas Contratadas" value={fmtH(summary.contracted_hours)} />
                      <StatCard label="Aporte de Horas"   value={fmtH(summary.contributed_hours ?? 0)} />
                      {/* Consumo Acumulado with breakdown */}
                      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consumo Acumulado</span>
                        <div className="flex items-end gap-1.5">
                          <span className="text-4xl font-extrabold tracking-tight" style={{ color: '#00F5FF', lineHeight: 1 }}>{fmtH(summary.consumed_hours)}</span>
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
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível.</p>
                )}
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              <ProjectsTable items={projectsList} loading={loadingProjects} />
            )}

            {/* ── SUSTENTAÇÃO ── */}
            {activeTab === 'maintenance' && (
              <ProjectsTable items={maintList} loading={loadingMaint} />
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
