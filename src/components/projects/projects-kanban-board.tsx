'use client'

import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { KanbanStage } from '@/lib/types/project-stage'
import type { ProjectKanbanItem } from '@/hooks/use-projects-for-kanban'
import { ProjectKanbanCard } from './project-kanban-card'

interface Props {
  projects: ProjectKanbanItem[]
  onChanged: () => void
}

const COLUMNS: { stage: KanbanStage; label: string }[] = [
  { stage: 'backlog', label: 'Backlog' },
  { stage: 'planning', label: 'Planejamento' },
  { stage: 'execution', label: 'Execução' },
  { stage: 'homologation', label: 'Homologação' },
  { stage: 'closed', label: 'Encerrado' },
]

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export function ProjectsKanbanBoard({ projects, onChanged }: Props) {
  const [local, setLocal] = useState<ProjectKanbanItem[]>(projects)

  useEffect(() => { setLocal(projects) }, [projects])

  const byColumn = useMemo(() => {
    const map: Record<KanbanStage, ProjectKanbanItem[]> = {
      backlog: [], planning: [], execution: [], homologation: [], closed: [],
    }
    local.forEach(p => {
      const k = (p.kanban_stage ?? 'backlog') as KanbanStage
      ;(map[k] ?? map.backlog).push(p)
    })
    return map
  }, [local])

  const totals = useMemo(() => {
    const map: Record<KanbanStage, { count: number; sold: number; consumed: number }> = {
      backlog: { count: 0, sold: 0, consumed: 0 },
      planning: { count: 0, sold: 0, consumed: 0 },
      execution: { count: 0, sold: 0, consumed: 0 },
      homologation: { count: 0, sold: 0, consumed: 0 },
      closed: { count: 0, sold: 0, consumed: 0 },
    }
    COLUMNS.forEach(({ stage }) => {
      const items = byColumn[stage]
      map[stage].count = items.length
      map[stage].sold = items.reduce((s, p) => s + n(p.sold_hours), 0)
      map[stage].consumed = items.reduce((s, p) => s + n(p.consumed_hours), 0)
    })
    return map
  }, [byColumn])

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return // sem reorder por agora

    const movedId = Number(draggableId)
    const moved = local.find(p => p.id === movedId)
    if (!moved) return
    const newStage = destination.droppableId as KanbanStage

    // Otimismo
    setLocal(prev => prev.map(p => p.id === movedId ? { ...p, kanban_stage: newStage } : p))

    try {
      await api.patch(`/projects/${movedId}`, { kanban_stage: newStage })
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mover projeto')
      setLocal(projects) // rollback
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))',
        gap: 12,
        overflowX: 'auto',
      }}>
        {COLUMNS.map(col => {
          const items = byColumn[col.stage]
          const t = totals[col.stage]
          return (
            <Droppable droppableId={col.stage} key={col.stage}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    background: snapshot.isDraggingOver ? 'var(--surface-hover)' : 'var(--surface)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: 10,
                    minHeight: 220,
                    display: 'flex', flexDirection: 'column',
                    transition: 'background .12s ease',
                  }}
                >
                  <div style={{ marginBottom: 8, padding: '0 4px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                      fontSize: 11, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '.04em',
                    }}>
                      <span style={{ fontWeight: 600 }}>{col.label}</span>
                      <span style={{ opacity: .6 }}>{t.count}</span>
                    </div>
                    {t.sold > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 2 }}>
                        {Math.round(t.consumed)}h / {Math.round(t.sold)}h
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {items.map((p, idx) => (
                      <Draggable key={p.id} draggableId={String(p.id)} index={idx}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            style={{ ...prov.draggableProps.style }}
                          >
                            <ProjectKanbanCard project={p} isDragging={snap.isDragging} />
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
  )
}
