'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, CheckCircle, AlertCircle, AlertTriangle, Clock, Users, Layers, PauseCircle, XCircle, MoreVertical, Eye, Pencil, DollarSign, X, Check } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractCard {
  card_type?: 'contract'
  id: number
  customer_name: string
  customer_id: number
  project_name?: string
  categoria?: string
  contract_type?: string
  contract_type_id?: number
  service_type?: string
  tipo_faturamento?: string
  horas_contratadas?: number
  valor_projeto?: number
  kanban_status: string
  kanban_coordinator_id?: number
  kanban_coordinator?: string
  kanban_order: number
  status: string
  project_id?: number
  project_code?: string
  project_status?: string
  is_complete: boolean
  created_at: string
  sustentacao_column?: string | null
}

interface ProjectCard {
  card_type: 'project'
  id: number
  contract_id?: number
  customer_name: string
  customer_id: number
  project_name: string
  code: string
  status: string
  sold_hours?: number
  coordinator_ids?: number[]
  coordinators?: string[]
}

interface Coordinator { id: number; name: string }

interface ProjectFull {
  id: number; name: string; code: string; status: string; status_display?: string
  customer?: { id: number; name: string }
  description?: string | null; start_date?: string | null; expected_end_date?: string | null
  project_value?: number | null; hourly_rate?: number | null
  additional_hourly_rate?: number | null; initial_cost?: number | null
  initial_hours_balance?: number | null; sold_hours?: number | null
  hour_contribution?: number; exceeded_hour_contribution?: number | null
  consultant_hours?: number | null; coordinator_hours?: number | null
  save_erpserv?: number | null; total_available_hours?: number | null
  total_project_value?: number | null; weighted_hourly_rate?: number | null
  general_hours_balance?: number | null; consumed_hours?: number | null
  balance_percentage?: number | null; total_contributions_hours?: number | null
  contract_type_display?: string; contract_type?: { id: number; name: string } | null
  service_type?: { id: number; name: string } | null
  parent_project?: { id: number; name: string; code: string } | null
  coordinators?: { id: number; name: string; email: string }[]
  consultants?: { id: number; name: string; email: string }[]
  approvers?: { id: number; name: string; email: string }[]
}

interface ConsultantBreakdown {
  consultant_name: string; total_hours: number; approved_hours: number
  pending_hours: number; cost: number; consultant_hourly_rate: number
}

interface TimesheetEntry {
  id: number; date: string; effort_hours: string; effort_minutes: number
  observation?: string; status: string; status_display: string
  user?: { id: number; name: string }
}

interface ProjExpense {
  id: number; description: string; amount: number; expense_date: string
  status: string; status_display?: string
  category?: { name: string }; user?: { name: string }
}

interface ProjectEditForm {
  name: string; description: string; status: string; start_date: string
  expected_end_date: string; sold_hours: string; project_value: string
  hourly_rate: string; additional_hourly_rate: string; initial_hours_balance: string
  allow_negative_balance: boolean
}

interface Column {
  id: string
  label: string
  type: 'fixed' | 'coordinator' | 'project_status' | 'sustentacao' | 'bizify'
  coordinatorId?: number
  emoji?: string
  projectStatus?: string
  color?: string
  sustentacaoValidator?: (card: ContractCard) => boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  on_demand:          'On Demand',
  banco_horas_mensal: 'BH Mensal',
  banco_horas_fixo:   'BH Fixo',
  por_servico:        'Por Serviço',
  saas:               'SaaS',
}

function endDateStyle(dateStr: string): { color: string; bg: string; label: string } {
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0)   return { color: '#ef4444', bg: '#ef444420', label: `Venceu há ${Math.abs(diff)}d` }
  if (diff <= 7)  return { color: '#f97316', bg: '#f9731620', label: `Vence em ${diff}d` }
  if (diff <= 30) return { color: '#eab308', bg: '#eab30820', label: `${diff}d` }
  return { color: '#22c55e', bg: '#22c55e20', label: `${diff}d` }
}

const PROJECT_MENU_ITEMS = [
  { action: 'view',       label: 'Visualizar',    icon: Eye },
  { action: 'edit',       label: 'Editar',         icon: Pencil },
  { action: 'status',     label: 'Alterar Status', icon: Layers },
  { action: 'cost',       label: 'Custo',          icon: DollarSign },
  { action: 'timesheets', label: 'Apontamentos',   icon: Clock },
]

const STATUS_LABEL: Record<string, string> = {
  awaiting_start:       'Aguardando',
  started:              'Em Andamento',
  liberado_para_testes: 'Em Testes',
  paused:               'Pausado',
  cancelled:            'Cancelado',
  finished:             'Encerrado',
}

const PROJECT_STATUS_COL: Record<string, string> = {
  paused:    'col_pausado',
  cancelled: 'col_cancelado',
  finished:  'col_encerrado',
}

const COL_TO_PROJECT_STATUS: Record<string, string> = {
  col_pausado:   'paused',
  col_cancelado: 'cancelled',
  col_encerrado: 'finished',
}

const PRONTO_COLOR = '#eab308'

const FIXED_COLUMNS: Column[] = [
  { id: 'novo',   label: 'Novo Contrato',       type: 'fixed', emoji: '🆕' },
  { id: 'pronto', label: 'Pronto para Iniciar', type: 'fixed', emoji: '🚀', color: PRONTO_COLOR },
]

const SUST_COLOR   = '#f97316'
const BIZIFY_COLOR = '#a78bfa'

const SUSTENTACAO_COLS: Column[] = [
  {
    id: 'sust_bh_fixo',   label: 'BH Fixo',   type: 'sustentacao', emoji: '🔒', color: SUST_COLOR,
    sustentacaoValidator: (c) => c.categoria === 'sustentacao' && c.tipo_faturamento === 'banco_horas_fixo',
  },
  {
    id: 'sust_bh_mensal', label: 'BH Mensal', type: 'sustentacao', emoji: '📅', color: SUST_COLOR,
    sustentacaoValidator: (c) => c.categoria === 'sustentacao' && c.tipo_faturamento === 'banco_horas_mensal',
  },
  {
    id: 'sust_on_demand', label: 'On Demand', type: 'sustentacao', emoji: '⚡', color: SUST_COLOR,
    sustentacaoValidator: (c) => c.categoria === 'sustentacao' && c.tipo_faturamento === 'on_demand',
  },
  {
    id: 'sust_cloud',     label: 'Cloud',     type: 'sustentacao', emoji: '☁️', color: '#38bdf8',
    sustentacaoValidator: (c) => !!(c.service_type?.toLowerCase().includes('cloud')),
  },
]

