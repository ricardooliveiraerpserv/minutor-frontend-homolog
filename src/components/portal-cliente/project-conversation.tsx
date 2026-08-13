'use client'

import { useEffect, useRef, useState } from 'react'
import { api, apiMessage } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { toast } from 'sonner'
import { Send, Paperclip } from 'lucide-react'

/**
 * Conversa GLOBAL do projeto (um fio único cliente ↔ equipe).
 * mode='client' → /client/projects/{id}/comments (portal do cliente).
 * mode='team'   → /projects/{id}/client-comments (cronograma interno).
 * Sem horas/valores.
 */
interface Msg {
  id: number
  body: string | null
  from_client: boolean
  author_name: string | null
  attachment_path: string | null
  attachment_original_name: string | null
  created_at: string | null
}

const fmtDateTime = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

export function ProjectConversation({ projectId, mode }: { projectId: number; mode: 'client' | 'team' }) {
  const base = mode === 'client' ? `/client/projects/${projectId}/comments` : `/projects/${projectId}/client-comments`
  const [items, setItems] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  async function load(scroll = false) {
    try {
      const r = await api.get<{ items: Msg[] }>(base)
      setItems(r?.items ?? [])
      if (scroll) setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    } catch { /* silencioso */ } finally { setLoading(false) }
  }

  useEffect(() => { setLoading(true); load(true) }, [projectId, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useAsyncAction(async () => {
    if (!text.trim() && !file) { toast.error('Escreva uma mensagem ou anexe um arquivo.'); return }
    const form = new FormData()
    if (text.trim()) form.append('text', text.trim())
    if (file) form.append('attachment', file)
    await api.post(base, form)
    setText(''); setFile(null)
    load(true)
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao enviar')) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', display: 'flex', flexDirection: 'column', maxHeight: 460, overflowY: 'auto', padding: 14, gap: 10 }}>
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando conversa…</div>}
        {!loading && items.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhuma mensagem ainda. {mode === 'client' ? 'Fale com a equipe do projeto.' : 'Inicie a conversa com o cliente.'}
          </div>
        )}
        {items.map(m => {
          const mine = mode === 'client' ? m.from_client : !m.from_client
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '82%', background: mine ? 'var(--primary-soft)' : 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 11px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{m.author_name ?? (m.from_client ? 'Cliente' : 'Equipe')}{m.from_client ? '' : ' · equipe'}</span>
                  <span>{fmtDateTime(m.created_at)}</span>
                </div>
                {m.body && <div style={{ fontSize: 13.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>}
                {m.attachment_path && (
                  <a href={`/storage/${m.attachment_path}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--primary)' }}>
                    <Paperclip size={11} /> {m.attachment_original_name ?? 'anexo'}
                  </a>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="ds-card" style={{ padding: 12 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className="ds-input"
          placeholder="Escreva uma mensagem para o projeto…" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: 8, fontSize: 13 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
            <Paperclip size={12} /> {file ? file.name : 'Anexar arquivo'}
            <input type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && <button onClick={() => setFile(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>remover</button>}
          <button type="button" className="ds-btn-primary" onClick={() => send.run()} disabled={send.pending}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Send size={12} /> {send.pending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
