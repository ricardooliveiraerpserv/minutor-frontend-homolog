'use client'

import { ProjectActivityKanban } from '@/components/projects/project-activity-kanban'
import type { ScheduleStage } from '@/hooks/use-project-schedule'

interface Props {
  projectId: number
  stages: ScheduleStage[]
  onChanged?: () => void
  canEdit?: boolean
}

export function OperacaoView({ projectId, stages, onChanged, canEdit = true }: Props) {
  if (stages.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        color: 'var(--text-muted)',
        border: '1px dashed var(--border)', borderRadius: 8,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>Nenhuma etapa ainda</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          Crie a primeira frente do projeto (ex: Fiscal, Compras, Integrações).
        </div>
      </div>
    )
  }
  return <ProjectActivityKanban projectId={projectId} stages={stages} onChanged={onChanged ?? (() => {})} canEdit={canEdit} />
}
