'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { TasksCard } from '@/components/notifications/tasks-card'
import { ListChecks } from 'lucide-react'

export default function TarefasPage() {
  const router = useRouter()
  const { user } = useAuth()
  useEffect(() => { if (user?.type === 'cliente') router.replace('/dashboard') }, [user?.type, router])
  return (
    <AppLayout title="Tarefas">
      <div className="max-w-4xl space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Tarefas</h1>
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>· suas, delegadas e rotinas</span>
        </div>
        <TasksCard />
      </div>
    </AppLayout>
  )
}
