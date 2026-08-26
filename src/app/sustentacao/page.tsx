'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sanitizeHtml, previewText } from '@/lib/sanitize'
import { AppLayout } from '@/components/layout/app-layout'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import type { PortalDate } from '@/lib/portal-date'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  AlertTriangle, CheckCircle, Clock, TrendingUp, Users, DollarSign,
  Activity, BarChart2, List, Shield, Globe, Zap, RefreshCw, Wrench, Gauge,
  ChevronDown, Check, CheckSquare, X as CloseIcon, Eye, FileText,
} from 'lucide-react'
import { TimesheetsScreen }            from '@/components/screens/TimesheetsScreen'
import { ExpensesScreen }              from '@/components/screens/ExpensesScreen'
import { ApprovalsScreen }             from '@/components/screens/ApprovalsScreen'
import { AuditoriaApontamentosScreen } from '@/components/screens/AuditoriaApontamentosScreen'
import RentabilidadePage              from '@/app/relatorios/rentabilidade/page'
import { SkeletonTable, CardsSkeleton, InlineLoader } from '@/components/ui/loading'
import { KpiAA, AgingBars, HBarTopN, DonutTipo, VariationBadge } from '@/components/sustentacao/status-widgets'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  total_open: number
  new_today: number
  resolved_period: number
  closed_period: number
  sla_response_rate: number | null
  sla_solution_rate: number | null
  open_at_risk: number
  avg_solution_time: number | null
  period: { from: string; to: string }
}

interface ContextStats {
  tickets_open: number
  tickets_resolved: number
  sla_breached: number
  sla_at_risk: number
  sla_rate: number | null
  avg_solution_min: number | null
  oldest_open_days: number | null
  over_4h: number
  hours_worked_min: number | null
  productivity: number | null
  by_consultant: { name: string; email: string; total_open: number; in_attendance: number; sla_breached: number; sla_ok_pct: number }[]
  by_client: { name: string; total_open: number; in_attendance: number; sla_breached: number }[]
  filter: { responsavel: string[]; cliente: string[] }
}

interface QueueTicket {
  id: number
  ticket_id: number
  titulo: string
  status: string | null
  base_status: string
  urgencia: string
  categoria: string
  owner_team: string
  sla_solution_date: string | null
  created_date: string | null
  user: { id: number; name: string } | null
  customer: { id: number; name: string } | null
  solicitante: { organization?: string; name?: string; email?: string; [k: string]: unknown } | null
  responsavel: { name?: string; [k: string]: unknown } | null
  owner_email: string | null
  org_name: string | null
}

interface SlaData {
  by_urgency: { urgencia: string; total: number; on_time_response: number; on_time_solution: number }[]
  breaching_now: QueueTicket[]
  monthly_trend: { month: string; total: number; on_time: number }[]
}

interface ProductivityData {
  by_consultant: { owner_email: string; owner_name: string | null; tickets_resolved: number; avg_solution_minutes: number; total_minutes_worked: number }[]
  period: { from: string; to: string }
}

interface FinancialData {
  by_project: { project_id: number; project_name: string; sold_hours: number; customer_name: string; total_minutes: number; ticket_count: number }[]
  period: { from: string; to: string }
}

interface ClientData {
  by_client: { customer_id: number; total_period: number; open_now: number; sla_ok: number; avg_solution_minutes: number; customer: { id: number; name: string } | null }[]
  period: { from: string; to: string }
}

interface DistributionData {
  by_urgency: { label: string; count: number }[]
  by_category: { label: string; count: number }[]
  by_service: { label: string; count: number }[]
  by_team: { label: string; count: number }[]
  by_base_status: { label: string; count: number }[]
  by_origin: { label: string; count: number }[]
}

interface EvolutionData {
  monthly: { month: string; total: number; resolved: number; sla_ok: number }[]
}

interface DebugClienteRow {
  org: string | null
  cnpj_movidesk: string | null
  is_active: boolean | null
  tickets: number
  vinculados: number
  match: 'cnpj' | 'nome' | 'nao'
  minutor_name: string | null
  minutor_cgc: string | null
}

interface DebugResponsavelRow {
  owner_email: string
  owner_name: string | null
  team: string | null
  is_active: boolean
  last_ticket_at: string | null
  tickets: number
  vinculados: number
  match: 'encontrado' | 'nao'
  minutor_name: string | null
  minutor_id: number | null
}

interface ExecutiveData {
  pct_critical: number
  pct_stopped: number
  sla_breach_pct: number | null
  avg_resolution_hours: number | null
  lead_time_avg_hours: number | null
  aging: { d0_3: number; d4_7: number; d8_15: number; d15_plus: number }
  pct_hours_consumed: number | null
  total_sold_h: number
  total_used_h: number
  hours_per_ticket: number | null
  top_clients: { name: string; used_h: number; sold_h: number; pct: number | null }[]
  by_category: { label: string; count: number }[]
  by_urgency: { label: string; count: number }[]
  period: { from: string; to: string }
}

// Bloco canônico do "Status de Suporte" (vem dentro de /executive?compare=yoy → r.status)
interface StatusWindow {
  created: number
  resolved: number
  sla: { rate: number | null; num: number; den: number }
  resolution_median_hours: number | null
  hours: number
}
interface StatusData {
  current: StatusWindow
  previous: StatusWindow | null
  variation: {
    created_pct: number | null; resolved_pct: number | null; sla_pp: number | null
    resolution_hours_abs: number | null; resolution_pct: number | null; hours_pct: number | null
  } | null
  state: {
    new_in_attendance: number; stopped_internal: number; open_operational: number; waiting_client: number
    sla_breached_now: number; aging: { d0_3: number; d4_7: number; d8_15: number; d15_plus: number }
  }
  distribution: {
    by_categoria: { label: string; count: number }[]
    by_servico: { top: { label: string; count: number }[]; others: number; others_count: number; total: number }
    sla_by_priority: { urgencia: string; den: number; num: number; rate: number | null }[]
  }
  effort_per_resolved_hours: number | null
  hours_by_dimension_available: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CYAN   = 'var(--primary)'
const GREEN  = '#22c55e'
const YELLOW = '#eab308'
const RED    = '#ef4444'
const PURPLE = '#a855f7'
const BLUE   = '#3b82f6'
const ORANGE = '#f97316'

const PIE_COLORS = [CYAN, GREEN, YELLOW, PURPLE, BLUE, ORANGE, RED, '#ec4899', '#14b8a6']

const STATUS_LABEL: Record<string, string> = {
  New: 'Novo', InAttendance: 'Em Atendimento', Stopped: 'Parado',
  Resolved: 'Resolvido', Closed: 'Fechado', Canceled: 'Cancelado',
}

const TABS = [
  { id: 'status',       label: 'Status de Suporte', icon: Gauge },
  { id: 'kpis',         label: 'Visão Executiva',   icon: Activity },
  { id: 'queue',        label: 'Fila Operacional',  icon: List },
  { id: 'indicadores',  label: 'Indicadores',       icon: BarChart2 },
  { id: 'sla',          label: 'SLA',               icon: Shield },
  { id: 'productivity', label: 'Produtividade',     icon: Users },
  { id: 'financial',    label: 'Financeiro',        icon: DollarSign },
  { id: 'clients',      label: 'Por Cliente',       icon: Globe },
  { id: 'distribution', label: 'Distribuição',      icon: BarChart2 },
  { id: 'evolution',    label: 'Evolução',           icon: TrendingUp },
  { id: 'debug',        label: 'Diagnóstico',        icon: Wrench },
]

const ROUTINE_TABS = [
  { id: 'timesheets', label: 'Apontamentos', icon: Clock,          desc: 'Horas lançadas em projetos de sustentação' },
  { id: 'expenses',   label: 'Despesas',     icon: DollarSign,     desc: 'Reembolsos e despesas dos projetos'        },
  { id: 'approvals',  label: 'Aprovações',   icon: CheckSquare,    desc: 'Apontamentos/despesas pendentes'           },
  { id: 'auditoria',  label: 'Auditoria',    icon: FileText,       desc: 'Histórico de alterações de apontamentos'   },
  { id: 'triagem',    label: 'Lançamentos não identificados', icon: AlertTriangle, desc: 'Apontamentos atribuídos ao Usuário/Cliente/Projeto Padrão (revisão manual)' },
  { id: 'rentabilidade', label: 'Rentabilidade', icon: TrendingUp, desc: 'Receita, custo e margem por consultor × projeto' },
] as const

type RoutineTabId = typeof ROUTINE_TABS[number]['id']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(min: number | null | undefined): string {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

function clienteMovidesk(t: QueueTicket): string {
  return t.org_name ?? t.customer?.name ?? '—'
}

function fmtDate(dt: string | null | undefined): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function isOverdue(dt: string | null | undefined): boolean {
  if (!dt) return false
  return new Date(dt) < new Date()
}

function urgencyColor(u: string): string {
  if (u === 'Urgente') return RED
  if (u === 'Alta') return ORANGE
  if (u === 'Normal') return CYAN
  return '#71717a'
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType
}) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        {Icon && <Icon size={16} style={{ color: color ?? CYAN }} />}
      </div>
      <span className="text-2xl font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</span>
      {sub && <span className="text-xs text-[var(--text-light)]">{sub}</span>}
    </div>
  )
}

// ─── Debug Clientes Tab ───────────────────────────────────────────────────────

