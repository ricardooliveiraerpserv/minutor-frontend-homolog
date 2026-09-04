'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { startSession, getSession } from '@/lib/help-desk-session'
import { Ticket, Plus, Search, Inbox, GitMerge } from 'lucide-react'
import { MesclarModal } from '@/components/help-desk/mesclar-modal'
import { NovoChamadoModal } from '@/components/help-desk/novo-chamado-modal'
import { TicketBulkBar } from '@/components/help-desk/ticket-bulk-bar'

interface Ref { id: number; name: string }
interface StatusOpt { id: number; key: string; label: string; color: string | null; is_open: boolean; is_resolved: boolean; is_terminal: boolean }
interface CategoryOpt { id: number; name: string; color: string | null }
interface Sla {
  first_response_breached: boolean; resolution_breached: boolean
  first_response_overdue: boolean; resolution_overdue: boolean
  resolution_minutes_left: number | null
}
interface TicketRow {
  id: number; ticket_number: string | null; subject: string; priority: string
  customer?: Ref | null; category?: CategoryOpt | null; assignee?: Ref | null
  status?: StatusOpt | null; updated_at: string; sla?: Sla | null
  dev_delivery_at?: string | null // previsão de entrega em homologação (Em Desenvolvimento)
}
interface ServiceOpt { id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }
interface Meta { priorities: string[]; statuses: StatusOpt[]; categories: CategoryOpt[]; teams: Ref[]; services?: ServiceOpt[]; my_inform?: Record<string, boolean>; can_open?: boolean; my_perms?: Record<string, boolean> }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const PRIO: Record<string, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  normal:  { label: 'Média',   color: 'var(--info-border)',    bg: 'var(--info-bg)' },
  alta:    { label: 'Alta',    color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  urgente: { label: 'Urgente', color: 'var(--danger-border)',  bg: 'var(--danger-bg)' },
}

function slaSignal(sla?: Sla | null): { dot: string; label: string; color: string } {
  if (!sla) return { dot: '⚪', label: '—', color: 'var(--text-muted)' }
  if (sla.first_response_breached || sla.resolution_breached) return { dot: '🔴', label: 'SLA estourado', color: 'var(--danger-border)' }
  if (sla.first_response_overdue || sla.resolution_overdue) return { dot: '🟡', label: 'Vencendo', color: 'var(--warning-border)' }
  return { dot: '🟢', label: 'No prazo', color: 'var(--success-border)' }
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span className="inline-block text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color, background: bg }}>{text}</span>
}

