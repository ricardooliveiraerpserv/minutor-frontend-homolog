'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, secureUrl } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, X, Send, Paperclip, CalendarDays, CheckCircle2, Circle, User } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { HolidayDatePicker } from '@/components/ui/holiday-date-picker'

/**
 * Acompanhamentos da atividade (revisão conceitual): camada LEVE de comunicação
 * e cobrança — NÃO é um segundo workflow. Sem kanban. Status só Aberto/Concluído.
 * Cada acompanhamento tem comentários, anexos e histórico (a conversa do compromisso).
 */
interface Acomp {
  id: number
  title: string
  description: string | null
  status: string
  due_date: string | null
  client_involved?: boolean
  responsible?: { id: number; name: string } | null
  created_at: string | null
  completed_at?: string | null
}
const isDone = (s: string) => s === 'completed'
const fmtDate = (iso: string | null) => { if (!iso) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}` : iso }

export function AcompanhamentosList({ projectId, stageId, deliveryId }: {
  projectId: number; stageId?: number | null; deliveryId: number
}) {
  const [items, setItems] = useState<Acomp[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [teamOpts, setTeamOpts] = useState<{ id: number; name: string }[]>([])
  const [clienteOpts, setClienteOpts] = useState<{ id: number; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items: Acomp[] }>(`/follow-ups?delivery_id=${deliveryId}&pageSize=200`)
      setItems(r.items ?? [])
    } catch { /* */ } finally { setLoading(false) }
  }, [deliveryId])
  useEffect(() => { load() }, [load])

  // Equipe do projeto (definida na Visão Geral): consultores p/ Responsável e
  // clientes p/ "Cliente envolvido". Só essas pessoas aparecem.
  useEffect(() => {
    api.get<any>(`/projects/${projectId}/team`).then(t => {
      const arr = (x: any) => Array.isArray(x) ? x : []
      setTeamOpts(arr(t?.consultores).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })))
      setClienteOpts(arr(t?.clientes).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })))
    }).catch(() => {})
  }, [projectId])

  async function toggleDone(a: Acomp) {
    try {
      await api.patch(`/follow-ups/${a.id}`, { status: isDone(a.status) ? 'pending' : 'completed' })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar') }
  }

  const total = items.length
  const done = items.filter(a => isDone(a.status)).length
  const pend = total - done

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{total}</strong> acompanhamento{total === 1 ? '' : 's'} · <span style={{ color: 'var(--warning)' }}>{pend} pendente{pend === 1 ? '' : 's'}</span> · <span style={{ color: 'var(--success)' }}>{done} concluído{done === 1 ? '' : 's'}</span>
        </div>
        <button onClick={() => setCreating(true)} className="ds-btn-primary" style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Plus size={12} /> Novo acompanhamento</button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Acompanhamentos são compromissos/cobranças da atividade (não criam um workflow paralelo). Marque <strong>Cliente envolvido</strong> para o cliente ver e responder no Portal.
      </p>

      {loading ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando…</p>
        : items.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Nenhum acompanhamento ainda.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(a => {
                const done = isDone(a.status)
                const overdue = !done && a.due_date && a.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10)
                return (
                  <div key={a.id} className="ds-row-hover" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <button onClick={() => toggleDone(a)} title={done ? 'Reabrir' : 'Concluir'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, color: done ? 'var(--success)' : 'var(--text-muted)' }}>
                      {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpenId(a.id)}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.7 : 1 }}>{a.title}</div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        {a.responsible?.name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><User size={11} /> {a.responsible.name.split(' ')[0]}</span>}
                        {a.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}><CalendarDays size={11} /> {done && a.completed_at ? `Concluído ${fmtDate(a.completed_at)}` : fmtDate(a.due_date)}</span>}
                        {a.client_involved && <span style={{ color: 'var(--info)', fontWeight: 600 }}>Cliente envolvido</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

      {creating && (
        <NovoAcompanhamento projectId={projectId} stageId={stageId} deliveryId={deliveryId} teamOpts={teamOpts} clienteOpts={clienteOpts}
          onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />
      )}
      {openId != null && (
        <AcompanhamentoDetail acompId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  )
}

/* ---------- Novo acompanhamento (form compacto) ---------- */
function NovoAcompanhamento({ projectId, stageId, deliveryId, teamOpts, clienteOpts, onClose, onCreated }: {
  projectId: number; stageId?: number | null; deliveryId: number
  teamOpts: { id: number; name: string }[]; clienteOpts: { id: number; name: string }[]
  onClose: () => void; onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responsible, setResponsible] = useState('')
  const [due, setDue] = useState<string | null>(null)
  const [priority, setPriority] = useState('media')
  const [clientInvolved, setClientInvolved] = useState(false)
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { toast.error('Informe o título'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(), description: description.trim() || null, category: 'Acompanhamento', priority,
        due_date: due, delivery_id: deliveryId, stage_id: stageId ?? undefined, project_id: projectId,
      }
      if (responsible) body.responsible_user_id = Number(responsible)
      if (clientInvolved) { body.client_involved = true; if (clientId) body.client_user_id = Number(clientId) }
      await api.post('/follow-ups', body)
      toast.success('Acompanhamento criado'); onCreated()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao criar') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 10, background: 'var(--surface)' }}>
      <input autoFocus className="ds-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="O que precisa acontecer? (ex.: Cliente validar XML)" style={{ width: '100%', fontSize: 13, padding: '6px 8px' }} />
      <textarea className="ds-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={2} style={{ width: '100%', marginTop: 8, padding: 8, resize: 'vertical', fontSize: 13 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <div style={{ minWidth: 180 }}><Lbl t="Responsável" /><SearchSelect value={responsible} onChange={setResponsible} options={teamOpts} placeholder="Time da atividade…" fullWidth /></div>
        <div><Lbl t="Prioridade" /><select className="ds-input" value={priority} onChange={e => setPriority(e.target.value)} style={{ fontSize: 13, padding: '6px 8px' }}>
          <option value="baixa">Baixa</option>
          <option value="media">Média</option>
          <option value="alta">Alta</option>
          <option value="critica">Crítica</option>
        </select></div>
        <div><Lbl t="Prazo previsto" /><HolidayDatePicker value={due} onChange={setDue} placeholder="Definir" /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={clientInvolved} onChange={e => setClientInvolved(e.target.checked)} /> Cliente envolvido
        </label>
        {clientInvolved && <div style={{ marginTop: 6, maxWidth: 280 }}><SearchSelect value={clientId} onChange={setClientId} options={clienteOpts} placeholder="Cliente do projeto…" fullWidth /></div>}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Cancelar</button>
        <button onClick={save} disabled={saving || !title.trim()} className="ds-btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>{saving ? '…' : 'Criar'}</button>
      </div>
    </div>
  )
}
function Lbl({ t }: { t: string }) { return <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{t}</div> }

/* ---------- Detalhe: conversa (comentários + anexos + histórico) ---------- */
interface FUEvent { id: number; type: string; payload: Record<string, unknown> | null; attachment_path: string | null; attachment_original_name: string | null; created_at: string; actor: { id: number; name: string } | null }
function AcompanhamentoDetail({ acompId, onClose, onChanged }: { acompId: number; onClose: () => void; onChanged: () => void }) {
  const [acomp, setAcomp] = useState<Acomp | null>(null)
  const [events, setEvents] = useState<FUEvent[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const [a, tl] = await Promise.all([
        api.get<Acomp>(`/follow-ups/${acompId}`),
        api.get<{ items: FUEvent[] }>(`/follow-ups/${acompId}/activity`),
      ])
      setAcomp(a); setEvents(tl.items ?? [])
    } catch { /* */ }
  }, [acompId])
  useEffect(() => { load() }, [load])

  async function send() {
    if (!text.trim() && !file) { toast.error('Escreva um comentário ou anexe'); return }
    setSending(true)
    try {
      const form = new FormData()
      if (text.trim()) form.append('text', text.trim())
      if (file) form.append('attachment', file)
      await api.post(`/follow-ups/${acompId}/comments`, form)
      setText(''); setFile(null); load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao enviar') }
    finally { setSending(false) }
  }
  async function toggleDone() {
    if (!acomp) return
    try { await api.patch(`/follow-ups/${acompId}`, { status: isDone(acomp.status) ? 'pending' : 'completed' }); load(); onChanged() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(540px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 24px rgba(0,0,0,.2)', zIndex: 10001, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{acomp?.title ?? 'Acompanhamento'}</div>
            {acomp && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: isDone(acomp.status) ? 'var(--success)' : 'var(--warning)' }}>{isDone(acomp.status) ? 'Concluído' : 'Aberto'}</span>
                {acomp.responsible?.name && <span>Resp.: {acomp.responsible.name}</span>}
                {acomp.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><CalendarDays size={11} /> {fmtDate(acomp.due_date)}</span>}
                {acomp.client_involved && <span style={{ color: 'var(--info)', fontWeight: 600 }}>Cliente envolvido</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {acomp?.description && <p style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginTop: 0 }}>{acomp.description}</p>}
          {acomp && (
            <button onClick={toggleDone} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: `1px solid ${isDone(acomp.status) ? 'var(--text-muted)' : 'var(--success)'}`, color: isDone(acomp.status) ? 'var(--text-muted)' : 'var(--success)', marginBottom: 14 }}>
              <CheckCircle2 size={13} /> {isDone(acomp.status) ? 'Reabrir' : 'Concluir'}
            </button>
          )}

          <h2 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Conversa</h2>
          <div className="ds-card" style={{ padding: 12, marginBottom: 16 }}>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Comentar…" rows={2} className="ds-input" style={{ width: '100%', resize: 'vertical', padding: 8, fontSize: 13 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                <Paperclip size={12} /> {file ? file.name : 'Anexar'}<input type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {file && <button onClick={() => setFile(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>remover</button>}
              <button onClick={send} disabled={sending} className="ds-btn-primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Send size={12} /> {sending ? '…' : 'Enviar'}</button>
            </div>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map(ev => (
              <li key={ev.id} className="ds-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{ev.actor?.name ?? 'Sistema'}</span>
                  <span>{new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {typeof ev.payload?.text === 'string' && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{String(ev.payload.text)}</div>}
                {ev.attachment_path && <a href={secureUrl(`/storage/${ev.attachment_path}`)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--primary)' }}><Paperclip size={11} /> {ev.attachment_original_name ?? 'anexo'}</a>}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>,
    document.body,
  )
}
