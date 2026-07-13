'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'
import { AbrirChamadoModal } from '@/components/help-desk/abrir-chamado-modal'
import { toast } from 'sonner'
import { LifeBuoy, Plus, ArrowLeft, ArrowRight, Send, Paperclip, Trash2, CheckCircle2, Search, X, GripVertical, CalendarClock, LayoutGrid, List, MessageSquare, Clock, Download, FileText } from 'lucide-react'
import { useColumnOrder } from '@/lib/kanban-column-order'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useAuth } from '@/hooks/use-auth'
import type { PortalColumn } from '@/components/help-desk/portal-columns-editor'
import { KanbanStats } from '@/components/help-desk/kanban-stats'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtAgendamento = (iso?: string | null, allDay?: boolean) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return allDay
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Payload do Portal (DTO curado — sem campos internos)
interface PortalSla { previsao_resolucao: string | null; respondido: boolean; resolvido_em: string | null; em_pausa: boolean }
interface PortalCommentAtt { id: number; nome: string | null; tamanho: string | null; is_image: boolean; download: string }
interface PortalComment { id: number; de: 'voce' | 'atendimento'; autor?: string; mensagem: string; criado_em: string; anexos?: PortalCommentAtt[] }
interface PortalAtt { id: number; nome: string | null; tamanho: string | null; is_image?: boolean; criado_em: string | null; download: string }
interface PortalTicket {
  id: number; numero: string | null; assunto?: string; prioridade?: string
  status?: { key?: string; label: string; cor: string | null; is_resolved?: boolean; is_terminal?: boolean } | null
  criado_em?: string; atualizado_em: string; sla?: PortalSla
  agendamento?: string | null; agendamento_dia_inteiro?: boolean
  descricao?: string | null; comentarios?: PortalComment[]; anexos?: PortalAtt[]
  // Campos visíveis conforme o perfil de acesso do cliente (podem não vir)
  cliente?: string | null; solicitante?: string | null; agente?: string | null; equipe?: string | null
  categoria?: string | null; servico?: string | null; nivel?: string | null; reaberturas?: number; cc?: string[]
  responsavel?: string | null
  justificativa?: string | null; horas_apontadas?: number; tags?: string[]; sla_primeira_resposta?: string | null
  chamado_anterior?: { id: number; numero: string | null } | null
  chamado_atual?: { id: number; numero: string | null } | null
}

export default function HelpDeskPortalPage() {
  const [novo, setNovo] = useState(false)
  const { user } = useAuth()
  const isCliente = user?.type === 'cliente' // "Abrir chamado" só para o cliente
  return (
    <AppLayout
      title="Help Desk"
      actions={isCliente ? (
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setNovo(true)}>
          <Plus size={15} /> Abrir chamado
        </button>
      ) : undefined}
    >
      <div className="space-y-4">
        <Chamados novo={novo} setNovo={setNovo} />
      </div>
    </AppLayout>
  )
}

const isResolved = (t: PortalTicket) => !!t.sla?.resolvido_em

// Pílula de prioridade colorida (igual ao Kanban do agente).
const PRIO_MAP: Record<string, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: '#16a34a', bg: 'rgba(22,163,74,.16)' },
  normal:  { label: 'Média',   color: '#3b82f6', bg: 'rgba(59,130,246,.16)' },
  alta:    { label: 'Alta',    color: '#f59e0b', bg: 'rgba(245,158,11,.16)' },
  urgente: { label: 'Urgente', color: '#ef4444', bg: 'rgba(239,68,68,.16)' },
}
// Kanban do CLIENTE: colunas agrupam os status internos. O mapeamento status→coluna é uma config
// GLOBAL (editável pelo gestor, salva no servidor); este default é o fallback usado até a config
// carregar / se a chamada falhar. Colunas casam por `key` do status. `fallback`=recebe não mapeados.
const DEFAULT_COLUMNS: PortalColumn[] = [
  { label: 'Pendente ERPSERV',   cor: '#3b82f6', fallback: true,  statuses: ['novo', 'em_andamento', 'planejamento_gmud', 'em_desenvolvimento'] },
  { label: 'Pendente cliente',   cor: '#f59e0b', fallback: false, statuses: ['aguardando_cliente'] },
  { label: 'Pendente terceiros', cor: '#a855f7', fallback: false, statuses: ['pendente_terceiros'] },
  { label: 'Resolvido',          cor: '#16a34a', fallback: false, statuses: ['resolvido', 'solucao_gmud'] },
  { label: 'Fechado',            cor: '#6b7280', fallback: false, statuses: ['fechado', 'cancelado'] },
]

// Status do SLA voltado ao cliente (rótulo + cor).
function slaStatus(t: PortalTicket): { label: string; color: string } {
  if (t.sla?.resolvido_em) return { label: 'Resolvido', color: 'var(--success-border)' }
  if (t.sla?.em_pausa) return { label: 'Pausado — aguardando você', color: 'var(--warning-border)' }
  const p = t.sla?.previsao_resolucao
  if (!p) return { label: '—', color: 'var(--text-muted)' }
  const diff = new Date(p).getTime() - Date.now()
  if (diff < 0) return { label: 'Prazo estourado', color: 'var(--danger-border)' }
  if (diff < 24 * 3600 * 1000) return { label: 'Vencendo', color: 'var(--warning-border)' }
  return { label: 'No prazo', color: 'var(--success-border)' }
}

