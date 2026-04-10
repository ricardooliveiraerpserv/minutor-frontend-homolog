'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiQuery } from '@/hooks/use-query'
import { Clock, Receipt, CheckSquare, ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'

interface ApprovalSummary {
  success: boolean
  data: {
    timesheets: unknown[]
    expenses: unknown[]
    summary: {
      total_timesheets: number
      total_expenses: number
      total_items: number
    }
  }
}

export default function DashboardPage() {
  const { data, loading } = useApiQuery<ApprovalSummary>('/approvals/pending')

  const summary = data?.data?.summary

  return (
    <AppLayout title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Apontamentos pendentes de aprovação
            </CardTitle>
            <Clock size={14} className="text-zinc-400" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-16" /> : (
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {summary?.total_timesheets ?? '—'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Despesas pendentes de aprovação
            </CardTitle>
            <Receipt size={14} className="text-zinc-400" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-16" /> : (
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {summary?.total_expenses ?? '—'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Total de itens pendentes
            </CardTitle>
            <CheckSquare size={14} className="text-zinc-400" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-16" /> : (
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {summary?.total_items ?? '—'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/timesheets">
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-2"><Clock size={14} /> Apontamentos</span>
                <ArrowRight size={12} className="text-zinc-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500">Ver todos os apontamentos de horas</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/approvals">
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-2"><CheckSquare size={14} /> Aprovações</span>
                <ArrowRight size={12} className="text-zinc-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500">
                {loading ? '...' : `${summary?.total_items ?? 0} item(s) aguardando aprovação`}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </AppLayout>
  )
}
