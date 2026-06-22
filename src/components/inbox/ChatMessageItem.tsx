'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, Check, CheckCheck, CornerUpLeft, Download, Edit3, FileText, Forward, MoreVertical, Pin, PinOff, Reply, Smile, Star, Trash2, Wrench } from 'lucide-react'
import type { InboxMessage, MessageAttachment } from '@/types/inbox'
import { MarkdownLite } from './MarkdownLite'
import { deleteMessage, editMessage, togglePin, toggleFavorite, toggleReaction } from '@/lib/inbox'
import { ImageLightbox } from './ImageLightbox'
import { ForwardMessageModal } from './ForwardMessageModal'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😢', '🚀']

interface Props {
  message: InboxMessage
  isOwn: boolean
  compact?: boolean
  onReply?: (m: InboxMessage) => void
  readers?: { id: number; name: string; at: string }[]
}

const EDIT_WINDOW_MIN = 5

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export function ChatMessageItem({ message, isOwn, compact = false, onReply, readers = [] }: Props) {
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState<MessageAttachment | null>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const attachments = message.attachments ?? []
  const reactions = message.reactions ?? []
  const hasOnlyAttachments = attachments.length > 0 && (!message.body || message.body.trim() === '')

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
  const canReply = !!onReply && !isDeleted
  const canReact = !isDeleted
  const canPin = !isDeleted
  const canFavorite = !isDeleted
  const canForward = !isDeleted && !isBotMsg
  const isPinned = !!message.pinned_at
  const isFavorite = !!message.is_favorite
  const hasActions = canEdit || canDelete || canReply || canReact || canPin || canFavorite || canForward
  const forwardedFromUser = (meta.forwarded_from_user as string | undefined)

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

  const handleReact = async (emoji: string) => {
    setEmojiPickerOpen(false)
    setMenuOpen(false)
    try {
      await toggleReaction(message.id, emoji)
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handlePin = async () => {
    setMenuOpen(false)
    try {
      const r = await togglePin(message.id)
      await refresh()
      await qc.invalidateQueries({ queryKey: ['inbox-pinned', message.conversation_id] })
      toast.success(r.action === 'pinned' ? 'Mensagem fixada' : 'Mensagem desafixada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleFavorite = async () => {
    setMenuOpen(false)
    try {
      const r = await toggleFavorite(message.id)
      await refresh()
      toast.success(r.is_favorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos')
    } catch (e) {
      toast.error((e as Error).message)
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
            {isPinned && <Pin size={10} className="text-amber-500" />}
            {isFavorite && <Star size={10} className="fill-amber-400 text-amber-400" />}
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
          <>
            {forwardedFromUser && !isDeleted && (
              <p className="text-[10px] italic text-[var(--text-light)] mb-0.5 inline-flex items-center gap-1">
                <Forward size={10}/> Encaminhada de {forwardedFromUser}
              </p>
            )}
            {message.reply_to && !isDeleted && (
              <div className="flex items-start gap-1.5 mb-1 px-2.5 py-1 rounded-md bg-[var(--surface-hover)] border-l-2 border-emerald-500/40 max-w-full">
                <CornerUpLeft size={10} className="mt-0.5 text-[var(--text-light)] shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {message.reply_to.sender?.name ?? 'Mensagem'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{message.reply_to.body}</p>
                </div>
              </div>
            )}
            {(!hasOnlyAttachments || isDeleted) && (
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
            {attachments.length > 0 && !isDeleted && (
              <div className={['mt-1 flex flex-col gap-1.5', isOwn ? 'items-end' : 'items-start'].join(' ')}>
                {attachments.map(a => (
                  a.is_image ? (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setLightbox(a)}
                      title={a.filename}
                      className="block rounded-md overflow-hidden border border-[var(--brand-border)] hover:border-emerald-500/50 transition-colors"
                    >
                      <img
                        src={a.url}
                        alt={a.filename}
                        className="max-w-[280px] max-h-[200px] object-cover"
                      />
                    </button>
                  ) : (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={a.filename}
                      className="inline-flex items-center gap-2.5 px-3 py-2 rounded-md bg-[var(--surface)] border border-[var(--brand-border)] hover:border-emerald-500/50 transition-colors max-w-[280px]"
                    >
                      <div className="w-8 h-8 rounded bg-[var(--surface-hover)] flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-[var(--text-muted)]"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[var(--text)] truncate">{a.filename}</p>
                        <p className="text-[10px] text-[var(--text-light)]">{(a.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Download size={12} className="text-[var(--text-light)] shrink-0"/>
                    </a>
                  )
                ))}
              </div>
            )}
          </>
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
                {canReply && (
                  <button
                    type="button"
                    onClick={() => { onReply!(message); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-2"
                  >
                    <Reply size={12}/> Responder
                  </button>
                )}
                {canReact && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setEmojiPickerOpen(v => !v)}
                      className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-2"
                    >
                      <Smile size={12}/> Reagir
                    </button>
                    {emojiPickerOpen && (
                      <div className={['absolute z-20 mt-1 flex gap-0.5 p-1.5 rounded-md border border-[var(--brand-border)] bg-[var(--surface)] shadow-lg', isOwn ? 'right-full mr-1' : 'left-full ml-1'].join(' ')}>
                        {QUICK_EMOJIS.map(e => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => handleReact(e)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--surface-hover)] text-base"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {canPin && (
                  <button
                    type="button"
                    onClick={handlePin}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-2"
                  >
                    {isPinned ? <><PinOff size={12}/> Desafixar</> : <><Pin size={12}/> Fixar</>}
                  </button>
                )}
                {canFavorite && (
                  <button
                    type="button"
                    onClick={handleFavorite}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-2"
                  >
                    <Star size={12} className={isFavorite ? 'fill-amber-400 text-amber-400' : ''}/> {isFavorite ? 'Desfavoritar' : 'Favoritar'}
                  </button>
                )}
                {canForward && (
                  <button
                    type="button"
                    onClick={() => { setForwardOpen(true); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-2"
                  >
                    <Forward size={12}/> Encaminhar
                  </button>
                )}
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

        {isOwn && !isBotMsg && !isDeleted && (
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[var(--text-light)]">
            {readers.length > 0 ? (
              <span title={readers.map(r => `${r.name} — ${format(new Date(r.at), 'dd/MM HH:mm', { locale: ptBR })}`).join('\n')} className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <CheckCheck size={11}/>
                {readers.length === 1 ? `Lida por ${readers[0].name.split(' ')[0]}` : `Lida por ${readers.length}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5" title="Enviada">
                <Check size={11}/>
              </span>
            )}
          </div>
        )}

        {reactions.length > 0 && !isDeleted && (
          <div className={['mt-1 flex flex-wrap gap-1', isOwn ? 'justify-end' : ''].join(' ')}>
            {reactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => handleReact(r.emoji)}
                title={r.users.map(u => u.name).join(', ')}
                className={[
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                  r.by_me
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-[var(--surface-hover)] border-[var(--brand-border)] text-[var(--text-muted)] hover:border-emerald-500/40',
                ].join(' ')}
              >
                <span>{r.emoji}</span>
                <span className="font-semibold">{r.count}</span>
              </button>
            ))}
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
      {lightbox && (
        <ImageLightbox src={lightbox.url} filename={lightbox.filename} onClose={() => setLightbox(null)} />
      )}
      {forwardOpen && (
        <ForwardMessageModal message={message} onClose={() => setForwardOpen(false)} />
      )}
    </div>
  )
}
