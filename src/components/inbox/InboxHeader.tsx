'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bell, BellOff, Bot, Download, Settings, Users, Zap } from 'lucide-react'
import type { ConversationSummary, PresenceStatusValue } from '@/types/inbox'
import { exportConversationUrl, muteConversation } from '@/lib/inbox'
import { PresenceDot } from './PresenceDot'
import { ManageGroupModal } from './ManageGroupModal'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

function ExportButton({ conv }: { conv: ConversationSummary }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Exportar conversa"
        className="inline-flex items-center justify-center w-8 h-8 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
      >
        <Download size={14}/>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-md border border-[var(--brand-border)] bg-[var(--surface)] shadow-lg py-1 z-20" onMouseLeave={() => setOpen(false)}>
          <a
            href={exportConversationUrl(conv.id, 'txt')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Texto (.txt)
          </a>
          <a
            href={exportConversationUrl(conv.id, 'json')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            JSON (.json)
          </a>
        </div>
      )}
    </div>
  )
}

function MuteButton({ conv }: { conv: ConversationSummary }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const isMuted = !!conv.muted_until && new Date(conv.muted_until).getTime() > Date.now()

  const apply = async (hours: number | null) => {
    setOpen(false)
    try {
      await muteConversation(conv.id, hours)
      await qc.invalidateQueries({ queryKey: ['inbox-conversations'] })
      toast.success(hours ? `Silenciado por ${hours}h` : 'Silenciamento removido')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={isMuted ? 'Silenciado — clique pra mudar' : 'Silenciar notificações'}
        className={[
          'inline-flex items-center justify-center w-8 h-8 rounded',
          isMuted ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]',
        ].join(' ')}
      >
        {isMuted ? <BellOff size={14}/> : <Bell size={14}/>}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-md border border-[var(--brand-border)] bg-[var(--surface)] shadow-lg py-1 z-20" onMouseLeave={() => setOpen(false)}>
          {[1, 8, 24, 168].map(h => (
            <button
              key={h}
              type="button"
              onClick={() => apply(h)}
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              Silenciar por {h < 24 ? `${h}h` : h === 24 ? '1 dia' : '7 dias'}
            </button>
          ))}
          {isMuted && (
            <button
              type="button"
              onClick={() => apply(null)}
              className="w-full text-left px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 border-t border-[var(--brand-border)]"
            >
              Remover silenciamento
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function GroupHeader({ conversation: c }: { conversation: ConversationSummary }) {
  const [manageOpen, setManageOpen] = useState(false)
  return (
    <>
      <header className="h-16 border-b border-[var(--brand-border)] px-5 flex items-center gap-3 bg-[var(--surface)]">
        {c.avatar_url ? (
          <img src={c.avatar_url} alt={c.title} className="w-10 h-10 rounded-md object-cover shrink-0 ring-1 ring-violet-500/30"/>
        ) : (
          <div className="w-10 h-10 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30 flex items-center justify-center shrink-0">
            <Users size={17} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate text-[var(--text)]">{c.title}</h2>
          <p className="text-[11px] text-[var(--text-light)]">
            Grupo · {c.participants_count ?? '?'} participantes
          </p>
        </div>
        <ExportButton conv={c} />
        <MuteButton conv={c} />
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          title="Gerenciar membros"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] border border-[var(--brand-border)]"
        >
          <Settings size={13}/> Gerenciar membros
        </button>
      </header>
      {manageOpen && (
        <ManageGroupModal
          conversationId={c.id}
          title={c.title ?? 'Grupo'}
          avatarUrl={c.avatar_url}
          onClose={() => setManageOpen(false)}
        />
      )}
    </>
  )
}

interface Props {
  conversation: ConversationSummary | null
  presenceByUser?: Map<number, PresenceStatusValue>
}

export function InboxHeader({ conversation, presenceByUser }: Props) {
  if (!conversation) {
    return (
      <header className="h-16 border-b border-[var(--brand-border)] px-5 flex items-center text-sm text-[var(--text-light)] bg-[var(--surface)]">
        Operational Inbox
      </header>
    )
  }

  const c = conversation

  if (c.type === 'bot') {
    return (
      <header className="h-16 border-b border-[var(--brand-border)] px-5 flex items-center gap-3 bg-[var(--surface)]">
        <div className="w-10 h-10 rounded-md bg-gradient-to-br from-emerald-500/40 to-emerald-700/30 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/50 flex items-center justify-center shrink-0">
          <Bot size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate text-emerald-700 dark:text-emerald-300">{c.title}</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
              <Zap size={10}/> Sistema
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-light)]">
            Alertas operacionais, diagnósticos IA e eventos do Health Engine
          </p>
        </div>
      </header>
    )
  }

  if (c.type === 'group') {
    return <GroupHeader conversation={c} />
  }

  // direct
  const other = c.other_user
  const presence = other ? presenceByUser?.get(other.id) : undefined

  return (
    <header className="h-16 border-b border-[var(--brand-border)] px-5 flex items-center gap-3 bg-[var(--surface)]">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-md bg-[var(--surface-hover)] text-[var(--text)] ring-1 ring-[var(--brand-border)] flex items-center justify-center font-semibold text-xs">
          {initials(other?.name ?? c.title)}
        </div>
        {presence && (
          <PresenceDot status={presence} className="absolute -bottom-0.5 -right-0.5 border-2 border-[var(--surface)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold truncate text-[var(--text)]">{other?.name ?? c.title}</h2>
        <p className="text-[11px] text-[var(--text-light)]">
          {presence === 'online' ? 'Online agora'
            : presence === 'away'   ? 'Ausente'
            : presence === 'offline' ? 'Offline'
            : 'Conversa direta'}
        </p>
      </div>
      <ExportButton conv={c} />
      <MuteButton conv={c} />
    </header>
  )
}
