'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiQuery } from '@/hooks/use-query'
import { Clock, FolderOpen, Receipt, CheckSquare } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardStats {
  pending_timesheets?: number
  approved_timesheets?: number
  pending_expenses?: number
  active_projects?: number
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string
  value?: number | string
  icon: React.ElementType
  loading?: boolean
}) {
  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</CardTitle>
        <Icon size={14} className="text-zinc-400" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value ?? '—'}</div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data, loading } = useApiQuery<DashboardStats>('/dashboard/stats')

  return (
    <AppLayout title="Dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Apontamentos pendentes" value={data?.pending_timesheets} icon={Clock} loading={loading} />
        <StatCard title="Apontamentos aprovados" value={data?.approved_timesheets} icon={Clock} loading={loading} />
        <StatCard title="Despesas pendentes" value={data?.pending_expenses} icon={Receipt} loading={loading} />
        <StatCard title="Projetos ativos" value={data?.active_projects} icon={FolderOpen} loading={loading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <Clock size={14} />
              Apontamentos recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500">Em breve</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <CheckSquare size={14} />
              Pendentes de aprovação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500">Em breve</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
