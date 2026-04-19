'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, CheckCircle, AlertCircle, Clock, Users, Layers, PauseCircle, XCircle } from 'lucide-react'

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

interface Column {
  id: string
  label: string
  type: 'fixed' | 'coordinator' | 'project_status'
  coordinatorId?: number
  emoji?: string
  projectStatus?: string
  color?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const FIXED_COLUMNS: Column[] = [
  { id: 'novo',            label: 'Novo Contrato',       type: 'fixed', emoji: '🆕' },
  { id: 'pronto',          label: 'Pronto para Iniciar', type: 'fixed', emoji: '✅' },
]

const SUSTENTACAO_COL: Column = {
  id: 'sustentacao_auto', label: 'Sustentação / Cloud', type: 'fixed', emoji: '⚙️', color: '#f59e0b',
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

function ProjectKanbanCard({ card, index, onClick }: {
  card: ProjectCard; index: number; onClick: () => void
}) {
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
          className="rounded-xl p-3 cursor-pointer select-none transition-all"
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
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: `${color}18`, color }}>
              {STATUS_LABEL[card.status] ?? card.status}
            </span>
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

  const [demandCards,          setDemandCards]          = useState<ContractCard[]>([])
  const [projectCards,         setProjectCards]         = useState<ProjectCard[]>([])
  const [coordinators,         setCoordinators]         = useState<Coordinator[]>([])
  const [sustentacaoAutoCards, setSustentacaoAutoCards] = useState<ContractCard[]>([])
  const [loading,              setLoading]              = useState(true)
  const [selected,             setSelected]             = useState<ContractCard | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<any>('/contracts/kanban')
      setDemandCards(r.demand_cards ?? r.contracts ?? [])
      setProjectCards(r.project_cards ?? [])
      setCoordinators(r.coordinators ?? [])
      setSustentacaoAutoCards(r.sustentacao_auto_cards ?? [])
    } catch { toast.error('Erro ao carregar kanban') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Column list: fixed + sustentacao auto + coordinator + project status
  const columns: Column[] = [
    ...FIXED_COLUMNS,
    ...(sustentacaoAutoCards.length > 0 ? [SUSTENTACAO_COL] : []),
    ...coordinators.map(c => ({
      id:            `coordinator:${c.id}`,
      label:         c.name,
      type:          'coordinator' as const,
      coordinatorId: c.id,
      emoji:         '👤',
    })),
    ...STATUS_PROJECT_COLUMNS,
  ]

  // Contract cards per column
  const contractsInCol = (colId: string): ContractCard[] => {
    if (colId === 'sustentacao_auto') return sustentacaoAutoCards
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

    const toCol = destination.droppableId
    const [cardType, rawId] = draggableId.split('-')
    const cardId = Number(rawId)

    // Block drops back into the auto-sustentacao column
    if (toCol === 'sustentacao_auto') return

    // ── Moving a contract card ──
    if (cardType === 'contract') {
      const card = [...demandCards, ...sustentacaoAutoCards].find(c => c.id === cardId)
      if (!card) return

      // Moving to a coordinator column → generate or assign project
      if (toCol.startsWith('coordinator:')) {
        const coordId = Number(toCol.split(':')[1])
        if (!card.is_complete) {
          toast.error('Contrato incompleto — preencha todos os campos antes de alocar.')
          return
        }
        const wasNew = !card.project_id
        // Optimistic update: remove from auto list if it came from there
        setSustentacaoAutoCards(prev => prev.filter(c => c.id !== cardId))
        setDemandCards(prev => prev.map(c =>
          c.id === cardId ? { ...c, kanban_status: 'alocado', kanban_coordinator_id: coordId } : c
        ))
        try {
          await api.patch(`/contracts/${cardId}/kanban-move`, {
            to_column:      `coordinator:${coordId}`,
            coordinator_id: coordId,
            order:          destination.index,
          })
          await load()
          if (wasNew) toast.success('🚀 Projeto gerado automaticamente!')
          else toast.success('Coordenador atualizado')
        } catch (e: any) {
          toast.error(e?.message ?? 'Erro ao alocar contrato')
          load()
        }
        return
      }

      // Moving between fixed columns (novo ↔ pronto)
      const toKanbanStatus = toCol === 'pronto' ? 'aprovado' : 'backlog'
      setDemandCards(prev => prev.map(c =>
        c.id === cardId ? { ...c, kanban_status: toKanbanStatus, kanban_order: destination.index } : c
      ))
      try {
        await api.patch(`/contracts/${cardId}/kanban-move`, { to_column: toKanbanStatus, order: destination.index })
        toast.success('Card movido')
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao mover card')
        load()
      }
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
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao mover projeto')
        load()
      }
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
                  const contractCards  = isStatusCol ? [] : contractsInCol(col.id)
                  const activeProjects = isCoord ? activeProjectsInCoordCol(col.coordinatorId!) : []
                  const statusProjects = isStatusCol ? projectsInStatusCol(col.id) : []
                  const totalCards     = contractCards.length + activeProjects.length + statusProjects.length

                  // Visual separator before first status col
                  const prevCol     = columns[colIdx - 1]
                  const showSep     = isStatusCol && prevCol?.type !== 'project_status'
                  const isSustAuto  = col.id === 'sustentacao_auto'

                  const borderColor = isStatusCol
                    ? `${col.color}30`
                    : isSustAuto
                    ? 'rgba(245,158,11,0.3)'
                    : isCoord
                    ? 'rgba(0,245,255,0.15)'
                    : 'var(--brand-border)'

                  const headerColor = isStatusCol
                    ? col.color!
                    : isSustAuto
                    ? '#f59e0b'
                    : isCoord
                    ? 'var(--brand-primary)'
                    : 'var(--brand-text)'

                  return (
                    <div key={col.id} className="flex items-start gap-3">
                      {/* Separator */}
                      {showSep && (
                        <div className="self-stretch w-px shrink-0 mt-1"
                          style={{ background: 'var(--brand-border)', opacity: 0.4 }} />
                      )}

                      {/* Column */}
                      <div className="flex flex-col rounded-2xl shrink-0" style={{
                        width: 264,
                        background: isStatusCol
                          ? `${col.color}05`
                          : isSustAuto
                          ? 'rgba(245,158,11,0.03)'
                          : isCoord
                          ? 'rgba(0,245,255,0.02)'
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
                          {isSustAuto && (
                            <p className="text-[10px] mt-1" style={{ color: '#f59e0b', opacity: 0.7 }}>
                              Aparecem automaticamente — arraste para alocar
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
                          isDropDisabled={isSustAuto || (isStatusCol && !['col_pausado', 'col_cancelado', 'col_encerrado'].includes(col.id))}
                        >
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.droppableProps}
                              className="flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors"
                              style={{
                                minHeight: 80,
                                background: snap.isDraggingOver
                                  ? isStatusCol ? `${col.color}08` : isCoord ? 'rgba(0,245,255,0.05)' : 'rgba(255,255,255,0.03)'
                                  : 'transparent',
                              }}
                            >
                              {contractCards.map((card, idx) => (
                                <ContractKanbanCard key={`c-${card.id}`} card={card} index={idx} onClick={() => setSelected(card)} />
                              ))}
                              {activeProjects.map((proj, idx) => (
                                <ProjectKanbanCard key={`p-${proj.id}`} card={proj} index={contractCards.length + idx} onClick={() => {}} />
                              ))}
                              {statusProjects.map((proj, idx) => (
                                <ProjectKanbanCard key={`ps-${proj.id}`} card={proj} index={idx} onClick={() => {}} />
                              ))}
                              {prov.placeholder}
                              {totalCards === 0 && !snap.isDraggingOver && (
                                <p className="text-center text-xs py-6" style={{ color: 'var(--brand-subtle)' }}>
                                  {isCoord ? 'Nenhum projeto alocado' : 'Vazio'}
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
    </AppLayout>
  )
}

export default function KanbanPage() {
  return <KanbanContent />
}
