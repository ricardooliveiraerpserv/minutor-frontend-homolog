'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, ChevronRight } from 'lucide-react'
import { listConversations } from '@/lib/inbox'
import type { ConversationSummary } from '@/types/inbox'

function nameOf(c: ConversationSummary): string {
  return c.other_user?.name ?? c.title ?? 'Conversa'
}

/**
 * Card do Meu Dia avisando que há conversas de chat pendentes (não lidas).
 * Substitui o e-mail de digest: em vez de mandar email, mostramos aqui.
 * Só aparece quando há não-lidas. Compartilha o cache ['inbox-conversations'].
 */
export function PendingChatsCard() {
  const router = useRouter()

  const { data } = useQuery({
    queryKey: ['inbox-conversations'],
    queryFn: listConversations,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const convs = (data?.data ?? []).filter(c => c.unread_count > 0)
  const total = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0)
  if (total === 0) return null

  const nomes = convs.slice(0, 3).map(nameOf).join(', ')

  return (
    <button
      onClick={() => router.push('/inbox')}
      className="w-full ds-card p-3 text-left flex items-start gap-2.5 animate-[popIn_.2s_ease-out]"
      style={{ borderLeft: '4px solid var(--primary)', background: 'var(--primary-soft)' }}
    >
      <MessageCircle size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold" style={{ color: 'var(--primary)' }}>
          {total} mensagem{total > 1 ? 's' : ''} pendente{total > 1 ? 's' : ''} no chat
          {convs.length > 1 ? ` · ${convs.length} conversas` : ''}
        </div>
        <div className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text)' }}>
          {nomes}{convs.length > 3 ? ` + ${convs.length - 3} outra(s)` : ''}
        </div>
      </div>
      <span className="text-[11px] inline-flex items-center gap-1 shrink-0 mt-0.5" style={{ color: 'var(--primary)' }}>
        Abrir <ChevronRight size={12} />
      </span>
    </button>
  )
}
