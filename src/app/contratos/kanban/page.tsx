'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { List, Plus, ExternalLink, CheckCircle, AlertCircle, Clock, Users, Layers } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KanbanCard {
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

interface Coordinator { id: number; name: string }

interface Column {
  id: string
  label: string
  type: 'fixed' | 'coordinator'
  coordinatorId?: number
  emoji: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_COLUMNS: Column[] = [
  { id: 'novo',        label: 'Novo Contrato',      type: 'fixed', emoji: '🆕' },
  { id: 'em_cadastro', label: 'Em Cadastro (ADM)',  type: 'fixed', emoji: '📝' },
  { id: 'pronto',      label: 'Pronto para Iniciar', type: 'fixed', emoji: '✅' },
]

function cardColumn(card: KanbanCard): string {
  if (card.kanban_status === 'alocado' && card.kanban_coordinator_id) {
    return `coordinator:${card.kanban_coordinator_id}`
  }
  return card.kanban_status ?? 'novo'
}

function statusBadge(card: KanbanCard) {
  if (card.project_id) return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: '🟢 Projeto Ativo' }
  if (card.is_complete) return { color: '#eab308', bg: 'rgba(234,179,8,0.12)', label: '🟡 Pronto' }
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: '🔴 Incompleto' }
}

const TIPO_LABEL: Record<string, string> = {
  on_demand: 'On Demand',
  banco_horas_mensal: 'BH Mensal',
  banco_horas_fixo: 'BH Fixo',
  por_servico: 'Por Serviço',
  saas: 'SaaS',
}

// ─── Card Component ───────────────────────────────────────────────────────────

