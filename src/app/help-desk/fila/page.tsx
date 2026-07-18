'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { startSession, getSession } from '@/lib/help-desk-session'
import { Search, GripVertical, Plus, ChevronDown, SlidersHorizontal, LayoutGrid, List } from 'lucide-react'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useColumnOrder } from '@/lib/kanban-column-order'
import { NovoChamadoModal, type NovoChamadoMeta } from '@/components/help-desk/novo-chamado-modal'
import { HelpDeskGlobalSearch } from '@/components/help-desk/global-search'
import { MultiSelect } from '@/components/ui/multi-select'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'

interface Ref { id: number; name: string }
interface StatusOpt { id: number; key: string; label: string; color: string | null; sort_order: number; is_open: boolean; is_resolved?: boolean; is_terminal?: boolean; sla_paused?: boolean; allows_scheduling?: boolean }
interface Sla { first_response_breached: boolean; resolution_breached: boolean; first_response_overdue: boolean; resolution_overdue: boolean }
interface TicketRow {
  id: number; ticket_number: string | null; subject: string; priority: string; status_id: number | null
  team_id?: number | null; customer?: Ref | null; assignee?: Ref | null; sla?: Sla | null
  solicitante_nome?: string | null; requester_name?: string | null; created_at?: string | null
  scheduled_until?: string | null; scheduled_all_day?: boolean
  updated_at?: string | null; last_activity_at?: string | null; resolution_due_at?: string | null
  dias_sem_interacao?: number | null // dias úteis sem interação da equipe (0 = interagiu hoje)
}

const PRIO: Record<string, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  normal:  { label: 'Média',   color: 'var(--info-border)',    bg: 'var(--info-bg)' },
  alta:    { label: 'Alta',    color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  urgente: { label: 'Urgente', color: 'var(--danger-border)',  bg: 'var(--danger-bg)' },
}
function slaDot(sla?: Sla | null): { dot: string; title: string; color: string; short: string } {
  if (!sla) return { dot: '', title: '', color: 'var(--text-light)', short: '' }
  if (sla.first_response_breached || sla.resolution_breached) return { dot: '🔴', title: 'SLA estourado', color: 'var(--danger-border)', short: 'SLA estourado' }
  if (sla.first_response_overdue || sla.resolution_overdue) return { dot: '🟠', title: 'SLA vencendo', color: 'var(--warning-border)', short: 'SLA vencendo' }
  return { dot: '🟢', title: 'No prazo', color: 'var(--success-border)', short: 'SLA OK' }
}

// SLA situacional do card: "SLA OK / Vence em X / SLA estourado / SLA cumprido".
function slaChip(t: TicketRow, st?: StatusOpt): { icon: string; label: string; color: string; bg: string } {
  const D = { color: 'var(--danger-border)', bg: 'var(--danger-bg)' }
  const W = { color: 'var(--warning-border)', bg: 'var(--warning-bg)' }
  const G = { color: 'var(--success-border)', bg: 'var(--success-bg)' }
  const sla = t.sla
  if (sla && (sla.first_response_breached || sla.resolution_breached)) return { icon: '🔴', label: 'Estourado', ...D }
  if (st?.is_terminal || st?.is_resolved) return { icon: '🟢', label: 'OK', ...G }
  const due = t.resolution_due_at
  if (due) {
    const diff = new Date(due).getTime() - Date.now()
    if (diff < 0) return { icon: '🔴', label: 'Estourado', ...D }
    if (diff < 3600000) return { icon: '🟡', label: `Vence ${Math.max(1, Math.round(diff / 60000))}min`, ...W }
    if (diff < 24 * 3600000) return { icon: '🟡', label: `Vence ${Math.round(diff / 3600000)}h`, ...W }
    return { icon: '🟢', label: 'OK', ...G }
  }
  if (sla && (sla.first_response_overdue || sla.resolution_overdue)) return { icon: '🟡', label: 'Vencendo', ...W }
  return { icon: '🟢', label: 'OK', ...G }
}

// Cor da "última interação" conforme envelhece: recente=normal, 1-3d=âmbar, >3d=vermelho.
function interacaoColor(iso?: string | null): string {
  if (!iso) return 'var(--text-light)'
  const h = (Date.now() - new Date(iso).getTime()) / 3600000
  if (h < 24) return 'var(--text-muted)'
  if (h < 72) return 'var(--warning-border)'
  return 'var(--danger-border)'
}