export default function HelpDeskTicketsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [rows, setRows] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [customers, setCustomers] = useState<Ref[]>([])
  const [agents, setAgents] = useState<Ref[]>([])
  const [novo, setNovo] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const toggleSel = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Deep-link (?novo=1), ex.: botão "Novo chamado" da Fila — abre o modal de abertura.
  useEffect(() => { if (new URLSearchParams(window.location.search).get('novo') === '1') setNovo(true) }, [])

  const F0 = { search: '', status_key: '', priority: '', category_id: '', team_id: '', assignee_id: '', customer_id: '' }
  const [f, setF] = useState<Record<string, string>>(F0)
  const [mine, setMine] = useState(false)
  const [open, setOpen] = useState(false)
  const [breached, setBreached] = useState(false)
  const [devOverdue, setDevOverdue] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (mine) p.set('mine', '1')
    if (open) p.set('open', '1')
    if (breached) p.set('breached', '1')
    if (devOverdue) p.set('dev_overdue', '1')
    return p.toString()
  }, [f, mine, open, breached, devOverdue])

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: TicketRow[] }>(`/help-desk/tickets${qs ? `?${qs}` : ''}`)
      .then(r => setRows(r?.data ?? [])).catch(() => toast.error('Erro ao carregar chamados')).finally(() => setLoading(false))
  }, [qs])
  useEffect(() => { load() }, [load])

  // Modo Atendimento — restaura os filtros da sessão ao voltar para a fila (não reconstruir filtros).
  useEffect(() => {
    const s = getSession()
    if (s?.source !== 'list') return
    setF(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s.filters).filter(([k]) => k in prev && typeof s.filters[k] === 'string')) as Record<string, string> }))
    if (typeof s.filters.mine === 'boolean') setMine(s.filters.mine)
    if (typeof s.filters.open === 'boolean') setOpen(s.filters.open)
    if (typeof s.filters.breached === 'boolean') setBreached(s.filters.breached)
    if (typeof s.filters.devOverdue === 'boolean') setDevOverdue(s.filters.devOverdue)
  }, [])

  // Inicia/atualiza a sessão de atendimento e abre o chamado (preserva a ordem exibida).
  const openTicket = (ticketId: number) => {
    startSession({ source: 'list', label: 'Chamados', ids: rows.map(r => r.id), filters: { ...f, mine, open, breached, devOverdue } })
    router.push(`/help-desk/tickets/${ticketId}`)
  }

  useEffect(() => {
    api.get<{ data: Meta }>('/help-desk/meta').then(r => r?.data && setMeta(r.data)).catch(() => {})
    api.get<{ data?: Ref[] }>('/help-desk/agents').then(r => setAgents((r?.data ?? []).map(a => ({ id: a.id, name: a.name })))).catch(() => {})
    api.get<Ref[] | { data?: Ref[]; items?: Ref[] }>('/customers?pageSize=500')
      .then(r => {
        const list = Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])
        setCustomers(list.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
  }, [])

  const counters = useMemo(() => {
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      total: rows.length,
      abertos: rows.filter(t => t.status?.is_open).length,
      semAtendente: rows.filter(t => !t.assignee).length,
      atraso: rows.filter(t => t.sla?.first_response_breached || t.sla?.resolution_breached || t.sla?.first_response_overdue || t.sla?.resolution_overdue).length,
      meus: rows.filter(t => t.assignee?.id === user?.id).length,
      // Entregas vencidas: Em Desenvolvimento com previsão de entrega em homologação já passada.
      entregasVencidas: rows.filter(t => t.status?.key === 'em_desenvolvimento' && !!t.dev_delivery_at && (t.dev_delivery_at as string).slice(0, 10) < todayStr).length,
    }
  }, [rows, user?.id])

  return (
    <AppLayout title="Chamados">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Ticket size={20} style={{ color: 'var(--primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Chamados</h1>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>({counters.total})</span>
          </div>
          <div className="flex items-center gap-2">
            {sel.size >= 1 && (
              <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setMergeOpen(true)}>
                <GitMerge size={15} /> Mesclar selecionados ({sel.size})
              </button>
            )}
            <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setNovo(true)}>
              <Plus size={16} /> Novo chamado
            </button>
          </div>
        </div>

        {/* KPIs / filtros rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { k: 'abertos', label: 'Abertos', v: counters.abertos, active: open, onClick: () => setOpen(o => !o), danger: false },
            { k: 'sem', label: 'Sem atendente', v: counters.semAtendente, active: false, onClick: () => set('status_key', ''), danger: false },
            { k: 'atraso', label: 'Em atraso (SLA)', v: counters.atraso, active: breached, onClick: () => setBreached(b => !b), danger: false },
            { k: 'entrega', label: 'Entregas vencidas', v: counters.entregasVencidas, active: devOverdue, onClick: () => setDevOverdue(v => !v), danger: true },
            { k: 'meus', label: 'Meus chamados', v: counters.meus, active: mine, onClick: () => setMine(m => !m), danger: false },
          ].map(c => (
            <button key={c.k} onClick={c.onClick}
              className="ds-card text-left px-3 py-2 rounded-lg transition"
              style={{ borderColor: c.active ? (c.danger ? 'var(--danger-border)' : 'var(--primary)') : (c.danger && c.v > 0 ? 'var(--danger-border)' : 'var(--border)') }}>
              <div className="text-[11px]" style={{ color: c.danger && c.v > 0 ? 'var(--danger-border)' : 'var(--text-light)' }}>{c.label}{c.active ? ' • filtrando' : ''}</div>
              <div className="text-xl font-semibold" style={{ color: c.danger && c.v > 0 ? 'var(--danger-border)' : 'var(--text)' }}>{c.v}</div>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input className={`${fieldCls} pl-8 w-56`} style={inputStyle} placeholder="Buscar nº/assunto…" value={f.search} onChange={e => set('search', e.target.value)} />
          </div>
          <select className={fieldCls} style={inputStyle} value={f.status_key} onChange={e => set('status_key', e.target.value)}>
            <option value="">Status (todos)</option>
            {meta?.statuses.map(s => <option key={s.id} value={s.key}>{s.label}</option>)}
          </select>
          <select className={fieldCls} style={inputStyle} value={f.priority} onChange={e => set('priority', e.target.value)}>
            <option value="">Prioridade (todas)</option>
            {meta?.priorities.map(p => <option key={p} value={p}>{PRIO[p]?.label ?? p}</option>)}
          </select>
          <select className={fieldCls} style={inputStyle} value={f.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Categoria (todas)</option>
            {meta?.categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
          <select className={fieldCls} style={inputStyle} value={f.team_id} onChange={e => set('team_id', e.target.value)}>
            <option value="">Fila (todas)</option>
            {meta?.teams.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
          </select>
          <select className={fieldCls} style={inputStyle} value={f.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">Atendente (todos)</option>
            {agents.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
          <select className={fieldCls} style={inputStyle} value={f.customer_id} onChange={e => set('customer_id', e.target.value)}>
            <option value="">Cliente (todos)</option>
            {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>

        {/* Barra de atualização em massa — só com seleção e se o perfil libera (meta.my_perms). */}
        <TicketBulkBar ids={[...sel]} perms={meta?.my_perms} agents={agents} categories={meta?.categories ?? []}
          services={meta?.services ?? []} priorities={meta?.priorities} prioLabel={p => PRIO[p]?.label ?? p}
          onClear={() => setSel(new Set())} onDone={() => { setSel(new Set()); load() }} />

        {/* Tabela */}
        <div className="ds-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase tracking-wide">
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" title="Selecionar todos"
                    checked={rows.length > 0 && rows.every(r => sel.has(r.id))}
                    ref={el => { if (el) el.indeterminate = sel.size > 0 && !rows.every(r => sel.has(r.id)) }}
                    onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} />
                </th>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Assunto</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Prioridade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Atendente</th>
                <th className="px-3 py-2">SLA</th>
                <th className="px-3 py-2">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  <Inbox size={20} className="inline mr-1.5 -mt-0.5" /> Nenhum chamado.
                </td></tr>
              ) : rows.map(t => {
                const prio = PRIO[t.priority] ?? { label: t.priority, color: 'var(--text-muted)', bg: 'var(--surface-sunken)' }
                const sig = slaSignal(t.sla)
                return (
                  <tr key={t.id} className="ds-row-hover cursor-pointer border-t" style={{ borderColor: 'var(--border)' }}
                    onClick={() => openTicket(t.id)}>
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} title="Selecionar para mesclar" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{t.ticket_number ?? `#${t.id}`}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{t.subject}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.customer?.name ?? '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.category?.name ?? '—'}</td>
                    <td className="px-3 py-2"><Pill text={prio.label} color={prio.color} bg={prio.bg} /></td>
                    <td className="px-3 py-2">
                      {t.status
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: t.status.color ?? 'var(--text)' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: t.status.color ?? 'var(--text-muted)' }} />{t.status.label}
                          </span>
                        : '—'}
                      {t.status?.key === 'em_desenvolvimento' && t.dev_delivery_at && (() => {
                        const dd = (t.dev_delivery_at as string).slice(0, 10)
                        const d2 = new Date(); const todayStr = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`
                        const venc = dd < todayStr
                        return (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: venc ? 'var(--danger-border)' : 'var(--warning-border)' }}
                            title={venc ? 'Entrega em homologação vencida' : 'Entrega prevista em homologação'}>
                            🚧 {dd.split('-').reverse().join('/')}{venc ? ' · vencida' : ''}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.assignee?.name ?? <span style={{ color: 'var(--warning-border)' }}>—</span>}</td>
                    <td className="px-3 py-2" title={sig.label}><span style={{ color: sig.color }}>{sig.dot} {sig.label}</span></td>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>{fmtDate(t.updated_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {novo && <NovoChamadoModal meta={meta} customers={customers} onClose={() => setNovo(false)} onCreated={(id) => { setNovo(false); router.push(`/help-desk/tickets/${id}`) }} />}
      {mergeOpen && (
        <MesclarModal
          sources={rows.filter(r => sel.has(r.id)).map(r => ({ id: r.id, ticket_number: r.ticket_number, subject: r.subject, customer_id: r.customer?.id ?? null, customer_nome: r.customer?.name ?? null }))}
          onClose={() => setMergeOpen(false)}
          onDone={() => { setMergeOpen(false); setSel(new Set()); load() }}
        />
      )}
    </AppLayout>
  )
}

