'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, CheckCircle, AlertCircle, AlertTriangle, Clock, Users, Layers, PauseCircle, XCircle, MoreVertical, Eye, Pencil, DollarSign, TrendingUp, BarChart2, UserCheck, X, Check, MessageSquare, Trash2, Search } from 'lucide-react'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'
import { ContractCreateModal } from '@/components/shared/ContractCreateModal'
import { ContractMessages } from '@/components/shared/ContractMessages'

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
  kanban_order?: number
  sustentacao_column?: string | null
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
  coordinator_percentage?: number | null
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
  consultant_rate_type?: string
}

interface CostSummary {
  project_info: {
    project_value?: number | null; initial_cost?: number | null
    initial_hours_balance?: number | null; tipo_faturamento?: string | null
    total_available_hours?: number; weighted_hourly_rate?: number
  }
  hours_summary: {
    total_logged_hours: number; approved_hours: number; pending_hours: number
    remaining_hours: number; general_balance?: number
    total_available_hours?: number; hours_percentage: number
  }
  cost_calculation: {
    total_cost: number; approved_cost: number; pending_cost: number
    is_on_demand: boolean; project_revenue: number
    aportes_total: number; receita_total: number
    custo_operacional: number; custo_total: number
    margin: number; margin_percentage: number
    coordinator_percentage: number; valor_coordenador: number
  }
  consultant_breakdown: ConsultantBreakdown[]
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
  name: string; description: string; status: string
  start_date: string; expected_end_date: string
  sold_hours: string; project_value: string
  hourly_rate: string; additional_hourly_rate: string
  initial_hours_balance: string; initial_cost: string
  consultant_hours: string; coordinator_hours: string
  parent_project_id: string
  service_type_id: string; contract_type_id: string
  tipo_faturamento: string; tipo_alocacao: string
  condicao_pagamento: string; vendedor_id: string
  cobra_despesa_cliente: boolean
  observacoes_contrato: string
  max_expense_per_consultant: string
  timesheet_retroactive_limit_days: string
  allow_manual_timesheets: boolean; allow_negative_balance: boolean
  coordinator_ids: number[]; consultant_ids: number[]; consultant_group_ids: number[]
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
  { action: 'view',       label: 'Visualizar',       icon: Eye },
  { action: 'edit',       label: 'Editar',            icon: Pencil },
  { action: 'chat',       label: 'Chat',              icon: MessageSquare },
  { action: 'status',     label: 'Alterar Status',    icon: Layers },
  { action: 'cost',       label: 'Custo',             icon: DollarSign },
  { action: 'timesheets', label: 'Apontamentos',      icon: Clock },
  { action: 'expenses',   label: 'Despesas',          icon: BarChart2 },
  { action: 'aportes',    label: 'Aportes',           icon: TrendingUp },
  { action: 'team',       label: 'Selecionar Equipe', icon: Users },
  { action: 'delete',     label: 'Excluir',           icon: Trash2,     danger: true },
]

const CONTRACT_MENU_ITEMS = [
  { action: 'view',   label: 'Visualizar', icon: Eye },
  { action: 'edit',   label: 'Editar',     icon: Pencil },
  { action: 'chat',   label: 'Chat',       icon: MessageSquare },
  { action: 'delete', label: 'Excluir',    icon: Trash2 },
  { action: 'log',   label: 'Histórico',  icon: Clock },
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
    sustentacaoValidator: (c) => !!(
      c.contract_type?.toLowerCase().includes('banco de horas fixo') ||
      c.contract_type?.toLowerCase().includes('banco horas fixo') ||
      c.tipo_faturamento === 'banco_horas_fixo'
    ),
  },
  {
    id: 'sust_bh_mensal', label: 'BH Mensal', type: 'sustentacao', emoji: '📅', color: SUST_COLOR,
    sustentacaoValidator: (c) => !!(
      c.contract_type?.toLowerCase().includes('banco de horas mensal') ||
      c.contract_type?.toLowerCase().includes('banco horas mensal') ||
      c.tipo_faturamento === 'banco_horas_mensal'
    ),
  },
  {
    id: 'sust_on_demand', label: 'On Demand', type: 'sustentacao', emoji: '⚡', color: SUST_COLOR,
    sustentacaoValidator: (c) => !!(
      c.contract_type?.toLowerCase().includes('on demand') ||
      c.tipo_faturamento === 'on_demand'
    ),
  },
  {
    id: 'sust_cloud',     label: 'Cloud',     type: 'sustentacao', emoji: '☁️', color: '#38bdf8',
    sustentacaoValidator: (c) => !!(
      c.contract_type?.toLowerCase().includes('cloud') ||
      c.service_type?.toLowerCase().includes('cloud')
    ),
  },
]

const BIZIFY_COL: Column = {
  id: 'sust_bizify', label: 'Bizify', type: 'bizify', emoji: '⚡', color: BIZIFY_COLOR,
  sustentacaoValidator: (c) => !!(c.service_type?.toLowerCase().includes('bizify') || c.contract_type?.toLowerCase().includes('bizify')),
}

