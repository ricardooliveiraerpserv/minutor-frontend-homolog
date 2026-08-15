'use client'

import { ProjectScheduleGantt } from '@/components/projects/project-schedule-gantt'
import { ProjectScheduleCapacity } from '@/components/projects/project-schedule-capacity'
import type { ScheduleStage, ProjectWindow } from '@/hooks/use-project-schedule'

interface Props {
  stages: ScheduleStage[]
  projectWindow: ProjectWindow | null
  canEdit: boolean
  highlightUserId: number | null
  onSelectUser: (id: number | null) => void
  onChanged: () => void
}

export function TimelineView({ stages, projectWindow, canEdit, highlightUserId, onSelectUser, onChanged }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ProjectScheduleGantt
        stages={stages}
        projectWindow={projectWindow}
        canEdit={canEdit}
        onChanged={onChanged}
        highlightUserId={highlightUserId}
      />
      <ProjectScheduleCapacity
        stages={stages}
        selectedUserId={highlightUserId}
        onSelectUser={onSelectUser}
      />
    </div>
  )
}
