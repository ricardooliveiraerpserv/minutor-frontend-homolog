'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/lib/api'
import { Send, Paperclip, X, Download, FileText, Eye, Lock } from 'lucide-react'
import { toast } from 'sonner'

interface MentionUser { id: number; name: string }

interface Attachment {
  id: number
  original_name: string
  file_size: number
  mime_type?: string
}

interface ContractMessage {
  id: number
  message: string
  visibility?: 'internal' | 'client'
  is_mentioned?: boolean
  created_at: string
  author?: { id: number; name: string }
  attachments?: Attachment[]
}

interface Props {
  contractId: number
  userRole?: string
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(@\[\d+:[^\]]+\])/)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/@\[(\d+):([^\]]+)\]/)
        if (m) return <span key={i} style={{ color: '#eab308', fontWeight: 600 }}>@{m[2]}</span>
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

function AttachmentChip({ att, messageId }: { att: Attachment; messageId: number }) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem('minutor_token') ?? ''
      const res = await fetch(`${baseUrl}/contract-messages/${messageId}/attachments/${att.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = att.original_name; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao baixar arquivo') }
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80 max-w-[220px]"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}
    >
      {att.mime_type?.startsWith('image/') ? (
        <Eye size={11} style={{ color: '#eab308' }} />
      ) : (
        <FileText size={11} style={{ color: '#eab308' }} />
      )}
      <span className="truncate flex-1 text-left" style={{ color: '#D4D4D8' }}>{att.original_name}</span>
      <span className="shrink-0" style={{ color: 'var(--brand-subtle)' }}>{formatBytes(att.file_size)}</span>
      <Download size={10} className="shrink-0" style={{ color: 'var(--brand-subtle)' }} />
    </button>
  )
}

export function ContractMessages({ contractId, userRole }: Props) {
  const isCliente = userRole === 'cliente'

  const [messages, setMessages]         = useState<ContractMessage[]>([])
  const [loading, setLoading]           = useState(true)
  const [sending, setSending]           = useState(false)
  const [input, setInput]               = useState('')
  const [visibility, setVisibility]     = useState<'internal' | 'client'>('internal')
  const [files, setFiles]               = useState<File[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isCliente) {
      api.get<MentionUser[]>(`/contracts/${contractId}/mentionable-users`)
        .then(r => setMentionUsers(Array.isArray(r) ? r : []))
        .catch(() => {})
    }
  }, [contractId, isCliente])

  const load = useCallback(() => {
    setLoading(true)
    api.get<any>(`/contracts/${contractId}/messages`)
      .then(res => {
        const items: ContractMessage[] = res.data ?? (Array.isArray(res) ? res : [])
        setMessages([...items].reverse())
      })
      .catch(() => toast.error('Erro ao carregar mensagens'))
      .finally(() => setLoading(false))
  }, [contractId])

  useEffect(() => { load() }, [load])

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

  const filteredMentions = mentionQuery !== null
    ? mentionUsers.filter(u => u.name.toLowerCase().includes(mentionQuery))
    : []

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    setFiles(prev => {
      const combined = [...prev, ...selected]
      if (combined.length > 10) { toast.error('Máximo de 10 arquivos por mensagem'); return prev }
      return combined
    })
    e.target.value = ''
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text && files.length === 0) return
    if (sending) return
    setSending(true)
    try {
      const authToken = localStorage.getItem('minutor_token') ?? ''
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
      const fd = new FormData()
      if (text) fd.append('message', text)
      fd.append('visibility', isCliente ? 'client' : visibility)
      files.forEach(f => fd.append('files[]', f))
      const res = await fetch(`${baseUrl}/contracts/${contractId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: fd,
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.message ?? 'Erro') }
      const msg: ContractMessage = await res.json()
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

  return (
    <div className="flex flex-col h-full min-h-[380px]">
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
          <div key={msg.id} className="flex gap-2.5 items-start rounded-lg px-3 py-2"
            style={msg.is_mentioned ? { background: 'rgba(234,179,8,0.04)', borderLeft: '2px solid #eab308' } : {}}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
              style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
              {getInitials(msg.author?.name ?? '?')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: '#FAFAFA' }}>{msg.author?.name ?? 'Usuário'}</span>
                <span className="text-[10px]" style={{ color: 'var(--brand-muted)' }}>{formatTime(msg.created_at)}</span>
                {!isCliente && msg.visibility === 'client' && (
                  <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>visível ao cliente</span>
                )}
                {!isCliente && msg.visibility === 'internal' && (
                  <span className="text-[9px] px-1 py-0.5 rounded font-semibold flex items-center gap-0.5" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-subtle)' }}>
                    <Lock size={8} /> interno
                  </span>
                )}
              </div>
              {msg.message && (
                <p className="text-sm leading-relaxed break-words" style={{ color: '#D4D4D8' }}>
                  <MessageText text={msg.message} />
                </p>
              )}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {msg.attachments.map(att => <AttachmentChip key={att.id} att={att} messageId={msg.id} />)}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Mention autocomplete */}
      {filteredMentions.length > 0 && mentionQuery !== null && (
        <div className="mx-4 mb-1 rounded-lg border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
          {filteredMentions.slice(0, 6).map(u => (
            <button key={u.id} onMouseDown={e => { e.preventDefault(); insertMention(u) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              style={{ color: '#D4D4D8' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
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
            <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}>
              <FileText size={11} style={{ color: '#eab308' }} />
              <span className="max-w-[120px] truncate" style={{ color: '#D4D4D8' }}>{f.name}</span>
              <button onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))} className="hover:opacity-70 shrink-0" style={{ color: 'var(--brand-subtle)' }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
        {!isCliente && (
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setVisibility('internal')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
              style={visibility === 'internal'
                ? { background: 'rgba(255,255,255,0.08)', color: '#FAFAFA', border: '1px solid var(--brand-border)' }
                : { background: 'transparent', color: 'var(--brand-subtle)', border: '1px solid transparent' }}>
              <Lock size={10} /> Interno
            </button>
            <button onClick={() => setVisibility('client')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
              style={visibility === 'client'
                ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
                : { background: 'transparent', color: 'var(--brand-subtle)', border: '1px solid transparent' }}>
              <Eye size={10} /> Visível ao cliente
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0"
            title="Adicionar anexos"
            style={{ background: files.length > 0 ? 'rgba(234,179,8,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: files.length > 0 ? '#eab308' : 'var(--brand-subtle)' }}>
            <Paperclip size={15} />
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
          <textarea ref={textareaRef} value={input} onChange={handleInput}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={isCliente ? 'Escreva uma mensagem...' : 'Escreva uma mensagem... Use @ para mencionar'}
            rows={2}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: '#FAFAFA' }}
          />
          <button onClick={handleSend} disabled={(!input.trim() && files.length === 0) || sending}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0"
            style={(input.trim() || files.length > 0)
              ? { background: '#eab308', color: '#000' }
              : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>
            <Send size={15} />
          </button>
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--brand-muted)' }}>
          Enter para enviar · Shift+Enter para nova linha · Máx. 10 arquivos (20 MB cada)
        </p>
      </div>
    </div>
  )
}