const STATUS_PROJECT_COLUMNS: Column[] = [
  { id: 'col_encerrado', label: 'Encerrado', type: 'project_status', projectStatus: 'finished',  color: '#22c55e' },
  { id: 'col_pausado',   label: 'Pausado',   type: 'project_status', projectStatus: 'paused',    color: '#eab308' },
  { id: 'col_cancelado', label: 'Cancelado', type: 'project_status', projectStatus: 'cancelled', color: '#ef4444' },
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
  const [tab, setTab] = useState<'overview' | 'financial' | 'consultants' | 'timesheets' | 'cost'>((initialTab as any) ?? 'overview')
  const [breakdown, setBreakdown] = useState<ConsultantBreakdown[]>([])
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
  const [tsLoading, setTsLoading] = useState(false)
  const [tsLoaded, setTsLoaded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const reload = () => {
    setLoading(true)
    Promise.all([
      api.get<ProjectFull>(`/projects/${projectId}`),
      api.get<CostSummary>(`/projects/${projectId}/cost-summary`).catch(() => null),
    ]).then(([proj, cs]) => {
      setP(proj)
      setCostSummary(cs)
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
    { id: 'cost'        as const, label: 'Custo' },
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

            {tab === 'cost' && (
              <div className="space-y-4">
                {!costSummary ? (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado de custo disponível.</p>
                ) : (() => {
                  const { project_info: pi, hours_summary: hs, cost_calculation: cc, consultant_breakdown: cb } = costSummary
                  const isPositive = cc.margin >= 0
                  const marginColor = isPositive ? '#22c55e' : '#ef4444'
                  const hoursIniciais = Math.abs(pi.initial_hours_balance ?? 0)
                  const horasConsumidas = hoursIniciais + hs.total_logged_hours
                  const totalDisp = hs.total_available_hours ?? pi.total_available_hours ?? 0
                  const horasRestantes = Math.max(0, totalDisp - horasConsumidas)
                  const pctUso = totalDisp > 0 ? Math.min(100, (horasConsumidas / totalDisp) * 100) : 0
                  const hoursBarColor = pctUso >= 90 ? '#ef4444' : pctUso >= 70 ? '#f59e0b' : '#22c55e'
                  const showHistorico = (pi.initial_hours_balance ?? 0) !== 0 || (pi.initial_cost ?? 0) !== 0
                  const isOnDemand = cc.is_on_demand
                  return (
                    <>
                      {/* Bloco 1 — RECEITA */}
                      <div className="rounded-xl p-4" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.18)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: '#00F5FF' }}>
                          <DollarSign size={11} />Receita {isOnDemand && <span className="text-[9px] font-normal ml-1 opacity-70">(On Demand — horas × R$/h)</span>}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: isOnDemand ? 'Horas × R$/h' : 'Valor Projeto', value: fmtBRL(cc.project_revenue) },
                            { label: 'Aportes',        value: fmtBRL(cc.aportes_total) },
                            { label: 'Receita Total',  value: fmtBRL(cc.receita_total), highlight: true },
                          ].map(c => (
                            <div key={c.label} className="rounded-lg p-2.5" style={{ background: 'var(--brand-bg)', border: `1px solid ${c.highlight ? 'rgba(0,245,255,0.35)' : 'var(--brand-border)'}` }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: c.highlight ? '#00F5FF' : 'var(--brand-text)' }}>{c.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bloco 2 — CUSTO */}
                      <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.18)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                          <TrendingUp size={11} />Custo
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'Custo Inicial',     value: fmtBRL(pi.initial_cost ?? 0) },
                            { label: 'Custo Operacional', value: fmtBRL(cc.custo_operacional) },
                            { label: 'Custo Total',        value: fmtBRL(cc.custo_total), highlight: true },
                          ].map(c => (
                            <div key={c.label} className="rounded-lg p-2.5" style={{ background: 'var(--brand-bg)', border: `1px solid ${c.highlight ? 'rgba(245,158,11,0.35)' : 'var(--brand-border)'}` }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: c.highlight ? '#f59e0b' : 'var(--brand-text)' }}>{c.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bloco 3 — RESULTADO */}
                      <div className="rounded-xl p-4" style={{ background: isPositive ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)', border: `1px solid ${isPositive ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: marginColor }}>
                          <BarChart2 size={11} />Resultado
                        </p>
                        <p className="text-[10px] tabular-nums mb-3" style={{ color: 'var(--brand-subtle)' }}>
                          {fmtBRL(cc.receita_total)} <span className="opacity-50">−</span> {fmtBRL(cc.custo_total)} <span className="opacity-50">=</span> <span style={{ color: marginColor }}>{fmtBRL(cc.margin)}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg p-3.5" style={{ background: 'var(--brand-bg)', border: `1px solid ${isPositive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Margem R$</p>
                            <p className="text-xl font-bold tabular-nums" style={{ color: marginColor }}>{fmtBRL(cc.margin)}</p>
                          </div>
                          <div className="rounded-lg p-3.5" style={{ background: 'var(--brand-bg)', border: `1px solid ${isPositive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Margem %</p>
                            <p className="text-xl font-bold tabular-nums" style={{ color: marginColor }}>{cc.margin_percentage.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>

                      {/* Bloco 4 — COORDENADOR (condicional) */}
                      {cc.coordinator_percentage > 0 && (
                        <div className="rounded-xl p-4" style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.18)' }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: '#a78bfa' }}>
                            <UserCheck size={11} />Coordenador
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg p-2.5" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>% da Margem</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: '#a78bfa' }}>{cc.coordinator_percentage.toFixed(1)}%</p>
                            </div>
                            <div className="rounded-lg p-2.5" style={{ background: 'var(--brand-bg)', border: '1px solid rgba(167,139,250,0.35)' }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor a Receber</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: '#a78bfa' }}>{fmtBRL(cc.valor_coordenador)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bloco 5 — HORAS */}
                      <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Horas</p>
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          {[
                            { label: 'Iniciais',    value: `${hoursIniciais.toFixed(1)}h`,          color: 'var(--brand-text)' },
                            { label: 'Apontadas',   value: `${hs.total_logged_hours.toFixed(1)}h`,  color: 'var(--brand-text)' },
                            { label: 'Consumido',   value: `${horasConsumidas.toFixed(1)}h`,        color: 'var(--brand-text)' },
                            { label: '% Uso',       value: `${pctUso.toFixed(1)}%`,                 color: hoursBarColor },
                            { label: 'Restantes',   value: `${horasRestantes.toFixed(1)}h`,         color: horasRestantes < 10 ? '#ef4444' : 'var(--brand-text)' },
                          ].map(c => (
                            <div key={c.label}>
                              <p className="text-[9px]" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p>
                              <p className="font-bold tabular-nums mt-0.5 text-xs" style={{ color: c.color }}>{c.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--brand-border)' }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pctUso}%`, background: hoursBarColor }} />
                        </div>
                        <p className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>{pctUso.toFixed(1)}% das horas utilizadas</p>
                      </div>

                      {/* Bloco 6 — HISTÓRICO */}
                      {showHistorico && (
                        <div className="rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)' }}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider w-full mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Saldo do sistema anterior</p>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--brand-subtle)' }}>Horas iniciais: <strong>{(pi.initial_hours_balance ?? 0) < 0 ? '-' : ''}{Math.abs(pi.initial_hours_balance ?? 0).toFixed(1)}h</strong></span>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--brand-subtle)' }}>Custo inicial: <strong>{fmtBRL(pi.initial_cost ?? 0)}</strong></span>
                        </div>
                      )}

                      {/* Tabela de custo por consultor */}
                      {cb.length > 0 && (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                          <div className="px-4 py-3" style={{ background: 'var(--brand-surface)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--brand-subtle)' }}>
                              <UserCheck size={11} />Custo por Consultor
                            </p>
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand-border)' }}>
                                {['Consultor','Hs Total','Aprovadas','Pendentes','Taxa/h','Custo'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cb.map((c, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-text)' }}>{c.total_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: '#22c55e' }}>{c.approved_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: '#f59e0b' }}>{c.pending_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums text-[11px]" style={{ color: 'var(--brand-muted)' }}>
                                    {c.consultant_hourly_rate != null ? fmtBRL(c.consultant_hourly_rate) : '—'}
                                    {c.consultant_rate_type === 'monthly' && <span className="ml-1 opacity-60">÷180</span>}
                                  </td>
                                  <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{fmtBRL(c.cost)}</td>
                                </tr>
                              ))}
                              <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid var(--brand-border)' }}>
                                <td className="px-3 py-2.5 font-bold text-[11px] uppercase" style={{ color: 'var(--brand-subtle)' }} colSpan={5}>Total Operacional</td>
                                <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: '#00F5FF' }}>{fmtBRL(cc.custo_operacional)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )
                })()}
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
  const d = project as any
  const [form, setForm] = useState<ProjectEditForm>({
    name:                            d.name ?? '',
    description:                     d.description ?? '',
    status:                          d.status ?? 'awaiting_start',
    start_date:                      d.start_date?.slice(0, 10) ?? '',
    expected_end_date:               d.expected_end_date?.slice(0, 10) ?? '',
    sold_hours:                      d.sold_hours != null ? String(d.sold_hours) : '',
    project_value:                   d.project_value != null ? String(d.project_value) : '',
    hourly_rate:                     d.hourly_rate != null ? String(d.hourly_rate) : '',
    additional_hourly_rate:          d.additional_hourly_rate != null ? String(d.additional_hourly_rate) : '',
    initial_hours_balance:           d.initial_hours_balance != null ? String(d.initial_hours_balance) : '',
    initial_cost:                    d.initial_cost != null ? String(d.initial_cost) : '',
    consultant_hours:                d.consultant_hours != null ? String(d.consultant_hours) : '',
    coordinator_hours:               d.coordinator_hours != null ? String(d.coordinator_hours) : '',
    parent_project_id:               d.parent_project_id ? String(d.parent_project_id) : '',
    service_type_id:                 d.service_type_id ? String(d.service_type_id) : (d.service_type?.id ? String(d.service_type.id) : ''),
    contract_type_id:                d.contract_type_id ? String(d.contract_type_id) : (d.contract_type?.id ? String(d.contract_type.id) : ''),
    tipo_faturamento:                d.tipo_faturamento ?? '',
    tipo_alocacao:                   d.tipo_alocacao ?? '',
    condicao_pagamento:              d.condicao_pagamento ?? '',
    vendedor_id:                     d.vendedor_id ? String(d.vendedor_id) : '',
    cobra_despesa_cliente:           d.cobra_despesa_cliente ?? false,
    observacoes_contrato:            d.observacoes_contrato ?? '',
    max_expense_per_consultant:      d.max_expense_per_consultant != null ? String(d.max_expense_per_consultant) : '',
    timesheet_retroactive_limit_days: d.timesheet_retroactive_limit_days != null ? String(d.timesheet_retroactive_limit_days) : '',
    allow_manual_timesheets:         d.allow_manual_timesheets ?? true,
    allow_negative_balance:          d.allow_negative_balance ?? false,
    coordinator_ids:                 (d.coordinators ?? d.approvers ?? []).map((c: any) => c.id),
    consultant_ids:                  (d.consultants ?? []).map((c: any) => c.id),
    consultant_group_ids:            (d.consultant_groups ?? []).map((g: any) => g.id),
  })
  const [saving, setSaving] = useState(false)
  const [optServiceTypes,   setOptServiceTypes]   = useState<{id:number;name:string}[]>([])
  const [optContractTypes,  setOptContractTypes]  = useState<{id:number;name:string}[]>([])
  const [optCoordinators,   setOptCoordinators]   = useState<{id:number;name:string}[]>([])
  const [optConsultants,    setOptConsultants]    = useState<{id:number;name:string}[]>([])
  const [optGroups,         setOptGroups]         = useState<{id:number;name:string}[]>([])
  const [optParentProjects, setOptParentProjects] = useState<{id:number;name:string}[]>([])
  const [teamSearch,        setTeamSearch]        = useState('')
  const [teamTab,           setTeamTab]           = useState<'coord'|'consult'|'group'>('coord')

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.allSettled([
      api.get<any>('/service-types?pageSize=100'),
      api.get<any>('/contract-types?pageSize=100'),
      api.get<any>('/users?type=coordenador&coordinator_type=projetos&pageSize=200'),
      api.get<any>('/users?type=consultor&pageSize=200'),
      api.get<any>('/consultant-groups?pageSize=100&active=1'),
    ]).then(([st, ct, coords, consults, grps]) => {
      if (st.status === 'fulfilled')       setOptServiceTypes(items(st.value))
      if (ct.status === 'fulfilled')       setOptContractTypes(items(ct.value))
      if (coords.status === 'fulfilled')   setOptCoordinators(items(coords.value))
      if (consults.status === 'fulfilled') setOptConsultants(items(consults.value))
      if (grps.status === 'fulfilled')     setOptGroups(items(grps.value))
    })
    if (d.customer_id) {
      const qs = new URLSearchParams({ pageSize: '200', parent_projects_only: 'true', customer_id: String(d.customer_id), exclude_id: String(project.id) })
      api.get<any>(`/projects?${qs}`).then(r => {
        setOptParentProjects(items(r).map((p: any) => ({ id: p.id, name: `${p.code} - ${p.name}` })))
      }).catch(() => {})
    }
  }, [])

  const toggleId = (ids: number[], id: number) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  const setF = (key: keyof ProjectEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(), description: form.description || null, status: form.status,
        start_date: form.start_date || null, expected_end_date: form.expected_end_date || null,
        allow_manual_timesheets: form.allow_manual_timesheets,
        allow_negative_balance: form.allow_negative_balance,
        cobra_despesa_cliente: form.cobra_despesa_cliente,
        observacoes_contrato: form.observacoes_contrato || null,
        condicao_pagamento: form.condicao_pagamento || null,
        coordinator_ids: form.coordinator_ids,
        consultant_ids: form.consultant_ids,
        consultant_group_ids: form.consultant_group_ids,
      }
      if (form.service_type_id)               payload.service_type_id               = Number(form.service_type_id)
      if (form.contract_type_id)              payload.contract_type_id              = Number(form.contract_type_id)
      if (form.parent_project_id)             payload.parent_project_id             = Number(form.parent_project_id)
      if (form.vendedor_id)                   payload.vendedor_id                   = Number(form.vendedor_id)
      if (form.tipo_faturamento)              payload.tipo_faturamento              = form.tipo_faturamento
      if (form.tipo_alocacao)                 payload.tipo_alocacao                 = form.tipo_alocacao
      if (form.project_value !== '')          payload.project_value                 = Number(form.project_value)
      if (form.hourly_rate !== '')            payload.hourly_rate                   = Number(form.hourly_rate)
      if (form.additional_hourly_rate !== '') payload.additional_hourly_rate        = Number(form.additional_hourly_rate)
      if (form.sold_hours !== '')             payload.sold_hours                    = Number(form.sold_hours)
      if (form.consultant_hours !== '')       payload.consultant_hours              = Number(form.consultant_hours)
      if (form.coordinator_hours !== '')      payload.coordinator_hours             = Number(form.coordinator_hours)
      if (form.initial_hours_balance !== '')  payload.initial_hours_balance         = Number(form.initial_hours_balance)
      if (form.initial_cost !== '')           payload.initial_cost                  = Number(form.initial_cost)
      if (form.max_expense_per_consultant !== '') payload.max_expense_per_consultant = Number(form.max_expense_per_consultant)
      if (form.timesheet_retroactive_limit_days !== '') payload.timesheet_retroactive_limit_days = Number(form.timesheet_retroactive_limit_days)
      await api.put(`/projects/${project.id}`, payload)
      toast.success('Projeto atualizado')
      onSaved()
    } catch { toast.error('Erro ao salvar projeto') }
    finally { setSaving(false) }
  }

  const iStyle: React.CSSProperties = { width: '100%', background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--brand-text)', outline: 'none' }
  const lStyle: React.CSSProperties = { fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-subtle)', marginBottom: '0.375rem', display: 'block' }
  const SecTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold uppercase tracking-wider pt-3 pb-2" style={{ color: 'var(--brand-subtle)', borderTop: '1px solid var(--brand-border)' }}>{children}</p>
  )
  const Toggle2 = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
      <button type="button" onClick={() => onChange(!checked)} className="relative w-10 h-5 rounded-full transition-colors shrink-0" style={{ background: checked ? '#22c55e' : 'rgba(255,255,255,0.1)' }}>
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
      <span className="text-xs" style={{ color: 'var(--brand-text)' }}>{label}</span>
    </div>
  )
  const STATUS_OPTS = [
    { value: 'awaiting_start', label: 'Aguardando Início' },
    { value: 'started',        label: 'Em Andamento' },
    { value: 'paused',         label: 'Pausado' },
    { value: 'finished',       label: 'Encerrado' },
    { value: 'cancelled',      label: 'Cancelado' },
  ]
  const filteredCoords   = optCoordinators.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredConsults = optConsultants.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredGroups   = optGroups.filter(g => g.name.toLowerCase().includes(teamSearch.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-5xl max-h-[94vh]" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(0,245,255,0.25)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{d.code}</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>Editar Projeto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
              <div><label style={lStyle}>Nome do Projeto *</label><input value={form.name} onChange={setF('name')} style={iStyle} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Status</label><select value={form.status} onChange={setF('status')} style={iStyle}>{STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label style={lStyle}>Data de Início</label><input type="date" value={form.start_date} onChange={setF('start_date')} style={iStyle} /></div>
              </div>
              <div><label style={lStyle}>Data de Conclusão</label><input type="date" value={form.expected_end_date} onChange={setF('expected_end_date')} style={iStyle} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Tipo de Contrato</label><select value={form.contract_type_id} onChange={setF('contract_type_id')} style={iStyle}><option value="">Selecione...</option>{optContractTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label style={lStyle}>Tipo de Serviço</label><select value={form.service_type_id} onChange={setF('service_type_id')} style={iStyle}><option value="">Selecione...</option>{optServiceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div><label style={lStyle}>Projeto Pai (Subprojeto)</label><select value={form.parent_project_id} onChange={setF('parent_project_id')} style={iStyle}><option value="">Nenhum</option>{optParentProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label style={lStyle}>Descrição</label><textarea value={form.description} onChange={setF('description')} style={{ ...iStyle, resize: 'vertical', minHeight: '64px' }} /></div>

              <SecTitle>Financeiro</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Valor do Projeto (R$)</label><input type="number" value={form.project_value} onChange={setF('project_value')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Valor da Hora (R$)</label><input type="number" value={form.hourly_rate} onChange={setF('hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Hora Adicional (R$)</label><input type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Horas Contratadas</label><input type="number" value={form.sold_hours} onChange={setF('sold_hours')} style={iStyle} placeholder="0" step="1" /></div>
                <div><label style={lStyle}>% Horas Coordenador</label><input type="number" value={form.coordinator_hours} onChange={setF('coordinator_hours')} style={iStyle} placeholder="0" step="1" min="0" max="100" /></div>
                <div><label style={lStyle}>Horas Consultor</label><input type="number" value={form.consultant_hours} onChange={setF('consultant_hours')} style={iStyle} placeholder="0" step="1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl p-3" style={{ border: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="col-span-2"><label style={{ ...lStyle, marginBottom: 0 }}>Histórico do sistema anterior</label></div>
                <div><label style={lStyle}>Saldo Inicial de Horas</label><input type="number" value={form.initial_hours_balance} onChange={setF('initial_hours_balance')} style={iStyle} placeholder="0" step="0.5" /></div>
                <div><label style={lStyle}>Custo Inicial (R$)</label><input type="number" value={form.initial_cost} onChange={setF('initial_cost')} style={iStyle} placeholder="0.00" step="0.01" /></div>
              </div>

              <SecTitle>Informações Comerciais</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Tipo de Faturamento</label><select value={form.tipo_faturamento} onChange={setF('tipo_faturamento')} style={iStyle}><option value="">Não definido</option><option value="on_demand">On Demand</option><option value="banco_horas_mensal">Banco de Horas Mensal</option><option value="banco_horas_fixo">Banco de Horas Fixo</option><option value="por_servico">Por Serviço</option><option value="saas">SaaS</option></select></div>
                <div><label style={lStyle}>Tipo de Alocação</label><select value={form.tipo_alocacao} onChange={setF('tipo_alocacao')} style={iStyle}><option value="">Não definido</option><option value="remoto">Remoto</option><option value="presencial">Presencial</option><option value="ambos">Ambos</option></select></div>
                <div><label style={lStyle}>Condição de Pagamento</label><input value={form.condicao_pagamento} onChange={setF('condicao_pagamento')} style={iStyle} placeholder="Ex: 30/60/90 dias" /></div>
                <div><label style={lStyle}>Vendedor</label><select value={form.vendedor_id} onChange={setF('vendedor_id')} style={iStyle}><option value="">Não definido</option>{optConsultants.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              </div>
              <div><label style={lStyle}>Observações do Contrato</label><textarea value={form.observacoes_contrato} onChange={setF('observacoes_contrato')} style={{ ...iStyle, resize: 'vertical', minHeight: '56px' }} /></div>

              <SecTitle>Política de Despesas e Apontamentos</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Valor Máx. por Consultor (R$)</label><input type="number" value={form.max_expense_per_consultant} onChange={setF('max_expense_per_consultant')} style={iStyle} placeholder="Ilimitado" min="0" step="0.01" /><p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>Vazio = ilimitado</p></div>
                <div><label style={lStyle}>Prazo para Lançamento (dias)</label><input type="number" value={form.timesheet_retroactive_limit_days} onChange={setF('timesheet_retroactive_limit_days')} style={iStyle} placeholder="Padrão global" min="0" max="365" /></div>
              </div>
              <Toggle2 checked={form.allow_manual_timesheets} onChange={v => setForm(p => ({ ...p, allow_manual_timesheets: v }))} label="Apontamentos manuais permitidos" />
              <Toggle2 checked={form.allow_negative_balance} onChange={v => setForm(p => ({ ...p, allow_negative_balance: v }))} label="Permitir saldo negativo de horas" />
            </div>

            <div className="flex flex-col">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Equipe Alocada</p>
              <div className="flex gap-1 mb-3 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                {([['coord','Coordenadores',form.coordinator_ids.length],['consult','Consultores',form.consultant_ids.length],['group','Grupos',form.consultant_group_ids.length]] as const).map(([id,label,count]) => (
                  <button key={id} onClick={() => { setTeamTab(id); setTeamSearch('') }}
                    className="px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                    style={{ color: teamTab === id ? '#00F5FF' : 'var(--brand-subtle)', borderBottom: teamTab === id ? '2px solid #00F5FF' : '2px solid transparent', marginBottom: '-1px' }}>
                    {label}{count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>{count}</span>}
                  </button>
                ))}
              </div>
              <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Buscar..."
                className="w-full text-xs px-3 py-2 rounded-xl outline-none mb-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
              <div className="flex-1 overflow-y-auto space-y-1 rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--brand-border)', maxHeight: 520 }}>
                {teamTab === 'coord' && filteredCoords.map(c => {
                  const sel = form.coordinator_ids.includes(c.id)
                  return <button key={c.id} onClick={() => setForm(p => ({ ...p, coordinator_ids: toggleId(p.coordinator_ids, c.id) }))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5" style={{ background: sel ? 'rgba(0,245,255,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(0,245,255,0.2)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(0,245,255,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>{sel && <Check size={10} style={{ color: '#00F5FF' }} />}</div>
                    <span className="text-xs" style={{ color: sel ? '#00F5FF' : 'var(--brand-text)' }}>{c.name}</span>
                  </button>
                })}
                {teamTab === 'consult' && filteredConsults.map(c => {
                  const sel = form.consultant_ids.includes(c.id)
                  return <button key={c.id} onClick={() => setForm(p => ({ ...p, consultant_ids: toggleId(p.consultant_ids, c.id) }))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5" style={{ background: sel ? 'rgba(139,92,246,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(139,92,246,0.25)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>{sel && <Check size={10} style={{ color: '#a78bfa' }} />}</div>
                    <span className="text-xs" style={{ color: sel ? '#a78bfa' : 'var(--brand-text)' }}>{c.name}</span>
                  </button>
                })}
                {teamTab === 'group' && filteredGroups.map(g => {
                  const sel = form.consultant_group_ids.includes(g.id)
                  return <button key={g.id} onClick={() => setForm(p => ({ ...p, consultant_group_ids: toggleId(p.consultant_group_ids, g.id) }))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5" style={{ background: sel ? 'rgba(245,158,11,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(245,158,11,0.25)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>{sel && <Check size={10} style={{ color: '#f59e0b' }} />}</div>
                    <span className="text-xs" style={{ color: sel ? '#f59e0b' : 'var(--brand-text)' }}>{g.name}</span>
                  </button>
                })}
                {teamTab === 'coord' && filteredCoords.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
                {teamTab === 'consult' && filteredConsults.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
                {teamTab === 'group' && filteredGroups.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
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

function ProjectTeamModal({ projectId, projectName, onClose, onSaved }: { projectId: number; projectName: string; onClose: () => void; onSaved: () => void }) {
  const [consultants, setConsultants] = useState<{ id: number; name: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<any>(`/projects/${projectId}`),
      api.get<any>('/users?type=consultor&pageSize=200'),
    ]).then(([proj, usrs]) => {
      setConsultants(usrs?.items ?? usrs?.data ?? [])
      const ids = (proj?.consultants ?? []).map((c: { id: number }) => c.id)
      setSelectedIds(new Set(ids))
    }).catch(() => toast.error('Erro ao carregar equipe'))
    .finally(() => setLoading(false))
  }, [projectId])

  const filtered = consultants.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex flex-col w-full max-w-lg rounded-2xl max-h-[80vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Selecionar Equipe</p><h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{projectName}</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        <div className="px-5 pt-4 shrink-0">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar consultor..."
            className="w-full text-sm px-3 py-2 rounded-xl outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
          <p className="text-[10px] mt-2 mb-1" style={{ color: 'var(--brand-subtle)' }}>{selectedIds.size} consultor(es) selecionado(s)</p>
        </div>
        {loading
          ? <div className="flex-1 flex items-center justify-center py-10"><p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p></div>
          : (
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <div className="space-y-1 mt-2">
                {filtered.map(c => (
                  <button key={c.id} onClick={() => toggle(c.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                    style={{ background: selectedIds.has(c.id) ? 'rgba(139,92,246,0.08)' : 'transparent', border: `1px solid ${selectedIds.has(c.id) ? 'rgba(139,92,246,0.3)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: selectedIds.has(c.id) ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                      {selectedIds.has(c.id) && <Check size={11} style={{ color: '#a78bfa' }} />}
                    </div>
                    <span className="text-sm" style={{ color: selectedIds.has(c.id) ? '#a78bfa' : 'var(--brand-text)' }}>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        }
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button onClick={async () => {
            setSaving(true)
            try { await api.put(`/projects/${projectId}`, { consultant_ids: Array.from(selectedIds) }); toast.success('Equipe atualizada'); onSaved() }
            catch { toast.error('Erro ao salvar equipe') }
            finally { setSaving(false) }
          }} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Equipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContractKanbanCard({ card, index, onClick, onAction, onMove, availableColumns }: {
  card: ContractCard; index: number; onClick: () => void; onAction?: (action: string) => void
  onMove?: (toCol: string) => void; availableColumns?: { id: string; label: string }[]
}) {
  const badge = statusBadge(card)
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

  return (
    <Draggable draggableId={`contract-${card.id}`} index={index}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all group"
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
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: badge.bg, color: badge.color }}>
                {badge.label}
              </span>
              {onAction && (
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
                      {CONTRACT_MENU_ITEMS.map(item => {
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
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {card.categoria && (() => {
              const svL = card.service_type?.toLowerCase() ?? ''
              const ctL = card.contract_type?.toLowerCase() ?? ''
              const effectivelySust = card.categoria === 'sustentacao'
                || svL.includes('sustent') || svL.includes('cloud') || svL.includes('bizify')
                || ctL.includes('banco de horas') || ctL.includes('on demand') || ctL.includes('cloud') || ctL.includes('bizify') || ctL.includes('saas')
              return (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
                  {effectivelySust ? 'Sustentação' : 'Projeto'}
                </span>
              )
            })()}
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
              {card.horas_contratadas != null && card.horas_contratadas > 0 && (
                <span className="flex items-center gap-1"><Clock size={10} />{card.horas_contratadas}h</span>
              )}
              {card.valor_projeto != null && (
                <span>R$ {Number(card.valor_projeto).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {onAction && (
                <button onClick={e => { e.stopPropagation(); onAction('chat') }}
                  className="p-1 rounded-md hover:bg-white/10 transition-colors" title="Abrir Chat"
                  style={{ color: 'var(--brand-subtle)' }}>
                  <MessageSquare size={11} />
                </button>
              )}
              {card.project_code && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--brand-bg)', color: 'var(--brand-primary)' }}>
                  {card.project_code}
                </span>
              )}
            </div>
          </div>
          {availableColumns && availableColumns.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--brand-border)' }}
              onClick={e => e.stopPropagation()}>
              <select
                value=""
                onChange={e => { if (e.target.value) { onMove?.(e.target.value); e.currentTarget.value = '' } }}
                className="w-full text-[10px] rounded-lg px-2 py-1.5 cursor-pointer appearance-none"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)', outline: 'none' }}
              >
                <option value="" disabled>Mover para...</option>
                {availableColumns.map(col => (
                  <option key={col.id} value={col.id}>{col.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}

// ─── Project Card (for status columns) ───────────────────────────────────────

function ProjectKanbanCard({ card, index, onClick, onAction, onMove, availableColumns }: {
  card: ProjectCard; index: number; onClick: () => void; onAction: (action: string) => void
  onMove?: (toCol: string) => void; availableColumns?: { id: string; label: string }[]
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
                      const isDanger = (item as any).danger
                      return (
                        <button key={item.action}
                          onClick={e => { e.stopPropagation(); setMenuOpen(false); onAction(item.action) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                          style={{ color: isDanger ? '#ef4444' : 'var(--brand-text)' }}>
                          <Icon size={13} style={{ color: isDanger ? '#ef4444' : 'var(--brand-subtle)' }} />
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
            <div className="flex items-center gap-1">
              {onAction && (
                <button onClick={e => { e.stopPropagation(); onAction('chat') }}
                  className="p-1 rounded-md hover:bg-white/10 transition-colors" title="Abrir Chat"
                  style={{ color: 'var(--brand-subtle)' }}>
                  <MessageSquare size={11} />
                </button>
              )}
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}12`, color }}>
                {card.code}
              </span>
            </div>
          </div>
          {availableColumns && availableColumns.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${color}20` }}
              onClick={e => e.stopPropagation()}>
              <select
                value=""
                onChange={e => { if (e.target.value) { onMove?.(e.target.value); e.currentTarget.value = '' } }}
                className="w-full text-[10px] rounded-lg px-2 py-1.5 cursor-pointer appearance-none"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)', outline: 'none' }}
              >
                <option value="" disabled>Mover para...</option>
                {availableColumns.map(col => (
                  <option key={col.id} value={col.id}>{col.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}

// ─── Contract Detail Modal ────────────────────────────────────────────────────

const COL_LABEL: Record<string, string> = {
  backlog: 'Novo Contrato', novo: 'Novo Contrato', novo_projeto: 'Novo Projeto',
  em_planejamento: 'Em Planejamento', em_validacao: 'Em Validação', em_revisao: 'Em Revisão',
  aprovado: 'Aprovado', inicio_autorizado: 'Início Autorizado', alocado: 'Alocado',
  sust_bh_fixo: 'BH Fixo', sust_bh_mensal: 'BH Mensal', sust_on_demand: 'On Demand',
  sust_cloud: 'Cloud', sust_bizify: 'Bizify',
}
function colLabel(col: string) {
  if (col?.startsWith('coordinator:')) return 'Coordenador'
  return COL_LABEL[col] ?? col
}

function CardDetailModal({ card, onClose, onEditContract, initialTab, userRole }: {
  card: ContractCard
  onClose: () => void
  onEditContract?: (contractId: number) => void
  initialTab?: 'details' | 'chat' | 'log'
  userRole?: string
}) {
  const badge = statusBadge(card)
  const [tab, setTab]   = useState<'details' | 'chat' | 'log'>(initialTab ?? 'details')
  const [full, setFull] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoaded, setLogsLoaded] = useState(false)

  useEffect(() => {
    api.get<any>(`/contracts/${card.id}`).then(setFull).catch(() => {})
  }, [card.id])

  useEffect(() => {
    if (tab === 'log' && !logsLoaded) {
      api.get<any[]>(`/contracts/${card.id}/kanban-logs`)
        .then(r => { setLogs(Array.isArray(r) ? r : []); setLogsLoaded(true) })
        .catch(() => {})
    }
  }, [tab, card.id, logsLoaded])

  const fmtMoney = (val: any) => val != null ? `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'
  const fmtHours = (val: any) => val != null ? `${val}h` : '—'
  const fmtDate  = (val: any) => val ? new Date(val).toLocaleDateString('pt-BR') : '—'

  const fields: [string, string][] = full ? [
    ['Categoria',           full.categoria === 'sustentacao' ? 'Sustentação' : 'Projeto'],
    ['Tipo de Contrato',    full.contract_type?.name ?? '—'],
    ['Tipo de Serviço',     full.service_type?.name ?? '—'],
    ['Código do Projeto',   full.project_code_preview ?? '—'],
    ['Nome do Projeto',     full.project_name ?? '—'],
    ['Faturamento',         full.tipo_faturamento ? (TIPO_LABEL[full.tipo_faturamento] ?? full.tipo_faturamento) : '—'],
    ['Horas Contratadas',   fmtHours(full.horas_contratadas)],
    ['Horas Consultor',     fmtHours(full.horas_consultor)],
    ['% Horas Coordenador', full.pct_horas_coordenador != null ? `${full.pct_horas_coordenador}%` : '—'],
    ['Valor do Projeto',    fmtMoney(full.valor_projeto)],
    ['Valor/Hora',          fmtMoney(full.valor_hora)],
    ['Hora Adicional',      fmtMoney(full.hora_adicional)],
    ['Cobra Despesa',       full.cobra_despesa_cliente ? 'Sim' : 'Não'],
    ['Limite de Despesa',   fmtMoney(full.limite_despesa)],
    ['Expectativa Início',  fmtDate(full.expectativa_inicio)],
    ['Tipo de Alocação',    full.tipo_alocacao ?? '—'],
    ['Cond. Pagamento',     full.condicao_pagamento ?? '—'],
    ['Arquiteto',           full.architect?.name ?? '—'],
    ['Executivo de Conta',  full.executivo_conta?.name ?? '—'],
    ['Vendedor',            full.vendedor?.name ?? '—'],
    ['Observações',         full.observacoes ?? '—'],
    ['Status Contrato',     full.status ?? '—'],
    ['Projeto Gerado',      full.project?.code ?? '—'],
  ] : [
    ['Categoria',         card.categoria === 'sustentacao' ? 'Sustentação' : 'Projeto'],
    ['Tipo de Contrato',  card.contract_type ?? '—'],
    ['Faturamento',       card.tipo_faturamento ? (TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento) : '—'],
    ['Horas Contratadas', fmtHours(card.horas_contratadas)],
    ['Valor do Projeto',  fmtMoney(card.valor_projeto)],
    ['Status Contrato',   card.status],
    ['Projeto',           card.project_code ?? '—'],
  ]

  const tabStyle = (t: string) => tab === t
    ? { background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }
    : { color: 'var(--brand-subtle)', border: '1px solid transparent' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', maxHeight: '85vh' }}>
        <div className="px-6 py-5 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{card.customer_name}</p>
              {card.project_name && <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>{card.project_name}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold px-2 py-1 rounded-full"
                style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors" style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
            </div>
          </div>
          <div className="flex gap-1 mt-3">
            <button onClick={() => setTab('details')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={tabStyle('details')}>
              <ExternalLink size={11} /> Detalhes
            </button>
            <button onClick={() => setTab('chat')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={tabStyle('chat')}>
              <MessageSquare size={11} /> Chat
            </button>
            <button onClick={() => setTab('log')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={tabStyle('log')}>
              <Clock size={11} /> Histórico
            </button>
          </div>
        </div>

        {tab === 'chat' ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <ContractMessages contractId={card.id} userRole={userRole} />
          </div>
        ) : tab === 'log' ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {logs.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--brand-muted)' }}>Nenhum histórico</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--brand-muted)' }}>
                    <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                    <div>
                      <span style={{ color: 'var(--brand-text)' }}>{colLabel(log.from_column)}</span>
                      <span className="mx-1">→</span>
                      <span style={{ color: 'var(--brand-text)' }}>{colLabel(log.to_column)}</span>
                      <span className="ml-2 opacity-60">por {log.moved_by}</span>
                      <span className="ml-2 opacity-40">{new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              {!full && <p className="text-xs text-center" style={{ color: 'var(--brand-muted)' }}>Carregando...</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {fields.map(([label, value]) => (
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
            <div className="flex justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
              <button onClick={() => { onClose(); onEditContract?.(card.id) }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                <Pencil size={13} /> Editar Contrato
              </button>
              <button onClick={() => { window.location.href = '/contratos' }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                <ExternalLink size={13} /> Ver Lista
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanContent() {
  const router = useRouter()
  const { user } = useAuth()

  type SustGroups = Record<string, (ContractCard | ProjectCard)[]>

  const [demandCards,       setDemandCards]       = useState<ContractCard[]>([])
  const [projectCards,      setProjectCards]       = useState<ProjectCard[]>([])
  const [coordinators,      setCoordinators]       = useState<Coordinator[]>([])
  const [sustGroups,        setSustGroups]         = useState<SustGroups>({
    sust_bh_fixo: [], sust_bh_mensal: [], sust_on_demand: [], sust_cloud: [], sust_bizify: [],
  })
  const [loading,           setLoading]            = useState(true)
  const [selected,          setSelected]           = useState<ContractCard | null>(null)
  const [contractAction,    setContractAction]     = useState<{ card: ContractCard; action: string } | null>(null)
  const [projectAction,     setProjectAction]      = useState<{ card: ProjectCard; action: string } | null>(null)

  // Contract form modal state
  const [showNewContract,     setShowNewContract]     = useState(false)
  const [editingContractData, setEditingContractData] = useState<any | null>(null)
  const [filterSearch,        setFilterSearch]        = useState('')
  const [filterCustomer,      setFilterCustomer]      = useState('')

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

  const isSustCoordenador = user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao'

  // Column list: fixed → coordinators → sustentação group → bizify → project status
  // Coordenador de sustentação vê apenas "Pronto para Iniciar" + colunas de sustentação
  const columns: Column[] = isSustCoordenador
    ? [
        FIXED_COLUMNS.find(c => c.id === 'pronto')!,
        ...SUSTENTACAO_COLS,
      ]
    : [
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

  // ── Filtros ──────────────────────────────────────────────────────────────
  const matchFilter = (customerName?: string | null, name?: string | null): boolean => {
    const cn = customerName ?? ''
    const nm = name ?? ''
    if (filterCustomer && cn !== filterCustomer) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      return cn.toLowerCase().includes(q) || nm.toLowerCase().includes(q)
    }
    return true
  }

  const allCustomers = [...new Set([
    ...demandCards.map(c => c.customer_name),
    ...projectCards.map(p => p.customer_name),
    ...Object.values(sustGroups).flat().map(c => c.customer_name),
  ].filter(Boolean))].sort() as string[]

  // Contract cards per column
  const contractsInCol = (colId: string): (ContractCard | ProjectCard)[] => {
    const base = colId.startsWith('sust_')
      ? (sustGroups[colId] ?? [])
      : demandCards.filter(c => contractColumnId(c) === colId)
    // Em colunas de coordenador, oculta contratos cujo projeto já aparece em activeProjectsInCoordCol
    const activeProjectIds = colId.startsWith('coordinator:')
      ? new Set(projectCards.filter(isActiveProject).map(p => p.id))
      : null
    return base
      .filter(c => matchFilter(c.customer_name, c.project_name))
      .filter(c => !activeProjectIds || !(c as ContractCard).project_id)
      .sort((a, b) => (a.kanban_order ?? 0) - (b.kanban_order ?? 0))
  }

  // Active project cards per coordinator column
  const activeProjectsInCoordCol = (coordId: number): ProjectCard[] =>
    projectCards.filter(p =>
      isActiveProject(p) &&
      (p.coordinator_ids ?? []).includes(coordId) &&
      matchFilter(p.customer_name, p.project_name)
    )

  // Project cards in status columns
  const projectsInStatusCol = (colId: string): ProjectCard[] => {
    const targetStatus = COL_TO_PROJECT_STATUS[colId]
    return projectCards
      .filter(p => p.status === targetStatus)
      .filter(p => matchFilter(p.customer_name, p.project_name))
  }

  const handleContractMove = async (cardId: number, card: ContractCard, fromCol: string, toCol: string, order = 0) => {
    // ── Projeto já gerado não pode voltar para fases anteriores à transformação
    if (card.project_id && (toCol === 'novo' || toCol === 'pronto')) {
      toast.error('Este contrato já foi transformado em projeto e não pode retornar para fases anteriores.')
      return
    }

    // ── Sustentação → coordinator is never allowed
    if (fromCol.startsWith('sust_') && toCol.startsWith('coordinator:')) {
      toast.error('Contratos de sustentação só podem mover entre filas de sustentação.')
      return
    }

    // ── Between sustentação columns (or from demand to sustentação)
    if (toCol.startsWith('sust_')) {
      if (!isSustAdmin) { toast.error('Apenas admin ou coordenador de sustentação pode mover.'); return }
      const ctL2 = card.contract_type?.toLowerCase() ?? ''
      const svL2 = card.service_type?.toLowerCase() ?? ''
      const isSustCard = card.categoria === 'sustentacao'
        || ctL2.includes('banco de horas') || ctL2.includes('on demand') || ctL2.includes('cloud') || ctL2.includes('bizify') || ctL2.includes('saas')
        || svL2.includes('sustent') || svL2.includes('cloud') || svL2.includes('bizify')
      if (!isSustCard) { toast.error('Contratos de projeto não podem ser movidos para filas de sustentação.'); return }
      setSustGroups(prev => {
        const next = { ...prev }
        if (fromCol.startsWith('sust_')) next[fromCol] = prev[fromCol].filter(c => c.id !== cardId)
        next[toCol] = [...(prev[toCol] ?? []), { ...card, sustentacao_column: toCol }]
        return next
      })
      setDemandCards(prev => prev.filter(c => c.id !== cardId))
      try {
        const res = await api.patch<any>(`/contracts/${cardId}/sustentacao-move`, { to_column: toCol })
        await load()
        toast.success(res?.project_created ? '🚀 Projeto gerado e card movido para sustentação!' : 'Card movido para fila de sustentação')
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover'); load() }
      return
    }

    // ── Moving to a coordinator column from demand
    if (toCol.startsWith('coordinator:')) {
      // Contratos vindos de requisição (novo_projeto) devem passar por Início Autorizado antes de serem alocados
      if (card.kanban_status === 'novo_projeto') {
        toast.error('Este contrato deve ser movido para "Pronto para Iniciar" antes de ser alocado a um coordenador.')
        return
      }
      const ctLower = card.contract_type?.toLowerCase() ?? ''
      const svLower = card.service_type?.toLowerCase() ?? ''
      const isSustType = card.categoria === 'sustentacao'
        || ctLower.includes('banco de horas') || ctLower.includes('on demand')
        || ctLower.includes('cloud') || ctLower.includes('bizify') || ctLower.includes('saas')
        || svLower.includes('cloud') || svLower.includes('bizify') || svLower.includes('sustent')
      if (isSustType) {
        toast.error('Contratos de sustentação devem ser movidos para a fila de sustentação (BH Fixo, BH Mensal, On Demand ou Cloud).')
        return
      }
      const coordId = Number(toCol.split(':')[1])
      if (!card.is_complete) { toast.error('Contrato incompleto — preencha todos os campos antes de alocar.'); return }
      const wasNew = !card.project_id
      setDemandCards(prev => prev.map(c =>
        c.id === cardId ? { ...c, kanban_status: 'alocado', kanban_coordinator_id: coordId } : c
      ))
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, {
          to_column: `coordinator:${coordId}`, coordinator_id: coordId, order,
        })
        await load()
        if (wasNew) toast.success('🚀 Projeto gerado automaticamente!')
        else toast.success('Coordenador atualizado')
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao alocar contrato'); load() }
      return
    }

    // ── Block drops of sustentação cards into demand/fixed columns
    if (fromCol.startsWith('sust_')) return

    // ── Contract with project moving to a project status column
    if (card.project_id && COL_TO_PROJECT_STATUS[toCol]) {
      const newStatus = COL_TO_PROJECT_STATUS[toCol]
      setProjectCards(prev => prev.map(p => p.id === card.project_id ? { ...p, status: newStatus } : p))
      try {
        await api.patch(`/projects/${card.project_id}/kanban-move`, { status: newStatus })
        toast.success('Projeto atualizado')
        await load()
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover projeto'); load() }
      return
    }

    // ── Moving between fixed columns (novo ↔ pronto)
    const toKanbanStatus = toCol === 'pronto' ? 'inicio_autorizado' : 'backlog'
    setDemandCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, kanban_status: toKanbanStatus, kanban_order: order } : c
    ))
    try {
      await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toKanbanStatus, order })
      toast.success('Card movido')
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover card'); load() }
  }

  const handleProjectMove = async (cardId: number, toCol: string, currentCoordId?: number) => {
    if (toCol.startsWith('coordinator:')) {
      const newCoordId = Number(toCol.split(':')[1])
      setProjectCards(prev => prev.map(p => {
        if (p.id !== cardId) return p
        const ids = (p.coordinator_ids ?? []).filter(id => id !== currentCoordId)
        if (!ids.includes(newCoordId)) ids.push(newCoordId)
        return { ...p, coordinator_ids: ids }
      }))
      try {
        await api.patch(`/projects/${cardId}/kanban-move`, { coordinator_id: newCoordId, from_coordinator_id: currentCoordId })
        toast.success('Coordenador atualizado')
        await load()
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover projeto'); load() }
      return
    }
    const newStatus = COL_TO_PROJECT_STATUS[toCol]
    if (!newStatus) return
    setProjectCards(prev => prev.map(p => p.id === cardId ? { ...p, status: newStatus } : p))
    try {
      await api.patch(`/projects/${cardId}/kanban-move`, { status: newStatus })
      toast.success('Projeto atualizado')
      await load()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover projeto'); load() }
  }

  const getAvailableContractCols = (card: ContractCard, fromCol: string): { id: string; label: string }[] => {
    const cols: { id: string; label: string }[] = []

    // Detecção de sustentação por categoria, tipo de contrato OU tipo de serviço
    const ctLower = card.contract_type?.toLowerCase() ?? ''
    const svLower = card.service_type?.toLowerCase() ?? ''
    const isSustType = card.categoria === 'sustentacao'
      || ctLower.includes('banco de horas') || ctLower.includes('on demand')
      || ctLower.includes('cloud') || ctLower.includes('bizify') || ctLower.includes('saas')
      || svLower.includes('cloud') || svLower.includes('bizify') || svLower.includes('sustent')

    // Colunas de status de projeto: movimentação apenas pelo Pipeline
    if (fromCol.startsWith('col_')) return []

    // Projeto já gerado: nunca pode voltar para fases pré-projeto
    if (card.project_id && (fromCol === 'novo' || fromCol === 'pronto')) return []

    if (fromCol.startsWith('sust_')) {
      if (!isSustAdmin) return []
      SUSTENTACAO_COLS.forEach(s => { if (s.id !== fromCol) cols.push({ id: s.id, label: s.label }) })
      if (BIZIFY_COL.id !== fromCol) cols.push({ id: BIZIFY_COL.id, label: BIZIFY_COL.label })
      return cols
    }

    // ── Card alocado num coordenador (tem project_id = "Projeto Ativo")
    if (fromCol.startsWith('coordinator:')) {
      coordinators.forEach(coord => {
        if (`coordinator:${coord.id}` !== fromCol)
          cols.push({ id: `coordinator:${coord.id}`, label: coord.name })
      })
      STATUS_PROJECT_COLUMNS.forEach(s => cols.push({ id: s.id, label: s.label }))
      return cols
    }

    if (!isSustCoordenador) {
      if (fromCol === 'novo') cols.push({ id: 'pronto', label: 'Pronto para Iniciar' })
      if (fromCol === 'pronto') cols.push({ id: 'novo', label: 'Novo Contrato' })

      if (card.kanban_status !== 'novo_projeto') {
        if (!isSustType && card.is_complete) {
          coordinators.forEach(coord => cols.push({ id: `coordinator:${coord.id}`, label: coord.name }))
        }
      }
    }

    // Sust cols para contratos detectados como sustentação (por categoria, tipo de contrato ou tipo de serviço)
    if (isSustAdmin && !card.project_id && isSustType) {
      SUSTENTACAO_COLS.forEach(s => cols.push({ id: s.id, label: s.label }))
      cols.push({ id: BIZIFY_COL.id, label: BIZIFY_COL.label })
    }

    return cols
  }

  const getAvailableProjectCols = (_card: ProjectCard, fromCol: string, currentCoordId?: number): { id: string; label: string }[] => {
    if (isConsultor || isCliente) return []
    if (currentCoordId !== undefined) {
      return coordinators
        .filter(c => c.id !== currentCoordId)
        .map(c => ({ id: `coordinator:${c.id}`, label: c.name }))
    }
    return STATUS_PROJECT_COLUMNS
      .filter(c => c.id !== fromCol)
      .map(c => ({ id: c.id, label: c.label }))
  }

  const isConsultor = user?.type === 'consultor'
  const isCliente   = user?.type === 'cliente'

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const toCol    = destination.droppableId
    const fromCol  = source.droppableId
    const [cardType, rawId] = draggableId.split('-')
    const cardId   = Number(rawId)

    if (cardType === 'contract') {
      const allSustCards = Object.values(sustGroups).flat().filter(c => c.card_type !== 'project') as ContractCard[]
      const card = [...demandCards, ...allSustCards].find(c => c.id === cardId)
      if (!card) return
      if (card.project_id && (toCol === 'novo' || toCol === 'pronto')) {
        toast.error('Este contrato já foi transformado em projeto e não pode retornar para fases anteriores.')
        return
      }
      await handleContractMove(cardId, card, fromCol, toCol, destination.index)
      return
    }

    if (cardType === 'project') {
      const currentCoordId = fromCol.startsWith('coordinator:')
        ? Number(fromCol.split(':')[1])
        : undefined
      await handleProjectMove(cardId, toCol, currentCoordId)
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

            <button onClick={() => { setEditingContractData(null); setShowNewContract(true) }}
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

        {/* Filters */}
        <div className="flex items-center gap-2 px-6 py-2 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--brand-subtle)' }} />
            <input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Buscar nome ou projeto..."
              className="pl-7 pr-7 py-1.5 rounded-lg text-xs outline-none w-56"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            />
            {filterSearch && (
              <button onClick={() => setFilterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={10} style={{ color: 'var(--brand-subtle)' }} />
              </button>
            )}
          </div>
          {allCustomers.length > 0 && (
            <select
              value={filterCustomer}
              onChange={e => setFilterCustomer(e.target.value)}
              className="py-1.5 px-2 rounded-lg text-xs outline-none"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: filterCustomer ? 'var(--brand-text)' : 'var(--brand-subtle)' }}
            >
              <option value="">Todos os clientes</option>
              {allCustomers.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {(filterSearch || filterCustomer) && (
            <button onClick={() => { setFilterSearch(''); setFilterCustomer('') }}
              className="text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--brand-subtle)' }}>
              Limpar
            </button>
          )}
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
                      <div className="flex flex-col rounded-2xl shrink-0 h-full" style={{
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
                            isStatusCol && !['col_pausado', 'col_cancelado', 'col_encerrado'].includes(col.id)
                          }
                        >
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.droppableProps}
                              className="overflow-y-auto p-3 space-y-2.5 transition-colors"
                              style={{
                                minHeight: 80,
                                maxHeight: 'calc(100vh - 220px)',
                                background: snap.isDraggingOver
                                  ? isStatusCol ? `${col.color}08` : (isSust || isBizify) ? `${col.color}08` : isCoord ? 'rgba(0,245,255,0.05)' : 'rgba(255,255,255,0.03)'
                                  : 'transparent',
                              }}
                            >
                              {contractCards.map((card, idx) => {
                                if (card.card_type === 'project') {
                                  const proj = card as ProjectCard
                                  const projFromCol = PROJECT_STATUS_COL[proj.status] ?? ''
                                  return (
                                    <ProjectKanbanCard key={`sp-${proj.id}`} card={proj} index={idx}
                                      onClick={() => setProjectAction({ card: proj, action: 'view' })}
                                      onAction={action => setProjectAction({ card: proj, action })}
                                      onMove={toCol => handleProjectMove(proj.id, toCol, col.coordinatorId)}
                                      availableColumns={getAvailableProjectCols(proj, projFromCol, col.coordinatorId)}
                                    />
                                  )
                                }
                                const cc = card as ContractCard
                                const fromCol = col.id.startsWith('sust_') ? col.id : contractColumnId(cc)
                                return (
                                  <ContractKanbanCard key={`c-${cc.id}`} card={cc} index={idx}
                                    onClick={() => setSelected(cc)}
                                    onAction={action => setContractAction({ card: cc, action })}
                                    onMove={toCol => handleContractMove(cc.id, cc, fromCol, toCol)}
                                    availableColumns={getAvailableContractCols(cc, fromCol)}
                                  />
                                )
                              })}
                              {activeProjects.map((proj, idx) => {
                                const fromCol = PROJECT_STATUS_COL[proj.status] ?? ''
                                return (
                                  <ProjectKanbanCard key={`p-${proj.id}`} card={proj} index={contractCards.length + idx}
                                    onClick={() => setProjectAction({ card: proj, action: 'view' })}
                                    onAction={action => setProjectAction({ card: proj, action })}
                                    onMove={toCol => handleProjectMove(proj.id, toCol, col.coordinatorId)}
                                    availableColumns={getAvailableProjectCols(proj, fromCol, col.coordinatorId)}
                                  />
                                )
                              })}
                              {statusProjects.map((proj, idx) => {
                                const fromCol = PROJECT_STATUS_COL[proj.status] ?? ''
                                return (
                                  <ProjectKanbanCard key={`ps-${proj.id}`} card={proj} index={idx}
                                    onClick={() => setProjectAction({ card: proj, action: 'view' })}
                                    onAction={action => setProjectAction({ card: proj, action })}
                                    onMove={toCol => handleProjectMove(proj.id, toCol)}
                                    availableColumns={getAvailableProjectCols(proj, fromCol)}
                                  />
                                )
                              })}
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
        <CardDetailModal
          card={selected}
          onClose={() => setSelected(null)}
          userRole={user?.type ?? undefined}
          onEditContract={async (contractId) => {
            setSelected(null)
            try {
              const contract = await api.get<any>(`/contracts/${contractId}`)
              setEditingContractData(contract)
              setShowNewContract(true)
            } catch { toast.error('Erro ao carregar contrato') }
          }}
        />
      )}

      {/* New Contract Modal — with required-field validation */}
      {showNewContract && !editingContractData && (
        <ContractCreateModal
          onClose={() => setShowNewContract(false)}
          onSuccess={() => { setShowNewContract(false); load() }}
        />
      )}

      {/* Edit Contract Modal */}
      {showNewContract && editingContractData && (
        <ContractFormModal
          open={showNewContract}
          editContract={editingContractData}
          onClose={() => { setShowNewContract(false); setEditingContractData(null) }}
          onSaved={load}
        />
      )}

      {contractAction && (() => {
        const { card, action } = contractAction
        const close = () => setContractAction(null)
        if (action === 'view') {
          if (card.project_id) {
            const userType = (user as any)?.type
            return <ProjectViewModal projectId={card.project_id} onClose={close} userRole={userType} initialTab="overview" />
          }
          return <CardDetailModal card={card} onClose={close} initialTab="details" userRole={user?.type ?? undefined}
            onEditContract={async id => { close(); try { const c = await api.get<any>(`/contracts/${id}`); setEditingContractData(c); setShowNewContract(true) } catch { toast.error('Erro') } }} />
        }
        if (action === 'chat') return <CardDetailModal card={card} onClose={close} initialTab="chat" userRole={user?.type ?? undefined} />
        if (action === 'log')  return <CardDetailModal card={card} onClose={close} initialTab="log" userRole={user?.type ?? undefined} />
        if (action === 'edit') {
          api.get<any>(`/contracts/${card.id}`)
            .then(c => { setEditingContractData(c); setShowNewContract(true) })
            .catch(() => toast.error('Erro ao carregar contrato'))
          close()
          return null
        }
        if (action === 'delete') {
          if (card.project_id) {
            toast.error('Contrato com projeto gerado não pode ser excluído.')
            close()
            return null
          }
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
              <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <Trash2 size={16} style={{ color: '#ef4444' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Excluir Contrato</p>
                      <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{card.customer_name}</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                    Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                  <button onClick={close} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Cancelar</button>
                  <button
                    onClick={async () => {
                      try {
                        await api.delete(`/contracts/${card.id}`)
                        toast.success('Contrato excluído')
                        close()
                        load()
                      } catch (e: any) {
                        toast.error(e?.message ?? 'Erro ao excluir')
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: '#ef4444', color: '#fff' }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </div>
            </div>
          )
        }
        return null
      })()}

      {projectAction && (() => {
        const { card, action } = projectAction
        const close = () => setProjectAction(null)
        const userType = (user as any)?.type
        if (action === 'view')       return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="overview" />
        if (action === 'edit')       return <ProjectEditByIdModal projectId={card.id} onClose={close} onSaved={close} />
        if (action === 'status')     return <ProjectStatusModal projectId={card.id} projectName={card.project_name} currentStatus={card.status} onClose={close} onSaved={st => { setProjectCards(prev => prev.map(p => p.id === card.id ? { ...p, status: st } : p)); close() }} />
        if (action === 'cost')       return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="cost" />
        if (action === 'timesheets') return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="timesheets" />
        if (action === 'team')       return <ProjectTeamModal projectId={card.id} projectName={card.project_name} onClose={close} onSaved={close} />
        if (action === 'chat' && card.contract_id) {
          const chatCard = { id: card.contract_id, customer_name: card.customer_name, project_name: card.project_name } as any
          return <CardDetailModal card={chatCard} onClose={close} initialTab="chat" userRole={user?.type ?? undefined} />
        }
        if (action === 'expenses') {
          router.push(`/expenses?project_id=${card.id}`)
          close()
          return null
        }
        if (action === 'aportes') {
          router.push('/gestao-projetos')
          close()
          return null
        }
        if (action === 'delete') {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
              <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <Trash2 size={16} style={{ color: '#ef4444' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Excluir Projeto</p>
                      <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{card.project_name ?? card.customer_name}</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                    Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                  <button onClick={close} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Cancelar</button>
                  <button
                    onClick={async () => {
                      try {
                        await api.delete(`/projects/${card.id}`)
                        toast.success('Projeto excluído')
                        close()
                        load()
                      } catch (e: any) {
                        toast.error(e?.message ?? 'Erro ao excluir')
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: '#ef4444', color: '#fff' }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </div>
            </div>
          )
        }
        return null
      })()}
    </AppLayout>
  )
}

export default function KanbanPage() {
  return <KanbanContent />
}
