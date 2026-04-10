'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Clock, Calendar, User, FolderOpen, Ticket } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:    'secondary',
  approved:   'default',
  rejected:   'destructive',
  conflicted: 'outline',
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <Icon size={14} className="text-zinc-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-zinc-500 mb-0.5">{label}</p>
        <p className="text-xs text-zinc-800 dark:text-zinc-200">{value ?? '—'}</p>
      </div>
    </div>
  )
}

export default function TimesheetDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { data: ts, loading, error } = useApiQuery<Timesheet>(`/timesheets/${id}`)

  return (
    <AppLayout
      title="Detalhe do Apontamento"
      actions={
        <Link
          href="/timesheets"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={12} />
          Voltar
        </Link>
      }
    >
      {loading && (
        <div className="max-w-xl space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 py-4">{error}</div>
      )}

      {!loading && ts && (
        <div className="max-w-xl space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={STATUS_VARIANT[ts.status] ?? 'secondary'}>
              {ts.status_display ?? ts.status}
            </Badge>
            {ts.rejection_reason && (
              <span className="text-xs text-red-500">{ts.rejection_reason}</span>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
            <InfoRow icon={Calendar} label="Data" value={formatDate(ts.date)} />
            <InfoRow icon={Clock} label="Período" value={`${ts.start_time} – ${ts.end_time} (${ts.effort_hours})`} />
            <InfoRow icon={User} label="Colaborador" value={ts.user?.name} />
            <InfoRow icon={FolderOpen} label="Projeto" value={ts.project?.name} />
            {ts.ticket && (
              <InfoRow icon={Ticket} label="Ticket" value={`${ts.ticket}${ts.ticket_subject ? ` — ${ts.ticket_subject}` : ''}`} />
            )}
          </div>

          {ts.observation && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Observação</p>
              </div>
              <div
                className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_img]:rounded-md [&_img]:mt-2"
                dangerouslySetInnerHTML={{ __html: ts.observation }}
              />
            </div>
          )}

          {ts.reviewedBy && (
            <p className="text-[11px] text-zinc-400">
              Revisado por <strong>{ts.reviewedBy.name}</strong>
              {ts.reviewed_at && ` em ${formatDate(ts.reviewed_at.slice(0, 10))}`}
            </p>
          )}
        </div>
      )}
    </AppLayout>
  )
}