function DebugClientesTab({ rows, onSync }: { rows: DebugClienteRow[]; onSync: () => Promise<void> }) {
  const [search, setSearch]           = useState('')
  const [matchFilter, setMatchFilter] = useState<'all' | 'cnpj' | 'nome' | 'nao'>('all')
  const [cnpjFilter, setCnpjFilter]   = useState<'all' | 'com' | 'sem'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all')
  const [syncing, setSyncing]           = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  const filtered = rows.filter(row => {
    if (statusFilter === 'ativo'   && !row.is_active) return false
    if (statusFilter === 'inativo' &&  row.is_active) return false
    if (matchFilter !== 'all' && row.match !== matchFilter) return false
    if (cnpjFilter === 'com' && !row.cnpj_movidesk) return false
    if (cnpjFilter === 'sem' && row.cnpj_movidesk) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(row.org ?? '').toLowerCase().includes(q) && !(row.minutor_name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const matchCounts = {
    all:  rows.length,
    cnpj: rows.filter(r => r.match === 'cnpj').length,
    nome: rows.filter(r => r.match === 'nome').length,
    nao:  rows.filter(r => r.match === 'nao').length,
  }

  const MATCH_OPTIONS: { key: 'all' | 'cnpj' | 'nome' | 'nao'; label: string; color: string }[] = [
    { key: 'all',  label: `Todos (${matchCounts.all})`,        color: 'var(--text-light)' },
    { key: 'cnpj', label: `✓ CNPJ (${matchCounts.cnpj})`,     color: 'var(--success-border)' },
    { key: 'nome', label: `~ Nome (${matchCounts.nome})`,      color: 'var(--warning-border)' },
    { key: 'nao',  label: `✗ Não vinc. (${matchCounts.nao})`,  color: 'var(--danger-border)' },
  ]

  const statusCounts = {
    all:     rows.length,
    ativo:   rows.filter(r => r.is_active === true).length,
    inativo: rows.filter(r => r.is_active === false).length,
  }
  const STATUS_OPTIONS: { key: 'all' | 'ativo' | 'inativo'; label: string; color: string }[] = [
    { key: 'all',     label: `Todos (${statusCounts.all})`,          color: 'var(--text-light)' },
    { key: 'ativo',   label: `Ativo (${statusCounts.ativo})`,        color: 'var(--success-border)' },
    { key: 'inativo', label: `Inativo (${statusCounts.inativo})`,    color: 'var(--danger-border)' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)]">Comparativo Clientes: Movidesk × Minutor</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">{filtered.length} de {rows.length} organizações</span>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
            {syncing ? '⏳ Integrando...' : '⚡ Integrar agora'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar organização..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-transparent outline-none"
          style={{ border: '1px solid var(--border)', color: 'var(--text)', width: 200 }}
        />

        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: statusFilter === opt.key ? 'var(--surface-hover)' : 'transparent', color: statusFilter === opt.key ? opt.color : 'var(--text-light)' }}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {MATCH_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setMatchFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: matchFilter === opt.key ? 'var(--surface-hover)' : 'transparent', color: matchFilter === opt.key ? opt.color : 'var(--text-light)' }}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {([['all', 'Todos CNPJ'], ['com', 'Com CNPJ'], ['sem', 'Sem CNPJ']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setCnpjFilter(v)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: cnpjFilter === v ? 'var(--primary-soft)' : 'transparent', color: cnpjFilter === v ? CYAN : 'var(--text-light)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">Organização Movidesk</th>
              <th className="text-center px-3 py-2.5 text-[var(--text-muted)] font-medium">Status</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">CNPJ Movidesk</th>
              <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">Tickets</th>
              <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">Vinculados</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">Cliente no Minutor</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">CNPJ Minutor</th>
              <th className="text-center px-3 py-2.5 text-[var(--text-muted)] font-medium">Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const matchColor = row.match === 'cnpj' ? 'var(--success-border)' : row.match === 'nome' ? 'var(--warning-border)' : 'var(--danger-border)'
              const matchLabel = row.match === 'cnpj' ? '✓ CNPJ' : row.match === 'nome' ? '~ Nome' : '✗ Não'
              return (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'var(--surface-sunken)' }}>
                  <td className="px-3 py-2 text-[var(--text)]">{row.org ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {row.is_active === null
                      ? <span className="text-[var(--text-muted)] text-[10px]">—</span>
                      : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: row.is_active ? 'var(--success-bg)' : 'var(--danger-bg)', color: row.is_active ? 'var(--success-border)' : 'var(--danger-border)' }}>{row.is_active ? 'Ativo' : 'Inativo'}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--text-muted)]">
                    {row.cnpj_movidesk
                      ? row.cnpj_movidesk
                      : row.match === 'nao'
                        ? <span className="text-[var(--text-light)] italic text-[10px]">sem CNPJ — dept?</span>
                        : <span className="text-[var(--danger)] italic">vazio</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--text)]">{row.tickets}</td>
                  <td className="px-3 py-2 text-right" style={{ color: row.vinculados === row.tickets ? 'var(--success-border)' : row.vinculados > 0 ? 'var(--warning-border)' : 'var(--danger-border)' }}>{row.vinculados}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{row.minutor_name ?? <span className="text-[var(--text-muted)] italic">—</span>}</td>
                  <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{row.minutor_cgc ?? <span className="text-[var(--text-muted)] italic">—</span>}</td>
                  <td className="px-3 py-2 text-center font-semibold" style={{ color: matchColor }}>{matchLabel}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--text-muted)]">Nenhum resultado para os filtros selecionados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Debug Responsáveis Tab ───────────────────────────────────────────────────

