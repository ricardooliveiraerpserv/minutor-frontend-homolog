'use client'

import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { StageDelivery, DeliveryStatus } from '@/lib/types/project-stage'
import { DeliveryCard } from './delivery-card'
import { DeliverySidePanel } from './delivery-side-panel'

interface Props {
  stageId: number
  deliveries: StageDelivery[]
  onChanged: () => void
}

const COLUMNS: { status: DeliveryStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'in_progress', label: 'Em andamento' },
  { status: 'waiting_client', label: 'Aguardando cliente' },
  { status: 'review', label: 'Homologação' },
  { status: 'done', label: 'Concluído' },
]

export function StageKanbanBoard({ stageId, deliveries, onChanged }: Props) {
  const [local, setLocal] = useState<StageDelivery[]>(deliveries)
  const [selected, setSelected] = useState<StageDelivery | null>(null)
  const [creatingIn, setCreatingIn] = useState<DeliveryStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')

  // Sincroniza local com prop quando refetch traz novos dados
  useEffect(() => { setLocal(deliveries) }, [deliveries])

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
      toast.success('Entrega criada')
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
                      background: snapshot.isDraggingOver ? 'var(--surface-hover)' : 'var(--surface)',
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
                      <button
                        type="button"
                        onClick={() => { setCreatingIn(col.status); setNewTitle('') }}
                        aria-label={`Nova entrega em ${col.label}`}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: 2,
                        }}
                      >
                        <Plus size={14} />
                      </button>
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
                          placeholder="Título da entrega…"
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

      {selected && (
        <DeliverySidePanel
          delivery={selected}
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
