'use client'

import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, MessageSquare, Star, Users } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { listFavorites, toggleFavorite } from '@/lib/inbox'
import type { InboxMessage } from '@/types/inbox'
import { Skeleton } from '@/components/ui/skeleton'

interface FavoriteMessage extends InboxMessage {
  conversation?: {
    id: number
    type: 'direct' | 'group' | 'bot'
    title: string | null
  } | null
}

export default function FavoritesPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['inbox-favorites'],
    queryFn: listFavorites,
  })
  const items = (data?.data ?? []) as FavoriteMessage[]

  const remove = async (id: number) => {
    if (!confirm('Remover esta mensagem dos favoritos?')) return
    try {
      await toggleFavorite(id)
      await qc.invalidateQueries({ queryKey: ['inbox-favorites'] })
      toast.success('Removido dos favoritos')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6">
        <header className="mb-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center shrink-0">
            <Star size={18} className="fill-amber-400 text-amber-400"/>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Mensagens favoritas</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Mensagens que você marcou com ⭐ nos chats. Apenas você consegue ver esta lista.
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="ds-card p-4">
                <Skeleton className="h-3 w-1/4 mb-2"/>
                <Skeleton className="h-3 w-full mb-1"/>
                <Skeleton className="h-3 w-3/4"/>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="ds-card p-12 text-center">
            <Star size={36} className="mx-auto mb-3 text-[var(--text-light)]"/>
            <p className="text-sm text-[var(--text-muted)]">Você ainda não favoritou nenhuma mensagem.</p>
            <p className="text-xs text-[var(--text-light)] mt-1">
              No <Link href="/inbox" className="text-emerald-600 dark:text-emerald-400 hover:underline">chat</Link>, abra o menu de uma mensagem (⋮) e clique em "Favoritar".
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(m => {
              const conv = m.conversation
              const icon = conv?.type === 'group' ? <Users size={13}/> : conv?.type === 'bot' ? <Bot size={13}/> : <MessageSquare size={13}/>
              const when = m.created_at ? format(new Date(m.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''
              return (
                <article key={m.id} className="ds-card p-4 hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      title="Remover dos favoritos"
                      className="text-amber-500 hover:text-amber-700 shrink-0 mt-0.5"
                    >
                      <Star size={14} className="fill-amber-400"/>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--text-muted)] mb-1">
                        {conv && (
                          <Link href="/inbox" className="inline-flex items-center gap-1 hover:text-[var(--text)]">
                            {icon}
                            <span className="font-medium">{conv.title || (conv.type === 'group' ? 'Grupo' : 'Conversa')}</span>
                          </Link>
                        )}
                        {m.sender && <span>· por {m.sender.name}</span>}
                        <span className="text-[var(--text-light)]">· {when}</span>
                      </div>
                      <p className="text-sm text-[var(--text)] whitespace-pre-wrap break-words">
                        {m.deleted_at ? <em className="text-[var(--text-light)]">[mensagem excluída]</em> : m.body}
                      </p>
                      {(m.attachments?.length ?? 0) > 0 && (
                        <p className="text-[11px] text-[var(--text-light)] mt-1">📎 {m.attachments!.length} anexo(s)</p>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
