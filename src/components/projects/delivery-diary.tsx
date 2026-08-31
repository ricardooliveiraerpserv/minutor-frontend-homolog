'use client'

import { useEffect, useRef, useState } from 'react'
import { Paperclip, Trash2, Send, Download, FileText, X } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { uploadAttachment, downloadAttachment } from '@/lib/attachments'

type DiaryAttachment = { id: number; name: string; mime?: string | null }
type DiaryEntry = {
  id: number
  body: string | null
  created_at: string | null
  user: { id: number; name: string } | null
  attachments: DiaryAttachment[]
}

/** Diário da Atividade — comentários + anexos por entrega. Interno (cliente não acessa). */
export function DeliveryDiary({ deliveryId }: { deliveryId: number }) {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [posting, setPosting] = useState(false)
  const [dl, setDl] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    api.get<{ items: DiaryEntry[] }>(`/deliveries/${deliveryId}/diary`)
      .then(r => setEntries(r.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [deliveryId])

  async function publish() {
    const text = body.trim()
    if (!text && files.length === 0) { toast.error('Escreva uma nota ou anexe um arquivo.'); return }
    setPosting(true)
    try {
      const entry = await api.post<DiaryEntry>(`/deliveries/${deliveryId}/diary`, { body: text })
      for (const f of files) {
        await uploadAttachment({ entityType: 'DELIVERY_DIARY_ENTRY', entityId: entry.id, category: 'attachment', file: f })
      }
      setBody(''); setFiles([]); if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : 'Erro ao publicar'))
    } finally {
      setPosting(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Excluir esta nota do diário?')) return
    try { await api.delete(`/delivery-diary/${id}`); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
  }

  async function grab(a: DiaryAttachment) {
    setDl(a.id)
    try { await downloadAttachment(a.id, { download: true }) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha no download') }
    finally { setDl(null) }
  }

  function pickFiles(list: FileList | null) {
    if (!list) return
    setFiles(prev => [...prev, ...Array.from(list)])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Composer */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Escreva uma nota do diário…"
          rows={3}
          className="ds-input"
          style={{ width: '100%', padding: 10, resize: 'vertical', fontFamily: 'inherit' }}
        />
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {files.map((f, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 8px', maxWidth: 220 }}>
                <FileText size={11} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} aria-label="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'inline-flex' }}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            <Paperclip size={13} /> Anexar
          </button>
          <input ref={fileRef} type="file" multiple onChange={e => pickFiles(e.target.files)} style={{ display: 'none' }} />
          <button type="button" onClick={publish} disabled={posting} className="ds-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '7px 14px', opacity: posting ? 0.6 : 1 }}>
            <Send size={13} /> {posting ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : entries.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Nenhuma nota no diário ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(e => (
            <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{e.user?.name ?? '—'}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-light)' }}>{fmtWhen(e.created_at)}</span>
                </div>
                <button type="button" onClick={() => remove(e.id)} aria-label="Excluir" title="Excluir nota" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}><Trash2 size={13} /></button>
              </div>
              {e.body && <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.body}</div>}
              {e.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: e.body ? 8 : 0 }}>
                  {e.attachments.map(a => (
                    <button key={a.id} type="button" onClick={() => grab(a)} disabled={dl === a.id} title={`Baixar ${a.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', maxWidth: 240, color: 'var(--text)' }}>
                      <Download size={12} style={{ flexShrink: 0, color: 'var(--primary)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtWhen(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(+d)) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
