'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { startSession, getSession } from '@/lib/help-desk-session'
import { Search, GripVertical, Plus, ChevronDown, SlidersHorizontal, LayoutGrid, List, Hash, User, RefreshCw } from 'lucide-react'
import { TicketTabs } from '@/components/help-desk/ticket-tabs'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useColumnOrder } from '@/lib/kanban-column-order'
import { NovoChamadoModal, type NovoChamadoMeta } from '@/components/help-desk/novo-chamado-modal'
import { MultiSelect } from '@/components/ui/multi-select'
import { TicketBulkBar } from '@/components/help-desk/ticket-bulk-bar'

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
  last_agent_activity_at?: string | null // última interação DA EQUIPE (nota/resposta interna)
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

// Cache dos tickets carregados por query (qs): ao VOLTAR pra fila (mesma visão) hidrata do cache e
// NÃO refaz o fetch. Cap simples pra não crescer. Mudança de filtro (qs novo) busca normalmente.
const filaCache = new Map<string, TicketRow[]>()
function cacheFila(qs: string, d: TicketRow[]) { filaCache.set(qs, d); if (filaCache.size > 15) filaCache.delete(filaCache.keys().next().value as string) }

export default function HelpDeskFilaPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [teams, setTeams] = useState<Ref[]>([])
  const [local, setLocal] = useState<TicketRow[]>([])
  // Seleção p/ atualização em massa (só na view Lista).
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [agents, setAgents] = useState<Ref[]>([])
  const toggleSel = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Abertura de chamado INLINE (mesmo modal da lista de Chamados) — sem navegar de tela.
  const [novo, setNovo] = useState(false)
  const [novoMeta, setNovoMeta] = useState<NovoChamadoMeta | null>(null)
  const [customers, setCustomers] = useState<Ref[]>([])
  // Perfil de acesso: se este agente enxerga a coluna "Novo" (tickets ainda não distribuídos).
  const [seeNewColumn, setSeeNewColumn] = useState(true)
  const [viewScope, setViewScope] = useState('all') // escopo de visão: 'all' vê de outros; 'assigned' só os próprios
  // Só faz sentido oferecer "apenas meus chamados" se o agente enxerga chamados além dos dele.
  const canSeeOthers = viewScope === 'all' || viewScope === 'parent' || viewScope === 'assigned_or_parent'
  // Filtro rápido dos cards/chips do resumo: '' | mine | team | open | sla | status:<id>.
  const [pendFilter, setPendFilter] = useState('') // filtro pelos cards de pendentes/indicadores (mine/team/open/sla/scheduled)
  const [statusSel, setStatusSel] = useState<number[]>([]) // chips de status — MULTI-seleção
  const [listSort, setListSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'updated', dir: 'desc' }) // ordenação da Lista
  const [view, setView] = useState<'kanban' | 'lista'>('lista')          // visão do board: abre sempre em Lista
  const [f, setF] = useState({ search: '', ticket: '' })
  const [loaded, setLoaded] = useState('') // "<search> <ticket>" que o `local` já reflete (busca server-side concluída)
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
  const [resumoOpen, setResumoOpen] = useLocalBool('hd_fila_resumo', false)  // Resumo por coluna — recolhido por padrão
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const setMulti = (k: keyof typeof mf, v: string[]) => setMf(s => ({ ...s, [k]: v }))
  // Limpar TODOS os filtros da página de uma vez.
  const clearAll = () => {
    setF({ search: '', ticket: '' })
    setMf({ team: [], consultor: [], cliente: [], solicitante: [], priority: [] })
    setDateMode('month'); setRefMonth(null); setRefYear(null); setDateFrom(''); setDateTo('')
    setSemInteracao([]); setPendFilter(''); setStatusSel([]); setMine(false)
  }

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
  const matchBase = useCallback((t: TicketRow) => {
    // Feedback INSTANTÂNEO da busca/nº: enquanto o backend (que também varre o CONTEÚDO) ainda não
    // respondeu o termo atual, filtra na hora pelos campos já carregados (assunto/cliente/pessoa/nº).
    // Quando o servidor responde (loaded === termo), sai de cena e a lista passa a ser a do backend
    // (incl. matches por conteúdo, que o client não enxerga). Vale ao digitar E ao apagar.
    if (`${f.search} ${f.ticket}` !== loaded) {
      if (f.search) {
        const q = f.search.toLowerCase()
        if (![t.subject, t.ticket_number, t.customer?.name, t.solicitante_nome, t.assignee?.name].some(x => (x || '').toLowerCase().includes(q))) return false
      }
      if (f.ticket && !(t.ticket_number || '').toLowerCase().includes(f.ticket.toLowerCase())) return false
    }
    return matchesDate(t.created_at)
      && (mf.team.length === 0 || (t.team_id != null && mf.team.includes(String(t.team_id))))
      && (mf.consultor.length === 0 || (t.assignee ? mf.consultor.includes(t.assignee.name) : mf.consultor.includes('__none__')))
      && (mf.cliente.length === 0 || (!!t.customer?.name && mf.cliente.includes(t.customer.name)))
      && (mf.solicitante.length === 0 || (!!t.solicitante_nome && mf.solicitante.includes(t.solicitante_nome)))
      && (mf.priority.length === 0 || mf.priority.includes(t.priority))
  }, [dateMode, refMonth, refYear, dateFrom, dateTo, mf, f.search, f.ticket, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const p = new URLSearchParams({ limit: '200' })
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
    const key = `${f.search} ${f.ticket}`
    api.get<{ data: TicketRow[] }>(`/help-desk/tickets?${qs}`).then(r => { const d = r?.data ?? []; setLocal(d); setLoaded(key); cacheFila(qs, d) }).catch(() => toast.error('Erro ao carregar'))
  }, [qs, f.search, f.ticket])
  // Botão Atualizar: recarrega a lista (chamados novos/atualizados) sem F5.
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(() => {
    setRefreshing(true)
    load()
    window.setTimeout(() => setRefreshing(false), 700)
  }, [load])
  // 1ª carga: se voltamos pra uma visão já carregada (mesmo qs), hidrata do cache p/ pintar
  // instantâneo — MAS revalida em background (stale-while-revalidate), senão o status muda no
  // detalhe e a fila fica velha até dar refresh manual. Mudanças de filtro recarregam c/ debounce.
  const firstLoad = useRef(true)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      const cached = filaCache.get(qs)
      if (cached) { setLocal(cached); setLoaded(`${f.search} ${f.ticket}`) }
      load(); return
    }
    const t = setTimeout(() => load(), 350); return () => clearTimeout(t)
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  // Revalida ao voltar o foco à aba/janela (troca de aba, volta do detalhe em nova aba etc.).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [load])
  useEffect(() => {
    api.get<{ data: { statuses: StatusOpt[]; teams: Ref[]; see_new_column?: boolean } & NovoChamadoMeta }>('/help-desk/meta')
      .then(r => { setStatuses((r?.data?.statuses ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)); setTeams(r?.data?.teams ?? []); if (r?.data) setNovoMeta(r.data); setSeeNewColumn(r?.data?.see_new_column !== false); setViewScope((r?.data as { view_scope?: string })?.view_scope ?? 'all') })
      .catch(() => {})
  }, [])
  // Agentes (para o picker de Responsável na ação em massa).
  useEffect(() => { api.get<{ data: Ref[] }>('/help-desk/agents').then(r => setAgents(r?.data ?? [])).catch(() => {}) }, [])
  // Clientes (p/ o modal "Novo chamado") — LAZY: só busca ao abrir o modal, fora do caminho crítico da carga
  // inicial (o backend free processa as chamadas em fila; tirar 1 request acelera a abertura da fila).
  const loadCustomers = useCallback(() => {
    if (customers.length) return
    api.get<Ref[] | { data?: Ref[]; items?: Ref[] }>('/customers?pageSize=500')
      .then(r => {
        const list = Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])
        setCustomers(list.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
  }, [customers.length])

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
  // Chamados NOVOS = status inicial "Novo" (recém-criados, ainda sem triagem/atendimento).
  const isNovo = (t: TicketRow) => { const s = t.status_id != null ? statusById[t.status_id] : null; return s?.key === 'novo' }
  const novos = flt.filter(isNovo).length
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
    // Status: MULTI-seleção (independente dos cards). Vazio = todos.
    if (statusSel.length > 0 && !(t.status_id != null && statusSel.includes(t.status_id))) return false
    if (pendFilter === '') return true
    if (pendFilter === 'mine') return t.assignee?.id === user?.id && isNossaPendencia(t)
    if (pendFilter === 'team') return isNossaPendencia(t)
    if (pendFilter === 'open') return isPendente(t)
    if (pendFilter === 'novos') return isNovo(t)
    if (pendFilter === 'sla') return slaDot(t.sla).dot !== '🔴' // "no prazo" = SLA não estourado
    if (pendFilter === 'scheduled') return !!t.scheduled_until // reunião/agendamento marcado (Teams)
    return true
  }
  // Visão em LISTA — colunas ordenáveis. get() devolve o valor comparável de cada coluna.
  const tt = (v?: string | null) => (v ? new Date(v).getTime() : 0)
  const listCols: { key: string; label: string; num?: boolean; get: (t: TicketRow) => number | string }[] = [
    { key: 'ticket', label: 'Nº', num: true, get: t => Number(t.ticket_number) || t.id },
    { key: 'subject', label: 'Assunto', get: t => (t.subject || '').toLowerCase() },
    { key: 'customer', label: 'Cliente', get: t => (t.customer?.name || '').toLowerCase() },
    { key: 'solicitante', label: 'Solicitante', get: t => (t.solicitante_nome || '').toLowerCase() },
    { key: 'assignee', label: 'Responsável', get: t => (t.assignee?.name || '').toLowerCase() },
    { key: 'status', label: 'Status', num: true, get: t => statuses.find(s => s.id === t.status_id)?.sort_order ?? 999 },
    { key: 'sla', label: 'SLA', num: true, get: t => t.resolution_due_at ? tt(t.resolution_due_at) : Number.MAX_SAFE_INTEGER },
    { key: 'created', label: 'Abertura', num: true, get: t => tt(t.created_at) },
    { key: 'lastint', label: 'Últ. interação interna', num: true, get: t => tt(t.last_agent_activity_at) },
    { key: 'updated', label: 'Atualizado', num: true, get: t => tt(t.updated_at ?? t.created_at) },
  ]
  const listCol = listCols.find(c => c.key === listSort.col) ?? listCols[listCols.length - 1]
  const listRows = flt.filter(pendPass).slice().sort((a, b) => {
    const va = listCol.get(a), vb = listCol.get(b)
    const r = listCol.num ? (va as number) - (vb as number) : String(va).localeCompare(String(vb))
    return listSort.dir === 'asc' ? r : -r
  })
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
    { label: 'Novos', value: novos, cor: '#0ea5e9', icon: '🆕', highlight: true, hint: 'clique para filtrar', onClick: () => setPendFilter(p => p === 'novos' ? '' : 'novos'), active: pendFilter === 'novos' },
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
  // Prefetch: aquece o bundle da tela de detalhe (o chunk é compartilhado entre todos os tickets) e o
  // RSC do ticket — ao clicar, já está pronto (evita o download frio dos ~25 chunks na 1ª abertura).
  const prefetchTicket = useCallback((ticketId: number) => { router.prefetch(`/help-desk/tickets/${ticketId}`) }, [router])
  useEffect(() => { const fid = local[0]?.id; if (fid) prefetchTicket(fid) }, [local, prefetchTicket]) // aquece o bundle assim que a lista carrega

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
        <TicketTabs />
        {/* Barra de filtros rápidos + ações — rola junto com o conteúdo (não fixa). */}
        <div className="space-y-2 pb-2" style={{ background: 'var(--bg)' }}>
          {/* ─── NÍVEL 2 — filtros mais usados (esq.) · Modo isolado + Novo chamado (dir.) */}
          <div className="flex items-start gap-2">
            {/* Mobile: filtros rápidos ficam num painel colapsável ("Filtros"). Desktop (md+): sempre inline. */}
            <button onClick={() => setMobFiltros(o => !o)}
              className="md:hidden inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg shrink-0"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
              <SlidersHorizontal size={14} /> Filtros <ChevronDown size={14} style={{ transform: mobFiltros ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            <div className={`${mobFiltros ? 'flex' : 'hidden'} md:flex items-center gap-2 flex-wrap min-w-0`}>
              {/* Busca ÚNICA — respeita todos os filtros da página (assunto, cliente, pessoa, conteúdo) */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input className={`${fieldCls} pl-8 w-52`} style={inputStyle} placeholder="Buscar: assunto, cliente, pessoa, conteúdo…" value={f.search} onChange={e => set('search', e.target.value)} />
              </div>
              {/* Filtro dedicado por NÚMERO do chamado */}
              <div className="relative">
                <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input className={`${fieldCls} pl-8 w-32`} style={inputStyle} placeholder="Nº do ticket" inputMode="numeric" value={f.ticket} onChange={e => set('ticket', e.target.value)} />
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
              {/* Botão "Meus chamados" — só os atribuídos a mim (substitui o antigo checkbox do painel) */}
              {canSeeOthers && (
                <button onClick={() => setMine(m => !m)} title="Mostrar apenas os chamados atribuídos a mim"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0"
                  style={mine
                    ? { border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--primary-fg)' }
                    : { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
                  <User size={13} /> Meus chamados
                </button>
              )}
              {/* Limpar TODOS os filtros — aparece quando há qualquer filtro ativo */}
              {(f.search || f.ticket || mf.team.length || mf.consultor.length || mf.cliente.length || mf.solicitante.length || mf.priority.length || semInteracao.length || statusSel.length || pendFilter || mine || refMonth != null || dateFrom || dateTo) ? (
                <button onClick={clearAll} title="Limpar todos os filtros da página"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
                  ✕ Limpar filtros
                </button>
              ) : null}
            </div>
            {/* Espaçador flexível — empurra as ações pra direita sem brigar com o wrap dos filtros
                (evita o conflito flex-1 + ml-auto que colapsava/encavalava a barra). */}
            <div className="hidden lg:block flex-1" />
            {/* Ações à direita — visão (Kanban/Lista) + Novo chamado (extremo direito, destaque). */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={refresh} disabled={refreshing} title="Atualizar — buscar chamados novos ou atualizados"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition hover:opacity-90 disabled:opacity-60"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar
              </button>
              <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }} title="Alternar visão">
                {([['kanban', 'Kanban', LayoutGrid], ['lista', 'Lista', List]] as const).map(([v, lbl, Ic]) => (
                  <button key={v} onClick={() => setView(v)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 transition"
                    style={{ background: view === v ? 'var(--primary)' : 'transparent', color: view === v ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                    <Ic size={13} /> {lbl}
                  </button>
                ))}
              </div>
              <button onClick={() => { loadCustomers(); setNovo(true) }} title="Abrir novo chamado"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 ml-1 transition hover:opacity-90"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Novo chamado</button>
            </div>
          </div>

          {/* Filtros FIXOS (sempre visíveis): Consultor + Cliente + Equipe + Solicitante + Prioridade. */}
          {(
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <MultiSelect placeholder="Consultor" value={mf.consultor} onChange={v => setMulti('consultor', v)} options={[{ id: '__none__', name: '— Não atribuído —' }, ...opts.consultores.map(n => ({ id: n, name: n }))]} />
              <MultiSelect placeholder="Cliente" value={mf.cliente} onChange={v => setMulti('cliente', v)} options={opts.clientes.map(n => ({ id: n, name: n }))} />
              <MultiSelect placeholder="Equipe" value={mf.team} onChange={v => setMulti('team', v)} options={teams.map(t => ({ id: t.id, name: t.name }))} />
              <MultiSelect placeholder="Solicitante" value={mf.solicitante} onChange={v => setMulti('solicitante', v)} options={opts.solicitantes.map(n => ({ id: n, name: n }))} />
              <MultiSelect placeholder="Prioridade" value={mf.priority} onChange={v => setMulti('priority', v)} options={Object.keys(PRIO).map(p => ({ id: p, name: PRIO[p].label }))} />
            </div>
          )}
        </div>

        {/* RESUMO + INDICADORES — acordeões recolhidos por padrão (Modo Gestão abre os dois).
            Gate por statuses/tickets (NÃO por orderedStatuses): orderedStatuses depende de colOrder e
            zera por um instante nas revalidações em background / se o /meta demora ou falha (Render free),
            fazendo a faixa INTEIRA (inclusive os cards de contagem, que nem usam status) sumir. Com
            statuses (estável, carregado 1x) OU local (tickets, cacheado) a faixa não pisca mais; os chips
            de Resumo já se auto-limpam quando statColumns está vazio. */}
        {(statuses.length > 0 || local.length > 0) && (
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
                  // Chip por STATUS = filtro clicável MULTI (marca mais de um). Dinâmico: novo status já entra clicável.
                  const on = statusSel.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setStatusSel(sel => sel.includes(c.id) ? sel.filter(x => x !== c.id) : [...sel, c.id])}
                      title={on ? 'Filtrando por este status — clique para remover' : `Filtrar por status: ${c.label} (pode marcar mais de um)`}
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
                      ? { borderLeft: `4px solid ${m.cor}`, background: `${m.cor}24` }
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
                  {/* Título — os chips abaixo filtram (o "Limpar filtros" principal zera também). */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">⏳</span>
                    <span className="text-[11px] font-semibold" style={{ color: semInt3 > 0 ? '#ef4444' : 'var(--text-muted)' }}>Sem interação da equipe</span>
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

        {view === 'lista' && (
          <TicketBulkBar ids={[...sel]} perms={novoMeta?.my_perms} agents={agents}
            categories={novoMeta?.categories ?? []} services={novoMeta?.services ?? []}
            priorities={novoMeta?.priorities} prioLabel={p => PRIO[p]?.label ?? p}
            onClear={() => setSel(new Set())} onDone={() => { setSel(new Set()); load() }} />
        )}

        {view === 'lista' ? (
          <div className="ds-card">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-light)' }}>
                  <th className="px-3 py-2 border-b w-8 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                    <input type="checkbox" title="Selecionar todos"
                      checked={listRows.length > 0 && listRows.every(r => sel.has(r.id))}
                      ref={el => { if (el) el.indeterminate = sel.size > 0 && !listRows.every(r => sel.has(r.id)) }}
                      onChange={e => setSel(e.target.checked ? new Set(listRows.map(r => r.id)) : new Set())} />
                  </th>
                  {listCols.map(c => {
                    const active = listSort.col === c.key
                    return (
                      <th key={c.key} onClick={() => setListSort(s => s.col === c.key ? { col: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col: c.key, dir: c.num ? 'desc' : 'asc' })}
                        title="Clique para ordenar"
                        className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide border-b cursor-pointer select-none whitespace-nowrap ds-row-hover sticky top-0 z-10" style={{ borderColor: 'var(--border)', color: active ? 'var(--primary)' : undefined, background: 'var(--surface)' }}>
                        {c.label}{active ? (listSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {listRows.length === 0 && <tr><td colSpan={listCols.length + 1} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum chamado.</td></tr>}
                {listRows.map(t => {
                  const st = statuses.find(s => s.id === t.status_id)
                  const sla = slaChip(t, st)
                  const dt = (v?: string | null) => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
                  return (
                    <tr key={t.id} onClick={() => openTicket(t.id)} onMouseEnter={() => prefetchTicket(t.id)} className="cursor-pointer ds-row-hover border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} title="Selecionar" />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t.ticket_number ?? `#${t.id}`}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{t.subject}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t.customer?.name ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t.solicitante_nome ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: t.assignee ? 'var(--text-muted)' : 'var(--text-light)' }}>{t.assignee?.name ?? 'Não atribuído'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{st && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: st.color ?? 'var(--text)', background: (st.color ?? '').startsWith('#') ? `${st.color}22` : 'var(--surface-sunken)', border: `1px solid ${st.color ?? 'var(--border)'}` }}>{st.label}</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: sla.color, background: sla.bg }}>{sla.icon} {sla.label}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-light)' }}>{dt(t.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-light)' }}>{dt(t.last_agent_activity_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-light)' }}>{dt(t.updated_at || t.created_at)}</td>
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
                                  onMouseEnter={() => prefetchTicket(t.id)}
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
