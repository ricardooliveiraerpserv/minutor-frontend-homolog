'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { ProjectHeaderExecutive } from '@/components/projects/project-header-executive'
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
  is_operational?: boolean
}

const BACK_MAP: Record<string, { href: string; label: string }> = {
  pipeline:       { href: '/contratos/pipeline', label: 'Demandas e Projetos' },
  gestao:         { href: '/gestao-projetos',    label: 'Gestão de Projetos' },
  'meus-projetos': { href: '/meus-projetos',     label: 'Meus Projetos' },
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const id = Number(params.id)
  const from = searchParams.get('from') ?? 'pipeline'
  const back = BACK_MAP[from] ?? BACK_MAP.pipeline

  const { data: project, loading, error, refetch } = useApiQuery<ProjectResponse>(
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
        <div style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}>
          <Link
            href={back.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none',
            }}
          >
            <ChevronLeft size={14} /> Voltar para {back.label}
          </Link>
        </div>
        <ProjectHeaderExecutive project={project} onProjectChange={refetch} />
        <div style={{ padding: '0 24px', background: 'var(--bg)' }}>
          <ProjectTabs projectId={project.id} isOperational={project.is_operational !== false} />
        </div>
        <div style={{ flex: 1, padding: 24, background: 'var(--bg)' }}>
          {children}
        </div>
      </div>
    </AppLayout>
  )
}