// Data de abertura compacta (sem ano): "09/07 22:13".
const fmtAbertoCompact = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Tempo relativo p/ última interação: "há 18 min" / "há 3h" / "há 2d" / data se antigo.
const relativeTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `há ${days}d`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Agendamento compacto p/ o card: Hoje/Amanhã/data + hora; vermelho quando atrasado.
function agendaCompact(iso?: string | null, allDay?: boolean): { icon: string; text: string; color: string } | null {
  if (!iso) return null
  const d = new Date(iso); if (isNaN(d.getTime())) return null
  const now = Date.now()
  const dayMs = 86400000
  const midnight = (ms: number) => { const x = new Date(ms); x.setHours(0, 0, 0, 0); return x.getTime() }
  const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.getTime() < now) {
    const lateDays = Math.floor((midnight(now) - midnight(d.getTime())) / dayMs)
    return { icon: '🔴', text: lateDays >= 1 ? `Atrasado ${lateDays}d` : 'Atrasado', color: 'var(--danger-border)' }
  }
  const diffDays = Math.round((midnight(d.getTime()) - midnight(now)) / dayMs)
  const rel = diffDays === 0 ? 'Hoje' : diffDays === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return { icon: '📅', text: allDay ? rel : `${rel} • ${hhmm}`, color: diffDays === 0 ? 'var(--warning-border)' : 'var(--text-muted)' }
}

// Toggle persistido (LocalStorage) para os painéis recolhíveis do cabeçalho.
function useLocalBool(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(def)
  useEffect(() => { try { const s = localStorage.getItem(key); if (s != null) setV(s === '1') } catch { /* ignore */ } }, [key])
  const set = (nv: boolean) => { setV(nv); try { localStorage.setItem(key, nv ? '1' : '0') } catch { /* ignore */ } }
  return [v, set]
}

