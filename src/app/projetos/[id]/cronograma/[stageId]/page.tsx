'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useProjectStages } from '@/hooks/use-project-stages'
import { StageOperationalBlock } from '@/components/projects/stage-operational-block'
import { buildCronogramaCodes } from '@/lib/cronograma-numbering'

/**
 * Drill da etapa — kanban das atividades + equipe alocada + aportes.
 * Acessada via card no Board do Cronograma (/projetos/[id]/cronograma).
 */
export default function StageDetailPage() {
  const params = useParams<{ id: string; stageId: string }>()
  const projectId = Number(params.id)
  const stageId = Number(params.stageId)
  const { user } = useAuth()
  const canEdit = user?.type !== 'consultor'

  const { stages, loading, refetch } = useProjectStages(projectId)
  const stage = stages.find(s => s.id === stageId)
  const codes = buildCronogramaCodes(stages as any)

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  }

  if (!stage) {
    return (
      <div style={{ padding: 24 }}>
        <Link
          href={`/projetos/${projectId}/cronograma`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none',
          }}
        >
          <ChevronLeft size={14} /> Voltar ao Cronograma
        </Link>
        <div style={{ marginTop: 16, color: 'var(--danger)' }}>Etapa não encontrada.</div>
      </div>
    )
  }

  return (
    <div>
      <Link
        href={`/projetos/${projectId}/cronograma`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        <ChevronLeft size={14} /> Voltar ao Cronograma
      </Link>

      <StageOperationalBlock
        stage={stage}
        projectId={projectId}
        canEdit={canEdit}
        onChanged={refetch}
        stageCode={codes.stageCode(stage.id)}
      />
    </div>
  )
}
