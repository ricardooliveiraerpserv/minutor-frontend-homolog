'use client'

import { useParams } from 'next/navigation'
import { useApiQuery } from '@/hooks/use-query'

interface ProjectFull {
  id: number
  name: string
  code: string | null
  description: string | null
  start_date: string | null
  expected_end_date: string | null
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
    return <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  }

  const team = [
    ...(project.coordinators ?? []).map(u => ({ ...u, role: 'Coordenador' as const })),
    ...(project.consultants ?? []).map(u => ({ ...u, role: 'Consultor' as const })),
  ]

  return (
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

      <Block title="Equipe">
        {team.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Sem alocações.</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {team.map(u => (
              <li key={`${u.role}-${u.id}`} style={{ marginBottom: 2 }}>
                {u.name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>· {u.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  )
}
