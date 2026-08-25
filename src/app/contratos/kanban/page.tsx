'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, CheckCircle, AlertCircle, AlertTriangle, Clock, Users, Layers, PauseCircle, XCircle, MoreVertical, Eye, Pencil, DollarSign, X, Check, MessageSquare, Trash2, Search, Download, FileText } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'
import { ContractCreateModal } from '@/components/shared/ContractCreateModal'
import { AporteDetailModal } from '@/components/shared/AporteDetailModal'
import { ContractMessages } from '@/components/shared/ContractMessages'
import { MonthlyAccrualTable } from '@/components/projects/monthly-accrual-table'
import { ProjectDataModal } from '@/components/shared/ProjectDataModal'
import { CustomerContactsSection } from '@/components/ui/customer-contacts-section'
import { ProjectViewModal, ProjectInlineEditModal } from '@/components/projects/project-view-modal'
import { useDeniedActions } from '@/contexts/denied-actions-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractCard {
  card_type?: 'contract'
  id: number
  customer_name: string
  customer_id: number
  project_name?: string
  // Subprojeto faturado que gerou aporte automático no pai (badge verde na capa).
  gerou_aporte?: boolean
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
  executivo_conta_name?: string
  kanban_order: number
  status: string
  project_id?: number
  project_code?: string
  project_status?: string
  // Código/número do contrato (previsto) mostrado na legenda do card.
  contract_code?: string | null
  // Vínculo item SaaS/Cloud: agregado aponta pro pai; principal lista os filhos.
  parent_contract_id?: number | null
  parent_contract_code?: string | null
  linked_children?: { id: number; code: string | null }[]
  is_linked?: boolean
  bh_mensal_item?: boolean
  has_bh_mensal_items?: boolean
  combined_billing_value?: number | null
  is_complete: boolean
  created_at: string
  sustentacao_column?: string | null
  is_aditivo?: boolean
  aditivo_field?: string | null
  aditivo_changes?: { field: string; label: string; old: number; new: number }[] | null
  aditivo_old_value?: number | null
  aditivo_new_value?: number | null
  aditivo_project_code?: string | null
  aditivo_project_name?: string | null
  aditivo_contract_old?: number | null
  aditivo_contract_new?: number | null
  aditivo_effective_from?: string | null
  aditivo_cond_pagamento?: string | null
  aditivo_obs?: string | null
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
  kanban_coordinator_override_id?: number | null
  executivo_conta_name?: string
  contract_type?: string
  service_type?: string
  // Vínculo item SaaS/Cloud (herdado do contrato gerador).
  contract_code?: string | null
  parent_contract_id?: number | null
  parent_contract_code?: string | null
  linked_children?: { id: number; code: string | null }[]
  is_linked?: boolean
  bh_mensal_item?: boolean
  has_bh_mensal_items?: boolean
  combined_billing_value?: number | null
}

interface Coordinator { id: number; name: string; coordinator_type?: string | null }

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
  consultant_hours: string; coordinator_hours: string; coordination_hours: string
  parent_project_id: string
  service_type_id: string; contract_type_id: string
  tipo_faturamento: string; tipo_alocacao: string
  condicao_pagamento: string; vendedor_id: string
  cobra_despesa_cliente: boolean
  observacoes_contrato: string
  max_expense_per_consultant: string
  timesheet_retroactive_limit_days: string
  allow_manual_timesheets: boolean; allow_negative_balance: boolean
  client_follows_timesheets: boolean
  movidesk_integration_enabled: boolean
  coordinator_ids: number[]; consultant_ids: number[]; consultant_group_ids: number[]
}

interface Column {
  id: string
  label: string
  type: 'fixed' | 'coordinator' | 'project_status' | 'sustentacao' | 'bizify' | 'aporte'
  coordinatorId?: number
  emoji?: string
  projectStatus?: string
  color?: string
  sustentacaoValidator?: (card: ContractCard) => boolean
}

// Card de aporte (vem direto de hour_contributions; só renderiza no kanban
// quando o projeto destino é PAI — aporte em filho não vira card).
// Lifecycle: nasce em kanban_status='novo_contrato' e o admin move pra 'aporte'.
interface AporteCard {
  id: number
  kind: 'aporte'
  customer_id: number | null
  customer_name: string | null
  project_id: number
  project_code: string | null
  project_name: string | null
  project_status: string | null
  horas: number
  valor_hora: number
  total: number
  motivo: 'aporte' | 'excedentes' | 'absorvidas' | string | null
  description: string | null
  kanban_status: 'novo_contrato' | 'aporte' | string
  contributed_by: string | null
  contributed_at: string | null
  created_at: string | null
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
  { action: 'edit',       label: 'Editar',            icon: Pencil,     adminOnly: true },
  // 'Chat' removido (2026-05-28): após virar projeto, chat sai. Chat só na Requisição/Contrato.
  { action: 'status',     label: 'Alterar Status',    icon: Layers },
  { action: 'cost',       label: 'Custo',             icon: DollarSign, coordHidden: true },
  { action: 'timesheets', label: 'Apont. & Despesas', icon: Clock },
  // 'Aportes' removido do menu de linha (2026-05-28): aporte se cria via "É aporte?" no Novo Contrato.
  { action: 'team',       label: 'Selecionar Equipe', icon: Users },
  { action: 'delete',     label: 'Excluir',           icon: Trash2,     danger: true, adminOnly: true },
]

const CONTRACT_MENU_ITEMS = [
  { action: 'view',       label: 'Visualizar',       icon: Eye },
  { action: 'edit',       label: 'Editar',            icon: Pencil,     adminOnly: true },
  { action: 'chat',       label: 'Chat',              icon: MessageSquare },
  { action: 'log',        label: 'Histórico',         icon: Clock },
  { action: 'status',     label: 'Alterar Status',    icon: Layers },
  { action: 'cost',       label: 'Custo',             icon: DollarSign, coordHidden: true },
  { action: 'timesheets', label: 'Apont. & Despesas', icon: Clock },
  // 'Aportes' removido do menu de linha (2026-05-28): aporte se cria via "É aporte?" no Novo Contrato.
  { action: 'team',       label: 'Selecionar Equipe', icon: Users },
  { action: 'delete',     label: 'Excluir',           icon: Trash2,     danger: true, adminOnly: true },
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
  col_pausado:        'paused',
  col_cancelado:      'cancelled',
  col_encerrado:      'finished',
  col_awaiting_start: 'awaiting_start',
  col_started:        'started',
}

const PRONTO_COLOR = '#eab308'
const ADITIVO_COLOR = '#8b5cf6'
// Vínculo item SaaS/Cloud (principal ↔ agregados) — cor dedicada na capa do card.
const LINK_COLOR = '#14b8a6'

const FIXED_COLUMNS: Column[] = [
  { id: 'novo',   label: 'Novo Contrato',       type: 'fixed', emoji: '🆕' },
  { id: 'pronto', label: 'Pronto para Iniciar', type: 'fixed', emoji: '🚀', color: PRONTO_COLOR },
]

const SUST_COLOR   = '#f97316'
// Coluna "Meus Projetos" do board exclusivo do coordenador de sustentação — cor própria
// (azul), distinta do laranja das filas de sustentação.
const MEUS_PROJETOS_COLOR = '#3b82f6'
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

// Coluna SaaS — só no kanban da empresa Bizify (definida pelo tipo de contrato SaaS).
const SAAS_COLOR = '#a78bfa'
const SAAS_COL: Column = {
  id: 'sust_saas', label: 'SaaS', type: 'sustentacao', emoji: '🧩', color: SAAS_COLOR,
  sustentacaoValidator: (c) => !!(c.contract_type?.toLowerCase().includes('saas') || c.service_type?.toLowerCase().includes('saas')),
}

// Colunas de sustentação do kanban BIZIFY: mantém BH Fixo/Mensal/On Demand, troca Cloud→SaaS.
const SUSTENTACAO_COLS_BIZIFY: Column[] = [
  ...SUSTENTACAO_COLS.filter(c => c.id !== 'sust_cloud'),
  SAAS_COL,
]

const APORTE_COLOR = '#22c55e'
const APORTE_COL: Column = {
  id: 'aporte', label: 'Aporte', type: 'aporte', emoji: '💰', color: APORTE_COLOR,
}

// Coluna de Aditivos — fica por último (depois do Aporte).
const ADITIVO_COL: Column = {
  id: 'aditivos', label: 'Aditivos', type: 'fixed', emoji: '➕', color: ADITIVO_COLOR,
}

