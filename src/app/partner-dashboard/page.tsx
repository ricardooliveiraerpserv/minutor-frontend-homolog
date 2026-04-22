'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { TimesheetFormModal } from '@/components/ui/timesheet-form-modal'
import { formatBRL, formatNumber } from '@/lib/format'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { TimesheetViewModal } from '@/components/ui/timesheet-view-modal'
import { ExpenseViewModal } from '@/components/ui/expense-view-modal'
import type { Timesheet, Expense } from '@/types'
import {
  Clock, DollarSign, Users, TrendingUp, RefreshCw, ChevronLeft, ChevronRight, Receipt,
  Eye, Pencil, Trash2, Plus, MoreVertical, BarChart2, AlertTriangle, Zap, Activity,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function pad(n: number) { return String(n).padStart(2, '0') }

// ─── Types ────────────────────────────────────────────────────────────────────

interface Partner {
  id: number
  name: string
  pricing_type: string
  hourly_rate: string | null
}

interface KPIs {
  total_hours: number
  total_amount: number
  consultants_count: number
  active_consultants: number
  avg_ticket: number
}

interface ConsultantRow {
  id: number
  name: string
  total_minutes: number
  total_hours: number
  hourly_rate: number
  total_amount: number
  is_admin: boolean
}

interface ReportData {
  partner: Partner
  kpis: KPIs
  consultants: ConsultantRow[]
}

interface TimesheetItem {
  id: number
  user_id?: number
  date: string
  effort_hours: string
  effort_minutes: number
  status: string
  status_display: string
  user?: { id: number; name: string }
  project?: { id: number; name: string; customer?: { id: number; name: string } }
  customer?: { id: number; name: string }
  observation?: string
  ticket?: string
}

interface ExpenseItem {
  id: number
  user_id?: number
  expense_date: string
  description: string
  amount: number
  formatted_amount: string
  status: string
  status_display: string
  user?: { id: number; name: string }
  project?: { id: number; name: string; customer?: { id: number; name: string } }
  category?: { id: number; name: string }
}

type Tab = 'consultores' | 'apontamentos' | 'despesas' | 'indicadores'

const STATUS_COLORS: Record<string, string> = {
  pending:              'bg-yellow-500/15 text-yellow-400',
  approved:             'bg-green-500/15  text-green-400',
  rejected:             'bg-red-500/15    text-red-400',
  conflicted:           'bg-orange-500/15 text-orange-400',
  adjustment_requested: 'bg-blue-500/15   text-blue-400',
}

// ─── Row action menu ──────────────────────────────────────────────────────────

function RowMenu({ isOwn, onView, onEdit, onDelete }: {
  isOwn: boolean
  onView: () => void
  onEdit: () => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
        style={{ color: 'var(--brand-subtle)' }}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-50 w-44 rounded-xl py-1 shadow-2xl"
          style={{ background: '#1a1a1e', border: '1px solid var(--brand-border)' }}
        >
          <button onClick={() => { setOpen(false); onView() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--brand-text)' }}>
            <Eye size={14} style={{ color: 'var(--brand-subtle)' }} /> Visualizar
          </button>
          {isOwn && (
            <>
              <button onClick={() => { setOpen(false); onEdit() }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.06]"
                style={{ color: 'var(--brand-text)' }}>
                <Pencil size={14} style={{ color: 'var(--brand-subtle)' }} /> Editar
              </button>
              {onDelete && (
                <button onClick={() => { setOpen(false); onDelete() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-red-500/10"
                  style={{ color: '#f87171' }}>
                  <Trash2 size={14} /> Excluir
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = '#00F5FF',
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-tight">{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartnerDashboardPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    if (user.type !== 'parceiro_admin' || !user.is_executive) router.replace('/dashboard')
  }, [user, router])

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('consultores')

  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const isAtCurrentMonth = year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth())

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (isAtCurrentMonth) return
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const startDate = `${year}-${pad(month + 1)}-01`
  const endDate   = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`

  const [consultantId, setConsultantId] = useState('')
  const [newTsOpen, setNewTsOpen] = useState(false)

  // ── Timesheets tab state ──
  const [timesheets, setTimesheets]     = useState<TimesheetItem[]>([])
  const [tsLoading,  setTsLoading]      = useState(false)
  const [tsLoaded,   setTsLoaded]       = useState(false)

  // ── Expenses tab state ──
  const [expenses,   setExpenses]       = useState<ExpenseItem[]>([])
  const [expLoading, setExpLoading]     = useState(false)
  const [expLoaded,  setExpLoaded]      = useState(false)

  // ── Indicadores evolution state ──
  const [evoData,    setEvoData]        = useState<{ label: string; horas: number; receita: number }[]>([])
  const [evoLoading, setEvoLoading]     = useState(false)
  const [evoLoaded,  setEvoLoaded]      = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setTsLoaded(false)
    setExpLoaded(false)
    setEvoLoaded(false)
    const qs = new URLSearchParams({ start_date: startDate, end_date: endDate })
    api.get<ReportData & { error?: string }>(`/partner/report?${qs}`)
      .then(r => {
        if (r.error) { toast.error(r.error); return }
        setData(r)
      })
      .catch(() => toast.error('Erro ao carregar dados do parceiro'))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  const loadEvolution = useCallback(() => {
    setEvoLoading(true)
    const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const requests = Array.from({ length: 6 }, (_, i) => {
      let m = month - (5 - i)
      let y = year
      while (m < 0) { m += 12; y-- }
      const sd = `${y}-${pad(m + 1)}-01`
      const ed = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`
      return api.get<ReportData>(`/partner/report?start_date=${sd}&end_date=${ed}`)
        .then(r => ({ label: `${MONTHS_PT[m]}/${String(y).slice(2)}`, horas: r.kpis?.total_hours ?? 0, receita: r.kpis?.total_amount ?? 0 }))
        .catch(() => ({ label: MONTHS_PT[m], horas: 0, receita: 0 }))
    })
    Promise.all(requests).then(results => { setEvoData(results); setEvoLoaded(true) }).finally(() => setEvoLoading(false))
  }, [month, year])

  const loadTimesheets = useCallback(() => {
    setTsLoading(true)
    const qs = new URLSearchParams({
      team_view: '1',
      start_date: startDate,
      end_date: endDate,
      pageSize: '200',
    })
    if (consultantId) qs.set('user_id', consultantId)
    api.get<{ items: TimesheetItem[] }>(`/timesheets?${qs}`)
      .then(r => { setTimesheets(r.items ?? []); setTsLoaded(true) })
      .catch(() => toast.error('Erro ao carregar apontamentos'))
      .finally(() => setTsLoading(false))
  }, [startDate, endDate, consultantId])

  const loadExpenses = useCallback(() => {
    setExpLoading(true)
    const qs = new URLSearchParams({
      team_view: '1',
      start_date: startDate,
      end_date: endDate,
      pageSize: '200',
    })
    if (consultantId) qs.set('user_id', consultantId)
    api.get<{ items: ExpenseItem[] }>(`/expenses?${qs}`)
      .then(r => { setExpenses(r.items ?? []); setExpLoaded(true) })
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setExpLoading(false))
  }, [startDate, endDate, consultantId])

  useEffect(() => {
    if (activeTab === 'apontamentos') loadTimesheets()
  }, [activeTab, loadTimesheets])

  useEffect(() => {
    if (activeTab === 'despesas') loadExpenses()
  }, [activeTab, loadExpenses])

  useEffect(() => {
    if (activeTab === 'indicadores') {
      if (!evoLoaded) loadEvolution()
      if (!tsLoaded) loadTimesheets()
    }
  }, [activeTab, evoLoaded, tsLoaded, loadEvolution, loadTimesheets])

  // ── Modal state ──
  const [viewTs,  setViewTs]  = useState<Timesheet | null>(null)
  const [viewExp, setViewExp] = useState<Expense | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  const openTimesheetModal = (id: number) => {
    setModalLoading(true)
    api.get<Timesheet>(`/timesheets/${id}`)
      .then(r => setViewTs(r))
      .catch(() => toast.error('Erro ao carregar apontamento'))
      .finally(() => setModalLoading(false))
  }

  const openExpenseModal = (id: number) => {
    setModalLoading(true)
    api.get<Expense>(`/expenses/${id}`)
      .then(r => setViewExp(r))
      .catch(() => toast.error('Erro ao carregar despesa'))
      .finally(() => setModalLoading(false))
  }

  const deleteTimesheet = (id: number) => {
    if (!window.confirm('Excluir este apontamento?')) return
    api.delete(`/timesheets/${id}`)
      .then(() => {
        setTimesheets(prev => prev.filter(t => t.id !== id))
        toast.success('Apontamento excluído')
      })
      .catch(() => toast.error('Erro ao excluir apontamento'))
  }

  const pricingLabel = data?.partner.pricing_type === 'fixed'
    ? `Valor único — ${formatBRL(Number(data.partner.hourly_rate ?? 0))}/h`
    : 'Valores por consultor'

  const filteredConsultants = consultantId
    ? (data?.consultants ?? []).filter(c => String(c.id) === consultantId)
    : (data?.consultants ?? [])

  const displayKpis = data ? (() => {
    if (!consultantId) return data.kpis
    const totalHours  = filteredConsultants.reduce((s, c) => s + c.total_hours, 0)
    const totalAmount = filteredConsultants.reduce((s, c) => s + c.total_amount, 0)
    const active      = filteredConsultants.filter(c => c.total_hours > 0).length
    return {
      total_hours:        totalHours,
      total_amount:       totalAmount,
      consultants_count:  filteredConsultants.length,
      active_consultants: active,
      avg_ticket:         totalHours > 0 ? totalAmount / totalHours : data.kpis.avg_ticket,
    }
  })() : null

  // ── Indicadores computed ─────────────────────────────────────────────────
  const indConsultants = useMemo(() => {
    if (!data) return []
    const total = data.kpis.total_amount || 1
    return [...data.consultants]
      .sort((a, b) => b.total_amount - a.total_amount)
      .map(c => ({ ...c, participation: (c.total_amount / total) * 100 }))
  }, [data])

  const projectDist = useMemo(() => {
    if (!timesheets.length || !data) return []
    const map: Record<string, { name: string; minutes: number; amount: number }> = {}
    timesheets.forEach(t => {
      const name = t.project?.name ?? 'Sem projeto'
      if (!map[name]) map[name] = { name, minutes: 0, amount: 0 }
      map[name].minutes += t.effort_minutes ?? 0
    })
    // estimate amount: use fixed rate if pricing_type=fixed, else sum by consultant
    const rate = data.partner.pricing_type === 'fixed' ? Number(data.partner.hourly_rate ?? 0) : data.kpis.avg_ticket
    const entries = Object.values(map).map(p => ({ ...p, amount: (p.minutes / 60) * rate }))
    const totalAmt = entries.reduce((s, p) => s + p.amount, 0) || 1
    return entries
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map(p => ({ ...p, participation: (p.amount / totalAmt) * 100 }))
  }, [timesheets, data])

  const indEfficiency = useMemo(() => {
    if (!data || !timesheets.length) return null
    const businessDays = (() => {
      const d = new Date(year, month + 1, 0).getDate()
      let bd = 0
      for (let i = 1; i <= d; i++) {
        const dow = new Date(year, month, i).getDay()
        if (dow !== 0 && dow !== 6) bd++
      }
      return bd
    })()
    const totalMinutes = timesheets.reduce((s, t) => s + (t.effort_minutes ?? 0), 0)
    const avgPerEntry  = timesheets.length ? totalMinutes / timesheets.length : 0
    const hoursPerDay  = businessDays > 0 ? (totalMinutes / 60) / businessDays : 0
    return { businessDays, totalMinutes, avgPerEntry, hoursPerDay, entries: timesheets.length }
  }, [timesheets, year, month])

  const indAlerts = useMemo(() => {
    if (!data) return []
    const alerts: { type: 'warning' | 'danger' | 'info'; text: string }[] = []
    const noHours = data.consultants.filter(c => c.total_hours === 0)
    if (noHours.length) alerts.push({ type: 'warning', text: `${noHours.map(c => c.name.split(' ')[0]).join(', ')} sem apontamentos no período` })
    const avg = data.kpis.total_hours / (data.kpis.active_consultants || 1)
    const low = data.consultants.filter(c => c.total_hours > 0 && c.total_hours < avg * 0.5)
    if (low.length) alerts.push({ type: 'warning', text: `Baixa produtividade: ${low.map(c => c.name.split(' ')[0]).join(', ')} abaixo de 50% da média` })
    if (indConsultants.length > 1 && indConsultants[0]?.participation > 60)
      alerts.push({ type: 'danger', text: `${indConsultants[0].name.split(' ')[0]} concentra ${indConsultants[0].participation.toFixed(0)}% da receita — risco de dependência` })
    if (!alerts.length) alerts.push({ type: 'info', text: 'Nenhum alerta identificado no período' })
    return alerts
  }, [data, indConsultants])

  const handleRefresh = () => {
    load()
    if (activeTab === 'apontamentos') loadTimesheets()
    if (activeTab === 'despesas') loadExpenses()
    if (activeTab === 'indicadores') { setEvoLoaded(false); loadEvolution() }
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'consultores',  label: 'Fechamento',   icon: Users },
    { key: 'apontamentos', label: 'Apontamentos', icon: Clock },
    { key: 'despesas',     label: 'Despesas',      icon: Receipt },
    { key: 'indicadores',  label: 'Indicadores',  icon: BarChart2 },
  ]

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--brand-primary)' }}>
              Painel do Parceiro
            </p>
            {data ? (
              <h1 className="text-3xl font-bold text-white leading-tight">{data.partner.name}</h1>
            ) : (
              <div className="h-9 w-48 rounded-lg animate-pulse" style={{ background: 'var(--brand-surface)' }} />
            )}
            {data && (
              <p className="text-sm mt-1" style={{ color: 'var(--brand-subtle)' }}>{pricingLabel}</p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/[0.06] shrink-0"
            style={{ color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>

        {/* ── Filters ── */}
        <div
          className="rounded-xl p-4 flex flex-wrap gap-3 items-end"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          {/* Month navigator */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--brand-subtle)' }}>Período</label>
            <div className="flex items-center gap-1 rounded-lg border px-1.5 py-1" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-bg)' }}>
              <button onClick={prevMonth}
                className="p-1.5 rounded transition-colors hover:bg-white/[0.06]"
                style={{ color: 'var(--brand-muted)' }}>
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-white min-w-[148px] text-center select-none">
                {MONTHS[month]} {year}
              </span>
              <button onClick={nextMonth} disabled={isAtCurrentMonth}
                className="p-1.5 rounded transition-colors"
                style={{ color: isAtCurrentMonth ? 'var(--brand-border)' : 'var(--brand-muted)', cursor: isAtCurrentMonth ? 'not-allowed' : 'pointer' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {data && data.consultants.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--brand-subtle)' }}>Consultor</label>
              <select
                value={consultantId}
                onChange={e => setConsultantId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm bg-[#0A0A0B] border outline-none text-white"
                style={{ borderColor: 'var(--brand-border)' }}
              >
                <option value="">Todos</option>
                {data.consultants.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {consultantId && (
            <button
              onClick={() => setConsultantId('')}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
              style={{ color: 'var(--brand-subtle)' }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* ── KPIs ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : displayKpis ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={Clock}
              label="Total de Horas"
              value={formatNumber(displayKpis.total_hours)}
              sub={`${displayKpis.active_consultants} consultor${displayKpis.active_consultants !== 1 ? 'es' : ''} ativo${displayKpis.active_consultants !== 1 ? 's' : ''}`}
            />
            <KpiCard
              icon={DollarSign}
              label="Total a Receber"
              value={formatBRL(displayKpis.total_amount)}
              color="#22c55e"
            />
            <KpiCard
              icon={Users}
              label="Consultores"
              value={String(displayKpis.consultants_count)}
              sub={`${displayKpis.active_consultants} com horas no período`}
              color="#8B5CF6"
            />
            <KpiCard
              icon={TrendingUp}
              label="Ticket Médio"
              value={formatBRL(displayKpis.avg_ticket)}
              sub="por hora"
              color="#f59e0b"
            />
          </div>
        ) : null}

        {/* ── Tabs ── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--brand-border)' }}
        >
          {/* Tab bar */}
          <div
            className="flex border-b"
            style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
          >
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2"
                  style={{
                    color: active ? '#00F5FF' : 'var(--brand-subtle)',
                    borderColor: active ? '#00F5FF' : 'transparent',
                    background: active ? 'rgba(0,245,255,0.04)' : 'transparent',
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ── Consultores tab ── */}
          {activeTab === 'consultores' && (
            <div style={{ background: 'var(--brand-surface)' }}>
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--brand-border)' }}>
                <h2 className="text-sm font-semibold text-white">Consultores</h2>
                {data && (
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                    {data.consultants.length} consultor{data.consultants.length !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    {['Consultor', 'Horas', 'Valor/h', 'Total'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--brand-subtle)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                        {Array.from({ length: 4 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-24 rounded" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredConsultants.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                        Nenhum apontamento aprovado no período
                      </td>
                    </tr>
                  ) : (
                    filteredConsultants.map((c, idx) => (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: '1px solid var(--brand-border)',
                          background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}
                            >
                              {c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            {c.name}
                            {c.is_admin && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold ml-1"
                                style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
                              >
                                Admin
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white tabular-nums">
                          {formatNumber(c.total_hours)}h
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-subtle)' }}>
                          {formatBRL(c.hourly_rate)}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#00F5FF' }}>
                          {formatBRL(c.total_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && data && data.consultants.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--brand-border)', background: 'rgba(0,245,255,0.04)' }}>
                      <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Total</td>
                      <td className="px-4 py-3 font-bold text-white tabular-nums">{formatNumber(data.kpis.total_hours)}h</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--brand-subtle)' }}>Ticket médio: {formatBRL(data.kpis.avg_ticket)}/h</td>
                      <td className="px-4 py-3 font-bold tabular-nums" style={{ color: '#00F5FF' }}>{formatBRL(data.kpis.total_amount)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* ── Apontamentos tab ── */}
          {activeTab === 'apontamentos' && (
            <div style={{ background: 'var(--brand-surface)' }}>
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--brand-border)' }}>
                <h2 className="text-sm font-semibold text-white">Apontamentos da Equipe</h2>
                <div className="flex items-center gap-3">
                  {!tsLoading && (
                    <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                      {timesheets.length} registro{timesheets.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    onClick={() => setNewTsOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{ background: 'rgba(0,245,255,0.10)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.25)' }}
                  >
                    <Plus size={12} />
                    Incluir
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    {['Consultor', 'Data', 'Projeto', 'Horas', 'Status', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : timesheets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                        Nenhum apontamento no período
                      </td>
                    </tr>
                  ) : (
                    timesheets.map((t, idx) => {
                      const isOwn = (t.user_id ?? t.user?.id) === user?.id
                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: '1px solid var(--brand-border)',
                            background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                          }}
                        >
                          <td className="px-4 py-3 font-medium text-white">
                            <div className="flex items-center gap-2">
                              {t.user && (
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}
                                >
                                  {(t.user.name ?? '').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                                </div>
                              )}
                              <span>{t.user?.name ?? '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-subtle)' }}>
                            {new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-white max-w-[200px] truncate">
                            {t.project?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-white">
                            {t.effort_hours}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_COLORS[t.status] ?? 'bg-white/10 text-white'}`}>
                              {t.status_display}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <RowMenu
                              isOwn={isOwn}
                              onView={() => openTimesheetModal(t.id)}
                              onEdit={() => router.push(`/timesheets/${t.id}/edit`)}
                              onDelete={() => deleteTimesheet(t.id)}
                            />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Despesas tab ── */}
          {activeTab === 'despesas' && (
            <div style={{ background: 'var(--brand-surface)' }}>
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--brand-border)' }}>
                <h2 className="text-sm font-semibold text-white">Despesas da Equipe</h2>
                {!expLoading && (
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                    {expenses.length} registro{expenses.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    {['Consultor', 'Data', 'Projeto', 'Descrição', 'Valor', 'Status', 'Pagamento', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                        Nenhuma despesa no período
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e, idx) => {
                      const isOwnExp = (e.user_id ?? e.user?.id) === user?.id
                      const canEditExp = isOwnExp && ['pending', 'rejected', 'adjustment_requested'].includes(e.status)
                      return (
                      <tr
                        key={e.id}
                        style={{
                          borderBottom: '1px solid var(--brand-border)',
                          background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            {e.user && (
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}
                              >
                                {(e.user.name ?? '').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                              </div>
                            )}
                            <span>{e.user?.name ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-subtle)' }}>
                          {new Date(e.expense_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-white max-w-[160px] truncate">
                          {e.project?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate" style={{ color: 'var(--brand-subtle)' }}>
                          {e.description}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#22c55e' }}>
                          {e.formatted_amount ?? formatBRL(e.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_COLORS[e.status] ?? 'bg-white/10 text-white'}`}>
                            {e.status_display}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {e.is_paid
                            ? <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-400">Pago</span>
                            : <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-400">Em aberto</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <RowMenu
                            isOwn={canEditExp}
                            onView={() => openExpenseModal(e.id)}
                            onEdit={() => router.push('/expenses')}
                          />
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
                {!expLoading && expenses.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--brand-border)', background: 'rgba(34,197,94,0.04)' }}>
                      <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Total</td>
                      <td className="px-4 py-3 font-bold tabular-nums" style={{ color: '#22c55e' }}>
                        {formatBRL(expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* ── Indicadores tab ── */}
          {activeTab === 'indicadores' && (
            <div className="p-5 space-y-6" style={{ background: 'var(--brand-surface)' }}>

              {!data ? (
                <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--brand-subtle)' }}>
                  <Clock size={14} className="animate-spin mr-2" /> Carregando...
                </div>
              ) : (
                <>
                  {/* 2. Performance por Consultor */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--brand-subtle)' }}>Performance por Consultor</p>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand-border)' }}>
                            {['Consultor', 'Horas', 'Receita', 'Ticket Médio', '% Participação'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {indConsultants.map((c, idx) => (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--brand-border)', background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {idx === 0 && <span className="text-xs">🥇</span>}
                                  {idx === 1 && <span className="text-xs">🥈</span>}
                                  {idx === 2 && <span className="text-xs">🥉</span>}
                                  {idx > 2 && (
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                                      style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>
                                      {idx + 1}
                                    </div>
                                  )}
                                  <span className="font-medium text-white">{c.name}</span>
                                  {c.is_admin && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>Admin</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 tabular-nums text-white">{formatNumber(c.total_hours)}h</td>
                              <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: '#22c55e' }}>{formatBRL(c.total_amount)}</td>
                              <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{formatBRL(c.hourly_rate)}/h</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${c.participation}%`, background: '#00F5FF' }} />
                                  </div>
                                  <span className="text-xs tabular-nums font-medium text-white min-w-[36px] text-right">{c.participation.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 3. Distribuição */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Por Consultor */}
                    <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[11px] uppercase tracking-widest font-semibold mb-4" style={{ color: 'var(--brand-subtle)' }}>Receita por Consultor</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={indConsultants.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                          <XAxis type="number" tickFormatter={v => formatBRL(v)} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} width={80}
                            tickFormatter={v => v.split(' ')[0]} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: 'transparent' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: any) => [formatBRL(v ?? 0), "Receita"]}
                            labelStyle={{ color: '#fff' }}
                          />
                          <Bar dataKey="total_amount" fill="#00F5FF" radius={[0, 4, 4, 0]} opacity={0.85} background={{ fill: 'transparent' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Por Projeto */}
                    <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[11px] uppercase tracking-widest font-semibold mb-4" style={{ color: 'var(--brand-subtle)' }}>Distribuição por Projeto</p>
                      {tsLoading ? (
                        <div className="flex items-center justify-center h-[200px] text-xs" style={{ color: 'var(--brand-subtle)' }}>
                          <Clock size={12} className="animate-spin mr-2" /> Carregando...
                        </div>
                      ) : projectDist.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-xs" style={{ color: 'var(--brand-subtle)' }}>Sem dados</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={projectDist} layout="vertical" margin={{ left: 0, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                            <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} width={90}
                              tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} axisLine={false} tickLine={false} />
                            <Tooltip
                              cursor={{ fill: 'transparent' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                              formatter={(v: any) => [`${Number(v ?? 0).toFixed(1)}%`, 'Participação']}
                              labelStyle={{ color: '#fff' }}
                            />
                            <Bar dataKey="participation" fill="#8B5CF6" radius={[0, 4, 4, 0]} opacity={0.85} background={{ fill: 'transparent' }} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* 4. Evolução mensal */}
                  <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                    <p className="text-[11px] uppercase tracking-widest font-semibold mb-4" style={{ color: 'var(--brand-subtle)' }}>Evolução — Últimos 6 Meses</p>
                    {evoLoading ? (
                      <div className="flex items-center justify-center h-[200px] text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        <Clock size={12} className="animate-spin mr-2" /> Carregando evolução...
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={evoData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="h" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false}
                            tickFormatter={v => `${v}h`} width={36} />
                          <YAxis yAxisId="r" orientation="right" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false}
                            tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={44} />
                          <Tooltip
                            cursor={{ fill: 'transparent' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: any, name: any) => [name === 'horas' ? `${formatNumber(v ?? 0)}h` : formatBRL(v ?? 0), name === 'horas' ? 'Horas' : 'Receita']}
                            labelStyle={{ color: '#fff' }}
                          />
                          <Legend formatter={v => v === 'horas' ? 'Horas' : 'Receita'} wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
                          <Line yAxisId="h" type="monotone" dataKey="horas" stroke="#00F5FF" strokeWidth={2} dot={{ r: 3, fill: '#00F5FF' }} activeDot={{ r: 5 }} />
                          <Line yAxisId="r" type="monotone" dataKey="receita" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* 5. Eficiência */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--brand-subtle)' }}>Eficiência Operacional</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {indEfficiency ? [
                        {
                          icon: Zap, color: '#f59e0b',
                          label: 'Média por Apontamento',
                          value: `${Math.floor(indEfficiency.avgPerEntry / 60)}h${String(Math.round(indEfficiency.avgPerEntry % 60)).padStart(2, '0')}`,
                          sub: `${indEfficiency.entries} apontamentos`,
                        },
                        {
                          icon: Activity, color: '#00F5FF',
                          label: 'Horas por Dia Útil',
                          value: `${formatNumber(indEfficiency.hoursPerDay)}h`,
                          sub: `${indEfficiency.businessDays} dias úteis no mês`,
                        },
                        {
                          icon: TrendingUp, color: '#22c55e',
                          label: 'Total de Horas Faturadas',
                          value: `${formatNumber(data.kpis.total_hours)}h`,
                          sub: `${data.kpis.active_consultants} consultor${data.kpis.active_consultants !== 1 ? 'es' : ''} ativo${data.kpis.active_consultants !== 1 ? 's' : ''}`,
                        },
                      ].map(e => (
                        <div key={e.label} className="rounded-xl p-4 flex items-start gap-3"
                          style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                            style={{ background: `${e.color}18` }}>
                            <e.icon size={15} style={{ color: e.color }} />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{e.label}</p>
                            <p className="text-lg font-bold text-white">{e.value}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{e.sub}</p>
                          </div>
                        </div>
                      )) : (
                        <div className="col-span-3 text-xs py-4 text-center" style={{ color: 'var(--brand-subtle)' }}>
                          {tsLoading ? <><Clock size={12} className="animate-spin inline mr-1" /> Carregando...</> : 'Sem dados de apontamentos no período'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 6. Alertas Inteligentes */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--brand-subtle)' }}>Alertas &amp; Insights</p>
                    <div className="space-y-2">
                      {indAlerts.map((a, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl"
                          style={{
                            background: a.type === 'danger' ? 'rgba(239,68,68,0.07)' : a.type === 'warning' ? 'rgba(245,158,11,0.07)' : 'rgba(0,245,255,0.05)',
                            border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.2)' : a.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(0,245,255,0.15)'}`,
                          }}>
                          <AlertTriangle size={14} className="shrink-0 mt-0.5"
                            style={{ color: a.type === 'danger' ? '#ef4444' : a.type === 'warning' ? '#f59e0b' : '#00F5FF' }} />
                          <p className="text-sm" style={{ color: a.type === 'danger' ? '#fca5a5' : a.type === 'warning' ? '#fcd34d' : 'var(--brand-muted)' }}>
                            {a.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Modals */}
      <TimesheetFormModal
        open={newTsOpen}
        onClose={() => setNewTsOpen(false)}
        onSaved={() => { setTsLoaded(false); loadTimesheets() }}
        currentUser={user}
      />
      {viewTs && (
        <TimesheetViewModal
          ts={viewTs}
          onClose={() => setViewTs(null)}
          onEdit={viewTs.user_id === user?.id
            ? () => { setViewTs(null); router.push(`/timesheets/${viewTs.id}/edit`) }
            : undefined}
        />
      )}
      {viewExp && (
        <ExpenseViewModal
          expense={viewExp}
          onClose={() => setViewExp(null)}
          onEdit={viewExp.user_id === user?.id && ['pending', 'rejected', 'adjustment_requested'].includes(viewExp.status)
            ? () => { setViewExp(null); router.push(`/expenses`) }
            : undefined}
        />
      )}
    </AppLayout>
  )
}