const BIZIFY_COL: Column = {
  id: 'sust_bizify', label: 'Bizify', type: 'bizify', emoji: '⚡', color: BIZIFY_COLOR,
  sustentacaoValidator: (c) => !!(c.service_type?.toLowerCase().includes('bizify') || c.contract_type?.toLowerCase().includes('bizify')),
}

const STATUS_PROJECT_COLUMNS: Column[] = [
  { id: 'col_pausado',   label: 'Pausado',   type: 'project_status', projectStatus: 'paused',    color: '#f97316' },
  { id: 'col_cancelado', label: 'Cancelado', type: 'project_status', projectStatus: 'cancelled', color: '#ef4444' },
  { id: 'col_encerrado', label: 'Encerrado', type: 'project_status', projectStatus: 'finished',  color: '#6366f1' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contractColumnId(card: ContractCard): string {
  if (card.kanban_status === 'alocado' && card.kanban_coordinator_id) {
    return `coordinator:${card.kanban_coordinator_id}`
  }
  // All non-approved demand statuses → "novo" column
  if (['backlog', 'novo_projeto', 'em_planejamento', 'em_validacao', 'em_revisao'].includes(card.kanban_status ?? '')) {
    return 'novo'
  }
  // Approved / autorizado → "pronto" column
  if (['aprovado', 'inicio_autorizado'].includes(card.kanban_status ?? '')) {
    return 'pronto'
  }
  return 'novo'
}

function isActiveProject(p: ProjectCard): boolean {
  return ['awaiting_start', 'started', 'liberado_para_testes'].includes(p.status)
}

function statusBadge(card: ContractCard) {
  if (card.project_id) return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: '🟢 Projeto Ativo' }
  if (card.is_complete) return { color: '#eab308', bg: 'rgba(234,179,8,0.12)',  label: '🟡 Pronto' }
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: '🔴 Incompleto' }
}

// ─── Project Modals ───────────────────────────────────────────────────────────

