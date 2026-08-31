'use client'

import { useEffect, useRef, useState } from 'react'
import { api, apiMessage } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { MessageSquare, Paperclip, Send, X, Download } from 'lucide-react'

/**
 * Comentários GLOBAIS do projeto — UI igual PROD (ReqChatPanel), ligada ao MESMO
 * canal/tabela de prod: contract_request_messages por project_id (visibility='client')
 * via /projects/{id}/comments (+ /mentionable-users). Cliente e equipe no mesmo fio.
 */
interface Attach { id: number; original_name: string | null; storage_path: string | null }
interface Msg { id: number; message: string | null; user_id?: number; author?: { id: number; name: string } | null; created_at: string | null; attachments?: Attach[] }
interface MentionUser { id: number; name: string; role?: string }

const initials = (name?: string | null) => (name ?? '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const renderText = (t: string | null) => (t ?? '').replace(/@\[\d+:([^\]]+)\]/g, '@$1')

export function ProjectConversation({ projectId }: { projectId: number; mode?: 'client' | 'team' }) {
  const { user: currentUser } = useAuth()
  const myId = (currentUser as { id?: number } | null)?.id
  const isClient = (currentUser as { type?: string } | null)?.type === 'cliente'
  const base = `/projects/${projectId}/comments`

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionStart, setMentionStart] = useState(-1)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<Msg[]>(base)
      .then(r => { setMsgs(Array.isArray(r) ? r : []); setLoaded(true) })
      .catch(() => setLoaded(true))
    api.get<MentionUser[]>(`${base}/mentionable-users`)
      .then(r => setMentionUsers(Array.isArray(r) ? r : []))
      .catch(() => {})
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const handleInputChange = (val: string) => {
    setInput(val)
    const cursor = textareaRef.current?.selectionStart ?? val.length
    const match = val.slice(0, cursor).match(/@(\w*)$/)
    if (match) { setMentionStart(cursor - match[0].length); setMentionQuery(match[1].toLowerCase()); setShowMentions(true) }
    else setShowMentions(false)
  }

  const insertMention = (u: MentionUser) => {
    const before = input.slice(0, mentionStart)
    const after = input.slice(textareaRef.current?.selectionStart ?? input.length)
    setInput(`${before}@[${u.id}:${u.name}] ${after}`)
    setShowMentions(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const filteredMentions = mentionUsers.filter(u => u.id !== myId && u.name.toLowerCase().includes(mentionQuery))

  const handleSend = async () => {
    const text = input.trim()
    if ((!text && files.length === 0) || sending) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('message', text)
      files.forEach(f => fd.append('files[]', f))
      const msg = await api.post<Msg>(base, fd)
      setMsgs(prev => [...prev, msg])
      setInput(''); setFiles([])
    } catch (e) { toast.error(apiMessage(e, 'Erro ao enviar mensagem')) }
    finally { setSending(false) }
  }

  return (
    <div className="flex flex-col min-h-0" style={{ height: '100%' }}>
      {/* Legenda em destaque — o CLIENTE participa (aviso só p/ equipe interna) */}
      {!isClient && (
        <div className="shrink-0" style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
          O CLIENTE participa desta conversa — tudo que você escrever aqui é visível ao cliente.
        </div>
      )}
      {/* Feed */}
      <div className="overflow-y-auto px-1 py-2 space-y-3" style={{ flex: 1, minHeight: 240, maxHeight: 460 }}>
        {!loaded && <p className="text-center text-xs py-8" style={{ color: 'var(--text-light)' }}>Carregando…</p>}
        {loaded && msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-1">
            <MessageSquare size={24} style={{ color: 'var(--text-light)', opacity: 0.4 }} />
            <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum comentário ainda</p>
          </div>
        )}
        {msgs.map(msg => (
          <div key={msg.id} className="flex gap-2.5 items-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
              {initials(msg.author?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{msg.author?.name ?? 'Usuário'}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {msg.created_at ? new Date(msg.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              {msg.message && <p className="text-sm leading-relaxed break-words" style={{ color: 'var(--text)' }}>{renderText(msg.message)}</p>}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {msg.attachments.map(att => (
                    <a key={att.id} href={att.storage_path ? `/storage/${att.storage_path}` : '#'} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]"
                      style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.06)', color: '#a78bfa' }}>
                      <Paperclip size={10} /><span className="max-w-[150px] truncate">{att.original_name ?? 'anexo'}</span><Download size={10} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="pt-2 border-t shrink-0" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                {f.name}
                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-64 max-h-60 overflow-y-auto rounded-lg shadow-lg z-10"
              style={{ background: 'var(--bg)', border: '1px solid rgba(139,92,246,0.3)' }}>
              {filteredMentions.map(u => {
                const isCli = u.role === 'cliente'
                const accent = isCli ? 'var(--success)' : '#a78bfa'
                return (
                  <button key={u.id} onClick={() => insertMention(u)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:opacity-80 transition-opacity"
                    style={{ color: isCli ? 'var(--success)' : 'var(--text)' }}>
                    <span className="truncate"><span style={{ color: accent }} className="font-semibold">@</span>{u.name}</span>
                    {u.role && <span className="text-[10px] uppercase tracking-wider opacity-70 shrink-0" style={{ color: accent }}>{u.role}</span>}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setShowMentions(false); return }
                // Enter = quebra de linha; envio só por ⌘/Ctrl+Enter (ou botão).
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !showMentions) { e.preventDefault(); handleSend() }
              }}
              placeholder="Escreva um comentário... Use @ para mencionar"
              rows={2}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface-hover)', border: '1px solid rgba(139,92,246,0.25)', color: 'var(--text)' }}
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-all"
                style={{ background: 'var(--surface-hover)', border: '1px solid rgba(139,92,246,0.2)', color: 'var(--text-light)' }}
                title="Anexar arquivo"><Paperclip size={14} /></button>
              <button onClick={handleSend} disabled={(!input.trim() && files.length === 0) || sending}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-all disabled:opacity-40"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)' }}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={e => { const picked = Array.from(e.target.files ?? []); setFiles(prev => [...prev, ...picked].slice(0, 10)); e.target.value = '' }} />
      </div>
    </div>
  )
}
