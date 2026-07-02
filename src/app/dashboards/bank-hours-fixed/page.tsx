'use client'

import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/app-layout'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { sanitizeHtml, previewText } from '@/lib/sanitize'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { BarChart2, Clock, TrendingUp, TrendingDown, AlertCircle, DollarSign, ChevronDown, Download, MoreVertical, Calendar, User as UserIcon, Building2, Folder, Paperclip, FileText, X as CloseIcon, Eye, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import ProjectTimesheetsModal from '@/components/dashboard/ProjectTimesheetsModal'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { KpiCard } from '@/components/ui/kpi-card'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Project   { id: number; name: string; code: string; status?: string; status_display?: string; service_type?: { code?: string | null; name?: string | null } | null }
interface Executive { id: number; name: string }

interface SummaryData {
  contracted_hours: number
  accumulated_contracted_hours?: number
  contributed_hours: number
  consumed_hours: number
  projects_consumed_hours?: number
  projects_month_consumed_hours?: number
  maintenance_consumed_hours?: number
  maintenance_month_consumed_hours?: number
  architecture_consumed_hours?: number
  architecture_month_consumed_hours?: number
  month_consumed_hours: number
  hours_balance: number
  exceeded_hours: number
  amount_to_pay: number | null
  hourly_rate: number | null
  contributed_hours_history?: ContributionItem[]
  has_support?: boolean
  has_architecture?: boolean
  has_children?: boolean
}

interface ContributionItem {
  id: number
  project: { id: number; name: string; code: string }
  difference: number
  contributed_hours?: number
  hourly_rate?: number
  total_value?: number
  description?: string
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
  is_auster_frozen?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtH(h: number) { return h.toFixed(1) }
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return formatBRL(v ?? 0)
}
function fmtDate(s: string) {
  // Mantém o dia/mês/ano literal do banco (YYYY-MM-DD) sem aplicar shift de fuso.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString('pt-BR')
}

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

// MetricCard local removido — agora usamos KpiCard de '@/components/ui/kpi-card'.

// ─── Breakdown Card ───────────────────────────────────────────────────────────

function ContractedBreakdownCard({ contratadas, aporte }: { contratadas: number; aporte: number }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 min-w-0 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-hover)' }}>
          <BarChart2 size={13} style={{ color: 'var(--text-muted)' }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Horas Contratadas + Aporte</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: 'var(--text)', lineHeight: 1 }}>{fmtH(contratadas + aporte)}</span>
        <span className="text-base font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>h</span>
      </div>
      <div className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Contratadas</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(contratadas)}h</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Aporte</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(aporte)}h</span>
        </div>
      </div>
    </div>
  )
}

function ConsumedBreakdownCard({ total, projetos, sustentacao, arquitetura }: { total: number; projetos?: number; sustentacao?: number; arquitetura?: number }) {
  const showArq = arquitetura !== undefined && arquitetura > 0
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 min-w-0 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Clock size={13} color="var(--primary)" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Consumo Acumulado</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: 'var(--primary)', lineHeight: 1 }}>{fmtH(total)}</span>
        <span className="text-base font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>h</span>
      </div>
      {(projetos !== undefined || sustentacao !== undefined || showArq) && (
        <div className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-baseline justify-between gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Projetos</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(projetos ?? 0)}h</span>
          </div>
          {showArq && (
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Arquitetura</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(arquitetura ?? 0)}h</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>Sustentação</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(sustentacao ?? 0)}h</span>
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
        ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
        : { color: 'var(--text-muted)' }
      }
    >
      {label}
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 animate-pulse" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="h-3 w-32 rounded mb-4" style={{ background: 'var(--border)' }} />
      <div className="h-10 w-24 rounded" style={{ background: 'var(--border)' }} />
    </div>
  )
}


// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BankHoursFixedPage() {
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
  // Estado inicial do filtro de data = SEM filtro selecionado (qualquer data).
  // Antes vinha pré-selecionado com o mês atual.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [refMonth, setRefMonth] = useState<number | null>(null)
  const [refYear,  setRefYear]  = useState<number | null>(null)
  const [filterMode, setFilterMode] = useState<'month' | 'period'>('month')

  const [summary,      setSummary]      = useState<SummaryData | null>(null)
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([])
  const [maintList,    setMaintList]    = useState<ProjectItem[]>([])

  const [loadingSummary,  setLoadingSummary]  = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingMaint,    setLoadingMaint]    = useState(false)

  const [activeTab, setActiveTab] = useState<'total' | 'projects' | 'architecture' | 'maintenance' | 'expenses' | 'indicators'>('total')
  const isAusterContext = (selectedCustomer === 220) || (!selectedCustomer && user?.customer_id === 220)

  // Projeto "leaf": um único projeto selecionado, sem sub-projetos de Arquitetura/Sustentação.
  // Apontamentos vão direto no Total Geral; abas e cards monetários ficam ocultos.
  const isLeafProject = !!selectedProject && summary != null
    && !(summary.has_architecture) && !(summary.has_support) && !(summary.has_children)

  useEffect(() => {
    if (isLeafProject && activeTab === 'projects') setActiveTab('total')
  }, [isLeafProject, activeTab])

  // ─── Indicadores do Suporte ────────────────────────────────────────────────
  // Usa o componente compartilhado DashboardIndicators (mesmo padrão do On Demand)
  const [indicatorParams, setIndicatorParams] = useState<URLSearchParams>(new URLSearchParams())
  useEffect(() => {
    const p = new URLSearchParams()
    if (selectedCustomer) p.set('customer_id', String(selectedCustomer))
    else if (user?.customer_id) p.set('customer_id', String(user.customer_id))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    if (selectedProject) p.set('project_id', String(selectedProject))
    const now2 = new Date()
    const _m = refMonth ?? (dateTo ? Number(dateTo.split('-')[1]) : now2.getMonth() + 1)
    const _y = refYear  ?? (dateTo ? Number(dateTo.split('-')[0]) : now2.getFullYear())
    p.set('month', String(_m)); p.set('year', String(_y))
    setIndicatorParams(p)
  }, [selectedCustomer, selectedExecutive, selectedProject, refMonth, refYear, dateTo, user?.customer_id])

  const [inlineRows, setInlineRows] = useState<any[]>([])
  const [inlineLoading, setInlineLoading] = useState(false)
  const [inlineReloadKey, setInlineReloadKey] = useState(0)
  const [ticketSummary, setTicketSummary] = useState<Array<{ticket: string; title: string|null; requester: string|null; period_minutes: number; lifetime_minutes: number}>>([])
  const [ticketSummaryLoading, setTicketSummaryLoading] = useState(false)
  // Cliente e Consultor não estornam aprovação — só admin, coord e parceiro_admin.
  const canReverseApproval = !!user && user.type !== 'consultor' && user.type !== 'cliente'
  const reloadInline = () => setInlineReloadKey(k => k + 1)
  useEffect(() => {
    // carrega lista inline conforme aba selecionada
    const isTimesheets = activeTab === 'maintenance' || activeTab === 'architecture'
    const isExpenses   = activeTab === 'expenses'
    const isLeafTotal  = isLeafProject && activeTab === 'total'
    if (!isTimesheets && !isExpenses && !isLeafTotal) { setInlineRows([]); setTicketSummary([]); return }

    setInlineLoading(true)
    const qs = new URLSearchParams()
    if (selectedCustomer) qs.set('customer_id', String(selectedCustomer))
    else if (user?.customer_id) qs.set('customer_id', String(user.customer_id))
    if (selectedProject) qs.set('project_id', String(selectedProject))
    let effFrom = dateFrom
    let effTo   = dateTo
    if ((!effFrom || !effTo) && refMonth && refYear) {
      const mm = String(refMonth).padStart(2, '0')
      const lastDay = new Date(refYear, refMonth, 0).getDate()
      effFrom = `${refYear}-${mm}-01`
      effTo   = `${refYear}-${mm}-${String(lastDay).padStart(2, '0')}`
    }
    if (effFrom) qs.set('date_from', effFrom)
    if (effTo)   qs.set('date_to',   effTo)
    const path = isLeafTotal
      ? `/dashboards/bank-hours-fixed/project-timesheets?${qs}`
      : isTimesheets
        ? `/dashboards/bank-hours-fixed/category-timesheets?${qs}&category=${activeTab === 'architecture' ? 'architecture' : 'maintenance'}`
        : `/dashboards/bank-hours-fixed/expenses?${qs}`
    api.get<{ data: any[] }>(path)
      .then(r => setInlineRows(r.data ?? []))
      .catch(() => setInlineRows([]))
      .finally(() => setInlineLoading(false))

    // Agrupamento por ticket — apenas em Sustentação
    if (activeTab === 'maintenance') {
      setTicketSummaryLoading(true)
      api.get<{ tickets: any[] }>(`/dashboards/bank-hours-fixed/category-ticket-summary?${qs}&category=maintenance`)
        .then(r => setTicketSummary(r.tickets ?? []))
        .catch(() => setTicketSummary([]))
        .finally(() => setTicketSummaryLoading(false))
    } else {
      setTicketSummary([])
    }
  }, [activeTab, selectedCustomer, selectedProject, dateFrom, dateTo, refMonth, refYear, isLeafProject, user?.customer_id, inlineReloadKey])

  // Modal reutilizável "Ver apontamentos" da aba Projetos (filtro de data + export Excel/PDF).
  const [tsModalProject, setTsModalProject] = useState<ProjectItem | null>(null)

  // Modais da aba Projetos: Ver Apontamentos + Detalhe
  const [projectTSModal, setProjectTSModal] = useState<{ projectId: number; projectName: string; isClosed?: boolean } | null>(null)
  const [projectTSRows, setProjectTSRows] = useState<any[]>([])
  const [projectTSLoading, setProjectTSLoading] = useState(false)
  const [projectTSDetail, setProjectTSDetail] = useState<any | null>(null)
  const [inlineDetail, setInlineDetail] = useState<any | null>(null)
  useEffect(() => {
    if (!projectTSModal) { setProjectTSRows([]); return }
    if (projectTSModal.isClosed) { setProjectTSRows([]); setProjectTSLoading(false); return }
    setProjectTSLoading(true)
    const qs = new URLSearchParams()
    qs.set('project_id', String(projectTSModal.projectId))
    if (selectedCustomer) qs.set('customer_id', String(selectedCustomer))
    else if (user?.customer_id) qs.set('customer_id', String(user.customer_id))
    let effFrom = dateFrom
    let effTo   = dateTo
    if ((!effFrom || !effTo) && refMonth && refYear) {
      const mm = String(refMonth).padStart(2, '0')
      const lastDay = new Date(refYear, refMonth, 0).getDate()
      effFrom = `${refYear}-${mm}-01`
      effTo   = `${refYear}-${mm}-${String(lastDay).padStart(2, '0')}`
    }
    if (effFrom) qs.set('date_from', effFrom)
    if (effTo)   qs.set('date_to',   effTo)
    api.get<{ data: any[] }>(`/dashboards/bank-hours-fixed/project-timesheets?${qs}`)
      .then(r => setProjectTSRows(r.data ?? []))
      .catch(() => setProjectTSRows([]))
      .finally(() => setProjectTSLoading(false))
  }, [projectTSModal, selectedCustomer, dateFrom, dateTo, refMonth, refYear, user?.customer_id])

  function exportInlineToXLSX() {
    if (inlineRows.length === 0) return
    const isExpenses = activeTab === 'expenses'
    const isLeafTotal = isLeafProject && activeTab === 'total'
    const sheetName = isExpenses
      ? 'Despesas'
      : isLeafTotal
        ? 'Apontamentos'
        : (activeTab === 'architecture' ? 'Arquitetura' : 'Sustentação')
    const data = isExpenses
      ? inlineRows.map(r => ({
          Data: r.date ? r.date.split('-').reverse().join('/') : '',
          Colaborador: r.user?.name ?? '',
          Valor: Number(r.amount) || 0,
        }))
      : isLeafTotal
        ? inlineRows.map(r => ({
            Data: r.date ? r.date.split('-').reverse().join('/') : '',
            Consultor: r.user?.name ?? '',
            Descrição: previewText(r.description),
            Início: r.start_time ?? '',
            Fim: r.end_time ?? '',
            'Esforço (h)': Number(((r.effort_minutes ?? 0) / 60).toFixed(2)),
          }))
      : activeTab === 'maintenance'
        ? inlineRows.map(r => ({
            Data: r.date ? r.date.split('-').reverse().join('/') : '',
            Solicitante: r.requester ?? '',
            Consultor: r.user?.name ?? '',
            Ticket: r.ticket ?? '',
            'Titulo do ticket': r.ticket_subject ?? '',
            Descrição: previewText(r.description),
            Início: r.start_time ?? '',
            Fim: r.end_time ?? '',
            'Esforço (h)': Number(((r.effort_minutes ?? 0) / 60).toFixed(2)),
            'Data do Serviço': r.date ? r.date.split('-').reverse().join('/') : '',
          }))
        : inlineRows.map(r => ({
            Data: r.date ? r.date.split('-').reverse().join('/') : '',
            Consultor: r.user?.name ?? '',
            Descrição: previewText(r.description),
            'Esforço (h)': Number(((r.effort_minutes ?? 0) / 60).toFixed(2)),
          }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `${sheetName.toLowerCase()}_${stamp}.xlsx`)
  }

  // Customers
  useEffect(() => {
    if (!user || user.type !== 'admin') return
    api.get<any>('/customers?pageSize=500&has_contract_type_name=Banco+de+Horas+Fixo').then(r => setCustomers(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
    api.get<any>('/executives?pageSize=100').then(r => setExecutives(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [user])

  // Projects list
  useEffect(() => {
    if (!user) return  // aguarda autenticação antes de buscar projetos
    const params = new URLSearchParams({ pageSize: '1000', contract_type_code: 'fixed_hours', parent_projects_only: 'true' })
    if (selectedCustomer) params.set('customer_id', String(selectedCustomer))
    else if (isCliente && user.customer_id) params.set('customer_id', String(user.customer_id))
    api.get<any>(`/projects?${params}`).then(r => setProjects(Array.isArray(r?.items) ? r.items : [])).catch(() => {})
  }, [user, selectedCustomer, isCliente])

  // Cliente sempre precisa selecionar projeto (mostrar agregado sem projeto não faz sentido pro cliente).
  // Admin pode ver agregado por cliente OU por projeto.
  // Exige PROJETO selecionado pra todos (admin incluído) — sem projeto = estado vazio,
  // não agrega o cliente inteiro. (Antes admin via o agregado do cliente sem escolher projeto.)
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

  // Abas "Sustentação" e "Indicadores do Suporte" só em contrato de sustentação;
  // "Projetos" aparece sempre (em sustentação lista os projetos-filho). Reseta se some.
  useEffect(() => {
    if (!isSustentacaoContract && (activeTab === 'maintenance' || activeTab === 'indicators')) setActiveTab('total')
  }, [isSustentacaoContract, activeTab])

  // Build base params
  const baseParams = useCallback(() => {
    const p = new URLSearchParams()
    if (selectedCustomer)                    p.set('customer_id',  String(selectedCustomer))
    else if (isCliente && user?.customer_id) p.set('customer_id',  String(user.customer_id))
    if (selectedExecutive) p.set('executive_id', String(selectedExecutive))
    if (selectedProject)   p.set('project_id',   String(selectedProject))
    return p
  }, [selectedCustomer, selectedExecutive, selectedProject, isCliente, user?.customer_id])

  const resolveMonthYear = useCallback(() => {
    const now = new Date()
    const toM = refMonth ?? (dateTo ? Number(dateTo.split('-')[1]) : now.getMonth() + 1)
    const toY = refYear  ?? (dateTo ? Number(dateTo.split('-')[0]) : now.getFullYear())
    return [toM, toY] as const
  }, [refMonth, refYear, dateTo])

  // Summary (Total Geral)
  const fetchSummary = useCallback(() => {
    if (!hasFilters) return
    const p = baseParams()
    const [toM, toY] = resolveMonthYear()
    p.set('month', String(toM)); p.set('year', String(toY))
    setLoadingSummary(true)
    api.get<any>(`/dashboards/bank-hours-fixed?${p}`)
      .then(r => setSummary(r?.data ?? r ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [baseParams, resolveMonthYear, hasFilters])

  // Indica se o usuário limpou o filtro de data (ambos os modos vazios) — nesse caso
  // omitimos month/year/date_from/date_to do request pra trazer projetos de qualquer período.
  const dateFilterCleared = refMonth == null && refYear == null && !dateFrom && !dateTo

  // Legenda do "Consumo do Mês" — reflete o período efetivo usado pelo summary.
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

  // Projects tab data
  const fetchProjects = useCallback(() => {
    if (!hasFilters) return
    // Aba Projetos ignora o filtro de data por design — sempre lista tudo.
    const p = baseParams()
    p.set('service_type_name', 'Projeto')
    setLoadingProjects(true)
    api.get<any>(`/dashboards/bank-hours-fixed/projects?${p}`)
      .then(r => setProjectsList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProjectsList([]))
      .finally(() => setLoadingProjects(false))
  }, [baseParams, hasFilters])

  // Maintenance tab data
  const fetchMaintenance = useCallback(() => {
    if (!hasFilters) return
    const p = baseParams()
    if (!dateFilterCleared) {
      if (dateFrom) p.set('date_from', dateFrom)
      if (dateTo)   p.set('date_to',   dateTo)
      if (!dateFrom && !dateTo) {
        const [toM, toY] = resolveMonthYear()
        p.set('month', String(toM)); p.set('year', String(toY))
      }
    }
    p.set('service_type_name', 'Sustentação')
    setLoadingMaint(true)
    api.get<any>(`/dashboards/bank-hours-fixed/projects?${p}`)
      .then(r => setMaintList(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setMaintList([]))
      .finally(() => setLoadingMaint(false))
  }, [baseParams, resolveMonthYear, hasFilters, dateFilterCleared, dateFrom, dateTo])

  // Aba Projetos: por padrão lista TODOS os projetos (all-time). Só na Auster o
  // filtro de data (mês/ano ou período) recorta a lista pela DATA DE INÍCIO do
  // projeto — pedido específico do cliente Auster.
  const displayedProjects = useMemo(() => {
    if (!isAusterContext) return projectsList
    if (dateFrom && dateTo) {
      return projectsList.filter(p => p.start_date && p.start_date >= dateFrom && p.start_date <= dateTo)
    }
    if (refMonth && refYear) {
      const ym = `${refYear}-${String(refMonth).padStart(2, '0')}`
      return projectsList.filter(p => p.start_date && p.start_date.slice(0, 7) === ym)
    }
    return projectsList
  }, [isAusterContext, projectsList, dateFrom, dateTo, refMonth, refYear])

  const projectsFilterHint = (() => {
    if (!isAusterContext) return null
    if (dateFrom && dateTo) {
      const fmt = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[3]}/${m[2]}/${m[1]}` : s }
      return `Início entre ${fmt(dateFrom)} e ${fmt(dateTo)}`
    }
    if (refMonth && refYear) return `Início em ${MONTH_NAMES_PT[refMonth - 1]} ${refYear}`
    return null
  })()

  function exportProjectsToXLSX() {
    if (displayedProjects.length === 0) return
    const data = displayedProjects.map(p => {
      const contributions = p.total_contributions_hours || p.hour_contribution || 0
      return {
        'Código': p.code ?? '',
        'Projeto': p.name ?? '',
        'Status': p.status_display ?? '',
        'Tipo': p.contract_type_display ?? '',
        'Horas Vendidas': p.sold_hours ?? 0,
        'Aporte (h)': contributions || 0,
        'Consumo (h)': Number((p.consumed_hours ?? 0).toFixed(2)),
        'Saldo (h)': Number((p.hours_balance ?? 0).toFixed(2)),
        'Início': p.start_date ? fmtDate(p.start_date) : '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Projetos')
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `projetos_${stamp}.xlsx`)
  }

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'projects')    fetchProjects()    }, [fetchProjects, activeTab])
  useEffect(() => { if (activeTab === 'maintenance') fetchMaintenance() }, [fetchMaintenance, activeTab])

  // Projects table (shared between Projetos and Sustentação)
  const ProjectsTable = ({ items, loading }: { items: ProjectItem[]; loading: boolean }) => (
    <div className="rounded-2xl overflow-x-auto overflow-y-clip mt-4" style={{ border: '1px solid var(--border)' }}>
      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
          ))}
        </div>
      ) : (
          <table className="w-full text-sm" style={{ background: 'var(--surface)' }}>
            <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
              <tr>
                {['Código','Projeto','Status','Tipo','Horas Vendidas','Consumo','Início',''].map(col => (
                  <th key={col} className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider ${['Horas Vendidas','Consumo'].includes(col) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-light)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum projeto encontrado.</td></tr>
              ) : items.map((p) => {
                const contributions = p.total_contributions_hours || p.hour_contribution || 0
                return (
                  <tr
                    key={p.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--border)', color: 'var(--text-light)' }}>{p.code}</span>
                    </td>
                    <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text)' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{p.name}</span>
                        {p.is_auster_frozen && (
                          <span
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold whitespace-nowrap"
                            style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                            title="Projeto histórico — não consome do contrato atual"
                          >Histórico</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>{p.status_display}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{p.contract_type_display}</td>
                    <td className="px-5 py-3.5 text-right font-medium" style={{ color: 'var(--text)' }}>
                      {p.sold_hours !== null ? (contributions > 0 ? `${p.sold_hours} (+${contributions})` : String(p.sold_hours)) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium" style={{ color: 'var(--text)' }}>{fmtH(p.consumed_hours ?? 0)}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setTsModalProject(p)}
                          className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]"
                          style={{ color: 'var(--text-muted)' }}
                          title="Ver apontamentos"
                        >
                          <Eye size={16} />
                        </button>
                        <ProjectActionsMenu onViewTimesheets={() => setProjectTSModal({
                          projectId: p.id,
                          projectName: p.name,
                          isClosed: String(p.contract_type_display ?? '').toLowerCase() === 'fechado',
                        })} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      )}
    </div>
  )

  return (
    <AppLayout title="Dashboard — Banco de Horas Fixo">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <BarChart2 size={16} color="var(--primary)" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>Banco de Horas Fixo</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Consumo, saldo e histórico de aporte por projeto</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Status</label>
                <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold w-fit" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
                  {sel.status_display ?? sel.status}
                </span>
              </div>
            )
          })()}
          {/* Filtro de data */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Data</label>
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
                    if (m === 0) { setRefMonth(null); setRefYear(null); setDateFrom(''); setDateTo('') }
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
          <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--surface)' }}>
              <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                <tr>
                  {['Código','Projeto','Status'].map(col => (
                    <th key={col} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{col}</th>
                  ))}
                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum projeto encontrado.</td></tr>
                ) : projects.map((p) => (
                  <tr
                    key={p.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--border)', color: 'var(--text-light)' }}>{p.code}</span>
                    </td>
                    <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text)' }}>{p.name}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>{p.status_display ?? p.status ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedProject(p.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
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
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Tab label="Total Geral"  active={activeTab === 'total'}       onClick={() => setActiveTab('total')} />
              {!isLeafProject && (
                <Tab label="Projetos"     active={activeTab === 'projects'}    onClick={() => setActiveTab('projects')} />
              )}
              {summary?.has_architecture && (
                <Tab label="Arquitetura" active={activeTab === 'architecture'} onClick={() => setActiveTab('architecture')} />
              )}
              {isSustentacaoContract && (
                <Tab label="Sustentação" active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} />
              )}
              {!isAusterContext && isSustentacaoContract && (
                <Tab label="Indicadores do Suporte" active={activeTab === 'indicators'} onClick={() => setActiveTab('indicators')} />
              )}
              <Tab label="Despesas" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
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
                      <ContractedBreakdownCard
                        contratadas={summary.contracted_hours ?? 0}
                        aporte={summary.contributed_hours ?? 0}
                      />
                      {isLeafProject ? (
                        <KpiCard label="Consumo Acumulado" value={fmtH(summary.consumed_hours)} icon={Clock} accent="primary" />
                      ) : (
                        <ConsumedBreakdownCard
                          total={summary.consumed_hours}
                          projetos={summary.projects_consumed_hours}
                          sustentacao={summary.maintenance_consumed_hours}
                          arquitetura={summary.architecture_consumed_hours}
                        />
                      )}
                      <KpiCard
                        label="Consumo do Mês"
                        value={fmtH(summary.month_consumed_hours)}
                        hint={monthConsumptionHint}
                        icon={Clock}
                        accent="default"
                      />
                      <KpiCard
                        label="Saldo de Horas"
                        value={fmtH(summary.hours_balance)}
                        icon={summary.hours_balance >= 0 ? TrendingUp : TrendingDown}
                        accent={summary.hours_balance >= 0 ? 'success' : 'danger'}
                      />
                    </div>

                    {/* Row 2: 3 highlight cards (oculto em modo leaf) */}
                    {!isLeafProject && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Sem valor/hora definido → os 3 cards ficam sem valor (—): sem rate não
                            faz sentido cobrar excedente. (Antes Valor a Pagar usava a média ponderada
                            mesmo com Valor Hora vazio, mostrando R$ "fantasma".) */}
                        <KpiCard
                          label="Horas Excedentes"
                          value={summary.hourly_rate != null ? fmtH(summary.exceeded_hours) : '—'}
                          icon={AlertCircle}
                          accent={summary.hourly_rate != null && summary.exceeded_hours > 0 ? 'danger' : 'default'}
                        />
                        <KpiCard label="Valor Hora"   value={fmtBRL(summary.hourly_rate)}   unit="" icon={DollarSign} />
                        <KpiCard
                          label="Valor a Pagar"
                          value={summary.hourly_rate != null ? fmtBRL(summary.amount_to_pay) : '—'}
                          unit=""
                          icon={DollarSign}
                          accent={summary.hourly_rate != null && (summary.amount_to_pay ?? 0) > 0 ? 'danger' : 'default'}
                        />
                      </div>
                    )}

                    {/* Apontamentos (modo leaf) */}
                    {isLeafProject && (
                      <>
                        <ExportButton onClick={exportInlineToXLSX} disabled={inlineRows.length === 0} />
                        <InlineTimesheetsTable rows={inlineRows} loading={inlineLoading} variant="leaf" onRowClick={setInlineDetail} onReverseApproved={canReverseApproval} onReverseSuccess={reloadInline} />
                      </>
                    )}

                    {/* Histórico de Aporte — sempre exibido (com estado vazio).
                        Contratos de Banco de Horas têm controle de aporte; On Demand
                        é dashboard separado e não cai aqui. */}
                    <div className="rounded-2xl overflow-x-auto overflow-y-clip" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                          <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Histórico de Aporte de Horas</h3>
                        </div>
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                              <tr>
                                {['Projeto','Horas','Motivo','Valor/h','Total','Descrição','Data','Por'].map(col => (
                                  <th key={col} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(summary.contributed_hours_history?.length ?? 0) === 0 ? (
                                <tr>
                                  <td colSpan={8} className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>
                                    Nenhum aporte de horas registrado
                                  </td>
                                </tr>
                              ) : summary.contributed_hours_history!.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <td className="px-5 py-3" style={{ color: 'var(--text)' }}>{item.project?.code} — {item.project?.name}</td>
                                  <td className="px-5 py-3 font-bold" style={{ color: 'var(--primary)' }}>{Number(item.contributed_hours ?? item.difference ?? 0).toFixed(0)}h</td>
                                  <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{MOTIVO_LABEL[item.motivo ?? 'aporte'] ?? 'Aporte'}</td>
                                  <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{fmtBRL(item.hourly_rate ?? null)}</td>
                                  <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{fmtBRL(item.total_value ?? null)}</td>
                                  <td className="px-5 py-3 max-w-48 truncate" style={{ color: 'var(--text-muted)' }}>{item.description || '—'}</td>
                                  <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{fmtDate(item.created_at)}</td>
                                  <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{item.changed_by?.name ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                      </div>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum dado disponível.</p>
                )}
              </div>
            )}

            {/* ── PROJETOS ── */}
            {activeTab === 'projects' && (
              // Por padrão lista TODOS os projetos (all-time, consumo acumulado).
              // Exceção Auster: o filtro de data recorta a lista pela data de início.
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <KpiCard
                    label="Consumo Acumulado"
                    value={fmtH(summary?.projects_consumed_hours ?? summary?.consumed_hours ?? 0)}
                    icon={Clock}
                    accent="primary"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {projectsFilterHint ? (
                    <span className="text-xs px-3 py-1.5 rounded-full font-medium inline-flex items-center gap-1.5"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      <Calendar size={13} /> {projectsFilterHint} · {displayedProjects.length} projeto{displayedProjects.length === 1 ? '' : 's'}
                    </span>
                  ) : <span />}
                  <ExportButton onClick={exportProjectsToXLSX} disabled={displayedProjects.length === 0} />
                </div>
                <ProjectsTable items={displayedProjects} loading={loadingProjects} />
              </div>
            )}

            {/* ── ARQUITETURA ── */}
            {activeTab === 'architecture' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <KpiCard label="Consumo Acumulado" value={fmtH(summary?.architecture_consumed_hours ?? 0)} icon={Clock} accent="primary" />
                  <KpiCard label="Consumo do Mês"    value={fmtH(summary?.architecture_month_consumed_hours ?? 0)} icon={Clock} hint={monthConsumptionHint} />
                </div>
                <ExportButton onClick={exportInlineToXLSX} disabled={inlineRows.length === 0} />
                <InlineTimesheetsTable rows={inlineRows} loading={inlineLoading} variant="architecture" onRowClick={setInlineDetail} onReverseApproved={canReverseApproval} onReverseSuccess={reloadInline} />
              </div>
            )}

            {/* ── SUSTENTAÇÃO ── */}
            {activeTab === 'maintenance' && isSustentacaoContract && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <KpiCard label="Consumo Acumulado" value={fmtH(summary?.maintenance_consumed_hours ?? 0)} icon={Clock} accent="primary" />
                  <KpiCard label="Consumo do Mês"    value={fmtH(summary?.maintenance_month_consumed_hours ?? summary?.month_consumed_hours ?? 0)} icon={Clock} hint={monthConsumptionHint} />
                </div>
                <ExportButton onClick={exportInlineToXLSX} disabled={inlineRows.length === 0} />
                <InlineTimesheetsTable rows={inlineRows} loading={inlineLoading} variant="maintenance" onRowClick={setInlineDetail} onReverseApproved={canReverseApproval} onReverseSuccess={reloadInline} />
                <InlineTicketSummaryTable rows={ticketSummary} loading={ticketSummaryLoading} />
              </div>
            )}

            {/* ── INDICADORES DO SUPORTE ── */}
            {activeTab === 'indicators' && !isAusterContext && isSustentacaoContract && (
              <DashboardIndicators
                basePath="/dashboards/bank-hours-fixed/indicators"
                params={indicatorParams}
                disabled={!hasFilters}
              />
            )}

            {/* ── DESPESAS ── */}
            {activeTab === 'expenses' && (() => {
              const totalAmount = inlineRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
              const toPay = inlineRows
                .filter(r => !['rejected','rejeitado','pago','paid'].includes(String(r.status ?? '').toLowerCase()))
                .reduce((s, r) => s + (Number(r.amount) || 0), 0)
              const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard label="Quantidade"    value={String(inlineRows.length)} icon={DollarSign} />
                    <KpiCard label="Valor Total"   value={fmtBRL(totalAmount)} icon={DollarSign} />
                    <KpiCard label="Valor a Pagar" value={fmtBRL(toPay)} icon={DollarSign} accent="primary" />
                  </div>
                  <ExportButton onClick={exportInlineToXLSX} disabled={inlineRows.length === 0} />
                  <InlineExpensesTable rows={inlineRows} loading={inlineLoading} />
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ─ Modal A: Lista de Apontamentos do Projeto ─ */}
      {projectTSModal && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setProjectTSModal(null)}
        >
          <div onClick={e => e.stopPropagation()} className="w-full max-w-6xl mt-8 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Apontamentos — {projectTSModal.projectName}</h3>
                {!projectTSModal.isClosed && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{projectTSRows.length} registros</p>
                )}
              </div>
              <button onClick={() => setProjectTSModal(null)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-muted)' }}><CloseIcon size={18} /></button>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              {projectTSModal.isClosed ? (
                <div className="py-16 px-8 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>
                    <AlertCircle size={24} />
                  </div>
                  <p className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Projeto Fechado</p>
                  <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
                    Projetos do tipo <strong>Fechado</strong> não controlam apontamentos — o valor vendido é comprometido no ato da criação.
                  </p>
                </div>
              ) : projectTSLoading ? (
                <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
              ) : projectTSRows.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sem apontamentos no período.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Data</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Solicitante</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Consultor</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Ticket</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Título do ticket</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Descrição</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Início</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Fim</th>
                      <th className="text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Esforço (h)</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectTSRows.map(r => (
                      <tr key={r.id} className="cursor-pointer" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => setProjectTSDetail(r)}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                        <td className="px-3 py-2">{r.requester ?? '—'}</td>
                        <td className="px-3 py-2">{r.user?.name ?? '—'}</td>
                        <td className="px-3 py-2">{r.ticket ? <span className="font-mono text-xs">{r.ticket}</span> : '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{r.ticket_subject ?? '—'}</td>
                        <td className="px-3 py-2 max-w-xs truncate" style={{ color: 'var(--text-muted)' }} title={previewText(r.description)}>{previewText(r.description) || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.start_time ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.end_time ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{((r.effort_minutes ?? 0) / 60).toFixed(2)}</td>
                        <td className="px-3 py-2"><Eye size={14} style={{ color: 'var(--text-muted)' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─ Modal B: Detalhe do Apontamento (aba Projetos) ─ */}
      {projectTSDetail && (
        <TimesheetDetailModal ts={projectTSDetail} onClose={() => setProjectTSDetail(null)} />
      )}

      {/* ─ Modal: Detalhe do Apontamento (abas Sustentação/Arquitetura) ─ */}
      {inlineDetail && (
        <TimesheetDetailModal ts={inlineDetail} onClose={() => setInlineDetail(null)} />
      )}

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

// ─── ProjectActionsMenu (3 pontinhos) ───────────────────────────────────────

function ProjectActionsMenu({ onViewTimesheets }: { onViewTimesheets: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-muted)' }}
        title="Ações"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-50 rounded-lg overflow-hidden min-w-[180px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--brand-card-shadow-md)' }}
        >
          <button
            onClick={() => { setOpen(false); onViewTimesheets() }}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text)' }}
          >
            <Eye size={14} /> Ver Apontamentos
          </button>
        </div>
      )}
    </div>
  )
}

// ─── TimesheetDetailModal ───────────────────────────────────────────────────

function TimesheetDetailModal({ ts, onClose }: { ts: any; onClose: () => void }) {
  const fmtDateBR = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '—'
  const period = (ts.start_time && ts.end_time)
    ? `${ts.start_time} – ${ts.end_time}`
    : null
  const hours = ((ts.effort_minutes ?? 0) / 60)
  const hoursDisplay = `${Math.floor(hours)}:${String(Math.round((hours - Math.floor(hours)) * 60)).padStart(2, '0')}`
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl mt-8 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 py-5 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
              <Clock size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Detalhe do Apontamento</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>#{ts.id} · {fmtDateBR(ts.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-muted)' }}><CloseIcon size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {period && (
            <div className="rounded-xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Período</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>
                {period} <span className="text-base font-normal" style={{ color: 'var(--text-muted)' }}>({hoursDisplay})</span>
              </p>
            </div>
          )}

          <div className="rounded-xl divide-y" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <DetailRow icon={<Calendar size={14} />} label="Data" value={fmtDateBR(ts.date)} />
            <DetailRow icon={<UserIcon size={14} />} label="Colaborador" value={ts.user?.name ?? '—'} />
            <DetailRow icon={<Building2 size={14} />} label="Cliente" value={ts.customer ?? '—'} />
            <DetailRow icon={<Folder size={14} />} label="Projeto" value={
              <div className="flex items-center gap-2 flex-wrap">
                <span>{ts.project?.name ?? '—'}</span>
                {ts.project?.contract_type && (
                  <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{ts.project.contract_type}</span>
                )}
              </div>
            } />
            <DetailRow icon={<Paperclip size={14} />} label="Anexo" value={ts.attachment_path ? <a href={ts.attachment_path} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Ver anexo</a> : 'Sem anexo'} />
            {ts.ticket && (
              <DetailRow icon={<FileText size={14} />} label="Ticket" value={
                <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs" style={{ color: 'var(--primary)' }}>#{ts.ticket}{ts.ticket_subject ? ` · ${ts.ticket_subject}` : ''}</a>
              } />
            )}
          </div>

          {ts.description && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} style={{ color: 'var(--primary)' }} />
                <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Observação</span>
              </div>
              <div
                className="text-sm leading-relaxed
                  [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                  [&_a]:underline [&_a]:text-[var(--primary)]
                  [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto
                  [&_code]:break-words
                  [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
                  [&_th]:border [&_th]:border-[var(--border)] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold
                  [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top
                  [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5
                  [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
                  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                  [&_hr]:my-3 [&_hr]:border-[var(--border)]
                "
                style={{ color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(ts.description) }}
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  )
}

// ─── Inline tables (visual no mesmo padrão de /timesheets) ──────────────────

const URGENCY_COLORS = {
  'Urgente': '#DC2626',  // vermelho forte
  'Alta':    '#F97316',  // laranja
  'Média':   '#F59E0B',  // âmbar / amarelo
  'Baixa':   '#10B981',  // verde
}

function IndicatorCard({
  title, rows, labelKey, valueKey, valueFmt, emptyMessage = 'Sem dados no período.', badgeKey, badgeFmt, colorKey, onRowClick,
}: {
  title: string
  rows: any[]
  labelKey: (r: any) => string
  valueKey: (r: any) => number
  valueFmt: (v: number) => string
  emptyMessage?: string
  badgeKey?: (r: any) => number
  badgeFmt?: (n: number) => string
  colorKey?: (r: any) => string
  onRowClick?: (r: any) => void
}) {
  const max = Math.max(1, ...rows.map(valueKey))
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      </div>
      <div className="p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 15).map((r, idx) => {
              const v = valueKey(r)
              const pct = (v / max) * 100
              const badgeVal = badgeKey ? badgeKey(r) : null
              const clickable = !!onRowClick
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors ${clickable ? 'cursor-pointer hover:bg-[var(--surface-hover)]' : ''}`}
                  onClick={clickable ? () => onRowClick!(r) : undefined}
                >
                  <div className="w-6 text-right text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                  <div className="w-48 shrink-0 text-sm truncate" style={{ color: 'var(--text)' }} title={labelKey(r)}>{labelKey(r)}</div>
                  <div className="flex-1 relative h-6 rounded overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${pct}%`, background: colorKey ? colorKey(r) : 'var(--primary)' }} />
                  </div>
                  <div className="w-24 text-right text-sm font-semibold shrink-0 whitespace-nowrap tabular-nums" style={{ color: 'var(--text)' }}>
                    {valueFmt(v)}
                  </div>
                  {badgeVal !== null && badgeFmt && (
                    <div
                      className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                      style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      {badgeFmt(badgeVal)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ReverseApprovalBtn({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      disabled={busy}
      title="Estornar aprovação"
      className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-[var(--surface-hover)] disabled:opacity-40"
      style={{ color: 'var(--danger)' }}
    >
      <Undo2 size={13} />
    </button>
  )
}

function InlineTimesheetsTable({ rows, loading, variant = 'maintenance', onRowClick, onReverseApproved, onReverseSuccess }: {
  rows: any[]; loading: boolean
  variant?: 'maintenance' | 'architecture' | 'leaf'
  onRowClick?: (r: any) => void
  onReverseApproved?: boolean
  onReverseSuccess?: () => void
}) {
  const isArch = variant === 'architecture'
  const isLeaf = variant === 'leaf'
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
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Apontamentos do período</h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rows.length} registros</span>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sem apontamentos no período selecionado.</div>
        ) : isArch ? (
          // Arquitetura — tabela enxuta (Data, Consultor, Descrição, Horas)
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Data</th>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Consultor</th>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide">Horas</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const canReverse = onReverseApproved && String(r.status ?? '').toLowerCase() === 'approved'
                return (
                <tr key={r.id} className={onRowClick ? 'cursor-pointer' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-4 py-2">{r.user?.name ?? '—'}</td>
                  <td className="px-4 py-2 max-w-2xl truncate" style={{ color: 'var(--text-muted)' }} title={previewText(r.description) || '—'}>{previewText(r.description) || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono whitespace-nowrap">{((r.effort_minutes ?? 0) / 60).toFixed(2)}h</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">
                    {canReverse && <ReverseApprovalBtn onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                    {onRowClick && <Eye size={14} className="inline-block ml-1" style={{ color: 'var(--text-muted)' }} />}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        ) : isLeaf ? (
          // Leaf — sem Solicitante / Ticket / Título do Ticket
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Data</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Consultor</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Início</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Fim</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Esforço (h)</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const canReverse = onReverseApproved && String(r.status ?? '').toLowerCase() === 'approved'
                return (
                <tr key={r.id} className={onRowClick ? 'cursor-pointer' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-3 py-2">{r.user?.name ?? '—'}</td>
                  <td className="px-3 py-2 max-w-xl truncate" style={{ color: 'var(--text-muted)' }} title={previewText(r.description) || '—'}>{previewText(r.description) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.start_time ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.end_time ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{((r.effort_minutes ?? 0) / 60).toFixed(2)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">
                    {canReverse && <ReverseApprovalBtn onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                    {onRowClick && <Eye size={14} className="inline-block ml-1" style={{ color: 'var(--text-muted)' }} />}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          // Sustentação — colunas no padrão do Excel
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Data</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Solicitante</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Consultor</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Ticket</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Título do ticket</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Início</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Fim</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Esforço (h)</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const desc = previewText(r.description) || '—'
                const canReverse = onReverseApproved && String(r.status ?? '').toLowerCase() === 'approved'
                return (
                  <tr key={r.id} className={onRowClick ? 'cursor-pointer' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                    <td className="px-3 py-2">{r.requester ?? '—'}</td>
                    <td className="px-3 py-2">{r.user?.name ?? '—'}</td>
                    <td className="px-3 py-2">
                      {r.ticket
                        ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${r.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }} onClick={e => e.stopPropagation()}>#{r.ticket}</a>
                        : <span style={{ color: 'var(--text-light)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate" style={{ color: 'var(--text-muted)' }} title={r.ticket_subject ?? '—'}>{r.ticket_subject ?? '—'}</td>
                    <td className="px-3 py-2 max-w-sm truncate" style={{ color: 'var(--text-muted)' }} title={desc}>{desc}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.start_time ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.end_time ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{((r.effort_minutes ?? 0) / 60).toFixed(2)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      {canReverse && <ReverseApprovalBtn onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                      {onRowClick && <Eye size={14} className="inline-block ml-1" style={{ color: 'var(--text-muted)' }} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function InlineTicketSummaryTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  // Apuração em horas DECIMAIS (não HH:MM) — ex.: 44h42min = 44,70h → "44.70h".
  const fmtH = (mins: number) => `${((mins ?? 0) / 60).toFixed(2)}h`
  if (!loading && rows.length === 0) return null
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Status Ticket</th>
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
                  <td className="px-4 py-2">
                    {(() => {
                      if (!tk.status) return <span style={{ color: 'var(--text-light)' }}>—</span>
                      const b = String(tk.base_status ?? tk.status).toLowerCase()
                      const c =
                        /cancel/.test(b)                                          ? '#ef4444' :
                        /(resolv|closed|fechad|encerrad)/.test(b)                 ? '#22c55e' :
                        /(stop|parad|aguard|pend|espera)/.test(b)                 ? '#f59e0b' :
                        /(new|novo|attend|atend|andamento|aberto|open)/.test(b)   ? '#00b8d4' :
                                                                                    '#9ca3af'
                      return (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                          style={{ color: c, background: `${c}22`, border: `1px solid ${c}55` }}>
                          {tk.status}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{fmtH(tk.period_minutes)}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{fmtH(tk.lifetime_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

function InlineExpensesTable({ rows, loading, onReverseApproved, onReverseSuccess }: {
  rows: any[]; loading: boolean
  onReverseApproved?: boolean
  onReverseSuccess?: () => void
}) {
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const [reversingId, setReversingId] = useState<number | null>(null)
  const handleReverse = async (id: number) => {
    if (!confirm('Estornar a aprovação desta despesa?')) return
    setReversingId(id)
    try {
      await api.post(`/expenses/${id}/reverse-approval`, {})
      toast.success('Aprovação estornada')
      onReverseSuccess?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao estornar aprovação')
    } finally {
      setReversingId(null)
    }
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Despesas do período</h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rows.length} registros</span>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sem despesas no período selecionado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Data</th>
                <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide">Colaborador</th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide">Valor</th>
                {onReverseApproved && <th className="px-2 py-2 w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const canReverse = onReverseApproved && String(r.status ?? '').toLowerCase() === 'approved'
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                    <td className="px-4 py-2">{r.user?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono whitespace-nowrap">{fmtBRL(Number(r.amount) || 0)}</td>
                    {onReverseApproved && (
                      <td className="px-2 py-2 whitespace-nowrap text-right">
                        {canReverse && <ReverseApprovalBtn onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
