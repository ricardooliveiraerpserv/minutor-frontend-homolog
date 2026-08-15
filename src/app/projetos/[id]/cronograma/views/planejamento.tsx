'use client'

import { ProjectScheduleTable } from '@/components/projects/project-schedule-table'
import type { ScheduleStage, ProjectCoordinator } from '@/hooks/use-project-schedule'

interface Props {
  projectId: number
  stages: ScheduleStage[]
  coordinators: ProjectCoordinator[]
  canEdit: boolean
  holidays?: { date: string; name: string }[]
  calendarOpts?: { allowWeekend?: boolean; allowHoliday?: boolean }
  onChanged: () => void
}

export function PlanejamentoView({ projectId, stages, coordinators, canEdit, holidays, calendarOpts, onChanged }: Props) {
  return (
    <ProjectScheduleTable
      projectId={projectId}
      stages={stages}
      coordinators={coordinators}
      canEdit={canEdit}
      onChanged={onChanged}
      holidays={holidays}
      calendarOpts={calendarOpts}
    />
  )
}
