'use client'

import { useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { StageDelivery, DeliveryStatus } from '@/lib/types/project-stage'
import type { ScheduleStage } from '@/hooks/use-project-schedule'
import { DeliveryCard } from './delivery-card'
import { useAuth } from '@/hooks/use-auth'
import { DeliverySidePanel } from './delivery-side-panel'
import { ApprovalRequestModal } from './approval-request-modal'

/**
 * Operação interna: UM kanban POR ETAPA de topo, contendo TODAS as atividades da
 * etapa — inclusive as das sub-etapas — no mesmo quadro, numeradas 1.1, 1.2…
 * Arrastável por qualquer perfil interno; soltar em "Aguardando cliente" abre o
 * modal de mensagem.
 */
interface Props {
  projectId: number
  stages: ScheduleStage[]
  onChanged: () => void
  canEdit?: boolean
}

type Aug = StageDelivery & { _code: string; _subName: string | null }

const COLUMNS: { status: DeliveryStatus; label: string }[] = [
  { status: 'backlog', label: 'A iniciar' },
  { status: 'in_progress', label: 'Em andamento' },
  { status: 'waiting_client', label: 'Aguardando cliente' },
  { status: 'review', label: 'Homologação' },
  { status: 'done', label: 'Concluído' },
]

// Cor estável por sub-etapa (pra distinguir os cards de cada sub-etapa no mesmo kanban).
const SUB_COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899', '#22c55e', '#6366f1', '#ef4444']
function subColor(name: string | null): string | null {
  if (!name) return null
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return SUB_COLORS[h % SUB_COLORS.length]
}

export function ProjectActivityKanban({ projectId, stages, onChanged, canEdit = true }: Props) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  // Agrupa por etapa de TOPO: cada grupo junta as atividades da etapa + sub-etapas,
  // numeradas hierarquicamente (1.1, 1.1.1…). primaryStageId = a etapa de topo.
  const groups = useMemo(() => {
    const top = stages.filter(s => s.parent_stage_id == null).sort((a, b) => a.order_index - b.order_index)
    const childrenByParent = new Map<number, ScheduleStage[]>()
    for (const s of stages) if (s.parent_stage_id != null) {
      const a = childrenByParent.get(s.parent_stage_id) ?? []; a.push(s); childrenByParent.set(s.parent_stage_id, a)
    }

    return top.map((topStage, ti) => {
      const items: Aug[] = []
      const topCode = `${ti + 1}`
      const walk = (s: ScheduleStage, code: string, subName: string | null) => {
        ;(s.deliveries ?? []).slice().sort((a, b) => a.order_index - b.order_index).forEach((d, i) => {
          items.push({ ...d, _code: `${code}.${i + 1}`, _subName: subName })
        })
        const subs = (childrenByParent.get(s.id) ?? []).sort((a, b) => a.order_index - b.order_index)
        subs.forEach((sub, j) => walk(sub, `${code}.${j + 1}`, sub.name))
      }
      walk(topStage, topCode, null)
      return { stage: topStage, code: topCode, items }
    })
  }, [stages])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map(({ stage, code, items }) => {
        const isCollapsed = collapsed[stage.id]
        return (
          <section key={stage.id}>
            <button
              type="button"
              onClick={() => setCollapsed(c => ({ ...c, [stage.id]: !c[stage.id] }))}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 2px', marginBottom: 8, textAlign: 'left' }}
            >
              {isCollapsed ? <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{code}. {stage.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>· {items.length} atividade{items.length === 1 ? '' : 's'}</span>
            </button>

            {!isCollapsed && (
              <EtapaKanban projectId={projectId} primaryStageId={stage.id} items={items} onChanged={onChanged} canEdit={canEdit} />
            )}
          </section>
        )
      })}
      {groups.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 24 }}>Nenhuma etapa ainda.</div>}
    </div>
  )
}

