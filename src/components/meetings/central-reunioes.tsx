'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Video, CalendarClock, Users, ExternalLink, X, Search, Plus, Link2, Trash2, Pencil, AlertTriangle } from 'lucide-react'
import { AgendarReuniaoModal } from '@/components/help-desk/agendar-reuniao-modal'
import { MeetingDetailsModal } from '@/components/meetings/meeting-details-modal'
import { AgendaSidebar } from '@/components/notifications/agenda-sidebar'

// Central de Reuniões — agenda ÚNICA de todo o sistema. Lista as reuniões de qualquer origem
// (chamado/projeto/cliente/contrato/agenda), com filtros. Reusa GET /meetings. Usada como página
// (/reunioes) e como aba dentro do Meu Dia — por isso NÃO traz AppLayout.

interface Meeting {
  id: number; title: string; provider: string; status: string
  starts_at: string; ends_at: string | null; duration_minutes: number | null
  join_url: string | null; participants: { name: string | null }[]
  origin_type: string | null; origin_label: string | null; origin_id: number | null; origin_ref: string | null
}
interface CalEvent { id: string; subject: string; starts_at: string; ends_at: string | null; is_all_day: boolean; is_online: boolean; join_url: string | null; location?: string | null; organizer?: string | null; attendees?: string[]; web_link?: string | null; preview?: string | null }
type Row = { kind: 'meeting'; m: Meeting } | { kind: 'cal'; c: CalEvent }
const PROV: Record<string, string> = { teams: 'Teams', meet: 'Meet', zoom: 'Zoom', webex: 'Webex', presencial: 'Presencial' }
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Agendada', color: 'var(--primary)', bg: 'var(--primary-soft)' },
  live: { label: 'Em andamento', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  ended: { label: 'Realizada', color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
  canceled: { label: 'Cancelada', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const ORIGIN_HREF: Record<string, (id: number) => string> = {
  HELPDESK_TICKET: id => `/help-desk/tickets/${id}`,
  PROJECT: id => `/projects?highlight=${id}`,
}
const fmtDay = (s: string) => new Date(s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function periodRange(p: string): { from?: string; to?: string } {
  if (p === 'todos') return {}
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  if (p === 'hoje') end.setDate(end.getDate() + 1)
  else if (p === 'semana') end.setDate(end.getDate() + 7)
  else if (p === 'mes') end.setMonth(end.getMonth() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export function CentralReunioes() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('semana')
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [search, setSearch] = useState('')
  const [novaOpen, setNovaOpen] = useState(false)
  const [editMeeting, setEditMeeting] = useState<{ id: number; title: string; starts_at: string; duration_minutes: number } | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<Meeting | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [calDetail, setCalDetail] = useState<CalEvent | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [calEvents, setCalEvents] = useState<CalEvent[]>([])
  const [calState, setCalState] = useState<{ connected: boolean; configured: boolean; reauth?: boolean }>({ connected: false, configured: false })
  const [showCal, setShowCal] = useState(true)

  const connectMicrosoft = async () => {
    setConnecting(true)
    try {
      const r = await api.post<{ data: { authorize_url: string } }>('/integrations/microsoft/connect', {})
      if (r?.data?.authorize_url) window.location.href = r.data.authorize_url
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Integração indisponível no momento.') } finally { setConnecting(false) }
  }

  const load = useCallback(() => {
    setLoading(true)
    const { from, to } = periodRange(period)
    const p = new URLSearchParams()
    if (from) p.set('from', from); if (to) p.set('to', to)
    if (status) p.set('status', status); if (provider) p.set('provider', provider)
    if (search.trim()) p.set('search', search.trim())
    api.get<{ data: Meeting[] }>(`/meetings?${p.toString()}`).then(r => setMeetings(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false))
    // Calendário Microsoft do usuário (Meu Dia) — read-only, some se não conectado. Nunca trava.
    const cp = new URLSearchParams(); if (from) cp.set('from', from); if (to) cp.set('to', to)
    api.get<{ connected: boolean; configured: boolean; reauth?: boolean; data: CalEvent[] }>(`/meetings/calendar?${cp.toString()}`)
      .then(r => { setCalEvents(r?.data ?? []); setCalState({ connected: !!r?.connected, configured: !!r?.configured, reauth: r?.reauth }) })
      .catch(() => { setCalEvents([]) })
  }, [period, status, provider, search])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const doCancel = async (m: Meeting) => {
    setCanceling(true)
    try { await api.post(`/meetings/${m.id}/cancel`, {}); toast.success('Reunião cancelada.'); load() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
    finally { setCanceling(false); setConfirmCancel(null) }
  }
  const clearMeeting = async (m: Meeting) => {
    try { await api.delete(`/meetings/${m.id}`); toast.success('Reunião removida da agenda.'); load() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  // Agrupa por dia (agenda) — reuniões do Minutor + eventos do calendário Microsoft.
  const byDay = useMemo(() => {
    const rows: Row[] = meetings.map(m => ({ kind: 'meeting' as const, m }))
    if (showCal) {
      // não duplica: um evento do calendário que já é uma reunião do Minutor (mesmo join_url) é omitido.
      const known = new Set(meetings.map(m => m.join_url).filter(Boolean))
      for (const c of calEvents) if (!c.join_url || !known.has(c.join_url)) rows.push({ kind: 'cal', c })
    }
    const at = (r: Row) => new Date(r.kind === 'meeting' ? r.m.starts_at : r.c.starts_at).getTime()
    const g: Record<string, Row[]> = {}
    for (const r of rows.sort((a, b) => at(a) - at(b))) {
      const s = r.kind === 'meeting' ? r.m.starts_at : r.c.starts_at
      const k = s.slice(0, 10); (g[k] ??= []).push(r)
    }
    return g
  }, [meetings, calEvents, showCal])

  const seg = (v: string, l: string) => (
    <button onClick={() => setPeriod(v)} className="text-sm px-3 py-1.5 rounded-lg transition-colors"
      style={{ background: period === v ? 'var(--primary)' : 'transparent', color: period === v ? 'var(--primary-fg)' : 'var(--text-muted)', fontWeight: period === v ? 600 : 400 }}>{l}</button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-lg font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><Video size={18} style={{ color: 'var(--primary)' }} /> Central de Reuniões</h1>
        <span className="text-sm" style={{ color: 'var(--text-light)' }}>· {meetings.length} reunião(ões)</span>
        <button onClick={() => { setEditMeeting(null); setNovaOpen(true) }} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ml-auto"><Plus size={15} /> Nova reunião</button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--surface-sunken)' }}>{seg('hoje', 'Hoje')}{seg('semana', 'Semana')}{seg('mes', 'Mês')}{seg('todos', 'Todos')}</div>
        <select className="ds-input text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className="ds-input text-sm" value={provider} onChange={e => setProvider(e.target.value)}><option value="">Todos os tipos</option>{Object.entries(PROV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
          <input className="ds-input w-full pl-8 text-sm" placeholder="Pesquisar título…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* Calendário Microsoft — toggle + estado da conexão */}
          {calState.connected
            ? <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setShowCal(v => !v)} className="text-xs inline-flex items-center gap-1.5" style={{ color: showCal ? 'var(--primary)' : 'var(--text-light)' }}>
                  <CalendarClock size={13} /> {showCal ? 'Ocultar' : 'Mostrar'} meu calendário Microsoft
                </button>
                {calState.reauth && <button onClick={connectMicrosoft} disabled={connecting} className="text-xs inline-flex items-center gap-1 disabled:opacity-50" style={{ color: 'var(--warning-border)' }}><Link2 size={13} /> Reconectar conta</button>}
              </div>
            : calState.configured
              ? <button onClick={connectMicrosoft} disabled={connecting} className="ds-btn-secondary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
                  <Link2 size={13} style={{ color: 'var(--primary)' }} /> {connecting ? 'Conectando…' : 'Conectar conta Microsoft'} <span style={{ color: 'var(--text-light)' }}>— ver seu calendário aqui</span>
                </button>
              : <div className="text-xs" style={{ color: 'var(--text-light)' }}>Integração Microsoft indisponível no momento.</div>}

          {loading ? <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
            : Object.keys(byDay).length === 0 ? <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Nenhuma reunião no período.</p>
            : Object.entries(byDay).map(([day, list]) => (
              <div key={day}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-3" style={{ color: 'var(--text-light)' }}>{fmtDay(day)}</div>
                <div className="ds-card overflow-hidden" style={{ padding: 0 }}>
                  {list.map(row => row.kind === 'cal' ? (() => {
                    const c = row.c
                    return (
                      <div key={`c-${c.id}`} onClick={() => setCalDetail(c)} className="flex items-center gap-3 px-4 py-2.5 border-t ds-row-hover cursor-pointer" style={{ borderColor: 'var(--border)', background: 'var(--surface-sunken)' }} title="Ver detalhes">
                        <div className="w-14 text-center shrink-0">
                          <div className="text-sm font-bold" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{c.is_all_day ? '—' : fmtTime(c.starts_at)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{c.subject}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Calendário Microsoft{c.is_online ? ' · online' : ''}</div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Agenda</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.join_url && <a href={c.join_url} target="_blank" onClick={e => e.stopPropagation()} className="ds-btn-secondary text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1"><ExternalLink size={11} /> Entrar</a>}
                        </div>
                      </div>
                    )
                  })() : (() => {
                    const m = row.m
                    const st = STATUS[m.status] ?? STATUS.scheduled
                    const originHref = m.origin_type && m.origin_id ? ORIGIN_HREF[m.origin_type]?.(m.origin_id) : null
                    return (
                      <div key={`m-${m.id}`} onClick={() => setDetailId(m.id)} className="flex items-center gap-3 px-4 py-2.5 border-t ds-row-hover cursor-pointer" style={{ borderColor: 'var(--border)' }} title="Ver detalhes">
                        <div className="w-14 text-center shrink-0">
                          <div className="text-sm font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(m.starts_at)}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{m.duration_minutes}min</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{m.title}</div>
                          <div className="text-[11px] inline-flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                            {m.origin_label && (originHref
                              ? <Link href={originHref} onClick={e => e.stopPropagation()} className="hover:underline" style={{ color: 'var(--primary)' }}>{m.origin_label}{m.origin_ref ? ` ${m.origin_ref}` : ''}</Link>
                              : <span>{m.origin_label}{m.origin_ref ? ` ${m.origin_ref}` : ''}</span>)}
                            <span>· {PROV[m.provider] ?? m.provider}</span>
                            {m.participants.length > 0 && <span className="inline-flex items-center gap-0.5"><Users size={10} /> {m.participants.length}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {m.status !== 'canceled' && m.status !== 'ended' && m.join_url &&
                            <a href={m.join_url} target="_blank" onClick={e => e.stopPropagation()} className="ds-btn-secondary text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1"><ExternalLink size={11} /> Entrar</a>}
                          {m.status === 'scheduled' && <button onClick={e => { e.stopPropagation(); setEditMeeting({ id: m.id, title: m.title, starts_at: m.starts_at, duration_minutes: m.duration_minutes ?? 30 }); setNovaOpen(true) }} title="Editar (reagendar)" className="p-1 rounded hover:bg-[var(--surface-hover)]"><Pencil size={13} style={{ color: 'var(--text-muted)' }} /></button>}
                          {m.status === 'scheduled' && <button onClick={e => { e.stopPropagation(); setConfirmCancel(m) }} title="Cancelar" className="p-1 rounded hover:bg-[var(--surface-hover)]"><X size={14} style={{ color: 'var(--danger-border)' }} /></button>}
                          {m.status === 'canceled' && <button onClick={e => { e.stopPropagation(); clearMeeting(m) }} title="Limpar da agenda" className="p-1 rounded hover:bg-[var(--surface-hover)]"><Trash2 size={13} style={{ color: 'var(--text-light)' }} /></button>}
                        </div>
                      </div>
                    )
                  })())}
                </div>
              </div>
            ))}
        </div>
        <aside className="lg:sticky lg:top-4">
          <AgendaSidebar selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </aside>
      </div>

      {novaOpen && <AgendarReuniaoModal meeting={editMeeting} onClose={() => { setNovaOpen(false); setEditMeeting(null) }} onCreated={() => { setNovaOpen(false); setEditMeeting(null); load() }} />}
      {confirmCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => !canceling && setConfirmCancel(null)}>
          <div className="ds-card w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--danger-bg)' }}>
                <AlertTriangle size={18} style={{ color: 'var(--danger-border)' }} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Cancelar reunião?</div>
                <div className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>“{confirmCancel.title}”</div>
              </div>
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Os participantes são notificados do cancelamento. Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={() => setConfirmCancel(null)} disabled={canceling}>Voltar</button>
              <button className="text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60" style={{ background: 'var(--danger-border)', color: '#fff' }} onClick={() => doCancel(confirmCancel)} disabled={canceling}>
                <X size={14} /> {canceling ? 'Cancelando…' : 'Cancelar reunião'}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailId !== null && <MeetingDetailsModal meetingId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}

      {calDetail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setCalDetail(null)}>
          <div className="ds-card w-full max-w-md overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <CalendarClock size={15} style={{ color: 'var(--primary)' }} /> Compromisso — Calendário Microsoft
              </div>
              <button onClick={() => setCalDetail(null)}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>{calDetail.subject}</div>
              <div className="space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                <div className="inline-flex items-center gap-2"><CalendarClock size={14} /> {calDetail.is_all_day ? 'Dia inteiro · ' : ''}{new Date(calDetail.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: calDetail.is_all_day ? undefined : 'short' })}{calDetail.ends_at && !calDetail.is_all_day ? ` – ${fmtTime(calDetail.ends_at)}` : ''}</div>
                {calDetail.organizer && <div className="inline-flex items-center gap-2"><Users size={14} /> Organizador: {calDetail.organizer}</div>}
                {calDetail.location && <div>📍 {calDetail.location}</div>}
                {calDetail.is_online && <div style={{ color: 'var(--success-border)' }}>● Reunião online</div>}
              </div>
              {calDetail.attendees && calDetail.attendees.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Participantes ({calDetail.attendees.length})</div>
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{calDetail.attendees.join(', ')}</div>
                </div>
              )}
              {calDetail.preview && <div className="text-sm rounded-lg p-2.5 whitespace-pre-wrap max-h-40 overflow-y-auto" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{calDetail.preview}</div>}
              <div className="flex flex-wrap gap-2 pt-1">
                {calDetail.join_url && <a href={calDetail.join_url} target="_blank" className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><ExternalLink size={14} /> Entrar</a>}
                {calDetail.web_link && <a href={calDetail.web_link} target="_blank" className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><ExternalLink size={14} /> Abrir no Outlook</a>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
