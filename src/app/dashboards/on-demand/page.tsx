'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Zap, Clock, DollarSign } from 'lucide-react'

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
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Components ──────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, children, wide }: {
  label: string; value: string | number; onChange: (v: string) => void
  children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`rounded-xl px-4 py-2.5 text-sm appearance-none outline-none cursor-pointer ${wide ? 'min-w-64' : 'min-w-32'}`}
        style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
      >
        {children}
      </select>
    </div>
  )
}

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

function IndicatorCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function IndicatorRow({ label, value, max, current }: { label: string; value: string; max: number; current: number }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs truncate" style={{ color: 'var(--brand-muted)' }}>{label}</span>
        <span className="text-xs font-bold shrink-0" style={{ color: 'var(--brand-text)' }}>{value}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--brand-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--brand-primary)' }} />
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OnDemandPage() {
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
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())

  const [summary,         setSummary]         = useState<SummaryData | null>(null)
  const [reqHours,        setReqHours]        = useState<{ requester: string; total_hours: number }[]>([])
  const [svcHours,        setSvcHours]        = useState<{ service: string; total_hours: number }[]>([])
  const [statusData,      setStatusData]      = useState<{ status: string; ticket_count: number }[]>([])
  const [loadingSummary,    setLoadingSummary]    = useState(false)
  const [loadingIndicators, setLoadingIndicators] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'indicators'>('overview')

  // Load customers & executives (admin only)
  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=1000&has_contract_type_name=On+Demand')
      .then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=1000')
      .then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [isAdmin])

  // Load projects filtered by customer + contract type
  useEffect(() => {
    const params = new URLSearchParams({ pageSize: '1000', parent_projects_only: 'true', contract_type_name: 'On Demand' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    api.get<any>(`/projects?${params}`)
      .then(r => setProjects(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [selectedCustomer])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ month: String(month), year: String(year) })
    if (selectedCustomer)  p.set('customer_id',  String(selectedCustomer))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    if (selectedProject)   p.set('project_id',   String(selectedProject))
    return p
  }, [selectedCustomer, selectedExecutive, selectedProject, month, year])

  const fetchSummary = useCallback(() => {
    if (!selectedProject && isAdmin) return
    setLoadingSummary(true)
    api.get<any>(`/dashboards/on-demand?${buildParams()}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [buildParams, isAdmin])

  const fetchIndicators = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = buildParams()
    setLoadingIndicators(true)
    Promise.all([
      api.get<any>(`/dashboards/on-demand/indicators/hours-by-requester?${params}`),
      api.get<any>(`/dashboards/on-demand/indicators/hours-by-service?${params}`),
      api.get<any>(`/dashboards/on-demand/indicators/tickets-by-status?${params}`),
    ]).then(([req, svc, status]) => {
      setReqHours(Array.isArray(req?.data) ? req.data : [])
      setSvcHours(Array.isArray(svc?.data) ? svc.data : [])
      setStatusData(Array.isArray(status?.data) ? status.data : [])
    }).catch(() => {}).finally(() => setLoadingIndicators(false))
  }, [buildParams, isAdmin])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'indicators') fetchIndicators() }, [fetchIndicators, activeTab])

  const hasFilters = !isAdmin || !!selectedProject

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const YEARS  = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

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
          <FilterSelect label="Mês" value={month} onChange={v => setMonth(Number(v))}>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </FilterSelect>
          <FilterSelect label="Ano" value={year} onChange={v => setYear(Number(v))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </FilterSelect>
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
              <div className="space-y-6">
                {loadingIndicators ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-2xl p-5 animate-pulse h-48" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <IndicatorCard title="Horas por Solicitante">
                      {reqHours.length === 0
                        ? <p className="text-xs py-2" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado disponível.</p>
                        : reqHours.slice(0, 10).map(r => (
                          <IndicatorRow key={r.requester} label={r.requester} value={`${r.total_hours.toFixed(1)}h`} max={reqHours[0]?.total_hours} current={r.total_hours} />
                        ))}
                    </IndicatorCard>
                    <IndicatorCard title="Horas por Serviço">
                      {svcHours.length === 0
                        ? <p className="text-xs py-2" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado disponível.</p>
                        : svcHours.slice(0, 10).map(r => (
                          <IndicatorRow key={r.service} label={r.service} value={`${r.total_hours.toFixed(1)}h`} max={svcHours[0]?.total_hours} current={r.total_hours} />
                        ))}
                    </IndicatorCard>
                    <IndicatorCard title="Tickets por Status">
                      {statusData.length === 0
                        ? <p className="text-xs py-2" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado disponível.</p>
                        : statusData.slice(0, 10).map(r => (
                          <IndicatorRow key={r.status} label={r.status} value={String(r.ticket_count)} max={statusData[0]?.ticket_count} current={r.ticket_count} />
                        ))}
                    </IndicatorCard>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
