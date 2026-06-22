'use client'

import { Bot, MessageSquarePlus, Search, Users, User as UserIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ConversationSummary, PresenceStatusValue } from '@/types/inbox'
import { PresenceDot } from './PresenceDot'
import { OnlineUsersPanel } from './OnlineUsersPanel'

interface ConversationsSidebarProps {
  conversations: ConversationSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onStartDirect: (userId: number) => void
  presenceByUser?: Map<number, PresenceStatusValue>
  loading?: boolean
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

function SeverityPills({ s }: { s: ConversationSummary['unread_by_severity'] }) {
  if (!s) return null
  const c = s.critical + s.high
  const a = s.medium
  const i = s.low + s.info
  if (c + a + i === 0) return null

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {c > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30">{c} crítico</span>}
      {a > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">{a} atenção</span>}
      {i > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30">{i} info</span>}
    </div>
  )
}

function ConversationRow({
  conv, selected, onClick, presence,
}: {
  conv: ConversationSummary
  selected: boolean
  onClick: () => void
  presence?: PresenceStatusValue
}) {
  const isBot = conv.type === 'bot'
  const isGroup = conv.type === 'group'
  const isDirect = conv.type === 'direct'

  const relative = conv.last_message_at
    ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: ptBR })
    : null

  const otherName = conv.other_user?.name ?? conv.title
  const previewIsBot = conv.last_message?.type === 'alert' || conv.last_message?.type === 'ai_insight' || conv.last_message?.type === 'bot'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left flex items-start gap-3 px-3 py-3 border-l-2 transition-colors',
        selected
          ? 'bg-[var(--surface-hover)] border-l-emerald-500'
          : 'border-l-transparent hover:bg-[var(--surface-hover)]/60',
      ].join(' ')}
    >
      <div className="relative shrink-0">
        <div className={[
          'w-9 h-9 rounded-md flex items-center justify-center ring-1 text-[11px] font-semibold',
          isBot
            ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-700/20 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40'
            : isGroup
              ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30'
              : 'bg-[var(--surface-hover)] text-[var(--text)] ring-[var(--brand-border)]',
        ].join(' ')}>
          {isBot ? <Bot size={16} /> : isGroup ? <Users size={15} /> : initials(otherName)}
        </div>
        {isDirect && presence && (
          <PresenceDot status={presence} className="absolute -bottom-0.5 -right-0.5 border-2 border-[var(--surface)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={[
              'text-sm font-semibold truncate',
              isBot ? 'text-emerald-700 dark:text-emerald-300' : 'text-[var(--text)]',
            ].join(' ')}>
              {otherName}
            </span>
            {isBot && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                BOT
              </span>
            )}
            {isGroup && (
              <span className="text-[9px] text-[var(--text-light)] ml-1">
                {conv.participants_count ?? '?'}
              </span>
            )}
          </div>
          {relative && (
            <span className="text-[10px] text-[var(--text-light)] whitespace-nowrap shrink-0">{relative}</span>
          )}
        </div>

        {isBot ? (
          <p className="mt-0.5 text-[10px] text-[var(--text-light)]">Alertas e insights operacionais</p>
        ) : conv.last_message ? (
          <p className={[
            'mt-0.5 text-[11px] truncate',
            previewIsBot ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-[var(--text-muted)]',
          ].join(' ')}>
            {previewIsBot && <span className="font-medium">BOT: </span>}
            {conv.last_message.preview}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-[var(--text-light)] italic">Sem mensagens ainda</p>
        )}

        {isBot && <SeverityPills s={conv.unread_by_severity} />}
        {!isBot && conv.unread_count > 0 && (
          <span className="mt-1.5 inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            {conv.unread_count} nova(s)
          </span>
        )}
      </div>
    </button>
  )
}

export function ConversationsSidebar({
  conversations, selectedId, onSelect, onNew, onStartDirect, presenceByUser, loading,
}: ConversationsSidebarProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(c => {
      const inTitle = c.title?.toLowerCase().includes(q)
      const inOther = c.other_user?.name?.toLowerCase().includes(q)
      const inLast  = c.last_message?.preview?.toLowerCase().includes(q)
      return inTitle || inOther || inLast
    })
  }, [conversations, query])

  const bots    = filtered.filter(c => c.type === 'bot')
  const direct  = filtered.filter(c => c.type === 'direct')
  const groups  = filtered.filter(c => c.type === 'group')

  const hasAny = bots.length + direct.length + groups.length > 0

  return (
    <aside className="w-80 shrink-0 border-r border-[var(--brand-border)] bg-[var(--surface)] overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-[var(--brand-border)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text)] text-sm font-semibold">Conversas</span>
          <span className="text-[10px] text-[var(--text-light)]">{conversations.length}</span>
        </div>
        <button
          type="button"
          onClick={onNew}
          aria-label="Iniciar nova conversa"
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded transition-colors"
        >
          <MessageSquarePlus size={13} /> Nova conversa ou grupo
        </button>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar grupo, pessoa ou mensagem…"
            aria-label="Buscar conversa, grupo, pessoa ou mensagem"
            className="w-full bg-[var(--bg)] border border-[var(--brand-border)] rounded pl-7 pr-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-light)] focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      <OnlineUsersPanel onStartDirect={onStartDirect} />

      {loading && conversations.length === 0 ? (
        <div className="p-4 text-xs text-[var(--text-light)]">Carregando…</div>
      ) : query && !hasAny ? (
        <div className="p-4 text-xs text-[var(--text-light)] italic">Nada encontrado para "{query}"</div>
      ) : (
        <>
          {bots.length > 0 && (
            <Section title="BOT">
              {bots.map(c => (
                <ConversationRow key={c.id} conv={c} selected={selectedId === c.id} onClick={() => onSelect(c.id)} />
              ))}
            </Section>
          )}

          <Section title="Direct" empty={!query ? 'Nenhuma conversa direta' : undefined}>
            {direct.map(c => (
              <ConversationRow
                key={c.id}
                conv={c}
                selected={selectedId === c.id}
                onClick={() => onSelect(c.id)}
                presence={c.other_user ? presenceByUser?.get(c.other_user.id) : undefined}
              />
            ))}
          </Section>

          <Section
            title="Grupos"
            empty={!query ? 'Nenhum grupo ainda.' : undefined}
            emptyAction={!query ? { label: 'Criar grupo', onClick: onNew } : undefined}
          >
            {groups.map(c => (
              <ConversationRow key={c.id} conv={c} selected={selectedId === c.id} onClick={() => onSelect(c.id)} />
            ))}
          </Section>
        </>
      )}
    </aside>
  )
}

function Section({
  title, children, empty, emptyAction,
}: {
  title: string
  children: React.ReactNode
  empty?: string
  emptyAction?: { label: string; onClick: () => void }
}) {
  const arr = Array.isArray(children) ? children : [children]
  const hasItems = arr.filter(Boolean).length > 0
  return (
    <div className="border-b border-[var(--brand-border)]/60">
      <div className="px-3 pt-3 pb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-light)]">
        <UserIcon size={10} /> {title}
      </div>
      {hasItems ? <ul className="pb-1">{children}</ul> : empty ? (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[11px] text-[var(--text-light)] italic">{empty}</p>
          {emptyAction && (
            <button
              type="button"
              onClick={emptyAction.onClick}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 underline-offset-2 hover:underline"
            >
              + {emptyAction.label}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
