'use client'

import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { ProjectHeaderExecutive } from '@/components/projects/project-header-executive'
import { ProjectTabs } from '@/components/projects/project-tabs'
import { useApiQuery } from '@/hooks/use-query'

interface ProjectResponse {
  id: number
  name: string
  code: string | null
  status: string
  status_display?: string
  customer?: { id: number; name: string } | null
  sold_hours?: number | string | null
  consumed_hours?: number | string | null
  general_hours_balance?: number | string | null
  expected_end_date?: string | null
  kanban_stage?: string | null
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)

  const { data: project, loading, error } = useApiQuery<ProjectResponse>(
    Number.isFinite(id) ? `/projects/${id}` : null
  )

  if (loading) {
    return (
      <AppLayout>
        <div style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando…</div>
      </AppLayout>
    )
  }

  if (error || !project) {
    return (
      <AppLayout>
        <div style={{ padding: 32, color: 'var(--danger)' }}>
          {error ?? 'Projeto não encontrado'}
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <ProjectHeaderExecutive project={project} />
        <div style={{ padding: '0 24px', background: 'var(--brand-bg)' }}>
          <ProjectTabs projectId={project.id} />
        </div>
        <div style={{ flex: 1, padding: 24, background: 'var(--bg)' }}>
          {children}
        </div>
      </div>
    </AppLayout>
  )
}
