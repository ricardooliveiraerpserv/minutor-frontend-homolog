'use client'

import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, FolderOpen, Receipt, CheckSquare, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Widget {
  label: string
  value: string
  icon: React.ReactNode
  description?: string
}

function getWeekRange() {
  const today = new Date()
  const day = today.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  }
}

function getMonthRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
  return { start, end }
}

function fmtHours(minutes: number) {
  return (minutes / 60).toFixed(1) + 'h'
}

function fmtBRL(value: number) {
  return formatBRL(value)
}

function sumMinutes(items: { effort_minutes?: number }[]) {
  return items.reduce((acc, ts) => acc + (ts.effort_minutes ?? 0), 0)
}

function sumAmount(items: { amount?: number }[]) {
  return items.reduce((acc, e) => acc + (e.amount ?? 0), 0)
}

function WidgetCard({ label, value, icon, loading }: { label: string; value: string; icon: React.ReactNode; loading: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-zinc-500">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="text-2xl font-bold text-zinc-100">{value}</div>
      )}
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition-colors cursor-pointer flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-blue-400">{icon}</span>
          <span className="text-sm text-zinc-300">{label}</span>
        </div>
        <ArrowRight size={14} className="text-zinc-500" />
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [widgets, setWidgets] = useState<Widget[]>([])

  const isAdmin = user?.roles?.includes('Administrator') ||
    user?.permissions?.includes('admin.full_access') ||
    user?.permissions?.includes('projects.view') ||
    user?.permissions?.includes('hours.view_all') ||
    user?.permissions?.includes('expenses.view_all') ||
    false

  useEffect(() => {
    if (authLoading || !user) return

    const today = new Date().toISOString().split('T')[0]
    const week = getWeekRange()
    const month = getMonthRange()

    setLoading(true)

    if (isAdmin) {
      Promise.all([
        api.get<{ items: { effort_minutes: number }[] }>(`/timesheets?start_date=${today}&end_date=${today}&pageSize=1000`),
        api.get<{ items: { effort_minutes: number }[] }>(`/timesheets?start_date=${week.start}&end_date=${week.end}&pageSize=1000`),
        api.get<{ items: unknown[] }>(`/projects?status=active&pageSize=1000`),
        api.get<{ total_timesheets?: number; total_expenses?: number; data?: { summary?: { total_timesheets: number; total_expenses: number } } }>(`/approvals/pending`),
      ]).then(([todayTs, weekTs, projs, approvals]) => {
        const totalTimesheets = (approvals as any)?.data?.summary?.total_timesheets ?? (approvals as any)?.total_timesheets ?? 0
        const totalExpenses = (approvals as any)?.data?.summary?.total_expenses ?? (approvals as any)?.total_expenses ?? 0

        setWidgets([
          { label: 'Horas Hoje (todos)', value: fmtHours(sumMinutes((todayTs as any)?.items ?? [])), icon: <Clock size={16} /> },
          { label: 'Horas da Semana (todos)', value: fmtHours(sumMinutes((weekTs as any)?.items ?? [])), icon: <Clock size={16} /> },
          { label: 'Projetos Ativos', value: String((projs as any)?.items?.length ?? 0), icon: <FolderOpen size={16} /> },
          { label: 'Apontamentos pendentes de aprovação', value: String(totalTimesheets), icon: <CheckSquare size={16} /> },
          { label: 'Despesas pendentes de aprovação', value: String(totalExpenses), icon: <Receipt size={16} /> },
        ])
      }).catch(() => {}).finally(() => setLoading(false))
    } else {
      const uid = user.id
      Promise.all([
        api.get<{ items: { effort_minutes: number }[] }>(`/timesheets?start_date=${today}&end_date=${today}&pageSize=1000&user_id=${uid}`),
        api.get<{ items: { effort_minutes: number }[] }>(`/timesheets?start_date=${week.start}&end_date=${week.end}&pageSize=1000&user_id=${uid}`),
        api.get<{ items: { effort_minutes: number }[] }>(`/timesheets?start_date=${month.start}&end_date=${month.end}&pageSize=1000&user_id=${uid}`),
        api.get<{ items: { status: string }[] }>(`/timesheets?status=pending&pageSize=1000&user_id=${uid}`),
        api.get<{ items: { amount: number }[] }>(`/expenses?start_date=${today}&end_date=${today}&pageSize=1000&user_id=${uid}`),
        api.get<{ items: { amount: number }[] }>(`/expenses?start_date=${week.start}&end_date=${week.end}&pageSize=1000&user_id=${uid}`),
        api.get<{ items: { amount: number }[] }>(`/expenses?start_date=${month.start}&end_date=${month.end}&pageSize=1000&user_id=${uid}`),
      ]).then(([todayTs, weekTs, monthTs, pending, todayExp, weekExp, monthExp]) => {
        setWidgets([
          { label: 'Minhas Horas Hoje', value: fmtHours(sumMinutes((todayTs as any)?.items ?? [])), icon: <Clock size={16} /> },
          { label: 'Minhas Horas da Semana', value: fmtHours(sumMinutes((weekTs as any)?.items ?? [])), icon: <Clock size={16} /> },
          { label: 'Minhas Horas do Mês', value: fmtHours(sumMinutes((monthTs as any)?.items ?? [])), icon: <Clock size={16} /> },
          { label: 'Apontamentos Pendentes', value: String((pending as any)?.items?.length ?? 0), icon: <CheckSquare size={16} /> },
          { label: 'Minhas Despesas Hoje', value: fmtBRL(sumAmount((todayExp as any)?.items ?? [])), icon: <Receipt size={16} /> },
          { label: 'Minhas Despesas da Semana', value: fmtBRL(sumAmount((weekExp as any)?.items ?? [])), icon: <Receipt size={16} /> },
          { label: 'Minhas Despesas do Mês', value: fmtBRL(sumAmount((monthExp as any)?.items ?? [])), icon: <Receipt size={16} /> },
        ])
      }).catch(() => {}).finally(() => setLoading(false))
    }
  }, [user, authLoading, isAdmin])

  const hasPermission = (perm: string) =>
    user?.roles?.includes('Administrator') || user?.permissions?.includes(perm) || false

  return (
    <AppLayout title="Início">
      <div className="space-y-6">
        {user && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Bem-vindo, {user.name}!</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {isAdmin ? 'Visão gerencial do sistema' : 'Seu painel pessoal'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {loading || authLoading
            ? Array.from({ length: isAdmin ? 5 : 7 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <Skeleton className="h-3 w-32 mb-3" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))
            : widgets.map((w, i) => (
                <WidgetCard key={i} label={w.label} value={w.value} icon={w.icon} loading={false} />
              ))
          }
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Ações Rápidas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {hasPermission('hours.create') && (
              <QuickAction href="/timesheets" label="Novo Apontamento" icon={<Plus size={16} />} />
            )}
            {hasPermission('expenses.create') && (
              <QuickAction href="/expenses" label="Nova Despesa" icon={<Plus size={16} />} />
            )}
            {hasPermission('projects.view') && (
              <QuickAction href="/projects" label="Ver Projetos" icon={<FolderOpen size={16} />} />
            )}
            {(hasPermission('hours.approve') || isAdmin) && (
              <QuickAction href="/approvals" label="Aprovações Pendentes" icon={<CheckSquare size={16} />} />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
