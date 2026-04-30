'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  AlertTriangle, CheckCircle, Clock, TrendingUp, Users, DollarSign,
  Activity, BarChart2, List, Shield, Globe, Zap, RefreshCw, Wrench,
  ChevronDown, Check,
} from 'lucide-react'

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CYAN   = '#00F5FF'
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
    <div className="rounded-xl border p-4 flex flex-col gap-2" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        {Icon && <Icon size={16} style={{ color: color ?? CYAN }} />}
      </div>
      <span className="text-2xl font-bold" style={{ color: color ?? '#fafafa' }}>{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
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
    { key: 'all',  label: `Todos (${matchCounts.all})`,        color: '#71717a' },
    { key: 'cnpj', label: `✓ CNPJ (${matchCounts.cnpj})`,     color: '#22c55e' },
    { key: 'nome', label: `~ Nome (${matchCounts.nome})`,      color: '#eab308' },
    { key: 'nao',  label: `✗ Não vinc. (${matchCounts.nao})`,  color: '#ef4444' },
  ]

  const statusCounts = {
    all:     rows.length,
    ativo:   rows.filter(r => r.is_active === true).length,
    inativo: rows.filter(r => r.is_active === false).length,
  }
  const STATUS_OPTIONS: { key: 'all' | 'ativo' | 'inativo'; label: string; color: string }[] = [
    { key: 'all',     label: `Todos (${statusCounts.all})`,          color: '#71717a' },
    { key: 'ativo',   label: `Ativo (${statusCounts.ativo})`,        color: '#22c55e' },
    { key: 'inativo', label: `Inativo (${statusCounts.inativo})`,    color: '#ef4444' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Comparativo Clientes: Movidesk × Minutor</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600">{filtered.length} de {rows.length} organizações</span>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'rgba(0,245,255,0.10)', border: '1px solid rgba(0,245,255,0.25)', color: '#00F5FF' }}>
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
          style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-text)', width: 200 }}
        />

        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: statusFilter === opt.key ? 'rgba(255,255,255,0.06)' : 'transparent', color: statusFilter === opt.key ? opt.color : '#71717a' }}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {MATCH_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setMatchFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: matchFilter === opt.key ? 'rgba(255,255,255,0.06)' : 'transparent', color: matchFilter === opt.key ? opt.color : '#71717a' }}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {([['all', 'Todos CNPJ'], ['com', 'Com CNPJ'], ['sem', 'Sem CNPJ']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setCnpjFilter(v)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: cnpjFilter === v ? 'rgba(0,245,255,0.10)' : 'transparent', color: cnpjFilter === v ? CYAN : '#71717a' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-clip" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
            <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Organização Movidesk</th>
              <th className="text-center px-3 py-2.5 text-zinc-400 font-medium">Status</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">CNPJ Movidesk</th>
              <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Tickets</th>
              <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Vinculados</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Cliente no Minutor</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">CNPJ Minutor</th>
              <th className="text-center px-3 py-2.5 text-zinc-400 font-medium">Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const matchColor = row.match === 'cnpj' ? '#22c55e' : row.match === 'nome' ? '#eab308' : '#ef4444'
              const matchLabel = row.match === 'cnpj' ? '✓ CNPJ' : row.match === 'nome' ? '~ Nome' : '✗ Não'
              return (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--brand-border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td className="px-3 py-2 text-zinc-200">{row.org ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {row.is_active === null
                      ? <span className="text-zinc-600 text-[10px]">—</span>
                      : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: row.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: row.is_active ? '#22c55e' : '#ef4444' }}>{row.is_active ? 'Ativo' : 'Inativo'}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-400">
                    {row.cnpj_movidesk
                      ? row.cnpj_movidesk
                      : row.match === 'nao'
                        ? <span className="text-zinc-500 italic text-[10px]">sem CNPJ — dept?</span>
                        : <span className="text-red-400 italic">vazio</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300">{row.tickets}</td>
                  <td className="px-3 py-2 text-right" style={{ color: row.vinculados === row.tickets ? '#22c55e' : row.vinculados > 0 ? '#eab308' : '#ef4444' }}>{row.vinculados}</td>
                  <td className="px-3 py-2 text-zinc-200">{row.minutor_name ?? <span className="text-zinc-600 italic">—</span>}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{row.minutor_cgc ?? <span className="text-zinc-600 italic">—</span>}</td>
                  <td className="px-3 py-2 text-center font-semibold" style={{ color: matchColor }}>{matchLabel}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-600">Nenhum resultado para os filtros selecionados.</td></tr>
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
        <h2 className="text-sm font-semibold text-zinc-300">Responsáveis por Ticket: Movidesk × Minutor</h2>
        <div className="flex items-center gap-3">
          {syncing && <span className="text-xs text-cyan-400">⏳ Rodando em background...</span>}
          <span className="text-xs text-zinc-600">{filtered.length} de {rows.length} responsáveis</span>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'rgba(0,245,255,0.10)', border: '1px solid rgba(0,245,255,0.25)', color: '#00F5FF' }}>
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
          style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-text)', width: 220 }}
        />
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {([
            { key: 'all',        label: `Todos (${rows.length})`,         color: '#71717a' },
            { key: 'encontrado', label: `✓ No Minutor (${found})`,        color: '#22c55e' },
            { key: 'nao',        label: `✗ Não encontrado (${notFound})`, color: '#ef4444' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setMatchFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: matchFilter === opt.key ? 'rgba(255,255,255,0.06)' : 'transparent', color: matchFilter === opt.key ? opt.color : '#71717a' }}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {([
            { key: 'all',     label: `Todos`,              color: '#71717a' },
            { key: 'ativo',   label: `● Ativo (${ativos})`,   color: '#22c55e' },
            { key: 'inativo', label: `● Inativo (${inativos})`, color: '#ef4444' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{ background: statusFilter === opt.key ? 'rgba(255,255,255,0.06)' : 'transparent', color: statusFilter === opt.key ? opt.color : '#71717a' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-clip" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
            <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Nome Movidesk</th>
              <th className="text-center px-3 py-2.5 text-zinc-400 font-medium">Status</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Email Movidesk</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Equipe</th>
              <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Tickets</th>
              <th className="text-right px-3 py-2.5 text-zinc-400 font-medium">Vinculados</th>
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium">Nome no Minutor</th>
              <th className="text-center px-3 py-2.5 text-zinc-400 font-medium">Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const matchColor = row.match === 'encontrado' ? '#22c55e' : '#ef4444'
              const matchLabel = row.match === 'encontrado' ? '✓ Encontrado' : '✗ Não'
              return (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--brand-border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td className="px-3 py-2 text-zinc-200">{row.owner_name ?? '—'}</td>
                  <td className="px-3 py-2 text-center" title={row.last_ticket_at ? `Último ticket: ${row.last_ticket_at}` : undefined}>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: row.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: row.is_active ? '#22c55e' : '#ef4444' }}>
                      {row.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{row.owner_email}</td>
                  <td className="px-3 py-2 text-zinc-500">{row.team ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-zinc-300">{row.tickets}</td>
                  <td className="px-3 py-2 text-right" style={{ color: row.vinculados === row.tickets ? '#22c55e' : row.vinculados > 0 ? '#eab308' : '#ef4444' }}>{row.vinculados}</td>
                  <td className="px-3 py-2 text-zinc-300">{row.minutor_name ?? <span className="text-zinc-600 italic">—</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${matchColor}18`, color: matchColor }}>{matchLabel}</span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-600 text-xs">Nenhum resultado para os filtros selecionados.</td></tr>
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
    <div className="rounded-xl border p-5" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">{title}</h3>
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
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--brand-border)' }}>
        {([['empresas', 'Empresas'], ['usuarios', 'Usuários']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: sub === id ? '#00F5FF' : '#71717a',
              borderBottom: sub === id ? '2px solid #00F5FF' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Empresas */}
      {sub === 'empresas' && (
        loading && !debugClientes
          ? <p className="text-zinc-500 text-sm">Carregando comparativo...</p>
          : debugClientes
            ? <DebugClientesTab rows={debugClientes.rows} onSync={onSyncClientes} />
            : null
      )}

      {/* Usuários */}
      {sub === 'usuarios' && (
        loading && !debugResponsaveis
          ? <p className="text-zinc-500 text-sm">Carregando responsáveis...</p>
          : loadError && !debugResponsaveis
            ? <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-400">{loadError}</div>
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
      <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-xs rounded-lg px-2.5 py-1.5 border outline-none flex items-center justify-between gap-2"
        style={{ background: 'var(--brand-surface)', borderColor: selected.length > 0 ? '#00F5FF' : 'var(--brand-border)', color: '#e4e4e7', minWidth: 160 }}>
        <span style={{ color: selected.length > 0 ? '#00F5FF' : '#e4e4e7' }}>{triggerLabel}</span>
        <ChevronDown size={12} className="text-zinc-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-lg border shadow-xl flex flex-col"
          style={{ background: '#18181b', borderColor: 'var(--brand-border)', minWidth: 220, maxHeight: 320 }}>
          <div className="p-2 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
            <input autoFocus type="text" placeholder={placeholder}
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded outline-none"
              style={{ background: '#27272a', color: '#e4e4e7', border: 'none' }} />
          </div>
          <div className="overflow-y-auto">
            <button type="button" onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-zinc-800"
              style={{ color: selected.length === 0 ? '#00F5FF' : '#a1a1aa' }}>
              {selected.length === 0 ? <Check size={12} /> : <span className="w-3 shrink-0" />}
              Todos
            </button>
            {filtered.map(opt => {
              const checked = selected.includes(opt.value)
              return (
                <button type="button" key={opt.value} onClick={() => toggle(opt.value)}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-zinc-800"
                  style={{ color: checked ? '#00F5FF' : '#e4e4e7' }}>
                  {checked ? <Check size={12} className="shrink-0" /> : <span className="w-3 shrink-0" />}
                  {opt.label}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-500 text-center">Nenhum resultado</p>
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
      <thead className="sticky top-0 z-10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <tr className="border-b" style={{ borderColor: 'var(--brand-border)', background: 'rgba(255,255,255,0.03)' }}>
          {['#', 'Título', 'Urgência', 'Status', 'Cliente', 'Responsável', 'SLA Solução'].map(h => (
            <th key={h} className="px-4 py-2 text-left font-medium text-zinc-500">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tickets.map((t, i) => (
          <tr key={t.id} className="border-b hover:bg-zinc-800/40 transition-colors"
            style={{ borderColor: 'var(--brand-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
            <td className="px-4 py-2 font-mono">
              <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 hover:underline">{t.ticket_id}</a>
            </td>
            <td className="px-4 py-2 text-white max-w-[240px] truncate">
              <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                className="hover:text-cyan-300 hover:underline">{t.titulo ?? '—'}</a>
            </td>
            <td className="px-4 py-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                style={{ background: `${urgencyColor(t.urgencia)}22`, color: urgencyColor(t.urgencia) }}>
                {t.urgencia ?? '—'}
              </span>
            </td>
            <td className="px-4 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-zinc-300">{t.status ?? STATUS_LABEL[t.base_status] ?? t.base_status}</span>
                {t.status && <span className="text-[10px] text-zinc-500">{STATUS_LABEL[t.base_status] ?? t.base_status}</span>}
              </div>
            </td>
            <td className="px-4 py-2 text-zinc-300 max-w-[140px] truncate">{clienteMovidesk(t)}</td>
            <td className="px-4 py-2 text-zinc-300">{t.responsavel?.name ?? t.user?.name ?? '—'}</td>
            <td className="px-4 py-2">
              <span style={{ color: isOverdue(t.sla_solution_date) ? RED : '#fafafa' }}>{fmtDate(t.sla_solution_date)}</span>
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

  const [tab, setTab]         = useState('kpis')
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

  // Computa from/to a partir do modo ativo
  const from = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-01`
    : dateFrom
  const to = filterMode === 'month' && refMonth && refYear
    ? new Date(refYear, refMonth, 0).toISOString().split('T')[0]
    : dateTo

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

  const invalidateAll = () => {
    setKpis(null); setSlaData(null); setProductivity(null)
    setFinancial(null); setClients(null); setDistribution(null)
  }

  const refresh = () => {
    setKpis(null); setQueue(null); setSlaData(null)
    setProductivity(null); setFinancial(null); setClients(null)
    setDistribution(null); setEvolution(null); setDebugClientes(null)
    setTimeout(() => load(tab), 50)
  }

  return (
    <AppLayout>
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--brand-bg)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
        <div>
          <h1 className="text-lg font-bold text-white">Portal de Sustentação</h1>
          <p className="text-xs text-zinc-500">Central operacional de suporte — Movidesk + Minutor</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle Mês/Ano ↔ Período */}
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
            {(['month', 'period'] as const).map((mode) => (
              <button key={mode} onClick={() => setFilterMode(mode)}
                className="px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5"
                style={{ background: filterMode === mode ? 'rgba(0,245,255,0.12)' : 'transparent', color: filterMode === mode ? CYAN : '#71717a' }}>
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

          <button onClick={refresh} className="p-1.5 rounded hover:bg-zinc-800 transition-colors">
            <RefreshCw size={14} className={`text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 px-6 pt-3 pb-0 border-b shrink-0 overflow-x-auto" style={{ borderColor: 'var(--brand-border)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors"
              style={{ borderColor: active ? CYAN : 'transparent', color: active ? CYAN : '#71717a' }}>
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-4">
            <RefreshCw size={14} className="animate-spin" /> Carregando...
          </div>
        )}

        {/* VISÃO EXECUTIVA */}
        {tab === 'kpis' && kpis && (
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
        {tab === 'indicadores' && indicadores && (() => {
          const { pct_critical, pct_stopped, sla_breach_pct, avg_resolution_hours, lead_time_avg_hours, aging, pct_hours_consumed, total_sold_h, total_used_h, hours_per_ticket, top_clients, by_category, by_urgency } = indicadores

          const kpiColor = (v: number | null, thresholds: [number, number]): string => {
            if (v == null) return '#71717a'
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
                  <div key={c.label} className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <span className="text-[11px] text-zinc-400">{c.label}</span>
                    <span className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</span>
                    <span className="text-[10px] text-zinc-600">{c.sub}</span>
                  </div>
                ))}
              </div>

              {/* ROW 2 — Aging + Lead Time/Horas por Ticket */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 rounded-xl border p-4" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                  <p className="text-xs font-semibold text-zinc-300 mb-4">Aging — Tickets Abertos</p>
                  <div className="space-y-3">
                    {agingBuckets.map(b => (
                      <div key={b.label} className="flex items-center gap-3">
                        <span className="text-[11px] text-zinc-400 w-20 shrink-0">{b.label}</span>
                        <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', height: 10 }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${(b.value / agingMax) * 100}%`, background: b.color }} />
                        </div>
                        <span className="text-[11px] font-semibold w-8 text-right" style={{ color: b.color }}>{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <span className="text-[11px] text-zinc-400">Lead Time Médio</span>
                    <span className="text-3xl font-bold" style={{ color: kpiColor(lead_time_avg_hours, [8, 24]) }}>
                      {lead_time_avg_hours != null ? `${lead_time_avg_hours}h` : '—'}
                    </span>
                    <span className="text-[10px] text-zinc-600">abertura → fechamento</span>
                  </div>
                  <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <span className="text-[11px] text-zinc-400">Horas / Ticket</span>
                    <span className="text-3xl font-bold" style={{ color: CYAN }}>
                      {hours_per_ticket != null ? `${hours_per_ticket}h` : '—'}
                    </span>
                    <span className="text-[10px] text-zinc-600">horas apontadas por ticket resolvido</span>
                  </div>
                </div>
              </div>

              {/* ROW 3 — Consumo de Horas */}
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-xs font-semibold text-zinc-300">Consumo de Horas por Cliente</p>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-zinc-500">Consumido / Vendido</span>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#e4e4e7', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(_: any, pl: any) => pl?.[0]?.payload?.fullName ?? ''}
                        formatter={(v: any, name: any) => [`${v}h`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Vendido (h)" fill="#3f3f46" radius={[0,3,3,0]} />
                      <Bar dataKey="Usado (h)" fill={CYAN} radius={[0,3,3,0]}
                        label={{ position: 'right', fill: '#71717a', fontSize: 10, formatter: (v: any) => v > 0 ? `${v}h` : '' }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-zinc-500 py-4 text-center">Nenhum dado de timesheet no período.</p>
                )}
              </div>

              {/* ROW 4 — Distribuição Categoria + Urgência */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                  <p className="text-xs font-semibold text-zinc-300 mb-3">Distribuição por Categoria</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, by_category.length * 30)}>
                    <BarChart layout="vertical" data={by_category.map(b => ({ name: b.label, count: b.count }))}
                      margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#e4e4e7', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" name="Tickets" fill={BLUE} radius={[0,3,3,0]}
                        label={{ position: 'right', fill: '#71717a', fontSize: 10, formatter: (v: any) => v > 0 ? v : '' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                  <p className="text-xs font-semibold text-zinc-300 mb-3">Distribuição por Urgência</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, by_urgency.length * 30)}>
                    <BarChart layout="vertical" data={by_urgency.map(b => ({
                      name: b.label,
                      count: b.count,
                      fill: b.label === 'Urgente' ? RED : b.label === 'Alta' ? ORANGE : b.label === 'Normal' ? CYAN : '#71717a',
                    }))}
                      margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={70} tick={{ fill: '#e4e4e7', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" name="Tickets" radius={[0,3,3,0]}
                        label={{ position: 'right', fill: '#71717a', fontSize: 10, formatter: (v: any) => v > 0 ? v : '' }}>
                        {by_urgency.map((b, i) => (
                          <Cell key={i} fill={b.label === 'Urgente' ? RED : b.label === 'Alta' ? ORANGE : b.label === 'Normal' ? CYAN : '#71717a'} />
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
        {tab === 'queue' && queue && (
          <div className="space-y-3">
          {/* Painel Contextual */}
          {contextStats && (
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'rgba(0,245,255,0.2)', background: 'rgba(0,245,255,0.03)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">
                  {contextStats.filter.responsavel.length > 0 && contextStats.filter.cliente.length > 0
                    ? 'Visão por Responsável + Cliente'
                    : contextStats.filter.responsavel.length > 0 ? 'Visão por Responsável' : 'Visão por Cliente'}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-500">{contextStats.filter.responsavel.length} resp. · {contextStats.filter.cliente.length} cliente(s)</span>
                  <button onClick={() => setContextStats(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                {/* Abertos */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">Abertos</p>
                  <p className="text-xl font-bold text-white">{contextStats.tickets_open}</p>
                </div>
                {/* Resolvidos */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">Resolvidos</p>
                  <p className="text-xl font-bold" style={{ color: GREEN }}>{contextStats.tickets_resolved}</p>
                </div>
                {/* SLA violado */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">SLA Violado</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.sla_breached > 0 ? RED : GREEN }}>{contextStats.sla_breached}</p>
                </div>
                {/* SLA em risco */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">Em Risco (4h)</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.sla_at_risk > 0 ? ORANGE : GREEN }}>{contextStats.sla_at_risk}</p>
                </div>
                {/* Taxa SLA */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">SLA %</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.sla_rate == null ? '#71717a' : contextStats.sla_rate >= 90 ? GREEN : contextStats.sla_rate >= 70 ? YELLOW : RED }}>
                    {contextStats.sla_rate != null ? `${contextStats.sla_rate}%` : '—'}
                  </p>
                </div>
                {/* Tempo médio */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">Tempo Médio</p>
                  <p className="text-xl font-bold text-white">{contextStats.avg_solution_min ? fmt(contextStats.avg_solution_min) : '—'}</p>
                </div>
                {/* Ticket mais antigo */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">Mais Antigo</p>
                  <p className="text-xl font-bold" style={{ color: (contextStats.oldest_open_days ?? 0) > 30 ? RED : (contextStats.oldest_open_days ?? 0) > 7 ? ORANGE : GREEN }}>
                    {contextStats.oldest_open_days != null ? `${contextStats.oldest_open_days}d` : '—'}
                  </p>
                </div>
                {/* +4h */}
                <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                  <p className="text-[10px] text-zinc-500 mb-1">Abertos +4h</p>
                  <p className="text-xl font-bold" style={{ color: contextStats.over_4h > 0 ? ORANGE : GREEN }}>{contextStats.over_4h}</p>
                </div>
                {/* Horas apontadas (só quando filtra por responsável) */}
                {contextStats.filter.responsavel.length > 0 && (
                  <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                    <p className="text-[10px] text-zinc-500 mb-1">H. Apontadas</p>
                    <p className="text-xl font-bold text-white">{contextStats.hours_worked_min != null ? fmt(contextStats.hours_worked_min) : '—'}</p>
                  </div>
                )}
                {/* Produtividade (só quando filtra por responsável) */}
                {contextStats.filter.responsavel.length > 0 && (
                  <div className="rounded-lg p-3 text-center" style={{ background: 'var(--brand-surface)' }}>
                    <p className="text-[10px] text-zinc-500 mb-1">Tickets/h</p>
                    <p className="text-xl font-bold" style={{ color: CYAN }}>{contextStats.productivity != null ? contextStats.productivity : '—'}</p>
                  </div>
                )}
              </div>

              {/* Tabelas de breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Por Consultor */}
                {contextStats.by_consultant.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-2">Por Consultor</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                          <th className="text-left py-1.5 text-zinc-500 font-medium">Consultor</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">Abertos</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">Em Atend.</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">SLA Viol.</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">SLA %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contextStats.by_consultant.map(c => (
                          <tr key={c.name} className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                            <td className="py-1.5 text-white font-medium">{c.name}</td>
                            <td className="py-1.5 text-center text-zinc-300">{c.total_open}</td>
                            <td className="py-1.5 text-center" style={{ color: CYAN }}>{c.in_attendance}</td>
                            <td className="py-1.5 text-center" style={{ color: c.sla_breached > 0 ? RED : '#71717a' }}>{c.sla_breached}</td>
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
                    <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-2">Por Cliente</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                          <th className="text-left py-1.5 text-zinc-500 font-medium">Cliente</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">Abertos</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">Em Atend.</th>
                          <th className="text-center py-1.5 text-zinc-500 font-medium">SLA Viol.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contextStats.by_client.map(c => (
                          <tr key={c.name} className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                            <td className="py-1.5 text-white font-medium max-w-[180px] truncate">{c.name}</td>
                            <td className="py-1.5 text-center text-zinc-300">{c.total_open}</td>
                            <td className="py-1.5 text-center" style={{ color: CYAN }}>{c.in_attendance}</td>
                            <td className="py-1.5 text-center" style={{ color: c.sla_breached > 0 ? RED : '#71717a' }}>{c.sla_breached}</td>
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
              <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Buscar</label>
              <input type="text" placeholder="# ou título..." value={queueSearch}
                onChange={e => setQueueSearch(e.target.value)}
                className="text-xs rounded-lg px-2.5 py-1.5 border outline-none"
                style={{ background: 'var(--brand-surface)', borderColor: queueSearch ? '#00F5FF' : 'var(--brand-border)', color: '#e4e4e7', width: 155 }} />
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
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-zinc-800 self-end"
                style={{ borderColor: 'var(--brand-border)', color: '#71717a' }}>
                Limpar
              </button>
            ) : null}
            <span className="text-xs text-zinc-500 ml-auto self-end pb-1.5">{queue.total} tickets</span>
          </div>
          <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--brand-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                  {['#', 'Título', 'Urgência', 'Status', 'Cliente', 'Solicitante', 'Responsável', 'Equipe', 'SLA Solução', 'Aberto em'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-zinc-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.data.map((t, i) => (
                  <tr key={t.id} className="border-b hover:bg-zinc-800/40 transition-colors"
                    style={{ borderColor: 'var(--brand-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td className="px-3 py-2 font-mono">
                      <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 hover:underline">{t.ticket_id}</a>
                    </td>
                    <td className="px-3 py-2 text-white max-w-[200px] truncate">
                      <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                        className="hover:text-cyan-300 hover:underline">{t.titulo ?? '—'}</a>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: `${urgencyColor(t.urgencia)}22`, color: urgencyColor(t.urgencia) }}>
                        {t.urgencia ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-zinc-300">{t.status ?? STATUS_LABEL[t.base_status] ?? t.base_status}</span>
                        {t.status && <span className="text-[10px] text-zinc-500">{STATUS_LABEL[t.base_status] ?? t.base_status}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{clienteMovidesk(t)}</td>
                    <td className="px-3 py-2 text-zinc-400 max-w-[160px] truncate">{t.solicitante?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-300">{t.responsavel?.name ?? t.user?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-400">{t.owner_team ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span style={{ color: isOverdue(t.sla_solution_date) ? RED : '#fafafa' }}>
                        {fmtDate(t.sla_solution_date)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{fmtDate(t.created_date)}</td>
                  </tr>
                ))}
                {queue.data.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-zinc-500">Nenhum ticket em aberto</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* SLA */}
        {tab === 'sla' && slaData && (
          <div className="space-y-6">
            {slaData.breaching_now.length > 0 && (
              <div className="rounded-xl border border-red-500/30 p-4" style={{ background: 'rgba(239,68,68,0.05)' }}>
                <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {slaData.breaching_now.length} ticket(s) com SLA estourado agora
                </h3>
                <div className="space-y-2">
                  {slaData.breaching_now.slice(0, 10).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-red-500/10">
                      <div className="flex gap-3">
                        <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-cyan-400 hover:text-cyan-300 hover:underline">#{t.ticket_id}</a>
                        <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket_id}`} target="_blank" rel="noopener noreferrer"
                          className="text-white hover:text-cyan-300 hover:underline">{t.titulo ?? '—'}</a>
                        <span className="text-zinc-400">{clienteMovidesk(t)}</span>
                      </div>
                      <div className="flex gap-4 text-right">
                        <span className="text-zinc-400">{t.responsavel?.name ?? t.user?.name ?? '—'}</span>
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
                  ? <p className="text-zinc-500 text-xs">Sem dados no período</p>
                  : (
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-zinc-400">
                          <th className="text-left py-1">Urgência</th>
                          <th className="text-right py-1">Total</th>
                          <th className="text-right py-1">Resposta OK</th>
                          <th className="text-right py-1">Solução OK</th>
                        </tr></thead>
                        <tbody>
                          {slaData.by_urgency.map(r => (
                            <tr key={r.urgencia} className="border-t" style={{ borderColor: 'var(--brand-border)' }}>
                              <td className="py-1.5" style={{ color: urgencyColor(r.urgencia) }}>{r.urgencia ?? '—'}</td>
                              <td className="py-1.5 text-right text-zinc-300">{r.total}</td>
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
                  ? <p className="text-zinc-500 text-xs">Sem dados históricos</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={slaData.monthly_trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#71717a' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 11 }} />
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
        {tab === 'productivity' && productivity && (
          <div className="space-y-6">
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--brand-border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                    {['Consultor', 'Tickets Resolvidos', 'Tempo Médio', 'Horas Apontadas'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productivity.by_consultant.map((c) => (
                    <tr key={c.owner_email} className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                      <td className="px-4 py-2.5 text-white">{c.owner_name ?? c.owner_email}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: CYAN }}>{c.tickets_resolved}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{fmt(Math.round(c.avg_solution_minutes))}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{fmt(c.total_minutes_worked)}</td>
                    </tr>
                  ))}
                  {productivity.by_consultant.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {productivity.by_consultant.length > 0 && (
              <Section title="Tickets Resolvidos por Consultor">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={productivity.by_consultant.slice(0, 12).map(c => ({ name: (c.owner_name ?? c.owner_email).split(' ')[0], tickets: c.tickets_resolved }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 11 }} />
                    <Bar dataKey="tickets" name="Tickets" fill={CYAN} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            )}
          </div>
        )}

        {/* FINANCEIRO */}
        {tab === 'financial' && financial && (
          <div className="space-y-6">
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--brand-border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                    {['Projeto', 'Cliente', 'Horas Apontadas', 'Horas Vendidas', '% Consumido', 'Tickets'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {financial.by_project.map(p => {
                    const consumed = p.sold_hours > 0 ? Math.round((p.total_minutes / 60 / p.sold_hours) * 100) : null
                    return (
                      <tr key={p.project_id} className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                        <td className="px-4 py-2.5 text-white font-medium">{p.project_name}</td>
                        <td className="px-4 py-2.5 text-zinc-400">{p.customer_name}</td>
                        <td className="px-4 py-2.5" style={{ color: CYAN }}>{fmt(Math.round(p.total_minutes))}</td>
                        <td className="px-4 py-2.5 text-zinc-300">{p.sold_hours ? `${p.sold_hours}h` : '—'}</td>
                        <td className="px-4 py-2.5">
                          {consumed != null ? (
                            <span style={{ color: consumed > 100 ? RED : consumed > 80 ? YELLOW : GREEN }}>
                              {consumed}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">{p.ticket_count}</td>
                      </tr>
                    )
                  })}
                  {financial.by_project.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* POR CLIENTE */}
        {tab === 'clients' && clients && (
          <div className="space-y-6">
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--brand-border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
                    {['Cliente', 'Total no Período', 'Abertos Agora', 'SLA OK', 'Tempo Médio'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.by_client.map(c => (
                    <tr key={c.customer_id} className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                      <td className="px-4 py-2.5 text-white font-medium">{c.customer?.name ?? `#${c.customer_id}`}</td>
                      <td className="px-4 py-2.5" style={{ color: CYAN }}>{c.total_period}</td>
                      <td className="px-4 py-2.5" style={{ color: c.open_now > 5 ? RED : '#fafafa' }}>{c.open_now}</td>
                      <td className="px-4 py-2.5" style={{ color: c.sla_ok >= c.total_period * 0.9 ? GREEN : YELLOW }}>
                        {c.sla_ok}/{c.total_period}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300">{fmt(c.avg_solution_minutes)}</td>
                    </tr>
                  ))}
                  {clients.by_client.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DISTRIBUIÇÃO */}
        {tab === 'distribution' && distribution && (
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
                  ? <p className="text-zinc-500 text-xs">Sem dados</p>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={65} label={({ name, percent }) => `${name ?? ''} ${percent != null ? (percent * 100).toFixed(0) : 0}%`} labelLine={false}>
                          {data.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </Section>
            ))}
          </div>
        )}

        {/* EVOLUÇÃO */}
        {tab === 'evolution' && evolution && (
          <div className="space-y-6">
            <Section title="Evolução Mensal (últimos 12 meses)">
              {evolution.monthly.length === 0
                ? <p className="text-zinc-500 text-xs">Sem dados históricos</p>
                : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={evolution.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#71717a' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 11 }} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#71717a' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#71717a' }} />
                    <Tooltip formatter={(v) => `${v}%`} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 11 }} />
                    <Line dataKey="taxa" name="SLA OK %" stroke={CYAN} dot={{ r: 3 }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Section>
            )}
          </div>
        )}

        {!loading && !kpis && tab === 'kpis' && (
          <p className="text-zinc-500 text-sm">Carregando dados...</p>
        )}

        {/* DIAGNÓSTICO */}
        {tab === 'debug' && (
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
