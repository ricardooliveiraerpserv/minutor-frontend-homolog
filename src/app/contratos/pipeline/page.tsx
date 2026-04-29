'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, AlertCircle, AlertTriangle, Clock, ChevronRight, Rocket, Layers, FolderKanban, MessageSquare, Send, Paperclip, X, Download, MoreVertical, Eye, Pencil, DollarSign, TrendingUp, Users, BarChart2, UserCheck, Check, Trash2, Search } from 'lucide-react'
import { ProjectMessages } from '@/components/shared/ProjectMessages'
import { ContractMessages } from '@/components/shared/ContractMessages'
import { ContractCreateModal } from '@/components/shared/ContractCreateModal'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'
import { MultiSelect } from '@/components/ui/multi-select'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'demand' | 'transition' | 'project'

interface ContractCard {
  card_type: 'contract'
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
}

interface ProjectCard {
  card_type: 'project'
  id: number
  contract_id?: number
  contract_request_id?: number
  customer_name: string
  customer_id: number
  project_name: string
  code: string
  status: string
  sold_hours?: number
  consumed_hours?: number | null
  general_hours_balance?: number | null
  expected_end_date?: string | null
  coordinator_ids?: number[]
  coordinators?: string[]
  consultants?: string[]
  contract_type?: string | null
  service_type?: string | null
}

interface ContractRequestDetail {
  id: number
  area_requisitante: string
  project_name?: string
  product_owner?: string
  modulo_tecnologia?: string
  tipo_necessidade: string
  tipo_necessidade_outro?: string
  nivel_urgencia: string
  descricao?: string
  cenario_atual?: string
  cenario_desejado?: string
  created_at: string
  createdBy?: { id: number; name: string }
  customer?: { id: number; name: string }
  messages?: {
    id: number
    message: string
    created_at: string
    author?: { id: number; name: string }
    attachments?: { id: number; original_name: string; file_path: string; file_size: number }[]
  }[]
}

type AnyCard = ContractCard | ProjectCard

interface Coordinator { id: number; name: string }

interface RequestCard {
  card_type: 'request'
  id: number
  customer_name: string
  customer_id: number
  area_requisitante: string
  project_name?: string
  product_owner?: string
  modulo_tecnologia?: string
  tipo_necessidade: string
  tipo_necessidade_outro?: string
  nivel_urgencia: string
  descricao?: string
  cenario_atual?: string
  cenario_desejado?: string
  status: string
  kanban_column: string
  req_decision?: 'novo_projeto' | 'subprojeto'
  linked_contract_id?: number
  linked_contract_code?: string
  linked_coordinator_id?: number
  created_at: string
}

interface KanbanResponse {
  demand_cards: ContractCard[]
  transition_cards: ContractCard[]
  project_cards: ProjectCard[]
  request_cards: RequestCard[]
  coordinators: Coordinator[]
  user_role: string
}

interface Column {
  id: string
  label: string
  phase: Phase
  projectStatuses?: string[]
  clientVisible?: boolean   // shows [C] badge + client can drop
  clientCanDrop?: boolean   // client can drop here but NO [C] badge
  clientLocked?: boolean    // client cannot drag FROM here
  color?: string
}

// ─── Column Definitions ───────────────────────────────────────────────────────

const DEMAND_COLS: Column[] = [
  { id: 'backlog',              label: 'Backlog',          phase: 'demand', clientVisible: true },
  { id: 'novo_projeto',        label: 'Novo Projeto',     phase: 'demand', clientCanDrop: true, clientLocked: true },
  { id: 'em_planejamento',     label: 'Em Planejamento',  phase: 'demand' },
  { id: 'em_validacao',        label: 'Em Validação',     phase: 'demand', clientVisible: true },
  { id: 'em_revisao',          label: 'Em Revisão',       phase: 'demand', clientCanDrop: true, clientLocked: true },
  { id: 'aprovado',            label: 'Aprovado',         phase: 'demand', clientCanDrop: true, clientLocked: true },
  { id: 'req_inicio_autorizado', label: 'Aguardando Início (Req.)', phase: 'demand' },
]

const REQ_ONLY_COLS = new Set(['req_planejamento', 'req_em_andamento'])

const TRANSITION_COL: Column = {
  id: 'inicio_autorizado', label: 'Início Autorizado', phase: 'transition',
}

const PROJECT_COLS: Column[] = [
  { id: 'em_andamento',        label: 'Em Andamento',        phase: 'project', projectStatuses: ['awaiting_start', 'started'] },
  { id: 'liberado_para_testes',label: 'Liberado p/ Testes',  phase: 'project', projectStatuses: ['liberado_para_testes'] },
  { id: 'encerrado',           label: 'Encerrado',           phase: 'project', projectStatuses: ['finished'],   color: '#22c55e' },
  { id: 'pausado',             label: 'Pausado',             phase: 'project', projectStatuses: ['paused'],     color: '#eab308' },
  { id: 'cancelado',           label: 'Cancelado',           phase: 'project', projectStatuses: ['cancelled'],  color: '#ef4444' },
]

const PROJECT_STATUS_TO_COL: Record<string, string> = {
  awaiting_start:       'em_andamento',
  started:              'em_andamento',
  liberado_para_testes: 'liberado_para_testes',
  paused:               'pausado',
  cancelled:            'cancelado',
  finished:             'encerrado',
}

const PROJECT_COL_TO_STATUS: Record<string, string> = {
  em_andamento:         'started',
  liberado_para_testes: 'liberado_para_testes',
  pausado:              'paused',
  cancelado:            'cancelled',
  encerrado:            'finished',
}

const TIPO_LABEL: Record<string, string> = {
  on_demand:          'On Demand',
  banco_horas_mensal: 'BH Mensal',
  banco_horas_fixo:   'BH Fixo',
  por_servico:        'Por Serviço',
  saas:               'SaaS',
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_start:       'Aguardando',
  started:              'Em Andamento',
  liberado_para_testes: 'Em Testes',
  finished:             'Encerrado',
  paused:               'Pausado',
  cancelled:            'Cancelado',
}

const URGENCIA_COLOR: Record<string, string> = {
  altissimo:       '#ef4444',
  alto:            '#f97316',
  medio:           '#eab308',
  baixo:           '#22c55e',
  quando_possivel: '#64748b',
}

const URGENCIA_LABEL: Record<string, string> = {
  altissimo:       'Altíssimo',
  alto:            'Alto',
  medio:           'Médio',
  baixo:           'Baixo',
  quando_possivel: 'Quando possível',
}

