'use client'

import { formatBRL } from '@/lib/format'
import { previewText } from '@/lib/sanitize'
import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { Zap, Clock, DollarSign, Download, Undo2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/ui/kpi-card'
import {
  DataTable, DataTableHead, DataTableHeadRow, DataTableHeadCell,
  DataTableBody, DataTableRow, DataTableCell, DataTableEmpty,
  StatusBadge, getStatusVariant,
} from '@/components/ui/ds'
import * as XLSX from 'xlsx'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import ProjectTimesheetsModal from '@/components/dashboard/ProjectTimesheetsModal'
import {
  useMaintenanceInline, exportMaintenanceToXLSX,
  ExportButton as MxExportButton,
  InlineTimesheetsTable as MxTimesheets,
  InlineTicketSummaryTable as MxTicketSummary,
  InlineExpensesTable as MxExpenses,
  TimesheetDetailModal,
} from '@/components/dashboard/MaintenanceInline'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string; status?: string; status_display?: string; service_type?: { code?: string | null; name?: string | null } | null }
interface Executive { id: number; name: string }

interface SummaryData {
  consumed_hours: number
  month_consumed_hours: number
  month_maintenance_hours?: number
  month_projects_hours?: number
  amount_to_pay?: number | null
  hourly_rate?: number | null
}

// Projeto-filho do contrato On Demand selecionado (endpoint /dashboards/on-demand/projects).
interface ProjectItem {
  id: number
  name: string
  code: string
  status_display: string
  contract_type_display: string
  sold_hours: number | null
  hour_contribution: number | null
  total_contributions_hours: number
  consumed_hours: number
  hours_balance: number
  start_date: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 2 casas p/ bater com o "Valor a pagar" (horas decimais × valor/hora). Ex.: 49,42h × 148 = 7.314,16.
function fmtH(h: number | null | undefined) { return (h ?? 0).toFixed(2) }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return formatBRL(v ?? 0)
}
function fmtDate(s: string) {
  // Mantém o dia/mês/ano literal do banco (YYYY-MM-DD) sem aplicar shift de fuso.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString('pt-BR')
}

// ─── Components ──────────────────────────────────────────────────────────────


// Card "Consumo do Mês" com detalhamento Sustentação / Projeto (mesmo formato do
// card de breakdown do BH Fixo, mas com o split por tipo de serviço).
function ConsumoMesCard({ total, sustentacao, projeto, hint }: { total: number; sustentacao: number; projeto: number; hint?: string }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 min-w-0 overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.08)' }}>
          <Clock size={13} color="#00F5FF" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--brand-subtle)' }}>Consumo do Mês</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: '#00F5FF', lineHeight: 1 }}>{fmtH(total)}</span>
        <span className="text-base font-medium mb-0.5" style={{ color: 'var(--brand-muted)' }}>h</span>
      </div>
      <div className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--brand-subtle)' }}>Sustentação</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>{fmtH(sustentacao)}h</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--brand-subtle)' }}>Projeto</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>{fmtH(projeto)}h</span>
        </div>
      </div>
      {hint && <span className="text-[11px]" style={{ color: 'var(--brand-subtle)' }}>{hint}</span>}
    </div>
  )
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all"
      style={active ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' } : { color: 'var(--brand-muted)' }}
    >
      {label}
    </button>
  )
}