function KanbanCardItem({ card, index, onClick }: { card: KanbanCard; index: number; onClick: () => void }) {
  const badge = statusBadge(card)
  return (
    <Draggable draggableId={String(card.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className="rounded-xl p-3 cursor-pointer select-none transition-all"
          style={{
            background: snapshot.isDragging ? 'rgba(0,245,255,0.06)' : 'var(--brand-surface)',
            border: `1px solid ${snapshot.isDragging ? 'rgba(0,245,255,0.35)' : 'var(--brand-border)'}`,
            boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
            ...provided.draggableProps.style,
          }}
        >
          {/* Header */}
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

          {/* Tags */}
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

          {/* Footer */}
          <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid var(--brand-border)' }}>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--brand-subtle)' }}>
              {card.horas_contratadas != null && card.horas_contratadas > 0 && (
                <span className="flex items-center gap-1"><Clock size={10} />{card.horas_contratadas}h</span>
              )}
              {card.valor_projeto != null && (
                <span className="flex items-center gap-1">
                  R$ {Number(card.valor_projeto).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </span>
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

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function CardDetailModal({ card, onClose, onGoToContract }: { card: KanbanCard; onClose: () => void; onGoToContract: (id: number) => void }) {
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
            <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Categoria', card.categoria === 'projeto' ? 'Projeto' : card.categoria === 'sustentacao' ? 'Sustentação' : '—'],
              ['Tipo de Contrato', card.contract_type ?? '—'],
              ['Faturamento', card.tipo_faturamento ? TIPO_LABEL[card.tipo_faturamento] ?? card.tipo_faturamento : '—'],
              ['Horas Contratadas', card.horas_contratadas ? `${card.horas_contratadas}h` : '—'],
              ['Valor do Projeto', card.valor_projeto != null ? `R$ ${Number(card.valor_projeto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'],
              ['Coordenador', card.kanban_coordinator ?? '—'],
              ['Status Contrato', card.status],
              ['Projeto', card.project_code ?? '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
              </div>
            ))}
          </div>
          {!card.is_complete && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>Contrato incompleto — preencha cliente, horas, tipo de contrato e faturamento para alocar a um coordenador.</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
          <button onClick={() => onGoToContract(card.id)}
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
  const [cards, setCards]               = useState<KanbanCard[]>([])
  const [coordinators, setCoordinators] = useState<Coordinator[]>([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState<KanbanCard | null>(null)

  const columns: Column[] = [
    ...FIXED_COLUMNS,
    ...coordinators.map(c => ({
      id:            `coordinator:${c.id}`,
      label:         c.name,
      type:          'coordinator' as const,
      coordinatorId: c.id,
      emoji:         '👤',
    })),
  ]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ contracts: KanbanCard[]; coordinators: Coordinator[] }>('/contracts/kanban')
      setCards(r.contracts ?? [])
      setCoordinators(r.coordinators ?? [])
    } catch { toast.error('Erro ao carregar kanban') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!user) return
    if (user.type !== 'admin') router.replace('/dashboard')
  }, [user, router])

  const cardsInColumn = (colId: string) =>
    cards.filter(c => cardColumn(c) === colId).sort((a, b) => a.kanban_order - b.kanban_order)

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const cardId = Number(draggableId)
    const toCol  = destination.droppableId
    const card   = cards.find(c => c.id === cardId)
    if (!card) return

    // Optimistic update
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c
      const isCoordCol = toCol.startsWith('coordinator:')
      return {
        ...c,
        kanban_status:          isCoordCol ? 'alocado' : toCol,
        kanban_coordinator_id:  isCoordCol ? Number(toCol.split(':')[1]) : undefined,
        kanban_order:           destination.index,
      }
    }))

    try {
      await api.patch(`/contracts/${cardId}/kanban-move`, {
        to_column: toCol,
        order:     destination.index,
      })
      await load() // Reload to get project_code and updated state
      toast.success(toCol.startsWith('coordinator:') && !card.project_id
        ? '🚀 Projeto gerado automaticamente!'
        : 'Card movido')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao mover card')
      load() // revert
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Kanban de Contratos</h1>
            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Arraste o card para a coluna do coordenador para gerar o projeto automaticamente</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/contratos')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
              <List size={13} /> Lista
            </button>
            <button onClick={() => router.push('/contratos')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:opacity-80"
              style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
              <Plus size={13} /> Novo Contrato
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-6 py-2 shrink-0 border-b text-[11px]" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Incompleto</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Pronto</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Projeto Ativo</span>
          <span className="ml-auto flex items-center gap-1.5"><Users size={11} />Colunas dinâmicas = coordenadores ativos</span>
        </div>

        {/* Board */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-4 p-4 h-full" style={{ minWidth: `${columns.length * 280 + (columns.length - 1) * 16}px` }}>
                {columns.map(col => {
                  const colCards = cardsInColumn(col.id)
                  const isCoordCol = col.type === 'coordinator'
                  return (
                    <div key={col.id} className="flex flex-col rounded-2xl shrink-0" style={{
                      width: 272,
                      background: isCoordCol ? 'rgba(0,245,255,0.03)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isCoordCol ? 'rgba(0,245,255,0.15)' : 'var(--brand-border)'}`,
                    }}>
                      {/* Column header */}
                      <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor: isCoordCol ? 'rgba(0,245,255,0.12)' : 'var(--brand-border)' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{col.emoji}</span>
                            <p className="text-sm font-semibold" style={{ color: isCoordCol ? 'var(--brand-primary)' : 'var(--brand-text)' }}>
                              {col.label}
                            </p>
                          </div>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                            {colCards.length}
                          </span>
                        </div>
                        {isCoordCol && (
                          <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>
                            Arraste aqui → projeto criado automaticamente
                          </p>
                        )}
                      </div>

                      {/* Cards */}
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors"
                            style={{
                              minHeight: 80,
                              background: snapshot.isDraggingOver
                                ? isCoordCol ? 'rgba(0,245,255,0.05)' : 'rgba(255,255,255,0.03)'
                                : 'transparent',
                            }}
                          >
                            {colCards.map((card, idx) => (
                              <KanbanCardItem key={card.id} card={card} index={idx} onClick={() => setSelected(card)} />
                            ))}
                            {provided.placeholder}
                            {colCards.length === 0 && !snapshot.isDraggingOver && (
                              <p className="text-center text-xs py-6" style={{ color: 'var(--brand-subtle)' }}>
                                {isCoordCol ? 'Nenhum projeto alocado' : 'Vazio'}
                              </p>
                            )}
                          </div>
                        )}
                      </Droppable>
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
          onGoToContract={id => { router.push('/contratos'); setSelected(null) }}
        />
      )}
    </AppLayout>
  )
}

export default function KanbanPage() {
  return <KanbanContent />
}
