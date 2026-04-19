'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, AlertCircle, Clock, ChevronRight, Rocket, Layers, FolderKanban } from 'lucide-react'

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
  customer_name: string
  customer_id: number
  project_name: string
  code: string
  status: string
  sold_hours?: number
  coordinators?: string[]
  consultants?: string[]
}

type AnyCard = ContractCard | ProjectCard

interface Coordinator { id: number; name: string }

interface KanbanResponse {
  demand_cards: ContractCard[]
  transition_cards: ContractCard[]
  project_cards: ProjectCard[]
  coordinators: Coordinator[]
  user_role: string
}

interface Column {
  id: string
  label: string
  phase: Phase
  projectStatuses?: string[]
  clientVisible?: boolean
}

// ─── Column Definitions ───────────────────────────────────────────────────────

const DEMAND_COLS: Column[] = [
  { id: 'backlog',         label: 'Backlog',         phase: 'demand', clientVisible: true },
  { id: 'novo_projeto',   label: 'Novo Projeto',    phase: 'demand', clientVisible: true },
  { id: 'em_planejamento',label: 'Em Planejamento', phase: 'demand' },
  { id: 'em_validacao',   label: 'Em Validação',    phase: 'demand', clientVisible: true },
  { id: 'em_revisao',     label: 'Em Revisão',      phase: 'demand' },
  { id: 'aprovado',       label: 'Aprovado',        phase: 'demand', clientVisible: true },
]

const TRANSITION_COL: Column = {
  id: 'inicio_autorizado', label: 'Início Autorizado', phase: 'transition',
}

const PROJECT_COLS: Column[] = [
  { id: 'em_andamento',        label: 'Em Andamento',        phase: 'project', projectStatuses: ['awaiting_start', 'started'] },
  { id: 'liberado_para_testes',label: 'Liberado p/ Testes',  phase: 'project', projectStatuses: ['liberado_para_testes'] },
  { id: 'encerrado',           label: 'Encerrado',           phase: 'project', projectStatuses: ['finished'] },
]

const PROJECT_STATUS_TO_COL: Record<string, string> = {
  awaiting_start:       'em_andamento',
  started:              'em_andamento',
  liberado_para_testes: 'liberado_para_testes',
  finished:             'encerrado',
  paused:               'em_andamento',
}

