import { useCallback } from 'react'
import { api } from '@/lib/api'

export interface PreviewAffected {
  id: number
  title: string
  current_start: string | null
  current_end: string | null
  suggested_start: string | null
  suggested_end: string | null
  hours_planned?: number
  duration_old?: number
  duration_new?: number
}

export interface PreviewAffectedStage {
  stage_id: number
  name: string
  current_start: string | null
  current_end: string | null
  new_start: string | null
  new_end: string | null
  days_diff: number
}

export interface PreviewResult {
  summary: {
    change_description: string
    trigger_label: string
    /** Resumo executivo estruturado (Fase 10.1+). */
    item_title?: string | null
    item_kind?: 'atividade' | 'etapa' | null
    field_label?: string | null
    old_value?: string | null
    new_value?: string | null
  }
  impact: {
    affected_deliveries_count: number
    affected_stages_count: number
    project_end_current: string | null
    project_end_new: string | null
    days_diff: number
    has_conflicts: boolean
  }
  affected: PreviewAffected[]
  affected_stages?: PreviewAffectedStage[]
  conflicts: string[]
}

export type RecalcTrigger =
  | {
      type: 'delivery_field'
      deliveryId: number
      simulate: Partial<{
        planned_start_at: string | null
        due_date: string | null
        hours_planned: number
        depends_on_delivery_id: number | null
      }>
    }
  | {
      type: 'stage_field'
      stageId: number
      simulate: Partial<{
        stage_start_at: string | null
        expected_end_date: string | null
        hours_planned: number
      }>
    }
  | {
      type: 'project_calendar'
      simulate: Partial<{
        allow_weekend_work: boolean
        allow_holiday_work: boolean
      }>
    }

/**
 * Hook que invoca o preview-endpoint do Cronograma (Fase 10.1).
 * Não persiste — só devolve impacto. Frontend decide se abre modal de confirmação
 * ou se aplica direto (mudança trivial sem impacto).
 */
export function usePreviewRecalc(projectId: number) {
  return useCallback(
    (trigger: RecalcTrigger): Promise<PreviewResult> => {
      const body =
        trigger.type === 'delivery_field'
          ? { trigger: 'delivery_field', delivery_id: trigger.deliveryId, simulate: trigger.simulate }
          : trigger.type === 'stage_field'
          ? { trigger: 'stage_field', stage_id: trigger.stageId, simulate: trigger.simulate }
          : { trigger: 'project_calendar', simulate: trigger.simulate }
      return api.post<PreviewResult>(`/projects/${projectId}/cronograma/recalc-preview`, body)
    },
    [projectId],
  )
}

/** Decide se vale abrir o modal: só vale se há propagação real. */
export function hasMeaningfulImpact(p: PreviewResult): boolean {
  return p.impact.affected_deliveries_count > 0 || p.impact.days_diff !== 0
}