// SLA de PRAZO (coluna da lista) — cumprimento do prazo, não o status. Encerrado/resolvido: compara
// a data de resolução com o prazo (cumpriu ou estourou); ativo: pela previsão vs agora.
function slaCompliance(t: PortalTicket): { label: string; color: string } {
  const prev = t.sla?.previsao_resolucao
  if (t.status?.is_terminal || t.status?.is_resolved) {
    const resolved = t.sla?.resolvido_em
    if (prev && resolved && new Date(resolved).getTime() > new Date(prev).getTime())
      return { label: 'Estourado', color: 'var(--danger-border)' }
    return { label: 'No prazo', color: 'var(--success-border)' }
  }
  if (t.sla?.em_pausa) return { label: 'Pausado', color: 'var(--warning-border)' }
  if (!prev) return { label: '—', color: 'var(--text-muted)' }
  const diff = new Date(prev).getTime() - Date.now()
  if (diff < 0) return { label: 'Estourado', color: 'var(--danger-border)' }
  if (diff < 24 * 3600 * 1000) return { label: 'Vencendo', color: 'var(--warning-border)' }
  return { label: 'No prazo', color: 'var(--success-border)' }
}

// Data de abertura compacta (sem ano) + tempo relativo p/ última interação.
const fmtAbertoCompact = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
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

// SLA situacional do card (com tempo restante quando aplicável).
function slaChip(t: PortalTicket): { icon: string; label: string; color: string; bg: string } {
  const D = { color: 'var(--danger-border)', bg: 'var(--danger-bg)' }
  const W = { color: 'var(--warning-border)', bg: 'var(--warning-bg)' }
  const G = { color: 'var(--success-border)', bg: 'var(--success-bg)' }
  const prev = t.sla?.previsao_resolucao
  if (t.status?.is_terminal || t.status?.is_resolved) {
    const resolved = t.sla?.resolvido_em
    if (prev && resolved && new Date(resolved).getTime() > new Date(prev).getTime()) return { icon: '🔴', label: 'Estourado', ...D }
    return { icon: '🟢', label: 'OK', ...G }
  }
  if (t.sla?.em_pausa) return { icon: '⏸', label: 'Você', ...W }
  if (!prev) return { icon: '🟢', label: 'OK', ...G }
  const diff = new Date(prev).getTime() - Date.now()
  if (diff < 0) return { icon: '🔴', label: 'Estourado', ...D }
  if (diff < 3600000) return { icon: '🟡', label: `Vence ${Math.max(1, Math.round(diff / 60000))}min`, ...W }
  if (diff < 24 * 3600000) return { icon: '🟡', label: `Vence ${Math.round(diff / 3600000)}h`, ...W }
  return { icon: '🟢', label: 'OK', ...G }
}

// Cor da "última interação" conforme envelhece.
function interacaoColor(iso?: string | null): string {
  if (!iso) return 'var(--text-light)'
  const h = (Date.now() - new Date(iso).getTime()) / 3600000
  if (h < 24) return 'var(--text-muted)'
  if (h < 72) return 'var(--warning-border)'
  return 'var(--danger-border)'
}

