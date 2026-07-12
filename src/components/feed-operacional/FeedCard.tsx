'use client'

import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  Sparkles,
  Clock,
  TrendingUp,
  TrendingDown,
  PauseCircle,
  DollarSign,
  GraduationCap,
  FileText,
  Headphones,
  Pin,
  type LucideIcon,
} from 'lucide-react'
import type {
  FeedEventTypeValue,
  FeedSeverityValue,
  OperationalFeed,
} from '@/types/operational-feed'

const EVENT_ICON: Record<FeedEventTypeValue, LucideIcon> = {
  hour_overrun:          Clock,
  sla_breach:            AlertTriangle,
  ticket_spike:          Headphones,
  churn_risk:            TrendingDown,
  expansion_opportunity: TrendingUp,
  project_stalled:       PauseCircle,
  ai_suggestion:         Sparkles,
  financial_alert:       DollarSign,
  training_recommended:  GraduationCap,
  contract_renewal:      FileText,
  custom:                Pin,
}

const SEVERITY_RING: Record<FeedSeverityValue, string> = {
  info:     'border-l-blue-500/70',
  low:      'border-l-emerald-500/70',
  medium:   'border-l-amber-500/70',
  high:     'border-l-orange-500/70',
  critical: 'border-l-red-500/80',
}

const SEVERITY_DOT: Record<FeedSeverityValue, string> = {
  info:     'bg-blue-500',
  low:      'bg-emerald-500',
  medium:   'bg-amber-500',
  high:     'bg-orange-500',
  critical: 'bg-red-500',
}

const SEVERITY_BADGE: Record<FeedSeverityValue, string> = {
  info:     'bg-blue-500/10 text-blue-300 border-blue-500/30',
  low:      'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  medium:   'bg-amber-500/10 text-amber-300 border-amber-500/30',
  high:     'bg-orange-500/10 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-300 border-red-500/30',
}

interface FeedCardProps {
  feed: OperationalFeed
}

export function FeedCard({ feed }: FeedCardProps) {
  const sev = feed.severity.value
  const EventIcon = EVENT_ICON[feed.event_type.value] ?? Pin

  const createdDate = new Date(feed.created_at)
  const relative = formatDistanceToNow(createdDate, { addSuffix: true, locale: ptBR })
  const absolute = format(createdDate, "dd/MM/yyyy HH:mm", { locale: ptBR })

  return (
    <article
      className={[
        'border-l-4 bg-zinc-900/60 hover:bg-zinc-900/80 transition-colors',
        'border border-zinc-800 rounded-md p-4 mb-3',
        SEVERITY_RING[sev],
      ].join(' ')}
    >
      <header className="flex items-start gap-3 mb-2">
        <div className={['mt-1 h-2.5 w-2.5 rounded-full shrink-0', SEVERITY_DOT[sev]].join(' ')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <EventIcon size={14} className="text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">{feed.event_type.label}</span>
            <span
              className={[
                'inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border',
                SEVERITY_BADGE[sev],
              ].join(' ')}
            >
              {feed.severity.label}
            </span>
            <span className="text-[11px] text-zinc-500">
              · {feed.source.label}
            </span>
          </div>
          <h3 className="mt-1 text-sm font-semibold text-zinc-100">{feed.title}</h3>
        </div>
        <time
          dateTime={feed.created_at}
          title={absolute}
          className="text-[11px] text-zinc-500 whitespace-nowrap"
        >
          {relative}
        </time>
      </header>

      <div className="pl-5 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {feed.message}
      </div>

      {(feed.customer || feed.project || feed.contract) && (
        <footer className="pl-5 mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-500">
          {feed.customer && (
            <span>
              <span className="text-zinc-600">Cliente:</span> {feed.customer.name}
            </span>
          )}
          {feed.contract && (
            <span>
              <span className="text-zinc-600">Contrato:</span> #{feed.contract.id}
            </span>
          )}
          {feed.project && (
            <span>
              <span className="text-zinc-600">Projeto:</span> {feed.project.name ?? `#${feed.project.id}`}
            </span>
          )}
        </footer>
      )}
    </article>
  )
}
