'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { startSession, getSession } from '@/lib/help-desk-session'
import { KanbanSquare, Search } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'

interface Ref { id: number; name: string }
interface StatusOpt { id: number; key: string; label: string; color: string | null; sort_order: number; is_open: boolean }
interface Sla { first_response_breached: boolean; resolution_breached: boolean; first_response_overdue: boolean; resolution_overdue: boolean }
interface TicketRow {
  id: number; ticket_number: string | null; subject: string; priority: string; status_id: number | null
  customer?: Ref | null; assignee?: Ref | null; sla?: Sla | null
  solicitante_nome?: string | null; requester_name?: string | null; created_at?: string | null
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

/** Data de abertura compacta: "10/07/26 16:58". */
const fmtAberto = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Filtra por período de ABERTURA (created_at). '' = qualquer. Semana começa na segunda. */
function abertoNoPeriodo(iso: string | null | undefined, period: string): boolean {
  if (!period || !iso) return true
  const d = new Date(iso); if (isNaN(d.getTime())) return true
  const now = new Date()
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'hoje') return d >= hoje
  if (period === 'ontem') { const y = new Date(hoje); y.setDate(y.getDate() - 1); return d >= y && d < hoje }
  if (period === 'semana') { const w = new Date(hoje); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); return d >= w }
  if (period === 'mes') return d >= new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'ano') return d >= new Date(now.getFullYear(), 0, 1)
  return true
}

export default function HelpDeskFilaPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [teams, setTeams] = useState<Ref[]>([])
  const [local, setLocal] = useState<TicketRow[]>([])
  const [f, setF] = useState({ search: '', priority: '', team_id: '' })
  const [mine, setMine] = useState(false)
  const [period, setPeriod] = useState('') // período de abertura (client-side)
  const [cf, setCf] = useState({ consultor: '', cliente: '', solicitante: '' }) // filtros client-side por nome
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const setC = (k: keyof typeof cf, v: string) => setCf(s => ({ ...s, [k]: v }))

  // Opções derivadas dos chamados carregados.
  const opts = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
    return {
      consultores: uniq(local.map(t => t.assignee?.name)),
      clientes: uniq(local.map(t => t.customer?.name)),
      solicitantes: uniq(local.map(t => t.solicitante_nome)),
    }
  }, [local])

  // Predicado client-side (período + consultor + cliente + solicitante).
  const matchFilters = useCallback((t: TicketRow) =>
    abertoNoPeriodo(t.created_at, period)
    && (!cf.consultor || t.assignee?.name === cf.consultor)
    && (!cf.cliente || t.customer?.name === cf.cliente)
    && (!cf.solicitante || t.solicitante_nome === cf.solicitante)
  , [period, cf])

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
    local.filter(matchFilters).forEach(t => { if (t.status_id != null && map[t.status_id]) map[t.status_id].push(t) })
    return map
  }, [local, statuses, matchFilters])

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
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>({local.filter(matchFilters).length})</span>
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
            <select className={fieldCls} style={inputStyle} value={period} onChange={e => setPeriod(e.target.value)} title="Filtrar por data de abertura">
              <option value="">Aberto: qualquer</option>
              <option value="hoje">Aberto hoje</option>
              <option value="ontem">Aberto ontem</option>
              <option value="semana">Aberto esta semana</option>
              <option value="mes">Aberto este mês</option>
              <option value="ano">Aberto este ano</option>
            </select>
            <select className={fieldCls} style={inputStyle} value={cf.consultor} onChange={e => setC('consultor', e.target.value)} title="Filtrar por responsável">
              <option value="">Consultor</option>{opts.consultores.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className={fieldCls} style={inputStyle} value={cf.cliente} onChange={e => setC('cliente', e.target.value)} title="Filtrar por cliente">
              <option value="">Cliente</option>{opts.clientes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className={fieldCls} style={inputStyle} value={cf.solicitante} onChange={e => setC('solicitante', e.target.value)} title="Filtrar por solicitante">
              <option value="">Solicitante</option>{opts.solicitantes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={() => setMine(m => !m)} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: mine ? 'var(--primary-soft)' : 'var(--surface)', color: mine ? 'var(--primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Meus
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
                          const st = statuses.find(s => s.id === t.status_id)
                          return (
                            <Draggable key={t.id} draggableId={String(t.id)} index={idx}>
                              {(prov, snap) => (
                                <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                                  onClick={() => openTicket(t.id)}
                                  className="ds-card p-2.5 cursor-pointer"
                                  style={{ ...prov.draggableProps.style, boxShadow: snap.isDragging ? '0 4px 12px rgba(0,0,0,.18)' : undefined }}>
                                  <div className="flex items-center justify-between mb-1 gap-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-light)' }}>{t.ticket_number ?? `#${t.id}`}</span>
                                      {t.created_at && <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-light)' }}>· {fmtAberto(t.created_at)}</span>}
                                    </div>
                                    {sig.dot && <span title={sig.title} className="text-[11px] shrink-0">{sig.dot}</span>}
                                  </div>
                                  <div className="text-sm leading-snug mb-1.5 line-clamp-2" style={{ color: 'var(--text)' }}>{t.subject}</div>
                                  {/* Solicitante + Responsável */}
                                  <div className="space-y-0.5 text-[10px] mb-1.5">
                                    <div className="truncate"><span style={{ color: 'var(--text-light)' }}>Solic.:</span> <span style={{ color: 'var(--text-muted)' }}>{t.solicitante_nome ?? t.requester_name ?? '—'}</span></div>
                                    <div className="flex items-center gap-1 truncate"><span style={{ color: 'var(--text-light)' }}>Resp.:</span>
                                      {t.assignee
                                        ? <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{iniciais(t.assignee.name)}</span><span style={{ color: 'var(--text-muted)' }}>{t.assignee.name}</span></span>
                                        : <span style={{ color: 'var(--text-light)' }}>não atribuído</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>
                                      {st && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ color: st.color ?? 'var(--text)', background: (st.color ?? '').startsWith('#') ? `${st.color}22` : 'var(--surface-sunken)', border: `1px solid ${st.color ?? 'var(--border)'}` }}>{st.label}</span>}
                                    </div>
                                    {t.customer && <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{t.customer.name}</span>}
                                  </div>
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