const STATUS_PROJECT_COLUMNS: Column[] = [
  { id: 'col_encerrado', label: 'Encerrado', type: 'project_status', projectStatus: 'finished',  color: '#22c55e' },
  { id: 'col_pausado',   label: 'Pausado',   type: 'project_status', projectStatus: 'paused',    color: '#eab308' },
  { id: 'col_cancelado', label: 'Cancelado', type: 'project_status', projectStatus: 'cancelled', color: '#ef4444' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contractColumnId(card: ContractCard): string | null {
  // Aditivo aplicado e arquivado fica na coluna "Aditivos".
  if (card.kanban_status === 'aditivo') return 'aditivos'
  if (card.kanban_status === 'alocado') {
    // Sem coordinator definido NÃO cai em 'novo' (default antigo): o projeto já
    // foi criado, então o card "como contrato" não pertence a nenhuma coluna —
    // a presença do projeto é exibida via projectCards.
    return card.kanban_coordinator_id ? `coordinator:${card.kanban_coordinator_id}` : null
  }
  // All non-approved demand statuses → "novo" column
  if (['backlog', 'novo_projeto', 'em_planejamento', 'em_validacao', 'em_revisao'].includes(card.kanban_status ?? '')) {
    return 'novo'
  }
  // Approved / autorizado → "pronto" column
  if (['aprovado', 'inicio_autorizado'].includes(card.kanban_status ?? '')) {
    return 'pronto'
  }
  // Contrato com projeto já criado não deve cair no fallback 'novo' (era fonte de
  // duplicação visual quando o BE devolvia contratos sem kanban_status normalizado).
  if (card.project_id) return null
  return 'novo'
}

function isActiveProject(p: ProjectCard): boolean {
  return ['awaiting_start', 'started', 'liberado_para_testes'].includes(p.status)
}

function statusBadge(card: ContractCard) {
  if (card.project_id)  return { color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success-border)', label: '🟢 Projeto Ativo' }
  if (card.is_complete) return { color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)', label: '🟡 Pronto' }
  return { color: 'var(--danger)', bg: 'var(--danger-bg)', border: 'var(--danger-border)', label: '🔴 Incompleto' }
}

// ─── Project Modals ───────────────────────────────────────────────────────────

function ProjectEditByIdModal({ projectId, onClose, onSaved }: { projectId: number; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<ProjectFull>(`/projects/${projectId}`).then(setP).catch(() => toast.error('Erro ao carregar projeto')).finally(() => setLoading(false))
  }, [projectId])
  if (loading) return (
    <div className="p-5">
      <div className="flex gap-4 overflow-x-auto">
        {[...Array(4)].map((_, c) => (
          <div key={c} className="w-72 shrink-0 rounded-xl p-3" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <div className="h-4 w-32 rounded mb-3 animate-pulse" style={{ background: 'var(--surface-hover)' }} />
            {[...Array(3)].map((_, k) => (
              <div key={k} className="h-20 rounded-lg mb-2 animate-pulse" style={{ background: 'var(--surface-hover)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
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
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text)', outline: 'none' }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Alterar Status</p><h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{projectName}</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="p-5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Novo Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contract Card ────────────────────────────────────────────────────────────

function ProjectTeamModal({ projectId, projectName, onClose, onSaved }: { projectId: number; projectName: string; onClose: () => void; onSaved: () => void }) {
  const [allConsultants,   setAllConsultants]   = useState<{ id: number; name: string }[]>([])
  const [allGroups,        setAllGroups]        = useState<{ id: number; name: string }[]>([])
  const [selectedIds,      setSelectedIds]      = useState<Set<number>>(new Set())
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set())
  const [manualIds,        setManualIds]        = useState<Set<number>>(new Set())
  const [projectConsultants, setProjectConsultants] = useState<any[]>([])
  const [tab,    setTab]    = useState<'consult' | 'group'>('consult')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<any>(`/projects/${projectId}`),
      api.get<any>('/users?type=consultor,parceiro_admin&pageSize=200'),
      api.get<any>('/consultant-groups?pageSize=100&active=1'),
    ]).then(([proj, usrs, grps]) => {
      setAllConsultants(usrs?.items ?? usrs?.data ?? [])
      setAllGroups(Array.isArray(grps?.items) ? grps.items : Array.isArray(grps?.data) ? grps.data : [])
      const direct: any[] = proj?.consultants ?? []
      const viaGroup: any[] = (proj?.consultant_groups ?? []).flatMap((g: any) => g.consultants ?? [])
      const allInProject = [...direct, ...viaGroup].filter((c, i, a) => a.findIndex((x: any) => x.id === c.id) === i)
      setSelectedIds(new Set(direct.map((c: any) => c.id)))
      setSelectedGroupIds(new Set((proj?.consultant_groups ?? []).map((g: any) => g.id)))
      setProjectConsultants(allInProject)
      setManualIds(new Set(allInProject.filter((c: any) => c.pivot?.allow_manual_timesheet).map((c: any) => Number(c.id))))
    }).catch(() => toast.error('Erro ao carregar equipe'))
    .finally(() => setLoading(false))
  }, [projectId])

  const toggleSet = (s: Set<number>, id: number) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }
  const filteredConsults = allConsultants.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  const filteredGroups   = allGroups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/projects/${projectId}`, { consultant_ids: Array.from(selectedIds), consultant_group_ids: Array.from(selectedGroupIds) })
      const initialManual = new Set<number>(projectConsultants.filter((c: any) => c.pivot?.allow_manual_timesheet).map((c: any) => Number(c.id)))
      await Promise.allSettled(
        projectConsultants.map((c: any) => Number(c.id)).filter(id => manualIds.has(id) !== initialManual.has(id)).map(id =>
          api.put(`/projects/${projectId}/consultants/${id}/manual-timesheet`, { allow: manualIds.has(id) })
        )
      )
      toast.success('Equipe atualizada')
      onSaved()
    } catch { toast.error('Erro ao salvar equipe') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex flex-col w-full max-w-lg rounded-2xl max-h-[85vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Selecionar Equipe</p><h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{projectName}</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        {loading ? <div className="flex-1 flex items-center justify-center py-10"><p className="text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando...</p></div> : (
          <div className="flex flex-col flex-1 overflow-hidden px-5 pt-4">
            {projectConsultants.length > 0 && (
              <div className="mb-3 rounded-xl p-2 shrink-0 overflow-y-auto" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', maxHeight: '26vh' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-1 sticky top-0" style={{ color: 'var(--text-light)', background: 'var(--surface-hover)' }}>Apontamento manual — consultores no projeto</p>
                {projectConsultants.map((c: any) => {
                  const allow = manualIds.has(c.id)
                  return (
                    <div key={c.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]">
                      <span className="text-xs" style={{ color: 'var(--text)' }}>{c.name}</span>
                      <button onClick={() => setManualIds(prev => toggleSet(prev, c.id))}
                        title={allow ? 'Bloquear apontamento manual' : 'Liberar apontamento manual'}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors shrink-0"
                        style={{ background: allow ? 'var(--success-bg)' : 'var(--surface-hover)', border: `1px solid ${allow ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, color: allow ? 'var(--success-border)' : 'var(--text-light)' }}>
                        <Clock size={10} />{allow ? 'Liberado' : 'Bloqueado'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex gap-1 mb-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              {([['consult','Consultores',selectedIds.size],['group','Grupos',selectedGroupIds.size]] as const).map(([id,label,count]) => (
                <button key={id} onClick={() => { setTab(id); setSearch('') }}
                  className="px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                  style={{ color: tab === id ? 'var(--text)' : 'var(--text-muted)', borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-1px' }}>
                  {label}{count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{count}</span>}
                </button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              className="w-full text-xs px-3 py-2 rounded-xl outline-none mb-2 shrink-0"
              style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <div className="flex-1 overflow-y-auto space-y-1 rounded-xl p-2" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
              {tab === 'consult' && filteredConsults.map(c => {
                const sel = selectedIds.has(c.id)
                return (
                  <button key={c.id} onClick={() => setSelectedIds(prev => toggleSet(prev, c.id))}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ background: sel ? 'rgba(139,92,246,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(139,92,246,0.25)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(139,92,246,0.2)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      {sel && <Check size={10} style={{ color: '#a78bfa' }} />}
                    </div>
                    <span className="text-xs" style={{ color: sel ? '#a78bfa' : 'var(--text)' }}>{c.name}</span>
                  </button>
                )
              })}
              {tab === 'group' && filteredGroups.map(g => {
                const sel = selectedGroupIds.has(g.id)
                return (
                  <button key={g.id} onClick={() => setSelectedGroupIds(prev => toggleSet(prev, g.id))}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ background: sel ? 'rgba(245,158,11,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(245,158,11,0.25)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'var(--warning-bg)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      {sel && <Check size={10} style={{ color: 'var(--warning-border)' }} />}
                    </div>
                    <span className="text-xs" style={{ color: sel ? 'var(--warning-border)' : 'var(--text)' }}>{g.name}</span>
                  </button>
                )
              })}
              {tab === 'consult' && filteredConsults.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>}
              {tab === 'group'   && filteredGroups.length   === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Equipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Card de aporte (coluna "Novo Contrato" inicial, depois "Aporte").
// Lê de hour_contributions; só renderiza pra projetos PAI (filhos não viram card).
// Clique abre o modal de Aportes do projeto pai. Botão "Mover pra Aporte" só
// aparece em kanban_status='novo_contrato' e movimenta pra coluna final.
function AporteKanbanCard({ aporte, onClick, onMoveToFinal, canWrite }: {
  aporte: AporteCard
  onClick: () => void
  onMoveToFinal?: () => void
  canWrite?: boolean
}) {
  const MOTIVO_LABEL: Record<string, string> = {
    aporte:     'Aporte',
    excedentes: 'Excedentes',
    absorvidas: 'Absorvidas',
  }
  const motivo = aporte.motivo ?? 'aporte'
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.01]"
      style={{
        background: 'var(--surface-hover)',
        border: `1px solid ${APORTE_COLOR}45`,
        boxShadow: 'var(--brand-card-shadow)',
      }}
    >
      {/* Top: cliente + total */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider font-semibold truncate"
            style={{ color: 'var(--text-light)' }}>
            {aporte.customer_name ?? '—'}
          </p>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {aporte.project_name ?? '—'}
          </p>
          {aporte.project_code && (
            <p className="font-mono text-[10px]" style={{ color: 'var(--primary)' }}>
              {aporte.project_code}
            </p>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0"
          style={{ background: `${APORTE_COLOR}20`, color: APORTE_COLOR }}>
          {MOTIVO_LABEL[motivo] ?? motivo}
        </span>
      </div>

      {/* Legenda: aporte gerado automaticamente por um subprojeto faturado (borda verde + código). */}
      {(() => {
        const m = /ref\. subprojeto faturado\s*\(([^\s)]+)/i.exec(aporte.description ?? '')
        if (!m) return null
        return (
          <div className="mb-2 rounded-md px-2 py-1 text-[10px] font-medium"
            style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
            Criado automaticamente pelo subprojeto <span className="font-mono font-bold">{m[1]}</span>
          </div>
        )
      })()}

      {/* Middle: horas e valor */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="rounded-md px-2 py-1.5 text-center" style={{ background: `${APORTE_COLOR}10` }}>
          <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>Horas</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: APORTE_COLOR }}>
            {Number(aporte.horas).toFixed(1)}h
          </p>
        </div>
        <div className="rounded-md px-2 py-1.5 text-center" style={{ background: `${APORTE_COLOR}10` }}>
          <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>Valor/h</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: APORTE_COLOR }}>
            {Number(aporte.valor_hora).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-md px-2 py-1.5 text-center" style={{ background: `${APORTE_COLOR}20` }}>
          <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>Total</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: APORTE_COLOR }}>
            {Number(aporte.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Footer: descrição + autor/data */}
      {aporte.description && (
        <p className="text-[10px] mt-1.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {aporte.description}
        </p>
      )}
      <div className="flex items-center justify-between mt-1.5 text-[9px]" style={{ color: 'var(--text-light)' }}>
        <span>{aporte.contributed_by ?? '—'}</span>
        <span>{aporte.contributed_at ? new Date(aporte.contributed_at).toLocaleDateString('pt-BR') : ''}</span>
      </div>

      {/* Botão "Mover pra Aporte" — só em kanban_status='novo_contrato' */}
      {aporte.kanban_status === 'novo_contrato' && canWrite && onMoveToFinal && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onMoveToFinal() }}
          className="w-full mt-2 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
          style={{ background: `${APORTE_COLOR}20`, color: APORTE_COLOR, border: `1px solid ${APORTE_COLOR}55` }}
        >
          Mover pra coluna Aporte →
        </button>
      )}
    </div>
  )
}

function ContractKanbanCard({ card, index, onClick, onAction, onMove, availableColumns, canWrite }: {
  card: ContractCard; index: number; onClick: () => void; onAction?: (action: string) => void
  onMove?: (toCol: string) => void; availableColumns?: { id: string; label: string }[]; canWrite?: boolean
}) {
  const badge = statusBadge(card)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { user: viewerUser } = useAuth()
  // Configurador (universal): esconde a ação se o perfil/usuário estiver bloqueado nesta tela.
  const { isDenied } = useDeniedActions()
  const dEdit = isDenied('/contratos/kanban', 'edit')

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
          className="kanban-card rounded-xl p-3 cursor-pointer select-none transition-all group"
          style={{
            // Vinculado (principal↔item) ganha fundo/borda teal p/ evidenciar o vínculo.
            background: card.is_aditivo ? `${ADITIVO_COLOR}12` : (card.is_linked ? `${LINK_COLOR}14` : 'var(--surface)'),
            border: `1px solid ${card.is_aditivo ? `${ADITIVO_COLOR}73` : (card.is_linked ? `${LINK_COLOR}80` : 'var(--border)')}`,
            // Borda lateral colorida pelo status do contrato (Incompleto/Pronto/Projeto Ativo);
            // aditivo usa roxo pra se distinguir dos contratos comuns.
            borderLeft: `3px solid ${card.is_aditivo ? ADITIVO_COLOR : badge.color}`,
            // Faixa no topo (teal) quando o card é vinculado (principal com itens OU agregado de um pai).
            borderTop: card.is_linked ? `3px solid ${LINK_COLOR}` : undefined,
            boxShadow: snap.isDragging ? 'var(--brand-card-shadow-md)' : 'var(--brand-card-shadow)',
            opacity: snap.isDragging ? 0.85 : 1,
            ...prov.draggableProps.style,
            ...(menuOpen ? { position: 'relative', zIndex: 50 } : {}),
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-title break-normal">{card.customer_name}</p>
              {card.project_name && (
                <p className="kpi-sub break-normal">{card.project_name}</p>
              )}
              {card.contract_code && (
                <p className="text-[10px] font-mono font-semibold mt-0.5" style={{ color: card.is_linked ? LINK_COLOR : 'var(--text-muted)' }}>
                  {card.is_linked && '🔗 '}{card.contract_code}
                </p>
              )}
              {card.parent_contract_id && (
                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${LINK_COLOR}1f`, color: LINK_COLOR, border: `1px solid ${LINK_COLOR}59` }}
                  title={`Item vinculado ao contrato ${card.parent_contract_code ?? ''}`}>
                  🔗 vínculo {card.parent_contract_code ?? ''}
                </span>
              )}
              {!card.parent_contract_id && (card.linked_children?.length ?? 0) > 0 && (
                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${LINK_COLOR}1f`, color: LINK_COLOR, border: `1px solid ${LINK_COLOR}59` }}
                  title={`Itens vinculados: ${(card.linked_children ?? []).map(c => c.code).filter(Boolean).join(', ')}`}>
                  🔗 {card.linked_children!.length} {card.linked_children!.length > 1 ? 'itens' : 'item'} vinculado{card.linked_children!.length > 1 ? 's' : ''}
                </span>
              )}
              {card.gerou_aporte && (
                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}
                  title="Subprojeto faturado — gerou um aporte automático no projeto pai">
                  Gerou aporte
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="kpi-label px-1.5 py-0.5 rounded-full whitespace-nowrap font-semibold"
                style={{ background: card.is_aditivo ? `${ADITIVO_COLOR}2e` : badge.bg, color: card.is_aditivo ? ADITIVO_COLOR : badge.color }}>
                {card.is_aditivo ? '➕ ADITIVO' : badge.label}
              </span>
              {onAction && (
                <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-light)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <MoreVertical size={12} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-6 z-[100] w-44 rounded-xl overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--brand-card-shadow-md)' }}>
                      {CONTRACT_MENU_ITEMS.filter(item => (!item.adminOnly || canWrite) && (!(item as any).coordHidden || viewerUser?.type !== 'coordenador') && !(item.action === 'edit' && dEdit)).map(item => {
                        const Icon = item.icon
                        const isDanger = (item as any).danger
                        return (
                          <button key={item.action}
                            onClick={e => { e.stopPropagation(); setMenuOpen(false); onAction(item.action) }}
                            className="ds-row-hover w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors"
                            style={{ color: isDanger ? 'var(--danger-border)' : 'var(--text)' }}>
                            <Icon size={13} style={{ color: isDanger ? 'var(--danger-border)' : 'var(--text-light)' }} />
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

          {card.is_aditivo && (() => {
            const fieldLabel: Record<string, string> = { valor_hora: 'Valor-hora', horas_contratadas: 'Horas', valor_projeto: 'Valor do contrato', multiplo: 'Valor do contrato' }
            const money = (n?: number | null) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            const horas = (n?: number | null) => n == null ? '—' : `${Number(n)}h`
            const isHours = card.aditivo_field === 'horas_contratadas'
            const fmt = (n?: number | null) => n == null ? '—' : isHours ? horas(n) : money(n)
            // Multi (Mensal): mostra o breakdown (valor-hora + horas) + o valor do contrato.
            if (card.aditivo_field === 'multiplo') {
              return (
                <div className="rounded-lg px-2 py-1.5 mb-2" style={{ background: `${ADITIVO_COLOR}14`, border: `1px solid ${ADITIVO_COLOR}40` }}>
                  {card.aditivo_project_code && (
                    <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>Projeto: <span style={{ color: 'var(--text)' }}>{card.aditivo_project_code}</span></p>
                  )}
                  {(card.aditivo_changes ?? []).map((c, i) => (
                    <p key={i} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {c.label}: {c.field === 'valor_hora' ? money(c.old) : horas(c.old)} → {c.field === 'valor_hora' ? money(c.new) : horas(c.new)}
                    </p>
                  ))}
                  <p className="text-[11px] font-semibold" style={{ color: ADITIVO_COLOR }}>
                    Valor do contrato: {money(card.aditivo_old_value)} → {money(card.aditivo_new_value)}
                  </p>
                </div>
              )
            }
            return (
              <div className="rounded-lg px-2 py-1.5 mb-2" style={{ background: `${ADITIVO_COLOR}14`, border: `1px solid ${ADITIVO_COLOR}40` }}>
                {card.aditivo_project_code && (
                  <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>Projeto: <span style={{ color: 'var(--text)' }}>{card.aditivo_project_code}</span></p>
                )}
                <p className="text-[11px] font-semibold" style={{ color: ADITIVO_COLOR }}>
                  {fieldLabel[card.aditivo_field ?? ''] ?? 'Alteração'}: {fmt(card.aditivo_old_value)} → {fmt(card.aditivo_new_value)}
                </p>
                {card.aditivo_contract_new != null && (
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Valor contrato: {card.aditivo_contract_old != null ? Number(card.aditivo_contract_old).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'} → {Number(card.aditivo_contract_new).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                )}
              </div>
            )
          })()}

          <div className="flex flex-wrap gap-1 mb-2">
            {card.categoria && (() => {
              const svL = card.service_type?.toLowerCase() ?? ''
              const isBizify = svL.includes('bizify')
              const effectivelySust = card.categoria === 'sustentacao'
                || svL.includes('sustent') || svL.includes('cloud') || svL.includes('bizify')
              // Bizify é tipo próprio (fila/cor dedicada no kanban) — não colapsa em "Sustentação".
              const catLabel = isBizify ? 'Bizify' : (effectivelySust ? 'Sustentação' : 'Projeto')
              return (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                  {catLabel}
                </span>
              )
            })()}
            {card.contract_type && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                {card.contract_type}
              </span>
            )}
            {card.service_type && card.service_type.toLowerCase() !== 'projeto' && card.service_type.toLowerCase() !== 'sustentação' && card.service_type.toLowerCase() !== 'sustentacao' && card.service_type.toLowerCase() !== 'bizify' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                {card.service_type}
              </span>
            )}
            {card.tipo_faturamento && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-light)' }}>
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
                  className="p-1 rounded-md transition-colors" title="Abrir Chat"
                  style={{ color: 'var(--text-light)', background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <MessageSquare size={11} />
                </button>
              )}
              {card.project_code && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  {card.project_code}
                </span>
              )}
            </div>
          </div>

          {availableColumns && availableColumns.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}
              onClick={e => e.stopPropagation()}>
              <select
                value=""
                onChange={e => { if (e.target.value) { onMove?.(e.target.value); e.currentTarget.value = '' } }}
                className="w-full text-[10px] rounded-lg px-2 py-1.5 cursor-pointer appearance-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', outline: 'none' }}
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

function ProjectKanbanCard({ card, index, onClick, onAction, onMove, availableColumns, canWrite, columnCoordinatorName }: {
  card: ProjectCard; index: number; onClick: () => void; onAction: (action: string) => void
  onMove?: (toCol: string) => void; availableColumns?: { id: string; label: string }[]; canWrite?: boolean
  // Nome do coordenador DONO da coluna onde o card é renderizado ("sempre manter a coluna").
  columnCoordinatorName?: string
}) {
  const { user: viewerUser } = useAuth()
  // Configurador (universal): esconde a ação se o perfil/usuário estiver bloqueado nesta tela.
  const { isDenied } = useDeniedActions()
  const dEdit = isDenied('/contratos/kanban', 'edit')
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
    paused:    'var(--warning)',
    cancelled: 'var(--danger)',
    finished:  'var(--info)',
    started:   'var(--success)',
    awaiting_start: 'var(--text-muted)',
    liberado_para_testes: 'var(--warning)',
  }
  const statusBg: Record<string, string> = {
    paused:    'var(--warning-bg)',
    cancelled: 'var(--danger-bg)',
    finished:  'var(--info-bg)',
    started:   'var(--success-bg)',
    awaiting_start: 'var(--surface-hover)',
    liberado_para_testes: 'var(--warning-bg)',
  }
  const color = statusColor[card.status] ?? 'var(--text-muted)'
  const bgChip = statusBg[card.status] ?? 'var(--surface-hover)'

  return (
    <Draggable draggableId={`project-${card.id}`} index={index}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="kanban-card rounded-xl p-3 cursor-pointer select-none transition-all group"
          style={{
            background: 'var(--surface)',
            border: `1px solid var(--border)`,
            // Borda lateral colorida pelo status do projeto
            borderLeft: `3px solid ${color}`,
            // Capa: faixa teal no topo quando vinculado (mensalidade com itens OU item de um pai).
            borderTop: card.is_linked ? `3px solid ${LINK_COLOR}` : undefined,
            boxShadow: snap.isDragging ? 'var(--brand-card-shadow-md)' : 'var(--brand-card-shadow)',
            opacity: snap.isDragging ? 0.85 : 1,
            ...prov.draggableProps.style,
            ...(menuOpen ? { position: 'relative', zIndex: 50 } : {}),
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold break-normal" style={{ color: 'var(--text)' }}>
                {card.customer_name}
              </p>
              <p className="text-xs break-normal" style={{ color: 'var(--text-light)' }}>{card.project_name}</p>
              {(card.contract_code || card.code) && (
                <p className="text-[10px] font-mono font-semibold mt-0.5" style={{ color: card.is_linked ? LINK_COLOR : 'var(--text-muted)' }}>
                  {card.is_linked && '🔗 '}{card.contract_code || card.code}
                </p>
              )}
              {card.parent_contract_id && (
                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${LINK_COLOR}1f`, color: LINK_COLOR, border: `1px solid ${LINK_COLOR}59` }}
                  title={`Item vinculado ao contrato ${card.parent_contract_code ?? ''}`}>
                  🔗 vínculo {card.parent_contract_code ?? ''}
                </span>
              )}
              {!card.parent_contract_id && (card.linked_children?.length ?? 0) > 0 && (
                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${LINK_COLOR}1f`, color: LINK_COLOR, border: `1px solid ${LINK_COLOR}59` }}
                  title={`Itens vinculados: ${(card.linked_children ?? []).map(c => c.code).filter(Boolean).join(', ')}`}>
                  🔗 {card.linked_children!.length} {card.linked_children!.length > 1 ? 'itens' : 'item'} vinculado{card.linked_children!.length > 1 ? 's' : ''}
                </span>
              )}
              {/* SaaS: valor do projeto na capa (SaaS é só valor, sem horas). */}
              {(card.contract_type?.toLowerCase().includes('saas')) && card.project_value != null && (
                <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(card.project_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: bgChip, color }}>
                {STATUS_LABEL[card.status] ?? card.status}
              </span>
              <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-light)', background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <MoreVertical size={12} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-6 z-[100] w-44 rounded-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--brand-card-shadow-md)' }}>
                    {PROJECT_MENU_ITEMS.filter(item => (!item.adminOnly || canWrite) && (!(item as any).coordHidden || viewerUser?.type !== 'coordenador') && !(item.action === 'edit' && dEdit)).map(item => {
                      const Icon = item.icon
                      const isDanger = (item as any).danger
                      return (
                        <button key={item.action}
                          onClick={e => { e.stopPropagation(); setMenuOpen(false); onAction(item.action) }}
                          className="ds-row-hover w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors"
                          style={{ color: isDanger ? 'var(--danger-border)' : 'var(--text)' }}>
                          <Icon size={13} style={{ color: isDanger ? 'var(--danger-border)' : 'var(--text-light)' }} />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          {(card.contract_type || card.service_type) && (
            <div className="flex flex-wrap gap-1 mb-2">
              {card.contract_type && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                  {card.contract_type}
                </span>
              )}
              {card.service_type && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                  {card.service_type}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid var(--border)` }}>
            <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>
              {(() => { const who = columnCoordinatorName ?? card.coordinators?.[0]; return who ? `👤 ${who}` : '' })()}
            </span>
            <div className="flex items-center gap-1">
              {/* Ícone de chat removido (2026-05-28): após virar projeto, chat sai. Chat só na Requisição/Contrato. */}
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
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
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', outline: 'none' }}
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
  sust_cloud: 'Cloud', sust_bizify: 'Bizify', sust_saas: 'SaaS',
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
  const [tab, setTab]   = useState<'details' | 'chat' | 'log' | 'extrato'>(initialTab ?? 'details')
  const canEditExtrato = userRole === 'admin' || userRole === 'coordenador'
  // Configurador (universal): esconde a ação se o perfil/usuário estiver bloqueado nesta tela.
  const { isDenied } = useDeniedActions()
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
  const fmtDateTime = (val: any) => val ? new Date(val).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
  const fmtSize  = (b: any) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const ATT_LABEL: Record<string, string> = { proposta: 'Proposta', contrato: 'Contrato', logo: 'Logo' }

  const downloadAttachment = async (att: any) => {
    const res = await fetch(`/api/v1/contracts/${card.id}/attachments/${att.id}`, { credentials: 'same-origin' })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = att.original_name; a.click()
    URL.revokeObjectURL(url)
  }

  const fields: [string, string][] = full ? [
    ['Criado em',           fmtDateTime(card.created_at)],
    ['Categoria',           full.categoria === 'sustentacao' ? 'Sustentação' : 'Projeto'],
    ['Tipo de Contrato',    full.contract_type?.name ?? '—'],
    ['Tipo de Serviço',     full.service_type?.name ?? '—'],
    ['Código do Projeto',   full.project_code_preview ?? '—'],
    ['Nome do Projeto',     full.project_name ?? '—'],
    ['Faturamento',         full.tipo_faturamento ? (TIPO_LABEL[full.tipo_faturamento] ?? full.tipo_faturamento) : '—'],
    ['Horas Contratadas',   fmtHours(full.horas_contratadas)],
    ['Percentual Gestão',   full.pct_horas_coordenador != null ? `${full.pct_horas_coordenador}%` : '—'],
    ['Horas de Gestão',     (full.pct_horas_coordenador != null && full.horas_contratadas != null) ? `${Math.round((Number(full.pct_horas_coordenador) / 100) * Number(full.horas_contratadas) * 100) / 100}h` : '—'],
    ['Horas Consultor',     fmtHours(full.horas_consultor)],
    ['Saving ERPSERV',      (full.horas_contratadas != null && full.horas_consultor != null && full.pct_horas_coordenador != null) ? `${Math.round((Number(full.horas_contratadas) - Number(full.horas_consultor) - (Number(full.pct_horas_coordenador) / 100) * Number(full.horas_contratadas)) * 100) / 100}h` : '—'],
    ['Horas Apontáveis',    fmtHours((full as any).horas_coordenacao)],
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
    ['Criado em',         fmtDateTime(card.created_at)],
    ['Categoria',         card.categoria === 'sustentacao' ? 'Sustentação' : 'Projeto'],
    ['Tipo de Contrato',  card.contract_type ?? '—'],
    ['Faturamento',       card.tipo_faturamento ? (TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento) : '—'],
    ['Horas Contratadas', fmtHours(card.horas_contratadas)],
    ['Valor do Projeto',  fmtMoney(card.valor_projeto)],
    ['Status Contrato',   card.status],
    ['Projeto',           card.project_code ?? '—'],
  ]

  const tabStyle = (t: string) => tab === t
    ? { background: 'var(--warning-bg)', color: 'var(--warning-border)', border: '1px solid var(--warning-border)' }
    : { color: 'var(--text-light)', border: '1px solid transparent' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }}>
        <div className="px-6 py-5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{card.customer_name}</p>
              {card.project_name && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{card.project_name}</p>}
              {full?.generated_aporte && (
                <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}
                  title="Subprojeto faturado — gerou um aporte automático no projeto pai">
                  Gerou aporte automático
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold px-2 py-1 rounded-full"
                style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-light)' }}><X size={16} /></button>
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
            {(card.project_id ?? full?.project?.id) && (
              <button onClick={() => setTab('extrato')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={tabStyle('extrato')}>
                <FileText size={11} /> Extrato
              </button>
            )}
          </div>
        </div>

        {tab === 'chat' ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <ContractMessages contractId={card.id} userRole={userRole} />
          </div>
        ) : tab === 'log' ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {logs.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhum histórico</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                    <div>
                      <span style={{ color: 'var(--text)' }}>{colLabel(log.from_column)}</span>
                      <span className="mx-1">→</span>
                      <span style={{ color: 'var(--text)' }}>{colLabel(log.to_column)}</span>
                      <span className="ml-2 opacity-60">por {log.moved_by}</span>
                      <span className="ml-2 opacity-40">{new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'extrato' ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {(card.project_id ?? full?.project?.id)
              ? <MonthlyAccrualTable projectId={(card.project_id ?? full?.project?.id) as number} canEditConsumption={canEditExtrato} />
              : <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Sem projeto gerado.</p>}
          </div>
        ) : (
          <>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              {!full && <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Carregando...</p>}
              {/* Faturamento consolidado — item BH Mensal cobrado no contrato principal (fatura única). */}
              {card.bh_mensal_item && (
                <div className="rounded-xl p-4 text-sm font-bold leading-snug"
                  style={{ background: '#f973161f', color: '#c2410c', border: '1px solid #f9731666' }}>
                  💰 O faturamento deste Banco de Horas Mensal será no contrato principal de Cloud nº {card.parent_contract_code ?? '—'} — fatura única.
                </div>
              )}
              {card.has_bh_mensal_items && card.combined_billing_value != null && (
                <div className="rounded-xl p-4 text-sm font-bold leading-snug"
                  style={{ background: '#0e74901f', color: '#0e7490', border: '1px solid #0e749066' }}>
                  💰 Fatura única: {Number(card.combined_billing_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  <span className="block font-medium mt-0.5">Inclui a mensalidade + o(s) item(ns) de Banco de Horas Mensal (uma única nota).</span>
                </div>
              )}
              {/* Aditivo: visão objetiva do que foi alterado (pro administrativo cobrar) */}
              {card.is_aditivo && (() => {
                const fieldLabel: Record<string, string> = { valor_hora: 'Valor da Hora', horas_contratadas: 'Quantidade de Horas', valor_projeto: 'Valor do Contrato', multiplo: 'Valor do Contrato' }
                const isHours = card.aditivo_field === 'horas_contratadas'
                const fmt = (n?: number | null) => n == null ? '—' : isHours ? `${Number(n)}h` : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                const lbl = 'text-[10px] font-semibold uppercase tracking-wider'
                const effMonth = card.aditivo_effective_from ? (() => { const [y, m] = card.aditivo_effective_from!.slice(0, 7).split('-'); return `${m}/${y}` })() : null
                return (
                  <div className="rounded-xl p-4" style={{ background: `${ADITIVO_COLOR}10`, border: `1px solid ${ADITIVO_COLOR}55` }}>
                    <p className="text-xs font-bold mb-3" style={{ color: ADITIVO_COLOR }}>➕ ADITIVO DE CONTRATO</p>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div><p className={lbl} style={{ color: 'var(--text-light)' }}>Cliente</p><p style={{ color: 'var(--text)' }}>{card.customer_name}</p></div>
                      <div><p className={lbl} style={{ color: 'var(--text-light)' }}>Projeto</p><p style={{ color: 'var(--text)' }}>{[card.aditivo_project_code, card.aditivo_project_name].filter(Boolean).join(' — ') || '—'}</p></div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: `1px solid ${ADITIVO_COLOR}40` }}>
                      <p className={lbl} style={{ color: 'var(--text-light)' }}>O que foi alterado</p>
                      <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>{fieldLabel[card.aditivo_field ?? ''] ?? '—'}</p>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>De</p>
                          <p className="text-lg font-bold line-through" style={{ color: 'var(--text-muted)' }}>{fmt(card.aditivo_old_value)}</p>
                        </div>
                        <span className="text-lg font-bold" style={{ color: ADITIVO_COLOR }}>→</span>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Para</p>
                          <p className="text-lg font-bold" style={{ color: ADITIVO_COLOR }}>{fmt(card.aditivo_new_value)}</p>
                        </div>
                      </div>
                      {effMonth && <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Vigência: a partir de <span className="font-semibold" style={{ color: 'var(--text)' }}>{effMonth}</span></p>}
                      {card.aditivo_field === 'multiplo' && (card.aditivo_changes?.length ?? 0) > 0 ? (
                        <div className="mt-2 pt-2" style={{ borderTop: '1px dashed var(--border)' }}>
                          <p className={lbl} style={{ color: 'var(--text-light)' }}>Alterações</p>
                          {card.aditivo_changes!.map((c, i) => {
                            const f = (n: number) => c.field === 'valor_hora' ? Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${Number(n)}h`
                            return (
                              <p key={i} className="text-sm" style={{ color: 'var(--text)' }}>
                                {c.label}: <span className="line-through" style={{ color: 'var(--text-muted)' }}>{f(c.old)}</span> → <span style={{ color: ADITIVO_COLOR }}>{f(c.new)}</span>
                              </p>
                            )
                          })}
                        </div>
                      ) : card.aditivo_contract_new != null ? (
                        <div className="mt-2 pt-2" style={{ borderTop: '1px dashed var(--border)' }}>
                          <p className={lbl} style={{ color: 'var(--text-light)' }}>Valor do contrato (horas × valor-hora)</p>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            <span className="line-through" style={{ color: 'var(--text-muted)' }}>{card.aditivo_contract_old != null ? Number(card.aditivo_contract_old).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</span>
                            {' → '}
                            <span style={{ color: ADITIVO_COLOR }}>{Number(card.aditivo_contract_new).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                      <div><p className={lbl} style={{ color: 'var(--text-light)' }}>Cond. Pagamento</p><p style={{ color: 'var(--text)' }}>{card.aditivo_cond_pagamento || '—'}</p></div>
                      <div><p className={lbl} style={{ color: 'var(--text-light)' }}>Observação</p><p style={{ color: 'var(--text)' }}>{card.aditivo_obs || '—'}</p></div>
                    </div>
                  </div>
                )
              })()}

              {!card.is_aditivo && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {fields.map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
                      <p className="text-sm" style={{ color: 'var(--text)' }}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {full && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Contatos ({full.contacts?.length ?? 0})</p>
                  {full.contacts?.length > 0 ? (
                    <div className="space-y-2">
                      {full.contacts.map((ct: any, i: number) => (
                        <div key={ct.id ?? ct.email ?? i} className="px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                          <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                            {ct.name}{ct.cargo ? <span style={{ color: 'var(--text-light)' }}> · {ct.cargo}</span> : null}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{[ct.email, ct.phone].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum contato</p>
                  )}
                </div>
              )}
              {full && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Anexos ({full.attachments?.length ?? 0})</p>
                  {full.attachments?.length > 0 ? (
                    <div className="space-y-2">
                      {full.attachments.map((att: any) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={13} className="shrink-0" style={{ color: 'var(--text-light)' }} />
                            <div className="min-w-0">
                              <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{att.original_name}</p>
                              <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{ATT_LABEL[att.type] ?? att.type}{att.size != null ? ` · ${fmtSize(att.size)}` : ''}</p>
                            </div>
                          </div>
                          <button onClick={() => downloadAttachment(att)} title="Baixar" className="p-1 shrink-0 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}>
                            <Download size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum anexo</p>
                  )}
                </div>
              )}
              {!card.is_complete && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-border)' }}>
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>Contrato incompleto — preencha cliente, horas, tipo de contrato e faturamento para alocar a um coordenador.</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Fechar</button>
              {!isDenied('/contratos/kanban', 'edit') && (
                <button onClick={() => { onClose(); onEditContract?.(card.id) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <Pencil size={13} /> Editar Contrato
                </button>
              )}
              <button onClick={() => { window.location.href = '/contratos' }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
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
  // Configurador (universal): esconde a ação se o perfil/usuário estiver bloqueado nesta tela.
  const { isDenied } = useDeniedActions()
  const dCreate = isDenied('/contratos/kanban', 'create')
  const dCancel = isDenied('/contratos/kanban', 'cancel')

  type SustGroups = Record<string, (ContractCard | ProjectCard)[]>

  const [demandCards,       setDemandCards]       = useState<ContractCard[]>([])
  const [projectCards,      setProjectCards]       = useState<ProjectCard[]>([])
  const [aporteCards,       setAporteCards]        = useState<AporteCard[]>([])
  const [selectedAporte,    setSelectedAporte]     = useState<AporteCard | null>(null)
  const [coordinators,      setCoordinators]       = useState<Coordinator[]>([])
  // Multi-empresa: kanban Bizify — colunas por "Coordenador Bizify" + SaaS quando a empresa ativa é Bizify.
  const [isBizifyActive,    setIsBizifyActive]     = useState(false)
  const [bizifyCoordinators, setBizifyCoordinators] = useState<Coordinator[]>([])
  const [sustGroups,        setSustGroups]         = useState<SustGroups>({
    sust_bh_fixo: [], sust_bh_mensal: [], sust_on_demand: [], sust_cloud: [], sust_bizify: [], sust_saas: [],
  })
  const [loading,           setLoading]            = useState(true)
  const [selected,          setSelected]           = useState<ContractCard | null>(null)
  const [contractAction,    setContractAction]     = useState<{ card: ContractCard; action: string } | null>(null)
  const [projectAction,     setProjectAction]      = useState<{ card: ProjectCard; action: string } | null>(null)

  // Contract form modal state
  const [showNewContract,     setShowNewContract]     = useState(false)
  const [editingContractData, setEditingContractData] = useState<any | null>(null)
  const [filterSearch,        setFilterSearch]        = useState('')
  const [filterCustomers,     setFilterCustomers]     = useState<string[]>([])
  const [filterExecutivos,    setFilterExecutivos]    = useState<string[]>([])
  const [filterProjectNames,  setFilterProjectNames]  = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<any>('/contracts/kanban')
      const demandList = r.demand_cards ?? r.contracts ?? []
      const demandIds  = new Set(demandList.map((c: any) => c.id))
      const transitionExtra = (r.transition_cards ?? []).filter((c: any) => !demandIds.has(c.id))
      setDemandCards([...demandList, ...transitionExtra])
      setProjectCards(r.project_cards ?? [])
      setAporteCards(r.aporte_cards ?? [])
      setCoordinators(r.coordinators ?? [])
      setIsBizifyActive(r.is_bizify_active ?? false)
      setBizifyCoordinators(r.bizify_coordinators ?? [])
      setSustGroups({
        sust_bh_fixo:   r.sustentacao_groups?.sust_bh_fixo   ?? [],
        sust_bh_mensal: r.sustentacao_groups?.sust_bh_mensal ?? [],
        sust_on_demand: r.sustentacao_groups?.sust_on_demand ?? [],
        sust_cloud:     r.sustentacao_groups?.sust_cloud     ?? [],
        sust_bizify:    r.sustentacao_groups?.sust_bizify    ?? [],
        sust_saas:      r.sustentacao_groups?.sust_saas      ?? [],
      })
    } catch { toast.error('Erro ao carregar kanban') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const canWrite = user?.type === 'admin' || user?.type === 'administrativo'

  const isSustAdmin = user?.type === 'admin' ||
    (user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao')

  const isSustCoordenador = user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao'

  // Board do coordenador de sustentação também mostra a coluna do Ricardo Oliveira (ao
  // lado da dele). Achado por NOME na lista de coordenadores (o BE já manda) — evita
  // hardcodar id, que difere entre ambientes. Tolera o typo "OIiveira" do cadastro.
  const ricardoCoord = coordinators.find(c => {
    const n = (c.name ?? '').toLowerCase()
    return n.includes('ricardo') && (n.includes('oliveira') || n.includes('oiiveira'))
  })
  // Ids dos coordenadores que têm coluna no board do sust (p/ escopar as colunas de status).
  const sustBoardCoordIds = [user?.id, ricardoCoord?.id].filter((v): v is number => v != null)

  // Column list: fixed → coordinators → sustentação group → bizify → project status
  // Kanban EXCLUSIVO do coordenador de sustentação: coluna "Projetos <nome>" (dele, azul)
  // + coluna do Ricardo Oliveira + filas de sustentação (BH Fixo/Mensal/On Demand/Cloud)
  // + status (Encerrado/Pausado/Cancelado). Mesmos endpoints do board de contratos →
  // movimentação reflete em Demandas e Projetos (e vice-versa). Colunas de status escopadas
  // aos projetos desses coordenadores (ver projectsInStatusCol). Sem intake/Bizify/Aporte.
  const columns: Column[] = isBizifyActive
    // Kanban BIZIFY (empresa ativa = Bizify): colunas por "Coordenador Bizify" (flag no user)
    // + BH Fixo/Mensal/On Demand/SaaS + status. Sem Cloud, sem coluna Bizify genérica.
    ? [
        ...FIXED_COLUMNS,
        ...bizifyCoordinators.map(c => ({
          id:            `coordinator:${c.id}`,
          label:         c.name,
          type:          'coordinator' as const,
          coordinatorId: c.id,
          emoji:         '👤',
          color:         BIZIFY_COLOR,
        })),
        ...SUSTENTACAO_COLS_BIZIFY,
        ...STATUS_PROJECT_COLUMNS,
        APORTE_COL,
        ADITIVO_COL,
      ]
    : isSustCoordenador
    ? [
        {
          id:            `coordinator:${user!.id}`,
          label:         `Projetos ${user!.name.split(' ')[0]}`,
          type:          'coordinator' as const,
          coordinatorId: user!.id,
          emoji:         '👤',
          color:         MEUS_PROJETOS_COLOR,
        },
        ...(ricardoCoord ? [{
          id:            `coordinator:${ricardoCoord.id}`,
          label:         'Projetos Ricardo Oliveira',
          type:          'coordinator' as const,
          coordinatorId: ricardoCoord.id,
          emoji:         '👤',
        }] : []),
        ...SUSTENTACAO_COLS,
        ...STATUS_PROJECT_COLUMNS,
      ]
    : [
        ...FIXED_COLUMNS,
        ...coordinators.map(c => ({
          id:            `coordinator:${c.id}`,
          label:         c.name,
          type:          'coordinator' as const,
          coordinatorId: c.id,
          emoji:         '👤',
          // Coordenador de sustentação que coordena projetos pontuais: coluna laranja
          // (mesma cor da legenda Sustentação) pra diferenciar dos coord. de projeto.
          color:         c.coordinator_type === 'sustentacao' ? SUST_COLOR : undefined,
        })),
        ...SUSTENTACAO_COLS,
        // Bizify virou EMPRESA (multiempresa) — não é mais coluna no board ERPSERV.
        ...STATUS_PROJECT_COLUMNS,
        APORTE_COL,
        ADITIVO_COL,
      ]

  // ── Filtros ──────────────────────────────────────────────────────────────
  const matchFilter = (customerName?: string | null, name?: string | null, code?: string | null): boolean => {
    const cn = customerName ?? ''
    const nm = name ?? ''
    const cd = code ?? ''
    if (filterCustomers.length > 0 && !filterCustomers.includes(cn)) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      return cn.toLowerCase().includes(q) || nm.toLowerCase().includes(q) || cd.toLowerCase().includes(q)
    }
    return true
  }

  const allCustomers = [...new Set([
    ...demandCards.map(c => c.customer_name),
    ...projectCards.map(p => p.customer_name),
    ...Object.values(sustGroups).flat().map(c => c.customer_name),
  ].filter(Boolean))].sort() as string[]

  const allExecutivosKanban = [...new Set([
    ...demandCards.flatMap(c => c.executivo_conta_name ? [c.executivo_conta_name] : []),
    ...projectCards.flatMap(p => p.executivo_conta_name ? [p.executivo_conta_name] : []),
  ])].sort()

  const allProjectKanbanOptions = [...new Map(
    [...projectCards, ...Object.values(sustGroups).flat().filter((c: any) => c.card_type === 'project')]
      .filter((p: any) => filterCustomers.length === 0 || filterCustomers.includes(p.customer_name))
      .map((p: any) => [p.project_name, { id: p.project_name, name: p.project_name + ((p.code ?? p.project_code) ? ` (${p.code ?? p.project_code})` : '') }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  // Limpa projetos selecionados quando o cliente muda
  useEffect(() => {
    if (filterCustomers.length === 0 || filterProjectNames.length === 0) return
    const validNames = new Set(projectCards.filter(p => filterCustomers.includes(p.customer_name)).map(p => p.project_name))
    setFilterProjectNames(prev => prev.filter(n => validNames.has(n)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCustomers])

  const matchExecutivoKanban = (executivo?: string | null): boolean => {
    if (filterExecutivos.length === 0) return true
    return filterExecutivos.includes(executivo ?? '')
  }

  const matchProjectKanban = (projectName?: string | null): boolean =>
    filterProjectNames.length === 0 || filterProjectNames.includes(projectName ?? '')

  // SaaS é definido pelo TIPO de contrato — no kanban Bizify vira coluna de tipo
  // (igual sustentação): sempre na coluna SaaS, nunca numa coluna de coordenador.
  const isSaasCard = (c: { contract_type?: string | null; service_type?: string | null } | any): boolean =>
    !!(c?.contract_type?.toLowerCase().includes('saas') || c?.service_type?.toLowerCase().includes('saas'))

  // Contract cards per column
  const contractsInCol = (colId: string): (ContractCard | ProjectCard)[] => {
    let base: (ContractCard | ProjectCard)[] = colId.startsWith('sust_')
      ? [...(sustGroups[colId] ?? [])]
      : demandCards.filter(c => contractColumnId(c) === colId)
    // Kanban Bizify: SaaS sempre na coluna SaaS. Coordenador não recebe SaaS;
    // a coluna SaaS agrega também os projetos SaaS ativos que não vieram no grupo.
    if (isBizifyActive) {
      if (colId === 'sust_saas') {
        const already = new Set(base.map((c: any) => c.id))
        base = [...base, ...projectCards.filter(p => isActiveProject(p) && isSaasCard(p) && !already.has(p.id))]
      } else if (colId.startsWith('coordinator:')) {
        base = base.filter(c => !isSaasCard(c))
      }
    }
    // Em colunas de coordenador, oculta contratos cujo projeto já aparece em activeProjectsInCoordCol
    const activeProjectIds = colId.startsWith('coordinator:')
      ? new Set(projectCards.filter(isActiveProject).map(p => p.id))
      : null
    return base
      .filter(c => matchFilter(c.customer_name, c.project_name, (c as any).contract_code ?? (c as any).project_code))
      .filter(c => matchExecutivoKanban((c as ContractCard).executivo_conta_name))
      .filter(c => matchProjectKanban(c.project_name))
      .filter(c => !activeProjectIds || !(c as ContractCard).project_id)
      .sort((a, b) => (a.kanban_order ?? 0) - (b.kanban_order ?? 0))
  }

  // Coordenador efetivo de um projeto: override (kanban_coordinator_override_id) tem
  // precedência sobre a relação M2M (coordinator_ids).
  const projectHasCoord = (p: ProjectCard, coordId: number): boolean => {
    const effective = p.kanban_coordinator_override_id != null
      ? [p.kanban_coordinator_override_id]
      : (p.coordinator_ids ?? [])
    return effective.includes(coordId)
  }

  // Active project cards per coordinator column.
  // Override (kanban_coordinator_override_id) tem precedência: se setado, o card
  // vai SÓ pra coluna do override, ignorando coordinator_ids da relação M2M.
  const activeProjectsInCoordCol = (coordId: number): ProjectCard[] =>
    projectCards.filter(p => {
      if (!isActiveProject(p)) return false
      // Kanban Bizify: SaaS nunca cai em coluna de coordenador (vai pra coluna SaaS).
      if (isBizifyActive && isSaasCard(p)) return false
      if (!projectHasCoord(p, coordId)) return false
      return matchFilter(p.customer_name, p.project_name, (p as any).project_code ?? (p as any).contract_code)
        && matchExecutivoKanban(p.executivo_conta_name)
        && matchProjectKanban(p.project_name)
    })

  // Project cards in status columns.
  // No kanban EXCLUSIVO do coordenador de sustentação, escopa aos projetos dos coordenadores
  // do board (Anderson + Ricardo); no board completo (admin) mostra todos.
  const projectsInStatusCol = (colId: string): ProjectCard[] => {
    const targetStatus = COL_TO_PROJECT_STATUS[colId]
    return projectCards
      .filter(p => p.status === targetStatus)
      .filter(p => !isSustCoordenador || sustBoardCoordIds.some(id => projectHasCoord(p, id)))
      .filter(p => matchFilter(p.customer_name, p.project_name, (p as any).project_code ?? (p as any).contract_code))
      .filter(p => matchExecutivoKanban(p.executivo_conta_name))
      .filter(p => matchProjectKanban(p.project_name))
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
      // Fechado (closed) segue o fluxo de PROJETO (coordenador), nunca sustentação —
      // mesmo herdando serviço "Bizify" do contrato de mensalidade.
      const isFechado = ctLower.includes('fechado')
      const isSustType = !isFechado && (card.categoria === 'sustentacao'
        || svLower.includes('cloud') || svLower.includes('bizify') || svLower.includes('sustent'))
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

    // ── Cancel / pause (sem projeto)
    if (toCol === 'contract_cancelado' || toCol === 'contract_pausado') {
      const apiCol = toCol === 'contract_cancelado' ? 'cancelado' : 'pausado'
      setDemandCards(prev => prev.filter(c => c.id !== cardId))
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: apiCol, order })
        toast.success(apiCol === 'cancelado' ? 'Contrato cancelado' : 'Contrato pausado')
        await load()
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover card'); load() }
      return
    }

    // ── Moving between fixed columns (novo ↔ pronto ↔ aditivos)
    // Aditivo: 'aditivos' → kanban_status 'aditivo' (BE só deixa card aditivo entrar lá).
    const toKanbanStatus = toCol === 'pronto' ? 'inicio_autorizado' : toCol === 'aditivos' ? 'aditivo' : 'backlog'
    setDemandCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, kanban_status: toKanbanStatus, kanban_order: order } : c
    ))
    try {
      await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toKanbanStatus, order })
      toast.success('Card movido')
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover card'); load() }
  }

  const handleSustProjectCardMove = async (projectId: number, contractId: number, fromSustCol: string, toSustCol: string) => {
    if (!isSustAdmin) { toast.error('Apenas admin ou coordenador de sustentação pode mover.'); return }
    setSustGroups(prev => {
      const next = { ...prev }
      const card = prev[fromSustCol]?.find(c => c.id === projectId)
      next[fromSustCol] = (prev[fromSustCol] ?? []).filter(c => c.id !== projectId)
      if (card) next[toSustCol] = [...(prev[toSustCol] ?? []), { ...card, sustentacao_column: toSustCol }]
      return next
    })
    try {
      await api.patch(`/contracts/${contractId}/sustentacao-move`, { to_column: toSustCol })
      await load()
      toast.success('Card movido')
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover'); load() }
  }

  const handleProjectMove = async (cardId: number, toCol: string, currentCoordId?: number) => {
    // O card pode estar nos cards de projeto OU nas filas de sustentação (card_type='project')
    const card = projectCards.find(p => p.id === cardId)
      ?? (Object.values(sustGroups).flat().find((c: any) => c.id === cardId && c.card_type === 'project') as ProjectCard | undefined)
    const svL = (card?.service_type ?? '').toLowerCase()
    const ctL = (card?.contract_type ?? '').toLowerCase()
    const isSustProject = svL.includes('sustent') || svL.includes('cloud') || svL.includes('bizify')
      || ctL.includes('banco de horas') || ctL.includes('on demand') || ctL.includes('cloud') || ctL.includes('bizify')

    // ── Coluna de coordenador
    if (toCol.startsWith('coordinator:')) {
      const newCoordId = Number(toCol.split(':')[1])
      // Sustentação: o override (kanban_coordinator_override_id) é o controle. Setá-lo faz
      // o card migrar pra fila daquele coordenador (e o BE sincroniza o contrato, se houver).
      if (isSustProject) {
        setProjectCards(prev => prev.map(p => p.id === cardId ? { ...p, kanban_coordinator_override_id: newCoordId } : p))
        try {
          await api.patch(`/projects/${cardId}`, { kanban_coordinator_override_id: newCoordId })
          toast.success('Coordenador responsável definido')
          await load()
        } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover projeto'); load() }
        return
      }
      // Projeto (não-sustentação): relação M2M de coordenadores (comportamento legado)
      const fromCoordId = currentCoordId ?? card?.coordinator_ids?.[0]
      const isTerminal = !!card && ['paused', 'cancelled', 'finished'].includes(card.status)
      setProjectCards(prev => prev.map(p => {
        if (p.id !== cardId) return p
        const ids = (p.coordinator_ids ?? []).filter(id => id !== fromCoordId)
        if (!ids.includes(newCoordId)) ids.push(newCoordId)
        return { ...p, coordinator_ids: ids, ...(isTerminal ? { status: 'awaiting_start' } : {}) }
      }))
      try {
        const payload: any = { coordinator_id: newCoordId, from_coordinator_id: fromCoordId }
        if (isTerminal) payload.status = 'awaiting_start'
        await api.patch(`/projects/${cardId}/kanban-move`, payload)
        toast.success(isTerminal ? 'Projeto reativado!' : 'Coordenador atualizado')
        await load()
      } catch (e: any) {
        const msg = e?.response?.data?.message ?? e?.message ?? 'Erro ao mover projeto'
        toast.error(msg)
        load()
      }
      return
    }

    // ── Coluna de sustentação
    if (toCol.startsWith('sust_')) {
      if (card?.contract_id) {
        // Projeto contratado: move entre filas via contrato (mantém sustentacao_column)
        setProjectCards(prev => prev.filter(p => p.id !== cardId))
        try {
          await api.patch(`/contracts/${card.contract_id}/sustentacao-move`, { to_column: toCol })
          toast.success('Projeto movido para fila de sustentação')
          await load()
        } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover'); load() }
        return
      }
      if (!isSustProject) return // projeto não-sustentação não pertence à fila de sustentação
      // Projeto de sustentação sem contrato: a coluna vem do tipo de contrato; aqui só
      // limpamos o override (devolve da fila de um coordenador para a fila de sustentação).
      setProjectCards(prev => prev.map(p => p.id === cardId ? { ...p, kanban_coordinator_override_id: null } : p))
      try {
        await api.patch(`/projects/${cardId}`, { kanban_coordinator_override_id: null })
        toast.success('Projeto devolvido à fila de sustentação')
        await load()
      } catch (e: any) { toast.error(e?.message ?? 'Erro ao mover'); load() }
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

  // Coordenadores que TÊM coluna no board atual: Bizify = admins + coordenadores Bizify;
  // board normal = todos. Usado no "Mover para" de contratos E projetos — mover só pode ir
  // pra coluna que existe (senão o card some). Escopo de componente (as duas funções usam).
  const boardCoordinators = isBizifyActive ? bizifyCoordinators : coordinators

  const getAvailableContractCols = (card: ContractCard, fromCol: string): { id: string; label: string }[] => {
    // Coordenador de sustentação: só move cards da coluna "Meus Projetos" (que são
    // projetos, não contratos) — logo, nenhum contrato/fila é movível por ele.
    if (isSustCoordenador) return []
    // Aditivo só transita entre "Novo Contrato" e "Aditivos".
    if (card.is_aditivo) {
      return fromCol === 'aditivos'
        ? [{ id: 'novo', label: '🆕 Novo Contrato' }]
        : [{ id: 'aditivos', label: '➕ Aditivos' }]
    }
    const cols: { id: string; label: string }[] = []

    // Colunas de sustentação válidas NO BOARD ATUAL: Bizify usa BH Fixo/Mensal/On Demand/SaaS
    // (sem Cloud, sem coluna Bizify genérica); board normal usa BH/On Demand/Cloud + Bizify.
    const boardSustCols: { id: string; label: string }[] = isBizifyActive
      ? SUSTENTACAO_COLS_BIZIFY.map(s => ({ id: s.id, label: s.label }))
      : SUSTENTACAO_COLS.map(s => ({ id: s.id, label: s.label }))

    const ctLower = card.contract_type?.toLowerCase() ?? ''
    const svLower = card.service_type?.toLowerCase() ?? ''
    // Fechado (closed) segue o fluxo de PROJETO (coordenador), nunca sustentação —
    // mesmo herdando serviço "Bizify" do contrato de mensalidade.
    const isFechado = ctLower.includes('fechado')
    const isSustType = !isFechado && (card.categoria === 'sustentacao'
      || svLower.includes('cloud') || svLower.includes('bizify') || svLower.includes('sustent'))

    // Deriva a coluna de sustentação correspondente ao tipo do contrato
    const matchingSustCol = (): { id: string; label: string } | null => {
      if (ctLower.includes('bh fixo') || ctLower.includes('banco de horas fixo') || svLower.includes('bh fixo') || svLower.includes('bh_fixo'))
        return { id: 'sust_bh_fixo', label: 'BH Fixo' }
      if (ctLower.includes('bh mensal') || ctLower.includes('banco de horas mensal') || svLower.includes('bh mensal') || svLower.includes('bh_mensal'))
        return { id: 'sust_bh_mensal', label: 'BH Mensal' }
      if (ctLower.includes('on demand') || svLower.includes('on demand'))
        return { id: 'sust_on_demand', label: 'On Demand' }
      // No board da Bizify não há Cloud nem coluna Bizify — SaaS/Cloud/Bizify caem na coluna SaaS.
      if (isBizifyActive)
        return { id: 'sust_saas', label: 'SaaS' }
      if (ctLower.includes('saas') || svLower.includes('saas') || card.tipo_faturamento === 'saas')
        return { id: 'sust_saas', label: 'SaaS' }
      if (ctLower.includes('cloud') || svLower.includes('cloud'))
        return { id: 'sust_cloud', label: 'Cloud' }
      // Bizify não é mais coluna (virou empresa) — não oferecer sust_bizify.
      return null
    }

    const CANCEL_PAUSE = [
      ...(dCancel ? [] : [{ id: 'contract_cancelado', label: '🚫 Cancelar' }]),
      { id: 'contract_pausado',   label: '⏸ Pausar' },
    ]

    // Colunas de status de projeto: movimentação apenas pelo Pipeline
    if (fromCol.startsWith('col_')) return []

    if (fromCol.startsWith('sust_')) {
      if (!isSustAdmin) return []
      boardSustCols.forEach(s => { if (s.id !== fromCol) cols.push(s) })
      return cols
    }

    // ── Card alocado num coordenador (tem project_id = "Projeto Ativo")
    if (fromCol.startsWith('coordinator:')) {
      boardCoordinators.forEach(coord => {
        if (`coordinator:${coord.id}` !== fromCol)
          cols.push({ id: `coordinator:${coord.id}`, label: coord.name })
      })
      STATUS_PROJECT_COLUMNS.forEach(s => cols.push({ id: s.id, label: s.label }))
      return cols
    }

    // ── Sust card em pronto/novo: só a coluna correspondente ao tipo + cancelar/pausar
    if (isSustType && (fromCol === 'pronto' || fromCol === 'novo')) {
      if (isSustAdmin) {
        const matched = matchingSustCol()
        if (matched) {
          cols.push(matched)
        } else {
          boardSustCols.forEach(s => cols.push(s))
        }
      }
      cols.push(...CANCEL_PAUSE)
      return cols
    }

    if (!isSustCoordenador) {
      // Navegação de volta só para cards sem projeto gerado
      if (!card.project_id) {
        if (fromCol === 'novo') cols.push({ id: 'pronto', label: 'Pronto para Iniciar' })
        if (fromCol === 'pronto') cols.push({ id: 'novo', label: 'Novo Contrato' })
      }

      if (card.kanban_status !== 'novo_projeto') {
        if (!isSustType && card.is_complete) {
          boardCoordinators.forEach(coord => cols.push({ id: `coordinator:${coord.id}`, label: coord.name }))
        }
      }
    }

    // Cancelar/pausar disponível em pronto para qualquer tipo
    if (fromCol === 'pronto') {
      cols.push(...CANCEL_PAUSE)
    }

    return cols
  }

  const getAvailableProjectCols = (card: ProjectCard, fromCol: string, currentCoordId?: number): { id: string; label: string }[] => {
    if (isConsultor || isCliente) return []

    // Coordenador de sustentação: só move cards que estão nas colunas de coordenador do
    // board dele (Anderson OU Ricardo), e só para Cancelado / Pausado / Encerrado. Cards em
    // filas de sustentação ou já em status terminal não são movíveis.
    // Detecta pela coluna de origem (currentCoordId = col.coordinatorId da coluna que renderiza
    // o card) — NÃO por fromCol, que aqui vem derivado do status do projeto.
    if (isSustCoordenador) {
      if (currentCoordId == null || !sustBoardCoordIds.includes(currentCoordId)) return []
      return STATUS_PROJECT_COLUMNS
        .filter(c => COL_TO_PROJECT_STATUS[c.id] !== card.status)
        .map(c => ({ id: c.id, label: c.label }))
    }

    // Detecção de sustentação pelo tipo do projeto
    const ctLower = card.contract_type?.toLowerCase() ?? ''
    const svLower = card.service_type?.toLowerCase() ?? ''
    const isCardSust = !ctLower.includes('fechado') && (ctLower.includes('banco de horas') || ctLower.includes('on demand')
      || ctLower.includes('cloud') || ctLower.includes('bizify')
      || svLower.includes('on demand') || svLower.includes('cloud')
      || svLower.includes('bizify') || svLower.includes('sustent'))

    // Deriva a coluna sust correspondente ao tipo do projeto
    const matchedSustColForProject = (): { id: string; label: string } | null => {
      if (ctLower.includes('bh fixo') || ctLower.includes('banco de horas fixo') || svLower.includes('bh fixo'))
        return { id: 'sust_bh_fixo', label: 'BH Fixo' }
      if (ctLower.includes('bh mensal') || ctLower.includes('banco de horas mensal') || svLower.includes('bh mensal'))
        return { id: 'sust_bh_mensal', label: 'BH Mensal' }
      if (ctLower.includes('on demand') || svLower.includes('on demand'))
        return { id: 'sust_on_demand', label: 'On Demand' }
      // No board da Bizify não há Cloud nem coluna Bizify — SaaS/Cloud/Bizify caem na coluna SaaS.
      if (isBizifyActive)
        return { id: 'sust_saas', label: 'SaaS' }
      if (ctLower.includes('saas') || svLower.includes('saas') || card.tipo_faturamento === 'saas')
        return { id: 'sust_saas', label: 'SaaS' }
      if (ctLower.includes('cloud') || svLower.includes('cloud'))
        return { id: 'sust_cloud', label: 'Cloud' }
      // Bizify não é mais coluna (virou empresa) — não oferecer sust_bizify.
      return null
    }

    // Project card em coluna sust → só status terminais (encerrar/pausar/cancelar)
    if (fromCol.startsWith('sust_')) {
      return STATUS_PROJECT_COLUMNS
        .filter(c => COL_TO_PROJECT_STATUS[c.id] !== card.status)
        .map(c => ({ id: c.id, label: c.label }))
    }

    const isStatusColCard = !!COL_TO_PROJECT_STATUS[fromCol]
    const effectiveCoordId = currentCoordId ?? card.coordinator_ids?.[0]

    if (isStatusColCard) {
      if (isCardSust) {
        // Sust em terminal: reativar via coluna sust + outros terminais (sem coordenadores)
        const sustCol = matchedSustColForProject()
        return [
          ...(sustCol ? [{ id: sustCol.id, label: `↩ ${sustCol.label}` }] : []),
          ...STATUS_PROJECT_COLUMNS.filter(c => c.id !== fromCol).map(c => ({ id: c.id, label: c.label })),
        ]
      }
      // Não-sust: reativar via coordenador
      return [
        ...boardCoordinators.map(c => ({ id: `coordinator:${c.id}`, label: `↩ ${c.name}` })),
        ...STATUS_PROJECT_COLUMNS.filter(c => c.id !== fromCol).map(c => ({ id: c.id, label: c.label })),
      ]
    }
    if (effectiveCoordId !== undefined) {
      if (isCardSust) {
        // Sust em coluna de coordenador: mover para coluna sust ou encerrar/pausar (sem outros coordenadores)
        const sustCol = matchedSustColForProject()
        const sustOptions = sustCol
          ? [sustCol]
          : boardSustCols
        return [
          ...sustOptions,
          ...STATUS_PROJECT_COLUMNS.map(c => ({ id: c.id, label: c.label })),
        ]
      }
      return [
        ...coordinators
          .filter(c => c.id !== effectiveCoordId)
          .map(c => ({ id: `coordinator:${c.id}`, label: c.name })),
        ...STATUS_PROJECT_COLUMNS.map(c => ({ id: c.id, label: c.label })),
      ]
    }
    return STATUS_PROJECT_COLUMNS.map(c => ({ id: c.id, label: c.label }))
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
        <div className="flex items-center justify-between px-4 md:px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h1 className="ds-text-h1">Kanban de Contratos</h1>
            <p className="ds-text-body-sm mt-1" style={{ color: 'var(--text-muted)' }}>Arraste para o coordenador para gerar o projeto — depois gerencie nos status de execução</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Coordenador de sustentação não acessa /contratos (redireciona p/ dashboard →
                apontamentos). Manda para a lista de Projetos de Sustentação. */}
            <button onClick={() => router.push(isSustCoordenador ? '/sustentacao/projetos' : '/contratos')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <List size={13} /> Lista
            </button>

            {/* Coordenador de sustentação não cria contrato. */}
            {!dCreate && !isSustCoordenador && (
            <button onClick={() => { setEditingContractData(null); setShowNewContract(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)', border: '1px solid var(--primary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-hover)'; e.currentTarget.style.borderColor = 'var(--primary-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)' }}>
              <Plus size={13} /> Novo Contrato
            </button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 px-4 md:px-6 py-2 shrink-0 border-b text-[11px] font-medium" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--danger)' }} />Incompleto</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--warning)' }} />Pronto</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--success)' }} />Projeto Ativo</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: SUST_COLOR }} />Sustentação</span>
          {isBizifyActive && (
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BIZIFY_COLOR }} />Bizify</span>
          )}
          <span className="ml-auto flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Users size={11} />Colunas de coordenador geram projeto automaticamente</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Buscar nome ou projeto..."
              className="py-1.5 rounded-lg text-xs outline-none w-56 ds-input"
              style={{ paddingLeft: '1.75rem', paddingRight: '1.75rem' }}
            />
            {filterSearch && (
              <button onClick={() => setFilterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={10} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
          {allCustomers.length > 0 && (
            <MultiSelect
              value={filterCustomers}
              onChange={setFilterCustomers}
              options={allCustomers.map(n => ({ id: n, name: n }))}
              placeholder="Todos os clientes"
              wide
            />
          )}
          <MultiSelect
            value={filterProjectNames}
            onChange={setFilterProjectNames}
            options={allProjectKanbanOptions}
            placeholder="Todos os projetos"
            wide
          />
          {allExecutivosKanban.length > 0 && (
            <MultiSelect
              value={filterExecutivos}
              onChange={setFilterExecutivos}
              options={allExecutivosKanban.map(n => ({ id: n, name: n }))}
              placeholder="Todos os executivos"
              wide
            />
          )}
          {(filterSearch || filterCustomers.length > 0 || filterExecutivos.length > 0 || filterProjectNames.length > 0) && (
            <button onClick={() => { setFilterSearch(''); setFilterCustomers([]); setFilterExecutivos([]); setFilterProjectNames([]) }}
              className="text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: 'var(--primary)' }}>
              Limpar
            </button>
          )}
        </div>

        {/* Board */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando...</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-3 p-4 h-full" style={{ minWidth: `${columns.length * 272 + 60}px` }}>
                {columns.map((col, colIdx) => {
                  const isCoord        = col.type === 'coordinator'
                  const isStatusCol    = col.type === 'project_status'
                  const isPronto       = col.id === 'pronto'
                  const isAporteCol    = col.type === 'aporte'
                  const isNovoContratoCol = col.id === 'novo'
                  const contractCards  = isStatusCol || isAporteCol ? [] : contractsInCol(col.id)
                  const activeProjects = isCoord ? activeProjectsInCoordCol(col.coordinatorId!) : []
                  const statusProjects = isStatusCol ? projectsInStatusCol(col.id) : []
                  // Cards de aporte vivem em DUAS colunas:
                  //   - kanban_status='novo_contrato' → coluna "Novo Contrato" (governança/aprovação)
                  //   - kanban_status='aporte'        → coluna "Aporte" (estado final)
                  const aporteList     = isAporteCol
                    ? aporteCards.filter(a => a.kanban_status === 'aporte' && matchFilter(a.customer_name, a.project_name, (a as any).project_code))
                    : isNovoContratoCol
                      ? aporteCards.filter(a => a.kanban_status === 'novo_contrato' && matchFilter(a.customer_name, a.project_name, (a as any).project_code))
                      : []
                  const totalCards     = contractCards.length + activeProjects.length + statusProjects.length + aporteList.length

                  const prevCol  = columns[colIdx - 1]
                  const isSust   = col.type === 'sustentacao'
                  const isBizify = col.type === 'bizify'
                  const showSep  = (isStatusCol && prevCol?.type !== 'project_status') ||
                                   (isSust && prevCol?.type !== 'sustentacao') ||
                                   (isBizify && prevCol?.type !== 'bizify') ||
                                   (isAporteCol) ||
                                   (col.id === 'aditivos') ||
                                   (isCoord && prevCol?.type === 'fixed')

                  const borderColor = isStatusCol ? `${col.color}30`
                    : isSust    ? `${col.color}35`
                    : isBizify  ? `${BIZIFY_COLOR}35`
                    : isAporteCol ? `${APORTE_COLOR}45`
                    : col.id === 'aditivos' ? `${ADITIVO_COLOR}45`
                    : isCoord   ? (col.color ? `${col.color}45` : 'var(--primary-soft)')
                    : isPronto  ? `${PRONTO_COLOR}40`
                    : 'var(--border)'

                  const headerColor = isStatusCol ? col.color!
                    : isSust    ? col.color!
                    : isBizify  ? BIZIFY_COLOR
                    : isAporteCol ? APORTE_COLOR
                    : col.id === 'aditivos' ? ADITIVO_COLOR
                    : isCoord   ? (col.color ?? 'var(--primary)')
                    : isPronto  ? PRONTO_COLOR
                    : 'var(--text)'

                  return (
                    <div key={col.id} className="flex items-start gap-3">
                      {/* Separator */}
                      {showSep && (
                        <div className="self-stretch w-px shrink-0 mt-1"
                          style={{
                            background: isSust ? SUST_COLOR : isBizify ? BIZIFY_COLOR : isAporteCol ? APORTE_COLOR : 'var(--border)',
                            opacity: (isSust || isBizify || isAporteCol) ? 0.5 : 0.4,
                          }} />
                      )}

                      {/* Column — painel Surface 1 (var(--panel)); diferenciação
                           de categoria fica na borda colorida + cor do header.
                           Sombra leve só ativa no light (--brand-card-shadow=none no dark). */}
                      <div className="flex flex-col rounded-2xl shrink-0 h-full" style={{
                        width: 264,
                        background: 'var(--panel)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: 'var(--brand-card-shadow)',
                      }}>
                        {/* Header — tom levemente diferente (--bg) pra separar do corpo */}
                        <div
                          className="px-4 py-3 shrink-0 border-b rounded-t-2xl"
                          style={{ borderColor, background: 'var(--bg)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {col.emoji && <span className="text-base">{col.emoji}</span>}
                              {isStatusCol && col.id === 'col_pausado'   && <PauseCircle size={13} style={{ color: col.color }} />}
                              {isStatusCol && col.id === 'col_cancelado' && <XCircle size={13} style={{ color: col.color }} />}
                              {isStatusCol && col.id === 'col_encerrado' && <CheckCircle size={13} style={{ color: col.color }} />}
                              <p className="text-sm font-semibold" style={{ color: headerColor, fontWeight: 600 }}>{col.label}</p>
                            </div>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                            >
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
                          {isCoord && col.color === SUST_COLOR && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm inline-block mt-1"
                              style={{ background: `${col.color}15`, color: col.color, letterSpacing: '0.1em' }}>
                              SUSTENTAÇÃO
                            </span>
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
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                              Arraste aqui → projeto criado automaticamente
                            </p>
                          )}
                          {isAporteCol && (
                            <>
                              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
                                style={{ background: `${APORTE_COLOR}15`, color: APORTE_COLOR, letterSpacing: '0.1em' }}>
                                APORTE
                              </span>
                              <p className="text-[10px] mt-0.5" style={{ color: APORTE_COLOR, opacity: 0.75 }}>
                                Cards de aporte em projetos pai (geram proposta comercial)
                              </p>
                            </>
                          )}
                        </div>

                        {/* Cards */}
                        <Droppable
                          droppableId={col.id}
                          isDropDisabled={
                            isAporteCol || (isStatusCol && !['col_pausado', 'col_cancelado', 'col_encerrado'].includes(col.id))
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
                                // Drop target ativo: bg primary-soft + (interno) borda destacada.
                                // Fora do drop: transparente (mostra a coluna).
                                background: snap.isDraggingOver
                                  ? isStatusCol ? `${col.color}12` : (isSust || isBizify) ? `${col.color}12` : 'var(--primary-soft)'
                                  : 'transparent',
                                boxShadow: snap.isDraggingOver
                                  ? `inset 0 0 0 2px var(--primary)`
                                  : undefined,
                              }}
                            >
                              {contractCards.map((card, idx) => {
                                if (card.card_type === 'project') {
                                  const proj = card as ProjectCard
                                  const projFromCol = col.id
                                  return (
                                    <ProjectKanbanCard key={`sp-${proj.id}`} card={proj} index={idx}
                                      columnCoordinatorName={isCoord ? col.label : undefined}
                                      onClick={() => setProjectAction({ card: proj, action: 'view' })}
                                      onAction={action => setProjectAction({ card: proj, action })}
                                      onMove={toCol => {
                                        if (toCol.startsWith('sust_') && proj.contract_id) {
                                          handleSustProjectCardMove(proj.id, proj.contract_id, col.id, toCol)
                                        } else if (COL_TO_PROJECT_STATUS[toCol]) {
                                          // Mover para status terminal/ativo: remove do grupo de sust otimisticamente
                                          setSustGroups(prev => {
                                            const next = { ...prev }
                                            next[col.id] = (prev[col.id] ?? []).filter(c => c.id !== proj.id)
                                            return next
                                          })
                                          handleProjectMove(proj.id, toCol, col.coordinatorId)
                                        } else {
                                          handleProjectMove(proj.id, toCol, col.coordinatorId)
                                        }
                                      }}
                                      availableColumns={getAvailableProjectCols(proj, projFromCol, col.coordinatorId)}
                                      canWrite={canWrite}
                                    />
                                  )
                                }
                                const cc = card as ContractCard
                                // Fallback pra col.id quando contractColumnId retorna null (caso defensivo do
                                // alocado-sem-coord): mantém o card consistente com a coluna onde foi renderizado.
                                const fromCol = col.id.startsWith('sust_') ? col.id : (contractColumnId(cc) ?? col.id)
                                return (
                                  <ContractKanbanCard key={`c-${cc.id}`} card={cc} index={idx}
                                    onClick={() => setSelected(cc)}
                                    onAction={action => setContractAction({ card: cc, action })}
                                    onMove={toCol => handleContractMove(cc.id, cc, fromCol, toCol)}
                                    availableColumns={getAvailableContractCols(cc, fromCol)}
                                    canWrite={canWrite}
                                  />
                                )
                              })}
                              {activeProjects.map((proj, idx) => {
                                const fromCol = PROJECT_STATUS_COL[proj.status] ?? ''
                                return (
                                  <ProjectKanbanCard key={`p-${proj.id}`} card={proj} index={contractCards.length + idx}
                                    columnCoordinatorName={isCoord ? col.label : undefined}
                                    onClick={() => setProjectAction({ card: proj, action: 'view' })}
                                    onAction={action => setProjectAction({ card: proj, action })}
                                    onMove={toCol => handleProjectMove(proj.id, toCol, col.coordinatorId)}
                                    availableColumns={getAvailableProjectCols(proj, fromCol, col.coordinatorId)}
                                    canWrite={canWrite}
                                  />
                                )
                              })}
                              {statusProjects.map((proj, idx) => {
                                const fromCol = PROJECT_STATUS_COL[proj.status] ?? ''
                                return (
                                  <ProjectKanbanCard key={`ps-${proj.id}`} card={proj} index={idx}
                                    columnCoordinatorName={isCoord ? col.label : undefined}
                                    onClick={() => setProjectAction({ card: proj, action: 'view' })}
                                    onAction={action => setProjectAction({ card: proj, action })}
                                    onMove={toCol => handleProjectMove(proj.id, toCol)}
                                    availableColumns={getAvailableProjectCols(proj, fromCol)}
                                    canWrite={canWrite}
                                  />
                                )
                              })}
                              {aporteList.map(a => {
                                return (
                                  <AporteKanbanCard
                                    key={`apt-${a.id}`}
                                    aporte={a}
                                    canWrite={canWrite}
                                    onClick={() => setSelectedAporte(a)}
                                    onMoveToFinal={async () => {
                                      try {
                                        await api.patch(`/projects/${a.project_id}/hour-contributions/${a.id}/move`, { kanban_status: 'aporte' })
                                        // Otimista: atualiza só o card movido
                                        setAporteCards(prev => prev.map(x => x.id === a.id ? { ...x, kanban_status: 'aporte' } : x))
                                        toast.success('Aporte movido para a coluna Aporte')
                                      } catch {
                                        toast.error('Erro ao mover aporte')
                                      }
                                    }}
                                  />
                                )
                              })}
                              {prov.placeholder}
                              {totalCards === 0 && !snap.isDraggingOver && (
                                <p className="text-center text-xs py-6" style={{ color: 'var(--text-light)' }}>
                                  {isCoord
                                    ? 'Nenhum projeto alocado por aqui ainda'
                                    : (isSust || isBizify)
                                      ? 'Sem contratos nesta categoria'
                                      : isAporteCol
                                        ? 'Nenhum aporte registrado ainda'
                                        : 'Arraste cards para esta coluna'}
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

      {/* Aporte Detail Modal — abre ao clicar num card de aporte */}
      {selectedAporte && (
        <AporteDetailModal
          aporte={selectedAporte}
          canWrite={canWrite}
          onClose={() => setSelectedAporte(null)}
          onSaved={load}
          onDeleted={() => setAporteCards(prev => prev.filter(x => x.id !== selectedAporte.id))}
          onViewInProject={() => {
            // Abre o modal do projeto (mesma UX do "Visualizar" no Kanban Contratos),
            // direto na aba "Aportes". Sem sair da página; admin pode trocar de aba dentro.
            // Card sintético — ProjectViewModal só precisa do project_id pra buscar.
            const syntheticCard = {
              id: selectedAporte.project_id,
              customer_name: selectedAporte.customer_name,
              project_name: selectedAporte.project_name,
              code: selectedAporte.project_code,
              status: selectedAporte.project_status,
            } as any
            setSelectedAporte(null)
            setProjectAction({ card: syntheticCard, action: 'aportes' })
          }}
          onMoveToFinal={selectedAporte.kanban_status === 'novo_contrato' ? async () => {
            try {
              await api.patch(`/projects/${selectedAporte.project_id}/hour-contributions/${selectedAporte.id}/move`, { kanban_status: 'aporte' })
              setAporteCards(prev => prev.map(x => x.id === selectedAporte.id ? { ...x, kanban_status: 'aporte' } : x))
              toast.success('Aporte movido para a coluna Aporte')
            } catch {
              toast.error('Erro ao mover aporte')
            }
          } : undefined}
        />
      )}

      {/* Edit Contract Modal — aditivo abre modal enxuto; contrato normal abre o completo */}
      {showNewContract && editingContractData && editingContractData.is_aditivo && (
        <AditivoEditModal
          contract={editingContractData}
          onClose={() => { setShowNewContract(false); setEditingContractData(null) }}
          onSaved={load}
        />
      )}
      {showNewContract && editingContractData && !editingContractData.is_aditivo && (
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
        if (['status', 'cost', 'timesheets', 'expenses', 'aportes', 'team'].includes(action)) {
          if (!card.project_id) {
            toast.error('Contrato sem projeto vinculado')
            close()
            return null
          }
          const projCard = projectCards.find(p => p.id === card.project_id)
            ?? ({ id: card.project_id, project_name: card.project_name ?? '', customer_name: card.customer_name, status: 'awaiting_start' } as ProjectCard)
          close()
          setProjectAction({ card: projCard, action })
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
              <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
                      <Trash2 size={16} style={{ color: 'var(--danger-border)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{card.is_aditivo ? 'Excluir Aditivo' : 'Excluir Contrato'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-light)' }}>{card.customer_name}</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {card.is_aditivo
                      ? 'Excluir este aditivo vai REVERTER a alteração no projeto: valor-hora, horas e valor do contrato voltam ao anterior, e a vigência daquele mês é removida. Só o aditivo mais recente do projeto pode ser excluído.'
                      : 'Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.'}
                  </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={close} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
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
                    style={{ background: 'var(--danger-border)', color: 'var(--primary-fg)' }}>
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
        if (action === 'timesheets') return <ProjectDataModal projectId={card.id} projectName={card.project_name} initialTab="timesheets" onClose={close} />
        if (action === 'expenses')   return <ProjectDataModal projectId={card.id} projectName={card.project_name} initialTab="expenses"   onClose={close} />
        if (action === 'team')       return <ProjectTeamModal projectId={card.id} projectName={card.project_name} onClose={close} onSaved={close} />
        if (action === 'chat' && card.contract_id) {
          const chatCard = { id: card.contract_id, customer_name: card.customer_name, project_name: card.project_name } as any
          return <CardDetailModal card={chatCard} onClose={close} initialTab="chat" userRole={user?.type ?? undefined} />
        }
        if (action === 'aportes') {
          // Abre o modal do projeto direto na aba "Aportes" (sem sair da página).
          // Mesma navegação do "Visualizar" — usuário pode trocar de aba dentro do modal.
          return <ProjectViewModal projectId={card.id} onClose={close} userRole={userType} initialTab="aportes" />
        }
        if (action === 'delete') {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
              <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
                      <Trash2 size={16} style={{ color: 'var(--danger-border)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Excluir Projeto</p>
                      <p className="text-xs" style={{ color: 'var(--text-light)' }}>{card.project_name ?? card.customer_name}</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={close} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
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
                    style={{ background: 'var(--danger-border)', color: 'var(--primary-fg)' }}>
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

// ── Modal de edição de ADITIVO — enxuto (não o modal completo de contrato) ──
function AditivoEditModal({ contract, onClose, onSaved }: { contract: any; onClose: () => void; onSaved: () => void }) {
  const [cond, setCond] = useState<string>(contract.condicao_pagamento ?? '')
  const [obs, setObs]   = useState<string>(contract.observacoes ?? '')
  const [saving, setSaving] = useState(false)
  // Aditivo Mensal "multiplo": valor-hora + horas editáveis (reaplica só o mais recente).
  const isMultiplo = contract.aditivo_field === 'multiplo'
  const [mRate, setMRate]   = useState<string>(contract.valor_hora != null ? String(contract.valor_hora) : '')
  const [mHoras, setMHoras] = useState<string>(contract.horas_contratadas != null ? String(contract.horas_contratadas) : '')

  const field = contract.aditivo_field as string
  const fieldLabel: Record<string, string> = { valor_hora: 'Valor da Hora', horas_contratadas: 'Quantidade de Horas', valor_projeto: 'Valor do Contrato', multiplo: 'Valor do Contrato' }
  const isHours = field === 'horas_contratadas'
  const newVal = field === 'valor_hora' ? contract.valor_hora : field === 'horas_contratadas' ? contract.horas_contratadas : contract.valor_projeto
  const fmt = (n: any) => n == null ? '—' : isHours ? `${Number(n)}h` : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const effMonth = contract.aditivo_effective_from ? (() => { const [y, m] = String(contract.aditivo_effective_from).slice(0, 7).split('-'); return `${m}/${y}` })() : null
  const proj = contract.aditivo_project

  const save = async () => {
    setSaving(true)
    try {
      const body: any = { condicao_pagamento: cond || null, observacoes: obs || null }
      if (isMultiplo) {
        body.aditivo_changes = [
          { field: 'valor_hora', value: Number(mRate) || 0 },
          { field: 'horas_contratadas', value: Number(mHoras) || 0 },
        ]
      }
      await api.put(`/contracts/aditivo/${contract.id}`, body)
      toast.success('Aditivo atualizado')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Editar Aditivo</h2>
            <p className="text-[11px] mt-0.5 font-semibold" style={{ color: ADITIVO_COLOR }}>➕ {contract.customer?.name ?? contract.project_name}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="rounded-xl p-4" style={{ background: `${ADITIVO_COLOR}10`, border: `1px solid ${ADITIVO_COLOR}55` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Projeto</p>
            <p className="text-sm mb-3" style={{ color: 'var(--text)' }}>{[proj?.code, proj?.name ?? contract.project_name].filter(Boolean).join(' — ') || '—'}</p>
            {isMultiplo ? (() => {
              const money = (n: any) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              const ch = contract.aditivo_changes ?? []
              const oldRate = ch.find((c: any) => c.field === 'valor_hora')?.old
              const oldHoras = ch.find((c: any) => c.field === 'horas_contratadas')?.old
              const newContract = (Number(mRate) || 0) * (Number(mHoras) || 0)
              return (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>O que alterar (Banco de Horas Mensal)</p>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Novo Valor da Hora (R$)</label>
                      <input type="number" min="0" step="0.01" value={mRate} onChange={e => setMRate(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mt-1 outline-none" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      {oldRate != null && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>Antes: {money(oldRate)}</p>}
                    </div>
                    <div>
                      <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Nova Quantidade de Horas</label>
                      <input type="number" min="0" step="1" value={mHoras} onChange={e => setMHoras(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mt-1 outline-none" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      {oldHoras != null && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>Antes: {Number(oldHoras)}h</p>}
                    </div>
                  </div>
                  {effMonth && <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Vigência: a partir de <span className="font-semibold" style={{ color: 'var(--text)' }}>{effMonth}</span></p>}
                  <div className="mt-2 pt-2 flex items-center justify-between" style={{ borderTop: '1px dashed var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Valor do Contrato</span>
                    <span className="text-sm font-semibold" style={{ color: ADITIVO_COLOR }}>{money(contract.aditivo_old_value)} → {money(newContract)}</span>
                  </div>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-light)' }}>Reaplica no projeto (sobrescreve a vigência do mês). Só o aditivo mais recente do projeto pode ser editado.</p>
                </>
              )
            })() : (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>O que foi alterado</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fieldLabel[field] ?? '—'}</p>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-lg font-bold line-through" style={{ color: 'var(--text-muted)' }}>{fmt(contract.aditivo_old_value)}</span>
                  <span className="text-lg font-bold" style={{ color: ADITIVO_COLOR }}>→</span>
                  <span className="text-lg font-bold" style={{ color: ADITIVO_COLOR }}>{fmt(newVal)}</span>
                </div>
                {effMonth && <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Vigência: a partir de <span className="font-semibold" style={{ color: 'var(--text)' }}>{effMonth}</span></p>}
                <p className="text-[10px] mt-2" style={{ color: 'var(--text-light)' }}>Valor/campo não são editáveis aqui — para alterar de novo, crie um novo aditivo.</p>
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Forma de pagamento (opcional)</label>
            <input value={cond} onChange={e => setCond(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mt-1 outline-none" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="Ex.: 30 dias" />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Observação</label>
            <textarea rows={5} value={obs} onChange={e => setObs(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mt-1 outline-none resize-none" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
        </div>
      </div>
    </div>
  )
}

export default function KanbanPage() {
  return <KanbanContent />
}
