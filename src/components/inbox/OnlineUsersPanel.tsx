'use client'

import { useQuery } from '@tanstack/react-query'
import { listOnlineUsers } from '@/lib/inbox'
import type { ChatUser } from '@/types/inbox'
import { PresenceDot } from './PresenceDot'

interface Props {
  onStartDirect: (userId: number) => void
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export function OnlineUsersPanel({ onStartDirect }: Props) {
  const { data } = useQuery({
    queryKey: ['presence-online-users'],
    queryFn: () => listOnlineUsers(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })

  const all: ChatUser[] = data?.data ?? []
  const online = all.filter(u => u.presence.status === 'online')
  const away = all.filter(u => u.presence.status === 'away')

  if (online.length === 0 && away.length === 0) {
    return (
      <div className="border-b border-[var(--brand-border)]/60 px-3 py-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-light)]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
          Ninguém online agora
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-[var(--brand-border)]/60 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-light)] mb-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Online agora · {online.length}{away.length > 0 ? ` (+ ${away.length} away)` : ''}
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[...online, ...away].slice(0, 12).map(u => (
          <li key={u.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onStartDirect(u.id)}
              title={`${u.name} (${u.presence.status}) — iniciar DM`}
              className="relative group"
            >
              <div className="w-9 h-9 rounded-md bg-[var(--surface-hover)] text-[var(--text)] flex items-center justify-center text-[10px] font-semibold ring-1 ring-[var(--brand-border)] group-hover:ring-emerald-500/50 transition-all">
                {initials(u.name)}
              </div>
              <PresenceDot status={u.presence.status} className="absolute -bottom-0.5 -right-0.5 border-2 border-[var(--surface)]" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
