'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, Edit3, MoreVertical, Trash2, Wrench, X } from 'lucide-react'
import type { InboxMessage } from '@/types/inbox'
import { MarkdownLite } from './MarkdownLite'
import { deleteMessage, editMessage } from '@/lib/inbox'

interface Props {
  message: InboxMessage
  isOwn: boolean
  compact?: boolean
}

const EDIT_WINDOW_MIN = 5

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export function ChatMessageItem({ message, isOwn, compact = false }: Props) {
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [busy, setBusy] = useState(false)

  const sender = message.sender
  const isBotMsg = ['bot', 'ai_insight', 'alert', 'system'].includes(message.type.value)
  const isDeleted = !!message.deleted_at
  const time = format(new Date(message.created_at), 'HH:mm', { locale: ptBR })

  const meta = (message.metadata ?? {}) as Record<string, unknown>
  const pending = meta.pending === true
  const toolsCalled = Array.isArray(meta.tools_called) ? (meta.tools_called as string[]) : []

  const minutesSinceCreated = Math.floor((Date.now() - new Date(message.created_at).getTime()) / 60000)
  const canEdit = isOwn && !isBotMsg && !isDeleted && minutesSinceCreated <= EDIT_WINDOW_MIN
  const canDelete = isOwn && !isBotMsg && !isDeleted
  const hasActions = canEdit || canDelete

  const refresh = () => qc.invalidateQueries({ queryKey: ['inbox-messages', message.conversation_id] })

  const saveEdit = async () => {
    const body = draft.trim()
    if (!body) {
      toast.error('Mensagem não pode ficar vazia')
      return
    }
    if (body === message.body) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await editMessage(message.id, body)
      await refresh()
      toast.success('Mensagem editada')
      setEditing(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Excluir esta mensagem? Esta ação não pode ser desfeita.')) return
    setBusy(true)
    try {
      await deleteMessage(message.id)
      await refresh()
      toast.success('Mensagem excluída')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      setMenuOpen(false)
    }
  }

  return (
    <div className={[
      'flex items-start gap-2.5 group',
      isOwn ? 'flex-row-reverse' : '',
      compact ? 'mt-0.5' : 'mt-3',
    ].join(' ')}>
      {compact ? (
        <div className="w-8 shrink-0 text-right pr-1 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[var(--text-light)] pt-1">
          {time}
        </div>
      ) : (
        <div className={[
          'w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-[11px] font-semibold ring-1',
          isBotMsg
            ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-700/20 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40'
            : isOwn
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
              : 'bg-[var(--surface-hover)] text-[var(--text-muted)] ring-[var(--brand-border)]',
        ].join(' ')}>
          {isBotMsg ? <Bot size={14} /> : (sender ? initials(sender.name) : '?')}
        </div>
      )}
      <div className={['max-w-[70%] flex flex-col relative', isOwn ? 'items-end' : 'items-start'].join(' ')}>
        {!compact && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {isBotMsg ? 'BOT Minutor' : sender?.name ?? 'Usuário'}
            </span>
            <span className="text-[10px] text-[var(--text-light)]">{time}</span>
            {message.edited_at && !isDeleted && (
              <span className="text-[10px] text-[var(--text-light)] italic">(editada)</span>
            )}
          </div>
        )}

        {editing ? (
          <div className="w-full">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              className="w-full bg-[var(--surface)] border border-emerald-500/40 rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
            />
            <div className="flex justify-end gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft(message.body) }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="text-[11px] text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-1 rounded disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <div className={[
            'rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm',
            isDeleted
              ? 'italic text-[var(--text-light)] bg-[var(--surface-hover)] border border-dashed border-[var(--brand-border)]'
              : isOwn
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-50 whitespace-pre-wrap'
                : isBotMsg
                  ? 'bg-[var(--surface)] border border-[var(--brand-border)] text-[var(--text)]'
                  : 'bg-[var(--surface)] border border-[var(--brand-border)] text-[var(--text)] whitespace-pre-wrap',
          ].join(' ')}>
            {isBotMsg && !isOwn && !isDeleted
              ? (pending
                  ? <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]"><Bot size={13} className="animate-pulse" /> {message.body}</span>
                  : <MarkdownLite source={message.body} />)
              : message.body}
          </div>
        )}

        {/* Menu de ações (visível no hover, só se tem ações disponíveis) */}
        {hasActions && !editing && !isDeleted && (
          <div className={[
            'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity',
            isOwn ? '-left-7' : '-right-7',
          ].join(' ')}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              title="Mais ações"
              className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <MoreVertical size={13}/>
            </button>
            {menuOpen && (
              <div
                className={[
                  'absolute z-10 mt-1 w-40 rounded-md shadow-lg border border-[var(--brand-border)] bg-[var(--surface)] py-1',
                  isOwn ? 'right-0' : 'left-0',
                ].join(' ')}
                onMouseLeave={() => setMenuOpen(false)}
              >
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-2"
                  >
                    <Edit3 size={12}/> Editar
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 size={12}/> Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {toolsCalled.length > 0 && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <Wrench size={9} className="text-[var(--text-light)]" />
            {[...new Set(toolsCalled)].map(t => (
              <span key={t} className="text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--text-light)]">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
