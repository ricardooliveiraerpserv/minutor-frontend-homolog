'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { startSession, getSession } from '@/lib/help-desk-session'
import { startWorkSession } from '@/lib/work-session'
import { ServiceTreeSelect } from '@/components/help-desk/service-tree-select'
import { Ticket, Plus, Search, Inbox, X, Play } from 'lucide-react'

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
}
interface ServiceOpt { id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }
interface Meta { priorities: string[]; statuses: StatusOpt[]; categories: CategoryOpt[]; teams: Ref[]; services?: ServiceOpt[]; my_inform?: Record<string, boolean>; can_open?: boolean }

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

  const F0 = { search: '', status_key: '', priority: '', category_id: '', team_id: '', assignee_id: '', customer_id: '' }
  const [f, setF] = useState<Record<string, string>>(F0)
  const [mine, setMine] = useState(false)
  const [open, setOpen] = useState(false)
  const [breached, setBreached] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (mine) p.set('mine', '1')
    if (open) p.set('open', '1')
    if (breached) p.set('breached', '1')
    return p.toString()
  }, [f, mine, open, breached])

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
  }, [])

  // Inicia/atualiza a sessão de atendimento e abre o chamado (preserva a ordem exibida).
  const openTicket = (ticketId: number) => {
    startSession({ source: 'list', label: 'Chamados', ids: rows.map(r => r.id), filters: { ...f, mine, open, breached } })
    router.push(`/help-desk/tickets/${ticketId}`)
  }

  // Modo Atendimento — inicia uma sessão contínua a partir da fila atual.
  const iniciarModo = async () => {
    if (rows.length === 0) return toast.error('Nenhum chamado na fila.')
    const teamName = meta?.teams.find(t => String(t.id) === f.team_id)?.name
    const first = await startWorkSession({ scope: 'help_desk', source: 'list', filters: { ...f, mine, open, breached }, label: teamName ? `Fila: ${teamName}` : 'Atendimento', ids: rows.map(r => r.id) })
    if (first) router.push(`/help-desk/tickets/${first}`)
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

  const counters = useMemo(() => ({
    total: rows.length,
    abertos: rows.filter(t => t.status?.is_open).length,
    semAtendente: rows.filter(t => !t.assignee).length,
    atraso: rows.filter(t => t.sla?.first_response_breached || t.sla?.resolution_breached || t.sla?.first_response_overdue || t.sla?.resolution_overdue).length,
    meus: rows.filter(t => t.assignee?.id === user?.id).length,
  }), [rows, user?.id])

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
          <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={iniciarModo}>
            <Play size={15} /> Iniciar Modo Atendimento
          </button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setNovo(true)}>
            <Plus size={16} /> Novo chamado
          </button>
        </div>

        {/* KPIs / filtros rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: 'abertos', label: 'Abertos', v: counters.abertos, active: open, onClick: () => setOpen(o => !o) },
            { k: 'sem', label: 'Sem atendente', v: counters.semAtendente, active: false, onClick: () => set('status_key', '') },
            { k: 'atraso', label: 'Em atraso (SLA)', v: counters.atraso, active: breached, onClick: () => setBreached(b => !b) },
            { k: 'meus', label: 'Meus chamados', v: counters.meus, active: mine, onClick: () => setMine(m => !m) },
          ].map(c => (
            <button key={c.k} onClick={c.onClick}
              className="ds-card text-left px-3 py-2 rounded-lg transition"
              style={{ borderColor: c.active ? 'var(--primary)' : 'var(--border)' }}>
              <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{c.label}{c.active ? ' • filtrando' : ''}</div>
              <div className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{c.v}</div>
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

        {/* Tabela */}
        <div className="ds-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase tracking-wide">
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
                <tr><td colSpan={9} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  <Inbox size={20} className="inline mr-1.5 -mt-0.5" /> Nenhum chamado.
                </td></tr>
              ) : rows.map(t => {
                const prio = PRIO[t.priority] ?? { label: t.priority, color: 'var(--text-muted)', bg: 'var(--surface-sunken)' }
                const sig = slaSignal(t.sla)
                return (
                  <tr key={t.id} className="ds-row-hover cursor-pointer border-t" style={{ borderColor: 'var(--border)' }}
                    onClick={() => openTicket(t.id)}>
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

      {novo && <NovoChamado meta={meta} customers={customers} onClose={() => setNovo(false)} onCreated={(id) => { setNovo(false); router.push(`/help-desk/tickets/${id}`) }} />}
    </AppLayout>
  )
}

function NovoChamado({ meta, customers, onClose, onCreated }: { meta: Meta | null; customers: Ref[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/help-desk/tickets', {
        subject: subject.trim(), description: description.trim() || null, priority,
        category_id: categoryId || null, service_id: serviceId || null, customer_id: customerId || null,
      })
      toast.success('Chamado aberto')
      onCreated(r.data.id)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao abrir chamado') } finally { setSaving(false) }
  }

  const lbl = 'text-[11px] font-semibold block mb-0.5'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Novo chamado</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Assunto *</label>
          <input className={`${fieldCls} w-full`} style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição</label>
          <textarea className={`${fieldCls} w-full`} style={inputStyle} rows={4} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(meta?.my_inform?.urgency ?? true) && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Urgência</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                {(meta?.priorities ?? ['baixa', 'normal', 'alta', 'urgente']).map(p => <option key={p} value={p}>{PRIO[p]?.label ?? p}</option>)}
              </select>
            </div>
          )}
          {(meta?.my_inform?.category ?? true) && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Categoria</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {meta?.categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {(meta?.my_inform?.service ?? true) && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Serviço</label>
            <ServiceTreeSelect services={meta?.services ?? []} value={serviceId ? Number(serviceId) : null} onChange={id => setServiceId(id ? String(id) : '')} />
          </div>
        )}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Cliente</label>
          <select className={`${fieldCls} w-full`} style={inputStyle} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">— (interno)</option>
            {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir chamado'}</button>
        </div>
      </div>
    </div>
  )
}
