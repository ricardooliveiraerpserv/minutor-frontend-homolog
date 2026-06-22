'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Archive, Inbox as InboxIcon, MessageSquare, Pin, Search, X } from 'lucide-react'
import { listMessages, listPinned, markRead } from '@/lib/inbox'
import { MessageItem } from './MessageItem'
import { ChatMessageItem } from './ChatMessageItem'
import { Composer } from './Composer'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  ConversationSummary, InboxMessage, NotificationStatusValue,
} from '@/types/inbox'

type Filter = 'active' | 'all' | 'resolved' | 'archived' | 'snoozed'

const FILTER_QUERY: Record<Filter, string | undefined> = {
  active:   'unread,read',
  all:      undefined,
  resolved: 'resolved',
  archived: 'archived',
  snoozed:  'snoozed',
}

const FILTER_LABEL: Record<Filter, string> = {
  active:   'Ação',
  all:      'Tudo',
  resolved: 'Resolvidas',
  archived: 'Arquivadas',
  snoozed:  'Soneca',
}

interface Props {
  conversation: ConversationSummary | null
  currentUserId: number | null
}

export function MessageList({ conversation, currentUserId }: Props) {
  const isBot = conversation?.type === 'bot'
  const isChat = conversation && conversation.type !== 'bot'

  const [filter, setFilter] = useState<Filter>('active')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const { data: pinnedRes } = useQuery({
    queryKey: ['inbox-pinned', conversation?.id],
    queryFn: () => listPinned(conversation!.id),
    enabled: !!conversation && conversation.type !== 'bot',
    staleTime: 60_000,
  })
  const pinned = pinnedRes?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-messages', conversation?.id, isBot ? filter : 'chat'],
    queryFn: () => {
      const status = isBot ? FILTER_QUERY[filter] : undefined
      return listMessages(conversation!.id, 100).then(d => {
        if (!status) return d
        const allowed = status.split(',') as NotificationStatusValue[]
        return { ...d, data: d.data.filter(m => allowed.includes(m.status)) }
      })
    },
    enabled: !!conversation,
    refetchInterval: 30_000,
  })

  // Marcar conversa como lida ao abrir
  useEffect(() => {
    if (!conversation) return
    if (conversation.unread_count > 0) {
      markRead(conversation.id).catch(() => {})
    }
  }, [conversation?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll para o final em conversas tipo chat
  useEffect(() => {
    if (isChat && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [data?.data?.length, isChat])

  // Filtro client-side de busca dentro da conversa.
  // Importante: este hook precisa ficar ANTES dos early returns para manter
  // a ordem de chamadas estável entre renders (React error #310).
  const allItems = data?.data ?? []
  const items = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(m =>
      m.body?.toLowerCase().includes(q)
      || m.sender?.name?.toLowerCase().includes(q)
      || (m.attachments ?? []).some(a => a.filename.toLowerCase().includes(q))
    )
  }, [allItems, searchQuery])

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-light)] p-8 bg-[var(--bg)]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500/15 to-emerald-700/5 ring-1 ring-emerald-500/20 flex items-center justify-center">
            <MessageSquare size={28} className="text-emerald-700 dark:text-emerald-400/70" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Nenhuma conversa aberta</h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Escolha uma conversa na lista à esquerda, ou clique em <strong className="text-emerald-700 dark:text-emerald-300">Nova conversa</strong> pra começar a falar com alguém ou criar um grupo.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 flex-1 overflow-y-auto bg-[var(--bg)]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="border border-[var(--brand-border)] bg-[var(--surface)] rounded-md p-4 mb-3">
            <Skeleton className="h-3 w-1/3 bg-[var(--surface-hover)] mb-2" />
            <Skeleton className="h-3 w-full bg-[var(--surface-hover)] mb-1" />
            <Skeleton className="h-3 w-3/4 bg-[var(--surface-hover)]" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">
      {/* Barra de busca dentro da conversa (chat e bot) */}
      {conversation && (
        <div className="px-5 py-2 flex items-center gap-2 border-b border-[var(--brand-border)] bg-[var(--surface)]">
          {searchOpen ? (
            <>
              <div className="relative flex-1 max-w-xl">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  placeholder="Buscar nesta conversa…"
                  className="w-full bg-[var(--bg)] border border-[var(--brand-border)] rounded pl-7 pr-7 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-light)] focus:outline-none focus:border-emerald-500/50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-[var(--text-light)] hover:text-[var(--text)]"
                    title="Limpar"
                  >
                    <X size={11}/>
                  </button>
                )}
              </div>
              {searchQuery && (
                <span className="text-[10px] text-[var(--text-light)]">
                  {items.length} resultado{items.length === 1 ? '' : 's'}
                </span>
              )}
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded"
              >
                Fechar busca
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded"
              title="Buscar nesta conversa (Ctrl+F)"
            >
              <Search size={11}/> Buscar nesta conversa
            </button>
          )}
        </div>
      )}

      {pinned.length > 0 && conversation?.type !== 'bot' && (
        <div className="px-5 py-2 border-b border-[var(--brand-border)] bg-amber-500/5">
          <div className="flex items-center gap-2 mb-1">
            <Pin size={11} className="text-amber-500"/>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
              {pinned.length === 1 ? 'Mensagem fixada' : `${pinned.length} mensagens fixadas`}
            </span>
          </div>
          <div className="space-y-1">
            {pinned.slice(0, 3).map(p => (
              <div key={p.id} className="text-[11px] text-[var(--text-muted)] truncate">
                <span className="font-semibold text-[var(--text)]">{p.sender?.name ?? '—'}:</span>{' '}
                {p.body ? p.body.slice(0, 100) : '[anexo]'}
              </div>
            ))}
            {pinned.length > 3 && (
              <div className="text-[10px] text-[var(--text-light)]">+ {pinned.length - 3} mais</div>
            )}
          </div>
        </div>
      )}

      {isBot && (
        <div className="px-5 py-2 flex items-center gap-1 border-b border-[var(--brand-border)] bg-[var(--surface)]">
          {(Object.keys(FILTER_LABEL) as Filter[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={[
                'px-3 py-1 text-[11px] uppercase tracking-wider rounded transition-colors',
                filter === k
                  ? 'bg-[var(--text)] text-[var(--surface)] font-semibold'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
              ].join(' ')}
            >
              {FILTER_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <div className="flex items-center justify-center text-[var(--text-light)] py-16">
            <div className="text-center">
              {isBot && filter === 'active' ? (
                <>
                  <InboxIcon size={36} className="mx-auto mb-3 text-[var(--text-light)]" />
                  <p className="text-sm text-[var(--text-muted)]">Inbox limpo.</p>
                  <p className="text-xs mt-1 text-[var(--text-light)]">Nenhum item operacional pendente.</p>
                </>
              ) : isBot ? (
                <>
                  <Archive size={36} className="mx-auto mb-3 text-[var(--text-light)]" />
                  <p className="text-sm text-[var(--text-muted)]">Nada por aqui.</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[var(--surface)] ring-1 ring-[var(--brand-border)] flex items-center justify-center">
                    <MessageSquare size={22} className="text-[var(--text-light)]" />
                  </div>
                  <p className="text-sm text-[var(--text-muted)] font-medium">Sem mensagens ainda</p>
                  <p className="text-xs mt-1 text-[var(--text-light)]">Diga oi pra começar a conversa.</p>
                </>
              )}
            </div>
          </div>
        ) : isBot ? (
          items.map(m => <MessageItem key={m.id} message={m} />)
        ) : (
          <>
            {(() => {
              const asc = [...items].reverse()
              return asc.map((m, i) => {
                const prev = i > 0 ? asc[i - 1] : null
                const sameSender = prev?.sender?.id === m.sender?.id && prev?.type.value === m.type.value
                const closeInTime = prev
                  ? new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 2 * 60_000
                  : false
                return (
                  <ChatMessageItem
                    key={m.id}
                    message={m}
                    isOwn={!!currentUserId && m.sender?.id === currentUserId}
                    compact={!!prev && sameSender && closeInTime}
                    onReply={setReplyTo}
                  />
                )
              })
            })()}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {isChat && (
        <Composer
          conversationId={conversation.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      )}
    </div>
  )
}
