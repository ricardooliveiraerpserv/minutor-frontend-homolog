'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Expense, PaginatedResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Receipt, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useMemo } from 'react'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:  'secondary',
  approved: 'default',
  rejected: 'destructive',
}

const STATUS_LABEL: Record<string, string> = {
  pending:  'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export default function ExpensesPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status) p.set('status', status)
    return p.toString()
  }, [page, status])

  const { data, loading, error } = useApiQuery<PaginatedResponse<Expense>>(
    `/expenses?${params}`,
    [params]
  )

  const handleStatusChange = (v: string) => {
    setStatus(v)
    setPage(1)
  }

  return (
    <AppLayout title="Despesas">
      <div className="flex items-center gap-2 mb-4">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === s
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s === '' ? 'Todas' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Data</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Descrição</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Projeto</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Categoria</th>
              <th className="text-right px-3 py-2.5 text-zinc-500 font-medium">Valor</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/60">
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-40" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-28" /></td>
                <td className="px-3 py-2.5 hidden lg:table-cell"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-16 ml-auto" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-4 w-16 rounded-full" /></td>
              </tr>
            ))}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">{error}</td>
              </tr>
            )}

            {!loading && !error && data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-zinc-500">
                  <Receipt size={24} className="mx-auto mb-2 opacity-30" />
                  Nenhuma despesa encontrada
                </td>
              </tr>
            )}

            {!loading && !error && data?.items.map(exp => (
              <tr
                key={exp.id}
                className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                  {formatDate(exp.expense_date)}
                </td>
                <td className="px-3 py-2.5 max-w-[200px]">
                  <span className="text-zinc-800 dark:text-zinc-200 truncate block">{exp.description}</span>
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden md:table-cell truncate max-w-[160px]">
                  {exp.project?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden lg:table-cell">
                  {exp.category?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap font-mono">
                  {formatCurrency(exp.amount)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={STATUS_VARIANT[exp.status] ?? 'secondary'} className="text-[10px]">
                    {STATUS_LABEL[exp.status] ?? exp.status}
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
