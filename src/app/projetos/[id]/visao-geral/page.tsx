'use client'

import { useParams } from 'next/navigation'
import { useApiQuery } from '@/hooks/use-query'
import { ProjectConsolidatedTeam } from '@/components/projects/project-consolidated-team'
import { Skeleton } from '@/components/ui/loading'

interface ProjectFull {
  id: number
  name: string
  code: string | null
  description: string | null
  start_date: string | null
  expected_end_date: string | null
  is_operational?: boolean
  customer?: { id: number; name: string } | null
  consultants?: { id: number; name: string }[]
  coordinators?: { id: number; name: string }[]
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ds-card ds-card-pad">
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{children}</div>
    </div>
  )
}

export default function VisaoGeralPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const { data: project, loading } = useApiQuery<ProjectFull>(
    Number.isFinite(id) ? `/projects/${id}` : null
  )

  if (loading || !project) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ds-card ds-card-pad">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Coordenador efetivo: override do Kanban de Contratos vence sobre a lista M2M.
  const effCoordinators = (project as any).kanban_override_coordinator
    ? [(project as any).kanban_override_coordinator]
    : (project.coordinators ?? [])
  const team = [
    ...effCoordinators.map((u: any) => ({ ...u, role: 'Coordenador' as const })),
    ...(project.consultants ?? []).map(u => ({ ...u, role: 'Consultor' as const })),
  ]

  const isOperational = project.is_operational !== false
  // Em projeto operacional: equipe vem das etapas (consolidated). Em sustentação:
  // equipe direta do projeto (project_consultants) ainda é válida.
  const directTeam = isOperational ? effCoordinators.map((u: any) => ({ ...u, role: 'Coordenador' as const })) : team

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12,
      }}>
        <Block title="Descrição">
          {project.description?.trim() || <span style={{ color: 'var(--text-muted)' }}>Sem descrição.</span>}
        </Block>

        <Block title="Período">
          Início: {fmtDate(project.start_date)}<br />
          Previsto: {fmtDate(project.expected_end_date)}
        </Block>

        <Block title="Cliente">
          {project.customer?.name ?? '—'}
        </Block>

        <Block title={isOperational ? 'Coordenação' : 'Equipe'}>
          {directTeam.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>
              {isOperational ? 'Sem coordenador.' : 'Sem alocações.'}
            </span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {directTeam.map(u => (
                <li key={`${u.role}-${u.id}`} style={{ marginBottom: 2 }}>
                  {u.name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>· {u.role}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      {isOperational && (
        <div className="ds-card ds-card-pad">
          <ProjectConsolidatedTeam projectId={id} />
        </div>
      )}
    </div>
  )
}
