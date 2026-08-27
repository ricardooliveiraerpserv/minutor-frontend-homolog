'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, Trash2, Paperclip, Download, Plus, Check, Square, CheckSquare, Send } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { kanbanApi, PRIORITY_META, type KCardFull, type KLabel, type KUserRef, type KField } from '@/lib/client-kanban'
import { uploadAttachment, downloadAttachment, deleteAttachment } from '@/lib/attachments'
import { SearchSelect } from '@/components/ui/search-select'

interface Props {
  cardId: number
  boardLabels: KLabel[]
  fields: KField[]
  users: KUserRef[]
  onClose: () => void
  onSaved: () => void
}

export function KanbanCardModal({ cardId, boardLabels, fields, users, onClose, onSaved }: Props) {
  const [card, setCard] = useState<KCardFull | null>(null)
  const [saving, setSaving] = useState(false)
  const [newCheck, setNewCheck] = useState('')
  const [newComment, setNewComment] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Campos editáveis (estado local; persistidos no "Salvar").
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('')
  const [labelIds, setLabelIds] = useState<number[]>([])
  const [fieldVals, setFieldVals] = useState<Record<string, string | string[]>>({})

  function hydrate(c: KCardFull) {
    setCard(c)
    setTitle(c.title)
    setDescription(typeof c.description === 'string' ? c.description : '')
    setResponsibleId(c.responsible ? String(c.responsible.id) : '')
    setStartDate(c.start_date ?? '')
    setDueDate(c.due_date ?? '')
    setPriority(c.priority ?? '')
    setLabelIds(c.labels.map(l => l.id))
    // Hidrata os valores dos campos configuráveis (multiselect vem como JSON).
    const fv: Record<string, string | string[]> = {}
    for (const f of fields) {
      const raw = c.field_values?.[String(f.id)] ?? ''
      if (f.type === 'multiselect') {
        try { fv[f.id] = raw ? JSON.parse(raw) : [] } catch { fv[f.id] = [] }
      } else {
        fv[f.id] = raw ?? ''
      }
    }
    setFieldVals(fv)
  }

  function reload() { kanbanApi.card(cardId).then(hydrate).catch(() => {}) }
  useEffect(() => { kanbanApi.card(cardId).then(hydrate).catch(() => toast.error('Erro ao abrir o card')) }, [cardId])

  async function save() {
    if (!title.trim()) { toast.error('Título é obrigatório.'); return }
    // Campos obrigatórios preenchidos?
    for (const f of fields) {
      if (!f.required) continue
      const v = fieldVals[f.id]
      const empty = v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')
      if (empty) { toast.error(`Preencha o campo obrigatório "${f.name}".`); return }
    }
    setSaving(true)
    try {
      await kanbanApi.updateCard(cardId, {
        title: title.trim(),
        description: description.trim() || null,
        responsible_user_id: responsibleId ? Number(responsibleId) : null,
        start_date: startDate || null,
        due_date: dueDate || null,
        priority: priority || null,
        label_ids: labelIds,
        field_values: fieldVals,
      })
      onSaved()
      toast.success('Card salvo')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm('Excluir este card?')) return
    try { await kanbanApi.deleteCard(cardId); onSaved(); onClose() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
  }

  function toggleLabel(id: number) {
    setLabelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function addCheck() {
    const t = newCheck.trim(); if (!t) return
    try { await kanbanApi.addChecklist(cardId, t); setNewCheck(''); reload() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function toggleCheck(id: number, is_done: boolean) {
    try { await kanbanApi.updateChecklist(id, { is_done: !is_done }); reload() } catch { /* ignore */ }
  }
  async function delCheck(id: number) { try { await kanbanApi.deleteChecklist(id); reload() } catch { /* ignore */ } }

  async function addComment() {
    const b = newComment.trim(); if (!b) return
    try { await kanbanApi.addComment(cardId, b); setNewComment(''); reload() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function delComment(id: number) { try { await kanbanApi.deleteComment(id); reload() } catch { /* ignore */ } }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        await uploadAttachment({ entityType: 'KANBAN_CARD', entityId: cardId, category: 'attachment', file: f })
      }
      if (fileRef.current) fileRef.current.value = ''
      reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro no upload') }
    finally { setUploading(false) }
  }
  async function delAttachment(id: number) { try { await deleteAttachment(id); reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro') } }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>Card #{cardId}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={remove} title="Excluir card" style={iconBtn}><Trash2 size={16} /></button>
            <button onClick={onClose} title="Fechar" style={iconBtn}><X size={18} /></button>
          </div>
        </div>

        {!card ? <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div> : (
          <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input className="ds-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" style={{ width: '100%', fontSize: 16, fontWeight: 600, padding: '10px 12px' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Field label="Responsável">
                {/* Busca por texto; só usuários da empresa (customer) logada — vem escopado do BE. */}
                <SearchSelect fullWidth value={responsibleId} onChange={setResponsibleId} options={users} placeholder="—" />
              </Field>
              <Field label="Prioridade">
                <select className="ds-input" value={priority} onChange={e => setPriority(e.target.value)} style={sel}>
                  <option value="">—</option>
                  {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Início"><input type="date" className="ds-input" value={startDate} onChange={e => setStartDate(e.target.value)} style={sel} /></Field>
              <Field label="Vencimento"><input type="date" className="ds-input" value={dueDate} onChange={e => setDueDate(e.target.value)} style={sel} /></Field>
            </div>

            {boardLabels.length > 0 && (
              <Field label="Etiquetas">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {boardLabels.map(l => {
                    const on = labelIds.includes(l.id)
                    return (
                      <button key={l.id} onClick={() => toggleLabel(l.id)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${l.color ?? 'var(--border)'}`, background: on ? (l.color ?? 'var(--primary)') : 'transparent', color: on ? '#fff' : 'var(--text)' }}>
                        {l.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}

            <Field label="Descrição">
              <textarea className="ds-input" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Detalhes do card…" style={{ width: '100%', padding: 10, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            {/* Campos configuráveis do quadro (Fase 2) */}
            {fields.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {fields.map(f => (
                  <Field key={f.id} label={f.name + (f.required ? ' *' : '')}>
                    {renderFieldInput(f, fieldVals[f.id], (v) => setFieldVals(prev => ({ ...prev, [f.id]: v })), users)}
                  </Field>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={save} disabled={saving} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 18px' }}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
            </div>

            {/* Checklist */}
            <Section title={`Checklist${card.checklist.length ? ` (${card.checklist.filter(i => i.is_done).length}/${card.checklist.length})` : ''}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {card.checklist.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => toggleCheck(i.id, i.is_done)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i.is_done ? 'var(--success)' : 'var(--text-muted)', padding: 0, display: 'inline-flex' }}>
                      {i.is_done ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', textDecoration: i.is_done ? 'line-through' : 'none', opacity: i.is_done ? 0.6 : 1 }}>{i.text}</span>
                    <button onClick={() => delCheck(i.id)} style={iconBtnSm}><X size={13} /></button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="ds-input" value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCheck() }} placeholder="Novo item…" style={{ flex: 1, fontSize: 13, padding: '6px 10px' }} />
                <button onClick={addCheck} className="ds-btn-secondary" style={{ fontSize: 12, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={13} /></button>
              </div>
            </Section>

            {/* Anexos */}
            <Section title="Anexos">
              {card.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {card.attachments.map(a => (
                    <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', maxWidth: 240 }}>
                      <button onClick={() => downloadAttachment(a.id, { download: true })} title={`Baixar ${a.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, display: 'inline-flex' }}><Download size={12} /></button>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{a.name}</span>
                      <button onClick={() => delAttachment(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Paperclip size={13} /> {uploading ? 'Enviando…' : 'Anexar arquivo'}
              </button>
              <input ref={fileRef} type="file" multiple onChange={e => upload(e.target.files)} style={{ display: 'none' }} />
            </Section>

            {/* Comentários */}
            <Section title="Comentários">
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <textarea className="ds-input" value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} placeholder="Escreva um comentário…" style={{ flex: 1, padding: 8, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
                <button onClick={addComment} className="ds-btn-primary" style={{ fontSize: 12, padding: '0 12px', display: 'inline-flex', alignItems: 'center' }}><Send size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {card.comments.map(c => (
                  <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.user?.name ?? '—'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text-light)' }}>{fmtWhen(c.created_at)}</span>
                        <button onClick={() => delComment(c.id)} style={iconBtnSm}><X size={12} /></button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginTop: 3 }}>{c.body}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
function renderFieldInput(f: KField, value: string | string[] | undefined, onChange: (v: string | string[]) => void, users: KUserRef[]): React.ReactNode {
  const s = (value ?? '') as string
  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 8px' }
  switch (f.type) {
    case 'textarea':
      return <textarea className="ds-input" value={s} onChange={e => onChange(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
    case 'number':
      return <input type="number" className="ds-input" value={s} onChange={e => onChange(e.target.value)} style={inputStyle} />
    case 'money':
      return <input type="number" step="0.01" className="ds-input" value={s} onChange={e => onChange(e.target.value)} placeholder="R$" style={inputStyle} />
    case 'date':
      return <input type="date" className="ds-input" value={s} onChange={e => onChange(e.target.value)} style={inputStyle} />
    case 'datetime':
      return <input type="datetime-local" className="ds-input" value={s} onChange={e => onChange(e.target.value)} style={inputStyle} />
    case 'checkbox':
      return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)' }}><input type="checkbox" checked={s === '1'} onChange={e => onChange(e.target.checked ? '1' : '0')} /> Sim</label>
    case 'select':
      return (
        <select className="ds-input" value={s} onChange={e => onChange(e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : []
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {f.options.map(o => {
            const on = arr.includes(o)
            return <button key={o} type="button" onClick={() => onChange(on ? arr.filter(x => x !== o) : [...arr, o])} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid var(--border)', background: on ? 'var(--primary)' : 'transparent', color: on ? '#fff' : 'var(--text)' }}>{o}</button>
          })}
        </div>
      )
    }
    case 'link_user':
      return <SearchSelect fullWidth value={s} onChange={v => onChange(v)} options={users} placeholder="—" />
    default:
      return <input className="ds-input" value={s} onChange={e => onChange(e.target.value)} style={inputStyle} />
  }
}

function fmtWhen(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(+d)) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 640, maxHeight: '90vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex' }
const iconBtnSm: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'inline-flex' }
const sel: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 8px' }