function ProjectViewModal({ projectId, onClose, userRole, initialTab }: {
  projectId: number; onClose: () => void; userRole?: string; initialTab?: string
}) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'financial' | 'consultants' | 'timesheets'>((initialTab as any) ?? 'overview')
  const [breakdown, setBreakdown] = useState<ConsultantBreakdown[]>([])
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
  const [tsLoading, setTsLoading] = useState(false)
  const [tsLoaded, setTsLoaded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const reload = () => {
    setLoading(true)
    Promise.all([
      api.get<ProjectFull>(`/projects/${projectId}`),
      api.get<{ consultant_breakdown?: ConsultantBreakdown[] }>(`/projects/${projectId}/cost-summary`).catch(() => null),
    ]).then(([proj, cs]) => {
      setP(proj)
      setBreakdown(Array.isArray(cs?.consultant_breakdown) ? cs!.consultant_breakdown! : [])
    }).catch(() => toast.error('Erro ao carregar projeto'))
    .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [projectId])

  useEffect(() => {
    if (tab === 'timesheets' && !tsLoaded) {
      setTsLoading(true)
      api.get<any>(`/timesheets?project_id=${projectId}&per_page=30&sort=date&direction=desc`)
        .then(r => {
          const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
          setTimesheets(list); setTsLoaded(true)
        })
        .catch(() => {})
        .finally(() => setTsLoading(false))
    }
  }, [tab, projectId, tsLoaded])

  const fmt = (n: number | null | undefined, dec = 0) =>
    n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  const fmtDate = (d?: string | null) => d ? d.slice(0, 10).split('-').reverse().join('/') : '—'
  const fmtBRL  = (v?: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

  const healthColor = (pct: number) => pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
  const riskEmoji   = (pct: number) => pct >= 90 ? '🔴' : pct >= 70 ? '🟡' : '🟢'
  const riskLabel   = (pct: number) => pct >= 90 ? 'Crítico' : pct >= 70 ? 'Atenção' : 'Saudável'

  const statusColors: Record<string, { background: string; color: string }> = {
    awaiting_start: { background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
    started:        { background: 'rgba(0,245,255,0.10)',   color: '#00F5FF' },
    paused:         { background: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
    cancelled:      { background: 'rgba(239,68,68,0.12)',   color: '#EF4444' },
    finished:       { background: 'rgba(161,161,170,0.12)', color: '#71717A' },
  }
  const statusLabel: Record<string, string> = {
    awaiting_start: 'Aguardando Início', started: 'Em Andamento',
    paused: 'Pausado', cancelled: 'Cancelado', finished: 'Encerrado',
  }
  const tsStatusColor: Record<string, string> = {
    pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444', conflicted: '#a78bfa',
  }

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between py-2.5 border-b last:border-0" style={{ borderColor: 'var(--brand-border)' }}>
      <span className="text-xs shrink-0 w-44" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
      <span className="text-xs font-semibold text-right ml-2" style={{ color: 'var(--brand-text)' }}>{value ?? '—'}</span>
    </div>
  )

  const consumed = p?.consumed_hours ?? 0
  const totalAvail = p?.total_available_hours ?? ((p?.sold_hours ?? 0) + (p?.hour_contribution ?? 0))
  const pct = totalAvail > 0 ? (consumed / totalAvail) * 100 : 0
  const bar = healthColor(pct)
  const sc = p ? (statusColors[p.status] ?? statusColors.awaiting_start) : statusColors.awaiting_start
  const totalBreakdownHours = breakdown.reduce((s, c) => s + c.total_hours, 0)
  const topConsultant = breakdown.length > 0 ? breakdown.reduce((a, b) => a.total_hours > b.total_hours ? a : b) : null
  const topShare = totalBreakdownHours > 0 && topConsultant ? (topConsultant.total_hours / totalBreakdownHours) * 100 : 0
  const avgHours = breakdown.length > 0 ? totalBreakdownHours / breakdown.length : 0

  const alerts: { msg: string; color: string }[] = []
  if (pct >= 90) alerts.push({ msg: `Consumo crítico: ${Math.round(pct)}% das horas já utilizadas`, color: '#ef4444' })
  else if (pct >= 70) alerts.push({ msg: `Atenção: ${Math.round(pct)}% das horas consumidas`, color: '#f59e0b' })
  if ((p?.general_hours_balance ?? 0) < 0) alerts.push({ msg: 'Saldo de horas negativo — projeto em déficit', color: '#ef4444' })

  const tabs = [
    { id: 'overview'    as const, label: 'Visão Geral' },
    { id: 'consultants' as const, label: `Consultores${breakdown.length > 0 ? ` (${breakdown.length})` : ''}` },
    { id: 'timesheets'  as const, label: 'Apontamentos' },
    { id: 'financial'   as const, label: 'Financeiro' },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-4xl max-h-[92vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-start justify-between mb-4">
            {loading || !p ? (
              <p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando projeto...</p>
            ) : (
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-1 h-14 rounded-full shrink-0" style={{ background: bar }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>{p.code}</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={sc}>{p.status_display ?? statusLabel[p.status] ?? p.status}</span>
                    <span className="text-xs font-bold" title={`${Math.round(pct)}% consumido`}>{riskEmoji(pct)} {riskLabel(pct)}</span>
                  </div>
                  <h2 className="text-xl font-bold leading-tight truncate" style={{ color: 'var(--brand-text)' }}>{p.name}</h2>
                  {p.customer?.name && <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>{p.customer.name}</p>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {userRole === 'admin' && p && (
                <button onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.2)' }}>
                  <ExternalLink size={11} /> Editar
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
          </div>
          <div className="flex gap-1 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
                style={{ color: tab === t.id ? '#00F5FF' : 'var(--brand-subtle)', borderBottom: tab === t.id ? '2px solid #00F5FF' : '2px solid transparent', marginBottom: '-1px' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
          </div>
        ) : !p ? null : (
          <div className="flex-1 overflow-y-auto p-6">

            {tab === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Horas Vendidas',   value: fmt(p.sold_hours, 1) + 'h',  color: 'var(--brand-text)', bg: 'rgba(255,255,255,0.03)' },
                    { label: 'Horas Consumidas', value: fmt(consumed, 1) + 'h',       color: 'var(--brand-muted)', bg: 'rgba(255,255,255,0.03)' },
                    { label: 'Saldo',            value: fmt(p.general_hours_balance, 1) + 'h',
                      color: (p.general_hours_balance ?? 0) < 0 ? '#ef4444' : '#22c55e',
                      bg: (p.general_hours_balance ?? 0) < 0 ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)' },
                    { label: 'Consultores c/h',  value: String(breakdown.length || (p.consultants?.length ?? 0)), color: '#a78bfa', bg: 'rgba(139,92,246,0.06)' },
                  ].map(it => (
                    <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: it.bg, border: '1px solid var(--brand-border)' }}>
                      <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                      <p className="text-xl font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${bar}33` }}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-semibold" style={{ color: bar }}>{riskEmoji(pct)} {riskLabel(pct)}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: bar }}>{totalAvail > 0 ? `${Math.round(pct)}% consumido` : 'Sem horas'}</span>
                  </div>
                  <div className="w-full h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: bar }} />
                  </div>
                </div>

                {alerts.length > 0 && (
                  <div className="space-y-2">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: `${a.color}10`, border: `1px solid ${a.color}40` }}>
                        <AlertTriangle size={14} className="shrink-0" style={{ color: a.color }} />
                        <span className="text-xs" style={{ color: a.color }}>{a.msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                      <div className="divide-y px-4" style={{ borderColor: 'var(--brand-border)' }}>
                        <Row label="Código" value={<span className="font-mono">{p.code}</span>} />
                        <Row label="Cliente" value={p.customer?.name} />
                        <Row label="Tipo de Serviço" value={p.service_type?.name} />
                        <Row label="Tipo de Contrato" value={p.contract_type_display ?? p.contract_type?.name} />
                        <Row label="Data de Início" value={fmtDate(p.start_date)} />
                        {p.expected_end_date && (() => {
                          const ds = endDateStyle(p.expected_end_date)
                          return (
                            <Row label="Data de Conclusão" value={
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: ds.bg, color: ds.color }}>
                                {new Date(p.expected_end_date).toLocaleDateString('pt-BR')} — {ds.label}
                              </span>
                            } />
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Equipe</p>
                    <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--brand-border)' }}>
                      {(p.coordinators?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Coordenadores</p>
                          <div className="flex flex-wrap gap-1.5">{p.coordinators!.map(u => (
                            <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>{u.name}</span>
                          ))}</div>
                        </div>
                      )}
                      {(p.consultants?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consultores</p>
                          <div className="flex flex-wrap gap-1.5">{p.consultants!.map(u => (
                            <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(139,92,246,0.10)', color: '#a78bfa' }}>{u.name}</span>
                          ))}</div>
                        </div>
                      )}
                      {(p.coordinators?.length ?? 0) === 0 && (p.consultants?.length ?? 0) === 0 && (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--brand-subtle)' }}>Sem equipe cadastrada</p>
                      )}
                    </div>
                  </div>
                </div>

                {breakdown.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Quem está consumindo horas</p>
                    <div className="space-y-2">
                      {[...breakdown].sort((a, b) => b.total_hours - a.total_hours).slice(0, 5).map((c, i) => {
                        const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                        const colors = ['#00F5FF', '#a78bfa', '#22c55e', '#f59e0b', '#f87171']
                        const col = colors[i % colors.length]
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs shrink-0 w-28 truncate" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</span>
                            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: col }} />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums shrink-0 w-12 text-right" style={{ color: col }}>{fmt(c.total_hours, 1)}h</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'consultants' && (
              <div className="space-y-4">
                {breakdown.length === 0 ? (
                  <p className="text-center text-sm py-12" style={{ color: 'var(--brand-subtle)' }}>Nenhum lançamento de horas encontrado.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Consultores', value: String(breakdown.length), color: '#a78bfa' },
                        { label: 'Total Horas', value: fmt(totalBreakdownHours, 1) + 'h', color: 'var(--brand-text)' },
                        { label: 'Aprovadas',   value: fmt(breakdown.reduce((s, c) => s + c.approved_hours, 0), 1) + 'h', color: '#22c55e' },
                        { label: 'Custo Total', value: fmtBRL(breakdown.reduce((s, c) => s + c.cost, 0)), color: '#00F5FF' },
                      ].map(it => (
                        <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                          <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                          <p className="text-lg font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {[...breakdown].sort((a, b) => b.total_hours - a.total_hours).map((c, i) => {
                        const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                        const colors = ['#00F5FF', '#a78bfa', '#22c55e', '#f59e0b', '#f87171', '#34d399', '#60a5fa']
                        const col = colors[i % colors.length]
                        return (
                          <div key={i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color: col }}>{fmt(c.total_hours, 1)}h · {Math.round(share)}%</span>
                            </div>
                            <div className="w-full h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: col }} />
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-[10px]">
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Aprovadas</span><br /><span style={{ color: '#22c55e' }}>{fmt(c.approved_hours, 1)}h</span></div>
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Pendentes</span><br /><span style={{ color: c.pending_hours > 0 ? '#f59e0b' : 'var(--brand-subtle)' }}>{fmt(c.pending_hours, 1)}h</span></div>
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Taxa/h</span><br /><span style={{ color: 'var(--brand-muted)' }}>{fmtBRL(c.consultant_hourly_rate)}</span></div>
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Custo</span><br /><span style={{ color: '#00F5FF' }}>{fmtBRL(c.cost)}</span></div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'timesheets' && (
              <div className="space-y-4">
                {tsLoading ? (
                  <p className="text-center text-sm animate-pulse py-12" style={{ color: 'var(--brand-subtle)' }}>Carregando apontamentos...</p>
                ) : timesheets.length === 0 ? (
                  <p className="text-center text-sm py-12" style={{ color: 'var(--brand-subtle)' }}>Nenhum apontamento encontrado.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total de Registros', value: String(timesheets.length), color: 'var(--brand-text)' },
                        { label: 'Aprovados', value: String(timesheets.filter(t => t.status === 'approved').length), color: '#22c55e' },
                        { label: 'Pendentes', value: String(timesheets.filter(t => t.status === 'pending').length),  color: '#f59e0b' },
                      ].map(it => (
                        <div key={it.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                          <p className="text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                          <p className="text-xl font-bold" style={{ color: it.color }}>{it.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {timesheets.map(ts => {
                        const sColor = tsStatusColor[ts.status] ?? '#94a3b8'
                        return (
                          <div key={ts.id} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>{ts.user?.name ?? '—'}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${sColor}18`, color: sColor }}>{ts.status_display}</span>
                              </div>
                              {ts.observation && <p className="text-xs line-clamp-2" style={{ color: 'var(--brand-muted)' }}>{ts.observation}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{fmtDate(ts.date)}</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: '#00F5FF' }}>{ts.effort_hours}h</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'financial' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Valor do Projeto',        value: fmtBRL(p.project_value),                          color: '#00F5FF' },
                    { label: 'Valor Total (c/aportes)', value: fmtBRL(p.total_project_value ?? p.project_value), color: '#00F5FF' },
                    { label: 'Taxa / Hora',             value: fmtBRL(p.hourly_rate),                            color: 'var(--brand-text)' },
                  ].map(it => (
                    <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                  <div className="divide-y px-4" style={{ borderColor: 'var(--brand-border)' }}>
                    <Row label="Horas Contratadas" value={p.sold_hours != null ? `${fmt(p.sold_hours, 1)}h` : '—'} />
                    <Row label="Total Disponível" value={`${fmt(totalAvail, 1)}h`} />
                    <Row label="Saldo Atual" value={<span style={{ color: (p.general_hours_balance ?? 0) < 0 ? '#ef4444' : '#22c55e' }}>{fmt(p.general_hours_balance, 1)}h</span>} />
                    <Row label="% Consumido" value={<span style={{ color: bar }}>{totalAvail > 0 ? `${Math.round(pct)}%` : '—'}</span>} />
                    <Row label="Custo Inicial" value={fmtBRL(p.initial_cost)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
        </div>
      </div>
      {showEdit && p && (
        <ProjectInlineEditModal project={p} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); reload() }} />
      )}
    </div>
  )
}

function ProjectInlineEditModal({ project, onClose, onSaved }: { project: ProjectFull; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ProjectEditForm>({
    name:                   project.name ?? '',
    description:            project.description ?? '',
    status:                 project.status ?? 'awaiting_start',
    start_date:             project.start_date?.slice(0, 10) ?? '',
    expected_end_date:      project.expected_end_date?.slice(0, 10) ?? '',
    sold_hours:             String(project.sold_hours ?? ''),
    project_value:          String(project.project_value ?? ''),
    hourly_rate:            String(project.hourly_rate ?? ''),
    additional_hourly_rate: String(project.additional_hourly_rate ?? ''),
    initial_hours_balance:  String(project.initial_hours_balance ?? ''),
    allow_negative_balance: false,
  })
  const [saving, setSaving] = useState(false)

  // Team state
  const [allCoordinators, setAllCoordinators] = useState<{ id: number; name: string }[]>([])
  const [allConsultants,  setAllConsultants]  = useState<{ id: number; name: string }[]>([])
  const [selCoordIds,     setSelCoordIds]     = useState<Set<number>>(new Set((project.coordinators ?? []).map(c => c.id)))
  const [selConsultIds,   setSelConsultIds]   = useState<Set<number>>(new Set((project.consultants  ?? []).map(c => c.id)))
  const [teamSearch,      setTeamSearch]      = useState('')
  const [teamTab,         setTeamTab]         = useState<'coord' | 'consult'>('coord')

  useEffect(() => {
    Promise.all([
      api.get<any>('/users?type=coordenador&pageSize=200'),
      api.get<any>('/users?type=consultor&pageSize=200'),
    ]).then(([coords, consults]) => {
      setAllCoordinators(coords?.items ?? coords?.data ?? [])
      setAllConsultants(consults?.items ?? consults?.data ?? [])
    }).catch(() => {})
  }, [])

  const toggleCoord = (id: number) => setSelCoordIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleConsult = (id: number) => setSelConsultIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const setF = (key: keyof ProjectEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(), description: form.description || null, status: form.status,
        start_date: form.start_date || null, expected_end_date: form.expected_end_date || null,
        allow_negative_balance: form.allow_negative_balance,
        coordinator_ids: Array.from(selCoordIds),
        consultant_ids:  Array.from(selConsultIds),
      }
      if (form.sold_hours !== '')             payload.sold_hours             = Number(form.sold_hours)
      if (form.project_value !== '')          payload.project_value          = Number(form.project_value)
      if (form.hourly_rate !== '')            payload.hourly_rate            = Number(form.hourly_rate)
      if (form.additional_hourly_rate !== '') payload.additional_hourly_rate = Number(form.additional_hourly_rate)
      if (form.initial_hours_balance !== '')  payload.initial_hours_balance  = Number(form.initial_hours_balance)
      await api.put(`/projects/${project.id}`, payload)
      toast.success('Projeto atualizado')
      onSaved()
    } catch { toast.error('Erro ao salvar projeto') }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--brand-bg)', border: '1px solid var(--brand-border)',
    borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem',
    color: 'var(--brand-text)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = { fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-subtle)', marginBottom: '0.375rem', display: 'block' }

  const STATUS_OPTS = [
    { value: 'awaiting_start', label: 'Aguardando Início' },
    { value: 'started',        label: 'Em Andamento' },
    { value: 'paused',         label: 'Pausado' },
    { value: 'finished',       label: 'Encerrado' },
    { value: 'cancelled',      label: 'Cancelado' },
  ]

  const filteredCoords   = allCoordinators.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredConsults = allConsultants.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-5xl max-h-[92vh]" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(0,245,255,0.25)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{project.code}</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>Editar Projeto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Layout 2 colunas: esquerda = identificação/financeiro/horas, direita = equipe */}
          <div className="grid grid-cols-2 gap-6">

            {/* Coluna Esquerda */}
            <div className="space-y-5">

              {/* Identificação */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
                <div className="space-y-3">
                  <div>
                    <label style={labelStyle}>Nome do Projeto *</label>
                    <input value={form.name} onChange={setF('name')} style={inputStyle} placeholder="Nome do projeto" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={labelStyle}>Status</label>
                      <select value={form.status} onChange={setF('status')} style={inputStyle}>
                        {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Data de Início</label>
                      <input type="date" value={form.start_date} onChange={setF('start_date')} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Data de Conclusão</label>
                    <input type="date" value={form.expected_end_date} onChange={setF('expected_end_date')} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Descrição</label>
                    <textarea value={form.description} onChange={setF('description')} style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} placeholder="Descrição do projeto" />
                  </div>
                </div>
              </div>

              {/* Financeiro */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Financeiro</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label style={labelStyle}>Valor do Projeto (R$)</label><input type="number" value={form.project_value} onChange={setF('project_value')} style={inputStyle} placeholder="0.00" step="0.01" /></div>
                  <div><label style={labelStyle}>Valor da Hora (R$)</label><input type="number" value={form.hourly_rate} onChange={setF('hourly_rate')} style={inputStyle} placeholder="0.00" step="0.01" /></div>
                  <div><label style={labelStyle}>Hora Adicional (R$)</label><input type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} style={inputStyle} placeholder="0.00" step="0.01" /></div>
                  <div><label style={labelStyle}>Horas Contratadas</label><input type="number" value={form.sold_hours} onChange={setF('sold_hours')} style={inputStyle} placeholder="0" step="1" /></div>
                </div>
              </div>

              {/* Horas */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Horas</p>
                <div>
                  <label style={labelStyle}>Saldo Inicial de Horas</label>
                  <input type="number" value={form.initial_hours_balance} onChange={setF('initial_hours_balance')} style={inputStyle} placeholder="0" step="1" />
                </div>
                <div className="flex items-center gap-3 mt-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
                  <button type="button"
                    onClick={() => setForm(prev => ({ ...prev, allow_negative_balance: !prev.allow_negative_balance }))}
                    className="relative w-10 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: form.allow_negative_balance ? '#22c55e' : 'rgba(255,255,255,0.1)' }}>
                    <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ transform: form.allow_negative_balance ? 'translateX(20px)' : 'translateX(0)' }} />
                  </button>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>Permitir Saldo Negativo</p>
                    <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Projeto continua mesmo sem saldo de horas</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna Direita — Equipe */}
            <div className="flex flex-col" style={{ minHeight: 0 }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Equipe Alocada</p>

              {/* Tabs */}
              <div className="flex gap-1 mb-3 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                {([['coord', 'Coordenadores', selCoordIds.size], ['consult', 'Consultores', selConsultIds.size]] as const).map(([id, label, count]) => (
                  <button key={id} onClick={() => { setTeamTab(id); setTeamSearch('') }}
                    className="px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                    style={{ color: teamTab === id ? '#00F5FF' : 'var(--brand-subtle)', borderBottom: teamTab === id ? '2px solid #00F5FF' : '2px solid transparent', marginBottom: '-1px' }}>
                    {label} {count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>{count}</span>}
                  </button>
                ))}
              </div>

              {/* Search */}
              <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                placeholder={teamTab === 'coord' ? 'Buscar coordenador...' : 'Buscar consultor...'}
                className="w-full text-xs px-3 py-2 rounded-xl outline-none mb-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />

              {/* List */}
              <div className="flex-1 overflow-y-auto space-y-1 rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--brand-border)', maxHeight: 320 }}>
                {teamTab === 'coord' && filteredCoords.map(c => (
                  <button key={c.id} onClick={() => toggleCoord(c.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    style={{ background: selCoordIds.has(c.id) ? 'rgba(0,245,255,0.06)' : 'transparent', border: `1px solid ${selCoordIds.has(c.id) ? 'rgba(0,245,255,0.2)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: selCoordIds.has(c.id) ? 'rgba(0,245,255,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                      {selCoordIds.has(c.id) && <Check size={10} style={{ color: '#00F5FF' }} />}
                    </div>
                    <span className="text-xs" style={{ color: selCoordIds.has(c.id) ? '#00F5FF' : 'var(--brand-text)' }}>{c.name}</span>
                  </button>
                ))}
                {teamTab === 'consult' && filteredConsults.map(c => (
                  <button key={c.id} onClick={() => toggleConsult(c.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    style={{ background: selConsultIds.has(c.id) ? 'rgba(139,92,246,0.06)' : 'transparent', border: `1px solid ${selConsultIds.has(c.id) ? 'rgba(139,92,246,0.25)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: selConsultIds.has(c.id) ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                      {selConsultIds.has(c.id) && <Check size={10} style={{ color: '#a78bfa' }} />}
                    </div>
                    <span className="text-xs" style={{ color: selConsultIds.has(c.id) ? '#a78bfa' : 'var(--brand-text)' }}>{c.name}</span>
                  </button>
                ))}
                {teamTab === 'coord' && filteredCoords.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum coordenador encontrado</p>
                )}
                {teamTab === 'consult' && filteredConsults.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum consultor encontrado</p>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: saving ? 'rgba(0,245,255,0.05)' : 'rgba(0,245,255,0.1)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectEditByIdModal({ projectId, onClose, onSaved }: { projectId: number; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<ProjectFull>(`/projects/${projectId}`).then(setP).catch(() => toast.error('Erro ao carregar projeto')).finally(() => setLoading(false))
  }, [projectId])
  if (loading) return <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}><p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p></div>
  if (!p) return null
  return <ProjectInlineEditModal project={p} onClose={onClose} onSaved={onSaved} />
}

function ProjectStatusModal({ projectId, projectName, currentStatus, onClose, onSaved }: {
  projectId: number; projectName: string; currentStatus: string
  onClose: () => void; onSaved: (newStatus: string) => void
}) {
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const STATUS_OPTS = [
    { value: 'awaiting_start', label: 'Aguardando Início' },
    { value: 'started',        label: 'Em Andamento' },
    { value: 'paused',         label: 'Pausado' },
    { value: 'finished',       label: 'Encerrado' },
    { value: 'cancelled',      label: 'Cancelado' },
  ]
  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch(`/projects/${projectId}/status`, { status })
      toast.success('Status atualizado')
      onSaved(status)
    } catch { toast.error('Erro ao atualizar status') }
    finally { setSaving(false) }
  }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--brand-text)', outline: 'none' }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Alterar Status</p><h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{projectName}</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X size={14} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        <div className="p-5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Novo Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,245,255,0.1)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contract Card ────────────────────────────────────────────────────────────

function ContractKanbanCard({ card, index, onClick }: {
  card: ContractCard; index: number; onClick: () => void
}) {
  const badge = statusBadge(card)
  return (
    <Draggable draggableId={`contract-${card.id}`} index={index}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all"
          style={{
            background: snap.isDragging ? 'rgba(0,245,255,0.06)' : 'var(--brand-surface)',
            border: `1px solid ${snap.isDragging ? 'rgba(0,245,255,0.35)' : 'var(--brand-border)'}`,
            boxShadow: snap.isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
            ...prov.draggableProps.style,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>
                {card.customer_name}
              </p>
              {card.project_name && (
                <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>{card.project_name}</p>
              )}
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
              style={{ background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {card.categoria && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
                {card.categoria === 'projeto' ? 'Projeto' : 'Sustentação'}
              </span>
            )}
            {card.contract_type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
                {card.contract_type}
              </span>
            )}
            {card.tipo_faturamento && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-muted)' }}>
                {TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid var(--brand-border)' }}>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--brand-subtle)' }}>
              {!!card.horas_contratadas && card.horas_contratadas > 0 && (
                <span className="flex items-center gap-1"><Clock size={10} />{card.horas_contratadas}h</span>
              )}
              {card.valor_projeto != null && (
                <span>R$ {Number(card.valor_projeto).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
              )}
            </div>
            {card.project_code && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--brand-bg)', color: 'var(--brand-primary)' }}>
                {card.project_code}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ─── Project Card (for status columns) ───────────────────────────────────────

function ProjectKanbanCard({ card, index, onClick, onAction }: {
  card: ProjectCard; index: number; onClick: () => void; onAction: (action: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const statusColor: Record<string, string> = {
    paused:    '#f97316',
    cancelled: '#ef4444',
    finished:  '#6366f1',
    started:   '#22c55e',
    awaiting_start: '#94a3b8',
    liberado_para_testes: '#f59e0b',
  }
  const color = statusColor[card.status] ?? '#94a3b8'

  return (
    <Draggable draggableId={`project-${card.id}`} index={index}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all group"
          style={{
            background: snap.isDragging ? `${color}0A` : 'var(--brand-surface)',
            border: `1px solid ${snap.isDragging ? color : `${color}40`}`,
            boxShadow: snap.isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
            ...prov.draggableProps.style,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>
                {card.customer_name}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>{card.project_name}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: `${color}18`, color }}>
                {STATUS_LABEL[card.status] ?? card.status}
              </span>
              <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                  style={{ color: 'var(--brand-subtle)' }}
                >
                  <MoreVertical size={12} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-6 z-[100] w-44 rounded-xl overflow-hidden shadow-2xl"
                    style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    {PROJECT_MENU_ITEMS.map(item => {
                      const Icon = item.icon
                      return (
                        <button key={item.action}
                          onClick={e => { e.stopPropagation(); setMenuOpen(false); onAction(item.action) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                          style={{ color: 'var(--brand-text)' }}>
                          <Icon size={13} style={{ color: 'var(--brand-subtle)' }} />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${color}20` }}>
            <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>
              {card.coordinators?.[0] ? `👤 ${card.coordinators[0]}` : ''}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}12`, color }}>
              {card.code}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ─── Contract Detail Modal ────────────────────────────────────────────────────

function CardDetailModal({ card, onClose }: { card: ContractCard; onClose: () => void }) {
  const badge = statusBadge(card)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{card.customer_name}</p>
              {card.project_name && <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>{card.project_name}</p>}
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
              style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {([
              ['Categoria', card.categoria === 'projeto' ? 'Projeto' : card.categoria === 'sustentacao' ? 'Sustentação' : '—'],
              ['Tipo de Contrato', card.contract_type ?? '—'],
              ['Faturamento', card.tipo_faturamento ? (TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento) : '—'],
              ['Horas Contratadas', card.horas_contratadas ? `${card.horas_contratadas}h` : '—'],
              ['Valor do Projeto', card.valor_projeto != null ? `R$ ${Number(card.valor_projeto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'],
              ['Coordenador', card.kanban_coordinator ?? '—'],
              ['Status Contrato', card.status],
              ['Projeto', card.project_code ?? '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
              </div>
            ))}
          </div>
          {!card.is_complete && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>Contrato incompleto — preencha cliente, horas, tipo de contrato e faturamento para alocar a um coordenador.</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
          <button onClick={() => { window.location.href = '/contratos' }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
            <ExternalLink size={13} /> Ver Contrato
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanContent() {
  const router = useRouter()
  const { user } = useAuth()

  type SustGroups = Record<string, ContractCard[]>

  const [demandCards,       setDemandCards]       = useState<ContractCard[]>([])
  const [projectCards,      setProjectCards]       = useState<ProjectCard[]>([])
  const [coordinators,      setCoordinators]       = useState<Coordinator[]>([])
  const [sustGroups,        setSustGroups]         = useState<SustGroups>({
    sust_bh_fixo: [], sust_bh_mensal: [], sust_on_demand: [], sust_cloud: [], sust_bizify: [],
  })
  const [loading,           setLoading]            = useState(true)
  const [selected,          setSelected]           = useState<ContractCard | null>(null)
  const [projectAction,     setProjectAction]      = useState<{ card: ProjectCard; action: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<any>('/contracts/kanban')
      setDemandCards(r.demand_cards ?? r.contracts ?? [])
      setProjectCards(r.project_cards ?? [])
      setCoordinators(r.coordinators ?? [])
      setSustGroups({
        sust_bh_fixo:   r.sustentacao_groups?.sust_bh_fixo   ?? [],
        sust_bh_mensal: r.sustentacao_groups?.sust_bh_mensal ?? [],
        sust_on_demand: r.sustentacao_groups?.sust_on_demand ?? [],
        sust_cloud:     r.sustentacao_groups?.sust_cloud     ?? [],
        sust_bizify:    r.sustentacao_groups?.sust_bizify    ?? [],
      })
    } catch { toast.error('Erro ao carregar kanban') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const isSustAdmin = user?.type === 'admin' ||
    (user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao')

  // Column list: fixed → coordinators → sustentação group → bizify → project status
  const columns: Column[] = [
    ...FIXED_COLUMNS,
    ...coordinators.map(c => ({
      id:            `coordinator:${c.id}`,
      label:         c.name,
      type:          'coordinator' as const,
      coordinatorId: c.id,
      emoji:         '👤',
    })),
    ...SUSTENTACAO_COLS,
    BIZIFY_COL,
    ...STATUS_PROJECT_COLUMNS,
  ]

  // Contract cards per column
  const contractsInCol = (colId: string): ContractCard[] => {
    if (colId.startsWith('sust_')) return sustGroups[colId] ?? []
    return demandCards
      .filter(c => contractColumnId(c) === colId)
      .sort((a, b) => a.kanban_order - b.kanban_order)
  }

  // Active project cards per coordinator column
  const activeProjectsInCoordCol = (coordId: number): ProjectCard[] =>
    projectCards.filter(p =>
      isActiveProject(p) &&
      (p.coordinator_ids ?? []).includes(coordId)
    )

  // Project cards in status columns
  const projectsInStatusCol = (colId: string): ProjectCard[] => {
    const targetStatus = COL_TO_PROJECT_STATUS[colId]
    return projectCards.filter(p => p.status === targetStatus)
  }

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const toCol    = destination.droppableId
    const fromCol  = source.droppableId
    const [cardType, rawId] = draggableId.split('-')
    const cardId   = Number(rawId)

    // ── Moving a contract card ──
    if (cardType === 'contract') {
      const allSustCards = Object.values(sustGroups).flat()
      const card = [...demandCards, ...allSustCards].find(c => c.id === cardId)
      if (!card) return

      // ── From sustentação column to coordinator → allocate
      if (fromCol.startsWith('sust_') && toCol.startsWith('coordinator:')) {
        if (!isSustAdmin) { toast.error('Apenas admin ou coordenador de sustentação pode alocar.'); return }
        if (!card.is_complete) { toast.error('Contrato incompleto.'); return }
        const coordId = Number(toCol.split(':')[1])
        setSustGroups(prev => {
          const next = { ...prev }
          next[fromCol] = prev[fromCol].filter(c => c.id !== cardId)
          return next
        })
        try {
          await api.patch(`/contracts/${cardId}/kanban-move`, {
            to_column: `coordinator:${coordId}`, coordinator_id: coordId, order: destination.index,
          })
          await load()
          toast.success('🚀 Projeto gerado automaticamente!')
        } catch (e: any) { toast.error(e?.message ?? 'Erro ao alocar'); load() }
        return
      }

      // ── Between sustentação columns
      if (toCol.startsWith('sust_')) {
        if (!isSustAdmin) { toast.error('Apenas admin ou coordenador de sustentação pode mover.'); return }
        const destCol = SUSTENTACAO_COLS.find(c => c.id === toCol)
        if (!destCol?.sustentacaoValidator?.(card)) {
          toast.error('Tipo de contrato incompatível com esta coluna.')
          return
        }
        // Optimistic
        setSustGroups(prev => {
          const next = { ...prev }
          if (fromCol.startsWith('sust_')) next[fromCol] = prev[fromCol].filter(c => c.id !== cardId)
          next[toCol] = [...(prev[toCol] ?? []), { ...card, sustentacao_column: toCol }]
          return next
        })
        try {
          await api.patch(`/contracts/${cardId}/sustentacao-move`, { to_column: toCol })
        } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover'); load() }
        return
      }

      // ── Moving to a coordinator column from demand
      if (toCol.startsWith('coordinator:')) {
        const coordId = Number(toCol.split(':')[1])
        if (!card.is_complete) { toast.error('Contrato incompleto — preencha todos os campos antes de alocar.'); return }
        const wasNew = !card.project_id
        setDemandCards(prev => prev.map(c =>
          c.id === cardId ? { ...c, kanban_status: 'alocado', kanban_coordinator_id: coordId } : c
        ))
        try {
          await api.patch(`/contracts/${cardId}/kanban-move`, {
            to_column: `coordinator:${coordId}`, coordinator_id: coordId, order: destination.index,
          })
          await load()
          if (wasNew) toast.success('🚀 Projeto gerado automaticamente!')
          else toast.success('Coordenador atualizado')
        } catch (e: any) { toast.error(e?.message ?? 'Erro ao alocar contrato'); load() }
        return
      }

      // ── Block drops of sustentação cards into demand/fixed columns
      if (fromCol.startsWith('sust_')) return

      // ── Moving between fixed columns (novo ↔ pronto)
      const toKanbanStatus = toCol === 'pronto' ? 'aprovado' : 'backlog'
      setDemandCards(prev => prev.map(c =>
        c.id === cardId ? { ...c, kanban_status: toKanbanStatus, kanban_order: destination.index } : c
      ))
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toKanbanStatus, order: destination.index })
        toast.success('Card movido')
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover card'); load() }
      return
    }

    // ── Moving a project card to a status column ──
    if (cardType === 'project') {
      const newStatus = COL_TO_PROJECT_STATUS[toCol]
      if (!newStatus) return
      setProjectCards(prev => prev.map(p => p.id === cardId ? { ...p, status: newStatus } : p))
      try {
        await api.patch(`/projects/${cardId}/kanban-move`, { status: newStatus })
        toast.success('Projeto atualizado')
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover projeto'); load() }
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Kanban de Contratos</h1>
            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Arraste para o coordenador para gerar o projeto — depois gerencie nos status de execução</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/contratos')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
              <List size={13} /> Lista
            </button>
            <button onClick={() => router.push('/contratos/pipeline')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
              <Layers size={13} /> Pipeline
            </button>
            <button onClick={() => router.push('/contratos')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
              <Plus size={13} /> Novo Contrato
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-6 py-2 shrink-0 border-b text-[11px]" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Incompleto</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Pronto</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Projeto Ativo</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: SUST_COLOR }} />Sustentação</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BIZIFY_COLOR }} />Bizify</span>
          <span className="ml-auto flex items-center gap-1.5"><Users size={11} />Colunas de coordenador geram projeto automaticamente</span>
        </div>

        {/* Board */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-3 p-4 h-full" style={{ minWidth: `${columns.length * 272 + 60}px` }}>
                {columns.map((col, colIdx) => {
                  const isCoord        = col.type === 'coordinator'
                  const isStatusCol    = col.type === 'project_status'
                  const isPronto       = col.id === 'pronto'
                  const contractCards  = isStatusCol ? [] : contractsInCol(col.id)
                  const activeProjects = isCoord ? activeProjectsInCoordCol(col.coordinatorId!) : []
                  const statusProjects = isStatusCol ? projectsInStatusCol(col.id) : []
                  const totalCards     = contractCards.length + activeProjects.length + statusProjects.length

                  const prevCol  = columns[colIdx - 1]
                  const isSust   = col.type === 'sustentacao'
                  const isBizify = col.type === 'bizify'
                  const showSep  = (isStatusCol && prevCol?.type !== 'project_status') ||
                                   (isSust && prevCol?.type !== 'sustentacao') ||
                                   (isBizify && prevCol?.type !== 'bizify') ||
                                   (isCoord && prevCol?.type === 'fixed')

                  const borderColor = isStatusCol ? `${col.color}30`
                    : isSust    ? `${col.color}35`
                    : isBizify  ? `${BIZIFY_COLOR}35`
                    : isCoord   ? 'rgba(0,245,255,0.15)'
                    : isPronto  ? `${PRONTO_COLOR}40`
                    : 'var(--brand-border)'

                  const headerColor = isStatusCol ? col.color!
                    : isSust    ? col.color!
                    : isBizify  ? BIZIFY_COLOR
                    : isCoord   ? 'var(--brand-primary)'
                    : isPronto  ? PRONTO_COLOR
                    : 'var(--brand-text)'

                  return (
                    <div key={col.id} className="flex items-start gap-3">
                      {/* Separator */}
                      {showSep && (
                        <div className="self-stretch w-px shrink-0 mt-1"
                          style={{ background: isSust ? SUST_COLOR : isBizify ? BIZIFY_COLOR : 'var(--brand-border)', opacity: (isSust || isBizify) ? 0.5 : 0.4 }} />
                      )}

                      {/* Column */}
                      <div className="flex flex-col rounded-2xl shrink-0" style={{
                        width: 264,
                        background: isStatusCol ? `${col.color}05`
                          : isSust   ? `${col.color}04`
                          : isBizify ? `${BIZIFY_COLOR}04`
                          : isCoord  ? 'rgba(0,245,255,0.02)'
                          : isPronto ? `${PRONTO_COLOR}05`
                          : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${borderColor}`,
                      }}>
                        {/* Header */}
                        <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {col.emoji && <span className="text-base">{col.emoji}</span>}
                              {isStatusCol && col.id === 'col_pausado'   && <PauseCircle size={13} style={{ color: col.color }} />}
                              {isStatusCol && col.id === 'col_cancelado' && <XCircle size={13} style={{ color: col.color }} />}
                              {isStatusCol && col.id === 'col_encerrado' && <CheckCircle size={13} style={{ color: col.color }} />}
                              <p className="text-sm font-semibold" style={{ color: headerColor }}>{col.label}</p>
                            </div>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                              {totalCards}
                            </span>
                          </div>
                          {isSust && (
                            <>
                              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
                                style={{ background: `${SUST_COLOR}15`, color: SUST_COLOR, letterSpacing: '0.1em' }}>
                                SUSTENTAÇÃO
                              </span>
                              <p className="text-[10px] mt-0.5" style={{ color: SUST_COLOR, opacity: 0.65 }}>
                                Arraste entre colunas ou para coordenador
                              </p>
                            </>
                          )}
                          {isBizify && (
                            <>
                              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
                                style={{ background: `${BIZIFY_COLOR}15`, color: BIZIFY_COLOR, letterSpacing: '0.1em' }}>
                                BIZIFY
                              </span>
                              <p className="text-[10px] mt-0.5" style={{ color: BIZIFY_COLOR, opacity: 0.65 }}>
                                Arraste para coordenador alocar
                              </p>
                            </>
                          )}
                          {isPronto && (
                            <p className="text-[10px] mt-1" style={{ color: PRONTO_COLOR, opacity: 0.75 }}>
                              Aguardando geração de projeto
                            </p>
                          )}
                          {isCoord && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>
                              Arraste aqui → projeto criado automaticamente
                            </p>
                          )}
                        </div>

                        {/* Cards */}
                        <Droppable
                          droppableId={col.id}
                          isDropDisabled={
                            ((isSust || isBizify) && !isSustAdmin) ||
                            (isStatusCol && !['col_pausado', 'col_cancelado', 'col_encerrado'].includes(col.id))
                          }
                        >
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.droppableProps}
                              className="flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors"
                              style={{
                                minHeight: 80,
                                background: snap.isDraggingOver
                                  ? isStatusCol ? `${col.color}08` : (isSust || isBizify) ? `${col.color}08` : isCoord ? 'rgba(0,245,255,0.05)' : 'rgba(255,255,255,0.03)'
                                  : 'transparent',
                              }}
                            >
                              {contractCards.map((card, idx) => (
                                <ContractKanbanCard key={`c-${card.id}`} card={card} index={idx} onClick={() => setSelected(card)} />
                              ))}
                              {activeProjects.map((proj, idx) => (
                                <ProjectKanbanCard key={`p-${proj.id}`} card={proj} index={contractCards.length + idx} onClick={() => setProjectAction({ card: proj, action: 'view' })} onAction={action => setProjectAction({ card: proj, action })} />
                              ))}
                              {statusProjects.map((proj, idx) => (
                                <ProjectKanbanCard key={`ps-${proj.id}`} card={proj} index={idx} onClick={() => setProjectAction({ card: proj, action: 'view' })} onAction={action => setProjectAction({ card: proj, action })} />
                              ))}
                              {prov.placeholder}
                              {totalCards === 0 && !snap.isDraggingOver && (
                                <p className="text-center text-xs py-6" style={{ color: 'var(--brand-subtle)' }}>
                                  {isCoord ? 'Nenhum projeto alocado' : (isSust || isBizify) ? 'Sem contratos nesta categoria' : 'Vazio'}
                                </p>
                              )}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </DragDropContext>
        )}
      </div>

      {selected && (
        <CardDetailModal card={selected} onClose={() => setSelected(null)} />
      )}

      {projectAction && (() => {
        const { card, action } = projectAction
        const close = () => setProjectAction(null)
        const userType = (user as any)?.type
        if (action === 'view')       return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="overview" />
        if (action === 'edit')       return <ProjectEditByIdModal projectId={card.id} onClose={close} onSaved={close} />
        if (action === 'status')     return <ProjectStatusModal projectId={card.id} projectName={card.project_name} currentStatus={card.status} onClose={close} onSaved={st => { setProjectCards(prev => prev.map(p => p.id === card.id ? { ...p, status: st } : p)); close() }} />
        if (action === 'cost')       return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="consultants" />
        if (action === 'timesheets') return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="timesheets" />
        return null
      })()}
    </AppLayout>
  )
}

export default function KanbanPage() {
  return <KanbanContent />
}
