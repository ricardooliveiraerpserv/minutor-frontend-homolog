'use client'

import { useApiQuery } from './use-query'
import type { ProjectStage, StageDelivery } from '@/lib/types/project-stage'

export interface ScheduleStage extends ProjectStage {
  deliveries: StageDelivery[]
  /** Horas "efetivas" da etapa: hours_planned se preenchido, senão a soma das atividades. */
  effective_hours_planned?: number | string | null
  /** Sub-etapas: id da etapa-mãe (null = etapa de topo). */
  parent_stage_id?: number | null
  /** Agregado de Acompanhamentos da etapa (inclui os das atividades). */
  followups?: { count: number; overdue: number; waiting_client: number; done?: number }
}

export interface ProjectWindow {
  start: string | null
  end: string | null
}

export interface ProjectCoordinator {
  id: number
  name: string
  email: string | null
}

export interface ScheduleResponse {
  is_operational: boolean
  project_window: ProjectWindow | null
  /** Feriados ativos do cadastro (data + nome). Usado pelo date picker + BusinessCalendar. */
  holidays?: { date: string; name: string }[]
  project: {
    id: number
    name: string
    sold_hours: number
    coordination_hours?: number | string | null
    start_date: string | null
    expected_end_date: string | null
    /** Fase 7: calendário operacional flexível (sábado/feriado como dias úteis). */
    allow_weekend_work?: boolean
    allow_holiday_work?: boolean
    coordinators?: ProjectCoordinator[]
  } | null
  /** Fase 10: resumo executivo agregado do cronograma. */
  executive?: ExecutiveSummary
  /** Fase 10: alertas operacionais leves. */
  alerts?: CronogramaAlert[]
  /** Fase 10: ocupação por consultor envolvido no cronograma. */
  team_load?: TeamLoadItem[]
  /** Etapas do cronograma (árvore plana com parent_stage_id). */
  stages: ScheduleStage[]
}

export interface ExecutiveSummary {
  progress_pct: number
  total_deliveries: number
  done_deliveries: number
  /** Progresso por horas: % das horas planejadas já concluídas + horas concluídas. */
  progress_hours_pct?: number
  hours_done?: number
  in_progress_count: number
  review_count: number
  blocked_count: number
  waiting_client_count: number
  overdue_count: number
  hours_planned: number
  hours_actual: number
  hours_consumed?: number
  hours_balance: number
  hours_available: number
  overall_risk: 'low' | 'medium' | 'high'
  high_risk_stages: number
  medium_risk_stages: number
  estimated_delay_days: number
  /** Fase 10.1: card "Prazo Final" no header executivo. */
  estimated_end_date?: string | null
  planned_end_date?: string | null
  /** Positivo = projeto vai atrasar vs prazo planejado. */
  end_date_delta_days?: number | null
}

export interface CronogramaAlert {
  severity: 'warning' | 'danger'
  type: 'stale_activity' | 'overdue' | 'waiting_client_stale' | 'no_responsible' | 'stage_high_risk'
  message: string
  delivery_id?: number
  stage_id?: number
  title?: string
}

export interface TeamLoadItem {
  user: { id: number; name: string; profile_photo_url?: string | null }
  capacity_hours: number
  planned_hours: number
  actual_hours: number
  remaining_hours: number
  usage_pct: number
  overloaded: boolean
}

export function useProjectSchedule(projectId: number | null | undefined) {
  const path = projectId ? `/projects/${projectId}/schedule` : null
  const { data, loading, error, refetch } = useApiQuery<ScheduleResponse>(path)
  return {
    isOperational: data?.is_operational ?? true,
    projectWindow: data?.project_window ?? null,
    project: data?.project ?? null,
    stages: data?.stages ?? [],
    holidays: data?.holidays ?? [],
    executive: data?.executive ?? null,
    alerts: data?.alerts ?? [],
    teamLoad: data?.team_load ?? [],
    loading,
    error,
    refetch,
  }
}
