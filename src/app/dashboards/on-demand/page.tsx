'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Zap, Clock, TrendingUp, TrendingDown, DollarSign, AlertCircle } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string }
interface Executive { id: number; name: string }

interface SummaryData {
  consumed_hours: number
  month_consumed_hours: number
  hours_balance?: number
  exceeded_hours?: number
  amount_to_pay?: number | null
  hourly_rate?: number | null
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

function fmtH(h: number) {
  return h.toFixed(1)
}
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit = 'h',
  trend,
  icon: Icon,
  accent = 'default',
}: {
  label: string
  value: string
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  accent?: 'default' | 'success' | 'danger' | 'primary'
}) {
  const accentColor =
    accent === 'success' ? 'var(--brand-success)' :
    accent === 'danger'  ? 'var(--brand-danger)'  :
    accent === 'primary' ? 'var(--brand-primary)'  :
    'var(--brand-text)'

  const iconBg =
    accent === 'success' ? 'rgba(16,185,129,0.12)'  :
    accent === 'danger'  ? 'rgba(239,68,68,0.12)'   :
    accent === 'primary' ? 'rgba(0,245,255,0.10)'   :
    'rgba(255,255,255,0.06)'

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 hover:scale-[1.01]"
      style={{
        background: 'var(--brand-surface)',
        border: '1px solid var(--brand-border)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--brand-muted)' }}>{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon size={16} color={accentColor} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold tracking-tight" style={{ color: accentColor, lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span className="text-lg font-medium mb-0.5" style={{ color: 'var(--brand-muted)' }}>{unit}</span>
        )}
      </div>
      {TrendIcon && (
        <div className="flex items-center gap-1">
          <TrendIcon size={12} color={trend === 'up' ? 'var(--brand-success)' : 'var(--brand-danger)'} />
          <span className="text-xs" style={{ color: trend === 'up' ? 'var(--brand-success)' : 'var(--brand-danger)' }}>
            {trend === 'up' ? 'Positivo' : 'Atenção'}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Select ───────────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  children,
  wide,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--brand-muted)' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none transition-colors appearance-none cursor-pointer ${wide ? 'min-w-64' : 'min-w-36'}`}
        style={{
          background: 'var(--brand-surface)',
          border: '1px solid var(--brand-border)',
          color: 'var(--brand-text)',
        }}
      >
        {children}
      </select>
    </div>
  )
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150"
      style={
        active
          ? { background: 'var(--brand-primary)', color: '#0A0A0B', fontWeight: 700 }
          : { color: 'var(--brand-muted)', background: 'transparent' }
      }
    >
      {label}
    </button>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-6 animate-pulse" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--brand-border)' }} />
      <div className="h-10 w-20 rounded" style={{ background: 'var(--brand-border)' }} />
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ admin }: { admin: boolean }) {
  return (
    <div
      className="rounded-2xl p-16 flex flex-col items-center gap-4 text-center"
      style={{ background: 'var(--brand-surface)', border: '1px dashed var(--brand-border)' }}
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.08)' }}>
        <Zap size={22} color="var(--brand-primary)" />
      </div>
      <div>
        <p className="font-semibold mb-1" style={{ color: 'var(--brand-text)' }}>Nenhum projeto selecionado</p>
        <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
          {admin
            ? 'Selecione um cliente e um projeto para carregar os dados do dashboard.'
            : 'Selecione um projeto para visualizar os dados de consumo.'}
        </p>
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

  const [summary,      setSummary]      = useState<SummaryData | null>(null)
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([])
  const [loadingSummary,  setLoadingSummary]  = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [activeTab, setActiveTab] = useState<'total' | 'projects'>('total')

  useEffect(() => {
    if (!isAdmin) return
    api.get<any>('/customers?pageSize=1000&has_contract_type_name=On+Demand')
      .then(r => setCustomers(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {})
    api.get<any>('/executives?pageSize=1000')
      .then(r => setExecutives(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: '1000', parent_projects_only: 'true', contract_type_name: 'On Demand' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    api.get<any>(`/projects?${params}`)
      .then(r => setProjects(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {})
  }, [selectedCustomer])

  const fetchSummary = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = new URLSearchParams({ month: String(month), year: String(year) })
    if (selectedCustomer)  params.set('customer_id',  String(selectedCustomer))
    if (selectedExecutive) params.set('executive_id', String(selectedExecutive))
    if (selectedProject)   params.set('project_id',   String(selectedProject))
    setLoadingSummary(true)
    api.get<any>(`/dashboards/on-demand?${params}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [selectedCustomer, selectedExecutive, selectedProject, month, year, isAdmin])

  const fetchProjectsList = useCallback(() => {
    if (!selectedProject && isAdmin) return
    const params = new URLSearchParams({ month: String(month), year: String(year) })
    if (selectedCustomer)  params.set('customer_id',  String(selectedCustomer))
    if (selectedExecutive) params.set('executive_id', String(selectedExecutive))
    if (selectedProject)   params.set('project_id',   String(selectedProject))
    setLoadingProjects(true)
    api.get<any>(`/dashboards/on-demand/projects?${params}`)
      .then(r => setProjectsList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectsList([]))
      .finally(() => setLoadingProjects(false))
  }, [selectedCustomer, selectedExecutive, selectedProject, month, year, isAdmin])

  useEffect(() => { fetchSummary(); fetchProjectsList() }, [fetchSummary, fetchProjectsList])

  const hasFilters = !isAdmin || (!!selectedProject)

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const YEARS  = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <AppLayout title="Dashboard — On Demand">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.10)' }}>
              <Zap size={14} color="var(--brand-primary)" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--brand-text)' }}>On Demand</h1>
          </div>
          <p className="text-sm ml-9" style={{ color: 'var(--brand-muted)' }}>
            Consumo de horas por demanda — visão por projeto e período
          </p>
        </div>

        {/* ── Filters ── */}
        <div
          className="flex flex-wrap items-end gap-4 p-5 rounded-2xl"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          {isAdmin && (
            <FilterSelect
              label="Executivo"
              value={selectedExecutive}
              onChange={v => { setSelectedExecutive(v === '' ? '' : Number(v)); setSelectedCustomer(''); setSelectedProject('') }}
              wide
            >
              <option value="">Todos os executivos</option>
              {executives.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </FilterSelect>
          )}
          {isAdmin && (
            <FilterSelect
              label="Cliente"
              value={selectedCustomer}
              onChange={v => { setSelectedCustomer(v === '' ? '' : Number(v)); setSelectedExecutive(''); setSelectedProject('') }}
              wide
            >
              <option value="">Todos os clientes</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
          )}
          <FilterSelect
            label="Projeto"
            value={selectedProject}
            onChange={v => setSelectedProject(v === '' ? '' : Number(v))}
            wide
          >
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

        {/* ── No filter selected ── */}
        {!hasFilters && <EmptyState admin={isAdmin} />}

        {/* ── Content ── */}
        {hasFilters && (
          <div className="space-y-6">
            {/* Tab bar */}
            <div
              className="flex gap-1 p-1 rounded-2xl w-fit"
              style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
            >
              <Tab label="Visão Geral"   active={activeTab === 'total'}    onClick={() => setActiveTab('total')} />
              <Tab label="Projetos"      active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
            </div>

            {/* ── Total tab ── */}
            {activeTab === 'total' && (
              <div className="space-y-6">
                {loadingSummary ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : summary ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <MetricCard
                        label="Consumo Acumulado"
                        value={fmtH(summary.consumed_hours)}
                        icon={Clock}
                        accent="primary"
                      />
                      <MetricCard
                        label="Consumo do Mês"
                        value={fmtH(summary.month_consumed_hours)}
                        icon={TrendingUp}
                        accent="default"
                      />
                      {summary.hours_balance !== undefined && (
                        <MetricCard
                          label="Saldo"
                          value={fmtH(summary.hours_balance)}
                          icon={summary.hours_balance >= 0 ? TrendingUp : TrendingDown}
                          accent={summary.hours_balance >= 0 ? 'success' : 'danger'}
                          trend={summary.hours_balance >= 0 ? 'up' : 'down'}
                        />
                      )}
                      {(summary.exceeded_hours ?? 0) > 0 && (
                        <MetricCard
                          label="Horas Excedentes"
                          value={fmtH(summary.exceeded_hours!)}
                          icon={AlertCircle}
                          accent="danger"
                          trend="down"
                        />
                      )}
                      {summary.hourly_rate !== undefined && (
                        <MetricCard
                          label="Valor Hora"
                          value={fmtBRL(summary.hourly_rate)}
                          unit=""
                          icon={DollarSign}
                          accent="default"
                        />
                      )}
                      {summary.amount_to_pay !== undefined && (
                        <MetricCard
                          label="Valor a Pagar"
                          value={fmtBRL(summary.amount_to_pay)}
                          unit=""
                          icon={DollarSign}
                          accent={(summary.amount_to_pay ?? 0) > 0 ? 'danger' : 'success'}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div
                    className="rounded-2xl p-10 text-center"
                    style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
                  >
                    <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível para o período selecionado.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Projects tab ── */}
            {activeTab === 'projects' && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                {loadingProjects ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--brand-border)' }} />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                          {['Código','Projeto','Status','Tipo','Horas Vendidas','Saldo','Início'].map(col => (
                            <th
                              key={col}
                              className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider"
                              style={{ color: 'var(--brand-muted)' }}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {projectsList.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-16 text-center text-sm" style={{ color: 'var(--brand-muted)' }}>
                              Nenhum projeto encontrado para este filtro.
                            </td>
                          </tr>
                        ) : projectsList.map((p, idx) => {
                          const balance = p.hours_balance ?? 0
                          const contributions = p.total_contributions_hours || p.hour_contribution || 0
                          const even = idx % 2 === 0
                          return (
                            <tr
                              key={p.id}
                              className="transition-colors"
                              style={{
                                borderBottom: '1px solid var(--brand-border)',
                                background: even ? 'transparent' : 'rgba(255,255,255,0.015)',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.04)')}
                              onMouseLeave={e => (e.currentTarget.style.background = even ? 'transparent' : 'rgba(255,255,255,0.015)')}
                            >
                              <td className="px-5 py-4">
                                <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
                                  {p.code}
                                </span>
                              </td>
                              <td className="px-5 py-4 font-medium text-sm" style={{ color: 'var(--brand-text)' }}>
                                {p.name}
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
                                  {p.status_display}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-sm" style={{ color: 'var(--brand-muted)' }}>
                                {p.contract_type_display}
                              </td>
                              <td className="px-5 py-4 text-sm font-medium text-right" style={{ color: 'var(--brand-text)' }}>
                                {p.sold_hours !== null
                                  ? contributions > 0
                                    ? <><span>{p.sold_hours}</span><span className="ml-1 text-xs" style={{ color: 'var(--brand-success)' }}>(+{contributions})</span></>
                                    : p.sold_hours
                                  : '—'}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span
                                  className="text-sm font-bold"
                                  style={{ color: balance >= 0 ? 'var(--brand-success)' : 'var(--brand-danger)' }}
                                >
                                  {fmtH(balance)}h
                                </span>
                              </td>
                              <td className="px-5 py-4 text-sm" style={{ color: 'var(--brand-muted)' }}>
                                {p.start_date ? fmtDate(p.start_date) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
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
