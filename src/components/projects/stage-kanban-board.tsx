'use client'

import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { StageDelivery, DeliveryStatus } from '@/lib/types/project-stage'
import { DeliveryCard } from './delivery-card'
import { DeliverySidePanel } from './delivery-side-panel'
import { ApprovalRequestModal } from './approval-request-modal'

interface Props {
  stageId: number
  projectId: number
  deliveries: StageDelivery[]
  onChanged: () => void
  canEdit?: boolean
}

const COLUMNS: { status: DeliveryStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'in_progress', label: 'Em andamento' },
  { status: 'waiting_client', label: 'Aguardando cliente' },
  { status: 'review', label: 'Homologação' },
  { status: 'done', label: 'Concluído' },
]

export function StageKanbanBoard({ stageId, projectId, deliveries, onChanged, canEdit = true }: Props) {
  const [local, setLocal] = useState<StageDelivery[]>(deliveries)
  const [selected, setSelected] = useState<StageDelivery | null>(null)
  const [creatingIn, setCreatingIn] = useState<DeliveryStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')
  // Card arrastado para "Aguardando cliente" — exige mensagem (modal de aprovação).
  const [approvalFor, setApprovalFor] = useState<StageDelivery | null>(null)

  // Sincroniza local com prop quando refetch traz novos dados
  useEffect(() => { setLocal(deliveries) }, [deliveries])

  // Lookup título do predecessor pra exibição "Bloqueada por: {X}" no card
  const titleById = useMemo(() => {
    const m: Record<number, string> = {}
    local.forEach(d => { m[d.id] = d.title })
    return m
  }, [local])

  // Numeração hierárquica dentro da etapa (1, 2, 3...). Como não temos contexto
  // do índice da etapa no projeto inteiro, usamos só o sub-índice — o parent
  // que monta o board todo pode passar prefixo explícito futuramente.
  const codeByDeliveryId = useMemo(() => {
    const m: Record<number, string> = {}
    const sorted = [...local].sort((a, b) => a.order_index - b.order_index)
    sorted.forEach((d, idx) => { m[d.id] = `${idx + 1}` })
    return m
  }, [local])

  const byColumn = useMemo(() => {
    const map: Record<DeliveryStatus, StageDelivery[]> = {
      backlog: [], in_progress: [], waiting_client: [], review: [], done: [],
    }
    local.forEach(d => { (map[d.status] ?? map.backlog).push(d) })
    Object.values(map).forEach(arr => arr.sort((a, b) => a.order_index - b.order_index))
    return map
  }, [local])

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const movedId = Number(draggableId)
    const moved = local.find(d => d.id === movedId)
    if (!moved) return

    const newStatus = destination.droppableId as DeliveryStatus

    // Bloqueio operacional FS: predecessor pending impede sair de backlog (ADR 0009 appendix)
    if (moved.status === 'backlog' && newStatus !== 'backlog'
        && moved.predecessor_state === 'pending'
        && moved.depends_on_delivery_id) {
      const pred = local.find(d => d.id === moved.depends_on_delivery_id)
      const predTitle = pred?.title ?? 'predecessor'
      toast.error(`Conclua a atividade '${predTitle}' antes de iniciar esta.`)
      return
    }

    // Mover para "Aguardando cliente" exige mensagem ao cliente → abre o modal
    // (não move direto; o request-approval do modal faz a transição).
    if (newStatus === 'waiting_client' && moved.status !== 'waiting_client') {
      setApprovalFor(moved)
      return
    }

    // Otimismo: atualiza local imediatamente
    const next = local.filter(d => d.id !== movedId)
    const targetCol = next.filter(d => d.status === newStatus).sort((a, b) => a.order_index - b.order_index)
    targetCol.splice(destination.index, 0, { ...moved, status: newStatus })
    targetCol.forEach((d, i) => { d.order_index = i })
    const otherCols = next.filter(d => d.status !== newStatus)
    setLocal([...otherCols, ...targetCol])

    try {
      await api.post(`/deliveries/${movedId}/move`, {
        status: newStatus,
        order_index: destination.index,
        sibling_ids: targetCol.map(d => d.id),
      })
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mover')
      setLocal(deliveries) // rollback
    }
  }

  async function handleCreate(status: DeliveryStatus) {
    const title = newTitle.trim()
    if (!title) return
    try {
      await api.post<StageDelivery>(`/stages/${stageId}/deliveries`, { title, status })
      setNewTitle('')
      setCreatingIn(null)
      onChanged()
      toast.success('Atividade criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar')
    }
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(240px, 1fr))',
          gap: 12,
          overflowX: 'auto',
        }}>
          {COLUMNS.map(col => {
            const items = byColumn[col.status]
            return (
              <Droppable droppableId={col.status} key={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      background: snapshot.isDraggingOver ? 'var(--surface-hover)' : 'var(--panel)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: 10,
                      minHeight: 200,
                      display: 'flex', flexDirection: 'column',
                      transition: 'background .12s ease',
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 8, padding: '0 4px',
                    }}>
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '.04em',
                        fontWeight: 600,
                      }}>
                        {col.label}
                        <span style={{ opacity: .6, marginLeft: 6, fontWeight: 400 }}>{items.length}</span>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => { setCreatingIn(col.status); setNewTitle('') }}
                          aria-label={`Nova atividade em ${col.label}`}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 2,
                          }}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>

                    {creatingIn === col.status && (
                      <form
                        onSubmit={e => { e.preventDefault(); handleCreate(col.status) }}
                        style={{ marginBottom: 8 }}
                      >
                        <input
                          autoFocus
                          className="ds-input"
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          onBlur={() => { if (!newTitle.trim()) setCreatingIn(null) }}
                          onKeyDown={e => { if (e.key === 'Escape') setCreatingIn(null) }}
                          placeholder="Título da atividade…"
                          maxLength={200}
                          style={{ width: '100%', fontSize: 13, padding: '6px 8px' }}
                        />
                      </form>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      {items.map((d, idx) => (
                        <Draggable key={d.id} draggableId={String(d.id)} index={idx}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              style={{ ...prov.draggableProps.style }}
                            >
                              <DeliveryCard
                                delivery={d}
                                isDragging={snap.isDragging}
                                onClick={() => setSelected(d)}
                                predecessorTitle={d.depends_on_delivery_id ? titleById[d.depends_on_delivery_id] : undefined}
                                code={codeByDeliveryId[d.id]}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {approvalFor && (
        <ApprovalRequestModal
          deliveryId={approvalFor.id}
          title={approvalFor.title}
          onClose={() => setApprovalFor(null)}
          onDone={() => { setApprovalFor(null); onChanged() }}
        />
      )}

      {selected && (
        <DeliverySidePanel
          delivery={selected}
          projectId={projectId}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setLocal(prev => prev.map(d => d.id === updated.id ? updated : d))
            setSelected(updated)
            onChanged()
          }}
          onDeleted={(id) => {
            setLocal(prev => prev.filter(d => d.id !== id))
            setSelected(null)
            onChanged()
          }}
        />
      )}
    </>
  )
}
