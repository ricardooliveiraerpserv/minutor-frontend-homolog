'use client'

import { useEffect, useState } from 'react'
import { api, ApiError, apiMessage } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { toast } from 'sonner'
import { X, Send, Paperclip, ShieldCheck, ShieldQuestion, Check, X as XIcon } from 'lucide-react'

/**
 * Conversa da atividade DENTRO do cronograma do cliente — drawer lateral.
 * Reusa os endpoints do portal: GET /client/activities/{id} (+ /timeline),
 * POST .../comments | /approve | /reject. Só o responsável comenta; os demais
 * veem o andamento. Sem horas/valores. Fecha sem sair do cronograma.
 */

interface ClientActivity {
  id: number
  title: string
  description: string | null
  status: string
  planned_start_at: string | null
  due_date: string | null
  completed_at: string | null
  responsible_name: string | null
  stage_name: string | null
  project_name: string | null
  approval_status?: string | null
  approval_note?: string | null
  approval_decided_at?: string | null
  approval_decided_by_name?: string | null
  is_responsible?: boolean
  can_comment?: boolean
  can_approve?: boolean
}
interface TimelineEvent {
  id: number
  type: string
  payload: Record<string, unknown> | null
  attachment_path: string | null
  attachment_original_name: string | null
  created_at: string
  actor: { id: number; name: string; email?: string | null } | null
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', in_progress: 'Em andamento', waiting_client: 'Aguardando cliente', review: 'Homologação', done: 'Concluída',
}
const fmtDate = (iso: string | null) => { if (!iso) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso }
const fmtDateTime = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
const labelType = (t: string) => ({ comment: 'Comentário', delivery_created: 'Atividade criada', delivery_moved: 'Status alterado', delivery_completed: 'Atividade concluída', client_involved: 'Cliente envolvido', client_removed: 'Cliente removido', approval_requested: 'Aprovação solicitada', approval_approved: 'Aprovado', approval_rejected: 'Ajustes solicitados' }[t] ?? t)

export function ClientActivityDrawer({ activityId, onClose, onChanged }: { activityId: number | null; onClose: () => void; onChanged?: () => void }) {
  const [activity, setActivity] = useState<ClientActivity | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [decisionNote, setDecisionNote] = useState('')

  async function load(id: number) {
    setLoading(true); setError(null)
    try {
      const [act, tl] = await Promise.all([
        api.get<ClientActivity>(`/client/activities/${id}`),
        api.get<{ items: TimelineEvent[] }>(`/client/activities/${id}/timeline`),
      ])
      setActivity(act); setEvents(tl.items ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (activityId == null) { setActivity(null); setEvents([]); setText(''); setFile(null); setDecisionNote(''); return }
    load(activityId)
  }, [activityId])

  const sendAction = useAsyncAction(async () => {
    if (activityId == null) return
    if (!text.trim() && !file) { toast.error('Escreva um comentário ou anexe um arquivo.'); return }
    const form = new FormData()
    if (text.trim()) form.append('text', text.trim())
    if (file) form.append('attachment', file)
    await api.post(`/client/activities/${activityId}/comments`, form)
    setText(''); setFile(null)
    toast.success('Comentário enviado')
    load(activityId); onChanged?.()
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao enviar')) })

  const decideAction = useAsyncAction(async (action: 'approve' | 'reject') => {
    if (activityId == null) return
    const note = decisionNote.trim() || null
    const updated = await api.post<ClientActivity>(`/client/activities/${activityId}/${action}`, note != null ? { note } : {})
    setActivity(updated); setDecisionNote('')
    toast.success(action === 'approve' ? 'Atividade aprovada' : 'Ajustes solicitados')
    load(activityId); onChanged?.()
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao registrar')) })

  if (activityId == null) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 24px -12px rgba(0,0,0,.4)' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {activity?.project_name ? `${activity.project_name} · ` : ''}{activity?.stage_name ?? '—'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{activity?.title ?? 'Atividade'}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

          {activity && (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5 }}>
                <Cell label="Status" value={STATUS_LABEL[activity.status] ?? activity.status} />
                <Cell label="Responsável" value={activity.responsible_name ?? '—'} />
                <Cell label="Início" value={fmtDate(activity.planned_start_at)} />
                <Cell label="Prazo" value={fmtDate(activity.due_date)} />
                {activity.completed_at && <Cell label="Concluída em" value={fmtDateTime(activity.completed_at)} />}
              </div>

              {activity.approval_status === 'pending' && activity.can_approve && (
                <div style={{ padding: 14, borderRadius: 8, background: 'var(--warning-bg)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldQuestion size={16} style={{ color: 'var(--warning)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>Esta atividade aguarda a sua aprovação</span>
                  </div>
                  <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} rows={2} className="ds-input"
                    placeholder="Comentário (opcional)…" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: 8, fontSize: 13, margin: '10px 0' }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => decideAction.run('approve')} disabled={decideAction.pending} className="ds-btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px' }}>
                      <Check size={14} /> Aprovar
                    </button>
                    <button onClick={() => decideAction.run('reject')} disabled={decideAction.pending}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px', background: 'transparent', border: '1px solid var(--info)', color: 'var(--info)', borderRadius: 6, cursor: 'pointer' }}>
                      <XIcon size={14} /> Solicitar ajustes
                    </button>
                  </div>
                </div>
              )}

              {activity.approval_status === 'approved' && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--success-bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={16} /> Aprovado{activity.approval_decided_by_name ? ` por ${activity.approval_decided_by_name}` : ''}
                </div>
              )}

              {activity.description && (
                <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  {activity.description}
                </div>
              )}

              <h3 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', margin: 0 }}>
                {(activity.can_comment ?? activity.is_responsible) ? 'Conversa' : 'Andamento'}
              </h3>

              {(activity.can_comment ?? activity.is_responsible) && (
                <div className="ds-card" style={{ padding: 12 }}>
                  <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className="ds-input"
                    placeholder="Escreva um comentário…" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: 8, fontSize: 13 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                      <Paperclip size={12} /> {file ? file.name : 'Anexar arquivo'}
                      <input type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {file && <button onClick={() => setFile(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>remover</button>}
                    <button type="button" className="ds-btn-primary" onClick={() => sendAction.run()} disabled={sendAction.pending}
                      style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Send size={12} /> {sendAction.pending ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {events.map(ev => (
                  <li key={ev.id} className="ds-card" style={{ padding: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{ev.actor?.name ?? 'Sistema'} · {labelType(ev.type)}</span>
                      <span>{fmtDateTime(ev.created_at)}</span>
                    </div>
                    {typeof ev.payload?.text === 'string' && (
                      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{String(ev.payload.text)}</div>
                    )}
                    {ev.attachment_path && (
                      <a href={`/storage/${ev.attachment_path}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--primary)' }}>
                        <Paperclip size={11} /> {ev.attachment_original_name ?? 'anexo'}
                      </a>
                    )}
                  </li>
                ))}
                {events.length === 0 && !loading && (
                  <li style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                    Nenhuma interação ainda.{(activity.can_comment ?? activity.is_responsible) ? ' Seja o primeiro a comentar.' : ''}
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  )
}