export default function HelpDeskFilaPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [teams, setTeams] = useState<Ref[]>([])
  const [local, setLocal] = useState<TicketRow[]>([])
  // Abertura de chamado INLINE (mesmo modal da lista de Chamados) — sem navegar de tela.
  const [novo, setNovo] = useState(false)
  const [novoMeta, setNovoMeta] = useState<NovoChamadoMeta | null>(null)
  const [customers, setCustomers] = useState<Ref[]>([])
  // Perfil de acesso: se este agente enxerga a coluna "Novo" (tickets ainda não distribuídos).
  const [seeNewColumn, setSeeNewColumn] = useState(true)
  const [canSearch, setCanSearch] = useState(true) // busca global (lupa) liberada?
  const [viewScope, setViewScope] = useState('all') // escopo de visão: 'all' vê de outros; 'assigned' só os próprios
  // Só faz sentido oferecer "apenas meus chamados" se o agente enxerga chamados além dos dele.
  const canSeeOthers = viewScope === 'all' || viewScope === 'parent' || viewScope === 'assigned_or_parent'
  // Filtro rápido dos cards/chips do resumo: '' | mine | team | open | sla | status:<id>.
  const [pendFilter, setPendFilter] = useState('') // filtro pelos cards de pendentes/indicadores/status
  const [view, setView] = useState<'kanban' | 'lista'>('kanban')          // visão do board: Kanban ou Lista
  const [f, setF] = useState({ search: '' })
  const [mine, setMine] = useState(false)
  const [mobFiltros, setMobFiltros] = useState(false)   // no mobile os filtros rápidos ficam num painel colapsável
  // Filtro de data de ABERTURA — padrão do sistema: Mês/Ano ou Período (de/até).
  const [dateMode, setDateMode] = useState<'month' | 'period'>('month')
  const [refMonth, setRefMonth] = useState<number | null>(null)
  const [refYear, setRefYear] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Filtros categóricos — TODOS multi-seleção com busca (client-side). Equipe guarda team_id (string);
  // consultor/cliente/solicitante guardam o nome (consultor aceita '__none__' = não atribuído); prioridade a chave.
  const [mf, setMf] = useState<{ team: string[]; consultor: string[]; cliente: string[]; solicitante: string[]; priority: string[] }>({ team: [], consultor: [], cliente: [], solicitante: [], priority: [] })
  const [semInteracao, setSemInteracao] = useState<string[]>([]) // faixas de dias úteis sem interação da equipe (multi: '1','2','3')
  // Painéis recolhíveis (progressive disclosure) — preferência salva no navegador.
  const [advOpen, setAdvOpen] = useLocalBool('hd_fila_adv', false)      // "Mais filtros" (Nível 3) — recolhido por padrão
  const [resumoOpen, setResumoOpen] = useLocalBool('hd_fila_resumo', false)  // Resumo por coluna — recolhido por padrão
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const setMulti = (k: keyof typeof mf, v: string[]) => setMf(s => ({ ...s, [k]: v }))

  // Opções derivadas dos chamados carregados.
  const opts = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
    return {
      consultores: uniq(local.map(t => t.assignee?.name)),
      clientes: uniq(local.map(t => t.customer?.name)),
      solicitantes: uniq(local.map(t => t.solicitante_nome)),
    }
  }, [local])

  // Data de abertura: por Mês/Ano (competência) ou por Período (de/até). Vazio = qualquer.
  const matchesDate = (iso?: string | null) => {
    if (dateMode === 'month') {
      if (refMonth == null || refYear == null) return true
      if (!iso) return false
      const d = new Date(iso)
      return d.getMonth() + 1 === refMonth && d.getFullYear() === refYear
    }
    if (!dateFrom && !dateTo) return true
    if (!iso) return false
    const t = new Date(iso).getTime()
    if (dateFrom && t < new Date(`${dateFrom}T00:00:00`).getTime()) return false
    if (dateTo && t > new Date(`${dateTo}T23:59:59`).getTime()) return false
    return true
  }

  // Predicado categórico multi (data + equipe + consultor + cliente + solicitante + prioridade). Sem "sem interação".
  const matchBase = useCallback((t: TicketRow) =>
    matchesDate(t.created_at)
    && (mf.team.length === 0 || (t.team_id != null && mf.team.includes(String(t.team_id))))
    && (mf.consultor.length === 0 || (t.assignee ? mf.consultor.includes(t.assignee.name) : mf.consultor.includes('__none__')))
    && (mf.cliente.length === 0 || (!!t.customer?.name && mf.cliente.includes(t.customer.name)))
    && (mf.solicitante.length === 0 || (!!t.solicitante_nome && mf.solicitante.includes(t.solicitante_nome)))
    && (mf.priority.length === 0 || mf.priority.includes(t.priority))
  , [dateMode, refMonth, refYear, dateFrom, dateTo, mf]) // eslint-disable-line react-hooks/exhaustive-deps
  // + "dias sem interação da equipe". Bate com a CONTAGEM/rótulo dos chips: '1'/'2' = EXATAMENTE
  // N dia(s); '3' = "3+ dias" = ≥ 3. (Antes filtrava ≥ N sempre → clicar "2 dias"=0 trazia os 3+.)
  const matchFilters = useCallback((t: TicketRow) => {
    if (!matchBase(t)) return false
    if (semInteracao.length === 0) return true
    const d = t.dias_sem_interacao ?? 0
    // faixa do ticket: '1'/'2' = exatamente; '3' = ≥3. d===0 não pertence a nenhuma faixa.
    const bucket = d >= 3 ? '3' : d === 2 ? '2' : d === 1 ? '1' : ''
    return bucket !== '' && semInteracao.includes(bucket)
  }, [matchBase, semInteracao])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: '500' })
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (mine) p.set('mine', '1')
    // ESCALA: empurra o filtro de data pro backend (índice created_at) — a fila carrega só o período
    // pedido, não "os 500 mais recentes de toda a história". Sem período → modo FILA (ativos + recentes).
    const pad = (n: number) => String(n).padStart(2, '0')
    let hasDate = false
    if (dateMode === 'month' && refMonth != null && refYear != null) {
      const last = new Date(refYear, refMonth, 0).getDate()
      p.set('created_from', `${refYear}-${pad(refMonth)}-01 00:00:00`)
      p.set('created_to', `${refYear}-${pad(refMonth)}-${pad(last)} 23:59:59`)
      hasDate = true
    } else if (dateMode === 'period' && (dateFrom || dateTo)) {
      if (dateFrom) p.set('created_from', `${dateFrom} 00:00:00`)
      if (dateTo) p.set('created_to', `${dateTo} 23:59:59`)
      hasDate = true
    }
    if (!hasDate) p.set('queue', '1')
    return p.toString()
  }, [f, mine, dateMode, refMonth, refYear, dateFrom, dateTo])

  const load = useCallback(() => {
    api.get<{ data: TicketRow[] }>(`/help-desk/tickets?${qs}`).then(r => setLocal(r?.data ?? [])).catch(() => toast.error('Erro ao carregar'))
  }, [qs])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: { statuses: StatusOpt[]; teams: Ref[]; see_new_column?: boolean } & NovoChamadoMeta }>('/help-desk/meta')
      .then(r => { setStatuses((r?.data?.statuses ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)); setTeams(r?.data?.teams ?? []); if (r?.data) setNovoMeta(r.data); setSeeNewColumn(r?.data?.see_new_column !== false); setCanSearch((r?.data as { can_search?: boolean })?.can_search !== false); setViewScope((r?.data as { view_scope?: string })?.view_scope ?? 'all') })
      .catch(() => {})
    // Clientes para o modal de novo chamado (mesma fonte da lista de Chamados).
    api.get<Ref[] | { data?: Ref[]; items?: Ref[] }>('/customers?pageSize=500')
      .then(r => {
        const list = Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])
        setCustomers(list.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
  }, [])

  // Ordem das colunas por usuário (arrasta o cabeçalho p/ reordenar).
  const { ordered: colOrder, headerProps } = useColumnOrder('fila', statuses.map(s => String(s.id)), user?.id)
  const orderedStatuses = useMemo(() => colOrder.map(id => statuses.find(s => String(s.id) === id)).filter(Boolean) as StatusOpt[], [colOrder, statuses])
  // Ids do status "Novo" — escondidos (coluna + tickets) quando o perfil não pode ver o pool não distribuído.
  const novoIds = useMemo(() => new Set(statuses.filter(s => s.key === 'novo').map(s => s.id)), [statuses])
  const isHiddenStatus = useCallback((sid: number | null | undefined) => !seeNewColumn && sid != null && novoIds.has(sid), [seeNewColumn, novoIds])
  const boardStatuses = useMemo(() => seeNewColumn ? orderedStatuses : orderedStatuses.filter(s => !novoIds.has(s.id)), [seeNewColumn, orderedStatuses, novoIds])

  const byColumn = useMemo(() => {
    const map: Record<number, TicketRow[]> = {}
    statuses.forEach(s => { map[s.id] = [] })
    local.filter(matchFilters).forEach(t => { if (t.status_id != null && map[t.status_id]) map[t.status_id].push(t) })
    return map
  }, [local, statuses, matchFilters])

  // Resumo por coluna (chips) + indicadores (cards).
  const statColumns = boardStatuses.map(s => ({ id: s.id, label: s.label, cor: s.color, count: (byColumn[s.id] ?? []).length }))
  const flt = local.filter(matchFilters).filter(t => !isHiddenStatus(t.status_id))
  const slaCnt = flt.reduce((a, t) => {
    const d = slaDot(t.sla).dot
    if (d === '🔴') a.r++; else if (d === '🟡') a.y++; else if (d === '🟢') a.g++
    return a
  }, { g: 0, y: 0, r: 0 })
  const statusById: Record<number, StatusOpt> = Object.fromEntries(statuses.map(s => [s.id, s]))
  const isPendente = (t: TicketRow) => { const s = t.status_id != null ? statusById[t.status_id] : null; return !!s && !s.is_terminal && !s.is_resolved }
  const abertos = flt.filter(isPendente).length
  // Chamados com reunião/agendamento marcado (Teams). "Reunião agendada" não é status próprio —
  // vem do agendamento (scheduled_until). O card abaixo filtra por isso.
  const agendados = flt.filter(t => !!t.scheduled_until).length
  // Pendência NOSSA = aberto, exceto "Aguardando cliente" (a bola está com o cliente, não conosco).
  const isNossaPendencia = (t: TicketRow) => { const s = t.status_id != null ? statusById[t.status_id] : null; return isPendente(t) && s?.key !== 'aguardando_cliente' }
  // Meus tickets pendentes — atribuídos a mim e com pendência nossa (independe dos filtros do board).
  const meusPendentes = user ? local.filter(t => t.assignee?.id === user.id && isNossaPendencia(t)).length : 0
  // Admin: pendentes de TODA a equipe (todos os responsáveis) com pendência nossa.
  const isAdmin = user?.type === 'admin'
  const pendentesEquipe = local.filter(isNossaPendencia).length
  // Filtro aplicado ao clicar nos cards de pendentes (filtra o board; cards seguem contando o total).
  const pendPass = (t: TicketRow) => {
    if (pendFilter === '') return true
    if (pendFilter === 'mine') return t.assignee?.id === user?.id && isNossaPendencia(t)
    if (pendFilter === 'team') return isNossaPendencia(t)
    if (pendFilter === 'open') return isPendente(t)
    if (pendFilter === 'sla') return slaDot(t.sla).dot !== '🔴' // "no prazo" = SLA não estourado
    if (pendFilter === 'scheduled') return !!t.scheduled_until // reunião/agendamento marcado (Teams)
    if (pendFilter.startsWith('status:')) return t.status_id === Number(pendFilter.slice(7))
    return true
  }
  // Visão em LISTA — mesmos filtros do board, mais recente primeiro.
  const listRows = flt.filter(pendPass).slice().sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
  // Chamados sem interação da EQUIPE (resposta do cliente não zera). Buckets calculados SEM aplicar o
  // próprio filtro de sem-interação (senão zerariam ao filtrar) — os números do card são SELETORES:
  // clicar aplica o filtro ≥ N dias úteis. Principal = ≥ 3 dias; 1 e 2 dias detalham abaixo.
  const fltNoSI = local.filter(matchBase)
  const semInt1 = fltNoSI.filter(t => (t.dias_sem_interacao ?? 0) === 1).length
  const semInt2 = fltNoSI.filter(t => (t.dias_sem_interacao ?? 0) === 2).length
  const semInt3 = fltNoSI.filter(t => (t.dias_sem_interacao ?? 0) >= 3).length
  const totalFila = flt.length
  // % SLA = chamados NÃO estourados sobre o total (cor por saúde).
  const pctSlaFila = totalFila > 0 ? Math.round(((totalFila - slaCnt.r) / totalFila) * 100) : 100
  const slaCorFila = pctSlaFila >= 90 ? '#16a34a' : pctSlaFila >= 70 ? '#f59e0b' : '#ef4444'
  const statMetrics: { label: string; value: number | string; cor: string; hint?: string; highlight?: boolean; icon?: string; onClick?: () => void; active?: boolean }[] = [
    { label: 'Meus pendentes', value: meusPendentes, cor: '#14b8a6', hint: 'clique para filtrar', icon: '👤', onClick: () => setPendFilter(p => p === 'mine' ? '' : 'mine'), active: pendFilter === 'mine' },
    ...(isAdmin ? [{ label: 'Pendentes da equipe', value: pendentesEquipe, cor: '#8b5cf6', hint: 'clique para filtrar', icon: '👥', onClick: () => setPendFilter(p => p === 'team' ? '' : 'team'), active: pendFilter === 'team' }] : []),
    { label: 'Total', value: totalFila, cor: '#64748b', hint: pendFilter ? 'clique para ver todos' : undefined, onClick: () => setPendFilter('') },
    { label: 'Abertos', value: abertos, cor: '#3b82f6', hint: 'clique para filtrar', onClick: () => setPendFilter(p => p === 'open' ? '' : 'open'), active: pendFilter === 'open' },
    { label: 'Agendados', value: agendados, cor: '#6366f1', icon: '📅', hint: 'reuniões marcadas · clique p/ ver', onClick: () => setPendFilter(p => p === 'scheduled' ? '' : 'scheduled'), active: pendFilter === 'scheduled' },
    { label: '% SLA no prazo', value: `${pctSlaFila}%`, hint: pendFilter === 'sla' ? undefined : `${totalFila - slaCnt.r} de ${totalFila} no prazo`, cor: slaCorFila, onClick: () => setPendFilter(p => p === 'sla' ? '' : 'sla'), active: pendFilter === 'sla' },
  ]

  // Modo Atendimento — restaura filtros da sessão ao voltar para a fila.
  useEffect(() => {
    const s = getSession()
    if (s?.source !== 'kanban') return
    setF(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s.filters).filter(([k]) => k in prev && typeof s.filters[k] === 'string')) as { search: string } }))
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
      <div className="space-y-2">
        {/* ─── NÍVEL 1 — BUSCA GLOBAL: 1ª informação, largura total, isolada dos filtros. */}
        {canSearch && <HelpDeskGlobalSearch onOpen={(tid) => router.push(`/help-desk/tickets/${tid}`)} />}

        {/* Barra fixa (sticky): filtros rápidos + ações. */}
        <div className="sticky top-0 z-20 space-y-2 pb-2" style={{ background: 'var(--bg)' }}>
          {/* ─── NÍVEL 2 — filtros mais usados (esq.) · Modo isolado + Novo chamado (dir.) */}
          <div className="flex items-start gap-2">
            {/* Mobile: filtros rápidos ficam num painel colapsável ("Filtros"). Desktop (md+): sempre inline. */}
            <button onClick={() => setMobFiltros(o => !o)}
              className="md:hidden inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg shrink-0"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
              <SlidersHorizontal size={14} /> Filtros <ChevronDown size={14} style={{ transform: mobFiltros ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            <div className={`${mobFiltros ? 'flex' : 'hidden'} md:flex items-center gap-2 flex-wrap lg:flex-nowrap min-w-0`}>
              {/* Busca local (filtra só esta fila) */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input className={`${fieldCls} pl-8 w-44`} style={inputStyle} placeholder="Filtrar nesta fila…" value={f.search} onChange={e => set('search', e.target.value)} />
              </div>
              {/* Período (data de abertura): Mês/Ano ou intervalo */}
              <div className="inline-flex items-center gap-1.5">
                <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--border)' }}>
                  {(['month', 'period'] as const).map(mode => (
                    <button key={mode} onClick={() => setDateMode(mode)} className="px-2.5 py-1.5 font-medium transition-colors"
                      style={{ background: dateMode === mode ? 'var(--primary)' : 'transparent', color: dateMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                      {mode === 'month' ? 'Mês/Ano' : 'Período'}
                    </button>
                  ))}
                </div>
                {dateMode === 'month'
                  ? <MonthYearPicker month={refMonth} year={refYear} onChange={(m, y) => { if (!m) { setRefMonth(null); setRefYear(null) } else { setRefMonth(m); setRefYear(y) } }} />
                  : <DateRangePicker from={dateFrom} to={dateTo} onChange={(fr, to) => { setDateFrom(fr); setDateTo(to) }} />}
              </div>
              {/* Consultor · Cliente — filtros categóricos visíveis (Equipe/Solicitante/Prioridade em "Mais filtros") */}
              <MultiSelect placeholder="Consultor" value={mf.consultor} onChange={v => setMulti('consultor', v)} options={[{ id: '__none__', name: '— Não atribuído —' }, ...opts.consultores.map(n => ({ id: n, name: n }))]} />
              <MultiSelect placeholder="Cliente" value={mf.cliente} onChange={v => setMulti('cliente', v)} options={opts.clientes.map(n => ({ id: n, name: n }))} />
            </div>
            {/* Espaçador flexível — empurra as ações pra direita sem brigar com o wrap dos filtros
                (evita o conflito flex-1 + ml-auto que colapsava/encavalava a barra). */}
            <div className="hidden lg:block flex-1" />
            {/* Ações à direita — Mais filtros + visão (Kanban/Lista) + Novo chamado (extremo direito, destaque). */}
            <div className="flex items-center gap-2 shrink-0">
              {/* NÍVEL 3 — Mais filtros (recolhido por padrão) — ocupa o espaço livre à direita, antes da visão */}
              <button onClick={() => setAdvOpen(!advOpen)} className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg shrink-0"
                style={{ border: '1px solid var(--border)', background: advOpen ? 'var(--surface-hover)' : 'var(--surface)', color: 'var(--text-muted)' }}>
                Mais filtros <ChevronDown size={14} style={{ transform: advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }} title="Alternar visão">
                {([['kanban', 'Kanban', LayoutGrid], ['lista', 'Lista', List]] as const).map(([v, lbl, Ic]) => (
                  <button key={v} onClick={() => setView(v)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 transition"
                    style={{ background: view === v ? 'var(--primary)' : 'transparent', color: view === v ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                    <Ic size={13} /> {lbl}
                  </button>
                ))}
              </div>
              <button onClick={() => setNovo(true)} title="Abrir novo chamado"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 ml-1 transition hover:opacity-90"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Novo chamado</button>
            </div>
          </div>

          {/* NÍVEL 3 — painel de filtros avançados (aberto sob demanda): Equipe + Cliente + Solicitante
              + Prioridade + "apenas meus chamados". Recolhido por padrão → some da linha principal. */}
          {advOpen && (
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide mr-1" style={{ color: 'var(--text-light)' }}>Mais filtros</span>
              <MultiSelect placeholder="Equipe" value={mf.team} onChange={v => setMulti('team', v)} options={teams.map(t => ({ id: t.id, name: t.name }))} />
              <MultiSelect placeholder="Solicitante" value={mf.solicitante} onChange={v => setMulti('solicitante', v)} options={opts.solicitantes.map(n => ({ id: n, name: n }))} />
              <MultiSelect placeholder="Prioridade" value={mf.priority} onChange={v => setMulti('priority', v)} options={Object.keys(PRIO).map(p => ({ id: p, name: PRIO[p].label }))} />
              {canSeeOthers && (
                <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none ml-1" style={{ color: mine ? 'var(--primary)' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 15, height: 15, cursor: 'pointer' }} />
                  Mostrar apenas meus chamados
                </label>
              )}
              <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Filtro de dias sem interação: use os números no card à direita.</span>
            </div>
          )}
        </div>

        {/* RESUMO + INDICADORES — acordeões recolhidos por padrão (Modo Gestão abre os dois). */}
        {orderedStatuses.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={() => setResumoOpen(!resumoOpen)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                <ChevronDown size={13} style={{ transform: resumoOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} /> Resumo
              </button>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Indicadores</span>
            </div>
            {resumoOpen && (
              <div className="flex flex-wrap gap-1.5">
                {statColumns.map((c) => {
                  // Chip por STATUS = filtro clicável. Dinâmico: novo status já entra clicável.
                  const key = `status:${c.id}`
                  const on = pendFilter === key
                  return (
                    <button key={c.id} onClick={() => setPendFilter(p => p === key ? '' : key)}
                      title={on ? 'Filtrando por este status — clique para limpar' : `Filtrar por status: ${c.label}`}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors ds-row-hover"
                      style={on
                        ? { border: `1px solid ${c.cor ?? 'var(--primary)'}`, background: 'var(--surface-hover)', boxShadow: `0 0 0 2px ${c.cor ?? 'var(--primary)'}` }
                        : { border: '1px solid var(--border)', background: 'var(--surface)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: c.cor ?? 'var(--text-muted)' }} />
                      <span style={{ color: on ? (c.cor ?? 'var(--text)') : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}>{c.label}</span>
                      <span className="font-bold" style={{ color: 'var(--text)' }}>{c.count}</span>
                      {on && <span style={{ color: c.cor ?? 'var(--text)' }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {(
              <div className="flex gap-2 overflow-x-auto pb-1">
                {statMetrics.map((m, i) => (
                  <div key={i} onClick={m.onClick}
                    className={`ds-card px-3 py-1 min-w-[120px] shrink-0 ${m.highlight ? 'hd-pulse' : ''} ${m.onClick ? 'cursor-pointer ds-row-hover' : ''}`}
                    style={m.active
                      ? { border: `2px solid ${m.cor}`, background: `${m.cor}2e`, boxShadow: `0 0 0 3px ${m.cor}55` }
                      : m.highlight
                      ? { border: `2px solid ${m.cor}`, background: `${m.cor}26`, boxShadow: `0 0 0 3px ${m.cor}22` }
                      : { borderLeft: `3px solid ${m.cor}`, background: `${m.cor}12` }}>
                    <div className="flex items-center gap-1.5">
                      {m.icon && <span className="text-base leading-none">{m.icon}</span>}
                      <div className={`${m.highlight ? 'text-2xl' : 'text-xl'} font-bold leading-none`} style={{ color: m.cor }}>{m.value}</div>
                    </div>
                    <div className={`text-[11px] mt-1 leading-tight ${(m.highlight || m.active) ? 'font-semibold' : ''}`} style={{ color: (m.highlight || m.active) ? m.cor : 'var(--text-muted)' }}>{m.label}{m.active && ' ✓'}</div>
                    <div className="text-[10px] leading-tight" style={{ color: m.active ? m.cor : 'var(--text-light)' }}>{m.active ? 'filtrando · clique p/ limpar' : (m.hint ?? '')}</div>
                  </div>
                ))}
                {/* Card em DESTAQUE — no FINAL (direita), cresce pra preencher o espaço restante.
                    Principal = ≥3 dias úteis sem interação da equipe; 1 e 2 dias detalham abaixo. */}
                <div className={`ds-card px-4 py-1 flex-1 min-w-[240px] ${semInt3 > 0 ? 'hd-pulse' : ''}`}
                  style={semInt3 > 0
                    ? { border: '2px solid #ef4444', background: '#ef444426', boxShadow: '0 0 0 3px #ef444422' }
                    : { borderLeft: '3px solid #16a34a', background: '#16a34a12' }}>
                  {/* Título + instrução clara de que os botões abaixo FILTRAM */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">⏳</span>
                    <span className="text-[11px] font-semibold" style={{ color: semInt3 > 0 ? '#ef4444' : 'var(--text-muted)' }}>Sem interação da equipe</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>— clique para filtrar (pode marcar mais de uma faixa):</span>
                    {semInteracao.length > 0 && <button onClick={() => setSemInteracao([])} className="text-[11px] font-semibold ml-auto px-2 py-0.5 rounded-md border inline-flex items-center gap-1 cursor-pointer" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }} title="Limpar filtro">✕ Limpar filtro</button>}
                  </div>
                  {/* Três chips de filtro (parecem botões de verdade): 1 dia · 2 dias · 3+ dias */}
                  <div className="flex gap-1.5 mt-1">
                    {([['1', semInt1, '1 dia', 'var(--warning-border)', 'var(--warning-bg)'], ['2', semInt2, '2 dias', 'var(--warning-border)', 'var(--warning-bg)'], ['3', semInt3, '3+ dias', '#ef4444', '#ef444426']] as const).map(([v, n, lbl, color, bg]) => {
                      const on = semInteracao.includes(v)    // SELECIONADO (filtrando) → chip preenchido sólido + ✓
                      const critical = v === '3' && n > 0 && !on  // "3+ dias" com casos = alerta (só quando NÃO selecionado)
                      return (
                        <button key={v} onClick={() => setSemInteracao(cur => cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])} title={on ? 'Filtrando — clique para remover' : `Filtrar: ${v === '3' ? '≥ 3 dias úteis' : `exatamente ${v} dia(s) útil(eis)`} sem interação da equipe`}
                          className={`inline-flex items-center gap-1.5 rounded-lg border cursor-pointer transition-colors ${on ? 'px-2.5 py-1 font-semibold' : 'px-2.5 py-1 ds-row-hover'} ${critical ? 'hd-pulse' : ''}`}
                          style={on
                            ? { borderColor: color, background: color, boxShadow: `0 0 0 2px ${color}44` }
                            : { borderColor: critical ? color : 'var(--border)', background: critical ? bg : 'var(--surface)', boxShadow: critical ? `0 0 0 2px ${color}33` : 'none' }}>
                          {on && <span className="text-xs leading-none" style={{ color: '#fff' }}>✓</span>}
                          <span className="text-base font-bold leading-none" style={{ color: on ? '#fff' : color }}>{n}</span>
                          <span className="text-[11px]" style={{ color: on ? '#fff' : (critical ? color : 'var(--text-muted)') }}>{lbl}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'lista' ? (
          <div className="ds-card overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-light)' }}>
                  {['Nº', 'Assunto', 'Cliente', 'Responsável', 'Status', 'SLA', 'Atualizado'].map(h => (
                    <th key={h} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide border-b" style={{ borderColor: 'var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listRows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum chamado.</td></tr>}
                {listRows.map(t => {
                  const st = statuses.find(s => s.id === t.status_id)
                  const sla = slaChip(t, st)
                  return (
                    <tr key={t.id} onClick={() => openTicket(t.id)} className="cursor-pointer ds-row-hover border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t.ticket_number ?? `#${t.id}`}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{t.subject}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t.customer?.name ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: t.assignee ? 'var(--text-muted)' : 'var(--text-light)' }}>{t.assignee?.name ?? 'Não atribuído'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{st && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: st.color ?? 'var(--text)', background: (st.color ?? '').startsWith('#') ? `${st.color}22` : 'var(--surface-sunken)', border: `1px solid ${st.color ?? 'var(--border)'}` }}>{st.label}</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: sla.color, background: sla.bg }}>{sla.icon} {sla.label}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-light)' }}>{(t.updated_at || t.created_at) ? new Date((t.updated_at || t.created_at) as string).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {boardStatuses.map(col => {
              const items = (byColumn[col.id] ?? []).filter(pendPass)
              return (
                <Droppable droppableId={String(col.id)} key={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className="rounded-lg p-2 flex flex-col shrink-0 w-72"
                      style={{ background: snapshot.isDraggingOver ? 'var(--surface-hover)' : 'var(--surface)', border: '1px solid var(--border)', minHeight: 200, transition: 'background .12s ease' }}>
                      <div className="flex items-center justify-between mb-2 px-1 rounded" title="Arraste para reordenar a coluna" {...headerProps(String(col.id))}>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: col.color ?? 'var(--text-muted)' }}>
                          <GripVertical size={12} style={{ color: 'var(--text-light)', opacity: 0.6 }} />
                          <span className="w-2 h-2 rounded-full" style={{ background: col.color ?? 'var(--text-muted)' }} />{col.label}
                        </span>
                        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{items.length}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        {items.map((t, idx) => {
                          const prio = PRIO[t.priority] ?? PRIO.normal
                          const st = statuses.find(s => s.id === t.status_id)
                          const sla = slaChip(t, st)
                          const ag = agendaCompact(t.scheduled_until, t.scheduled_all_day)
                          const inter = t.last_activity_at ?? t.updated_at
                          return (
                            <Draggable key={t.id} draggableId={String(t.id)} index={idx} isDragDisabled>
                              {(prov, snap) => (
                                <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                                  onClick={() => openTicket(t.id)}
                                  className="ds-card cursor-pointer pl-2.5 pr-2 py-1.5 leading-tight space-y-0.5"
                                  title={`Prioridade: ${prio.label}`}
                                  style={{ ...prov.draggableProps.style, borderLeft: `3px solid ${prio.color}`, boxShadow: snap.isDragging ? '0 4px 12px rgba(0,0,0,.18)' : undefined }}>
                                  {/* 1 — Código (protagonista) + badge de SLA à direita */}
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[16px] font-bold leading-none" style={{ color: 'var(--text)' }}>{t.ticket_number ?? `#${t.id}`}</span>
                                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: sla.color, background: sla.bg }}>{sla.icon} {sla.label}</span>
                                  </div>
                                  {/* 2 — Título */}
                                  <div className="text-[12px] font-semibold line-clamp-2" style={{ color: 'var(--text)' }}>{t.subject}</div>
                                  {/* 3 — Cliente */}
                                  {t.customer?.name && <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>🏢 {t.customer.name}</div>}
                                  {/* 4 — Responsável • Solicitante (uma linha) */}
                                  <div className="flex items-center gap-1.5 text-[10px] min-w-0" style={{ color: 'var(--text-muted)' }}>
                                    {t.assignee
                                      ? <span className="truncate">👤 {t.assignee.name}</span>
                                      : <span className="font-semibold whitespace-nowrap" style={{ color: 'var(--warning-border)' }}>⚠ Não atribuído</span>}
                                    {(t.solicitante_nome || t.requester_name) && <><span style={{ color: 'var(--text-light)' }}>•</span><span className="truncate">🧑 {t.solicitante_nome ?? t.requester_name}</span></>}
                                  </div>
                                  {/* 5 — Datas agrupadas (abertura • última interação • agendamento) */}
                                  <div className="flex items-center gap-1.5 text-[10px] flex-wrap" style={{ color: 'var(--text-light)' }}>
                                    {t.created_at && <span className="whitespace-nowrap">📅 {fmtAbertoCompact(t.created_at)}</span>}
                                    {inter && <><span>•</span><span className="whitespace-nowrap" style={{ color: interacaoColor(inter) }}>💬 {relativeTime(inter)}</span></>}
                                    {ag && <><span>•</span><span className="whitespace-nowrap" style={{ color: ag.color }}>📆 Ag. {ag.text}</span></>}
                                    {(t.dias_sem_interacao ?? 0) >= 1 && <span className="whitespace-nowrap font-semibold" title="Dias úteis sem interação da equipe"
                                      style={{ color: (t.dias_sem_interacao ?? 0) >= 3 ? 'var(--danger-border)' : (t.dias_sem_interacao ?? 0) >= 2 ? '#f97316' : 'var(--warning-border)' }}>⏳ {t.dias_sem_interacao}d s/ resposta</span>}
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
        )}
        {user && mine && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mostrando apenas chamados atribuídos a você.</p>}
      </div>
      {novo && <NovoChamadoModal meta={novoMeta} customers={customers} onClose={() => setNovo(false)} onCreated={(id) => { setNovo(false); router.push(`/help-desk/tickets/${id}`) }} />}
    </AppLayout>
  )
}
