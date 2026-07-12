'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertOctagon, AlertTriangle, ArchiveX, Bot, Check, ChevronRight,
  Clock, ExternalLink, Inbox as InboxIcon, Sparkles,
} from 'lucide-react'
import { updateMessageStatus } from '@/lib/inbox'
import type { InboxMessage, MessageTypeValue, NotificationStatusValue, SeverityValue } from '@/types/inbox'

// ─── Severity styling ────────────────────────────────────────────────
const SEV_STYLES: Record<SeverityValue, { bar: string; ring: string; dot: string; text: string; bg: string }> = {
  critical: { bar: 'border-l-red-500',     ring: 'ring-red-500/30',    dot: 'bg-red-500',     text: 'text-red-300',    bg: 'bg-red-500/10' },
  high:     { bar: 'border-l-orange-500',  ring: 'ring-orange-500/30', dot: 'bg-orange-500',  text: 'text-orange-300', bg: 'bg-orange-500/10' },
  medium:   { bar: 'border-l-amber-500',   ring: 'ring-amber-500/30',  dot: 'bg-amber-500',   text: 'text-amber-300',  bg: 'bg-amber-500/10' },
  low:      { bar: 'border-l-emerald-500', ring: 'ring-emerald-500/30',dot: 'bg-emerald-500', text: 'text-emerald-300',bg: 'bg-emerald-500/10' },
  info:     { bar: 'border-l-blue-500',    ring: 'ring-blue-500/30',   dot: 'bg-blue-500',    text: 'text-blue-300',   bg: 'bg-blue-500/10' },
}

const TYPE_ICON: Record<MessageTypeValue, typeof Bot> = {
  user:       Bot,
  system:     Bot,
  bot:        Bot,
  ai_insight: Sparkles,
  alert:      AlertOctagon,
}

const STATUS_BADGE: Partial<Record<NotificationStatusValue, { label: string; cls: string }>> = {
  read:     { label: 'Lida',      cls: 'bg-zinc-800 text-zinc-400' },
  resolved: { label: 'Resolvido', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
  archived: { label: 'Arquivado', cls: 'bg-zinc-800 text-zinc-500' },
  snoozed:  { label: 'Soneca',    cls: 'bg-violet-500/15 text-violet-300 border border-violet-500/30' },
}

function getSeverity(m: InboxMessage): SeverityValue {
  return ((m.metadata?.severity as SeverityValue | undefined) ?? 'info')
}

// ─── Component ───────────────────────────────────────────────────────
export function MessageItem({ message }: { message: InboxMessage }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  const severity = getSeverity(message)
  const sev = SEV_STYLES[severity]
  const TypeIcon = TYPE_ICON[message.type.value] ?? Bot

  const customerId = message.metadata?.customer_id as number | undefined
  const contractId = message.metadata?.contract_id as number | undefined
  const projectId  = message.metadata?.project_id  as number | undefined
  const provider   = message.metadata?.provider    as string | undefined
  const eventType  = message.metadata?.event_type  as string | undefined

  const dt = new Date(message.created_at)
  const absolute = format(dt, "dd/MM/yyyy HH:mm", { locale: ptBR })
  const relative = formatDistanceToNow(dt, { addSuffix: true, locale: ptBR })

  const statusBadge = STATUS_BADGE[message.status]
  const isHandled = ['resolved', 'archived'].includes(message.status)

  // ── extrai title da metadata ou da primeira linha do body ──
  const title = (message.metadata?.title as string | undefined)
    ?? message.body.split('\n')[0].replace(/^\*\*|\*\*$/g, '').slice(0, 200)
  const body = (message.metadata?.title)
    ? message.body
    : message.body.split('\n').slice(1).join('\n').trim()

  const setStatus = async (status: NotificationStatusValue, snoozedHours?: number) => {
    setBusy(true)
    try {
      const snoozed = snoozedHours
        ? new Date(Date.now() + snoozedHours * 3600_000).toISOString()
        : undefined
      await updateMessageStatus(message.id, status, snoozed)
      await qc.invalidateQueries({ queryKey: ['inbox-messages', message.conversation_id] })
      await qc.invalidateQueries({ queryKey: ['inbox-conversations'] })
      toast.success(STATUS_BADGE[status]?.label ?? status)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={[
      'border-l-4 border border-zinc-800 rounded-md mb-3 transition-all',
      isHandled ? 'opacity-60 bg-zinc-900/20' : 'bg-zinc-900/50 hover:bg-zinc-900/80',
      sev.bar,
    ].join(' ')}>
      <header className="flex items-start gap-3 p-4 pb-2">
        {/* dot grande indicando severity */}
        <div className={`mt-1 w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${sev.bg} ring-1 ${sev.ring}`}>
          <TypeIcon size={14} className={sev.text} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${sev.bg} ${sev.text} ring-1 ${sev.ring}`}>
              {severity}
            </span>
            {eventType && (
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{eventType.replace(/_/g, ' ')}</span>
            )}
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{message.type.label}</span>
            {provider && (
              <>
                <span className="text-[10px] text-zinc-600">·</span>
                <span className="text-[10px] text-zinc-500">{provider}</span>
              </>
            )}
            {statusBadge && (
              <span className={`ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{title}</h3>
        </div>
      </header>

      {body && (
        <div className="px-4 pl-[60px] text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
          {body}
        </div>
      )}

      <footer className="px-4 pl-[60px] py-3 mt-2 flex items-center justify-between flex-wrap gap-2 border-t border-zinc-800/60">
        {/* CTAs contextuais */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {customerId && (
            <Link href={`/clientes?customer_id=${customerId}`}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 px-2.5 py-1 rounded">
              <ExternalLink size={11}/> Cliente
            </Link>
          )}
          {projectId && (
            <Link href={`/gestao-projetos?project_id=${projectId}`}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 px-2.5 py-1 rounded">
              <ChevronRight size={11}/> Projeto
            </Link>
          )}
          {contractId && (
            <Link href={`/contratos/pipeline?contract_id=${contractId}`}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 px-2.5 py-1 rounded">
              <ChevronRight size={11}/> Contrato
            </Link>
          )}
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-1">
          <time dateTime={message.created_at} className="text-[10px] text-zinc-600 mr-2" title={absolute}>
            {relative}
          </time>

          {!isHandled && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStatus('resolved')}
                title="Resolver"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10 px-2 py-1 rounded"
              >
                <Check size={11}/> Resolver
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStatus('snoozed', 4)}
                title="Soneca de 4h"
                className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:bg-violet-500/10 px-2 py-1 rounded"
              >
                <Clock size={11}/> 4h
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStatus('archived')}
                title="Arquivar"
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:bg-zinc-800 px-2 py-1 rounded"
              >
                <ArchiveX size={11}/>
              </button>
            </>
          )}
          {isHandled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus('unread')}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:bg-zinc-800 px-2 py-1 rounded"
            >
              <InboxIcon size={11}/> Reabrir
            </button>
          )}
        </div>
      </footer>
    </article>
  )
}
