'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { startSession, getSession } from '@/lib/help-desk-session'
import { startWorkSession } from '@/lib/work-session'
import { KanbanSquare, Search, User, Play } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'

interface Ref { id: number; name: string }
interface StatusOpt { id: number; key: string; label: string; color: string | null; sort_order: number; is_open: boolean }
interface Sla { first_response_breached: boolean; resolution_breached: boolean; first_response_overdue: boolean; resolution_overdue: boolean }
interface TicketRow {
  id: number; ticket_number: string | null; subject: string; priority: string; status_id: number | null
  customer?: Ref | null; assignee?: Ref | null; sla?: Sla | null
}

const PRIO: Record<string, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  normal:  { label: 'Média',   color: 'var(--info-border)',    bg: 'var(--info-bg)' },
  alta:    { label: 'Alta',    color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  urgente: { label: 'Urgente', color: 'var(--danger-border)',  bg: 'var(--danger-bg)' },
}
function slaDot(sla?: Sla | null): { dot: string; title: string } {
  if (!sla) return { dot: '', title: '' }
  if (sla.first_response_breached || sla.resolution_breached) return { dot: '🔴', title: 'SLA estourado' }
  if (sla.first_response_overdue || sla.resolution_overdue) return { dot: '🟡', title: 'SLA vencendo' }
  return { dot: '🟢', title: 'No prazo' }
}
const iniciais = (name?: string | null) => (name ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export default function HelpDeskFilaPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [teams, setTeams] = useState<Ref[]>([])
  const [local, setLocal] = useState<TicketRow[]>([])
  const [f, setF] = useState({ search: '', priority: '', team_id: '' })
  const [mine, setMine] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: '500' })
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (mine) p.set('mine', '1')
    return p.toString()
  }, [f, mine])

  const load = useCallback(() => {
    api.get<{ data: TicketRow[] }>(`/help-desk/tickets?${qs}`).then(r => setLocal(r?.data ?? [])).catch(() => toast.error('Erro ao carregar'))
  }, [qs])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: { statuses: StatusOpt[]; teams: Ref[] } }>('/help-desk/meta')
      .then(r => { setStatuses((r?.data?.statuses ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)); setTeams(r?.data?.teams ?? []) })
      .catch(() => {})
  }, [])

  const byColumn = useMemo(() => {
    const map: Record<number, TicketRow[]> = {}
    statuses.forEach(s => { map[s.id] = [] })
    local.forEach(t => { if (t.status_id != null && map[t.status_id]) map[t.status_id].push(t) })
    return map
  }, [local, statuses])

  // Modo Atendimento — restaura filtros da sessão ao voltar para a fila.
  useEffect(() => {
    const s = getSession()
    if (s?.source !== 'kanban') return
    setF(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s.filters).filter(([k]) => k in prev && typeof s.filters[k] === 'string')) as { search: string; priority: string; team_id: string } }))
    if (typeof s.filters.mine === 'boolean') setMine(s.filters.mine)
  }, [])

  const orderedIds = () => statuses.flatMap(s => (byColumn[s.id] ?? []).map(t => t.id))

  // Inicia a sessão com a ORDEM do board (colunas em ordem → cards em ordem) e abre o chamado.
  const openTicket = (ticketId: number) => {
    startSession({ source: 'kanban', label: 'Fila', ids: orderedIds(), filters: { ...f, mine } })
    router.push(`/help-desk/tickets/${ticketId}`)
  }

  // Modo Atendimento — sessão contínua na ordem do board.
  const iniciarModo = async () => {
    const ids = orderedIds()
    if (ids.length === 0) return toast.error('Nenhum chamado na fila.')
    const teamName = teams.find(t => String(t.id) === f.team_id)?.name
    const first = await startWorkSession({ scope: 'help_desk', source: 'kanban', filters: { ...f, mine }, label: teamName ? `Fila: ${teamName}` : 'Fila', ids })
    if (first) router.push(`/help-desk/tickets/${first}`)
  }

  const onDragEnd = async (r: DropResult) => {
    const { destination, source, draggableId } = r
    if (!destination || destination.droppableId === source.droppableId) return
    const ticketId = Number(draggableId)
    const newStatusId = Number(destination.droppableId)
    const moved = local.find(t => t.id === ticketId)
    if (!moved) return
    const prevStatusId = moved.status_id
    // Otimismo
    setLocal(prev => prev.map(t => t.id === ticketId ? { ...t, status_id: newStatusId } : t))
    try {
      await api.patch(`/help-desk/tickets/${ticketId}/status`, { status_id: newStatusId })
      load() // sincroniza SLA/resolved/closed após a transição
    } catch {
      toast.error('Erro ao mover chamado')
      setLocal(prev => prev.map(t => t.id === ticketId ? { ...t, status_id: prevStatusId } : t))
    }
  }

  return (
    <AppLayout title="Fila (Kanban)">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <KanbanSquare size={20} style={{ color: 'var(--primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Fila de atendimento</h1>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>({local.length})</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input className={`${fieldCls} pl-8 w-48`} style={inputStyle} placeholder="Buscar…" value={f.search} onChange={e => set('search', e.target.value)} />
            </div>
            <select className={fieldCls} style={inputStyle} value={f.priority} onChange={e => set('priority', e.target.value)}>
              <option value="">Prioridade</option>{Object.keys(PRIO).map(p => <option key={p} value={p}>{PRIO[p].label}</option>)}
            </select>
            <select className={fieldCls} style={inputStyle} value={f.team_id} onChange={e => set('team_id', e.target.value)}>
              <option value="">Fila</option>{teams.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
            <button onClick={() => setMine(m => !m)} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: mine ? 'var(--primary-soft)' : 'var(--surface)', color: mine ? 'var(--primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Meus
            </button>
            <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={iniciarModo}>
              <Play size={15} /> Iniciar Modo Atendimento
            </button>
          </div>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {statuses.map(col => {
              const items = byColumn[col.id] ?? []
              return (
                <Droppable droppableId={String(col.id)} key={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className="rounded-lg p-2.5 flex flex-col shrink-0 w-72"
                      style={{ background: snapshot.isDraggingOver ? 'var(--surface-hover)' : 'var(--surface)', border: '1px solid var(--border)', minHeight: 200, transition: 'background .12s ease' }}>
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: col.color ?? 'var(--text-muted)' }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: col.color ?? 'var(--text-muted)' }} />{col.label}
                        </span>
                        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{items.length}</span>
                      </div>
                      <div className="flex flex-col gap-2 flex-1">
                        {items.map((t, idx) => {
                          const prio = PRIO[t.priority] ?? PRIO.normal
                          const sig = slaDot(t.sla)
                          return (
                            <Draggable key={t.id} draggableId={String(t.id)} index={idx}>
                              {(prov, snap) => (
                                <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                                  onClick={() => openTicket(t.id)}
                                  className="ds-card p-2.5 cursor-pointer"
                                  style={{ ...prov.draggableProps.style, boxShadow: snap.isDragging ? '0 4px 12px rgba(0,0,0,.18)' : undefined }}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono text-[10px]" style={{ color: 'var(--text-light)' }}>{t.ticket_number ?? `#${t.id}`}</span>
                                    {sig.dot && <span title={sig.title} className="text-[11px]">{sig.dot}</span>}
                                  </div>
                                  <div className="text-sm leading-snug mb-1.5 line-clamp-2" style={{ color: 'var(--text)' }}>{t.subject}</div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>
                                    {t.assignee
                                      ? <span title={t.assignee.name} className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{iniciais(t.assignee.name)}</span>
                                      : <User size={13} style={{ color: 'var(--text-light)' }} />}
                                  </div>
                                  {t.customer && <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{t.customer.name}</div>}
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
                        {provided.placeholder}
                        {items.length === 0 && <div className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>—</div>}
                      </div>
                    </div>
                  )}
                </Droppable>
              )
            })}
          </div>
        </DragDropContext>
        {user && mine && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mostrando apenas chamados atribuídos a você.</p>}
      </div>
    </AppLayout>
  )
}