const PROJECT_COL_TO_STATUS: Record<string, string> = {
  em_andamento:         'started',
  liberado_para_testes: 'liberado_para_testes',
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
  card, index, canDrag, onClick,
}: { card: ContractCard; index: number; canDrag: boolean; onClick: () => void }) {
  const isIncomplete = !card.is_complete
  const isTransition = card.kanban_status === 'inicio_autorizado'

  return (
    <Draggable draggableId={uniqueCardId(card)} index={index} isDragDisabled={!canDrag}>
      {(prov, snap) => (
        <div
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all"
          style={{
            background: snap.isDragging ? 'rgba(0,245,255,0.06)' : 'var(--brand-surface)',
            border: `1px solid ${snap.isDragging ? 'rgba(0,245,255,0.3)' : isTransition ? 'rgba(234,179,8,0.3)' : 'var(--brand-border)'}`,
            boxShadow: snap.isDragging ? '0 8px 24px rgba(0,0,0,0.45)' : 'none',
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
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
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

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectKanbanCard({
  card, index, canDrag, onClick,
}: { card: ProjectCard; index: number; canDrag: boolean; onClick: () => void }) {
  const statusColor: Record<string, string> = {
    awaiting_start: '#94a3b8', started: '#22c55e',
    liberado_para_testes: '#f59e0b', finished: '#6366f1', paused: '#ef4444',
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
          className="rounded-xl p-3 cursor-pointer select-none transition-all"
          style={{
            background: snap.isDragging ? 'rgba(99,102,241,0.08)' : 'var(--brand-surface)',
            border: `1px solid ${snap.isDragging ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.2)'}`,
            boxShadow: snap.isDragging ? '0 8px 24px rgba(0,0,0,0.45)' : 'none',
            ...prov.draggableProps.style,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>
                {card.customer_name}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>{card.project_name}</p>
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
              style={{ background: `${color}20`, color }}>
              {STATUS_LABEL[card.status] ?? card.status}
            </span>
          </div>

          <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="flex items-center gap-2">
              {card.coordinators && card.coordinators.length > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>
                  👤 {card.coordinators[0]}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
              {card.code}
            </span>
          </div>
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

function ContractDetailModal({ card, onClose, onGenerate, coordinators, canGenerate }: {
  card: ContractCard
  onClose: () => void
  onGenerate?: () => void
  coordinators: Coordinator[]
  canGenerate: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{card.customer_name}</p>
              {card.project_name && <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>{card.project_name}</p>}
            </div>
            <span className="text-xs px-2 py-1 rounded-full shrink-0 font-semibold"
              style={card.is_complete
                ? { background: 'rgba(234,179,8,0.12)', color: '#eab308' }
                : { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
              {card.is_complete ? 'Completo' : 'Incompleto'}
            </span>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[55vh] overflow-y-auto">
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
            <button
              onClick={onGenerate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#eab308', color: '#000' }}
            >
              <Rocket size={13} /> Gerar Projeto
            </button>
          )}
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

function ProjectDetailModal({ card, onClose }: { card: ProjectCard; onClose: () => void }) {
  const statusColor: Record<string, string> = {
    awaiting_start: '#94a3b8', started: '#22c55e',
    liberado_para_testes: '#f59e0b', finished: '#6366f1', paused: '#ef4444',
  }
  const color = statusColor[card.status] ?? '#94a3b8'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(99,102,241,0.3)' }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{card.project_name}</p>
              <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>{card.customer_name}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full shrink-0 font-semibold" style={{ background: `${color}20`, color }}>
              {STATUS_LABEL[card.status] ?? card.status}
            </span>
          </div>
        </div>
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
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
          <button onClick={() => { window.location.href = '/projects' }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)' }}>
            <ExternalLink size={13} /> Ver Projeto
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Column Component ─────────────────────────────────────────────────────────

function KanbanColumn({
  col, contractCards, projectCards, canDrag, canDrop, onContractClick, onProjectClick,
}: {
  col: Column
  contractCards: ContractCard[]
  projectCards: ProjectCard[]
  canDrag: boolean
  canDrop: boolean
  onContractClick: (card: ContractCard) => void
  onProjectClick: (card: ProjectCard) => void
}) {
  const isTransition = col.phase === 'transition'
  const isProject    = col.phase === 'project'
  const totalCards   = contractCards.length + projectCards.length

  const borderColor = isTransition
    ? 'rgba(234,179,8,0.25)'
    : isProject
    ? 'rgba(99,102,241,0.25)'
    : 'var(--brand-border)'

  const headerColor = isTransition
    ? '#eab308'
    : isProject
    ? '#818cf8'
    : 'var(--brand-text)'

  const bg = isTransition
    ? 'rgba(234,179,8,0.02)'
    : isProject
    ? 'rgba(99,102,241,0.02)'
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
            {!isTransition && !isProject && <Layers size={13} style={{ color: 'var(--brand-subtle)' }} />}
            <p className="text-sm font-semibold" style={{ color: headerColor }}>{col.label}</p>
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
      </div>

      <Droppable droppableId={col.id} isDropDisabled={!canDrop}>
        {(prov, snap) => (
          <div
            ref={prov.innerRef}
            {...prov.droppableProps}
            className="flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors"
            style={{
              minHeight: 80,
              background: snap.isDraggingOver
                ? isTransition ? 'rgba(234,179,8,0.05)' : isProject ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.03)'
                : 'transparent',
            }}
          >
            {contractCards.map((card, idx) => (
              <ContractKanbanCard key={uniqueCardId(card)} card={card} index={idx} canDrag={canDrag} onClick={() => onContractClick(card)} />
            ))}
            {projectCards.map((card, idx) => (
              <ProjectKanbanCard key={uniqueCardId(card)} card={card} index={contractCards.length + idx} canDrag={canDrag} onClick={() => onProjectClick(card)} />
            ))}
            {prov.placeholder}
            {totalCards === 0 && !snap.isDraggingOver && (
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
  const [coordinators,    setCoordinators]    = useState<Coordinator[]>([])
  const [userRole,        setUserRole]        = useState<string>('admin')
  const [loading,         setLoading]         = useState(true)

  const [selectedContract, setSelectedContract] = useState<ContractCard | null>(null)
  const [selectedProject,  setSelectedProject]  = useState<ProjectCard | null>(null)
  const [generateTarget,   setGenerateTarget]   = useState<ContractCard | null>(null)

  const isConsultor = userRole === 'consultor'
  const isCliente   = userRole === 'cliente'
  const canDrag     = !isConsultor && !isCliente

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<KanbanResponse>('/contracts/kanban')
      setDemandCards(r.demand_cards ?? [])
      setTransitionCards(r.transition_cards ?? [])
      setProjectCards(r.project_cards ?? [])
      setCoordinators(r.coordinators ?? [])
      setUserRole(r.user_role ?? 'admin')
    } catch {
      toast.error('Erro ao carregar kanban')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Compute visible columns based on role
  const visibleDemandCols = isConsultor
    ? []
    : isCliente
    ? DEMAND_COLS.filter(c => c.clientVisible)
    : DEMAND_COLS

  const showTransition = !isConsultor && !isCliente
  const visibleProjectCols = PROJECT_COLS

  // Cards by column
  const contractsInCol = (colId: string): ContractCard[] => {
    if (colId === 'inicio_autorizado') {
      return transitionCards.sort((a, b) => a.kanban_order - b.kanban_order)
    }
    return demandCards.filter(c => contractColumnId(c) === colId).sort((a, b) => a.kanban_order - b.kanban_order)
  }

  const projectsInCol = (colId: string): ProjectCard[] =>
    projectCards.filter(p => projectColumnId(p) === colId)

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const toCol = destination.droppableId
    const [cardType, rawId] = draggableId.split('-')
    const cardId = Number(rawId)

    // ── Moving a contract card ──
    if (cardType === 'contract') {
      const card = [...demandCards, ...transitionCards].find(c => c.id === cardId)
      if (!card) return

      if (toCol === 'inicio_autorizado') {
        if (!card.is_complete) {
          toast.error('Contrato incompleto — preencha todos os campos obrigatórios antes de autorizar.')
          return
        }
        // Optimistic update
        setDemandCards(prev => prev.filter(c => c.id !== cardId))
        setTransitionCards(prev => [...prev, { ...card, kanban_status: 'inicio_autorizado', status: 'inicio_autorizado' }])
        try {
          await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: 'inicio_autorizado', order: destination.index })
          toast.success('Contrato movido para Início Autorizado')
        } catch (e: any) {
          toast.error(e?.message ?? 'Erro ao mover contrato')
          load()
        }
        return
      }

      // Moving back from transition to a demand column
      if (DEMAND_COLS.find(c => c.id === toCol)) {
        const wasTransition = card.kanban_status === 'inicio_autorizado'
        setTransitionCards(prev => prev.filter(c => c.id !== cardId))
        setDemandCards(prev => [...prev.filter(c => c.id !== cardId), { ...card, kanban_status: toCol }])
        try {
          await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toCol, order: destination.index })
          if (wasTransition) toast.success('Contrato retornado à fase de demanda')
          else toast.success('Card movido')
        } catch (e: any) {
          toast.error(e?.message ?? 'Erro ao mover card')
          load()
        }
        return
      }

      // Moving between demand columns
      setDemandCards(prev => prev.map(c =>
        c.id === cardId ? { ...c, kanban_status: toCol, kanban_order: destination.index } : c
      ))
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toCol, order: destination.index })
        toast.success('Card movido')
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao mover card')
        load()
      }
      return
    }

    // ── Moving a project card ──
    if (cardType === 'project') {
      const proj = projectCards.find(p => p.id === cardId)
      if (!proj) return

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
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Pipeline Demanda → Projeto</h1>
            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
              {isConsultor ? 'Seus projetos em execução' : 'Gerencie o fluxo completo de contratos e projetos'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/contratos')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}
            >
              <List size={13} /> Lista
            </button>
            {!isConsultor && !isCliente && (
              <button
                onClick={() => router.push('/contratos')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
              >
                <Plus size={13} /> Novo Contrato
              </button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 px-6 py-2 shrink-0 border-b text-[11px]" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
          {!isConsultor && (
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
          {canDrag && <span className="ml-auto opacity-50">Arraste para mover entre colunas</span>}
          {!canDrag && <span className="ml-auto opacity-50">Visualização somente leitura</span>}
        </div>

        {/* Board */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-3 p-4 h-full items-start" style={{ minWidth: `${boardMinWidth}px` }}>

              {/* ── Demand Phase ── */}
              {visibleDemandCols.map(col => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  contractCards={contractsInCol(col.id)}
                  projectCards={[]}
                  canDrag={canDrag}
                  canDrop={canDrag}
                  onContractClick={setSelectedContract}
                  onProjectClick={setSelectedProject}
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
                    canDrag={canDrag}
                    canDrop={canDrag}
                    onContractClick={card => {
                      if (card.kanban_status === 'inicio_autorizado' && !card.project_id) {
                        setGenerateTarget(card)
                      } else {
                        setSelectedContract(card)
                      }
                    }}
                    onProjectClick={setSelectedProject}
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
                  canDrag={canDrag}
                  canDrop={canDrag}
                  onContractClick={setSelectedContract}
                  onProjectClick={setSelectedProject}
                />
              ))}
            </div>
          </div>
        </DragDropContext>
      </div>

      {/* Modals */}
      {selectedContract && (
        <ContractDetailModal
          card={selectedContract}
          onClose={() => setSelectedContract(null)}
          onGenerate={() => { setGenerateTarget(selectedContract); setSelectedContract(null) }}
          coordinators={coordinators}
          canGenerate={!isConsultor && !isCliente}
        />
      )}
      {selectedProject && (
        <ProjectDetailModal card={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
      {generateTarget && (
        <GenerateProjectModal
          card={generateTarget}
          coordinators={coordinators}
          onClose={() => setGenerateTarget(null)}
          onGenerate={handleGenerate}
        />
      )}
    </AppLayout>
  )
}

export default function KanbanPage() {
  return <KanbanContent />
}
