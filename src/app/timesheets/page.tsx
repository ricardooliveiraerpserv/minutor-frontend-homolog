'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet, PaginatedResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useMemo } from 'react'
import Link from 'next/link'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:    'secondary',
  approved:   'default',
  rejected:   'destructive',
  conflicted: 'outline',
}

const STATUS_LABEL: Record<string, string> = {
  pending:    'Pendente',
  approved:   'Aprovado',
  rejected:   'Rejeitado',
  conflicted: 'Conflito',
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

export default function TimesheetsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status) p.set('status', status)
    return p.toString()
  }, [page, status])

  const { data, loading, error } = useApiQuery<PaginatedResponse<Timesheet>>(
    `/timesheets?${params}`,
    [params]
  )

  const handleStatusChange = (v: string) => {
    setStatus(v)
    setPage(1)
  }

  return (
    <AppLayout title="Apontamentos">
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {['', 'pending', 'approved', 'rejected', 'conflicted'].map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === s
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s === '' ? 'Todos' : STATUS_LABEL[s]}
          </button>
        ))}

        {data && (
          <span className="ml-auto text-xs text-zinc-500">
            Total: <strong className="text-zinc-300">{data.totalEffortHours ?? '—'}</strong>
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Data</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Projeto</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Cliente</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Ticket</th>
              <th className="text-right px-3 py-2.5 text-zinc-500 font-medium">Tempo</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/60">
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-32" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-2.5 hidden lg:table-cell"><Skeleton className="h-3 w-16" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-12 ml-auto" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-4 w-16 rounded-full" /></td>
              </tr>
            ))}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-zinc-500">
                  <Clock size={24} className="mx-auto mb-2 opacity-30" />
                  Nenhum apontamento encontrado
                </td>
              </tr>
            )}

            {!loading && !error && data?.items.map(ts => (
              <tr
                key={ts.id}
                className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                  {formatDate(ts.date)}
                </td>
                <td className="px-3 py-2.5 max-w-[200px]">
                  <Link
                    href={`/timesheets/${ts.id}`}
                    className="text-zinc-800 dark:text-zinc-200 hover:text-blue-500 dark:hover:text-blue-400 truncate block"
                  >
                    {ts.project?.name ?? `Projeto #${ts.project_id}`}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden md:table-cell truncate max-w-[160px]">
                  {ts.customer?.name ?? ts.project?.customer?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden lg:table-cell">
                  {ts.ticket ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap font-mono">
                  {formatMinutes(ts.effort_minutes)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={STATUS_VARIANT[ts.status] ?? 'secondary'} className="text-[10px]">
                    {ts.status_display ?? STATUS_LABEL[ts.status] ?? ts.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(data?.items.length ?? 0) > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-zinc-500">Página {page}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!data?.hasNext}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
