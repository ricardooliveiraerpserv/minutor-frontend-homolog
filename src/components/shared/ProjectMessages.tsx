'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type { ProjectMessage } from '@/types'
import { Send, Paperclip, X, Download, FileText, Eye, EyeOff, Lock, Users, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'

// Janela (horas) para editar a própria última interação — espelha ProjectMessage::EDIT_WINDOW_HOURS no backend.
const EDIT_WINDOW_HOURS = 3

interface MentionUser { id: number; name: string }

interface Attachment {
  id: number
  original_name: string
  file_path: string
  file_size: number
  mime_type?: string
}

interface MessageWithAttachments extends ProjectMessage {
  attachments?: Attachment[]
  visibility?: string
}

interface Props {
  projectId: number
  userRole?: string // 'admin' | 'coordenador' | 'consultor' | 'cliente'
  readOnly?: boolean // esconde composer — usado pra histórico do cliente após virar projeto
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(@\[(?:\d+|all):[^\]]+\])/)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/@\[(?:\d+|all):([^\]]+)\]/)
        if (m) return <span key={i} style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>@{m[1]}</span>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return `Ontem ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function isImage(mime?: string) {
  return mime?.startsWith('image/') ?? false
}

function AttachmentChip({ att, messageId }: { att: Attachment; messageId: number }) {
  const downloadUrl = `/api/v1/messages/${messageId}/attachments/${att.id}/download`

  const handleDownload = async () => {
    try {
      const res = await fetch(downloadUrl, { credentials: 'same-origin' })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.original_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao baixar arquivo')
    }
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80 max-w-[220px]"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}
    >
      {isImage(att.mime_type) ? (
        <Eye size={11} style={{ color: 'var(--brand-primary)' }} />
      ) : (
        <FileText size={11} style={{ color: 'var(--brand-primary)' }} />
      )}
      <span className="truncate flex-1 text-left" style={{ color: 'var(--brand-text)' }}>{att.original_name}</span>
      <span className="shrink-0" style={{ color: 'var(--brand-subtle)' }}>{formatBytes(att.file_size)}</span>
      <Download size={10} className="shrink-0" style={{ color: 'var(--brand-subtle)' }} />
    </button>
  )
}

export function ProjectMessages({ projectId, userRole, readOnly }: Props) {
  const { user: currentUser } = useAuth()
  const isCliente = userRole === 'cliente'
  const isAdmin   = userRole === 'admin'

  const [messages, setMessages]           = useState<MessageWithAttachments[]>([])
  const [loading, setLoading]             = useState(true)
  const [sending, setSending]             = useState(false)
  const [input, setInput]                 = useState('')
  const [visibility, setVisibility]       = useState<'internal' | 'client'>('internal')
  const [files, setFiles]                 = useState<File[]>([])
  const [mentionQuery, setMentionQuery]   = useState<string | null>(null)
  const [mentionStart, setMentionStart]   = useState(0)
  const [mentionUsers, setMentionUsers]   = useState<MentionUser[]>([])
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editText, setEditText]           = useState('')
  const [savingEdit, setSavingEdit]       = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const lastIdRef   = useRef<number>(0)

  useEffect(() => {
    api.get<MentionUser[]>(`/messages/mentionable-users?project_id=${projectId}`)
      .then(r => setMentionUsers(Array.isArray(r) ? r : []))
      .catch(() => {})
  }, [projectId])

  const load = useCallback(() => {
    setLoading(true)
    api.get<any>(`/projects/${projectId}/messages`)
      .then(res => {
        const items: MessageWithAttachments[] = res.data ?? (Array.isArray(res) ? res : [])
        lastIdRef.current = items.reduce((max, m) => Math.max(max, m.id), 0)
        setMessages([...items].reverse())
      })
      .catch(() => toast.error('Erro ao carregar mensagens'))
      .finally(() => setLoading(false))
  }, [projectId])

  const silentLoad = useCallback(() => {
    api.get<any>(`/projects/${projectId}/messages`)
      .then(res => {
        const items: MessageWithAttachments[] = res.data ?? (Array.isArray(res) ? res : [])
        const maxId = items.reduce((max, m) => Math.max(max, m.id), 0)
        if (maxId > lastIdRef.current) {
          lastIdRef.current = maxId
          setMessages([...items].reverse())
          api.post(`/projects/${projectId}/messages/mark-read`, {}).catch(() => {})
        }
      })
      .catch(() => {})
  }, [projectId])

  useEffect(() => {
    load()
    api.post(`/projects/${projectId}/messages/mark-read`, {}).catch(() => {})
  }, [projectId, load])

  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) silentLoad() }, 3000)
    return () => clearInterval(interval)
  }, [silentLoad])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const pos = e.target.selectionStart ?? val.length
    setInput(val)
    const before = val.slice(0, pos)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1].toLowerCase())
      setMentionStart(pos - match[0].length)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (user: MentionUser) => {
    const token = `@[${user.id}:${user.name}] `
    const pos = textareaRef.current?.selectionStart ?? input.length
    const before = input.slice(0, mentionStart)
    const after  = input.slice(pos)
    setInput(before + token + after)
    setMentionQuery(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // Menção "Todos" → token @[all:Todos]; backend expande pra todos os
  // participantes internos do projeto (cliente nunca participa).
  const insertAllMention = () => {
    const token = `@[all:Todos] `
    const pos = textareaRef.current?.selectionStart ?? input.length
    const before = input.slice(0, mentionStart)
    const after  = input.slice(pos)
    setInput(before + token + after)
    setMentionQuery(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const filteredMentions = mentionQuery !== null
    ? mentionUsers.filter(u => u.id !== currentUser?.id && u.name.toLowerCase().includes(mentionQuery))
    : []

  // Mostra a opção "Todos" enquanto o que foi digitado após @ for prefixo de "todos".
  const showAllMention = mentionQuery !== null && 'todos'.includes(mentionQuery)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    setFiles(prev => {
      const combined = [...prev, ...selected]
      if (combined.length > 10) {
        toast.error('Máximo de 10 arquivos por mensagem')
        return prev
      }
      return combined
    })
    e.target.value = ''
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text && files.length === 0) return
    if (sending) return
    setSending(true)

    try {
      const fd = new FormData()
      if (text) fd.append('message', text)
      // Chat de projeto é sempre interno — backend ignora e força 'internal'.
      files.forEach(f => fd.append('files[]', f))

      const res = await fetch(`/api/v1/projects/${projectId}/messages`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message ?? 'Erro ao enviar')
      }

      const msg: MessageWithAttachments = await res.json()
      setMessages(prev => [...prev, msg])
      setInput('')
      setFiles([])
      setMentionQuery(null)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Editar: só a ÚLTIMA interação do próprio usuário e dentro da janela de 3h.
  const lastOwnMsgId = messages.reduce(
    (acc, m) => (m.user_id === currentUser?.id && m.id > acc ? m.id : acc), 0
  )
  const canEdit = (msg: MessageWithAttachments) => {
    if (readOnly || isCliente || !currentUser) return false
    if (msg.user_id !== currentUser.id || msg.id !== lastOwnMsgId) return false
    const ageMs = Date.now() - new Date(msg.created_at).getTime()
    return ageMs <= EDIT_WINDOW_HOURS * 3600_000
  }

  const startEdit = (msg: MessageWithAttachments) => {
    setEditingId(msg.id)
    setEditText(msg.message ?? '')
  }
  const cancelEdit = () => { setEditingId(null); setEditText('') }

  const handleSaveEdit = async (msg: MessageWithAttachments) => {
    const text = editText.trim()
    if (!text) { toast.error('A interação não pode ficar vazia.'); return }
    if (savingEdit) return
    setSavingEdit(true)
    try {
      const updated = await api.patch<MessageWithAttachments>(
        `/projects/${projectId}/messages/${msg.id}`, { message: text }
      )
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...updated } : m))
      cancelEdit()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao editar interação')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Carregando...</span>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Nenhuma mensagem ainda.</span>
            <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>Seja o primeiro a escrever.</span>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className="flex gap-2.5 items-start rounded-lg px-3 py-2"
            style={msg.is_mentioned
              ? { background: 'rgba(0,245,255,0.04)', borderLeft: '2px solid var(--primary)' }
              : {}}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
              style={{ background: 'rgba(0,245,255,0.15)', color: 'var(--brand-primary)' }}
            >
              {getInitials(msg.author?.name ?? '?')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>
                  {msg.author?.name ?? 'Usuário'}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--brand-muted)' }}>
                  {formatTime(msg.created_at)}
                </span>
                {msg.edited_at && (
                  <span className="text-[10px] italic" style={{ color: 'var(--brand-subtle)' }} title={`Editado ${formatTime(msg.edited_at)}`}>
                    (editado)
                  </span>
                )}
                {!isCliente && msg.visibility === 'client' && (
                  <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    visível ao cliente
                  </span>
                )}
                {!isCliente && msg.visibility === 'internal' && (
                  <span className="text-[9px] px-1 py-0.5 rounded font-semibold flex items-center gap-0.5" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-subtle)' }}>
                    <Lock size={8} /> interno
                  </span>
                )}
                {canEdit(msg) && editingId !== msg.id && (
                  <button
                    onClick={() => startEdit(msg)}
                    className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                    title={`Editar (até ${EDIT_WINDOW_HOURS}h após o envio)`}
                    style={{ color: 'var(--brand-subtle)' }}
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {editingId === msg.id ? (
                <div className="mt-1">
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg) }
                      if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                    }}
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => handleSaveEdit(msg)}
                      disabled={savingEdit || !editText.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={editText.trim() ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' } : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}
                    >
                      <Check size={11} /> Salvar
                    </button>
                    <button onClick={cancelEdit} className="px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-white/5" style={{ color: 'var(--brand-subtle)' }}>
                      Cancelar
                    </button>
                    <span className="text-[10px]" style={{ color: 'var(--brand-muted)' }}>Enter salva · Esc cancela</span>
                  </div>
                </div>
              ) : msg.message && (
                <p className="text-sm leading-relaxed break-words" style={{ color: 'var(--brand-text)' }}>
                  <MessageText text={msg.message} />
                </p>
              )}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {msg.attachments.map(att => (
                    <AttachmentChip key={att.id} att={att} messageId={msg.id} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Mention autocomplete */}
      {(filteredMentions.length > 0 || showAllMention) && mentionQuery !== null && (
        <div className="mx-4 mb-1 rounded-lg border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
          {showAllMention && (
            <button
              onMouseDown={e => { e.preventDefault(); insertAllMention() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              style={{ color: 'var(--brand-text)', borderBottom: filteredMentions.length > 0 ? '1px solid var(--brand-border)' : undefined }}
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.15)', color: 'var(--brand-primary)' }}>
                <Users size={11} />
              </div>
              <span className="font-semibold">Todos</span>
              <span className="text-[10px] ml-auto" style={{ color: 'var(--brand-subtle)' }}>menciona os participantes</span>
            </button>
          )}
          {filteredMentions.slice(0, 6).map(u => (
            <button
              key={u.id}
              onMouseDown={e => { e.preventDefault(); insertMention(u) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              style={{ color: 'var(--brand-text)' }}
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'rgba(0,245,255,0.15)', color: 'var(--brand-primary)' }}>
                {getInitials(u.name)}
              </div>
              {u.name}
            </button>
          ))}
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-1.5">
          {files.map((f, idx) => (
            <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)' }}>
              <FileText size={11} style={{ color: 'var(--brand-primary)' }} />
              <span className="max-w-[120px] truncate" style={{ color: 'var(--brand-text)' }}>{f.name}</span>
              <button onClick={() => removeFile(idx)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--brand-subtle)' }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area — cliente em modo histórico não vê composer */}
      {readOnly ? (
        <div className="px-4 py-3 border-t text-center text-[11px]" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
          Você está visualizando o histórico de mensagens. O envio foi encerrado.
        </div>
      ) : (
      <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
        {/* Chat de projeto é sempre interno — toggle "Visível ao cliente" removido. */}

        <div className="flex gap-2 items-end">
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0"
            title="Adicionar anexos"
            style={{ background: files.length > 0 ? 'rgba(0,245,255,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: files.length > 0 ? 'var(--text)' : 'var(--text-muted)' }}
          >
            <Paperclip size={15} />
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isCliente ? 'Escreva uma mensagem...' : 'Escreva uma mensagem... Use @ para mencionar'}
            rows={2}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && files.length === 0) || sending}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0"
            style={(input.trim() || files.length > 0)
              ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' }
              : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--brand-muted)' }}>
          Enter para enviar · Shift+Enter para nova linha · Máx. 10 arquivos por mensagem (20 MB cada)
        </p>
      </div>
      )}
    </div>
  )
}
