'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { unreadSummary } from '@/lib/inbox'

/**
 * Botão flutuante no header global apontando pro /inbox.
 * Mostra badge com total de mensagens não lidas (chat + bot).
 * Polling de 30s. Cluster discreto — não invade espaço de outros indicadores.
 */
export function ChatBell() {
  const { data } = useQuery({
    queryKey: ['inbox-unread-summary'],
    queryFn: unreadSummary,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const total = data?.total_unread ?? 0

  return (
    <Link
      href="/inbox"
      title="Abrir chat"
      aria-label={total > 0 ? `Chat (${total} não lidas)` : 'Abrir chat'}
      className="relative p-1.5 rounded-md transition-colors hover:bg-zinc-800"
      style={{ color: total > 0 ? 'var(--primary)' : '#71717A' }}
    >
      <MessageCircle size={16}/>
      {total > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center pointer-events-none"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
        >
          {total > 9 ? '9+' : total}
        </span>
      )}
    </Link>
  )
}