// MetricCard local removido — agora usamos KpiCard de '@/components/ui/kpi-card'.

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
  const router = useRouter()
  const isAdmin   = user?.type === 'admin'
  const isCliente = user?.type === 'cliente'
  // Digitação (filtro + coluna + destaque) liberado p/ admin/interno; no perfil de
  // CLIENTE fica exclusivo da Vedamotors (customer_id 176). Demais clientes: só competência.
  const showDigitacao = !isCliente || user?.customer_id === 176
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
  // Sustentação: range de DIGITAÇÃO opcional (created_at) — filtra SÓ a lista de apontamentos.
  const [digFrom, setDigFrom] = useState('')
  const [digTo,   setDigTo]   = useState('')

  const [summary,       setSummary]       = useState<SummaryData | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'maintenance' | 'expenses' | 'indicators'>('overview')
  // Modal reutilizável "Ver apontamentos" da aba Projetos.
  const [tsModalProject, setTsModalProject] = useState<ProjectItem | null>(null)

  // Aba Projetos — lista os projetos-filho do contrato On Demand selecionado.
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  // Competência (mês do serviço) = o próprio filtro de DATA (Mês/Ano → mês; Período → range).
  // Trava a data do serviço dos apontamentos da Sustentação (além de dirigir o consumo).
  const competenciaFrom = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-01` : dateFrom
  const competenciaTo = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-${String(new Date(refYear, refMonth, 0).getDate()).padStart(2, '0')}` : dateTo

  // Componentes embarcados (Sustentação + Despesas) — reusam endpoints do BH Fixo
  const mxKind: 'maintenance' | 'expenses' = activeTab === 'expenses' ? 'expenses' : 'maintenance'
  const { rows: mxRows, loading: mxLoading, ticketSummary: mxTicketSummary, ticketLoading: mxTicketLoading, reload: reloadMx } = useMaintenanceInline({
    enabled: activeTab === 'maintenance' || activeTab === 'expenses',
    kind: mxKind,
    customerId: (selectedCustomer as number) || user?.customer_id,
    projectId: (selectedProject as number) || null,
    competenciaFrom,
    competenciaTo,
    digFrom: showDigitacao ? digFrom : '',
    digTo:   showDigitacao ? digTo   : '',
  })
  const [mxDetail, setMxDetail] = useState<any | null>(null)
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
    const params = new URLSearchParams({ pageSize: '1000', contract_type_code: 'on_demand', parent_projects_only: 'true' })
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
    // Sem projeto selecionado NÃO traz nada (nem pro cliente) — antes agregava todos os
    // projetos do cliente, mostrando consumo + apontamentos que já migraram pra outro projeto.
    if (!selectedProject) { setSummary(null); return }
    setLoadingSummary(true)
    api.get<any>(`/dashboards/on-demand?${buildParams()}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [buildParams, isAdmin, refMonth, refYear])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  // Aba Projetos — busca os projetos-filho do contrato selecionado.
  // Ignora o filtro de data (lista all-time, como no BH Fixo): só usa customer/executive/project.
  const fetchOnDemandProjects = useCallback(() => {
    if (!selectedProject) { setProjectsList([]); return }
    const p = new URLSearchParams()
    if (selectedCustomer)                    p.set('customer_id',  String(selectedCustomer))
    else if (isCliente && user?.customer_id) p.set('customer_id',  String(user.customer_id))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    p.set('project_id', String(selectedProject))
    setLoadingProjects(true)
    api.get<any>(`/dashboards/on-demand/projects?${p}`)
      .then(r => setProjectsList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectsList([]))
      .finally(() => setLoadingProjects(false))
  }, [selectedCustomer, selectedExecutive, selectedProject, isCliente, user?.customer_id])

  useEffect(() => { if (activeTab === 'projects') fetchOnDemandProjects() }, [fetchOnDemandProjects, activeTab])

  // Atualiza params para o componente de indicadores sempre que buildParams mudar
  useEffect(() => {
    setIndicatorParams(buildParams())
  }, [buildParams])

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

  // Exige projeto selecionado pra TODOS (cliente incluído) — sem projeto = estado vazio,
  // não agrega/mostra dados de outros projetos.
  const hasFilters = !!selectedProject

  // Contrato de sustentação → a aba "Sustentação" (breakdown) é redundante; esconde.
  const isSustentacaoContract = (() => {
    const st = projects.find(p => p.id === selectedProject)?.service_type
    if (!st) return false
    const c = (st.code ?? '').toLowerCase()
    const n = (st.name ?? '').toLowerCase()
    return c === 'sustentacao' || /sustenta|cloud|bizify/.test(n)
  })()
  // Se a aba Sustentação sumir enquanto ativa, volta pra Visão Geral.
  useEffect(() => {
    if (!isSustentacaoContract && (activeTab === 'maintenance' || activeTab === 'indicators')) setActiveTab('overview')
  }, [isSustentacaoContract, activeTab])

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
          {/* Status do projeto selecionado — em evidência pro cliente (Encerrado/Cancelado/etc.) */}
          {(() => {
            const sel = projects.find(p => p.id === selectedProject)
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
          {/* Filtro de data = COMPETÊNCIA (mês do serviço): dirige consumo + trava o serviço dos apontamentos. */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
              {activeTab === 'maintenance' ? 'Competência (serviço)' : 'Data'}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
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
            {/* Sustentação: range de DIGITAÇÃO opcional — filtra SÓ a lista de apontamentos (não muda consumo).
                Vazio = traz 100% da competência (qualquer data de digitação). */}
            {activeTab === 'maintenance' && showDigitacao && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Digitação</span>
                <DateRangePicker from={digFrom} to={digTo} onChange={(f, t) => { setDigFrom(f); setDigTo(t) }} />
                {(digFrom || digTo) && (
                  <button onClick={() => { setDigFrom(''); setDigTo('') }}
                    className="text-[11px] px-2 py-1 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--brand-border)' }}>
                    limpar
                  </button>
                )}
                <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>(opcional — vazio traz 100% da competência)</span>
              </div>
            )}
          </div>
        </div>

        {/* Sem projeto selecionado → lista de projetos com botão "Ver". */}
        {!hasFilters && (
          <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ border: '1px solid var(--brand-border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
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
                ) : projects.map((p) => (
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
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>{p.status_display ?? p.status ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedProject(p.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{ background: 'var(--brand-primary)', color: 'var(--primary-fg)' }}
                      >
                        <Eye size={14} /> Ver
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
            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <Tab label="Visão Geral"  active={activeTab === 'overview'}    onClick={() => setActiveTab('overview')} />
              <Tab label="Projetos"     active={activeTab === 'projects'}    onClick={() => setActiveTab('projects')} />
              {isSustentacaoContract && <Tab label="Sustentação"  active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} />}
              <Tab label="Despesas"     active={activeTab === 'expenses'}    onClick={() => setActiveTab('expenses')} />
              {isSustentacaoContract && <Tab label="Indicadores"  active={activeTab === 'indicators'}  onClick={() => setActiveTab('indicators')} />}
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
                    <ConsumoMesCard
                      total={summary.month_consumed_hours}
                      sustentacao={summary.month_maintenance_hours ?? 0}
                      projeto={summary.month_projects_hours ?? 0}
                      hint={monthConsumptionHint}
                    />
                    <KpiCard
                      label="Valor Hora"
                      value={fmtBRL(summary.hourly_rate)}
                      icon={DollarSign}
                      accent="default"
                    />
                    <KpiCard
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

            {/* ── PROJETOS ── */}
            {activeTab === 'projects' && (
              // Lista os projetos-filho do contrato On Demand selecionado (all-time,
              // ignora o filtro de data — igual ao BH Fixo).
              <OnDemandProjectsTable items={projectsList} loading={loadingProjects} onViewTimesheets={setTsModalProject} />
            )}

            {/* ── SUSTENTAÇÃO ── */}
            {activeTab === 'maintenance' && isSustentacaoContract && (
              <div className="space-y-4">
                <MxExportButton onClick={() => exportMaintenanceToXLSX('maintenance', mxRows, showDigitacao)} disabled={mxRows.length === 0} />
                <MxTimesheets rows={mxRows} loading={mxLoading} variant="maintenance" onRowClick={setMxDetail} onReverseApproved={canReverseApproval} onReverseSuccess={reloadMx} clientView={isCliente} showDigitacao={showDigitacao} />
                <MxTicketSummary rows={mxTicketSummary} loading={mxTicketLoading} />
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
                    <KpiCard label="Quantidade"    value={String(mxRows.length)} icon={DollarSign} />
                    <KpiCard label="Valor Total"   value={fmtBRL(totalAmount)} icon={DollarSign} />
                    <KpiCard label="Valor a Pagar" value={fmtBRL(toPay)} icon={DollarSign} accent="primary" />
                  </div>
                  <MxExportButton onClick={() => exportMaintenanceToXLSX('expenses', mxRows)} disabled={mxRows.length === 0} />
                  <MxExpenses rows={mxRows} loading={mxLoading} />
                </div>
              )
            })()}

            {/* ── INDICADORES ── */}
            {activeTab === 'indicators' && isSustentacaoContract && (
              <DashboardIndicators
                basePath="/dashboards/on-demand/indicators"
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

// ─── Inline tables (mesmo padrão de /dashboards/bank-hours-fixed) ────────────

function InlineTimesheetsTable({ rows, loading, onReverseApproved, onReverseSuccess }: {
  rows: any[]; loading: boolean
  onReverseApproved?: boolean
  onReverseSuccess?: () => void
}) {
  const [reversingId, setReversingId] = useState<number | null>(null)
  const handleReverse = async (id: number) => {
    if (!confirm('Estornar a aprovação deste apontamento?')) return
    setReversingId(id)
    try {
      await api.post(`/timesheets/${id}/reverse-approval`, {})
      toast.success('Aprovação estornada')
      onReverseSuccess?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao estornar aprovação')
    } finally {
      setReversingId(null)
    }
  }
  // POC do Design System: tabela canônica via <DataTable> + <StatusBadge>.
  // Zero CSS local; todos os estilos vêm dos tokens via componentes do DS.
  const colSpan = onReverseApproved ? 8 : 7
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="ds-text-h2" style={{ color: 'var(--text)' }}>Apontamentos do período</h3>
        <span className="ds-text-caption" style={{ color: 'var(--text-muted)' }}>{rows.length} registros</span>
      </div>
      <DataTable inline>
        <DataTableHead>
          <DataTableHeadRow>
            <DataTableHeadCell>Data</DataTableHeadCell>
            <DataTableHeadCell>Consultor</DataTableHeadCell>
            <DataTableHeadCell>Projeto</DataTableHeadCell>
            <DataTableHeadCell>Ticket</DataTableHeadCell>
            <DataTableHeadCell>Descrição</DataTableHeadCell>
            <DataTableHeadCell align="right">Horas</DataTableHeadCell>
            <DataTableHeadCell>Status</DataTableHeadCell>
            {onReverseApproved && <DataTableHeadCell align="right" />}
          </DataTableHeadRow>
        </DataTableHead>
        <DataTableBody>
          {loading ? (
            <DataTableEmpty colSpan={colSpan} message="Carregando…" />
          ) : rows.length === 0 ? (
            <DataTableEmpty colSpan={colSpan} message="Sem apontamentos no período selecionado." />
          ) : rows.map(r => {
            const canReverse = onReverseApproved && String(r.status ?? '').toLowerCase() === 'approved'
            return (
              <DataTableRow key={r.id}>
                <DataTableCell>{r.date ? r.date.split('-').reverse().join('/') : '—'}</DataTableCell>
                <DataTableCell muted={false}>{r.user?.name ?? '—'}</DataTableCell>
                <DataTableCell>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-light)' }}>{r.project?.code}</span>
                  <span className="mx-1.5" style={{ color: 'var(--text-light)' }}>·</span>
                  <span style={{ color: 'var(--text)' }}>{r.project?.name}</span>
                </DataTableCell>
                <DataTableCell>
                  {r.ticket
                    ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${r.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }} onClick={(e) => e.stopPropagation()}>#{r.ticket}</a>
                    : <span style={{ color: 'var(--text-light)' }}>—</span>}
                </DataTableCell>
                <DataTableCell wrap>{previewText(r.description) || '—'}</DataTableCell>
                <DataTableCell align="right" numeric muted={false}>{((r.effort_minutes ?? 0) / 60).toFixed(2)}h</DataTableCell>
                <DataTableCell>
                  <StatusBadge variant={getStatusVariant(r.status)}>{r.status_display ?? r.status}</StatusBadge>
                </DataTableCell>
                {onReverseApproved && (
                  <DataTableCell align="right">
                    {canReverse && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleReverse(r.id) }}
                        disabled={reversingId === r.id}
                        title="Estornar aprovação"
                        className="inline-flex items-center justify-center p-1.5 rounded-md transition-colors disabled:opacity-40"
                        style={{ color: 'var(--danger-border)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Undo2 size={13} />
                      </button>
                    )}
                  </DataTableCell>
                )}
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
    </div>
  )
}

function InlineTicketSummaryTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  // Apuração em horas DECIMAIS (não HH:MM) — ex.: 44h42min = 44,70h → "44.70h".
  const fmtHoras = (mins: number) => `${((mins ?? 0) / 60).toFixed(2)}h`
  if (!loading && rows.length === 0) return null
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Apuração por Ticket</h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rows.length} tickets</span>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Ticket</th>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Título</th>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Solicitante</th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Total no período</th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Total histórico</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(tk => (
                <tr key={tk.ticket} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2">
                    <a href={`https://erpserv.movidesk.com/Ticket/Edit/${tk.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }}>#{tk.ticket}</a>
                  </td>
                  <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{tk.title ?? '—'}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{tk.requester ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtHoras(tk.period_minutes)}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{fmtHoras(tk.lifetime_minutes)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                <td colSpan={3} className="px-4 py-2 text-right">Totais ({rows.length} {rows.length === 1 ? 'ticket' : 'tickets'})</td>
                <td className="px-4 py-2 text-right font-mono">{fmtHoras(rows.reduce((s, r) => s + (r.period_minutes || 0), 0))}</td>
                <td className="px-4 py-2 text-right font-mono">{fmtHoras(rows.reduce((s, r) => s + (r.lifetime_minutes || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

// Tabela dos projetos-filho do contrato On Demand (mesmo estilo do BH Fixo).
function OnDemandProjectsTable({ items, loading, onViewTimesheets }: { items: ProjectItem[]; loading: boolean; onViewTimesheets: (p: ProjectItem) => void }) {
  return (
    <div className="rounded-2xl overflow-x-auto overflow-y-clip mt-4" style={{ border: '1px solid var(--brand-border)' }}>
      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--brand-border)' }} />
          ))}
        </div>
      ) : (
        <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
          <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
            <tr>
              {['Código','Projeto','Status','Tipo','Consumo','Início',''].map(col => (
                <th key={col} className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider ${col === 'Consumo' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--brand-subtle)' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado.</td></tr>
            ) : items.map((p) => {
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
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>{p.status_display}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.contract_type_display}</td>
                  <td className="px-5 py-3.5 text-right font-medium" style={{ color: 'var(--brand-text)' }}>{fmtH(p.consumed_hours ?? 0)}</td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                  <td className="px-3 py-3.5 text-right">
                    <button
                      onClick={() => onViewTimesheets(p)}
                      className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]"
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

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
        style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
      >
        <Download size={14} />
        Exportar Excel
      </button>
    </div>
  )
}
