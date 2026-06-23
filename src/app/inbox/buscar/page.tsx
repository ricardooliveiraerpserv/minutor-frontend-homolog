'use client'

import Link from 'next/link'
import { useState, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, MessageSquare, Search, Users } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { searchMessagesGlobal } from '@/lib/inbox'
import { Skeleton } from '@/components/ui/skeleton'

export default function GlobalChatSearchPage() {
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q)

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-search-global', deferred],
    queryFn: () => searchMessagesGlobal(deferred, 80),
    enabled: deferred.trim().length >= 2,
    staleTime: 30_000,
  })

  const hits = data?.data ?? []
  const tooShort = q.trim().length > 0 && q.trim().length < 2

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6">
        <header className="mb-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
            <Search size={18} className="text-emerald-500"/>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Buscar mensagens</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Procura no conteúdo de todas as conversas em que você participa.
            </p>
          </div>
        </header>

        <div className="ds-card p-4 mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-light)]"/>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
              placeholder="Digite uma palavra ou frase…"
              className="ds-input pl-9 w-full"
            />
          </div>
          {tooShort && <p className="text-[11px] text-[var(--text-light)] mt-1">Digite pelo menos 2 caracteres.</p>}
        </div>

        {isLoading && deferred.trim().length >= 2 && (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="ds-card p-4">
                <Skeleton className="h-3 w-1/4 mb-2"/>
                <Skeleton className="h-3 w-full"/>
              </div>
            ))}
          </div>
        )}

        {!isLoading && deferred.trim().length >= 2 && hits.length === 0 && (
          <div className="ds-card p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">Nenhuma mensagem encontrada para "{deferred}".</p>
          </div>
        )}

        {hits.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--text-light)] uppercase tracking-wider mb-1">
              {hits.length} resultado{hits.length === 1 ? '' : 's'}
            </p>
            {hits.map(h => {
              const conv = h.conversation
              const icon = conv?.type === 'group' ? <Users size={12}/> : conv?.type === 'bot' ? <Bot size={12}/> : <MessageSquare size={12}/>
              const when = h.created_at ? format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ''
              return (
                <Link key={h.id} href="/inbox" className="block ds-card p-4 hover:border-emerald-500/40 transition-colors">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mb-1.5">
                    <span className="inline-flex items-center gap-1">{icon} {conv?.title || (conv?.type === 'group' ? 'Grupo' : 'Conversa')}</span>
                    {h.sender && <span>· {h.sender.name}</span>}
                    <span className="text-[var(--text-light)]">· {when}</span>
                  </div>
                  <p className="text-sm text-[var(--text)] line-clamp-2">{h.snippet}</p>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
