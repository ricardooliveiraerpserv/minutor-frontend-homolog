import type { ProjectStage } from '@/lib/types/project-stage'

export type HealthLevel = 'ok' | 'warn' | 'bad' | 'unknown'

export interface StageHealth {
  deadline: HealthLevel
  hours: HealthLevel
  delivery: HealthLevel
}

interface StageHealthInput {
  stage: ProjectStage
  /** Horas reais consumidas (de timesheets). Se omitido, dot horas fica 'unknown'. */
  hoursActual?: number
}

const DAY = 1000 * 60 * 60 * 24

export function computeStageHealth({ stage, hoursActual }: StageHealthInput): StageHealth {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let deadline: HealthLevel = 'unknown'
  if (stage.expected_end_date) {
    const end = new Date(stage.expected_end_date)
    end.setHours(0, 0, 0, 0)
    const daysLeft = Math.round((end.getTime() - today.getTime()) / DAY)
    if (daysLeft < 0 && stage.status !== 'done') deadline = 'bad'
    else if (daysLeft <= 7) deadline = 'warn'
    else deadline = 'ok'
  }

  const planned = Number(stage.hours_planned ?? 0)
  let hours: HealthLevel = 'unknown'
  if (planned > 0 && hoursActual !== undefined) {
    const ratio = hoursActual / planned
    if (ratio > 1.1) hours = 'bad'
    else if (ratio > 0.9) hours = 'warn'
    else hours = 'ok'
  }

  let delivery: HealthLevel = 'unknown'
  const total = stage.deliveries_count ?? 0
  if (total > 0) {
    const done = stage.deliveries_done_count ?? 0
    const ratio = done / total
    const consumedRatio = planned > 0 && hoursActual !== undefined
      ? hoursActual / planned
      : null

    if (consumedRatio !== null) {
      if (ratio >= consumedRatio) delivery = 'ok'
      else if (ratio >= consumedRatio - 0.1) delivery = 'warn'
      else delivery = 'bad'
    } else {
      delivery = 'ok'
    }
  }

  return { deadline, hours, delivery }
}
