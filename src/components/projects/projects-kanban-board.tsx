'use client'

import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { OperationalColumn } from '@/lib/types/project-stage'
import { OPERATIONAL_COLUMNS } from '@/lib/types/project-stage'
import {
  COLUMN_LABEL,
  COLUMN_TO_STATUS,
  getOperationalColumn,
} from '@/lib/utils/project-workflow'
import type { ProjectKanbanItem } from '@/hooks/use-projects-for-kanban'
import { ProjectKanbanCard } from './project-kanban-card'

interface Props {
  projects: ProjectKanbanItem[]
  onChanged: () => void
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export function ProjectsKanbanBoard({ projects, onChanged }: Props) {
  const [local, setLocal] = useState<ProjectKanbanItem[]>(projects)

  useEffect(() => { setLocal(projects) }, [projects])

  const byColumn = useMemo(() => {
    const map: Record<OperationalColumn, ProjectKanbanItem[]> = {
      backlog: [], execution: [], homologation: [], closed: [], paused: [], cancelled: [],
    }
    local.forEach(p => {
      const col = getOperationalColumn(p.status)
      if (col) map[col].push(p)
      // status `awaiting_start` (sem coord ainda) fica fora — não está no pipeline operacional
    })
    return map
  }, [local])

  const totals = useMemo(() => {
    const map: Record<OperationalColumn, { count: number; sold: number; consumed: number }> = {
      backlog:      { count: 0, sold: 0, consumed: 0 },
      execution:    { count: 0, sold: 0, consumed: 0 },
      homologation: { count: 0, sold: 0, consumed: 0 },
      closed:       { count: 0, sold: 0, consumed: 0 },
      paused:       { count: 0, sold: 0, consumed: 0 },
      cancelled:    { count: 0, sold: 0, consumed: 0 },
    }
    OPERATIONAL_COLUMNS.forEach(col => {
      const items = byColumn[col]
      map[col].count = items.length
      map[col].sold = items.reduce((s, p) => s + n(p.sold_hours), 0)
      map[col].consumed = items.reduce((s, p) => s + n(p.consumed_hours), 0)
    })
    return map
  }, [byColumn])

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return

    const movedId = Number(draggableId)
    const moved = local.find(p => p.id === movedId)
    if (!moved) return

    const targetColumn = destination.droppableId as OperationalColumn
    const newStatus = COLUMN_TO_STATUS[targetColumn]

    // Optimismo: atualiza status no local imediatamente
    setLocal(prev => prev.map(p => p.id === movedId ? { ...p, status: newStatus } : p))

    try {
      // PATCH /projects/{id}/status — endpoint dedicado (rota existente projects.update-status)
      await api.patch(`/projects/${movedId}/status`, { status: newStatus })
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
        gridTemplateColumns: `repeat(${OPERATIONAL_COLUMNS.length}, minmax(240px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
      }}>
        {OPERATIONAL_COLUMNS.map(col => {
          const items = byColumn[col]
          const t = totals[col]
          return (
            <Droppable droppableId={col} key={col}>
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
                      <span style={{ fontWeight: 600 }}>{COLUMN_LABEL[col]}</span>
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