/** Kanban de uma etapa (atividades da etapa + sub-etapas no mesmo quadro). */
function EtapaKanban({ projectId, primaryStageId, items, onChanged, canEdit }: {
  projectId: number
  primaryStageId: number
  items: Aug[]
  onChanged: () => void
  canEdit: boolean
}) {
  const [local, setLocal] = useState<Aug[]>(items)
  const { user } = useAuth()
  // Consultor arrasta só a PRÓPRIA atividade (responsável); coord/admin (canEdit) arrastam qualquer.
  const canDrag = (d: StageDelivery) => canEdit || (user?.type === 'consultor' && String(d.responsible_user_id ?? '') === String(user?.id ?? ''))
  const [selected, setSelected] = useState<StageDelivery | null>(null)
  const [approvalFor, setApprovalFor] = useState<StageDelivery | null>(null)
  const [creatingIn, setCreatingIn] = useState<DeliveryStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => { setLocal(items) }, [items])

  const titleById = useMemo(() => {
    const m: Record<number, string> = {}
    local.forEach(d => { m[d.id] = d.title })
    return m
  }, [local])

  const byColumn = useMemo(() => {
    const map: Record<DeliveryStatus, Aug[]> = { backlog: [], in_progress: [], waiting_client: [], review: [], done: [] }
    local.forEach(d => { (map[d.status] ?? map.backlog).push(d) })
    Object.values(map).forEach(arr => arr.sort((a, b) => a.order_index - b.order_index))
    return map
  }, [local])

  // Move uma atividade de coluna (status). Reusado pelo drag-and-drop E pelo dropdown "Mover para" do card.
  async function moveTo(moved: Aug, newStatus: DeliveryStatus, orderIndex: number) {
    if (moved.status === newStatus) return
    if (moved.status === 'backlog' && newStatus !== 'backlog' && moved.predecessor_state === 'pending' && moved.depends_on_delivery_id) {
      toast.error(`Conclua a atividade '${titleById[moved.depends_on_delivery_id] ?? 'predecessora'}' antes de iniciar esta.`)
      return
    }
    if (newStatus === 'waiting_client' && moved.status !== 'waiting_client') {
      setApprovalFor(moved); return
    }

    setLocal(prev => prev.map(d => d.id === moved.id ? { ...d, status: newStatus, order_index: orderIndex } : d))
    try {
      await api.post(`/deliveries/${moved.id}/move`, { status: newStatus, order_index: orderIndex })
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mover')
      setLocal(items)
    }
  }

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return
    const moved = local.find(d => d.id === Number(draggableId))
    if (!moved) return
    await moveTo(moved, destination.droppableId as DeliveryStatus, destination.index)
  }

  async function handleCreate(status: DeliveryStatus) {
    const title = newTitle.trim()
    if (!title) return
    try {
      await api.post<StageDelivery>(`/stages/${primaryStageId}/deliveries`, { title, status })
      setNewTitle(''); setCreatingIn(null); onChanged()
      toast.success('Atividade criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar')
    }
  }

  return (
    <>
      {/* Botão "Nova atividade" movido pra toolbar do cronograma (ao lado de Nova etapa).
          Mantidos os "+" por coluna pra criar direto no status. */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))`, gap: 12, overflowX: 'auto' }}>
          {COLUMNS.map(col => {
            const cards = byColumn[col.status]
            return (
              <Droppable droppableId={col.status} key={col.status}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    style={{ background: snapshot.isDraggingOver ? 'var(--surface-hover)' : 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 10, minHeight: 160, display: 'flex', flexDirection: 'column', transition: 'background .12s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
                        {col.label}<span style={{ opacity: .6, marginLeft: 6, fontWeight: 400 }}>{cards.length}</span>
                      </div>
                      {canEdit && (
                        <button type="button" onClick={() => { setCreatingIn(col.status); setNewTitle('') }} aria-label="Nova atividade" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                          <Plus size={14} />
                        </button>
                      )}
                    </div>

                    {creatingIn === col.status && (
                      <form onSubmit={e => { e.preventDefault(); handleCreate(col.status) }} style={{ marginBottom: 8 }}>
                        <input autoFocus className="ds-input" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                          onBlur={() => { if (!newTitle.trim()) setCreatingIn(null) }}
                          onKeyDown={e => { if (e.key === 'Escape') setCreatingIn(null) }}
                          placeholder="Título da atividade…" maxLength={200} style={{ width: '100%', fontSize: 13, padding: '6px 8px' }} />
                      </form>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      {cards.map((d, idx) => {
                        const sc = subColor(d._subName)
                        return (
                        <Draggable key={d.id} draggableId={String(d.id)} index={idx} isDragDisabled={!canDrag(d)}>
                          {(prov, snap) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                              style={{ ...prov.draggableProps.style, borderLeft: sc ? `3px solid ${sc}` : undefined, borderRadius: sc ? 6 : undefined, paddingLeft: sc ? 6 : undefined }}>
                              {d._subName && <div style={{ fontSize: 10, fontWeight: 600, color: sc ?? 'var(--text-light)', padding: '0 2px 2px' }}>{d._subName}</div>}
                              <DeliveryCard
                                delivery={d}
                                code={d._code}
                                isDragging={snap.isDragging}
                                onClick={() => setSelected(d)}
                                predecessorTitle={d.depends_on_delivery_id ? titleById[d.depends_on_delivery_id] : undefined}
                                columns={canDrag(d) ? COLUMNS : undefined}
                                onMove={canDrag(d) ? (status => moveTo(d, status as DeliveryStatus, byColumn[status as DeliveryStatus]?.length ?? 0)) : undefined}
                              />
                            </div>
                          )}
                        </Draggable>
                        )
                      })}
                      {provided.placeholder}
                      {cards.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center', padding: 8 }}>—</div>}
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {approvalFor && (
        <ApprovalRequestModal deliveryId={approvalFor.id} title={approvalFor.title} onClose={() => setApprovalFor(null)} onDone={() => { setApprovalFor(null); onChanged() }} />
      )}
      {selected && (
        <DeliverySidePanel
          delivery={selected}
          projectId={projectId}
          onClose={() => setSelected(null)}
          onUpdated={(u) => { setLocal(prev => prev.map(d => d.id === u.id ? { ...d, ...u } : d)); setSelected(u); onChanged() }}
          onDeleted={(id) => { setLocal(prev => prev.filter(d => d.id !== id)); setSelected(null); onChanged() }}
        />
      )}
    </>
  )
}
