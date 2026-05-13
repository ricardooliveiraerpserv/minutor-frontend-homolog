'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApiQuery } from '@/hooks/use-query'
import { useStageDeliveries } from '@/hooks/use-stage-deliveries'
import { StageKanbanBoard } from '@/components/projects/stage-kanban-board'
import type { ProjectStage } from '@/lib/types/project-stage'

export default function StageKanbanPage() {
  const params = useParams<{ id: string; stageId: string }>()
  const projectId = Number(params.id)
  const stageId = Number(params.stageId)

  const { data: stage, loading: stageLoading } = useApiQuery<ProjectStage>(
    Number.isFinite(stageId) ? `/stages/${stageId}` : null
  )

  const { deliveries, loading, error, refetch } = useStageDeliveries(stageId)

  if (stageLoading || !stage) {
    return <div style={{ color: 'var(--text-muted)' }}>Carregando etapa…</div>
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 16,
      }}>
        <Link
          href={`/projetos/${projectId}/etapas`}
          aria-label="Voltar"
          style={{
            display: 'inline-flex', alignItems: 'center',
            color: 'var(--text-muted)', textDecoration: 'none',
            fontSize: 13,
          }}
        >
          <ChevronLeft size={16} />
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
            {stage.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {stage.responsible?.name ?? 'Sem responsável'}
            {Number(stage.hours_planned) > 0 && <span> · {Number(stage.hours_planned)}h previstas</span>}
          </div>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Carregando entregas…</div>
      ) : (
        <StageKanbanBoard stageId={stageId} deliveries={deliveries} onChanged={refetch} />
      )}
    </div>
  )
}
