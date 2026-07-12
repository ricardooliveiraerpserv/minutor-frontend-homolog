'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Inbox, Radio } from 'lucide-react'
import { listOperationalFeed } from '@/lib/operational-feed'
import { FeedCard } from './FeedCard'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  FeedEventTypeValue,
  FeedSeverityValue,
  FeedSourceValue,
} from '@/types/operational-feed'

interface TimelineProps {
  severity: FeedSeverityValue[]
  source: FeedSourceValue[]
  eventType: FeedEventTypeValue[]
  perPage?: number
}

export function Timeline({ severity, source, eventType, perPage = 50 }: TimelineProps) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['operational-feed', { severity, source, eventType, perPage }],
    queryFn: () =>
      listOperationalFeed({
        severity,
        source,
        event_type: eventType,
        per_page: perPage,
      }),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-l-4 border-zinc-800 bg-zinc-900/40 border border-zinc-800 rounded-md p-4">
            <div className="flex gap-3 items-start">
              <Skeleton className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3 bg-zinc-800" />
                <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                <Skeleton className="h-3 w-full bg-zinc-800" />
                <Skeleton className="h-3 w-3/4 bg-zinc-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="border border-red-500/30 bg-red-500/10 rounded-md p-4 flex items-start gap-3">
        <AlertCircle className="text-red-400 mt-0.5 shrink-0" size={18} />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-200">Falha ao carregar o feed</h3>
          <p className="text-xs text-red-300/80 mt-1">{(error as Error).message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 text-xs px-3 py-1 rounded border border-red-500/40 text-red-200 hover:bg-red-500/10"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  const items = data?.data ?? []
  const total = data?.meta?.total ?? items.length

  if (items.length === 0) {
    return (
      <div className="border border-zinc-800 bg-zinc-950/40 rounded-md p-10 text-center">
        <Inbox className="mx-auto text-zinc-600 mb-3" size={32} />
        <p className="text-sm text-zinc-400">Nenhum evento encontrado.</p>
        <p className="text-xs text-zinc-600 mt-1">
          Ajuste os filtros ou aguarde o Health Engine gerar o próximo lote.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Radio size={14} className={isFetching ? 'animate-pulse text-emerald-400' : ''} />
          {items.length === total ? (
            <span>{total} evento{total === 1 ? '' : 's'}</span>
          ) : (
            <span>
              Mostrando {items.length} de {total} eventos
            </span>
          )}
        </div>
      </div>

      {items.map(feed => (
        <FeedCard key={feed.id} feed={feed} />
      ))}
    </div>
  )
}