function DebugResponsaveisTab({ rows, onSync }: { rows: DebugResponsavelRow[]; onSync: () => Promise<void> }) {
  const [search, setSearch]           = useState('')
  const [matchFilter, setMatchFilter] = useState<'all' | 'encontrado' | 'nao'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all')
  const [syncing, setSyncing]         = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  const filtered = rows.filter(row => {
    if (matchFilter !== 'all' && row.match !== matchFilter) return false
    if (statusFilter === 'ativo'   && !row.is_active) return false
    if (statusFilter === 'inativo' &&  row.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !row.owner_email.toLowerCase().includes(q) &&
        !(row.owner_name ?? '').toLowerCase().includes(q) &&
        !(row.minutor_name ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const found    = rows.filter(r => r.match === 'encontrado').length
  const notFound = rows.filter(r => r.match === 'nao').length
  const ativos   = rows.filter(r => r.is_active).length
  const inativos = rows.filter(r => !r.is_active).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)]">Responsáveis por Ticket: Movidesk × Minutor</h2>
        <div className="flex items-center gap-3">
          {syncing && <span className="text-xs text-[var(--primary)]">⏳ Rodando em background...</span>}
          <span className="text-xs text-[var(--text-muted)]">{filtered.length} de {rows.length} responsáveis</span>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
            {syncing ? '⏳ Aguardando...' : '⚡ Integrar agora'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-transparent outline-none"
          style={{ border: '1px solid var(--border)', color: 'var(--text)', width: 220 }}
        />
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {([
            { key: 'all',        label: `Todos (${rows.length})`,         color: 'var(--text-light)' },
            { key: 'encontrado', label: `✓ No Minutor (${found})`,        color: 'var(--success-border)' },
            { key: 'nao',        label: `✗ Não encontrado (${notFound})`, color: 'var(--danger-border)' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setMatchFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: matchFilter === opt.key ? 'var(--surface-hover)' : 'transparent', color: matchFilter === opt.key ? opt.color : 'var(--text-light)' }}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {([
            { key: 'all',     label: `Todos`,              color: 'var(--text-light)' },
            { key: 'ativo',   label: `● Ativo (${ativos})`,   color: 'var(--success-border)' },
            { key: 'inativo', label: `● Inativo (${inativos})`, color: 'var(--danger-border)' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: statusFilter === opt.key ? 'var(--surface-hover)' : 'transparent', color: statusFilter === opt.key ? opt.color : 'var(--text-light)' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">Nome Movidesk</th>
              <th className="text-center px-3 py-2.5 text-[var(--text-muted)] font-medium">Status</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">Email Movidesk</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">Equipe</th>
              <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">Tickets</th>
              <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">Vinculados</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">Nome no Minutor</th>
              <th className="text-center px-3 py-2.5 text-[var(--text-muted)] font-medium">Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const matchColor = row.match === 'encontrado' ? '#22c55e' : '#ef4444'
              const matchLabel = row.match === 'encontrado' ? '✓ Encontrado' : '✗ Não'
              return (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'var(--surface-sunken)' }}>
                  <td className="px-3 py-2 text-[var(--text)]">{row.owner_name ?? '—'}</td>
                  <td className="px-3 py-2 text-center" title={row.last_ticket_at ? `Último ticket: ${row.last_ticket_at}` : undefined}>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: row.is_active ? 'var(--success-bg)' : 'var(--danger-bg)', color: row.is_active ? 'var(--success-border)' : 'var(--danger-border)' }}>
                      {row.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{row.owner_email}</td>
                  <td className="px-3 py-2 text-[var(--text-light)]">{row.team ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-[var(--text)]">{row.tickets}</td>
                  <td className="px-3 py-2 text-right" style={{ color: row.vinculados === row.tickets ? 'var(--success-border)' : row.vinculados > 0 ? 'var(--warning-border)' : 'var(--danger-border)' }}>{row.vinculados}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{row.minutor_name ?? <span className="text-[var(--text-muted)] italic">—</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${matchColor}18`, color: matchColor }}>{matchLabel}</span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--text-muted)] text-xs">Nenhum resultado para os filtros selecionados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <h3 className="text-sm font-semibold text-[var(--text)] mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ─── Diagnóstico Tab (wrapper com sub-abas) ────────────────────────────────────

function DiagnosticoTab({
  debugClientes,
  debugResponsaveis,
  loading,
  loadError,
  onSyncClientes,
  onSyncResponsaveis,
}: {
  debugClientes: { rows: DebugClienteRow[] } | null
  debugResponsaveis: { rows: DebugResponsavelRow[] } | null
  loading: boolean
  loadError: string | null
  onSyncClientes: () => Promise<void>
  onSyncResponsaveis: () => Promise<void>
}) {
  const [sub, setSub] = useState<'empresas' | 'usuarios'>('empresas')

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {([['empresas', 'Empresas'], ['usuarios', 'Usuários']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: sub === id ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: sub === id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Empresas */}
      {sub === 'empresas' && (
        loading && !debugClientes
          ? <SkeletonTable rows={8} cols={5} />
          : debugClientes
            ? <DebugClientesTab rows={debugClientes.rows} onSync={onSyncClientes} />
            : null
      )}

      {/* Usuários */}
      {sub === 'usuarios' && (
        loading && !debugResponsaveis
          ? <SkeletonTable rows={8} cols={5} />
          : loadError && !debugResponsaveis
            ? <div className="rounded-xl border border-red-900/40 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">{loadError}</div>
            : debugResponsaveis
              ? <DebugResponsaveisTab rows={debugResponsaveis.rows} onSync={onSyncResponsaveis} />
              : null
      )}
    </div>
  )
}

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ label, options, selected, onChange, placeholder = 'Buscar...' }: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])

  const triggerLabel = selected.length === 0
    ? 'Todos'
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} selecionados`

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-[10px] text-[var(--text-light)] font-medium uppercase tracking-wide">{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-xs rounded-lg px-2.5 py-1.5 border outline-none flex items-center justify-between gap-2"
        style={{ background: 'var(--surface)', borderColor: selected.length > 0 ? 'var(--primary)' : 'var(--border)', color: 'var(--text)', minWidth: 160 }}>
        <span style={{ color: selected.length > 0 ? 'var(--primary)' : 'var(--text)' }}>{triggerLabel}</span>
        <ChevronDown size={12} className="text-[var(--text-light)] shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-lg border shadow-xl flex flex-col"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', minWidth: 220, maxHeight: 320 }}>
          <div className="p-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <input autoFocus type="text" placeholder={placeholder}
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded outline-none"
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: 'none' }} />
          </div>
          <div className="overflow-y-auto">
            {filtered.length > 0 && (() => {
              const vals = filtered.map(o => o.value)
              const allSel = vals.every(v => selected.includes(v))
              return (
                <button type="button"
                  onClick={() => allSel
                    ? onChange(selected.filter(v => !vals.includes(v)))
                    : onChange(Array.from(new Set([...selected, ...vals])))}
                  className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--primary)', borderBottom: '1px solid var(--border)' }}>
                  <span className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border"
                    style={{ borderColor: 'var(--primary)', background: allSel ? 'var(--primary)' : 'var(--surface)' }}>
                    {allSel && <Check size={9} color="var(--primary-fg)" strokeWidth={3} />}
                  </span>
                  {allSel ? 'Desmarcar todos' : 'Selecionar todos'}{search ? ' (filtrados)' : ''}
                </button>
              )
            })()}
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                Limpar seleção
              </button>
            )}
            {filtered.map(opt => {
              const checked = selected.includes(opt.value)
              return (
                <button type="button" key={opt.value} onClick={() => toggle(opt.value)}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-hover)]"
                  style={{ color: checked ? 'var(--primary)' : 'var(--text)', fontWeight: checked ? 500 : 400 }}>
                  <span className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border"
                    style={{ borderColor: checked ? 'var(--primary)' : 'var(--border-strong)', background: checked ? 'var(--primary)' : 'var(--surface)' }}>
                    {checked && <Check size={9} color="var(--primary-fg)" strokeWidth={3} />}
                  </span>
                  {opt.label}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-[var(--text-light)] text-center">Nenhum resultado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DrillTicketTable({ tickets }: { tickets: QueueTicket[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-sunken)' }}>
        <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-sunken)' }}>
          {['#', 'Título', 'Urgência', 'Status', 'Cliente', 'Responsável', 'SLA Solução'].map(h => (
            <th key={h} className="px-4 py-2 text-left font-medium text-[var(--text-light)]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tickets.map((t, i) => (
          <tr key={t.id} className="border-b hover:bg-[var(--surface-hover)] transition-colors"
            style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-sunken)' }}>
            <td className="px-4 py-2 font-mono">
              <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                className="text-[var(--primary)] hover:text-[var(--primary)] hover:underline">{t.ticket_id}</a>
            </td>
            <td className="px-4 py-2 text-[var(--text)] max-w-[240px] truncate">
              <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                className="hover:text-[var(--primary)] hover:underline">{t.titulo ?? '—'}</a>
            </td>
            <td className="px-4 py-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                style={{ background: `${urgencyColor(t.urgencia)}22`, color: urgencyColor(t.urgencia) }}>
                {t.urgencia ?? '—'}
              </span>
            </td>
            <td className="px-4 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[var(--text)]">{t.status ?? STATUS_LABEL[t.base_status] ?? t.base_status}</span>
                {t.status && <span className="text-[10px] text-[var(--text-light)]">{STATUS_LABEL[t.base_status] ?? t.base_status}</span>}
              </div>
            </td>
            <td className="px-4 py-2 text-[var(--text)] max-w-[140px] truncate">{clienteMovidesk(t)}</td>
            <td className="px-4 py-2 text-[var(--text)]">{t.responsavel?.name ?? t.user?.name ?? '—'}</td>
            <td className="px-4 py-2">
              <span style={{ color: isOverdue(t.sla_solution_date) ? RED : 'var(--text)' }}>{fmtDate(t.sla_solution_date)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SustentacaoPage() {
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const isAdmin = user.type === 'admin'
    const isSustentacaoCoord = user.type === 'coordenador' && user.coordinator_type === 'sustentacao'
    if (!isAdmin && !isSustentacaoCoord) router.replace('/dashboard')
  }, [user, router])

  const [tab, setTab]         = useState('status')

  // Centralzinha de rotinas (independente das tabs de indicadores).
  // null = mostra indicadores; setado = mostra a tela completa da rotina.
  const [routineTab, setRoutineTab] = useState<RoutineTabId | null>(null)

  // ─── Rotinas embarcadas: apontamentos / despesas / aprovações ───────────────
  const [routineRows, setRoutineRows] = useState<any[]>([])
  const [routineTotal, setRoutineTotal] = useState(0)
  const [routineLoading, setRoutineLoading] = useState(false)
  const [routineDetail, setRoutineDetail] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterMode, setFilterMode] = useState<'month' | 'period'>('month')

  const now = new Date()
  const [refMonth, setRefMonth] = useState<number | null>(now.getMonth() + 1)
  const [refYear,  setRefYear]  = useState<number | null>(now.getFullYear())
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  // As abas Apontamentos/Despesas/Aprovações/Auditoria agora renderizam as telas
  // completas do menu (TimesheetsScreen/ExpensesScreen/etc.) com scope='sustentacao',
  // que fazem o próprio fetch. O fetch legado em /sustentacao/{tab} foi descontinuado.

  // Computa from/to a partir do modo ativo
  const from = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-01`
    : dateFrom
  const to = filterMode === 'month' && refMonth && refYear
    ? new Date(refYear, refMonth, 0).toISOString().split('T')[0]
    : dateTo

  // Período (mês-a-mês) repassado ao report de Rentabilidade embutido, derivado do filtro do portal.
  const rentabPeriodo = useMemo(() => {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return { fromM: fm, fromY: fy, toM: tm, toY: ty }
  }, [from, to])

  // Filtro de data DE CIMA repassado às telas embedded — elas escondem o próprio (um filtro só).
  const portalDate: PortalDate = { mode: filterMode, month: refMonth, year: refYear, from: dateFrom, to: dateTo }

  const [queueFilterResp,      setQueueFilterResp]      = useState<string[]>([])
  const [queueFilterCliente,   setQueueFilterCliente]   = useState<string[]>([])
  const [queueFilterUrgencia,  setQueueFilterUrgencia]  = useState<string[]>([])
  const [queueFilterStatus,    setQueueFilterStatus]    = useState<string[]>([])
  const [queueSearch,          setQueueSearch]          = useState('')

  const [kpis, setKpis]               = useState<KPIs | null>(null)
  const [queue, setQueue]             = useState<{ data: QueueTicket[]; total: number } | null>(null)
  const [slaData, setSlaData]         = useState<SlaData | null>(null)
  const [productivity, setProductivity] = useState<ProductivityData | null>(null)
  const [financial, setFinancial]     = useState<FinancialData | null>(null)
  const [clients, setClients]         = useState<ClientData | null>(null)
  const [distribution, setDistribution] = useState<DistributionData | null>(null)
  const [evolution, setEvolution]     = useState<EvolutionData | null>(null)
  const [debugClientes, setDebugClientes]         = useState<{ rows: DebugClienteRow[] } | null>(null)
  const [debugResponsaveis, setDebugResponsaveis] = useState<{ rows: DebugResponsavelRow[] } | null>(null)
  const [loadError, setLoadError]         = useState<string | null>(null)
  const [contextStats, setContextStats]   = useState<ContextStats | null>(null)
  const [indicadores, setIndicadores]     = useState<ExecutiveData | null>(null)
  const [status, setStatus]               = useState<StatusData | null>(null)
  const [queueStatusOptions, setQueueStatusOptions] = useState<{ value: string; label: string; base_status: string }[]>([])
  const [drillDown, setDrillDown]       = useState<{ type: 'consultor' | 'cliente'; key: string; label: string } | null>(null)
  const [drillTickets, setDrillTickets] = useState<QueueTicket[] | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const params = `from=${from}&to=${to}`

  const load = useCallback(async (t: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      if (t === 'kpis' && !kpis) {
        const r = await api.get<KPIs>(`/sustentacao/kpis?${params}`)
        setKpis(r)
      } else if (t === 'queue') {
        await fetchQueue(queueFilterResp, queueFilterCliente, queueFilterUrgencia, queueFilterStatus, queueSearch)

      } else if (t === 'sla' && !slaData) {
        const r = await api.get<SlaData>(`/sustentacao/sla?${params}`)
        setSlaData(r)
      } else if (t === 'productivity' && !productivity) {
        const r = await api.get<ProductivityData>(`/sustentacao/productivity?${params}`)
        setProductivity(r)
      } else if (t === 'financial' && !financial) {
        const r = await api.get<FinancialData>(`/sustentacao/financial?${params}`)
        setFinancial(r)
      } else if (t === 'clients' && !clients) {
        const r = await api.get<ClientData>(`/sustentacao/clients?${params}`)
        setClients(r)
      } else if (t === 'distribution' && !distribution) {
        const r = await api.get<DistributionData>(`/sustentacao/distribution?${params}`)
        setDistribution(r)
      } else if (t === 'evolution' && !evolution) {
        const r = await api.get<EvolutionData>(`/sustentacao/evolution`)
        setEvolution(r)
      } else if (t === 'indicadores' && !indicadores) {
        const r = await api.get<ExecutiveData>(`/sustentacao/executive?${params}`)
        setIndicadores(r)
      } else if (t === 'status') {
        // compare=yoy: backend calcula current+previous+variation com a MESMA regra.
        const r = await api.get<{ status: StatusData }>(`/sustentacao/executive?${params}&compare=yoy`)
        setStatus(r.status)
        // REUSO dos endpoints existentes para Top-5 e tendência (nada duplicado).
        if (!productivity) api.get<ProductivityData>(`/sustentacao/productivity?${params}`).then(setProductivity).catch(() => {})
        if (!clients)      api.get<ClientData>(`/sustentacao/clients?${params}`).then(setClients).catch(() => {})
        if (!evolution)    api.get<EvolutionData>(`/sustentacao/evolution`).then(setEvolution).catch(() => {})
      } else if (t === 'debug') {
        if (!debugClientes) {
          const r = await api.get<{ rows: DebugClienteRow[] }>(`/sustentacao/debug-clientes`)
          setDebugClientes(r)
        }
        if (!debugResponsaveis) {
          const r = await api.get<{ rows: DebugResponsavelRow[] }>(`/sustentacao/debug-responsaveis`)
          setDebugResponsaveis(r)
        }
      }
    } catch (e: any) {
      console.error(e)
      setLoadError(e?.message ?? 'Erro ao carregar dados. Verifique se o deploy do backend foi feito.')
    } finally {
      setLoading(false)
    }
  }, [params, kpis, slaData, productivity, financial, clients, distribution, evolution, debugClientes, debugResponsaveis])

  const fetchQueue = useCallback(async (
    resp: string[], cliente: string[], urgencia: string[], status: string[], search: string
  ) => {
    setLoading(true)
    try {
      const qp = new URLSearchParams({ per_page: '100' })
      if (resp.length)     qp.set('responsavel', resp.join(','))
      if (cliente.length)  qp.set('cliente', cliente.join(','))
      if (urgencia.length) qp.set('urgencia', urgencia.join(','))
      if (status.length)   qp.set('status', status.join(','))
      if (search)          qp.set('search', search)
      const r = await api.get<any>(`/sustentacao/queue?${qp}`)
      setQueue({ data: r.data ?? [], total: r.total ?? 0 })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchContextStats = useCallback(async (resp: string[], cliente: string[], fromStr: string, toStr: string) => {
    const hasFilter = resp.length > 0 || cliente.length > 0
    if (!hasFilter) { setContextStats(null); return }
    try {
      const qp = new URLSearchParams({ from: fromStr, to: toStr })
      if (resp.length)    qp.set('responsavel', resp.join(','))
      if (cliente.length) qp.set('cliente', cliente.join(','))
      const r = await api.get<ContextStats>(`/sustentacao/context-stats?${qp}`)
      setContextStats(r)
    } catch { setContextStats(null) }
  }, [])

  const fetchDrillDown = useCallback(async (type: 'consultor' | 'cliente', key: string, label: string) => {
    if (drillDown?.key === key && drillDown?.type === type) {
      setDrillDown(null); setDrillTickets(null); return
    }
    setDrillDown({ type, key, label })
    setDrillTickets(null)
    setDrillLoading(true)
    try {
      const qp = new URLSearchParams({ per_page: '200' })
      if (type === 'consultor') qp.set('responsavel', key)
      else qp.set('cliente', key)
      const r = await api.get<any>(`/sustentacao/queue?${qp}`)
      setDrillTickets(r.data ?? [])
    } catch { setDrillTickets([]) }
    finally { setDrillLoading(false) }
  }, [drillDown])

  useEffect(() => { load(tab) }, [tab])

  useEffect(() => {
    api.get<{ statuses: { value: string; label: string; base_status: string }[] }>('/sustentacao/filter-options')
      .then(r => setQueueStatusOptions(r.statuses ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'queue') fetchQueue(queueFilterResp, queueFilterCliente, queueFilterUrgencia, queueFilterStatus, queueSearch)
  }, [queueFilterResp, queueFilterCliente, queueFilterUrgencia, queueFilterStatus, queueSearch])

  useEffect(() => {
    fetchContextStats(queueFilterResp, queueFilterCliente, from, to)
  }, [queueFilterResp, queueFilterCliente, from, to])

  // Recarrega o Status de Suporte quando o período muda (é unguarded no load).
  useEffect(() => {
    if (tab === 'status') { setStatus(null); load('status') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  const invalidateAll = () => {
    setKpis(null); setSlaData(null); setProductivity(null)
    setFinancial(null); setClients(null); setDistribution(null)
    setStatus(null)
  }

  const refresh = () => {
    setKpis(null); setQueue(null); setSlaData(null)
    setProductivity(null); setFinancial(null); setClients(null)
    setDistribution(null); setEvolution(null); setDebugClientes(null)
    setStatus(null)
    setTimeout(() => load(tab), 50)
  }

  return (
    <AppLayout>
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 md:px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">Portal de Sustentação</h1>
          <p className="text-xs text-[var(--text-light)]">Central operacional de suporte — Movidesk + Minutor</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle Mês/Ano ↔ Período */}
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
            {(['month', 'period'] as const).map((mode) => (
              <button key={mode} onClick={() => setFilterMode(mode)}
                className="px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5"
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
                else { setRefMonth(m); setRefYear(y); invalidateAll() }
              }}
            />
          ) : (
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); invalidateAll() }}
            />
          )}

          <button onClick={refresh} className="p-1.5 rounded hover:bg-[var(--surface-hover)] transition-colors">
            <RefreshCw size={14} className={`text-[var(--text-muted)] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Central de Lançamentos — sempre visível (navegação entre rotinas) ── */}
      <div className="px-4 md:px-6 pt-3 shrink-0">
        <div
          className="rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <Zap size={12} style={{ color: 'var(--primary)' }} />
            <h3 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
              Central de Lançamentos
            </h3>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {ROUTINE_TABS.map(r => {
              const Icon = r.icon
              const active = routineTab === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setRoutineTab(r.id)}
                  title={r.desc}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: active ? 'var(--primary-soft)' : 'var(--bg)',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    color: active ? 'var(--primary)' : 'var(--text)',
                  }}
                >
                  <Icon size={12} />
                  <span>{r.label}</span>
                </button>
              )
            })}
          </div>
          {routineTab && (
            <button
              onClick={() => setRoutineTab(null)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Voltar aos indicadores do portal"
            >
              <CloseIcon size={11} /> Home do Portal
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs (Indicadores) — escondidas quando uma rotina está ativa ── */}
      {!routineTab && (
        <div className="flex gap-1 px-4 md:px-6 pt-3 pb-0 border-b shrink-0 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors"
                style={{
                  borderColor: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 500,
                }}>
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Header da rotina ativa removido — o destaque do card na Central de
          Lançamentos + o botão "Voltar à Home do Portal" já fazem o papel. */}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {!routineTab && loading && !(tab === 'kpis' && !kpis) && (
          <div className="mb-4">
            <InlineLoader />
          </div>
        )}

        {/* STATUS DE SUPORTE — resumo executivo (regra canônica; drill-down p/ abas) */}
        {!routineTab && tab === 'status' && status && (() => {
          const s = status
          const cur = s.current, v = s.variation, st = s.state
          const fmtH = (h: number | null) => h == null ? '—' : `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`
          const slaRate = cur.sla.rate
          const inside = slaRate ?? 0
          const outside = slaRate != null ? +(100 - slaRate).toFixed(1) : 0
          const servico = s.distribution.by_servico
          const priorityColor = (u: string) => u === 'Urgente' ? RED : u === 'Alta' ? ORANGE : u === 'Média' ? CYAN : 'var(--text-light)'
          const compRows = [
            { label: 'Tickets Criados',    cur: cur.created,  prev: s.previous?.created,  var: v?.created_pct,  unit: '%' as const },
            { label: 'Tickets Resolvidos', cur: cur.resolved, prev: s.previous?.resolved, var: v?.resolved_pct, unit: '%' as const },
            { label: 'SLA de Solução',     cur: slaRate != null ? `${slaRate}%` : '—', prev: s.previous?.sla.rate != null ? `${s.previous?.sla.rate}%` : '—', var: v?.sla_pp, unit: 'pp' as const },
            { label: 'Tempo de Resolução', cur: fmtH(cur.resolution_median_hours), prev: fmtH(s.previous?.resolution_median_hours ?? null), var: v?.resolution_hours_abs, unit: 'h' as const },
          ]
          return (
            <div className="space-y-5">
              {/* LINHA KPI-A — fluxo COM comparação AA */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiAA label="SLA de Solução" value={slaRate != null ? `${slaRate}%` : '—'}
                  sub={`${cur.sla.num}/${cur.sla.den} no prazo`} variation={v?.sla_pp} unit="pp" good="up"
                  valueColor={slaRate == null ? undefined : slaRate >= 90 ? GREEN : slaRate >= 70 ? YELLOW : RED} />
                <KpiAA label="Tickets Criados" value={cur.created} variation={v?.created_pct} unit="%" good="neutral" />
                <KpiAA label="Tickets Resolvidos" value={cur.resolved} valueColor={GREEN} variation={v?.resolved_pct} unit="%" good="up" />
                <KpiAA label="Tempo de Resolução" value={fmtH(cur.resolution_median_hours)} sub="mediana"
                  variation={v?.resolution_hours_abs} unit="h" good="down" />
              </div>
              {/* LINHA KPI-B — estado SEM AA (mostra "sem histórico", nunca 0) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiAA label="Abertos (operação)" value={st.open_operational}
                  sub={`${st.new_in_attendance} ativos · ${st.stopped_internal} parados internos`} variation={null} />
                <KpiAA label="Aguardando cliente" value={st.waiting_client} sub="fora da operação ativa" variation={null} />
                <KpiAA label="SLA vencidos agora" value={st.sla_breached_now}
                  valueColor={st.sla_breached_now > 0 ? RED : GREEN} sub="backlog operacional" variation={null} />
                <KpiAA label="Horas de Suporte" value={fmtH(cur.hours)} sub="no período" variation={null} />
              </div>

              {/* ROW — SLA geral + Módulo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-[var(--text)]">SLA de Solução</p>
                    <button onClick={() => setTab('sla')} className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>Detalhar SLA →</button>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] w-16 text-[var(--text-muted)]">Dentro</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 12 }}>
                        <div className="h-full rounded-full" style={{ width: `${inside}%`, background: GREEN }} />
                      </div>
                      <span className="text-[11px] font-semibold w-12 text-right" style={{ color: GREEN }}>{inside}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] w-16 text-[var(--text-muted)]">Fora</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 12 }}>
                        <div className="h-full rounded-full" style={{ width: `${outside}%`, background: RED }} />
                      </div>
                      <span className="text-[11px] font-semibold w-12 text-right" style={{ color: RED }}>{outside}%</span>
                    </div>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-[var(--text-light)] uppercase tracking-wide">
                      <th className="text-left font-medium pb-1">Prioridade</th><th className="text-right font-medium pb-1">Tickets</th>
                      <th className="text-right font-medium pb-1">No prazo</th><th className="text-right font-medium pb-1">% SLA</th>
                    </tr></thead>
                    <tbody>
                      {s.distribution.sla_by_priority.map(p => (
                        <tr key={p.urgencia} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-1.5" style={{ color: priorityColor(p.urgencia) }}>{p.urgencia}</td>
                          <td className="py-1.5 text-right text-[var(--text)]">{p.den}</td>
                          <td className="py-1.5 text-right text-[var(--text-muted)]">{p.num}</td>
                          <td className="py-1.5 text-right font-semibold" style={{ color: p.rate != null && p.rate >= 90 ? GREEN : p.rate != null && p.rate >= 70 ? YELLOW : RED }}>
                            {p.rate != null ? `${p.rate}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-xs font-semibold text-[var(--text)] mb-3">Tickets por Módulo <span className="text-[10px] text-[var(--text-light)] font-normal">(serviço)</span></p>
                  <HBarTopN items={servico.top} others={servico.others} othersCount={servico.others_count}
                    barColor={BLUE} onSeeAll={() => setTab('distribution')} />
                </div>
              </div>

              {/* ROW — Backlog/Aging + Tipo de Atendimento */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-[var(--text)]">Backlog / Aging <span className="text-[10px] text-[var(--text-light)] font-normal">(operação interna)</span></p>
                    <button onClick={() => setTab('queue')} className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>Ver fila →</button>
                  </div>
                  <AgingBars aging={st.aging} colors={{ ok: GREEN, warn: YELLOW, high: ORANGE, crit: RED }} />
                  <p className="text-[10px] text-[var(--text-light)] mt-3">
                    Não inclui os {st.waiting_client} tickets <strong>aguardando cliente</strong> (fora da operação ativa).
                  </p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-xs font-semibold text-[var(--text)] mb-3">Tipos de Atendimento <span className="text-[10px] text-[var(--text-light)] font-normal">(categoria)</span></p>
                  <DonutTipo items={s.distribution.by_categoria} palette={PIE_COLORS} />
                </div>
              </div>

              {/* ROW — Top 5 consultores + Top 5 clientes (reuso /productivity e /clients) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-[var(--text)]">Top 5 Consultores</p>
                    <button onClick={() => setTab('productivity')} className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>Ver equipe →</button>
                  </div>
                  {productivity ? (
                    <div className="space-y-1.5">
                      {productivity.by_consultant.slice(0, 5).map((c, i) => (
                        <div key={c.owner_email} className="flex items-center gap-2 text-[11px]">
                          <span className="w-4 text-[var(--text-light)]">{i + 1}</span>
                          <span className="flex-1 text-[var(--text)] truncate">{(c.owner_name ?? c.owner_email).split(' ').slice(0, 2).join(' ')}</span>
                          <span className="text-[var(--text-muted)] w-16 text-right">{c.tickets_resolved} tk</span>
                          <span className="text-[var(--text-light)] w-16 text-right">{fmtH(c.total_minutes_worked / 60)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <InlineLoader />}
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-[var(--text)]">Top 5 Clientes</p>
                    <button onClick={() => setTab('clients')} className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>Ver clientes →</button>
                  </div>
                  {clients ? (
                    <div className="space-y-1.5">
                      {clients.by_client.slice(0, 5).map((c, i) => (
                        <div key={c.customer_id} className="flex items-center gap-2 text-[11px]">
                          <span className="w-4 text-[var(--text-light)]">{i + 1}</span>
                          <span className="flex-1 text-[var(--text)] truncate">{c.customer?.name ?? `#${c.customer_id}`}</span>
                          <span className="text-[var(--text-muted)] w-16 text-right">{c.total_period} tk</span>
                          <span className="text-[var(--text-light)] w-16 text-right">{c.open_now} abertos</span>
                        </div>
                      ))}
                    </div>
                  ) : <InlineLoader />}
                </div>
              </div>

              {/* COMPARAÇÃO ANUAL */}
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <p className="text-xs font-semibold text-[var(--text)] mb-3">
                  Comparação Anual <span className="text-[10px] text-[var(--text-light)] font-normal">— {s.previous ? 'período atual × mesmo período do ano anterior' : 'sem histórico comparável'}</span>
                </p>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-[var(--text-light)] uppercase tracking-wide">
                    <th className="text-left font-medium pb-1">Indicador</th>
                    <th className="text-right font-medium pb-1">Atual</th>
                    <th className="text-right font-medium pb-1">Ano anterior</th>
                    <th className="text-right font-medium pb-1">Variação</th>
                  </tr></thead>
                  <tbody>
                    {compRows.map(r => (
                      <tr key={r.label} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-1.5 text-[var(--text)]">{r.label}</td>
                        <td className="py-1.5 text-right font-semibold text-[var(--text)]">{r.cur}</td>
                        <td className="py-1.5 text-right text-[var(--text-muted)]">{s.previous ? r.prev : '—'}</td>
                        <td className="py-1.5 text-right">
                          <VariationBadge value={r.var ?? null} unit={r.unit}
                            good={r.label === 'Tempo de Resolução' ? 'down' : r.label === 'Tickets Criados' ? 'neutral' : 'up'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* EVOLUÇÃO 12 MESES (reuso /evolution) */}
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-[var(--text)]">Evolução — 12 meses</p>
                  <button onClick={() => setTab('evolution')} className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>Detalhar →</button>
                </div>
                {evolution && evolution.monthly.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={evolution.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="total" name="Criados" fill={BLUE} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="resolved" name="Resolvidos" fill={GREEN} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="sla_ok" name="SLA OK" fill={CYAN} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <InlineLoader />}
              </div>
            </div>
          )
        })()}

        {/* VISÃO EXECUTIVA */}
        {!routineTab && tab === 'kpis' && kpis && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Tickets Abertos" value={kpis.total_open} icon={Activity}
                color={kpis.total_open > 20 ? RED : kpis.total_open > 10 ? ORANGE : GREEN} />
              <KpiCard label="Abertos Hoje" value={kpis.new_today} icon={Zap} />
              <KpiCard label="Resolvidos no Período" value={kpis.resolved_period} icon={CheckCircle} color={GREEN} />
              <KpiCard label="Em Risco de SLA" value={kpis.open_at_risk} icon={AlertTriangle}
                color={kpis.open_at_risk > 0 ? RED : GREEN} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="SLA Resposta" value={kpis.sla_response_rate != null ? `${kpis.sla_response_rate}%` : '—'}
                icon={Shield} color={kpis.sla_response_rate != null && kpis.sla_response_rate >= 90 ? GREEN : kpis.sla_response_rate != null && kpis.sla_response_rate >= 70 ? YELLOW : RED}
                sub="Primeiras respostas no prazo" />
              <KpiCard label="SLA Solução" value={kpis.sla_solution_rate != null ? `${kpis.sla_solution_rate}%` : '—'}
                icon={CheckCircle} color={kpis.sla_solution_rate != null && kpis.sla_solution_rate >= 90 ? GREEN : kpis.sla_solution_rate != null && kpis.sla_solution_rate >= 70 ? YELLOW : RED}
                sub="Soluções entregues no prazo" />
              <KpiCard label="Tempo Médio Solução" value={fmt(kpis.avg_solution_time)} icon={Clock} sub="Últimas resoluções" />
              <KpiCard label="Fechados no Período" value={kpis.closed_period} icon={CheckCircle} color={PURPLE} />
            </div>
          </div>
        )}

        {/* INDICADORES — Dashboard Executivo */}
        {!routineTab && tab === 'indicadores' && indicadores && (() => {
          const { pct_critical, pct_stopped, sla_breach_pct, avg_resolution_hours, lead_time_avg_hours, aging, pct_hours_consumed, total_sold_h, total_used_h, hours_per_ticket, top_clients, by_category, by_urgency } = indicadores

          const kpiColor = (v: number | null, thresholds: [number, number]): string => {
            if (v == null) return 'var(--text-light)'
            if (v < thresholds[0]) return GREEN
            if (v < thresholds[1]) return YELLOW
            return RED
          }

          const agingBuckets = [
            { label: '0–3 dias',  value: aging.d0_3,    color: GREEN },
            { label: '4–7 dias',  value: aging.d4_7,    color: YELLOW },
            { label: '8–15 dias', value: aging.d8_15,   color: ORANGE },
            { label: '+15 dias',  value: aging.d15_plus, color: RED },
          ]
          const agingMax = Math.max(...agingBuckets.map(b => b.value), 1)

          return (
            <div className="space-y-5">
              {/* ROW 1 — 4 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: '% Críticos (Alta/Urgente)', value: `${pct_critical}%`, sub: 'do total do período', color: kpiColor(pct_critical, [40, 60]) },
                  { label: '% Parados',                 value: `${pct_stopped}%`,  sub: 'de todos os ativos', color: kpiColor(pct_stopped, [20, 35]) },
                  { label: 'SLA Violado',               value: sla_breach_pct != null ? `${sla_breach_pct}%` : '—', sub: 'resolvidos fora do prazo', color: kpiColor(sla_breach_pct, [20, 40]) },
                  { label: 'Tempo Médio Resolução',     value: avg_resolution_hours != null ? `${avg_resolution_hours}h` : '—', sub: 'baseado em sla_solution_time', color: kpiColor(avg_resolution_hours, [8, 24]) },
                ].map(c => (
                  <div key={c.label} className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <span className="text-[11px] text-[var(--text-muted)]">{c.label}</span>
                    <span className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{c.sub}</span>
                  </div>
                ))}
              </div>

              {/* ROW 2 — Aging + Lead Time/Horas por Ticket */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-xs font-semibold text-[var(--text)] mb-4">Aging — Tickets Abertos</p>
                  <div className="space-y-3">
                    {agingBuckets.map(b => (
                      <div key={b.label} className="flex items-center gap-3">
                        <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">{b.label}</span>
                        <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 10 }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${(b.value / agingMax) * 100}%`, background: b.color }} />
                        </div>
                        <span className="text-[11px] font-semibold w-8 text-right" style={{ color: b.color }}>{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <span className="text-[11px] text-[var(--text-muted)]">Lead Time Médio</span>
                    <span className="text-3xl font-bold" style={{ color: kpiColor(lead_time_avg_hours, [8, 24]) }}>
                      {lead_time_avg_hours != null ? `${lead_time_avg_hours}h` : '—'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">abertura → fechamento</span>
                  </div>
                  <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <span className="text-[11px] text-[var(--text-muted)]">Horas / Ticket</span>
                    <span className="text-3xl font-bold" style={{ color: CYAN }}>
                      {hours_per_ticket != null ? `${hours_per_ticket}h` : '—'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">horas apontadas por ticket resolvido</span>
                  </div>
                </div>
              </div>

              {/* ROW 3 — Consumo de Horas */}
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-xs font-semibold text-[var(--text)]">Consumo de Horas por Cliente</p>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-[var(--text-light)]">Consumido / Vendido</span>
                      <span className="text-sm font-bold" style={{ color: kpiColor(pct_hours_consumed, [70, 90]) }}>
                        {total_used_h}h / {total_sold_h}h
                        {pct_hours_consumed != null && <span className="ml-1 text-[11px]">({pct_hours_consumed}%)</span>}
                      </span>
                    </div>
                  </div>
                </div>
                {top_clients.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, top_clients.length * 32)}>
                    <BarChart layout="vertical"
                      data={top_clients.map(c => ({
                        name: c.name.length > 22 ? c.name.slice(0, 20) + '…' : c.name, fullName: c.name,
                        'Usado (h)': c.used_h,
                        'Vendido (h)': c.sold_h,
                        pct: c.pct,
                      }))}
                      margin={{ left: 0, right: 55, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--text-light)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'var(--text)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(_: any, pl: any) => pl?.[0]?.payload?.fullName ?? ''}
                        formatter={(v: any, name: any) => [`${v}h`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Vendido (h)" fill="var(--border-strong)" radius={[0,3,3,0]} />
                      <Bar dataKey="Usado (h)" fill={CYAN} radius={[0,3,3,0]}
                        label={{ position: 'right', fill: 'var(--text-light)', fontSize: 10, formatter: (v: any) => v > 0 ? `${v}h` : '' }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-[var(--text-light)] py-4 text-center">Nenhum dado de timesheet no período.</p>
                )}
              </div>

              {/* ROW 4 — Distribuição Categoria + Urgência */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-xs font-semibold text-[var(--text)] mb-3">Distribuição por Categoria</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, by_category.length * 30)}>
                    <BarChart layout="vertical" data={by_category.map(b => ({ name: b.label, count: b.count }))}
                      margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: 'var(--text-light)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fill: 'var(--text)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" name="Tickets" fill={BLUE} radius={[0,3,3,0]}
                        label={{ position: 'right', fill: 'var(--text-light)', fontSize: 10, formatter: (v: any) => v > 0 ? v : '' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-xs font-semibold text-[var(--text)] mb-3">Distribuição por Urgência</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, by_urgency.length * 30)}>
                    <BarChart layout="vertical" data={by_urgency.map(b => ({
                      name: b.label,
                      count: b.count,
                      fill: b.label === 'Urgente' ? RED : b.label === 'Alta' ? ORANGE : b.label === 'Normal' ? CYAN : 'var(--text-light)',
                    }))}
                      margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: 'var(--text-light)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={70} tick={{ fill: 'var(--text)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" name="Tickets" radius={[0,3,3,0]}
                        label={{ position: 'right', fill: 'var(--text-light)', fontSize: 10, formatter: (v: any) => v > 0 ? v : '' }}>
                        {by_urgency.map((b, i) => (
                          <Cell key={i} fill={b.label === 'Urgente' ? RED : b.label === 'Alta' ? ORANGE : b.label === 'Normal' ? CYAN : 'var(--text-light)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )
        })()}

        {/* FILA OPERACIONAL */}
        {!routineTab && tab === 'queue' && queue && (
          <div className="space-y-3">
          {/* Painel Contextual */}
          {contextStats && (
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--primary)] uppercase tracking-wide">
                  {contextStats.filter.responsavel.length > 0 && contextStats.filter.cliente.length > 0
                    ? 'Visão por Responsável + Cliente'
                    : contextStats.filter.responsavel.length > 0 ? 'Visão por Responsável' : 'Visão por Cliente'}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[var(--text-light)]">{contextStats.filter.responsavel.length} resp. · {contextStats.filter.cliente.length} cliente(s)</span>
                  <button onClick={() => setContextStats(null)} className="text-[var(--text-light)] hover:text-[var(--text)] transition-colors p-0.5 rounded">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                {/* Abertos */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">Abertos</p>
                  <p className="text-xl font-bold text-[var(--text)]">{contextStats.tickets_open}</p>
                </div>
                {/* Resolvidos */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">Resolvidos</p>
                  <p className="text-xl font-bold" style={{ color: GREEN }}>{contextStats.tickets_resolved}</p>
                </div>
                {/* SLA violado */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">SLA Violado</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.sla_breached > 0 ? RED : GREEN }}>{contextStats.sla_breached}</p>
                </div>
                {/* SLA em risco */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">Em Risco (4h)</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.sla_at_risk > 0 ? ORANGE : GREEN }}>{contextStats.sla_at_risk}</p>
                </div>
                {/* Taxa SLA */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">SLA %</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.sla_rate == null ? 'var(--text-light)' : contextStats.sla_rate >= 90 ? GREEN : contextStats.sla_rate >= 70 ? YELLOW : RED }}>
                    {contextStats.sla_rate != null ? `${contextStats.sla_rate}%` : '—'}
                  </p>
                </div>
                {/* Tempo médio */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">Tempo Médio</p>
                  <p className="text-xl font-bold text-[var(--text)]">{contextStats.avg_solution_min ? fmt(contextStats.avg_solution_min) : '—'}</p>
                </div>
                {/* Ticket mais antigo */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">Mais Antigo</p>
                  <p className="text-xl font-bold" style={{ color: (contextStats.oldest_open_days ?? 0) > 30 ? RED : (contextStats.oldest_open_days ?? 0) > 7 ? ORANGE : GREEN }}>
                    {contextStats.oldest_open_days != null ? `${contextStats.oldest_open_days}d` : '—'}
                  </p>
                </div>
                {/* +4h */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                  <p className="text-[10px] text-[var(--text-light)] mb-1">Abertos +4h</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.over_4h > 0 ? ORANGE : GREEN }}>{contextStats.over_4h}</p>
                </div>
                {/* Horas apontadas (só quando filtra por responsável) */}
                {contextStats.filter.responsavel.length > 0 && (
                  <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                    <p className="text-[10px] text-[var(--text-light)] mb-1">H. Apontadas</p>
                    <p className="text-xl font-bold text-[var(--text)]">{contextStats.hours_worked_min != null ? fmt(contextStats.hours_worked_min) : '—'}</p>
                  </div>
                )}
                {/* Produtividade (só quando filtra por responsável) */}
                {contextStats.filter.responsavel.length > 0 && (
                  <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                    <p className="text-[10px] text-[var(--text-light)] mb-1">Tickets/h</p>
                    <p className="text-xl font-bold" style={{ color: CYAN }}>{contextStats.productivity != null ? contextStats.productivity : '—'}</p>
                  </div>
                )}
              </div>

              {/* Tabelas de breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Por Consultor */}
                {contextStats.by_consultant.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[var(--text-light)] font-medium uppercase tracking-wide mb-2">Por Consultor</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <th className="text-left py-1.5 text-[var(--text-light)] font-medium">Consultor</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">Abertos</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">Em Atend.</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">SLA Viol.</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">SLA %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contextStats.by_consultant.map(c => (
                          <tr key={c.name} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-1.5 text-[var(--text)] font-medium">{c.name}</td>
                            <td className="py-1.5 text-center text-[var(--text)]">{c.total_open}</td>
                            <td className="py-1.5 text-center" style={{ color: CYAN }}>{c.in_attendance}</td>
                            <td className="py-1.5 text-center" style={{ color: c.sla_breached > 0 ? RED : 'var(--text-light)' }}>{c.sla_breached}</td>
                            <td className="py-1.5 text-center font-bold" style={{ color: c.sla_ok_pct >= 90 ? GREEN : c.sla_ok_pct >= 70 ? YELLOW : RED }}>{c.sla_ok_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Por Cliente */}
                {contextStats.by_client.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[var(--text-light)] font-medium uppercase tracking-wide mb-2">Por Cliente</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <th className="text-left py-1.5 text-[var(--text-light)] font-medium">Cliente</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">Abertos</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">Em Atend.</th>
                          <th className="text-center py-1.5 text-[var(--text-light)] font-medium">SLA Viol.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contextStats.by_client.map(c => (
                          <tr key={c.name} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-1.5 text-[var(--text)] font-medium max-w-[180px] truncate">{c.name}</td>
                            <td className="py-1.5 text-center text-[var(--text)]">{c.total_open}</td>
                            <td className="py-1.5 text-center" style={{ color: CYAN }}>{c.in_attendance}</td>
                            <td className="py-1.5 text-center" style={{ color: c.sla_breached > 0 ? RED : 'var(--text-light)' }}>{c.sla_breached}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Barra de filtros */}
          <div className="flex gap-2 flex-wrap items-end">
            {/* Busca livre */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--text-light)] font-medium uppercase tracking-wide">Buscar</label>
              <input type="text" placeholder="# ou título..." value={queueSearch}
                onChange={e => setQueueSearch(e.target.value)}
                className="text-xs rounded-lg px-2.5 py-1.5 border outline-none"
                style={{ background: 'var(--surface)', borderColor: queueSearch ? 'var(--primary)' : 'var(--border)', color: 'var(--text)', width: 155 }} />
            </div>
            <MultiSelect label="Urgência"
              options={['Urgente', 'Alta', 'Normal', 'Baixa'].map(u => ({ value: u, label: u }))}
              selected={queueFilterUrgencia} onChange={setQueueFilterUrgencia} />
            <MultiSelect label="Status" placeholder="Buscar status..."
              options={queueStatusOptions.length > 0
                ? queueStatusOptions.map(o => ({ value: o.value, label: `${o.label} (${STATUS_LABEL[o.base_status] ?? o.base_status})` }))
                : [{ value: 'New', label: 'Novo' }, { value: 'InAttendance', label: 'Em Atendimento' }, { value: 'Stopped', label: 'Parado' }]}
              selected={queueFilterStatus} onChange={setQueueFilterStatus} />
            <MultiSelect label="Responsável" placeholder="Buscar responsável..."
              options={Array.from(
                new Map(queue.data.filter(t => t.responsavel?.name && t.owner_email)
                  .map(t => [t.owner_email as string, t.responsavel!.name as string])).entries()
              ).sort(([, a], [, b]) => a.localeCompare(b)).map(([email, name]) => ({ value: email, label: name }))}
              selected={queueFilterResp} onChange={setQueueFilterResp} />
            <MultiSelect label="Cliente" placeholder="Buscar cliente..."
              options={[...new Set(queue.data.map(t => (t.org_name ?? clienteMovidesk(t)) as string).filter(s => !!s))].sort().map(n => ({ value: n, label: n }))}
              selected={queueFilterCliente} onChange={setQueueFilterCliente} />
            {(queueSearch || queueFilterUrgencia.length || queueFilterStatus.length || queueFilterResp.length || queueFilterCliente.length) ? (
              <button onClick={() => { setQueueSearch(''); setQueueFilterUrgencia([]); setQueueFilterStatus([]); setQueueFilterResp([]); setQueueFilterCliente([]) }}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-hover)] self-end"
                style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
                Limpar
              </button>
            ) : null}
            <span className="text-xs text-[var(--text-light)] ml-auto self-end pb-1.5">{queue.total} tickets</span>
          </div>
          <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  {['#', 'Título', 'Urgência', 'Status', 'Cliente', 'Solicitante', 'Responsável', 'Equipe', 'SLA Solução', 'Aberto em'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.data.map((t, i) => (
                  <tr key={t.id} className="border-b hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-sunken)' }}>
                    <td className="px-3 py-2 font-mono">
                      <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                        className="text-[var(--primary)] hover:text-[var(--primary)] hover:underline">{t.ticket_id}</a>
                    </td>
                    <td className="px-3 py-2 text-[var(--text)] max-w-[200px] truncate">
                      <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                        className="hover:text-[var(--primary)] hover:underline">{t.titulo ?? '—'}</a>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: `${urgencyColor(t.urgencia)}22`, color: urgencyColor(t.urgencia) }}>
                        {t.urgencia ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[var(--text)]">{t.status ?? STATUS_LABEL[t.base_status] ?? t.base_status}</span>
                        {t.status && <span className="text-[10px] text-[var(--text-light)]">{STATUS_LABEL[t.base_status] ?? t.base_status}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[var(--text)]">{clienteMovidesk(t)}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)] max-w-[160px] truncate">{t.solicitante?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text)]">{t.responsavel?.name ?? t.user?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{t.owner_team ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span style={{ color: isOverdue(t.sla_solution_date) ? RED : 'var(--text)' }}>
                        {fmtDate(t.sla_solution_date)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{fmtDate(t.created_date)}</td>
                  </tr>
                ))}
                {queue.data.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-[var(--text-light)]">Nenhum ticket em aberto</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* SLA */}
        {!routineTab && tab === 'sla' && slaData && (
          <div className="space-y-6">
            {slaData.breaching_now.length > 0 && (
              <div className="rounded-xl border border-red-500/30 p-4" style={{ background: 'var(--danger-bg)' }}>
                <h3 className="text-sm font-semibold text-[var(--danger)] mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {slaData.breaching_now.length} ticket(s) com SLA estourado agora
                </h3>
                <div className="space-y-2">
                  {slaData.breaching_now.slice(0, 10).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-red-500/10">
                      <div className="flex gap-3">
                        <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-[var(--primary)] hover:text-[var(--primary)] hover:underline">#{t.ticket_id}</a>
                        <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                          className="text-[var(--text)] hover:text-[var(--primary)] hover:underline">{t.titulo ?? '—'}</a>
                        <span className="text-[var(--text-muted)]">{clienteMovidesk(t)}</span>
                      </div>
                      <div className="flex gap-4 text-right">
                        <span className="text-[var(--text-muted)]">{t.responsavel?.name ?? t.user?.name ?? '—'}</span>
                        <span style={{ color: RED }}>{fmtDate(t.sla_solution_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="SLA por Urgência (período selecionado)">
                {slaData.by_urgency.length === 0
                  ? <p className="text-[var(--text-light)] text-xs">Sem dados no período</p>
                  : (
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-[var(--text-muted)]">
                          <th className="text-left py-1">Urgência</th>
                          <th className="text-right py-1">Total</th>
                          <th className="text-right py-1">Resposta OK</th>
                          <th className="text-right py-1">Solução OK</th>
                        </tr></thead>
                        <tbody>
                          {slaData.by_urgency.map(r => (
                            <tr key={r.urgencia} className="border-t" style={{ borderColor: 'var(--border)' }}>
                              <td className="py-1.5" style={{ color: urgencyColor(r.urgencia) }}>{r.urgencia ?? '—'}</td>
                              <td className="py-1.5 text-right text-[var(--text)]">{r.total}</td>
                              <td className="py-1.5 text-right" style={{ color: r.on_time_response >= r.total * 0.9 ? GREEN : YELLOW }}>
                                {r.on_time_response}/{r.total}
                              </td>
                              <td className="py-1.5 text-right" style={{ color: r.on_time_solution >= r.total * 0.9 ? GREEN : YELLOW }}>
                                {r.on_time_solution}/{r.total}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </Section>

              <Section title="Tendência SLA de Solução (6 meses)">
                {slaData.monthly_trend.length === 0
                  ? <p className="text-[var(--text-light)] text-xs">Sem dados históricos</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={slaData.monthly_trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                        <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11 }} />
                        <Line dataKey="total" name="Total" stroke={BLUE} dot={false} />
                        <Line dataKey="on_time" name="No Prazo" stroke={GREEN} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
              </Section>
            </div>
          </div>
        )}

        {/* PRODUTIVIDADE */}
        {!routineTab && tab === 'productivity' && productivity && (
          <div className="space-y-6">
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                    {['Consultor', 'Tickets Resolvidos', 'Tempo Médio', 'Horas Apontadas'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productivity.by_consultant.map((c) => (
                    <tr key={c.owner_email} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-2.5 text-[var(--text)]">{c.owner_name ?? c.owner_email}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: CYAN }}>{c.tickets_resolved}</td>
                      <td className="px-4 py-2.5 text-[var(--text)]">{fmt(Math.round(c.avg_solution_minutes))}</td>
                      <td className="px-4 py-2.5 text-[var(--text)]">{fmt(c.total_minutes_worked)}</td>
                    </tr>
                  ))}
                  {productivity.by_consultant.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-light)]">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {productivity.by_consultant.length > 0 && (
              <Section title="Tickets Resolvidos por Consultor">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={productivity.by_consultant.slice(0, 12).map(c => ({ name: (c.owner_name ?? c.owner_email).split(' ')[0], tickets: c.tickets_resolved }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                    <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Bar dataKey="tickets" name="Tickets" fill={CYAN} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            )}
          </div>
        )}

        {/* FINANCEIRO */}
        {!routineTab && tab === 'financial' && financial && (
          <div className="space-y-6">
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                    {['Projeto', 'Cliente', 'Horas Apontadas', 'Horas Vendidas', '% Consumido', 'Tickets'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {financial.by_project.map(p => {
                    const consumed = p.sold_hours > 0 ? Math.round((p.total_minutes / 60 / p.sold_hours) * 100) : null
                    return (
                      <tr key={p.project_id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-2.5 text-[var(--text)] font-medium">{p.project_name}</td>
                        <td className="px-4 py-2.5 text-[var(--text-muted)]">{p.customer_name}</td>
                        <td className="px-4 py-2.5" style={{ color: CYAN }}>{fmt(Math.round(p.total_minutes))}</td>
                        <td className="px-4 py-2.5 text-[var(--text)]">{p.sold_hours ? `${p.sold_hours}h` : '—'}</td>
                        <td className="px-4 py-2.5">
                          {consumed != null ? (
                            <span style={{ color: consumed > 100 ? RED : consumed > 80 ? YELLOW : GREEN }}>
                              {consumed}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--text-muted)]">{p.ticket_count}</td>
                      </tr>
                    )
                  })}
                  {financial.by_project.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-light)]">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* POR CLIENTE */}
        {!routineTab && tab === 'clients' && clients && (
          <div className="space-y-6">
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                    {['Cliente', 'Total no Período', 'Abertos Agora', 'SLA OK', 'Tempo Médio'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.by_client.map(c => (
                    <tr key={c.customer_id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-2.5 text-[var(--text)] font-medium">{c.customer?.name ?? `#${c.customer_id}`}</td>
                      <td className="px-4 py-2.5" style={{ color: CYAN }}>{c.total_period}</td>
                      <td className="px-4 py-2.5" style={{ color: c.open_now > 5 ? RED : 'var(--text)' }}>{c.open_now}</td>
                      <td className="px-4 py-2.5" style={{ color: c.sla_ok >= c.total_period * 0.9 ? GREEN : YELLOW }}>
                        {c.sla_ok}/{c.total_period}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text)]">{fmt(c.avg_solution_minutes)}</td>
                    </tr>
                  ))}
                  {clients.by_client.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-light)]">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DISTRIBUIÇÃO */}
        {!routineTab && tab === 'distribution' && distribution && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Por Urgência',    data: distribution.by_urgency },
              { title: 'Por Categoria',   data: distribution.by_category },
              { title: 'Por Serviço',     data: distribution.by_service },
              { title: 'Por Equipe',      data: distribution.by_team },
              { title: 'Por Status',      data: distribution.by_base_status.map(d => ({ ...d, label: STATUS_LABEL[d.label] ?? d.label })) },
              { title: 'Por Origem',      data: distribution.by_origin },
            ].map(({ title, data }) => (
              <Section key={title} title={title}>
                {data.length === 0
                  ? <p className="text-[var(--text-light)] text-xs">Sem dados</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={65} label={({ name, percent }) => `${name ?? ''} ${percent != null ? (percent * 100).toFixed(0) : 0}%`} labelLine={false}>
                          {data.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </Section>
            ))}
          </div>
        )}

        {/* EVOLUÇÃO */}
        {!routineTab && tab === 'evolution' && evolution && (
          <div className="space-y-6">
            <Section title="Evolução Mensal (últimos 12 meses)">
              {evolution.monthly.length === 0
                ? <p className="text-[var(--text-light)] text-xs">Sem dados históricos</p>
                : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={evolution.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                      <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="total"    name="Total"     fill={BLUE}  radius={[2,2,0,0]} />
                      <Bar dataKey="resolved" name="Resolvidos" fill={GREEN} radius={[2,2,0,0]} />
                      <Bar dataKey="sla_ok"   name="SLA OK"    fill={CYAN}  radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </Section>

            {evolution.monthly.length > 0 && (
              <Section title="Taxa de Resolução SLA (%)">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={evolution.monthly.map(m => ({
                    month: m.month,
                    taxa: m.total > 0 ? Math.round((m.sla_ok / m.total) * 100) : 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
                    <Tooltip formatter={(v) => `${v}%`} cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11 }} />
                    <Line dataKey="taxa" name="SLA OK %" stroke={CYAN} dot={{ r: 3 }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Section>
            )}
          </div>
        )}

        {!routineTab && tab === 'kpis' && !kpis && (
          <CardsSkeleton count={8} />
        )}

        {/* ── CENTRALZINHA: telas idênticas às do menu, escopadas a Sustentação.
            Acionadas pelos cards da Centralzinha (state routineTab), independentes
            das tabs de indicadores. Override de coord é respeitado via ?scope=. ── */}
        {routineTab === 'timesheets' && <TimesheetsScreen            scope="sustentacao" embedded extDate={portalDate} />}
        {routineTab === 'expenses'   && <ExpensesScreen              scope="sustentacao" embedded extDate={portalDate} />}
        {routineTab === 'approvals'  && <ApprovalsScreen             scope="sustentacao" embedded extDate={portalDate} />}
        {routineTab === 'auditoria'  && <AuditoriaApontamentosScreen scope="sustentacao" embedded extDate={portalDate} />}
        {routineTab === 'triagem'    && <TimesheetsScreen            scope="sustentacao" embedded triagemPadrao extDate={portalDate} />}
        {routineTab === 'rentabilidade' && <RentabilidadePage visaoForced="consultor" embedded periodo={rentabPeriodo} />}

        {!routineTab && tab === 'debug' && (
          <DiagnosticoTab
            debugClientes={debugClientes}
            debugResponsaveis={debugResponsaveis}
            loading={loading}
            loadError={loadError}
            onSyncClientes={async () => {
              await api.post('/sustentacao/sync-orgs', {})
              toast.success('Integração iniciada — aguarde ~1 minuto. A tabela será atualizada automaticamente.')
              setTimeout(async () => {
                const r = await api.get<{ rows: DebugClienteRow[] }>('/sustentacao/debug-clientes')
                setDebugClientes(r)
                toast.info('Tabela de clientes atualizada.')
              }, 90_000)
            }}
            onSyncResponsaveis={async () => {
              await api.post('/sustentacao/sync-agents', {})
              setTimeout(async () => {
                const r = await api.get<{ rows: DebugResponsavelRow[] }>('/sustentacao/debug-responsaveis')
                setDebugResponsaveis(r)
              }, 3 * 60 * 1000)
            }}
          />
        )}
      </div>
    </div>
    </AppLayout>
  )
}

// ─── Routine table (timesheets / expenses / approvals) ───────────────────────

function RoutineTable({ kind, rows, total, loading, onRowClick }: {
  kind: 'timesheets' | 'expenses' | 'approvals'
  rows: any[]
  total: number
  loading: boolean
  onRowClick: (r: any) => void
}) {
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const isExp = kind === 'expenses'
  const title = kind === 'timesheets' ? 'Apontamentos — Sustentação'
              : kind === 'expenses'   ? 'Despesas — Sustentação'
              : 'Aprovações pendentes — Sustentação'
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          <p className="text-xs mt-0.5 text-[var(--text-muted)]">{total} registros no período</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        {loading && rows.length === 0 ? (
          <SkeletonTable rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">Sem registros no período.</div>
        ) : isExp ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)]" style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Data</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Colaborador</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Projeto</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Categoria</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-wide">Valor</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="cursor-pointer text-[var(--text)]" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => onRowClick(r)}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-3 py-2">{r.user?.name ?? '—'}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-[var(--text-muted)]">{r.project?.code}</span> · {r.project?.name}</td>
                  <td className="px-3 py-2">{r.category?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtBRL(Number(r.amount) || 0)}</td>
                  <td className="px-3 py-2 text-xs">{r.status_display ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)]" style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Data</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Solicitante</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Consultor</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Ticket</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Título</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Início</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Fim</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Esforço (h)</th>
                <th className="text-left  px-3 py-2 text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="cursor-pointer text-[var(--text)]" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => onRowClick(r)}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date ? r.date.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-3 py-2">{r.requester ?? '—'}</td>
                  <td className="px-3 py-2">{r.user?.name ?? '—'}</td>
                  <td className="px-3 py-2">
                    {r.ticket ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${r.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[var(--primary)] hover:underline" onClick={e => e.stopPropagation()}>#{r.ticket}</a> : <span className="text-[var(--text-light)]">—</span>}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate text-[var(--text)]" title={r.ticket_subject ?? ''}>{r.ticket_subject ?? '—'}</td>
                  <td className="px-3 py-2 max-w-sm truncate text-[var(--text)]" title={previewText(r.description)}>{previewText(r.description) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.start_time ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.end_time ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{((r.effort_minutes ?? 0) / 60).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">{r.status_display ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RoutineDetailModal({ item, kind, onClose }: { item: any; kind: 'timesheets'|'expenses'|'approvals'; onClose: () => void }) {
  const fmtDateBR = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '—'
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const isExp = kind === 'expenses'
  const period = (!isExp && item.start_time && item.end_time) ? `${item.start_time} – ${item.end_time}` : null
  const hours = ((item.effort_minutes ?? 0) / 60)
  const hoursDisplay = `${Math.floor(hours)}:${String(Math.round((hours - Math.floor(hours)) * 60)).padStart(2, '0')}`
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl mt-8 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 py-5 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
              {isExp ? <DollarSign size={20} className="text-[var(--primary)]" /> : <Clock size={20} className="text-[var(--primary)]" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">{isExp ? 'Detalhe da Despesa' : 'Detalhe do Apontamento'}</h3>
              <p className="text-xs mt-0.5 text-[var(--text-muted)]">#{item.id} · {fmtDateBR(item.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:opacity-70 text-[var(--text-muted)]"><CloseIcon size={18} /></button>
        </div>
        <div className="p-6 space-y-3 text-[var(--text)] text-sm">
          {period && (
            <div className="rounded-xl p-4 mb-2" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
              <p className="text-xs uppercase tracking-wider mb-1 text-[var(--text-muted)]">Período</p>
              <p className="text-2xl font-bold text-[var(--primary)]">{period} <span className="text-base font-normal text-[var(--text-muted)]">({hoursDisplay})</span></p>
            </div>
          )}
          <div className="rounded-xl divide-y" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Data</div><div className="text-sm font-medium">{fmtDateBR(item.date)}</div></div>
            <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Colaborador</div><div className="text-sm font-medium">{item.user?.name ?? '—'}</div></div>
            <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Cliente</div><div className="text-sm font-medium">{item.customer ?? '—'}</div></div>
            <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Projeto</div><div className="text-sm font-medium">{item.project?.name ?? '—'}</div></div>
            {isExp && (
              <>
                <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Categoria</div><div className="text-sm font-medium">{item.category?.name ?? '—'}</div></div>
                <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Valor</div><div className="text-sm font-medium font-mono">{fmtBRL(Number(item.amount) || 0)}</div></div>
              </>
            )}
            {!isExp && item.ticket && (
              <div className="px-4 py-2.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Ticket</div><div className="text-sm font-medium"><a href={`https://erpserv.movidesk.com/Ticket/Edit/${item.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[var(--primary)] hover:underline">#{item.ticket}{item.ticket_subject ? ` · ${item.ticket_subject}` : ''}</a></div></div>
            )}
          </div>
          {item.description && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xs uppercase tracking-wider font-semibold mb-2 text-[var(--text-muted)]">{isExp ? 'Descrição' : 'Observação'}</div>
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
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }}
              />
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium text-[var(--text)]" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