// Agendamento compacto p/ o card: Hoje/Amanhã/data + hora; vermelho quando atrasado.
function agendaCompact(iso?: string | null, allDay?: boolean): { icon: string; text: string; color: string } | null {
  if (!iso) return null
  const d = new Date(iso); if (isNaN(d.getTime())) return null
  const now = Date.now(); const dayMs = 86400000
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

// Iniciais para o avatar (2 letras).
const iniciais = (name?: string | null) => {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}
// Cor estável do avatar a partir do nome (paleta sóbria).
const AVATAR_COLORS = ['#3b82f6', '#16a34a', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444']
const avatarColor = (name?: string | null) => {
  const s = name ?? ''
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
// Mensagem amigável por status (o cliente entende o estado em 3s, sem jargão).
const STATUS_MSG: Record<string, string> = {
  novo: 'Seu chamado foi registrado e está na fila de atendimento.',
  em_andamento: 'Seu chamado está sendo analisado por nossa equipe.',
  em_desenvolvimento: 'Seu chamado está sendo trabalhado por nossa equipe.',
  planejamento_gmud: 'Seu chamado está em planejamento pela nossa equipe.',
  aguardando_cliente: 'Estamos aguardando um retorno seu para continuar.',
  pendente_terceiros: 'Aguardando o retorno de um terceiro para prosseguir.',
  resolvido: 'O atendimento marcou como resolvido — confirme se resolveu.',
  solucao_gmud: 'A solução foi aplicada — confirme se resolveu.',
  fechado: 'Este chamado foi encerrado.',
  cancelado: 'Este chamado foi cancelado.',
}
const statusMessage = (t: PortalTicket) => {
  // A mensagem segue o STATUS (não o SLA pausado) — SLA pode estar pausado por AGENDAMENTO,
  // e não por espera do cliente. "Aguardando você" só quando o status é, de fato, aguardando cliente.
  const base = (t.status?.key && STATUS_MSG[t.status.key]) || 'Acompanhe o andamento do seu chamado por aqui.'
  // Se está agendado e ainda em atendimento, deixa claro que a retomada é na data agendada.
  if (t.agendamento && !t.status?.is_resolved && !t.status?.is_terminal) {
    const ag = fmtAgendamento(t.agendamento, t.agendamento_dia_inteiro)
    return ag ? `${base} O atendimento retoma na data agendada (${ag}).` : base
  }
  return base
}
// Previsão em data curta (sem hora) para o card de status.
const fmtPrevisao = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso); if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function Chamados({ novo, setNovo }: { novo: boolean; setNovo: (v: boolean) => void }) {
  const [rows, setRows] = useState<PortalTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<number | null>(null)
  const [q, setQ] = useState('')            // busca geral (assunto/nº/pessoas)
  const [qTicket, setQTicket] = useState('') // busca por número do ticket
  const [fSolic, setFSolic] = useState('')   // filtro solicitante
  const [fResp, setFResp] = useState('')     // filtro responsável (agente)
  const [fStatus, setFStatus] = useState('') // filtro status (por key)
  // Filtro de data de abertura — padrão do sistema (Mês/Ano ou Período), igual ao admin.
  const [dateMode, setDateMode] = useState<'month' | 'period'>('month')
  const [refMonth, setRefMonth] = useState<number | null>(null)
  const [refYear, setRefYear] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [view, setView] = useState<'kanban' | 'lista'>('kanban') // visão do quadro
  const [cfg, setCfg] = useState<PortalColumn[]>(DEFAULT_COLUMNS) // colunas (config global do admin; default até carregar)
  const { user } = useAuth()
  const isCliente = user?.type === 'cliente' // "Abrir chamado" só aparece para o cliente
  // Ordem das colunas do cliente (arrasta o cabeçalho p/ reordenar; salvo no navegador).
  const { ordered: colOrder, headerProps } = useColumnOrder('portal', cfg.map(c => c.label))
  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: PortalTicket[] }>('/help-desk/portal/tickets').then(r => setRows(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  // Config global das colunas (quais status entram em cada uma). Silencioso: mantém o default se falhar.
  useEffect(() => {
    api.get<{ data: PortalColumn[] }>('/help-desk/portal/columns').then(r => { if (r?.data?.length) setCfg(r.data) }).catch(() => {})
  }, [])
  // Deep-link: /help-desk/portal?ticket=<id> (ex.: "Ver chamado" da faixa de ajuda) abre o chamado.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('ticket')
    if (p && /^\d+$/.test(p)) setSel(Number(p))
  }, [])

  if (sel) return <TicketView id={sel} onBack={() => { setSel(null); load() }} onOpen={(nid) => setSel(nid)} />

  // Opções de filtro (valores distintos presentes) + aplicação dos filtros.
  const solicitantes = Array.from(new Set(rows.map(t => t.solicitante).filter(Boolean))) as string[]
  const responsaveis = Array.from(new Set(rows.map(t => t.agente).filter(Boolean))) as string[]
  // Status distintos presentes (por key), preservando o rótulo/cor para o select.
  const statusOpts = Array.from(new Map(rows.filter(t => t.status?.key).map(t => [t.status!.key!, t.status!.label])).entries()).map(([key, label]) => ({ key, label }))
  const norm = (s?: string | null) => (s ?? '').toLowerCase()
  // Data de abertura: Mês/Ano (competência) ou Período (de/até). Vazio = qualquer.
  const matchesDate = (iso?: string | null) => {
    if (dateMode === 'month') {
      if (refMonth == null || refYear == null) return true
      if (!iso) return false
      const d = new Date(iso); return d.getMonth() + 1 === refMonth && d.getFullYear() === refYear
    }
    if (!dateFrom && !dateTo) return true
    if (!iso) return false
    const tm = new Date(iso).getTime()
    if (dateFrom && tm < new Date(`${dateFrom}T00:00:00`).getTime()) return false
    if (dateTo && tm > new Date(`${dateTo}T23:59:59`).getTime()) return false
    return true
  }
  const filteredRows = rows.filter(t => {
    if (fSolic && t.solicitante !== fSolic) return false
    if (fResp && t.agente !== fResp) return false
    if (fStatus && (t.status?.key ?? '') !== fStatus) return false
    if (qTicket && !norm(t.numero).includes(qTicket.toLowerCase())) return false
    if (q && ![t.numero, t.assunto, t.solicitante, t.agente].map(norm).join(' ').includes(q.toLowerCase())) return false
    if (!matchesDate(t.criado_em)) return false
    return true
  })
  const dateActive = dateMode === 'month' ? (refMonth != null) : !!(dateFrom || dateTo)
  const hasFilter = !!(q || qTicket || fSolic || fResp || fStatus || dateActive)

  // Colunas do Kanban = config global. Coluna 'scheduled' captura todo chamado com agendamento
  // (independente do status) e tem precedência: o agendado fica SÓ nela. As demais casam por key do
  // status; status não mapeado cai na coluna `fallback`.
  const mappedKeys = new Set(cfg.flatMap(c => c.statuses))
  const firstScheduledLabel = cfg.find(c => c.rule === 'scheduled')?.label ?? null
  const columns = cfg.map(c => ({
    label: c.label, cor: c.cor,
    items: filteredRows.filter(t => {
      if (c.rule === 'scheduled') return !!t.agendamento && c.label === firstScheduledLabel
      if (firstScheduledLabel && t.agendamento) return false // agendado vai só p/ a coluna "Agendados"
      const k = t.status?.key ?? ''
      return c.statuses.includes(k) || (!!c.fallback && !mappedKeys.has(k))
    }),
  }))
  const orderedColumns = colOrder.map(l => columns.find(c => c.label === l)).filter(Boolean) as typeof columns

  // Cards-resumo (topo): quantidade por coluna + contagens de SLA.
  const statColumns = orderedColumns.map(c => ({ label: c.label, cor: c.cor, count: c.items.length }))
  const sc = { g: 0, y: 0, r: 0, p: 0, res: 0 }
  filteredRows.forEach(t => {
    if (isResolved(t)) { sc.res++; return }
    if (t.sla?.em_pausa) { sc.p++; return }
    const p = t.sla?.previsao_resolucao
    if (!p) { sc.g++; return }
    const d = new Date(p).getTime() - Date.now()
    if (d < 0) sc.r++; else if (d < 24 * 3600 * 1000) sc.y++; else sc.g++
  })
  // Indicadores = métricas que NÃO duplicam as colunas (Resolvido/Pausado/Agendados já são colunas).
  const abertos = filteredRows.filter(t => !t.status?.is_terminal && !t.status?.is_resolved).length
  const totalT = filteredRows.length
  // % SLA = chamados NÃO estourados sobre o total (cor por saúde).
  const pctSla = totalT > 0 ? Math.round(((totalT - sc.r) / totalT) * 100) : 100
  const slaCor = pctSla >= 90 ? '#16a34a' : pctSla >= 70 ? '#f59e0b' : '#ef4444'
  const statMetrics = [
    { label: 'Total', value: totalT, cor: '#64748b' },
    { label: 'Abertos', value: abertos, cor: '#3b82f6' },
    { label: '% SLA no prazo', value: `${pctSla}%`, hint: `${totalT - sc.r} de ${totalT} no prazo`, cor: slaCor },
    { label: 'Vencendo', value: sc.y, cor: '#f59e0b' },
    { label: 'Estourado', value: sc.r, cor: '#ef4444' },
  ]

  return (
    <div className="space-y-4">
      {/* Cards-resumo no TOPO — quantidade por coluna + SLA */}
      {rows.length > 0 && <KanbanStats columns={statColumns} metrics={statMetrics} />}

      {/* Filtros: busca geral, por ticket, solicitante e responsável */}
      {rows.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar (assunto, nº, pessoa)…" className={`${fieldCls} w-full`} style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
          <input value={qTicket} onChange={e => setQTicket(e.target.value)} placeholder="Nº do ticket" className={fieldCls} style={{ ...inputStyle, width: 130 }} />
          {/* Data de abertura — Mês/Ano ou Período (padrão do admin) */}
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>Aberto:</span>
          <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--border)' }}>
            {(['month', 'period'] as const).map(mode => (
              <button key={mode} onClick={() => setDateMode(mode)} className="px-3 py-1.5 font-medium transition-colors"
                style={{ background: dateMode === mode ? 'var(--primary)' : 'transparent', color: dateMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                {mode === 'month' ? 'Mês/Ano' : 'Período'}
              </button>
            ))}
          </div>
          {dateMode === 'month'
            ? <MonthYearPicker month={refMonth} year={refYear} onChange={(m, y) => { if (!m) { setRefMonth(null); setRefYear(null) } else { setRefMonth(m); setRefYear(y) } }} />
            : <DateRangePicker from={dateFrom} to={dateTo} onChange={(fr, to) => { setDateFrom(fr); setDateTo(to) }} />}
          <select value={fSolic} onChange={e => setFSolic(e.target.value)} className={fieldCls} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Solicitante: todos</option>
            {solicitantes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fResp} onChange={e => setFResp(e.target.value)} className={fieldCls} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Responsável: todos</option>
            {responsaveis.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={fieldCls} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Status: todos</option>
            {statusOpts.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {hasFilter && <button onClick={() => { setQ(''); setQTicket(''); setFSolic(''); setFResp(''); setFStatus(''); setRefMonth(null); setRefYear(null); setDateFrom(''); setDateTo('') }} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Limpar</button>}
        </div>
      )}

      {/* Card de ajuda — explica cada coluna e o SLA */}

      {/* Alternador Kanban / Lista — os cards acima permanecem */}
      {rows.length > 0 && !loading && (
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['kanban', 'Kanban', LayoutGrid], ['lista', 'Lista', List]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setView(v)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 transition"
                style={{ background: view === v ? 'var(--primary-soft)' : 'transparent', color: view === v ? 'var(--primary)' : 'var(--text-muted)' }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUADRO — kanban ou lista */}
      {loading ? (
        <div className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="ds-card py-10 px-4 text-center space-y-2">
          <LifeBuoy size={30} className="mx-auto" style={{ color: 'var(--text-light)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Você ainda não tem chamados.</p>
          {isCliente && <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setNovo(true)}><Plus size={15} /> Abrir meu primeiro chamado</button>}
        </div>
      ) : view === 'kanban' ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {orderedColumns.map(col => (
            <div key={col.label} className="w-[270px] shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1 rounded" title="Arraste para reordenar a coluna" {...headerProps(col.label)}>
                <GripVertical size={13} style={{ color: 'var(--text-light)', opacity: 0.6 }} className="shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.cor ?? 'var(--text-muted)' }} />
                <span className="text-sm font-semibold truncate" style={{ color: col.cor ?? 'var(--text)' }}>{col.label}</span>
                <span className="text-[11px] px-1.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{col.items.length}</span>
              </div>
              <div className="space-y-1.5 rounded-lg p-2" style={{ background: 'var(--surface-sunken)', minHeight: 80 }}>
                {col.items.map(t => {
                  const prio = t.prioridade ? PRIO_MAP[t.prioridade] : null
                  const sla = slaChip(t)
                  const ag = agendaCompact(t.agendamento, t.agendamento_dia_inteiro)
                  return (
                    <button key={t.id} onClick={() => setSel(t.id)} title={prio ? `Prioridade: ${prio.label}` : undefined}
                      className="ds-card w-full text-left pl-2.5 pr-2 py-1.5 leading-tight space-y-0.5 hover:shadow transition"
                      style={{ background: 'var(--surface)', borderLeft: `3px solid ${prio?.color ?? 'var(--border)'}` }}>
                      {/* 1 — Código (protagonista) + badge de SLA */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[16px] font-bold leading-none" style={{ color: 'var(--text)' }}>{t.numero ?? `#${t.id}`}</span>
                        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: sla.color, background: sla.bg }}>{sla.icon} {sla.label}</span>
                      </div>
                      {/* 2 — Título */}
                      <div className="text-[12px] font-semibold line-clamp-2" style={{ color: 'var(--text)' }}>{t.assunto}</div>
                      {/* 3 — Responsável • Solicitante (uma linha) */}
                      <div className="flex items-center gap-1.5 text-[10px] min-w-0" style={{ color: 'var(--text-muted)' }}>
                        {t.agente
                          ? <span className="truncate">👤 {t.agente}</span>
                          : <span className="font-semibold whitespace-nowrap" style={{ color: 'var(--warning-border)' }}>⚠ Não atribuído</span>}
                        {t.solicitante && <><span style={{ color: 'var(--text-light)' }}>•</span><span className="truncate">🧑 {t.solicitante}</span></>}
                      </div>
                      {/* 4 — Datas agrupadas */}
                      <div className="flex items-center gap-1.5 text-[10px] flex-wrap" style={{ color: 'var(--text-light)' }}>
                        {t.criado_em && <span className="whitespace-nowrap">📅 {fmtAbertoCompact(t.criado_em)}</span>}
                        {t.atualizado_em && <><span>•</span><span className="whitespace-nowrap" style={{ color: interacaoColor(t.atualizado_em) }}>💬 {relativeTime(t.atualizado_em)}</span></>}
                        {ag && <><span>•</span><span className="whitespace-nowrap" style={{ color: ag.color }}>📆 Ag. {ag.text}</span></>}
                      </div>
                    </button>
                  )
                })}
                {col.items.length === 0 && <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>—</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ds-card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1080 }}>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                <th className="text-left px-3 py-2 font-semibold">Nº</th>
                <th className="text-left px-3 py-2 font-semibold">Assunto</th>
                <th className="text-left px-3 py-2 font-semibold">Solicitante</th>
                <th className="text-left px-3 py-2 font-semibold">Responsável</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Urgência</th>
                <th className="text-left px-3 py-2 font-semibold">Agendamento</th>
                <th className="text-left px-3 py-2 font-semibold">Aberto em</th>
                <th className="text-left px-3 py-2 font-semibold">Última interação</th>
                <th className="text-left px-3 py-2 font-semibold">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(t => {
                const prio = t.prioridade ? PRIO_MAP[t.prioridade] : null
                const sla = slaCompliance(t)
                return (
                  <tr key={t.id} onClick={() => setSel(t.id)} className="cursor-pointer ds-row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap" style={{ color: 'var(--text-light)' }}>{t.numero ?? `#${t.id}`}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{t.assunto}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.solicitante ?? '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.agente ?? '—'}</td>
                    <td className="px-3 py-2">{t.status && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ color: t.status.cor ?? 'var(--text)', background: (t.status.cor ?? '').startsWith('#') ? `${t.status.cor}22` : 'var(--surface-sunken)', border: `1px solid ${t.status.cor ?? 'var(--border)'}` }}>{t.status.label}</span>}</td>
                    <td className="px-3 py-2">{prio && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>}</td>
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap" style={{ color: t.agendamento ? 'var(--warning)' : 'var(--text-light)' }}>{t.agendamento ? fmtAgendamento(t.agendamento, t.agendamento_dia_inteiro) : '—'}</td>
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(t.criado_em)}</td>
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(t.atualizado_em)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: sla.color }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sla.color }} />{sla.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {novo && <AbrirChamadoModal onClose={() => setNovo(false)} onCreated={(id) => { setNovo(false); load(); setSel(id) }} />}
    </div>
  )
}

function TicketView({ id, onBack, onOpen }: { id: number; onBack: () => void; onOpen: (id: number) => void }) {
  const [t, setT] = useState<PortalTicket | null>(null)
  const [body, setBody] = useState(''); const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<File[]>([])   // anexos/prints DA interação (vão junto do envio)
  const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState(''); const [acting, setActing] = useState(false)
  const [tab, setTab] = useState<'conversa' | 'historico'>('conversa')
  const load = useCallback(() => { api.get<{ data: PortalTicket }>(`/help-desk/portal/tickets/${id}`).then(r => setT(r?.data ?? null)).catch(() => toast.error('Erro')) }, [id])
  useEffect(() => { load() }, [load])
  const addFiles = (list: FileList | File[]) => { const arr = Array.from(list); if (arr.length) setFiles(f => [...f, ...arr]) }
  const removeFile = (i: number) => setFiles(f => f.filter((_, j) => j !== i))
  const accept = async () => { setActing(true); try { await api.post(`/help-desk/portal/tickets/${id}/accept`, {}); toast.success('Chamado encerrado. Obrigado!'); load() } catch { toast.error('Erro ao aceitar') } finally { setActing(false) } }
  const reject = async () => {
    if (!reason.trim()) return toast.error('Informe o motivo da recusa.')
    setActing(true)
    try { await api.post(`/help-desk/portal/tickets/${id}/reject`, { reason: reason.trim() }); toast.success('Solução recusada — o chamado voltou para atendimento.'); setRejecting(false); setReason(''); load() }
    catch { toast.error('Erro ao recusar') } finally { setActing(false) }
  }
  const send = async () => {
    if (!body.trim() && files.length === 0) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('body', body.trim())
      files.forEach(f => fd.append('files[]', f))
      await api.post(`/help-desk/portal/tickets/${id}/comments`, fd)
      setBody(''); setFiles([]); load()
    } catch { toast.error('Erro ao enviar') } finally { setSending(false) }
  }

  if (!t) return <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  const prazo = t.sla?.previsao_resolucao
  const sla = slaStatus(t)
  const prio = t.prioridade ? PRIO_MAP[t.prioridade] : null
  const atendente = t.agente || t.responsavel
  const statusCor = t.status?.cor ?? 'var(--text-muted)'
  const isClosed = !!t.status?.is_terminal

  // Thread unificada da conversa — do mais ANTIGO (topo) ao mais RECENTE (base), estilo WhatsApp.
  // A descrição inicial vira a 1ª mensagem do solicitante; as interações seguem em ordem.
  type Msg = { key: string; side: 'voce' | 'atendimento'; autor: string; date?: string; body?: string; html?: boolean; anexos?: PortalCommentAtt[]; tag?: string }
  const msgs: Msg[] = []
  if (t.descricao || (t.anexos && t.anexos.length > 0)) {
    msgs.push({ key: 'desc', side: 'voce', autor: t.solicitante ?? 'Você', date: t.criado_em, body: t.descricao ?? '', html: isHtmlBody(t.descricao ?? ''), anexos: (t.anexos ?? []).map(a => ({ id: a.id, nome: a.nome, tamanho: a.tamanho, is_image: !!a.is_image, download: a.download })), tag: 'abertura' })
  }
  ;(t.comentarios ?? []).forEach(c => msgs.push({ key: 'c' + c.id, side: c.de, autor: c.autor ?? (c.de === 'voce' ? 'Você' : 'Atendimento'), date: c.criado_em, body: c.mensagem, html: isHtmlBody(c.mensagem), anexos: c.anexos }))
  // Mais RECENTE primeiro (a resposta fica logo abaixo do compositor, sem rolar até o fim).
  msgs.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())

  // Todos os anexos (abertura + interações) para o card dedicado (estilo Gmail).
  const allAtts: PortalCommentAtt[] = [
    ...(t.anexos ?? []).map(a => ({ id: a.id, nome: a.nome, tamanho: a.tamanho, is_image: !!a.is_image, download: a.download })),
    ...(t.comentarios ?? []).flatMap(c => c.anexos ?? []),
  ]

  // Linha do tempo (lifecycle) — separada da conversa, mais recente primeiro. Derivada do que o
  // portal expõe (abertura, agendamento, resolução, nº de interações).
  const hist: { icon: ReactNode; label: string; date?: string; color: string }[] = []
  hist.push({ icon: <Plus size={13} />, label: 'Chamado aberto', date: t.criado_em, color: 'var(--primary)' })
  if (t.agendamento) hist.push({ icon: <CalendarClock size={13} />, label: `Agendado para ${fmtAgendamento(t.agendamento, t.agendamento_dia_inteiro)}`, date: t.agendamento, color: 'var(--warning-border)' })
  const trocas = (t.comentarios ?? []).length
  if (trocas > 0) hist.push({ icon: <MessageSquare size={13} />, label: `${trocas} interação(ões) na conversa`, date: t.atualizado_em, color: 'var(--text-muted)' })
  if (t.sla?.resolvido_em) hist.push({ icon: <CheckCircle2 size={13} />, label: 'Chamado resolvido', date: t.sla.resolvido_em, color: 'var(--success-border)' })
  hist.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())

  const rot = 'text-[11px] uppercase tracking-wide font-medium'

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg ds-btn-secondary" title="Voltar para meus chamados">
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* 1º — HEADER limpo: nº, título, status e metadados essenciais */}
      <div className="space-y-2">
        <div className="font-mono text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{t.numero ?? `#${t.id}`}</div>
        {t.assunto && <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>{t.assunto}</h1>}
        {t.status && (
          <div className="inline-flex items-center gap-2 text-base font-semibold" style={{ color: statusCor }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusCor }} /> {t.status.label}
          </div>
        )}
        {/* Metadados do chamado — todos no padrão do cabeçalho (rótulo em cima, valor embaixo). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 pt-2">
          {t.solicitante && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Solicitante</div><div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.solicitante}</div></div>}
          <div><div className={rot} style={{ color: 'var(--text-light)' }}>Atendido por</div><div className="text-sm font-semibold truncate" style={{ color: atendente ? 'var(--text)' : 'var(--text-light)' }}>{atendente || 'Aguardando atribuição'}</div></div>
          {t.cliente && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Cliente</div><div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.cliente}</div></div>}
          {t.categoria && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Categoria</div><div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.categoria}</div></div>}
          {t.servico && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Serviço</div><div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.servico}</div></div>}
          {prio && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Urgência</div><div className="mt-0.5"><span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span></div></div>}
          {t.agendamento && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Agendamento</div><div className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: 'var(--warning)' }}><CalendarClock size={13} />{fmtAgendamento(t.agendamento, t.agendamento_dia_inteiro)}</div></div>}
          {t.cc && t.cc.length > 0 && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Em cópia</div><div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{t.cc.join(', ')}</div></div>}
          <div><div className={rot} style={{ color: 'var(--text-light)' }}>Aberto em</div><div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmtDate(t.criado_em)}</div></div>
          <div><div className={rot} style={{ color: 'var(--text-light)' }}>Última atualização</div><div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{relativeTime(t.atualizado_em) || '—'}</div></div>
        </div>
      </div>

      {/* Continuação — este chamado dá sequência a um chamado anterior encerrado */}
      {t.chamado_anterior && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg px-4 py-3"
          style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>
            🔗 Continuação do chamado <span className="font-mono font-bold">{t.chamado_anterior.numero ?? `#${t.chamado_anterior.id}`}</span> — este chamado dá sequência a um atendimento encerrado.
          </div>
          <button onClick={() => onOpen(t.chamado_anterior!.id)}
            className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg shrink-0" title="Ver o chamado anterior">
            Ver chamado anterior <ArrowRight size={14} />
          </button>
        </div>
      )}
      {t.chamado_atual && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg px-4 py-3"
          style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
            ➡️ Este atendimento teve continuidade no chamado <span className="font-mono font-bold">{t.chamado_atual.numero ?? `#${t.chamado_atual.id}`}</span>.
          </div>
          <button onClick={() => onOpen(t.chamado_atual!.id)}
            className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg shrink-0" title="Ver o chamado atual">
            Ver chamado atual <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* 2º — CARD DE STATUS horizontal: estado + explicação em linguagem simples + previsão */}
      <div className="ds-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className={`${rot} mb-1`} style={{ color: 'var(--text-light)' }}>Status</div>
            <div className="inline-flex items-center gap-2 text-lg font-bold" style={{ color: statusCor }}>
              <span className="w-3 h-3 rounded-full" style={{ background: statusCor }} /> {t.status?.label ?? '—'}
            </div>
            <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>{statusMessage(t)}</p>
          </div>
          <div className="flex gap-6 shrink-0 sm:border-l sm:pl-6" style={{ borderColor: 'var(--border)' }}>
            <div><div className={rot} style={{ color: 'var(--text-light)' }}>Atualizado</div><div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{relativeTime(t.atualizado_em) || '—'}</div></div>
            {prazo && !t.sla?.resolvido_em && <div><div className={rot} style={{ color: 'var(--text-light)' }}>Previsão</div><div className="text-sm font-semibold mt-0.5" style={{ color: sla.color }}>{fmtPrevisao(prazo) ?? '—'}</div></div>}
          </div>
        </div>
      </div>

      {/* Aceite/Recusa da solução — quando resolvido (e ainda não encerrado). */}
      {t.status?.is_resolved && !t.status?.is_terminal && (
        <div className="ds-card p-5 space-y-3" style={{ border: '1px solid var(--success-border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>O atendimento marcou este chamado como <strong>resolvido</strong>. A solução resolveu?</div>
          {!rejecting ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={accept} disabled={acting} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#16a34a', color: '#fff', opacity: acting ? 0.6 : 1 }}>
                <CheckCircle2 size={16} /> Aceitar e encerrar
              </button>
              <button onClick={() => setRejecting(true)} disabled={acting} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#ef4444', color: '#fff', opacity: acting ? 0.6 : 1 }}>
                <X size={16} /> Recusar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus placeholder="Diga o que faltou ou por que a solução não resolveu…"
                className={`${fieldCls} w-full`} style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb' }} />
              <div className="flex gap-2">
                <button onClick={reject} disabled={acting || !reason.trim()} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg" style={{ background: '#ef4444', color: '#fff', opacity: (acting || !reason.trim()) ? 0.6 : 1 }}>Enviar recusa</button>
                <button onClick={() => { setRejecting(false); setReason('') }} className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3º — RESPONDER: elemento principal da tela (grande). Encerrado: sem compositor. */}
      {!isClosed && (
        <div className="ds-card p-5 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Responder ao atendimento</h2>
          <textarea className="w-full text-sm rounded-xl px-3.5 py-3 outline-none resize-y" style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb', minHeight: 120 }} rows={5}
            placeholder="Digite sua resposta ou cole um print utilizando Ctrl+V." value={body} onChange={e => setBody(e.target.value)}
            onPaste={e => { const imgs = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/')); const fs = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]; if (fs.length) { addFiles(fs); toast.success('Print anexado') } }} />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                  <Paperclip size={11} /><span className="max-w-[140px] truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} aria-label="Remover"><Trash2 size={11} style={{ color: 'var(--text-light)' }} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer" style={{ color: 'var(--primary)' }}>
              <Paperclip size={15} /> Anexar arquivos
              <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }} />
            </label>
            <button className="ds-btn-primary inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg" onClick={send} disabled={sending || (!body.trim() && files.length === 0)}>
              <Send size={15} /> Enviar
            </button>
          </div>
        </div>
      )}

      {/* 4º — CONVERSA / HISTÓRICO em abas (conversa ocupa a maior parte da tela) */}
      <div className="ds-card p-0 overflow-hidden">
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {([['conversa', 'Conversa', <MessageSquare key="c" size={14} />], ['historico', 'Histórico', <Clock key="h" size={14} />]] as const).map(([k, lbl, ic]) => (
            <button key={k} onClick={() => setTab(k)} className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-3 transition-colors"
              style={{ color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === k ? 'var(--primary)' : 'transparent'}`, marginBottom: -1 }}>
              {ic} {lbl}
            </button>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          {tab === 'conversa' ? (
            msgs.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Ainda não há mensagens. Escreva a primeira resposta acima.</p>
            ) : (
              <div className="space-y-5">
                {msgs.map(m => {
                  const right = m.side === 'voce'
                  return (
                    <div key={m.key} className={`flex gap-2.5 ${right ? 'flex-row-reverse' : ''}`}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-white" style={{ background: avatarColor(m.autor) }}>{iniciais(m.autor)}</div>
                      <div className={`flex flex-col min-w-0 max-w-[80%] ${right ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1 text-[11px]">
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{m.autor}</span>
                          {m.tag && <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{m.tag}</span>}
                          <span style={{ color: 'var(--text-light)' }}>{fmtDate(m.date)}</span>
                        </div>
                        <div className="hd-msg-body rounded-2xl px-3.5 py-2.5 text-sm text-left w-fit max-w-full overflow-x-auto" style={{ background: '#ffffff', color: '#1f2937', border: `1px solid ${right ? 'var(--primary)' : '#e5e7eb'}`, borderTopRightRadius: right ? 4 : 16, borderTopLeftRadius: right ? 16 : 4 }}>
                          {m.body ? (m.html
                            ? <div className="hd-rich" dangerouslySetInnerHTML={{ __html: sanitizeRich(m.body) }} />
                            : <p className="whitespace-pre-wrap break-words">{m.body}</p>) : null}
                          {m.anexos && m.anexos.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {m.anexos.filter(a => a.is_image).map(a => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <a key={a.id} href={a.download} target="_blank" rel="noopener noreferrer"><img src={a.download} alt={a.nome ?? 'anexo'} className="rounded-lg max-h-56" style={{ border: '1px solid var(--border)' }} /></a>
                              ))}
                              {m.anexos.filter(a => !a.is_image).map(a => (
                                <a key={a.id} href={a.download} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}><Paperclip size={12} /> {a.nome ?? `Anexo #${a.id}`}{a.tamanho ? ` · ${a.tamanho}` : ''}</a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            <div>
              {hist.map((h, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--surface-sunken)', color: h.color, border: '1px solid var(--border)' }}>{h.icon}</div>
                    {i < hist.length - 1 && <div className="w-px flex-1 my-1" style={{ background: 'var(--border)' }} />}
                  </div>
                  <div className="pb-4 pt-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{h.label}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{fmtDate(h.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ANEXOS — card próprio (estilo Gmail), reunindo tudo do chamado */}
      {allAtts.length > 0 && (
        <div className="ds-card p-5">
          <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Paperclip size={15} style={{ color: 'var(--text-light)' }} /> Anexos <span style={{ color: 'var(--text-light)' }}>({allAtts.length})</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {allAtts.map(a => (
              <a key={a.id} href={a.download} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 ds-row-hover" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: 'var(--surface)', color: 'var(--primary)' }}>
                  {a.is_image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.download} alt="" className="w-full h-full object-cover" />
                    : <FileText size={16} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate" style={{ color: 'var(--text)' }}>{a.nome ?? `Anexo #${a.id}`}</span>
                  {a.tamanho && <span className="block text-[11px]" style={{ color: 'var(--text-light)' }}>{a.tamanho}</span>}
                </span>
                <Download size={15} style={{ color: 'var(--text-light)' }} />
              </a>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