const TIPO_NECESSIDADE_LABEL: Record<string, string> = {
  implantacao_modulo:        'Implantação de Módulo',
  treinamento_erp:           'Treinamento ERP',
  atualizacao_versao_erp:    'Atualização de Versão do ERP',
  entrega_obrigacao:         'Entrega de Obrigação',
  fluig:                     'Fluig',
  desenvolvimento_web_app:   'Desenvolvimento Web/App',
  customizacao_erp_protheus: 'Customização ERP Protheus',
  integracao_erp_protheus:   'Integração com ERP Protheus',
  outro:                     'Outro',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contractColumnId(card: ContractCard): string {
  return card.kanban_status ?? 'backlog'
}

function projectColumnId(card: ProjectCard): string {
  return PROJECT_STATUS_TO_COL[card.status] ?? 'em_andamento'
}

function uniqueCardId(card: AnyCard): string {
  return `${card.card_type}-${card.id}`
}

// ─── Contract Card ────────────────────────────────────────────────────────────

function ContractKanbanCard({
  card, index, canDrag, onClick, onAction, onMove, availableColumns, isNew,
}: { card: ContractCard; index: number; canDrag: boolean; onClick: () => void; onAction?: (action: string) => void
    onMove?: (toCol: string) => void; availableColumns?: { id: string; label: string }[]; isNew?: boolean }) {
  const isIncomplete = !card.is_complete
  const isTransition = card.kanban_status === 'inicio_autorizado'
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
    <Draggable draggableId={uniqueCardId(card)} index={index} isDragDisabled={!canDrag}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all group"
          style={{
            background: snap.isDragging ? 'rgba(0,245,255,0.06)' : isNew ? 'rgba(0,245,255,0.04)' : 'var(--brand-surface)',
            border: `1px solid ${snap.isDragging ? 'rgba(0,245,255,0.3)' : isNew ? 'rgba(0,245,255,0.5)' : isTransition ? 'rgba(234,179,8,0.3)' : 'var(--brand-border)'}`,
            boxShadow: snap.isDragging ? '0 8px 24px rgba(0,0,0,0.45)' : isNew ? '0 0 0 1px rgba(0,245,255,0.2)' : 'none',
            ...prov.draggableProps.style,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-[10px] truncate" style={{ color: 'var(--brand-subtle)' }}>
                  {card.customer_name}
                </p>
                {isNew && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.3)' }}>
                    NOVO
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>
                {card.project_name || card.customer_name}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={
                  card.project_id
                    ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                    : isIncomplete
                    ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }
                    : { background: 'rgba(234,179,8,0.12)', color: '#eab308' }
                }
              >
                {card.project_id ? 'Projeto' : isIncomplete ? 'Incompleto' : 'Completo'}
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

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestKanbanCard({ card, onView }: { card: RequestCard; onView?: (e: React.MouseEvent) => void }) {
  const urgColor = URGENCIA_COLOR[card.nivel_urgencia] ?? '#64748b'
  const tipoLabel = card.tipo_necessidade === 'outro' && card.tipo_necessidade_outro
    ? card.tipo_necessidade_outro
    : (TIPO_NECESSIDADE_LABEL[card.tipo_necessidade] ?? card.tipo_necessidade)
  const isReqInicio = card.kanban_column === 'req_inicio_autorizado'

  return (
    <div
      className="rounded-xl p-3 cursor-pointer select-none transition-all hover:opacity-90"
      style={{ background: 'var(--brand-surface)', border: '1px solid rgba(139,92,246,0.35)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>
            {card.project_name || card.customer_name}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>
            {card.project_name ? card.customer_name : card.area_requisitante}
          </p>
          {card.linked_contract_code && (
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#a78bfa' }}>
              {card.linked_contract_code}
            </p>
          )}
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
          style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
          Requisição
        </span>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa' }}>
          {tipoLabel}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${urgColor}18`, color: urgColor }}>
          {URGENCIA_LABEL[card.nivel_urgencia] ?? card.nivel_urgencia}
        </span>
        <div className="flex items-center gap-2">
          {isReqInicio && onView && (
            <button
              onClick={onView}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors hover:opacity-80"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              Visualizar
            </button>
          )}
          <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>
            {new Date(card.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── List view action menu ────────────────────────────────────────────────────

function ListActionMenu({ card, onAction }: { card: ContractCard; onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-white/10"
        style={{ color: 'var(--brand-subtle)' }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-[100] w-44 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {CONTRACT_MENU_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button key={item.action}
                onClick={e => { e.stopPropagation(); setOpen(false); onAction(item.action) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                style={{ color: item.action === 'delete' ? '#f87171' : 'var(--brand-text)' }}>
                <Icon size={13} style={{ color: item.action === 'delete' ? '#f87171' : 'var(--brand-subtle)' }} />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ListProjectActionMenu({ onAction }: { onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-white/10"
        style={{ color: 'var(--brand-subtle)' }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-[100] w-48 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {PROJECT_MENU_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button key={item.action}
                onClick={e => { e.stopPropagation(); setOpen(false); onAction(item.action) }}
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
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

const CONTRACT_MENU_ITEMS = [
  { action: 'view',    label: 'Visualizar', icon: Eye },
  { action: 'edit',    label: 'Editar',     icon: Pencil },
  { action: 'chat',    label: 'Chat',       icon: MessageSquare },
  { action: 'log',     label: 'Histórico',  icon: Clock },
  { action: 'delete',  label: 'Excluir',    icon: Trash2 },
] as const

const PROJECT_MENU_ITEMS = [
  { action: 'view',       label: 'Visualizar',       icon: Eye,           clientVisible: false },
  { action: 'edit',       label: 'Editar',            icon: Pencil,        clientVisible: false },
  { action: 'chat',       label: 'Chat',              icon: MessageSquare, clientVisible: true  },
  { action: 'status',     label: 'Alterar Status',    icon: Layers,        clientVisible: false },
  { action: 'cost',       label: 'Custo',             icon: DollarSign,    clientVisible: false },
  { action: 'timesheets', label: 'Apontamentos',      icon: Clock,         clientVisible: false },
  { action: 'expenses',   label: 'Despesas',          icon: BarChart2,     clientVisible: false },
  { action: 'aportes',    label: 'Aportes',           icon: TrendingUp,    clientVisible: false },
  { action: 'team',       label: 'Selecionar Equipe', icon: Users,         clientVisible: false },
] as const

function endDateStyle(dateStr: string): { color: string; bg: string; label: string } {
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0)  return { color: '#ef4444', bg: '#ef444420', label: `Venceu há ${Math.abs(diff)}d` }
  if (diff <= 7) return { color: '#f97316', bg: '#f9731620', label: `Vence em ${diff}d` }
  if (diff <= 30) return { color: '#eab308', bg: '#eab30820', label: `${diff}d` }
  return { color: '#22c55e', bg: '#22c55e20', label: `${diff}d` }
}

function ProjectKanbanCard({
  card, index, canDrag, onClick, onAction, onMove, availableColumns, isCliente, hasUnread, isNew,
}: { card: ProjectCard; index: number; canDrag: boolean; onClick: () => void; onAction: (action: string) => void
    onMove?: (toCol: string) => void; availableColumns?: { id: string; label: string }[]; isCliente?: boolean; hasUnread?: boolean; isNew?: boolean }) {
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
    awaiting_start: '#94a3b8', started: '#22c55e',
    liberado_para_testes: '#f59e0b', finished: '#f59e0b', paused: '#f97316', cancelled: '#ef4444',
  }
  const color = statusColor[card.status] ?? '#94a3b8'

  return (
    <Draggable draggableId={uniqueCardId(card)} index={index} isDragDisabled={!canDrag}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all group"
          style={{
            background: snap.isDragging ? 'rgba(99,102,241,0.08)' : isNew ? 'rgba(0,245,255,0.04)' : 'var(--brand-surface)',
            border: `1px solid ${snap.isDragging ? 'rgba(99,102,241,0.4)' : isNew ? 'rgba(0,245,255,0.5)' : 'rgba(99,102,241,0.2)'}`,
            boxShadow: snap.isDragging ? '0 8px 24px rgba(0,0,0,0.45)' : isNew ? '0 0 0 1px rgba(0,245,255,0.2)' : 'none',
            ...prov.draggableProps.style,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-[10px] truncate" style={{ color: 'var(--brand-subtle)' }}>
                  {card.customer_name}
                </p>
                {isNew && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.3)' }}>
                    NOVO
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>{card.project_name}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: `${color}20`, color }}>
                {STATUS_LABEL[card.status] ?? card.status}
              </span>
              {/* Context menu */}
              <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                  style={{ color: 'var(--brand-subtle)' }}
                >
                  <MoreVertical size={12} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-6 z-[100] w-48 rounded-xl overflow-hidden shadow-2xl"
                    style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    {PROJECT_MENU_ITEMS.filter(item => !isCliente || item.clientVisible).map(item => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.action}
                          onClick={e => { e.stopPropagation(); setMenuOpen(false); onAction(item.action) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                          style={{ color: 'var(--brand-text)' }}
                        >
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

          {card.expected_end_date && (() => {
            const ds = endDateStyle(card.expected_end_date)
            return (
              <div className="flex items-center gap-1 mb-1.5">
                <Clock size={10} style={{ color: ds.color }} />
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: ds.bg, color: ds.color }}>
                  {ds.label} — {new Date(card.expected_end_date).toLocaleDateString('pt-BR')}
                </span>
              </div>
            )
          })()}
          <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="flex items-center gap-2">
              {card.coordinators && card.coordinators.length > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>
                  👤 {card.coordinators[0]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); onAction('chat') }}
                className="relative p-1 rounded-md hover:bg-white/10 transition-colors" title="Abrir Chat"
                style={{ color: hasUnread ? '#00F5FF' : 'var(--brand-subtle)' }}>
                <MessageSquare size={11} />
                {hasUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: '#00F5FF' }} />
                )}
              </button>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                {card.code}
              </span>
            </div>
          </div>
          {availableColumns && availableColumns.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(99,102,241,0.15)' }}
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

// ─── Generate Project Modal ───────────────────────────────────────────────────

function GenerateProjectModal({
  card, coordinators, onClose, onGenerate,
}: {
  card: ContractCard
  coordinators: Coordinator[]
  onClose: () => void
  onGenerate: (contractId: number, coordinatorId: number | null) => Promise<void>
}) {
  const [coordId, setCoordId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onGenerate(card.id, coordId)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <Rocket size={16} style={{ color: '#eab308' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Gerar Projeto</p>
              <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{card.customer_name}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
            Selecione o coordenador responsável. O projeto será criado automaticamente com os dados do contrato.
          </p>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--brand-subtle)' }}>COORDENADOR (OPCIONAL)</label>
            <select
              value={coordId ?? ''}
              onChange={e => setCoordId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            >
              <option value="">Sem coordenador por agora</option>
              {coordinators.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Cancelar</button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: '#eab308', color: '#000' }}
          >
            <Rocket size={13} /> {loading ? 'Gerando...' : 'Gerar Projeto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card Detail Modal ────────────────────────────────────────────────────────

function ContractDetailModal({ card, onClose, onGenerate, coordinators, canGenerate, onEdit, initialTab, userRole }: {
  card: ContractCard
  onClose: () => void
  onGenerate?: () => void
  coordinators: Coordinator[]
  canGenerate: boolean
  onEdit?: () => void
  initialTab?: 'details' | 'chat' | 'log'
  userRole?: string
}) {
  const [tab, setTab]             = useState<'details' | 'chat' | 'log'>(initialTab ?? 'details')
  const [logs, setLogs]           = useState<KanbanLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsLoaded, setLogsLoaded]   = useState(false)

  useEffect(() => {
    if (tab === 'log' && !logsLoaded) {
      setLogsLoading(true)
      api.get<KanbanLogEntry[]>(`/contracts/${card.id}/kanban-logs`)
        .then(r => { setLogs(Array.isArray(r) ? r : []); setLogsLoaded(true) })
        .catch(() => {})
        .finally(() => setLogsLoading(false))
    }
  }, [tab, card.id, logsLoaded])

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
              <span className="text-xs px-2 py-1 rounded-full font-semibold"
                style={card.is_complete
                  ? { background: 'rgba(234,179,8,0.12)', color: '#eab308' }
                  : { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                {card.is_complete ? 'Completo' : 'Incompleto'}
              </span>
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
        {tab === 'log' ? (
          <div className="flex-1 overflow-y-auto">
            <KanbanLogTab logs={logs} loading={logsLoading} />
          </div>
        ) : tab === 'chat' ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <ContractMessages contractId={card.id} userRole={userRole} />
          </div>
        ) : (
        <>
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {([
              ['Categoria', card.categoria === 'projeto' ? 'Projeto' : card.categoria === 'sustentacao' ? 'Sustentação' : '—'],
              ['Tipo de Contrato', card.contract_type ?? '—'],
              ['Faturamento', card.tipo_faturamento ? (TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento) : '—'],
              ['Horas Contratadas', card.horas_contratadas ? `${card.horas_contratadas}h` : '—'],
              ['Valor do Projeto', card.valor_projeto != null ? `R$ ${Number(card.valor_projeto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'],
              ['Coordenador', card.kanban_coordinator ?? '—'],
              ['Status', card.status],
              ['Projeto', card.project_code ?? '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
              </div>
            ))}
          </div>
          {!card.is_complete && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>Preencha cliente, tipo de contrato e horas contratadas para gerar o projeto.</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
          {canGenerate && card.is_complete && card.kanban_status === 'inicio_autorizado' && !card.project_id && (
            <button onClick={onGenerate} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#eab308', color: '#000' }}>
              <Rocket size={13} /> Gerar Projeto
            </button>
          )}
          {onEdit && (
            <button onClick={() => { onClose(); onEdit() }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
              <Pencil size={13} /> Editar Contrato
            </button>
          )}
          <button onClick={() => { window.location.href = '/contratos' }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
            <ExternalLink size={13} /> Ver Contrato
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

function ProjectDetailModal({ card, onClose, userRole, initialTab }: { card: ProjectCard; onClose: () => void; userRole: string; initialTab?: 'details' | 'req' | 'chat' | 'log' }) {
  const [tab, setTab]             = useState<'details' | 'req' | 'chat' | 'log'>(initialTab ?? 'details')
  const [logs, setLogs]           = useState<KanbanLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsLoaded, setLogsLoaded]   = useState(false)
  const [reqData, setReqData]     = useState<ContractRequestDetail | null>(null)
  const [reqLoading, setReqLoading] = useState(false)
  const [reqLoaded, setReqLoaded]   = useState(false)
  const [showProjectView, setShowProjectView] = useState(false)

  useEffect(() => {
    if (tab === 'log' && !logsLoaded) {
      setLogsLoading(true)
      const fetches: Promise<KanbanLogEntry[]>[] = [
        api.get<KanbanLogEntry[]>(`/projects/${card.id}/kanban-logs`)
          .then(r => (Array.isArray(r) ? r : []).map(l => ({ ...l, source: 'project' as const }))),
      ]
      if (card.contract_request_id) {
        fetches.push(
          api.get<KanbanLogEntry[]>(`/contract-requests/${card.contract_request_id}/kanban-logs`)
            .then(r => (Array.isArray(r) ? r : []).map(l => ({ ...l, source: 'req' as const }))).catch(() => [])
        )
      }
      if (card.contract_id) {
        fetches.push(
          api.get<KanbanLogEntry[]>(`/contracts/${card.contract_id}/kanban-logs`)
            .then(r => (Array.isArray(r) ? r : []).map(l => ({ ...l, source: 'contract' as const }))).catch(() => [])
        )
      }
      Promise.all(fetches)
        .then(results => {
          const combined = ([] as KanbanLogEntry[]).concat(...results)
          setLogs(combined)
          setLogsLoaded(true)
        })
        .finally(() => setLogsLoading(false))
    }
    if (tab === 'req' && !reqLoaded && card.contract_request_id) {
      setReqLoading(true)
      api.get<ContractRequestDetail>(`/projects/${card.id}/contract-request`)
        .then(r => { setReqData(r); setReqLoaded(true) })
        .catch(() => {})
        .finally(() => setReqLoading(false))
    }
  }, [tab, card.id, logsLoaded, reqLoaded])

  const statusColor: Record<string, string> = {
    awaiting_start: '#94a3b8', started: '#22c55e',
    liberado_para_testes: '#f59e0b', finished: '#f59e0b', paused: '#f97316', cancelled: '#ef4444',
  }
  const color = statusColor[card.status] ?? '#94a3b8'
  const hasReq = !!card.contract_request_id

  const fetchAttachmentBlob = async (msgId: number, attId: number) => {
    const token = localStorage.getItem('minutor_token') ?? ''
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://minutor-backend.onrender.com/api/v1'
    const res = await fetch(`${baseUrl}/req-messages/${msgId}/attachments/${attId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error()
    return res.blob()
  }

  const downloadReqAttachment = async (msgId: number, att: { id: number; original_name: string }) => {
    try {
      const blob = await fetchAttachmentBlob(msgId, att.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = att.original_name; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao baixar arquivo') }
  }

  const viewReqAttachment = async (msgId: number, att: { id: number; original_name: string }) => {
    try {
      const blob = await fetchAttachmentBlob(msgId, att.id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch { toast.error('Erro ao abrir arquivo') }
  }

  const tabs = [
    { id: 'details', label: 'Detalhes', icon: <ExternalLink size={11} /> },
    ...(hasReq ? [{ id: 'req', label: 'Requisição', icon: <Layers size={11} /> }] : []),
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={11} /> },
    { id: 'log', label: 'Histórico', icon: <Clock size={11} /> },
  ] as const

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(99,102,241,0.3)', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{card.project_name}</p>
              <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>{card.customer_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full shrink-0 font-semibold" style={{ background: `${color}20`, color }}>
                {STATUS_LABEL[card.status] ?? card.status}
              </span>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={tab === t.id
                  ? { background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }
                  : { color: 'var(--brand-subtle)', border: '1px solid transparent' }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        {tab === 'log' ? (
          <div className="flex-1 overflow-y-auto">
            <KanbanLogTab logs={logs} loading={logsLoading} />
          </div>
        ) : tab === 'req' ? (
          <div className="flex-1 overflow-y-auto">
            {reqLoading ? (
              <p className="text-center text-xs py-10" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
            ) : reqData ? (
              <div className="px-6 py-5 space-y-6">
                {/* Identificação */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ['Área Requisitante', reqData.area_requisitante],
                      ['Nome do Projeto', reqData.project_name || '—'],
                      ['Product Owner', reqData.product_owner || '—'],
                      ['Módulo / Tecnologia', reqData.modulo_tecnologia || '—'],
                      ['Solicitado por', reqData.createdBy?.name || '—'],
                      ['Data', new Date(reqData.created_at).toLocaleDateString('pt-BR')],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                        <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tipo + Urgência */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Tipo de Necessidade</p>
                    <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                      {reqData.tipo_necessidade === 'outro' && reqData.tipo_necessidade_outro
                        ? reqData.tipo_necessidade_outro
                        : (TIPO_NECESSIDADE_LABEL[reqData.tipo_necessidade] ?? reqData.tipo_necessidade)}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Urgência</p>
                    <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{
                      background: `${URGENCIA_COLOR[reqData.nivel_urgencia] ?? '#64748b'}18`,
                      color: URGENCIA_COLOR[reqData.nivel_urgencia] ?? '#64748b'
                    }}>
                      {URGENCIA_LABEL[reqData.nivel_urgencia] ?? reqData.nivel_urgencia}
                    </span>
                  </div>
                </div>

                {/* Descrição */}
                {(reqData.descricao || reqData.cenario_atual || reqData.cenario_desejado) && (
                  <div className="space-y-3">
                    {reqData.descricao && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Descrição Geral</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{reqData.descricao}</p>
                      </div>
                    )}
                    {reqData.cenario_atual && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Cenário Atual</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{reqData.cenario_atual}</p>
                      </div>
                    )}
                    {reqData.cenario_desejado && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Cenário Desejado</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{reqData.cenario_desejado}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Mensagens */}
                {reqData.messages && reqData.messages.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Conversas da Requisição</p>
                    <div className="space-y-3">
                      {reqData.messages.map(msg => (
                        <div key={msg.id} className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{msg.author?.name ?? '—'}</span>
                            <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{new Date(msg.created_at).toLocaleString('pt-BR')}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{msg.message}</p>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.attachments.map(att => (
                                <div key={att.id} className="flex items-center gap-0 rounded-lg overflow-hidden text-[11px]"
                                  style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.06)' }}>
                                  <span className="flex items-center gap-1 px-2 py-1.5" style={{ color: '#a78bfa' }}>
                                    <Paperclip size={9} />
                                    <span className="max-w-[160px] truncate">{att.original_name}</span>
                                  </span>
                                  <button
                                    onClick={() => viewReqAttachment(msg.id, att)}
                                    className="px-2 py-1.5 border-l transition-colors hover:bg-white/5"
                                    style={{ borderColor: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}
                                    title="Visualizar"
                                  >
                                    <ExternalLink size={10} />
                                  </button>
                                  <button
                                    onClick={() => downloadReqAttachment(msg.id, att)}
                                    className="px-2 py-1.5 border-l transition-colors hover:bg-white/5"
                                    style={{ borderColor: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}
                                    title="Baixar"
                                  >
                                    <Download size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-xs py-10" style={{ color: 'var(--brand-subtle)' }}>Nenhuma requisição vinculada</p>
            )}
          </div>
        ) : tab === 'details' ? (
          <>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ['Código', card.code],
                  ['Horas Vendidas', card.sold_hours ? `${card.sold_hours}h` : '—'],
                  ['Coordenadores', card.coordinators?.join(', ') || '—'],
                  ['Consultores', card.consultants?.join(', ') || '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                    <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
              {userRole !== 'cliente' && (
                <>
                  <button onClick={() => setShowProjectView(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)' }}>
                    <ExternalLink size={13} /> Visualizar Projeto
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <ProjectMessages projectId={card.id} userRole={userRole} />
          </div>
        )}
      </div>
    </div>
    {showProjectView && <ProjectViewModal projectId={card.id} onClose={() => setShowProjectView(false)} userRole={userRole} />}
    </>
  )
}

// ─── Plan Decision Modal ──────────────────────────────────────────────────────

function PlanDecisionModal({ card, coordinators, onClose, onDone, onNovoProjeto, onSubprojeto }: {
  card: RequestCard
  coordinators: Coordinator[]
  onClose: () => void
  onDone: (updatedCard: RequestCard) => void
  onNovoProjeto: () => void
  onSubprojeto: (projectId: number, subSeq: string) => void
}) {
  const [step, setStep] = useState<'decision' | 'novo_projeto' | 'subprojeto'>('decision')
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<{ id: number; name: string; code?: string }[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [serviceTypes, setServiceTypes]   = useState<{ id: number; name: string }[]>([])
  const [contractTypes, setContractTypes] = useState<{ id: number; name: string }[]>([])

  // "Novo Projeto" form state
  const [projectName, setProjectName]             = useState('')
  const [categoria, setCategoria]                 = useState<'projeto' | 'sustentacao'>('projeto')
  const [serviceTypeId, setServiceTypeId]         = useState<number | ''>('')
  const [contractTypeId, setContractTypeId]       = useState<number | ''>('')
  const [horasContratadas, setHorasContratadas]   = useState('')
  const [tipoFaturamento, setTipoFaturamento]     = useState('')
  const [valorProjeto, setValorProjeto]           = useState('')

  // "Subprojeto" state
  const [selectedProjectId, setSelectedProjectId]       = useState<number | null>(null)
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<number | null>(null)
  const [parentBalance, setParentBalance]               = useState<{ balance: number; allow_negative: boolean } | null>(null)
  const [parentBalanceLoading, setParentBalanceLoading] = useState(false)
  const [confirmNegative, setConfirmNegative]           = useState(false)
  const [subSeq, setSubSeq]                             = useState('')

  useEffect(() => {
    if (step === 'novo_projeto' && serviceTypes.length === 0) {
      Promise.all([
        api.get<any>('/service-types'),
        api.get<any>('/contract-types'),
      ]).then(([st, ct]) => {
        setServiceTypes(Array.isArray(st) ? st : (st.data ?? []))
        setContractTypes(Array.isArray(ct) ? ct : (ct.data ?? []))
      }).catch(() => toast.error('Erro ao carregar opções'))
    }
    if (step === 'subprojeto' && projects.length === 0) {
      setProjectsLoading(true)
      api.get<{ hasNext: boolean; items: { id: number; name: string; code?: string }[] }>(
        `/projects?minimal=true&per_page=200&customer_id=${card.customer_id}`
      )
        .then(r => setProjects((r as any).items ?? []))
        .catch(() => toast.error('Erro ao carregar projetos'))
        .finally(() => setProjectsLoading(false))
    }
  }, [step])

  const submitNovoProjeto = async () => {
    if (!horasContratadas) { toast.error('Informe as horas contratadas'); return }
    setLoading(true)
    try {
      const res = await api.post<{ ok: boolean; linked_contract_id: number }>(`/contract-requests/${card.id}/plan-decision`, {
        decision: 'novo_projeto',
        project_name: projectName || undefined,
        categoria,
        service_type_id: serviceTypeId || undefined,
        contract_type_id: contractTypeId || undefined,
        horas_contratadas: Number(horasContratadas),
        tipo_faturamento: tipoFaturamento || undefined,
        valor_projeto: valorProjeto ? Number(valorProjeto) : undefined,
      })
      toast.success('Contrato criado — requisição aguardando em Aguardando Início (Req.)')
      onDone({ ...card, kanban_column: 'req_inicio_autorizado', req_decision: 'novo_projeto', linked_contract_id: res.linked_contract_id })
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao processar')
    } finally {
      setLoading(false)
    }
  }

  const selectProject = (id: number) => {
    setSelectedProjectId(id)
    setSubSeq('')
    setParentBalance(null)
    setParentBalanceLoading(true)
    api.get<{ general_hours_balance?: number; allow_negative_balance?: boolean; total_available_hours?: number; sold_hours?: number; consumed_hours?: number }>(`/projects/${id}`)
      .then(r => {
        const balance = r.general_hours_balance ?? ((r.sold_hours ?? 0) - (r.consumed_hours ?? 0))
        setParentBalance({ balance, allow_negative: r.allow_negative_balance ?? false })
      })
      .catch(() => {})
      .finally(() => setParentBalanceLoading(false))
  }

  const handleSubprojetoAvancar = () => {
    if (!selectedProjectId) { toast.error('Selecione um projeto'); return }
    if (!subSeq.trim()) { toast.error('Informe o número do subprojeto'); return }
    if (parentBalance && parentBalance.balance <= 0) {
      if (!parentBalance.allow_negative) {
        toast.error('Saldo insuficiente: este projeto não permite saldo negativo e já está zerado.')
        return
      }
      setConfirmNegative(true)
      return
    }
    onSubprojeto(selectedProjectId, subSeq.trim().padStart(2, '0'))
  }

  const inputStyle = { background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }
  const labelStyle = { color: 'var(--brand-subtle)' }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>

        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <Layers size={16} style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>
                {step === 'decision' ? 'Planejamento' : step === 'novo_projeto' ? 'Novo Projeto' : 'Subprojeto'}
              </p>
              <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{card.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
        </div>

        {/* Step: Decision */}
        {step === 'decision' && (
          <div className="px-6 py-6 space-y-3">
            <p className="text-sm mb-4" style={{ color: 'var(--brand-muted)' }}>Como esta requisição será atendida?</p>
            <button
              onClick={onNovoProjeto}
              className="w-full text-left px-4 py-4 rounded-xl border transition-all hover:border-violet-500/50"
              style={{ background: 'rgba(139,92,246,0.05)', borderColor: 'var(--brand-border)' }}>
              <p className="font-semibold text-sm" style={{ color: 'var(--brand-text)' }}>Novo Projeto</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Criar um novo projeto para este cliente</p>
            </button>
            <button
              onClick={() => setStep('subprojeto')}
              className="w-full text-left px-4 py-4 rounded-xl border transition-all hover:border-violet-500/50"
              style={{ background: 'rgba(139,92,246,0.05)', borderColor: 'var(--brand-border)' }}>
              <p className="font-semibold text-sm" style={{ color: 'var(--brand-text)' }}>Subprojeto</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Vincular a um projeto já existente</p>
            </button>
          </div>
        )}

        {/* Step: Novo Projeto */}
        {step === 'novo_projeto' && (
          <div className="px-6 py-5 space-y-3 overflow-y-auto max-h-[70vh]">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>NOME DO PROJETO</label>
              <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} placeholder="Ex: Implementação ERP" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>CATEGORIA *</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value as any)}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
                  <option value="projeto">Projeto</option>
                  <option value="sustentacao">Sustentação</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>TIPO DE FATURAMENTO</label>
                <select value={tipoFaturamento} onChange={e => setTipoFaturamento(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">Selecionar...</option>
                  <option value="on_demand">On Demand</option>
                  <option value="banco_horas_mensal">Banco de Horas Mensal</option>
                  <option value="banco_horas_fixo">Banco de Horas Fixo</option>
                  <option value="por_servico">Por Serviço</option>
                  <option value="saas">SaaS</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>TIPO DE CONTRATO</label>
                <select value={contractTypeId} onChange={e => setContractTypeId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">Selecionar...</option>
                  {contractTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>TIPO DE SERVIÇO</label>
                <select value={serviceTypeId} onChange={e => setServiceTypeId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">Selecionar...</option>
                  {serviceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>HORAS CONTRATADAS *</label>
                <input type="number" value={horasContratadas} onChange={e => setHorasContratadas(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>VALOR DO PROJETO</label>
                <input type="number" value={valorProjeto} onChange={e => setValorProjeto(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} placeholder="R$ 0,00" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setStep('decision')} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Voltar</button>
              <button onClick={submitNovoProjeto} disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)' }}>
                {loading ? 'Criando...' : 'Criar Contrato'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Subprojeto */}
        {step === 'subprojeto' && (
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>PROJETO *</label>
              {projectsLoading
                ? <p className="text-xs py-2" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
                : <>
                    <input
                      type="text"
                      value={projectSearch}
                      onChange={e => setProjectSearch(e.target.value)}
                      placeholder="Buscar projeto..."
                      className="w-full rounded-lg px-3 py-2 text-sm mb-2"
                      style={inputStyle}
                    />
                    <div className="rounded-lg overflow-y-auto max-h-48" style={{ border: '1px solid var(--brand-border)' }}>
                      {projects
                        .filter(p => {
                          const q = projectSearch.toLowerCase()
                          return !q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)
                        })
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectProject(p.id)}
                            className="w-full text-left px-3 py-2 text-sm transition-colors"
                            style={{
                              background: selectedProjectId === p.id ? 'rgba(139,92,246,0.2)' : 'transparent',
                              color: selectedProjectId === p.id ? '#a78bfa' : 'var(--brand-text)',
                              borderBottom: '1px solid var(--brand-border)',
                            }}>
                            {p.code ? <span className="font-mono text-xs mr-1.5" style={{ color: 'var(--brand-subtle)' }}>[{p.code}]</span> : null}
                            {p.name}
                          </button>
                        ))}
                      {projects.filter(p => {
                        const q = projectSearch.toLowerCase()
                        return !q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)
                      }).length === 0 && (
                        <p className="px-3 py-3 text-xs text-center" style={{ color: 'var(--brand-subtle)' }}>Nenhum projeto encontrado</p>
                      )}
                    </div>
                  </>
              }
            </div>

            {/* Painel de saldo do projeto selecionado */}
            {selectedProjectId && (
              <div className="rounded-xl p-3" style={{
                background: parentBalance
                  ? parentBalance.balance > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${parentBalance
                  ? parentBalance.balance > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.35)'
                  : 'var(--brand-border)'}`,
              }}>
                {parentBalanceLoading ? (
                  <p className="text-xs animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Verificando saldo...</p>
                ) : parentBalance ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                        style={{ color: parentBalance.balance > 0 ? '#86efac' : '#fca5a5' }}>
                        Saldo do Projeto Pai
                      </p>
                      <p className="text-lg font-bold tabular-nums"
                        style={{ color: parentBalance.balance > 0 ? '#22c55e' : '#ef4444' }}>
                        {parentBalance.balance > 0 ? '' : ''}{parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                      </p>
                    </div>
                    {parentBalance.balance <= 0 && (
                      <div className="text-right">
                        <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Saldo negativo</p>
                        <p className="text-xs font-semibold"
                          style={{ color: parentBalance.allow_negative ? '#f59e0b' : '#ef4444' }}>
                          {parentBalance.allow_negative ? 'Permitido' : 'Bloqueado'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {selectedProjectId && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>NÚMERO DO SUBPROJETO *</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono px-3 py-2 rounded-lg flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)' }}>
                    {projects.find(p => p.id === selectedProjectId)?.code ?? '—'}
                    {subSeq.trim() ? `-${subSeq.trim().padStart(2, '0')}` : '-??'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={subSeq}
                    onChange={e => setSubSeq(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="01"
                    className="w-20 rounded-lg px-3 py-2 text-sm font-mono"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setStep('decision')} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Voltar</button>
              <button onClick={handleSubprojetoAvancar} disabled={!selectedProjectId || parentBalanceLoading || !subSeq.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)' }}>
                Avançar →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    {/* Modal de confirmação: saldo negativo permitido */}
    {confirmNegative && selectedProjectId && parentBalance && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="rounded-2xl w-full max-w-sm p-6 text-center" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(239,68,68,0.4)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={22} style={{ color: '#ef4444' }} />
          </div>
          <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--brand-text)' }}>Saldo Negativo</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--brand-muted)' }}>
            O projeto pai possui saldo de{' '}
            <strong style={{ color: '#ef4444' }}>
              {parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h
            </strong>.{' '}
            Criar este subprojeto irá aumentar o saldo devedor. Deseja continuar?
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setConfirmNegative(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors"
              style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
              Cancelar
            </button>
            <button onClick={() => { setConfirmNegative(false); onSubprojeto(selectedProjectId, subSeq.trim().padStart(2, '0')) }}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }}>
              Sim, continuar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─── Contract Decision Modal (Novo Projeto / Projeto Filho) ──────────────────

function ContractDecisionModal({ card, onClose, onNovoProjeto, onFilho }: {
  card: ContractCard
  onClose: () => void
  onNovoProjeto: () => void
  onFilho: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--brand-border)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Tipo de Projeto</span>
          <button onClick={onClose} style={{ color: 'var(--brand-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-xs mb-4" style={{ color: 'var(--brand-muted)' }}>
            Como este contrato deve ser classificado?
          </p>
          <button
            onClick={onNovoProjeto}
            className="w-full text-left px-4 py-3 rounded-xl transition-all hover:opacity-90"
            style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.25)' }}
          >
            <p className="font-semibold text-sm" style={{ color: 'var(--brand-text)' }}>Novo Projeto</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Cadastrar um novo contrato de projeto para este cliente</p>
          </button>
          <button
            onClick={onFilho}
            className="w-full text-left px-4 py-3 rounded-xl transition-all hover:opacity-90"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)' }}
          >
            <p className="font-semibold text-sm" style={{ color: 'var(--brand-text)' }}>Projeto Filho</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Vinculado a um projeto pai existente</p>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contract Filho Modal ─────────────────────────────────────────────────────

function ContractFilhoModal({ card, onClose, onDone }: {
  card: ContractCard
  onClose: () => void
  onDone: (updatedCard: ContractCard) => void
}) {
  const [loading, setLoading]   = useState(false)
  const [projects, setProjects] = useState<{ id: number; name: string; code?: string }[]>([])
  const [projLoading, setProjLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  useEffect(() => {
    setProjLoading(true)
    api.get<any>(`/projects?minimal=true&per_page=200&customer_id=${card.customer_id}`)
      .then(r => setProjects(r?.items ?? []))
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setProjLoading(false))
  }, [])

  const handleConfirm = async () => {
    if (!selectedProjectId) { toast.error('Selecione um projeto pai'); return }
    setLoading(true)
    try {
      await api.patch(`/contracts/${card.id}/kanban-move`, { to_column: 'inicio_autorizado', parent_project_id: selectedProjectId, order: 0 })
      toast.success('Contrato vinculado como projeto filho — movido para Início Autorizado')
      onDone({ ...card, kanban_status: 'inicio_autorizado' })
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao vincular contrato')
    } finally {
      setLoading(false)
    }
  }

  const labelStyle: React.CSSProperties = { color: 'var(--brand-subtle)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.07em', textTransform: 'uppercase' as const }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--brand-border)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Selecionar Projeto Pai</span>
          <button onClick={onClose} style={{ color: 'var(--brand-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-6 space-y-3">
          <label className="block text-xs font-semibold mb-1.5" style={labelStyle}>PROJETO PAI *</label>
          {projLoading
            ? <p className="text-xs py-2" style={{ color: 'var(--brand-muted)' }}>Carregando projetos...</p>
            : (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {projects.length === 0
                  ? <p className="text-xs py-2" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado para este cliente.</p>
                  : projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                      style={{
                        background: selectedProjectId === p.id ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selectedProjectId === p.id ? 'rgba(0,245,255,0.4)' : 'var(--brand-border)'}`,
                        color: 'var(--brand-text)',
                      }}
                    >
                      {p.code && <span className="text-xs mr-2" style={{ color: 'var(--brand-muted)' }}>{p.code}</span>}
                      {p.name}
                    </button>
                  ))
                }
              </div>
            )
          }
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Cancelar</button>
            <button onClick={handleConfirm} disabled={loading || !selectedProjectId}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: '#8B5CF6', color: '#fff' }}>
              {loading ? 'Vinculando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Finalize Request Modal ───────────────────────────────────────────────────

function FinalizeRequestModal({ card, onClose, onDone }: {
  card: RequestCard
  onClose: () => void
  onDone: (updatedCard: RequestCard) => void
}) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await api.post(`/contract-requests/${card.id}/finalize`, {})
      toast.success('Requisição movida para Em Andamento!')
      onDone({ ...card, kanban_column: 'req_em_andamento' })
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao finalizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <Rocket size={16} style={{ color: '#eab308' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Mover para Em Andamento</p>
              <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{card.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
            O coordenador já foi definido no Kanban de Contratos. Confirme para mover a requisição para Em Andamento.
          </p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Cancelar</button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: '#eab308', color: '#000' }}>
            <Rocket size={13} /> {loading ? 'Movendo...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Request Detail Modal ─────────────────────────────────────────────────────

interface ReqAttachment { id: number; original_name: string; file_path: string; file_size: number; mime_type?: string }
interface ReqMsg { id: number; message: string; author?: { id: number; name: string }; created_at: string; attachments?: ReqAttachment[] }
interface MentionUser { id: number; name: string }

interface KanbanLogEntry {
  id: number
  source?: 'req' | 'contract' | 'project'
  from_column?: string; to_column?: string
  from_status?: string; to_status?: string
  moved_by: string; created_at: string
}

const COL_LABEL: Record<string, string> = {
  backlog: 'Backlog', novo_projeto: 'Novo Projeto', em_planejamento: 'Em Planejamento',
  em_validacao: 'Em Validação', em_revisao: 'Em Revisão', aprovado: 'Aprovado',
  inicio_autorizado: 'Início Autorizado', req_planejamento: 'Planejamento (Req.)',
  req_inicio_autorizado: 'Aguardando Início (Req.)', req_em_andamento: 'Em Andamento (Req.)',
  awaiting_start: 'Aguardando Início', started: 'Em Andamento',
  liberado_para_testes: 'Lib. p/ Testes', paused: 'Pausado',
  finished: 'Encerrado', cancelled: 'Cancelado',
}

const SOURCE_META: Record<string, { label: string; color: string; bg: string }> = {
  req:      { label: 'Requisição', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  contract: { label: 'Contrato',   color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  project:  { label: 'Projeto',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  // demand columns
  backlog:                { label: 'Backlog',                  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  novo_projeto:           { label: 'Novo Projeto',             color: '#818cf8', bg: 'rgba(99,102,241,0.12)'  },
  em_planejamento:        { label: 'Em Planejamento',          color: '#60a5fa', bg: 'rgba(59,130,246,0.12)'  },
  em_validacao:           { label: 'Em Validação',             color: '#22d3ee', bg: 'rgba(6,182,212,0.12)'   },
  em_revisao:             { label: 'Em Revisão',               color: '#c084fc', bg: 'rgba(168,85,247,0.12)'  },
  aprovado:               { label: 'Aprovado',                 color: '#4ade80', bg: 'rgba(34,197,94,0.12)'   },
  req_inicio_autorizado:  { label: 'Aguardando Início (Req.)', color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  req_planejamento:       { label: 'Planejamento (Req.)',       color: '#60a5fa', bg: 'rgba(59,130,246,0.12)'  },
  req_em_andamento:       { label: 'Em Andamento (Req.)',       color: '#818cf8', bg: 'rgba(99,102,241,0.12)'  },
  // transition
  inicio_autorizado:      { label: 'Início Autorizado',        color: '#eab308', bg: 'rgba(234,179,8,0.12)'   },
  alocado:                { label: 'Início Autorizado',        color: '#eab308', bg: 'rgba(234,179,8,0.12)'   },
  // project statuses
  awaiting_start:         { label: 'Em Andamento',             color: '#818cf8', bg: 'rgba(99,102,241,0.12)'  },
  started:                { label: 'Em Andamento',             color: '#818cf8', bg: 'rgba(99,102,241,0.12)'  },
  liberado_para_testes:   { label: 'Lib. p/ Testes',           color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  paused:                 { label: 'Pausado',                  color: '#eab308', bg: 'rgba(234,179,8,0.12)'   },
  finished:               { label: 'Encerrado',                color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  cancelled:              { label: 'Cancelado',                color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
}

function KanbanLogTab({ logs, loading }: { logs: KanbanLogEntry[]; loading: boolean }) {
  const label = (v?: string) => v ? (COL_LABEL[v] ?? v) : '—'

  if (loading) return <p className="text-center text-xs py-8" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
  if (logs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-10 gap-1">
      <Clock size={24} style={{ color: 'var(--brand-subtle)', opacity: 0.4 }} />
      <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhuma movimentação registrada</p>
    </div>
  )

  const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return (
    <div className="px-6 py-4">
      <div className="relative">
        {/* Linha vertical da timeline */}
        <div className="absolute left-3 top-0 bottom-0 w-px" style={{ background: 'rgba(139,92,246,0.2)' }} />
        <div className="space-y-0">
          {sorted.map((l, i) => {
            const src = l.source ? SOURCE_META[l.source] : SOURCE_META.project
            const from = l.from_column ?? l.from_status
            const to   = l.to_column ?? l.to_status
            const isFirst = from == null
            return (
              <div key={`${l.id}-${l.source}`} className="flex items-start gap-4 pb-5">
                {/* Dot */}
                <div className="relative z-10 w-6 h-6 shrink-0 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: isFirst ? 'rgba(34,197,94,0.15)' : src.bg, border: `1px solid ${isFirst ? '#22c55e' : src.color}` }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: isFirst ? '#22c55e' : src.color }} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
                        {isFirst
                          ? <span style={{ color: '#22c55e' }}>Criado em <strong>{label(to)}</strong></span>
                          : <><span style={{ color: 'var(--brand-muted)' }}>{label(from)}</span><span style={{ color: 'var(--brand-subtle)' }}> → </span><strong style={{ color: 'var(--brand-text)' }}>{label(to)}</strong></>
                        }
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
                        {l.moved_by} · {new Date(l.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </div>
                    {l.source && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: src.bg, color: src.color }}>
                        {src.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── ProjectViewModal (completo, inline no pipeline) ──────────────────────────

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
  consultant_name: string
  total_hours: number
  approved_hours: number
  pending_hours: number
  cost: number
  consultant_hourly_rate: number
  consultant_rate_type?: string
}

interface CostSummary {
  project_info: { project_value?: number | null; initial_cost?: number | null; total_available_hours?: number; weighted_hourly_rate?: number }
  hours_summary: { total_logged_hours: number; approved_hours: number; pending_hours: number; remaining_hours: number; general_balance?: number; total_available_hours?: number; hours_percentage: number }
  cost_calculation: { total_cost: number; approved_cost: number; pending_cost: number; margin: number; margin_percentage: number }
  consultant_breakdown: ConsultantBreakdown[]
}

interface TimesheetEntry {
  id: number
  date: string
  effort_hours: string
  effort_minutes: number
  observation?: string
  status: string
  status_display: string
  user?: { id: number; name: string }
}

function ProjectViewModal({ projectId, onClose, userRole, initialTab }: { projectId: number; onClose: () => void; userRole?: string; initialTab?: string }) {
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

  useEffect(() => {
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (tab === 'timesheets' && !tsLoaded) {
      setTsLoading(true)
      api.get<any>(`/timesheets?project_id=${projectId}&per_page=30&sort=date&direction=desc`)
        .then(r => {
          const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
          setTimesheets(list)
          setTsLoaded(true)
        })
        .catch(() => {})
        .finally(() => setTsLoading(false))
    }
  }, [tab, projectId, tsLoaded])

  const fmt = (n: number | null | undefined, dec = 0) =>
    n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  const fmtDate = (d?: string | null) => d ? d.slice(0,10).split('-').reverse().join('/') : '—'
  const fmtBRL  = (v?: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

  const healthColor = (pct: number) => pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
  const riskEmoji   = (pct: number) => pct >= 90 ? '🔴' : pct >= 70 ? '🟡' : '🟢'
  const riskLabel   = (pct: number) => pct >= 90 ? 'Crítico' : pct >= 70 ? 'Atenção' : 'Saudável'

  const statusColors: Record<string, { background: string; color: string }> = {
    awaiting_start: { background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
    started:        { background: 'rgba(0,245,255,0.10)',   color: '#00F5FF' },
    paused:         { background: 'rgba(249,115,22,0.12)',  color: '#F97316' },
    cancelled:      { background: 'rgba(239,68,68,0.12)',   color: '#EF4444' },
    finished:       { background: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
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

  // derived indicators from cost-summary
  const totalBreakdownHours = breakdown.reduce((s, c) => s + c.total_hours, 0)
  const topConsultant = breakdown.length > 0 ? breakdown.reduce((a, b) => a.total_hours > b.total_hours ? a : b) : null
  const topShare = totalBreakdownHours > 0 && topConsultant ? (topConsultant.total_hours / totalBreakdownHours) * 100 : 0
  const avgHours = breakdown.length > 0 ? totalBreakdownHours / breakdown.length : 0

  // alerts
  const alerts: { msg: string; color: string }[] = []
  if (pct >= 90) alerts.push({ msg: `Consumo crítico: ${Math.round(pct)}% das horas já utilizadas`, color: '#ef4444' })
  else if (pct >= 70) alerts.push({ msg: `Atenção: ${Math.round(pct)}% das horas consumidas`, color: '#f59e0b' })
  if ((p?.general_hours_balance ?? 0) < 0) alerts.push({ msg: 'Saldo de horas negativo — projeto em déficit', color: '#ef4444' })
  if (topShare >= 60 && topConsultant) alerts.push({ msg: `${topConsultant.consultant_name} concentra ${Math.round(topShare)}% das horas`, color: '#f59e0b' })

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

        {/* Header */}
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
                    {(p.contract_type_display ?? p.contract_type?.name) && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-subtle)' }}>{p.contract_type_display ?? p.contract_type?.name}</span>}
                    {p.service_type?.name && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-subtle)' }}>{p.service_type.name}</span>}
                    <span className="text-xs font-bold" title={`${Math.round(pct)}% consumido`}>{riskEmoji(pct)} {riskLabel(pct)}</span>
                  </div>
                  <h2 className="text-xl font-bold leading-tight truncate" style={{ color: 'var(--brand-text)' }}>{p.name}</h2>
                  {p.customer?.name && <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>{p.customer.name}</p>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {userRole === 'admin' && p && (
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.2)' }}
                >
                  <ExternalLink size={11} /> Editar
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
                style={{ color: tab === t.id ? '#00F5FF' : 'var(--brand-subtle)', borderBottom: tab === t.id ? '2px solid #00F5FF' : '2px solid transparent', marginBottom: '-1px' }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
          </div>
        ) : !p ? null : (
          <div className="flex-1 overflow-y-auto p-6">

            {/* ── VISÃO GERAL ── */}
            {tab === 'overview' && (
              <div className="space-y-5">

                {/* KPI strip */}
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

                {/* Secondary KPIs */}
                {breakdown.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Média h/consultor', value: fmt(avgHours, 1) + 'h',                           color: 'var(--brand-text)' },
                      { label: 'Maior consumidor',  value: topConsultant ? topConsultant.consultant_name : '—', color: '#f59e0b' },
                      { label: '% do top consultor',value: topShare > 0 ? `${Math.round(topShare)}%` : '—',   color: '#f59e0b' },
                    ].map(it => (
                      <div key={it.label} className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
                        <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{it.label}</span>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: it.color }}>{it.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Health bar */}
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${bar}33` }}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{riskEmoji(pct)}</span>
                      <span className="text-xs font-semibold" style={{ color: bar }}>{riskLabel(pct)}</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums" style={{ color: bar }}>
                      {totalAvail > 0 ? `${Math.round(pct)}% consumido` : 'Sem horas'}
                    </span>
                  </div>
                  <div className="w-full h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all relative" style={{ width: `${Math.min(pct, 100)}%`, background: bar }}>
                      {pct >= 15 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-black/70">{Math.round(pct)}%</span>}
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] mt-1.5" style={{ color: 'var(--brand-subtle)' }}>
                    <span>{fmt(consumed, 1)}h utilizadas</span>
                    <span>🟢 &lt;70% · 🟡 70-90% · 🔴 &gt;90%</span>
                    <span>{fmt(totalAvail, 1)}h disponíveis</span>
                  </div>
                </div>

                {/* Alerts */}
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

                {/* Consultor mini-bars (top 5) */}
                {breakdown.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Quem está consumindo horas</p>
                    <div className="space-y-2">
                      {[...breakdown].sort((a,b) => b.total_hours - a.total_hours).slice(0, 5).map((c, i) => {
                        const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                        const colors = ['#00F5FF','#a78bfa','#22c55e','#f59e0b','#f87171']
                        const col = colors[i % colors.length]
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs shrink-0 w-28 truncate" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</span>
                            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: col }} />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums shrink-0 w-12 text-right" style={{ color: col }}>{fmt(c.total_hours, 1)}h</span>
                            <span className="text-[10px] shrink-0 w-8 text-right" style={{ color: 'var(--brand-subtle)' }}>{Math.round(share)}%</span>
                          </div>
                        )
                      })}
                    </div>
                    {breakdown.length > 5 && (
                      <button onClick={() => setTab('consultants')} className="mt-2 text-[11px] underline" style={{ color: 'var(--brand-subtle)' }}>
                        Ver todos os {breakdown.length} consultores →
                      </button>
                    )}
                  </div>
                )}

                {/* Identification + Team */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                      <div className="divide-y px-4" style={{ borderColor: 'var(--brand-border)' }}>
                        <Row label="Código" value={<span className="font-mono">{p.code}</span>} />
                        <Row label="Cliente" value={p.customer?.name} />
                        <Row label="Tipo de Serviço" value={p.service_type?.name} />
                        <Row label="Tipo de Contrato" value={p.contract_type_display ?? p.contract_type?.name} />
                        {p.parent_project && <Row label="Projeto Pai" value={`${p.parent_project.name} (${p.parent_project.code})`} />}
                        <Row label="Data de Início" value={fmtDate(p.start_date)} />
                        {p.expected_end_date && (() => {
                          const ds = endDateStyle(p.expected_end_date)
                          return (
                            <Row label="Data de Conclusão" value={
                              <span className="flex items-center gap-1.5">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: ds.bg, color: ds.color }}>
                                  {new Date(p.expected_end_date).toLocaleDateString('pt-BR')} — {ds.label}
                                </span>
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
                            <span key={u.id} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>
                              {u.name}
                            </span>
                          ))}</div>
                        </div>
                      )}
                      {(p.consultants?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consultores Alocados</p>
                          <div className="flex flex-wrap gap-1.5">{p.consultants!.map(u => {
                            const bk = breakdown.find(b => b.consultant_name === u.name)
                            return (
                              <span key={u.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(139,92,246,0.10)', color: '#a78bfa' }}>
                                {u.name}
                                {bk && <span className="text-[10px] font-bold" style={{ color: '#c4b5fd' }}>{fmt(bk.total_hours, 1)}h</span>}
                              </span>
                            )
                          })}</div>
                        </div>
                      )}
                      {(p.approvers?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Aprovadores</p>
                          <div className="flex flex-wrap gap-1.5">{p.approvers!.map(u => <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(245,158,11,0.10)', color: '#f59e0b' }}>{u.name}</span>)}</div>
                        </div>
                      )}
                      {(p.coordinators?.length ?? 0) === 0 && (p.consultants?.length ?? 0) === 0 && (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--brand-subtle)' }}>Sem equipe cadastrada</p>
                      )}
                    </div>
                  </div>
                </div>

                {p.description && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Descrição</p>
                    <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>{p.description}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONSULTORES ── */}
            {tab === 'consultants' && (
              <div className="space-y-4">
                {breakdown.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Nenhum lançamento de horas encontrado.</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Consultores',    value: String(breakdown.length),                                          color: '#a78bfa' },
                        { label: 'Total Horas',    value: fmt(totalBreakdownHours, 1) + 'h',                                 color: 'var(--brand-text)' },
                        { label: 'Aprovadas',      value: fmt(breakdown.reduce((s, c) => s + c.approved_hours, 0), 1) + 'h', color: '#22c55e' },
                        { label: 'Custo Total',    value: fmtBRL(breakdown.reduce((s, c) => s + c.cost, 0)),                color: '#00F5FF' },
                      ].map(it => (
                        <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                          <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                          <p className="text-lg font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Bars */}
                    <div className="space-y-2">
                      {[...breakdown].sort((a, b) => b.total_hours - a.total_hours).map((c, i) => {
                        const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                        const colors = ['#00F5FF','#a78bfa','#22c55e','#f59e0b','#f87171','#34d399','#60a5fa']
                        const col = colors[i % colors.length]
                        return (
                          <div key={i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                                <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</span>
                                {share >= 60 && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>Alta concentração</span>}
                              </div>
                              <span className="text-xs font-bold tabular-nums" style={{ color: col }}>{fmt(c.total_hours, 1)}h · {Math.round(share)}%</span>
                            </div>
                            <div className="w-full h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: col }} />
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-[10px]">
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Aprovadas</span><br/><span style={{ color: '#22c55e' }}>{fmt(c.approved_hours, 1)}h</span></div>
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Pendentes</span><br/><span style={{ color: c.pending_hours > 0 ? '#f59e0b' : 'var(--brand-subtle)' }}>{fmt(c.pending_hours, 1)}h</span></div>
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Taxa/h</span><br/><span style={{ color: 'var(--brand-muted)' }}>{fmtBRL(c.consultant_hourly_rate)}</span></div>
                              <div><span style={{ color: 'var(--brand-subtle)' }}>Custo</span><br/><span style={{ color: '#00F5FF' }}>{fmtBRL(c.cost)}</span></div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Full table */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--brand-border)' }}>
                            {['#','Consultor','Total','Aprov.','Pend.','% do Total','Taxa/h','Custo'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...breakdown].sort((a, b) => b.total_hours - a.total_hours).map((c, i) => {
                            const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                            return (
                              <tr key={i} style={{ borderBottom: i < breakdown.length - 1 ? '1px solid var(--brand-border)' : undefined }}>
                                <td className="px-3 py-2.5 text-center" style={{ color: 'var(--brand-subtle)' }}>{i + 1}</td>
                                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</td>
                                <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: 'var(--brand-text)' }}>{fmt(c.total_hours, 1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: '#22c55e' }}>{fmt(c.approved_hours, 1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: c.pending_hours > 0 ? '#f59e0b' : 'var(--brand-subtle)' }}>{fmt(c.pending_hours, 1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{Math.round(share)}%</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtBRL(c.consultant_hourly_rate)}</td>
                                <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: '#00F5FF' }}>{fmtBRL(c.cost)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── APONTAMENTOS ── */}
            {tab === 'timesheets' && (
              <div className="space-y-4">
                {tsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando apontamentos...</p>
                  </div>
                ) : timesheets.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Nenhum apontamento encontrado para este projeto.</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total de Registros', value: String(timesheets.length), color: 'var(--brand-text)' },
                        { label: 'Aprovados',          value: String(timesheets.filter(t => t.status === 'approved').length), color: '#22c55e' },
                        { label: 'Pendentes',          value: String(timesheets.filter(t => t.status === 'pending').length),  color: '#f59e0b' },
                      ].map(it => (
                        <div key={it.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                          <p className="text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                          <p className="text-xl font-bold" style={{ color: it.color }}>{it.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Timeline */}
                    <div className="relative">
                      <div className="absolute left-3 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                      <div className="space-y-1">
                        {timesheets.map((ts, i) => {
                          const sColor = tsStatusColor[ts.status] ?? '#94a3b8'
                          return (
                            <div key={ts.id} className="flex items-start gap-4 pl-1 pb-4">
                              <div className="relative z-10 w-5 h-5 shrink-0 rounded-full flex items-center justify-center mt-0.5"
                                style={{ background: `${sColor}18`, border: `1px solid ${sColor}` }}>
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: sColor }} />
                              </div>
                              <div className="flex-1 min-w-0 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
                                <div className="flex items-start justify-between gap-3 mb-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>{ts.user?.name ?? '—'}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${sColor}18`, color: sColor }}>{ts.status_display}</span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{fmtDate(ts.date)}</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: '#00F5FF' }}>{ts.effort_hours}h</p>
                                  </div>
                                </div>
                                {ts.observation && (
                                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--brand-muted)' }}>{ts.observation}</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── FINANCEIRO ── */}
            {tab === 'financial' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Valor do Projeto',       value: fmtBRL(p.project_value),                        color: '#00F5FF' },
                    { label: 'Valor Total (c/aportes)', value: fmtBRL(p.total_project_value ?? p.project_value), color: '#00F5FF' },
                    { label: 'Taxa / Hora',             value: fmtBRL(p.hourly_rate),                          color: 'var(--brand-text)' },
                  ].map(it => (
                    <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--brand-border)', background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Detalhes Financeiros</p>
                  </div>
                  <div className="divide-y px-4" style={{ borderColor: 'var(--brand-border)' }}>
                    <Row label="Valor do Projeto" value={<span style={{ color: '#00F5FF' }}>{fmtBRL(p.project_value)}</span>} />
                    {p.total_project_value != null && <Row label="Valor Total com Aportes" value={<span style={{ color: '#00F5FF' }}>{fmtBRL(p.total_project_value)}</span>} />}
                    <Row label="Valor da Hora" value={fmtBRL(p.hourly_rate)} />
                    {p.weighted_hourly_rate != null && <Row label="Taxa Média Ponderada" value={fmtBRL(p.weighted_hourly_rate)} />}
                    <Row label="Hora Adicional" value={fmtBRL(p.additional_hourly_rate)} />
                    <Row label="Custo Inicial" value={fmtBRL(p.initial_cost)} />
                    {p.save_erpserv != null && p.save_erpserv > 0 && <Row label="Save ERPSERV" value={<span style={{ color: '#22c55e' }}>{fmtBRL(p.save_erpserv)}</span>} />}
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--brand-border)', background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Horas Detalhadas</p>
                  </div>
                  <div className="divide-y px-4" style={{ borderColor: 'var(--brand-border)' }}>
                    {p.sold_hours != null && <Row label="Horas Contratadas" value={`${fmt(p.sold_hours, 1)}h`} />}
                    {p.initial_hours_balance != null && <Row label="Saldo Inicial" value={`${fmt(p.initial_hours_balance, 1)}h`} />}
                    {(p.hour_contribution ?? 0) > 0 && <Row label="Aporte Inicial de Horas" value={`${fmt(p.hour_contribution, 1)}h`} />}
                    {(p.total_contributions_hours ?? 0) > 0 && <Row label="Total Aportes" value={`${fmt(p.total_contributions_hours, 1)}h`} />}
                    {p.exceeded_hour_contribution != null && <Row label="Aporte Excedido" value={`${fmt(p.exceeded_hour_contribution, 1)}h`} />}
                    {p.consultant_hours != null && <Row label="Horas Consultores" value={`${fmt(p.consultant_hours, 1)}h`} />}
                    {p.coordinator_hours != null && <Row label="Horas Coordenadores" value={`${fmt(p.coordinator_hours, 1)}h`} />}
                    <Row label="Total Disponível" value={<span style={{ color: 'var(--brand-text)' }}>{fmt(totalAvail, 1)}h</span>} />
                    <Row label="Saldo Atual" value={<span style={{ color: (p.general_hours_balance ?? 0) < 0 ? '#ef4444' : '#22c55e' }}>{fmt(p.general_hours_balance, 1)}h</span>} />
                    <Row label="% Consumido" value={<span style={{ color: bar }}>{totalAvail > 0 ? `${Math.round(pct)}%` : '—'}</span>} />
                  </div>
                </div>
              </div>
            )}

            {tab === 'cost' && (
              <div className="space-y-5">
                {!costSummary ? (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado de custo disponível.</p>
                ) : (() => {
                  const { project_info: pi, hours_summary: hs, cost_calculation: cc, consultant_breakdown: cb } = costSummary
                  const marginColor = cc.margin_percentage >= 30 ? '#22c55e' : cc.margin_percentage >= 10 ? '#f59e0b' : '#ef4444'
                  const hoursUsedPct = Math.min(100, Math.max(0, hs.hours_percentage ?? 0))
                  const hoursBarColor = hoursUsedPct >= 90 ? '#ef4444' : hoursUsedPct >= 70 ? '#f59e0b' : '#22c55e'
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Valor do Projeto', value: fmtBRL(pi.project_value ?? 0),         icon: DollarSign, color: '#00F5FF' },
                          { label: 'Custo Total',       value: fmtBRL(cc.total_cost),                 icon: TrendingUp,  color: '#f59e0b' },
                          { label: 'Margem',            value: fmtBRL(cc.margin),                     icon: BarChart2,   color: marginColor },
                          { label: 'Margem %',          value: `${cc.margin_percentage.toFixed(1)}%`, icon: BarChart2,   color: marginColor },
                        ].map(c => (
                          <div key={c.label} className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                            <div className="flex items-center gap-2 mb-1"><c.icon size={12} style={{ color: c.color }} /><p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p></div>
                            <p className="text-sm font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Monitoramento de Horas</p>
                        <div className="grid grid-cols-3 gap-4 text-xs mb-3">
                          <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Disponíveis</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{(hs.total_available_hours ?? pi.total_available_hours ?? 0).toFixed(1)}h</p></div>
                          <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Apontadas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{hs.total_logged_hours.toFixed(1)}h</p></div>
                          <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Saldo</p><p className="font-bold tabular-nums mt-0.5" style={{ color: (hs.general_balance ?? hs.remaining_hours) < 0 ? '#ef4444' : 'var(--brand-text)' }}>{(hs.general_balance ?? hs.remaining_hours).toFixed(1)}h</p></div>
                          <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Aprovadas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: '#22c55e' }}>{hs.approved_hours.toFixed(1)}h</p></div>
                          <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Pendentes</p><p className="font-bold tabular-nums mt-0.5" style={{ color: '#f59e0b' }}>{hs.pending_hours.toFixed(1)}h</p></div>
                        </div>
                        <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--brand-border)' }}><div className="h-1.5 rounded-full transition-all" style={{ width: `${hoursUsedPct}%`, background: hoursBarColor }} /></div>
                        <p className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>{hoursUsedPct.toFixed(1)}% das horas utilizadas</p>
                      </div>
                      {cb.length > 0 && (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                          <div className="px-4 py-3" style={{ background: 'var(--brand-surface)' }}><p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--brand-subtle)' }}><UserCheck size={11} />Custo por Consultor</p></div>
                          <table className="w-full text-xs">
                            <thead><tr style={{ background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand-border)' }}>{['Consultor','Hs Total','Aprovadas','Pendentes','Taxa/h','Custo'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {cb.map((c, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-text)' }}>{c.total_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: '#22c55e' }}>{c.approved_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: '#f59e0b' }}>{c.pending_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums text-[11px]" style={{ color: 'var(--brand-muted)' }}>{c.consultant_hourly_rate != null ? fmtBRL(c.consultant_hourly_rate) : '—'}{c.consultant_rate_type === 'monthly' && <span className="ml-1 opacity-60">÷180</span>}</td>
                                  <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{fmtBRL(c.cost)}</td>
                                </tr>
                              ))}
                              <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid var(--brand-border)' }}>
                                <td className="px-3 py-2.5 font-bold text-[11px] uppercase" style={{ color: 'var(--brand-subtle)' }} colSpan={5}>Total</td>
                                <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: '#00F5FF' }}>{fmtBRL(cc.total_cost)}</td>
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
        <ProjectInlineEditModal
          project={p}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); reload() }}
        />
      )}
    </div>
  )
}

// ─── Edit inline modal ────────────────────────────────────────────────────────

interface ProjectEditForm {
  name: string; description: string; status: string; start_date: string
  expected_end_date: string
  sold_hours: string; project_value: string; hourly_rate: string
  additional_hourly_rate: string; initial_hours_balance: string
  allow_negative_balance: boolean
}

function ProjectInlineEditModal({ project, onClose, onSaved }: { project: ProjectFull; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ProjectEditForm>({
    name:                    project.name ?? '',
    description:             project.description ?? '',
    status:                  project.status ?? 'awaiting_start',
    start_date:              project.start_date?.slice(0, 10) ?? '',
    expected_end_date:       project.expected_end_date?.slice(0, 10) ?? '',
    sold_hours:              String(project.sold_hours ?? ''),
    project_value:           String(project.project_value ?? ''),
    hourly_rate:             String(project.hourly_rate ?? ''),
    additional_hourly_rate:  String(project.additional_hourly_rate ?? ''),
    initial_hours_balance:   String(project.initial_hours_balance ?? ''),
    allow_negative_balance:  false,
  })
  const [saving, setSaving] = useState(false)

  const setF = (key: keyof ProjectEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:        form.name.trim(),
        description: form.description || null,
        status:      form.status,
        start_date:         form.start_date || null,
        expected_end_date:  form.expected_end_date || null,
        allow_negative_balance: form.allow_negative_balance,
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[90vh]" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(0,245,255,0.25)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{project.code}</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>Editar Projeto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
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
              <div>
                <label style={labelStyle}>Valor do Projeto (R$)</label>
                <input type="number" value={form.project_value} onChange={setF('project_value')} style={inputStyle} placeholder="0.00" step="0.01" />
              </div>
              <div>
                <label style={labelStyle}>Valor da Hora (R$)</label>
                <input type="number" value={form.hourly_rate} onChange={setF('hourly_rate')} style={inputStyle} placeholder="0.00" step="0.01" />
              </div>
              <div>
                <label style={labelStyle}>Hora Adicional (R$)</label>
                <input type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} style={inputStyle} placeholder="0.00" step="0.01" />
              </div>
            </div>
          </div>

          {/* Horas */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Horas</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Horas Contratadas</label>
                <input type="number" value={form.sold_hours} onChange={setF('sold_hours')} style={inputStyle} placeholder="0" step="1" />
              </div>
              <div>
                <label style={labelStyle}>Saldo Inicial de Horas</label>
                <input type="number" value={form.initial_hours_balance} onChange={setF('initial_hours_balance')} style={inputStyle} placeholder="0" step="1" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, allow_negative_balance: !prev.allow_negative_balance }))}
                className="relative w-10 h-5 rounded-full transition-colors shrink-0"
                style={{ background: form.allow_negative_balance ? '#22c55e' : 'rgba(255,255,255,0.1)' }}
              >
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: form.allow_negative_balance ? 'translateX(20px)' : 'translateX(0)' }} />
              </button>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>Permitir Saldo Negativo</p>
                <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Permite que o projeto continue mesmo sem saldo de horas</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold transition-colors" style={{ background: saving ? 'rgba(0,245,255,0.05)' : 'rgba(0,245,255,0.1)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ProjectEditByIdModal ──────────────────────────────────────────────────────

function ProjectEditByIdModal({ projectId, onClose, onSaved }: { projectId: number; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<ProjectFull>(`/projects/${projectId}`)
      .then(setP)
      .catch(() => toast.error('Erro ao carregar projeto'))
      .finally(() => setLoading(false))
  }, [projectId])
  if (loading) return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
    </div>
  )
  if (!p) return null
  return <ProjectInlineEditModal project={p} onClose={onClose} onSaved={onSaved} />
}

// ─── ProjectStatusModal ────────────────────────────────────────────────────────

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

// ─── ProjectExpensesModal ──────────────────────────────────────────────────────

interface ProjExpense { id: number; description: string; amount: number; expense_date: string; status: string; status_display?: string; category?: { name: string }; user?: { name: string } }

function ProjectExpensesModal({ projectId, projectName, onClose }: { projectId: number; projectName: string; onClose: () => void }) {
  const [items, setItems] = useState<ProjExpense[]>([])
  const [loading, setLoading] = useState(true)
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => d.slice(0,10).split('-').reverse().join('/')
  const statusColor: Record<string,string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444' }

  useEffect(() => {
    api.get<any>(`/expenses?project_id=${projectId}&per_page=100`)
      .then(r => setItems(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []))
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setLoading(false))
  }, [projectId])

  const total = items.reduce((s, e) => s + e.amount, 0)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex flex-col w-full max-w-2xl rounded-2xl max-h-[85vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Despesas</p><h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{projectName}</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        {loading ? <div className="flex-1 flex items-center justify-center py-12"><p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p></div> : (
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-center text-sm py-12" style={{ color: 'var(--brand-subtle)' }}>Nenhuma despesa encontrada.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 p-5">
                  <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Total de Despesas</p>
                    <p className="text-lg font-bold" style={{ color: '#00F5FF' }}>{fmtBRL(total)}</p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Quantidade</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>{items.length}</p>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                    <table className="w-full text-xs">
                      <thead><tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--brand-border)' }}>
                        {['Data','Descrição','Categoria','Responsável','Valor','Status'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {items.map((e, i) => (
                          <tr key={e.id} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--brand-border)' : undefined }}>
                            <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtDate(e.expense_date)}</td>
                            <td className="px-3 py-2.5 max-w-[160px] truncate" style={{ color: 'var(--brand-text)' }}>{e.description}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--brand-muted)' }}>{e.category?.name ?? '—'}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--brand-muted)' }}>{e.user?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: '#00F5FF' }}>{fmtBRL(e.amount)}</td>
                            <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${statusColor[e.status] ?? '#94a3b8'}18`, color: statusColor[e.status] ?? '#94a3b8' }}>{e.status_display ?? e.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <div className="flex justify-end px-6 py-3 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── ProjectAportesModal ───────────────────────────────────────────────────────

interface HourContrib { id: number; contributed_hours: number; hourly_rate: number; contributed_at: string; description?: string | null; contributed_by_user?: { name: string }; total_value?: number }

function ProjectAportesModal({ projectId, projectName, onClose }: { projectId: number; projectName: string; onClose: () => void }) {
  const [items, setItems] = useState<HourContrib[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<HourContrib | null>(null)
  const [saving, setSaving] = useState(false)
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => d.slice(0,10).split('-').reverse().join('/')
  const inputS: React.CSSProperties = { background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', borderRadius: '0.5rem', padding: '0.45rem 0.65rem', fontSize: '0.75rem', color: 'var(--brand-text)', outline: 'none', width: '100%' }

  const load = () => {
    setLoading(true)
    api.get<any>(`/projects/${projectId}/hour-contributions`)
      .then(r => setItems((r?.items ?? r?.data ?? r ?? []).map((c: HourContrib) => ({ ...c, total_value: c.contributed_hours * c.hourly_rate }))))
      .catch(() => toast.error('Erro ao carregar aportes'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [projectId])

  const openAdd = () => { setEditing(null); setForm({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' }); setFormOpen(true) }
  const openEdit = (c: HourContrib) => { setEditing(c); setForm({ contributed_hours: String(c.contributed_hours), hourly_rate: String(c.hourly_rate), contributed_at: c.contributed_at.slice(0,10), description: c.description ?? '' }); setFormOpen(true) }

  const handleSave = async () => {
    if (!form.contributed_hours || !form.hourly_rate || !form.contributed_at) { toast.error('Preencha horas, valor/hora e data'); return }
    setSaving(true)
    try {
      const payload = { contributed_hours: Number(form.contributed_hours), hourly_rate: Number(form.hourly_rate), contributed_at: form.contributed_at, description: form.description || null }
      if (editing) await api.put(`/projects/${projectId}/hour-contributions/${editing.id}`, payload)
      else await api.post(`/projects/${projectId}/hour-contributions`, payload)
      toast.success(editing ? 'Aporte atualizado' : 'Aporte adicionado')
      setFormOpen(false); load()
    } catch { toast.error('Erro ao salvar aporte') }
    finally { setSaving(false) }
  }

  const handleDelete = async (c: HourContrib) => {
    if (!confirm('Excluir este aporte?')) return
    try { await api.delete(`/projects/${projectId}/hour-contributions/${c.id}`); toast.success('Aporte excluído'); load() }
    catch { toast.error('Erro ao excluir') }
  }

  const totalH = items.reduce((s, c) => s + c.contributed_hours, 0)
  const totalV = items.reduce((s, c) => s + (c.total_value ?? 0), 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex flex-col w-full max-w-2xl rounded-2xl max-h-[85vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Aportes de Horas</p><h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{projectName}</h3></div>
          <div className="flex items-center gap-2">
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.2)' }}><Plus size={11} /> Novo Aporte</button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
          </div>
        </div>

        {formOpen && (
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--brand-border)', background: 'rgba(0,0,0,0.15)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>{editing ? 'Editar Aporte' : 'Novo Aporte'}</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-[10px] mb-1" style={{ color: 'var(--brand-subtle)' }}>Horas *</label><input type="number" value={form.contributed_hours} onChange={e => setForm(f => ({...f, contributed_hours: e.target.value}))} style={inputS} placeholder="0" /></div>
              <div><label className="block text-[10px] mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor/Hora (R$) *</label><input type="number" value={form.hourly_rate} onChange={e => setForm(f => ({...f, hourly_rate: e.target.value}))} style={inputS} placeholder="0.00" step="0.01" /></div>
              <div><label className="block text-[10px] mb-1" style={{ color: 'var(--brand-subtle)' }}>Data *</label><input type="date" value={form.contributed_at} onChange={e => setForm(f => ({...f, contributed_at: e.target.value}))} style={inputS} /></div>
              <div><label className="block text-[10px] mb-1" style={{ color: 'var(--brand-subtle)' }}>Descrição</label><input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} style={inputS} placeholder="Motivo do aporte..." /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setFormOpen(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(0,245,255,0.1)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.25)', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        )}

        {loading ? <div className="flex-1 flex items-center justify-center py-10"><p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p></div> : (
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? <p className="text-center text-sm py-10" style={{ color: 'var(--brand-subtle)' }}>Nenhum aporte registrado.</p> : (
              <>
                <div className="grid grid-cols-2 gap-3 p-5">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}><p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Total Horas</p><p className="text-lg font-bold" style={{ color: '#a78bfa' }}>{totalH.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h</p></div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}><p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor Total</p><p className="text-lg font-bold" style={{ color: '#00F5FF' }}>{fmtBRL(totalV)}</p></div>
                </div>
                <div className="px-5 pb-5">
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                    <table className="w-full text-xs">
                      <thead><tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--brand-border)' }}>
                        {['Data','Horas','Valor/h','Total','Descrição',''].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {items.map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--brand-border)' : undefined }}>
                            <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtDate(c.contributed_at)}</td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: '#a78bfa' }}>{c.contributed_hours.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h</td>
                            <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtBRL(c.hourly_rate)}</td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: '#00F5FF' }}>{fmtBRL(c.total_value ?? 0)}</td>
                            <td className="px-3 py-2.5 max-w-[160px] truncate" style={{ color: 'var(--brand-muted)' }}>{c.description ?? '—'}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-white/5" title="Editar"><Pencil size={11} style={{ color: 'var(--brand-subtle)' }} /></button>
                                <button onClick={() => handleDelete(c)} className="p-1 rounded hover:bg-white/5" title="Excluir"><Trash2 size={11} style={{ color: '#ef4444' }} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <div className="flex justify-end px-6 py-3 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── ProjectTeamModal ──────────────────────────────────────────────────────────

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

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/projects/${projectId}`, { consultant_ids: Array.from(selectedIds) })
      toast.success('Equipe atualizada')
      onSaved()
    } catch { toast.error('Erro ao salvar equipe') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex flex-col w-full max-w-lg rounded-2xl max-h-[80vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div><p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Selecionar Equipe</p><h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{projectName}</h3></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        <div className="px-5 pt-4 shrink-0">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar consultor..."
            className="w-full text-sm px-3 py-2 rounded-xl outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
          />
          <p className="text-[10px] mt-2 mb-1" style={{ color: 'var(--brand-subtle)' }}>{selectedIds.size} consultor(es) selecionado(s)</p>
        </div>
        {loading ? <div className="flex-1 flex items-center justify-center py-10"><p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p></div> : (
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <div className="space-y-1 mt-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                  style={{ background: selectedIds.has(c.id) ? 'rgba(139,92,246,0.08)' : 'transparent', border: `1px solid ${selectedIds.has(c.id) ? 'rgba(139,92,246,0.3)' : 'transparent'}` }}
                >
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: selectedIds.has(c.id) ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                    {selectedIds.has(c.id) && <Check size={11} style={{ color: '#a78bfa' }} />}
                  </div>
                  <span className="text-sm" style={{ color: selectedIds.has(c.id) ? '#a78bfa' : 'var(--brand-text)' }}>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Equipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RequestDetailModal({ card, onClose }: { card: RequestCard; onClose: () => void }) {
  const [tab, setTab]               = useState<'details' | 'comments' | 'log'>('details')
  const [msgs, setMsgs]             = useState<ReqMsg[]>([])
  const [msgsLoaded, setMsgsLoaded] = useState(false)
  const [logs, setLogs]             = useState<KanbanLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [files, setFiles]           = useState<File[]>([])
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionStart, setMentionStart] = useState(-1)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tab === 'comments' && !msgsLoaded) {
      api.get<ReqMsg[]>(`/contract-requests/${card.id}/messages`)
        .then(r => { setMsgs(Array.isArray(r) ? r : []); setMsgsLoaded(true) })
        .catch(() => toast.error('Erro ao carregar comentários'))
      api.get<MentionUser[]>(`/contract-requests/${card.id}/mentionable-users`)
        .then(r => setMentionUsers(Array.isArray(r) ? r : []))
        .catch(() => {})
    }
    if (tab === 'log' && !logsLoaded) {
      setLogsLoading(true)
      api.get<KanbanLogEntry[]>(`/contract-requests/${card.id}/kanban-logs`)
        .then(r => { setLogs(Array.isArray(r) ? r : []); setLogsLoaded(true) })
        .catch(() => {})
        .finally(() => setLogsLoading(false))
    }
  }, [tab, card.id, msgsLoaded, logsLoaded])

  useEffect(() => {
    if (tab === 'comments') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, tab])

  const handleInputChange = (val: string) => {
    setInput(val)
    const cursor = textareaRef.current?.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const match  = before.match(/@(\w*)$/)
    if (match) {
      setMentionStart(cursor - match[0].length)
      setMentionQuery(match[1].toLowerCase())
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (user: MentionUser) => {
    const before = input.slice(0, mentionStart)
    const after  = input.slice(textareaRef.current?.selectionStart ?? input.length)
    const next   = `${before}@${user.name} ${after}`
    setInput(next)
    setShowMentions(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const filteredMentions = mentionUsers.filter(u =>
    u.name.toLowerCase().includes(mentionQuery)
  )

  const handleSend = async () => {
    const text = input.trim()
    if ((!text && files.length === 0) || sending) return
    setSending(true)
    try {
      const token = localStorage.getItem('minutor_token') ?? ''
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://minutor-backend.onrender.com/api/v1'
      const fd = new FormData()
      fd.append('message', text)
      files.forEach(f => fd.append('files[]', f))
      const res = await fetch(`${baseUrl}/contract-requests/${card.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) throw new Error()
      const msg: ReqMsg = await res.json()
      setMsgs(prev => [...prev, msg])
      setInput('')
      setFiles([])
    } catch { toast.error('Erro ao enviar comentário') }
    finally { setSending(false) }
  }

  const downloadAttachment = async (msgId: number, att: ReqAttachment) => {
    try {
      const token = localStorage.getItem('minutor_token') ?? ''
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://minutor-backend.onrender.com/api/v1'
      const res = await fetch(`${baseUrl}/req-messages/${msgId}/attachments/${att.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = att.original_name; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao baixar arquivo') }
  }

  const tipoLabel = card.tipo_necessidade === 'outro' && card.tipo_necessidade_outro
    ? card.tipo_necessidade_outro
    : (TIPO_NECESSIDADE_LABEL[card.tipo_necessidade] ?? card.tipo_necessidade)
  const urgColor = URGENCIA_COLOR[card.nivel_urgencia] ?? '#64748b'
  const statusMap: Record<string, string> = { pendente: 'Pendente', em_analise: 'Em Análise', aprovado: 'Aprovado', recusado: 'Recusado' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(139,92,246,0.35)', maxHeight: '85vh' }}>
        {/* Header */}
        <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{card.customer_name}</p>
              <p className="text-sm" style={{ color: '#a78bfa' }}>{card.area_requisitante}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                Requisição
              </span>
              <button onClick={onClose} className="p-1 rounded-lg transition-colors hover:bg-white/10" style={{ color: 'var(--brand-subtle)' }}>
                <X size={16} />
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            <button onClick={() => setTab('details')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={tab === 'details'
                ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                : { color: 'var(--brand-subtle)', border: '1px solid transparent' }}>
              <ExternalLink size={11} /> Detalhes
            </button>
            <button onClick={() => setTab('comments')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={tab === 'comments'
                ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                : { color: 'var(--brand-subtle)', border: '1px solid transparent' }}>
              <MessageSquare size={11} /> Comentários {msgs.length > 0 && `(${msgs.length})`}
            </button>
            <button onClick={() => setTab('log')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={tab === 'log'
                ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                : { color: 'var(--brand-subtle)', border: '1px solid transparent' }}>
              <Clock size={11} /> Histórico
            </button>
          </div>
        </div>

        {/* Body */}
        {tab === 'log' ? (
          <div className="flex-1 overflow-y-auto">
            <KanbanLogTab logs={logs} loading={logsLoading} />
          </div>
        ) : tab === 'details' ? (
          <>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Grid de campos curtos */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ...(card.project_name ? [['Nome do Projeto', card.project_name]] : []),
                  ['Área Requisitante', card.area_requisitante],
                  ['Tipo de Necessidade', tipoLabel],
                  ['Urgência', URGENCIA_LABEL[card.nivel_urgencia] ?? card.nivel_urgencia],
                  ['Status', statusMap[card.status] ?? card.status],
                  ['Data', new Date(card.created_at).toLocaleDateString('pt-BR')],
                  ...(card.product_owner ? [['Product Owner', card.product_owner]] : []),
                  ...(card.modulo_tecnologia ? [['Módulo / Tecnologia', card.modulo_tecnologia]] : []),
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                    <p className="text-sm" style={{ color: label === 'Urgência' ? urgColor : 'var(--brand-text)' }}>{value || '—'}</p>
                  </div>
                ))}
              </div>

              {/* Campos de texto longo */}
              {card.descricao && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Descrição</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{card.descricao}</p>
                </div>
              )}
              {card.cenario_atual && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Cenário Atual</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{card.cenario_atual}</p>
                </div>
              )}
              {card.cenario_desejado && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Cenário Desejado</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{card.cenario_desejado}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t shrink-0" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Back button */}
            <div className="px-4 pt-3 shrink-0">
              <button onClick={() => setTab('details')}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: 'var(--brand-subtle)' }}>
                <ChevronRight size={12} className="rotate-180" /> Voltar aos detalhes
              </button>
            </div>
            {/* Feed */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {!msgsLoaded && (
                <p className="text-center text-xs py-8" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
              )}
              {msgsLoaded && msgs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-1">
                  <MessageSquare size={24} style={{ color: 'var(--brand-subtle)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum comentário ainda</p>
                </div>
              )}
              {msgs.map(msg => (
                <div key={msg.id} className="flex gap-2.5 items-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                    {(msg.author?.name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-semibold" style={{ color: '#FAFAFA' }}>{msg.author?.name ?? 'Usuário'}</span>
                      <span className="text-[10px]" style={{ color: 'var(--brand-muted)' }}>
                        {new Date(msg.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed break-words" style={{ color: '#D4D4D8' }}>{msg.message}</p>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {msg.attachments.map(att => (
                          <div key={att.id} className="flex items-center gap-0 rounded-lg overflow-hidden text-[11px]"
                            style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.06)' }}>
                            <span className="flex items-center gap-1 px-2 py-1.5" style={{ color: '#a78bfa' }}>
                              <Paperclip size={9} />
                              <span className="max-w-[150px] truncate">{att.original_name}</span>
                            </span>
                            <button
                              onClick={async () => {
                                try {
                                  const token = localStorage.getItem('minutor_token') ?? ''
                                  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://minutor-backend.onrender.com/api/v1'
                                  const res = await fetch(`${baseUrl}/req-messages/${msg.id}/attachments/${att.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
                                  if (!res.ok) throw new Error()
                                  const blob = await res.blob()
                                  window.open(URL.createObjectURL(blob), '_blank')
                                } catch { toast.error('Erro ao abrir arquivo') }
                              }}
                              className="px-2 py-1.5 border-l transition-colors hover:bg-white/5"
                              style={{ borderColor: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}
                              title="Visualizar"
                            ><ExternalLink size={10} /></button>
                            <button
                              onClick={() => downloadAttachment(msg.id, att)}
                              className="px-2 py-1.5 border-l transition-colors hover:bg-white/5"
                              style={{ borderColor: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}
                              title="Baixar"
                            ><Download size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {/* Input */}
            <div className="px-4 pb-4 pt-2 border-t shrink-0" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
              {/* File chips */}
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                      {f.name}
                      <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
              {/* Mention dropdown */}
              <div className="relative">
                {showMentions && filteredMentions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg overflow-hidden shadow-lg z-10"
                    style={{ background: 'var(--brand-bg)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    {filteredMentions.map(u => (
                      <button key={u.id} onClick={() => insertMention(u)}
                        className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-opacity"
                        style={{ color: '#FAFAFA' }}>
                        <span className="text-[#a78bfa] font-semibold">@</span>{u.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setShowMentions(false); return }
                      if (e.key === 'Enter' && !e.shiftKey && !showMentions) { e.preventDefault(); handleSend() }
                    }}
                    placeholder="Escreva um comentário... Use @ para mencionar"
                    rows={2}
                    className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.25)', color: '#FAFAFA' }}
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center w-9 h-9 rounded-lg transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.2)', color: 'var(--brand-subtle)' }}
                      title="Anexar arquivo">
                      <Paperclip size={14} />
                    </button>
                    <button onClick={handleSend} disabled={(!input.trim() && files.length === 0) || sending}
                      className="flex items-center justify-center w-9 h-9 rounded-lg transition-all disabled:opacity-40"
                      style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)' }}>
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const picked = Array.from(e.target.files ?? [])
                  setFiles(prev => [...prev, ...picked].slice(0, 10))
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Column Component ─────────────────────────────────────────────────────────

function KanbanColumn({
  col, contractCards, projectCards, requestCards = [], canDrag, canDrop, isCliente, unreadContractIds, newProjectIds, newContractIds,
  onContractClick, onProjectClick, onRequestClick, onRequestView, onProjectAction, onContractAction,
  onContractMove, onProjectMove, getContractCols, getProjectCols,
}: {
  col: Column
  contractCards: ContractCard[]
  projectCards: ProjectCard[]
  requestCards?: RequestCard[]
  canDrag: boolean
  canDrop: boolean
  isCliente?: boolean
  unreadContractIds?: number[]
  newProjectIds?: Set<number>
  newContractIds?: Set<number>
  onContractClick: (card: ContractCard) => void
  onProjectClick: (card: ProjectCard) => void
  onRequestClick?: (card: RequestCard) => void
  onRequestView?: (card: RequestCard) => void
  onProjectAction?: (card: ProjectCard, action: string) => void
  onContractAction?: (card: ContractCard, action: string) => void
  onContractMove?: (card: ContractCard, toCol: string) => void
  onProjectMove?: (card: ProjectCard, toCol: string) => void
  getContractCols?: (card: ContractCard, fromCol: string) => { id: string; label: string }[]
  getProjectCols?: (card: ProjectCard, fromCol: string) => { id: string; label: string }[]
}) {
  const isTransition  = col.phase === 'transition'
  const isProject     = col.phase === 'project'
  const isClientCol   = !!col.clientVisible
  const totalCards    = contractCards.length + projectCards.length + requestCards.length

  const projectColor = isProject && col.color ? col.color : null

  const borderColor = isTransition
    ? 'rgba(234,179,8,0.25)'
    : projectColor
    ? `${projectColor}40`
    : isProject
    ? 'rgba(99,102,241,0.25)'
    : isClientCol
    ? 'rgba(20,184,166,0.35)'
    : 'var(--brand-border)'

  const headerColor = isTransition
    ? '#eab308'
    : projectColor
    ? projectColor
    : isProject
    ? '#818cf8'
    : isClientCol
    ? '#2dd4bf'
    : 'var(--brand-text)'

  const bg = isTransition
    ? 'rgba(234,179,8,0.02)'
    : projectColor
    ? `${projectColor}08`
    : isProject
    ? 'rgba(99,102,241,0.02)'
    : isClientCol
    ? 'rgba(20,184,166,0.04)'
    : 'rgba(255,255,255,0.02)'

  return (
    <div
      className="flex flex-col rounded-2xl shrink-0"
      style={{ width: 264, background: bg, border: `1px solid ${borderColor}` }}
    >
      <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isTransition && <Rocket size={13} style={{ color: '#eab308' }} />}
            {isProject && <FolderKanban size={13} style={{ color: '#818cf8' }} />}
            {isClientCol && !isTransition && !isProject && <Layers size={13} style={{ color: '#2dd4bf' }} />}
            {!isTransition && !isProject && !isClientCol && <Layers size={13} style={{ color: 'var(--brand-subtle)' }} />}
            <p className="text-sm font-semibold" style={{ color: headerColor }}>{col.label}</p>
            {isClientCol && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(20,184,166,0.15)', color: '#2dd4bf', border: '1px solid rgba(20,184,166,0.35)' }}>
                C
              </span>
            )}
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
            {totalCards}
          </span>
        </div>
        {isTransition && (
          <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>
            Aguardando geração de projeto
          </p>
        )}
        {isClientCol && (
          <p className="text-[10px] mt-1" style={{ color: 'rgba(45,212,191,0.6)' }}>
            Visível e interativa para o cliente
          </p>
        )}
      </div>

      <Droppable droppableId={col.id} isDropDisabled={!canDrop}>
        {(prov, snap) => (
          <div
            ref={prov.innerRef}
            {...prov.droppableProps}
            className="overflow-y-auto p-3 space-y-2.5 transition-colors"
            style={{
              minHeight: 80,
              maxHeight: 'calc(100vh - 220px)',
              background: snap.isDraggingOver
                ? isTransition ? 'rgba(234,179,8,0.05)' : isProject ? 'rgba(99,102,241,0.05)' : isClientCol ? 'rgba(20,184,166,0.06)' : 'rgba(255,255,255,0.03)'
                : 'transparent',
            }}
          >
            {/* Request cards com índices ANTES dos contratos */}
            {requestCards.map((card, idx) => (
              <Draggable key={`request-${card.id}`} draggableId={`request-${card.id}`} index={idx} isDragDisabled={!canDrag}>
                {(rProv, rSnap) => (
                  <div
                    ref={rProv.innerRef}
                    {...rProv.draggableProps}
                    {...rProv.dragHandleProps}
                    onClick={() => onRequestClick?.(card)}
                    style={{
                      ...rProv.draggableProps.style,
                      opacity: rSnap.isDragging ? 0.85 : 1,
                    }}
                  >
                    <RequestKanbanCard
                      card={card}
                      onView={onRequestView ? e => { e.stopPropagation(); onRequestView(card) } : undefined}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {requestCards.length > 0 && (contractCards.length > 0 || projectCards.length > 0) && (
              <div style={{ borderTop: '1px dashed rgba(139,92,246,0.2)' }} />
            )}
            {contractCards.map((card, idx) => {
              const fromCol = card.kanban_status === 'inicio_autorizado' ? 'inicio_autorizado' : (card.kanban_status ?? 'backlog')
              return (
                <ContractKanbanCard key={uniqueCardId(card)} card={card} index={requestCards.length + idx}
                  canDrag={canDrag}
                  isNew={!!(newContractIds?.has(card.id))}
                  onClick={() => onContractClick(card)}
                  onAction={onContractAction ? action => onContractAction(card, action) : undefined}
                  onMove={onContractMove ? toCol => onContractMove(card, toCol) : undefined}
                  availableColumns={getContractCols ? getContractCols(card, fromCol) : undefined}
                />
              )
            })}
            {projectCards.map((card, idx) => {
              const fromCol = projectColumnId(card)
              return (
                <ProjectKanbanCard key={uniqueCardId(card)} card={card} index={requestCards.length + contractCards.length + idx}
                  canDrag={canDrag}
                  isCliente={isCliente}
                  hasUnread={card.contract_id ? unreadContractIds?.includes(card.contract_id) : false}
                  isNew={!!(newProjectIds?.has(card.id))}
                  onClick={() => onProjectClick(card)}
                  onAction={action => onProjectAction?.(card, action)}
                  onMove={onProjectMove ? toCol => onProjectMove(card, toCol) : undefined}
                  availableColumns={getProjectCols ? getProjectCols(card, fromCol) : undefined}
                />
              )
            })}
            {prov.placeholder}
            {contractCards.length === 0 && projectCards.length === 0 && requestCards.length === 0 && !snap.isDraggingOver && (
              <p className="text-center text-xs py-6" style={{ color: 'var(--brand-subtle)' }}>Vazio</p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}

// ─── Phase Separator ──────────────────────────────────────────────────────────

function PhaseSeparator({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 gap-3" style={{ width: 36 }}>
      <div style={{ writingMode: 'vertical-rl', color: 'var(--brand-subtle)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', transform: 'rotate(180deg)' }}>
        {label}
      </div>
      <ChevronRight size={14} style={{ color: 'var(--brand-subtle)', opacity: 0.5 }} />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanContent() {
  const router = useRouter()
  const { user } = useAuth()

  const [demandCards,     setDemandCards]     = useState<ContractCard[]>([])
  const [transitionCards, setTransitionCards] = useState<ContractCard[]>([])
  const [projectCards,    setProjectCards]    = useState<ProjectCard[]>([])
  const [requestCards,    setRequestCards]    = useState<RequestCard[]>([])
  const [coordinators,    setCoordinators]    = useState<Coordinator[]>([])
  const [userRole,        setUserRole]        = useState<string>('admin')
  const [loading,         setLoading]         = useState(true)
  const [selectedRequest,      setSelectedRequest]      = useState<RequestCard | null>(null)
  const [planDecisionCard,     setPlanDecisionCard]     = useState<RequestCard | null>(null)
  const [contractCreateForReq, setContractCreateForReq] = useState<RequestCard | null>(null)
  const [subprojetoForReq, setSubprojetoForReq] = useState<{ card: RequestCard; projectId: number; subSeq: string } | null>(null)
  const [finalizeCard,         setFinalizeCard]         = useState<RequestCard | null>(null)

  const [selectedContract,      setSelectedContract]      = useState<ContractCard | null>(null)
  const [contractDecisionCard,  setContractDecisionCard]  = useState<ContractCard | null>(null)
  const [contractFilhoCard,     setContractFilhoCard]     = useState<ContractCard | null>(null)
  const [contractCreateForDecision, setContractCreateForDecision] = useState<ContractCard | null>(null)
  const [selectedProject,       setSelectedProject]       = useState<ProjectCard | null>(null)
  const [generateTarget,       setGenerateTarget]       = useState<ContractCard | null>(null)
  const [projectAction,    setProjectAction]    = useState<{ card: ProjectCard; action: string } | null>(null)
  const [viewMode,         setViewMode]         = useState<'kanban' | 'list'>('kanban')
  const [editContractData, setEditContractData] = useState<any | null>(null)
  const [showEditContract, setShowEditContract] = useState(false)
  const [contractAction,   setContractAction]   = useState<{ card: ContractCard; action: string } | null>(null)
  const [filterSearch,     setFilterSearch]     = useState('')
  const [filterCustomers,  setFilterCustomers]  = useState<string[]>([])
  const [filterExecutivos, setFilterExecutivos] = useState<string[]>([])
  const [listTab,          setListTab]          = useState<'contratos' | 'projetos' | 'requisicoes'>('projetos')
  const [unreadContractIds, setUnreadContractIds] = useState<number[]>([])
  const [seenProjectIds, setSeenProjectIds] = useState<Set<number>>(() => {
    try {
      const userId = JSON.parse(localStorage.getItem('minutor_user') ?? '{}').id
      return new Set(JSON.parse(localStorage.getItem(`minutor_seen_projects_${userId}`) ?? '[]'))
    } catch { return new Set() }
  })

  const isConsultor = userRole === 'consultor'
  const isCliente   = userRole === 'cliente'
  const isCoord     = userRole === 'coordenador'

  const markProjectSeen = (projectId: number) => {
    setSeenProjectIds(prev => {
      if (prev.has(projectId)) return prev
      const next = new Set(prev)
      next.add(projectId)
      try {
        const userId = JSON.parse(localStorage.getItem('minutor_user') ?? '{}').id
        localStorage.setItem(`minutor_seen_projects_${userId}`, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  const [seenContractIds, setSeenContractIds] = useState<Set<number>>(() => {
    try {
      const userId = JSON.parse(localStorage.getItem('minutor_user') ?? '{}').id
      const raw = localStorage.getItem(`minutor_seen_contracts_${userId}`) ?? '[]'
      return new Set(JSON.parse(raw))
    } catch { return new Set() }
  })

  const markContractSeen = (contractId: number) => {
    setSeenContractIds(prev => {
      if (prev.has(contractId)) return prev
      const next = new Set(prev)
      next.add(contractId)
      try {
        const userId = JSON.parse(localStorage.getItem('minutor_user') ?? '{}').id
        localStorage.setItem(`minutor_seen_contracts_${userId}`, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  useEffect(() => {
    if (projectCards.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const contractIdParam = params.get('chat_contract_id')
    if (!contractIdParam) return
    const contractId = Number(contractIdParam)
    const card = projectCards.find(p => p.contract_id === contractId)
    if (card) {
      setProjectAction({ card, action: 'chat' })
      const url = new URL(window.location.href)
      url.searchParams.delete('chat_contract_id')
      window.history.replaceState({}, '', url.toString())
    }
  }, [projectCards])

  const colIsClientVisible = (colId: string): boolean =>
    DEMAND_COLS.find(c => c.id === colId)?.clientVisible ?? false

  // Returns whether drag/drop is allowed for a given column id
  const colCanDrag = (colId: string): boolean => {
    if (isConsultor) return false
    if (isCliente) {
      const col = DEMAND_COLS.find(c => c.id === colId)
      return !!(col?.clientVisible)  // clients can only drag FROM clientVisible columns
    }
    return true
  }

  const colCanDrop = (colId: string): boolean => {
    if (isConsultor) return false
    if (isCliente) {
      const col = DEMAND_COLS.find(c => c.id === colId)
      return !!(col?.clientVisible || col?.clientCanDrop)
    }
    return true
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<KanbanResponse>('/contracts/kanban')
      setDemandCards(r.demand_cards ?? [])
      setTransitionCards(r.transition_cards ?? [])
      setProjectCards(r.project_cards ?? [])
      setRequestCards(r.request_cards ?? [])
      setCoordinators(r.coordinators ?? [])
      setUserRole(r.user_role ?? 'admin')
    } catch {
      toast.error('Erro ao carregar kanban')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const fetchUnread = () => {
      api.get<{ contract_ids: number[] }>('/contract-messages/unread-contracts')
        .then(r => setUnreadContractIds(r.contract_ids ?? []))
        .catch(() => {})
    }
    fetchUnread()
    const id = setInterval(fetchUnread, 60_000)
    return () => clearInterval(id)
  }, [])

  // Compute visible columns based on role
  const visibleDemandCols = (isConsultor || isCoord) ? [] : DEMAND_COLS

  const showTransition = !isConsultor && !isCoord
  const visibleProjectCols = PROJECT_COLS

  // IDs de contratos de sustentação — não exibidos em Demandas e Projetos
  const sustContractIds = new Set(
    [...demandCards, ...transitionCards]
      .filter(c => c.categoria === 'sustentacao')
      .map(c => c.id)
  )

  // IDs de contratos gerenciados por requisições — não exibir como card duplicado no pipeline
  const linkedContractIds = new Set(requestCards.map(r => r.linked_contract_id).filter(Boolean))

  // IDs de contratos kanban-born que ainda não chegaram à coluna de coordenador (alocado)
  // Projetos vinculados a esses contratos não devem aparecer no pipeline
  const kanbanBornNotAllocatedIds = new Set(
    [...demandCards, ...transitionCards]
      .filter(c => !linkedContractIds.has(c.id))
      .filter(c => c.kanban_status !== 'alocado')
      .map(c => c.id)
  )

  // IDs de contratos já em Início Autorizado — requisições novo_projeto vinculadas devem ser suprimidas
  // Suprime requisição novo_projeto quando o contrato já avançou (inicio_autorizado ou projeto gerado)
  const authorizedContractIds = new Set([
    ...transitionCards.map(c => c.id),
    ...demandCards.filter(c => c.project_id != null).map(c => c.id),
  ])

  // IDs de projetos novos para o coordenador (em Em Andamento, não vistos ainda) — badge e ordenação
  const newProjectIds = isCoord
    ? new Set(projectCards.filter(p => !seenProjectIds.has(p.id)).map(p => p.id))
    : undefined

  // IDs de contratos novos para o coordenador em Início Autorizado — badge de alerta
  const newContractIds = isCoord
    ? new Set(transitionCards.filter(c => c.kanban_status === 'inicio_autorizado' && !seenContractIds.has(c.id)).map(c => c.id))
    : undefined

  // Mapa contrato_id → project_id para suprimir requisições subprojeto cujo projeto já está ativo
  const contractToProjectId = new Map<number, number>([
    ...[...transitionCards, ...demandCards]
      .filter(c => c.project_id != null)
      .map(c => [c.id, c.project_id!] as [number, number]),
  ])

  // ── Filtros ──────────────────────────────────────────────────────────────
  const matchFilter = (customerName?: string | null, name?: string | null, description?: string | null): boolean => {
    const cn   = customerName ?? ''
    const nm   = name ?? ''
    const desc = description ?? ''
    if (filterCustomers.length > 0 && !filterCustomers.includes(cn)) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      return cn.toLowerCase().includes(q) || nm.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
    }
    return true
  }

  const allCustomers = [...new Set([
    ...demandCards.map(c => c.customer_name),
    ...transitionCards.map(c => c.customer_name),
    ...projectCards.map(p => p.customer_name),
    ...requestCards.map(r => r.customer_name ?? ''),
  ].filter(Boolean))].sort() as string[]

  const allExecutivos = [...new Set([
    ...demandCards.flatMap(c => c.kanban_coordinator ? [c.kanban_coordinator] : []),
    ...transitionCards.flatMap(c => c.kanban_coordinator ? [c.kanban_coordinator] : []),
    ...projectCards.flatMap(p => p.coordinators ?? []),
  ])].sort()

  const matchExecutivo = (coordinator?: string | null, coordinators?: string[]): boolean => {
    if (filterExecutivos.length === 0) return true
    const arr = coordinators ?? (coordinator ? [coordinator] : [])
    return arr.some(e => filterExecutivos.includes(e))
  }

  // IDs de projetos já visíveis em colunas de execução — evita duplicar contrato + projeto
  const visibleProjectIds = new Set(projectCards.map(p => p.id))

  // Cards by column
  const contractsInCol = (colId: string): ContractCard[] => {
    const base = colId === 'inicio_autorizado'
      ? transitionCards
          .filter(c => !c.project_id || !visibleProjectIds.has(c.project_id))
          .filter(c => linkedContractIds.has(c.id))
      : []
    return base
      .filter(c => c.categoria !== 'sustentacao')
      .filter(c => matchFilter(c.customer_name, c.project_name))
      .filter(c => matchExecutivo(c.kanban_coordinator))
      .sort((a, b) => a.kanban_order - b.kanban_order)
  }

  const isSustType = (st?: string | null) => /sustentac|cloud|bizify/i.test(st ?? '')

  const projectsInCol = (colId: string): ProjectCard[] =>
    projectCards
      .filter(p => projectColumnId(p) === colId)
      .filter(p => !p.contract_id || !sustContractIds.has(p.contract_id))
      .filter(p => !p.contract_id || !kanbanBornNotAllocatedIds.has(p.contract_id))
      .filter(p => !isCoord || !isSustType(p.service_type))
      .filter(p => matchFilter(p.customer_name, p.project_name))
      .filter(p => matchExecutivo(undefined, p.coordinators))
      .sort((a, b) => {
        if (newProjectIds && colId === 'em_andamento') {
          const aNew = newProjectIds.has(a.id) ? 0 : 1
          const bNew = newProjectIds.has(b.id) ? 0 : 1
          if (aNew !== bNew) return aNew - bNew
        }
        return 0
      })

  const handleContractMove = async (cardId: number, card: ContractCard, fromCol: string, toCol: string, order = 0) => {
    // Projeto já gerado não pode retornar para fases anteriores
    if (card.project_id && (DEMAND_COLS.find(c => c.id === toCol) || toCol === 'inicio_autorizado')) {
      toast.error('Este contrato já foi transformado em projeto e não pode retornar para fases anteriores.')
      return
    }

    if (toCol === 'req_inicio_autorizado') {
      setContractDecisionCard(card)
      return
    }

    if (toCol === 'inicio_autorizado') {
      if (!card.is_complete) {
        toast.error('Contrato incompleto — preencha todos os campos obrigatórios antes de autorizar.')
        return
      }
      setDemandCards(prev => prev.filter(c => c.id !== cardId))
      setTransitionCards(prev => [...prev, { ...card, kanban_status: 'inicio_autorizado', status: 'inicio_autorizado' }])
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: 'inicio_autorizado', order })
        toast.success('Contrato movido para Início Autorizado')
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao mover contrato')
        load()
      }
      return
    }

    if (DEMAND_COLS.find(c => c.id === toCol)) {
      const wasTransition = card.kanban_status === 'inicio_autorizado'
      setTransitionCards(prev => prev.filter(c => c.id !== cardId))
      setDemandCards(prev => [...prev.filter(c => c.id !== cardId), { ...card, kanban_status: toCol }])
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toCol, order })
        if (wasTransition) toast.success('Contrato retornado à fase de demanda')
        else toast.success('Card movido')
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao mover card')
        load()
      }
      return
    }

    setDemandCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, kanban_status: toCol, kanban_order: order } : c
    ))
    try {
      await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toCol, order })
      toast.success('Card movido')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao mover card')
      load()
    }
  }

  const handleRequestMove = async (cardId: number, reqCard: RequestCard, fromCol: string, toCol: string) => {
    if (reqCard.req_decision === 'novo_projeto') return
    if (toCol === 'req_inicio_autorizado') {
      setPlanDecisionCard(reqCard)
      return
    }

    if (fromCol === 'inicio_autorizado' && PROJECT_COL_TO_STATUS[toCol]) {
      setFinalizeCard(reqCard)
      return
    }

    setRequestCards(prev => prev.map(r => r.id === cardId ? { ...r, kanban_column: toCol } : r))
    try {
      await api.patch(`/contract-requests/${cardId}/kanban-move`, { kanban_column: toCol })
    } catch {
      load()
    }
  }

  const handleProjectMove = async (cardId: number, toCol: string) => {
    const newStatus = PROJECT_COL_TO_STATUS[toCol]
    if (!newStatus) return
    setProjectCards(prev => prev.map(p => p.id === cardId ? { ...p, status: newStatus } : p))
    try {
      await api.patch(`/projects/${cardId}/kanban-move`, { status: newStatus })
      toast.success('Projeto atualizado')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao mover projeto')
      load()
    }
  }

  const getAvailableContractCols = (card: ContractCard, fromCol: string): { id: string; label: string }[] => {
    // Contratos vindos de requisição só podem ser movidos pelo Kanban de Contratos
    if (card.kanban_status === 'novo_projeto') return []

    // Projeto já gerado: sem opção de retorno a fases anteriores
    if (card.project_id) return []

    if (isConsultor) return []

    if (isCliente) {
      return DEMAND_COLS
        .filter(c => (c.clientVisible || c.clientCanDrop) && c.id !== fromCol)
        .map(c => ({ id: c.id, label: c.label }))
    }

    const demandOptions = DEMAND_COLS
      .filter(c => c.id !== fromCol)
      .map(c => ({ id: c.id, label: c.label }))

    const cols = [...demandOptions]

    if (fromCol !== 'inicio_autorizado' && card.is_complete && !cols.find(c => c.id === 'inicio_autorizado')) {
      cols.push({ id: 'inicio_autorizado', label: 'Início Autorizado' })
    }

    return cols.filter(c => c.id !== fromCol)
  }

  const getAvailableProjectCols = (_card: ProjectCard, fromCol: string): { id: string; label: string }[] => {
    if (isConsultor || isCliente) return []
    return PROJECT_COLS
      .filter(c => c.id !== fromCol)
      .map(c => ({ id: c.id, label: c.label }))
  }

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const toCol   = destination.droppableId
    const fromCol = source.droppableId

    if (isCliente) {
      const srcCol = DEMAND_COLS.find(c => c.id === fromCol)
      const dstCol = DEMAND_COLS.find(c => c.id === toCol)
      if (!srcCol?.clientVisible) return  // bloqueia drag de colunas não interativas
      if (!dstCol?.clientVisible && !dstCol?.clientCanDrop) return
    }

    const [cardType, rawId] = draggableId.split('-')
    const cardId = Number(rawId)

    if (cardType === 'contract') {
      const card = [...demandCards, ...transitionCards].find(c => c.id === cardId)
      if (!card) return
      if (card.kanban_status === 'novo_projeto') return
      if (card.project_id && (DEMAND_COLS.find(c => c.id === toCol) || toCol === 'inicio_autorizado')) {
        toast.error('Este contrato já foi transformado em projeto e não pode retornar para fases anteriores.')
        return
      }
      await handleContractMove(cardId, card, fromCol, toCol, destination.index)
      return
    }

    if (cardType === 'request') {
      const reqCard = requestCards.find(r => r.id === cardId)
      if (!reqCard) return
      if (reqCard.req_decision === 'novo_projeto') return
      await handleRequestMove(cardId, reqCard, fromCol, toCol)
      return
    }

    if (cardType === 'project') {
      await handleProjectMove(cardId, toCol)
    }
  }

  const handleGenerate = async (contractId: number, coordinatorId: number | null) => {
    try {
      await api.patch(`/contracts/${contractId}/kanban-move`, {
        to_column:      coordinatorId ? `coordinator:${coordinatorId}` : 'alocado',
        coordinator_id: coordinatorId,
        order:          0,
      })
      toast.success('🚀 Projeto gerado automaticamente!')
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao gerar projeto')
    }
  }

  const totalColumns = visibleDemandCols.length + (showTransition ? 1 : 0) + visibleProjectCols.length
  const boardMinWidth = totalColumns * 264 + (totalColumns - 1) * 12 + (showTransition ? 60 : 0) + 64

  if (loading) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center h-full">
          <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Demandas e Projetos</h1>
            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
              {isConsultor ? 'Seus projetos em execução' : 'Gerencie o fluxo completo de contratos e projetos'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isConsultor && (
              <button onClick={() => router.push('/portal-cliente/nova-requisicao')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: '#00F5FF' }}>
                <Plus size={13} /> Nova Requisição
              </button>
            )}
            <button onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
              {viewMode === 'kanban' ? <><List size={13} /> Lista de Projetos</> : <><FolderKanban size={13} /> Kanban</>}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 px-6 py-2 shrink-0 border-b text-[11px]" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
          {!isConsultor && !isCoord && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded" style={{ background: 'var(--brand-border)' }}><Layers size={8} /></span>
                Fase Demanda
              </span>
              <span className="flex items-center gap-1.5">
                <Rocket size={11} style={{ color: '#eab308' }} />
                Início Autorizado
              </span>
            </>
          )}
          <span className="flex items-center gap-1.5">
            <FolderKanban size={11} style={{ color: '#818cf8' }} />
            Projetos em Execução
          </span>
          {isConsultor && <span className="ml-auto opacity-50">Visualização somente leitura</span>}
          {isCliente && <span className="ml-auto opacity-50">Pode mover somente nas colunas marcadas [C]</span>}
          {!isConsultor && !isCliente && <span className="ml-auto opacity-50">Arraste para mover entre colunas</span>}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-6 py-2 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--brand-subtle)' }} />
            <input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Buscar nome ou descrição..."
              className="pl-7 pr-7 py-1.5 rounded-lg text-xs outline-none w-56"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            />
            {filterSearch && (
              <button onClick={() => setFilterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={10} style={{ color: 'var(--brand-subtle)' }} />
              </button>
            )}
          </div>
          {!isCliente && allCustomers.length > 0 && (
            <MultiSelect
              value={filterCustomers}
              onChange={setFilterCustomers}
              options={allCustomers.map(n => ({ id: n, name: n }))}
              placeholder="Todos os clientes"
              wide
            />
          )}
          {!isCliente && allExecutivos.length > 0 && (
            <MultiSelect
              value={filterExecutivos}
              onChange={setFilterExecutivos}
              options={allExecutivos.map(n => ({ id: n, name: n }))}
              placeholder="Todos os executivos"
              wide
            />
          )}
          {(filterSearch || filterCustomers.length > 0 || filterExecutivos.length > 0) && (
            <button onClick={() => { setFilterSearch(''); setFilterCustomers([]); setFilterExecutivos([]) }}
              className="text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--brand-subtle)' }}>
              Limpar
            </button>
          )}
        </div>

        {/* List View */}
        {viewMode === 'list' && (() => {
          const colLabel = (card: ContractCard) => {
            const col = [...DEMAND_COLS, TRANSITION_COL].find(c => c.id === contractColumnId(card))
            return col?.label ?? card.kanban_status ?? '—'
          }
          const sq = filterSearch.trim().toLowerCase()
          const listProjectIds = new Set(projectCards.map(p => p.id))
          const seenContractIds = new Set<number>()
          const allContracts = [...demandCards, ...transitionCards]
            .filter(c => {
              if (seenContractIds.has(c.id)) return false
              seenContractIds.add(c.id)
              return true
            })
            .filter(c => !c.project_id || !listProjectIds.has(c.project_id))
            .filter(c => c.categoria !== 'sustentacao' && !/sustenta/i.test(c.service_type ?? ''))
            .filter(c => {
              if (filterCustomers.length > 0 && !filterCustomers.includes(c.customer_name)) return false
              if (sq && !c.customer_name.toLowerCase().includes(sq) && !(c.project_name ?? '').toLowerCase().includes(sq)) return false
              if (filterExecutivos.length > 0) {
                const coord = c.kanban_coordinator ? [c.kanban_coordinator] : []
                if (!coord.some(e => filterExecutivos.includes(e))) return false
              }
              return true
            })
          const allProjects = projectCards
            .filter(p => !isCoord || !isSustType(p.service_type))
            .filter(p => {
              if (filterCustomers.length > 0 && !filterCustomers.includes(p.customer_name)) return false
              if (sq && !p.customer_name.toLowerCase().includes(sq) && !(p.project_name ?? '').toLowerCase().includes(sq)) return false
              if (filterExecutivos.length > 0 && !(p.coordinators ?? []).some(e => filterExecutivos.includes(e))) return false
              return true
            })
          const allRequests = requestCards
            .filter(r => {
              if (filterCustomers.length > 0 && !filterCustomers.includes(r.customer_name ?? '')) return false
              if (sq && !(r.customer_name ?? '').toLowerCase().includes(sq) && !(r.project_name ?? '').toLowerCase().includes(sq)) return false
              return true
            })

          const TABS: { id: typeof listTab; label: string; count: number }[] = [
            { id: 'projetos',     label: 'Projetos',     count: allProjects.length },
            ...(!isCliente ? [{ id: 'contratos' as const,   label: 'Contratos',    count: allContracts.length }] : []),
            { id: 'requisicoes',  label: 'Requisições',  count: allRequests.length },
          ]

          return (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setListTab(tab.id)}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={listTab === tab.id
                      ? { background: 'rgba(0,245,255,0.1)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }
                      : { color: 'var(--brand-muted)', border: '1px solid transparent' }
                    }
                  >
                    {tab.label}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={listTab === tab.id
                        ? { background: 'rgba(0,245,255,0.15)', color: 'var(--brand-primary)' }
                        : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }
                      }>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tab: Projetos */}
              {listTab === 'projetos' && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Cliente</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Projeto</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo Contrato</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo Serviço</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Fase</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Horas</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">HS Consumidas</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Saldo</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                        {!isCliente && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {allProjects.length === 0 && (
                        <tr><td colSpan={isCliente ? 7 : 8} className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhum projeto.</td></tr>
                      )}
                      {allProjects.map(p => {
                        const isClosed  = p.status === 'finished' || p.status === 'cancelled'
                        const hideHours = isCliente && isClosed
                        return (
                          <tr key={`p-${p.id}`} onClick={() => setSelectedProject(p)} className="cursor-pointer hover:bg-zinc-800/40 transition-colors group/row"
                            style={{ borderTop: '1px solid var(--brand-border)' }}>
                            <td className="px-4 py-3 text-white font-medium">{p.customer_name}</td>
                            <td className="px-4 py-3 text-zinc-300 text-xs">
                              <p className="text-zinc-300 text-sm">{p.project_name}</p>
                              <span className="font-mono text-cyan-400">{p.code}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-400 text-xs">{p.contract_type ?? '—'}</td>
                            <td className="px-4 py-3 text-zinc-400 text-xs">{p.service_type ?? '—'}</td>
                            <td className="px-4 py-3 text-zinc-400 text-xs">{PROJECT_COLS.find(c => c.id === PROJECT_STATUS_TO_COL[p.status])?.label ?? 'Projeto'}</td>
                            <td className="px-4 py-3 text-center text-zinc-300">{p.sold_hours != null ? `${p.sold_hours}h` : '—'}</td>
                            <td className="px-4 py-3 text-center text-zinc-300">
                              {hideHours ? '—' : p.consumed_hours != null ? `${p.consumed_hours.toFixed(1)}h` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center"
                              style={{ color: !hideHours && (p.general_hours_balance ?? 0) < 0 ? '#ef4444' : 'rgb(212 212 216)' }}>
                              {hideHours ? '—' : p.general_hours_balance != null ? `${p.general_hours_balance.toFixed(1)}h` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(() => { const b = STATUS_BADGE[p.status] ?? { label: p.status, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }; return (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: b.bg, color: b.color }}>{b.label}</span>
                              )})()}
                            </td>
                            {!isCliente && (
                              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                <ListProjectActionMenu onAction={action => setProjectAction({ card: p, action })} />
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab: Contratos */}
              {listTab === 'contratos' && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Cliente</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Projeto / Tipo</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo Contrato</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo Serviço</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Coluna</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Horas</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                        {!isCliente && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {allContracts.length === 0 && (
                        <tr><td colSpan={isCliente ? 5 : 6} className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhum contrato.</td></tr>
                      )}
                      {allContracts.map(c => (
                        <tr key={`c-${c.id}`} onClick={() => setSelectedContract(c)} className="cursor-pointer hover:bg-zinc-800/40 transition-colors group/row"
                          style={{ borderTop: '1px solid var(--brand-border)' }}>
                          <td className="px-4 py-3 text-white font-medium">{c.customer_name}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {c.project_name && <p className="text-zinc-300 text-sm">{c.project_name}</p>}
                            <span>{c.contract_type ?? '—'}</span>
                            {c.tipo_faturamento && <span className="ml-1 text-zinc-500">· {c.tipo_faturamento}</span>}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">{c.contract_type ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">{c.service_type ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">{colLabel(c)}</td>
                          <td className="px-4 py-3 text-center text-zinc-300">{c.horas_contratadas != null ? `${c.horas_contratadas}h` : '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {(() => { const b = STATUS_BADGE[c.kanban_status ?? c.status ?? ''] ?? STATUS_BADGE['backlog']; return (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: b.bg, color: b.color }}>{b.label}</span>
                            )})()}
                          </td>
                          {!isCliente && (
                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                              <ListActionMenu card={c} onAction={action => setContractAction({ card: c, action })} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab: Requisições */}
              {listTab === 'requisicoes' && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Cliente</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Projeto / Área</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Urgência</th>
                        <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRequests.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhuma requisição.</td></tr>
                      )}
                      {allRequests.map(r => (
                        <tr key={`r-${r.id}`}
                          onClick={() => r.kanban_column === 'req_inicio_autorizado' && !r.req_decision ? setPlanDecisionCard(r) : setSelectedRequest(r)}
                          className="cursor-pointer hover:bg-zinc-800/40 transition-colors"
                          style={{ borderTop: '1px solid var(--brand-border)' }}>
                          <td className="px-4 py-3 text-white font-medium">{r.customer_name}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {r.project_name && <p className="text-zinc-300 text-sm">{r.project_name}</p>}
                            <span>{r.area_requisitante}</span>
                            {r.product_owner && <span className="ml-1 text-zinc-500">· {r.product_owner}</span>}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {TIPO_NECESSIDADE_LABEL[r.tipo_necessidade] ?? r.tipo_necessidade}
                            {r.tipo_necessidade === 'outro' && r.tipo_necessidade_outro && (
                              <span className="ml-1 text-zinc-500">({r.tipo_necessidade_outro})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: `${URGENCIA_COLOR[r.nivel_urgencia]}1a`, color: URGENCIA_COLOR[r.nivel_urgencia] ?? '#94a3b8' }}>
                              {URGENCIA_LABEL[r.nivel_urgencia] ?? r.nivel_urgencia}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {(() => { const b = STATUS_BADGE[r.kanban_column ?? ''] ?? { label: r.kanban_column ?? '—', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }; return (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: b.bg, color: b.color }}>{b.label}</span>
                            )})()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}

        {/* Board */}
        {viewMode === 'kanban' && <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-3 p-4 h-full items-start" style={{ minWidth: `${boardMinWidth}px` }}>

              {/* ── Demand Phase ── */}
              {visibleDemandCols.map(col => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  contractCards={REQ_ONLY_COLS.has(col.id) ? [] : contractsInCol(col.id)}
                  projectCards={[]}
                  requestCards={requestCards.filter(r => {
                    if ((r.kanban_column ?? 'backlog') !== col.id) return false
                    if (r.req_decision === 'novo_projeto' && r.linked_contract_id && authorizedContractIds.has(r.linked_contract_id)) return false
                    if (r.linked_contract_id && sustContractIds.has(r.linked_contract_id)) return false
                    return matchFilter(r.customer_name ?? '', r.project_name ?? '', r.descricao ?? '')
                  })}
                  canDrag={colCanDrag(col.id)}
                  canDrop={colCanDrop(col.id)}
                  isCliente={isCliente}
                  unreadContractIds={unreadContractIds}
                  onContractClick={setSelectedContract}
                  onContractAction={(card, action) => setContractAction({ card, action })}
                  onProjectClick={setSelectedProject}
                  onProjectAction={(card, action) => setProjectAction({ card, action })}
                  onRequestClick={card =>
                    card.kanban_column === 'req_inicio_autorizado' && !card.req_decision
                      ? setPlanDecisionCard(card)
                      : setSelectedRequest(card)
                  }
                  onRequestView={setSelectedRequest}
                  onContractMove={(card, toCol) => handleContractMove(card.id, card, card.kanban_status ?? 'backlog', toCol)}
                  getContractCols={getAvailableContractCols}
                />
              ))}

              {/* ── Transition Phase ── */}
              {showTransition && (
                <>
                  <PhaseSeparator label="Autorização" icon={<ChevronRight />} />
                  <KanbanColumn
                    col={TRANSITION_COL}
                    contractCards={contractsInCol('inicio_autorizado')}
                    projectCards={[]}
                    requestCards={requestCards.filter(r => {
                      if (r.kanban_column !== 'inicio_autorizado') return false
                      // Suprime o card de requisição apenas quando existe um card de contrato substituindo-o
                      if (r.req_decision === 'novo_projeto' && r.linked_contract_id && transitionCards.some(c => c.id === r.linked_contract_id)) return false
                      if (r.linked_contract_id && sustContractIds.has(r.linked_contract_id)) return false
                      // Suprime subprojeto quando o projeto vinculado já está ativo nas colunas de execução
                      if (r.req_decision === 'subprojeto' && r.linked_contract_id) {
                        const projId = contractToProjectId.get(r.linked_contract_id)
                        if (projId && visibleProjectIds.has(projId)) return false
                      }
                      return matchFilter(r.customer_name ?? '', r.project_name ?? '', r.descricao ?? '')
                    })}
                    canDrag={colCanDrag('inicio_autorizado')}
                    canDrop={colCanDrop('inicio_autorizado')}
                    isCliente={isCliente}
                    unreadContractIds={unreadContractIds}
                    newContractIds={newContractIds}
                    onContractClick={card => {
                      if (isCoord) markContractSeen(card.id)
                      if (card.kanban_status === 'inicio_autorizado' && !card.project_id) {
                        setGenerateTarget(card)
                      } else {
                        setSelectedContract(card)
                      }
                    }}
                    onContractAction={(card, action) => setContractAction({ card, action })}
                    onProjectClick={setSelectedProject}
                    onProjectAction={(card, action) => setProjectAction({ card, action })}
                    onRequestClick={setSelectedRequest}
                    onContractMove={(card, toCol) => handleContractMove(card.id, card, 'inicio_autorizado', toCol)}
                    getContractCols={(card, fromCol) => getAvailableContractCols(card, fromCol)}
                    />
                  <PhaseSeparator label="Execução" icon={<ChevronRight />} />
                </>
              )}

              {/* ── Project Phase ── */}
              {visibleProjectCols.map(col => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  contractCards={[]}
                  projectCards={projectsInCol(col.id)}
                  canDrag={!isConsultor && !isCliente}
                  canDrop={!isConsultor && !isCliente}
                  isCliente={isCliente}
                  unreadContractIds={unreadContractIds}
                  newProjectIds={col.id === 'em_andamento' ? newProjectIds : undefined}
                  onContractClick={setSelectedContract}
                  onProjectClick={card => {
                    if (newProjectIds?.has(card.id)) markProjectSeen(card.id)
                    setSelectedProject(card)
                  }}
                  onProjectAction={(card, action) => setProjectAction({ card, action })}
                  onProjectMove={(card, toCol) => handleProjectMove(card.id, toCol)}
                  getProjectCols={getAvailableProjectCols}
                />
              ))}
            </div>
          </div>
        </DragDropContext>}
      </div>

      {/* Modals */}
      {selectedContract && (
        <ContractDetailModal
          card={selectedContract}
          onClose={() => setSelectedContract(null)}
          onGenerate={() => { setGenerateTarget(selectedContract); setSelectedContract(null) }}
          coordinators={coordinators}
          canGenerate={!isConsultor && !isCliente}
          userRole={userRole}
          onEdit={!isConsultor && !isCliente ? async () => {
            const id = selectedContract.id
            setSelectedContract(null)
            try {
              const full = await api.get<any>(`/contracts/${id}`)
              setEditContractData(full)
              setShowEditContract(true)
            } catch { toast.error('Erro ao carregar contrato') }
          } : undefined}
        />
      )}
      {showEditContract && (
        <ContractFormModal
          open={showEditContract}
          editContract={editContractData}
          onClose={() => { setShowEditContract(false); setEditContractData(null) }}
          onSaved={() => { setShowEditContract(false); setEditContractData(null) }}
        />
      )}
      {selectedProject && (
        <ProjectDetailModal card={selectedProject} onClose={() => setSelectedProject(null)} userRole={userRole} />
      )}
      {selectedRequest && (
        <RequestDetailModal card={selectedRequest} onClose={() => setSelectedRequest(null)} />
      )}
      {contractDecisionCard && (
        <ContractDecisionModal
          card={contractDecisionCard}
          onClose={() => setContractDecisionCard(null)}
          onNovoProjeto={() => {
            const card = contractDecisionCard
            setContractDecisionCard(null)
            setContractCreateForDecision(card)
          }}
          onFilho={() => {
            const card = contractDecisionCard
            setContractDecisionCard(null)
            setContractFilhoCard(card)
          }}
        />
      )}
      {contractCreateForDecision && (
        <ContractCreateModal
          initialCustomerId={contractCreateForDecision.customer_id}
          customerReadOnly
          excludeSustentacao
          title="Novo Projeto"
          onClose={() => setContractCreateForDecision(null)}
          onSuccess={async (_contractId: number) => {
            const card = contractCreateForDecision
            setContractCreateForDecision(null)
            try {
              await api.patch(`/contracts/${card.id}/kanban-move`, { to_column: 'req_inicio_autorizado', order: 0 })
              setDemandCards(prev => prev.map(c => c.id === card.id ? { ...c, kanban_status: 'req_inicio_autorizado' } : c))
              toast.success('Contrato cadastrado e movido para Aguardando Início')
            } catch { load() }
          }}
        />
      )}
      {contractFilhoCard && (
        <ContractFilhoModal
          card={contractFilhoCard}
          onClose={() => setContractFilhoCard(null)}
          onDone={_updated => {
            setContractFilhoCard(null)
            load()
          }}
        />
      )}
      {planDecisionCard && (
        <PlanDecisionModal
          card={planDecisionCard}
          coordinators={coordinators}
          onClose={() => setPlanDecisionCard(null)}
          onDone={updated => {
            setRequestCards(prev => prev.map(r => r.id === updated.id ? updated : r))
            setPlanDecisionCard(null)
          }}
          onNovoProjeto={() => {
            const card = planDecisionCard
            setPlanDecisionCard(null)
            setContractCreateForReq(card)
          }}
          onSubprojeto={(projectId, subSeq) => {
            const card = planDecisionCard
            setPlanDecisionCard(null)
            setSubprojetoForReq({ card, projectId, subSeq })
          }}
        />
      )}
      {contractCreateForReq && (
        <ContractCreateModal
          initialCustomerId={contractCreateForReq.customer_id}
          initialProjectName={contractCreateForReq.project_name}
          customerReadOnly
          excludeSustentacao
          title="Novo Projeto"
          onClose={() => setContractCreateForReq(null)}
          onSuccess={async (contractId) => {
            const card = contractCreateForReq
            setContractCreateForReq(null)
            try {
              const res = await api.post<{ ok: boolean; linked_contract_id: number }>(
                `/contract-requests/${card.id}/plan-decision`,
                { decision: 'novo_projeto', contract_id: contractId }
              )
              toast.success('Contrato criado — requisição aguardando em Aguardando Início (Req.)')
              setRequestCards(prev => prev.map(r =>
                r.id === card.id
                  ? { ...r, kanban_column: 'req_inicio_autorizado', req_decision: 'novo_projeto', linked_contract_id: res.linked_contract_id }
                  : r
              ))
            } catch (e: any) {
              toast.error(e?.message ?? 'Erro ao vincular requisição')
            }
          }}
        />
      )}
      {subprojetoForReq && (
        <ContractCreateModal
          initialCustomerId={subprojetoForReq.card.customer_id}
          initialProjectName={subprojetoForReq.card.project_name}
          initialParentProjectId={subprojetoForReq.projectId}
          initialSubSeq={subprojetoForReq.subSeq}
          customerReadOnly
          excludeSustentacao
          title="Subprojeto — Novo Contrato"
          onClose={() => setSubprojetoForReq(null)}
          onSuccess={async (contractId) => {
            const { card, projectId } = subprojetoForReq
            setSubprojetoForReq(null)
            try {
              const res = await api.post<{ ok: boolean; linked_contract_id: number }>(
                `/contract-requests/${card.id}/plan-decision`,
                { decision: 'subprojeto', project_id: projectId, contract_id: contractId }
              )
              toast.success('Subprojeto criado — requisição em Início Autorizado')
              setRequestCards(prev => prev.map(r =>
                r.id === card.id
                  ? { ...r, kanban_column: 'inicio_autorizado', req_decision: 'subprojeto', linked_contract_id: res.linked_contract_id }
                  : r
              ))
            } catch (e: any) {
              toast.error(e?.message ?? 'Erro ao vincular subprojeto')
            }
          }}
        />
      )}
      {finalizeCard && (
        <FinalizeRequestModal
          card={finalizeCard}
          onClose={() => setFinalizeCard(null)}
          onDone={updated => {
            setFinalizeCard(null)
            load()
          }}
        />
      )}
      {generateTarget && (
        <GenerateProjectModal
          card={generateTarget}
          coordinators={coordinators}
          onClose={() => setGenerateTarget(null)}
          onGenerate={handleGenerate}
        />
      )}

      {/* ── Project action modals ── */}
      {projectAction && (() => {
        const { card, action } = projectAction
        const close = () => setProjectAction(null)
        if (action === 'view')       return <ProjectViewModal projectId={card.id} onClose={close} userRole={userRole} initialTab="overview" />
        if (action === 'edit')       return <ProjectEditByIdModal projectId={card.id} onClose={close} onSaved={close} />
        if (action === 'status')     return <ProjectStatusModal projectId={card.id} projectName={card.project_name} currentStatus={card.status} onClose={close} onSaved={st => { setProjectCards(prev => prev.map(p => p.id === card.id ? { ...p, status: st } : p)); close() }} />
        if (action === 'cost')       return <ProjectViewModal projectId={card.id} onClose={close} userRole={userRole} initialTab="consultants" />
        if (action === 'timesheets') return <ProjectViewModal projectId={card.id} onClose={close} userRole={userRole} initialTab="timesheets" />
        if (action === 'expenses')   return <ProjectExpensesModal projectId={card.id} projectName={card.project_name} onClose={close} />
        if (action === 'aportes')    return <ProjectAportesModal projectId={card.id} projectName={card.project_name} onClose={close} />
        if (action === 'team')       return <ProjectTeamModal projectId={card.id} projectName={card.project_name} onClose={close} onSaved={close} />
        if (action === 'chat')       return <ProjectDetailModal card={card} onClose={() => { close(); if (card.contract_id) setUnreadContractIds(prev => prev.filter(id => id !== card.contract_id)) }} userRole={userRole} initialTab="chat" />
        return null
      })()}

      {/* ── Contract action modals ── */}
      {contractAction && (() => {
        const { card, action } = contractAction
        const close = () => setContractAction(null)
        if (action === 'view') return (
          <ContractDetailModal card={card} onClose={close} coordinators={coordinators} canGenerate={!isConsultor && !isCliente}
            userRole={userRole}
            onGenerate={() => { setGenerateTarget(card); close() }}
            onEdit={!isConsultor && !isCliente ? async () => {
              close()
              try { const full = await api.get<any>(`/contracts/${card.id}`); setEditContractData(full); setShowEditContract(true) }
              catch { toast.error('Erro ao carregar contrato') }
            } : undefined}
          />
        )
        if (action === 'chat') return (
          <ContractDetailModal card={card} onClose={close} coordinators={coordinators} canGenerate={false}
            userRole={userRole} onEdit={undefined} initialTab="chat" />
        )
        if (action === 'log') return (
          <ContractDetailModal card={card} onClose={close} coordinators={coordinators} canGenerate={false}
            userRole={userRole} onEdit={undefined} initialTab="log" />
        )
        if (action === 'edit') {
          api.get<any>(`/contracts/${card.id}`)
            .then(full => { setEditContractData(full); setShowEditContract(true) })
            .catch(() => toast.error('Erro ao carregar contrato'))
          close()
          return null
        }
        if (action === 'delete') {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
              <div className="rounded-2xl p-6 flex flex-col gap-4 w-80" style={{ background: '#0f172a', border: '1px solid rgba(239,68,68,0.4)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <Trash2 size={20} className="text-red-400" />
                  <p className="font-semibold text-white">Excluir Contrato</p>
                </div>
                <p className="text-sm text-slate-300">Tem certeza que deseja excluir <strong className="text-white">{card.project_name}</strong>? Esta ação não pode ser desfeita.</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={close} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white" style={{ background: 'rgba(255,255,255,0.05)' }}>Cancelar</button>
                  <button onClick={async () => {
                    try {
                      await api.delete(`/contracts/${card.id}`)
                      toast.success('Contrato excluído.')
                      close()
                      load()
                    } catch (e: any) {
                      toast.error(e?.message ?? 'Erro ao excluir contrato')
                      close()
                    }
                  }} className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <Trash2 size={14} /> Excluir
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
