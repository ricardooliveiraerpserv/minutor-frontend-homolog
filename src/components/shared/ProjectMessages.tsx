'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/lib/api'
import type { ProjectMessage } from '@/types'
import { Send, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectUser {
  id: number
  name: string
}

interface Props {
  projectId: number
  projectUsers: ProjectUser[]
  currentUserId?: number
}

// Render message text, highlighting @[id:Name] tokens
function MessageText({ text }: { text: string }) {
  const parts = text.split(/(@\[\d+:[^\]]+\])/)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/@\[(\d+):([^\]]+)\]/)
        if (m) {
          return (
            <span key={i} style={{ color: '#00F5FF', fontWeight: 600 }}>
              @{m[2]}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return `Ontem ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function ProjectMessages({ projectId, projectUsers, currentUserId }: Props) {
  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [input, setInput]       = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get<any>(`/projects/${projectId}/messages`)
      .then(res => {
        const items: ProjectMessage[] = res.data ?? res.items ?? (Array.isArray(res) ? res : [])
        setMessages(items.reverse())
      })
      .catch(() => toast.error('Erro ao carregar mensagens'))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    load()
    // Mark read when opening
    api.post(`/projects/${projectId}/messages/mark-read`, {}).catch(() => {})
  }, [projectId, load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Detect @mention trigger
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

  const insertMention = (user: ProjectUser) => {
    const token = `@[${user.id}:${user.name}] `
    const before = input.slice(0, mentionStart)
    const after  = input.slice(textareaRef.current?.selectionStart ?? input.length)
    setInput(before + token + after)
    setMentionQuery(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const filteredUsers = mentionQuery !== null
    ? projectUsers.filter(u => u.name.toLowerCase().includes(mentionQuery))
    : []

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const msg = await api.post<ProjectMessage>(`/projects/${projectId}/messages`, { message: text })
      setMessages(prev => [...prev, msg])
      setInput('')
      setMentionQuery(null)
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
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
        {messages.map(msg => {
          const isMine = msg.user_id === currentUserId
          return (
            <div
              key={msg.id}
              className="flex gap-2.5 items-start rounded-lg px-3 py-2"
              style={msg.is_mentioned
                ? { background: 'rgba(0,245,255,0.04)', borderLeft: '2px solid #00F5FF' }
                : {}}
            >
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                style={{ background: isMine ? 'rgba(0,245,255,0.15)' : 'rgba(139,92,246,0.15)',
                         color: isMine ? '#00F5FF' : '#a78bfa' }}
              >
                {getInitials(msg.author?.name ?? '?')}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-semibold" style={{ color: '#FAFAFA' }}>
                    {msg.author?.name ?? 'Usuário'}
                  </span>
                  {msg.priority === 'high' && (
                    <AlertCircle size={11} style={{ color: '#f59e0b' }} />
                  )}
                  <span className="text-[10px]" style={{ color: 'var(--brand-muted)' }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed break-words" style={{ color: '#D4D4D8' }}>
                  <MessageText text={msg.message} />
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Mention autocomplete */}
      {filteredUsers.length > 0 && mentionQuery !== null && (
        <div
          className="mx-4 mb-1 rounded-lg border overflow-hidden"
          style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
        >
          {filteredUsers.slice(0, 6).map(u => (
            <button
              key={u.id}
              onMouseDown={e => { e.preventDefault(); insertMention(u) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              style={{ color: '#D4D4D8' }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF' }}
              >
                {getInitials(u.name)}
              </div>
              {u.name}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="px-4 pb-4 pt-2 border-t"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem... Use @ para mencionar"
            rows={2}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--brand-border)',
              color: '#FAFAFA',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0"
            style={input.trim()
              ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
              : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--brand-muted)' }}>
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  )
}
