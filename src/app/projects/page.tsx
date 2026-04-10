'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Project, PaginatedResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FolderOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useMemo } from 'react'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active:   'default',
  inactive: 'secondary',
  closed:   'outline',
}

function ProgressBar({ pct }: { pct?: number }) {
  const val = Math.min(100, Math.max(0, pct ?? 0))
  const color = val > 90 ? 'bg-red-500' : val > 70 ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${val}%` }} />
    </div>
  )
}

export default function ProjectsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status) p.set('status', status)
    return p.toString()
  }, [page, status])

  const { data, loading, error } = useApiQuery<PaginatedResponse<Project>>(
    `/projects?${params}`,
    [params]
  )

  const handleStatusChange = (v: string) => {
    setStatus(v)
    setPage(1)
  }

  return (
    <AppLayout title="Projetos">
      <div className="flex items-center gap-2 mb-4">
        {[
          { value: '', label: 'Todos' },
          { value: 'active', label: 'Ativos' },
          { value: 'inactive', label: 'Inativos' },
          { value: 'closed', label: 'Encerrados' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleStatusChange(value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === value
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Código</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Projeto</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Cliente</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell w-32">Saldo</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/60">
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-16" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-40" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-28" /></td>
                <td className="px-3 py-2.5 hidden lg:table-cell"><Skeleton className="h-2 w-full" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-4 w-16 rounded-full" /></td>
              </tr>
            ))}

            {!loading && error && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">{error}</td>
              </tr>
            )}

            {!loading && !error && data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-zinc-500">
                  <FolderOpen size={24} className="mx-auto mb-2 opacity-30" />
                  Nenhum projeto encontrado
                </td>
              </tr>
            )}

            {!loading && !error && data?.items.map(p => (
              <tr
                key={p.id}
                className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <td className="px-3 py-2.5 text-zinc-500 font-mono">{p.code}</td>
                <td className="px-3 py-2.5 max-w-[200px]">
                  <span className="text-zinc-800 dark:text-zinc-200 truncate block">{p.name}</span>
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden md:table-cell truncate max-w-[160px]">
                  {p.customer?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell w-32">
                  {p.balance_percentage != null ? (
                    <div className="space-y-1">
                      <ProgressBar pct={p.balance_percentage} />
                      <span className="text-[10px] text-zinc-500">{p.balance_percentage.toFixed(0)}%</span>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'} className="text-[10px]">
                    {p.status_display ?? p.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
