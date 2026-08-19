'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, secureUrl } from '@/lib/api'
import { toast } from 'sonner'
import { X, Send, Paperclip, CheckCircle2, ExternalLink, CalendarDays } from 'lucide-react'

/**
 * Detalhe de um Follow Up no Portal do Cliente — o Follow Up é a unidade de
 * comunicação. Cliente envolvido pode comentar, anexar, concluir e ver um
 * resumo da atividade vinculada (sem informações internas).
 */
interface FUEvent {
  id: number; type: string; payload: Record<string, unknown> | null
  attachment_path: string | null; attachment_original_name: string | null
  created_at: string; actor: { id: number; name: string } | null
}
interface FU {
  id: number; title: string; description: string | null; status: string
  due_date: string | null; responsible: string | null
  delivery_id: number | null; delivery_title: string | null
}
interface ActSummary {
  title: string; description: string | null; status: string
  planned_start_at: string | null; due_date: string | null; completed_at: string | null
  responsible_name: string | null; stage_name: string | null; project_name: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aberto', in_progress: 'Aberto', waiting_third: 'Aberto', completed: 'Concluído', cancelled: 'Cancelado',
}
const ACT_STATUS: Record<string, string> = {
  backlog: 'A iniciar', in_progress: 'Em andamento', waiting_client: 'Aguardando você', review: 'Homologação', done: 'Concluída',
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function evLabel(t: string): string {
  return ({ created: 'criou', comment: 'comentou', status_changed: 'mudou o status', concluded: 'concluiu', reopened: 'reabriu' } as Record<string, string>)[t] ?? t
}

export function ClientFollowUpDetail({ followUpId, onClose, onChanged }: {
  followUpId: number
  onClose: () => void
  onChanged: () => void
}) {
  const [fu, setFu] = useState<FU | null>(null)
  const [events, setEvents] = useState<FUEvent[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [act, setAct] = useState<ActSummary | null>(null)
  const [showAct, setShowAct] = useState(false)

  async function load() {
    try {
      const [f, tl] = await Promise.all([
        api.get<FU>(`/client/follow-ups/${followUpId}`),
        api.get<{ items: FUEvent[] }>(`/client/follow-ups/${followUpId}/timeline`),
      ])
      setFu(f); setEvents(tl.items ?? [])
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao carregar') }
  }
  useEffect(() => { load() }, [followUpId])

  async function send() {
    if (!text.trim() && !file) { toast.error('Escreva um comentário ou anexe um arquivo'); return }
    setSending(true)
    try {
      const form = new FormData()
      if (text.trim()) form.append('text', text.trim())
      if (file) form.append('attachment', file)
      await api.post(`/client/follow-ups/${followUpId}/comments`, form)
      setText(''); setFile(null); load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao enviar') }
    finally { setSending(false) }
  }

  async function conclude() {
    if (!confirm('Concluir este Follow Up?')) return
    try { await api.post(`/client/follow-ups/${followUpId}/complete`, {}); toast.success('Follow Up concluído'); load(); onChanged() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao concluir') }
  }

  async function goActivity() {
    if (act) { setShowAct(v => !v); return }
    try { const a = await api.get<ActSummary>(`/client/follow-ups/${followUpId}/activity-summary`); setAct(a); setShowAct(true) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Sem atividade vinculada') }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 24px rgba(0,0,0,.2)', zIndex: 10001, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{fu?.title ?? 'Follow Up'}</div>
            {fu && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{STATUS_LABEL[fu.status] ?? fu.status}</span>
                {fu.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><CalendarDays size={11} /> {fmtDate(fu.due_date)}</span>}
                {fu.responsible && <span>Resp.: {fu.responsible}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {fu?.description && <p style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginTop: 0 }}>{fu.description}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {fu?.delivery_id && (
              <button onClick={goActivity} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
                <ExternalLink size={13} /> Ir para Atividade
              </button>
            )}
            {fu && fu.status !== 'completed' && fu.status !== 'cancelled' && (
              <button onClick={conclude} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--success)', color: 'var(--success)' }}>
                <CheckCircle2 size={13} /> Concluir
              </button>
            )}
          </div>

          {showAct && act && (
            <div style={{ padding: 12, marginBottom: 14, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Atividade vinculada</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{act.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {act.stage_name} · {ACT_STATUS[act.status] ?? act.status} · {fmtDate(act.planned_start_at)} – {fmtDate(act.due_date)}
              </div>
              {act.description && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{act.description}</div>}
            </div>
          )}

          <h2 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Conversa</h2>
          <div className="ds-card" style={{ padding: 12, marginBottom: 16 }}>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Escreva um comentário…" rows={3} className="ds-input" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: 8, fontSize: 13 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                <Paperclip size={12} /> {file ? file.name : 'Anexar'}
                <input type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {file && <button onClick={() => setFile(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>remover</button>}
              <button onClick={send} disabled={sending} className="ds-btn-primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Send size={12} /> {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map(ev => (
              <li key={ev.id} className="ds-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{ev.actor?.name ?? 'Sistema'} · {evLabel(ev.type)}</span>
                  <span>{fmtDateTime(ev.created_at)}</span>
                </div>
                {typeof ev.payload?.text === 'string' && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{String(ev.payload.text)}</div>}
                {ev.attachment_path && (
                  <a href={secureUrl(`/storage/${ev.attachment_path}`)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--primary)' }}>
                    <Paperclip size={11} /> {ev.attachment_original_name ?? 'anexo'}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>,
    document.body,
  )
}
