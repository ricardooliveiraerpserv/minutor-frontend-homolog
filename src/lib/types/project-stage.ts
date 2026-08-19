export type StageStatus = 'active' | 'paused' | 'done'

export type DeliveryStatus =
  | 'backlog'
  | 'in_progress'
  | 'waiting_client'
  | 'review'
  | 'done'

export type DeliveryPriority = 'low' | 'medium' | 'high'

export interface UserMini {
  id: number
  name: string
  email?: string | null
  profile_photo_url?: string | null
}

export type StageDerivedStatus =
  | 'planejamento'
  | 'execucao'
  | 'homologacao'
  | 'bloqueada'
  | 'concluida'

export interface ProjectStage {
  id: number
  project_id: number
  name: string
  responsible_user_id: number | null
  responsible?: UserMini | null
  hours_planned: string | number
  status: StageStatus
  order_index: number
  expected_end_date: string | null
  stage_start_at?: string | null
  deliveries_count?: number
  deliveries_done_count?: number
  deliveries_in_progress_count?: number
  deliveries_waiting_client_count?: number
  deliveries_review_count?: number
  deliveries_hours_planned_sum?: string | number | null
  progress_pct?: number
  derived_status?: StageDerivedStatus
  team_overrun_count?: number
  last_activity_at?: string | null
  days_since_activity?: number | null
  blocked_reason?: string | null
  aportes_hours_sum?: number | string | null
  actual_hours?: number
  risk_level?: 'low' | 'medium' | 'high'
  risk_reasons?: string[]
  created_at: string
  updated_at: string
}

export interface StageDelivery {
  id: number
  stage_id: number
  title: string
  description: string | null
  responsible_user_id: number | null
  responsible?: UserMini | null
  hours_planned: string | number
  priority: DeliveryPriority
  status: DeliveryStatus
  due_date: string | null
  order_index: number
  completed_at: string | null
  effort_minutes_sum?: number | null
  created_at: string
  updated_at: string
}

export type DeliveryEventType =
  | 'created'
  | 'status_changed'
  | 'reassigned'
  | 'completed'
  | 'hours_logged'
  | 'hours_edited'

export interface DeliveryEvent {
  id: number
  delivery_id: number
  actor_user_id: number | null
  actor?: UserMini | null
  type: DeliveryEventType
  payload: Record<string, unknown> | null
  created_at: string
}

/**
 * Lifecycle real do projeto (espelha App\Models\Project::STATUS_*).
 * Toda projeção visual deriva daqui — ver projectWorkflow.ts e ADR 0002 do backend.
 */
export type ProjectStatus =
  | 'awaiting_start'
  | 'backlog'
  | 'started'
  | 'liberado_para_testes'
  | 'finished'
  | 'paused'
  | 'cancelled'

/**
 * Colunas do Kanban Operacional /projetos/kanban.
 * `awaiting_start` é pré-kanban (sem coord ainda) — não aparece em coluna.
 */
export const OPERATIONAL_COLUMNS = [
  'backlog',
  'execution',
  'homologation',
  'closed',
  'paused',
  'cancelled',
] as const

export type OperationalColumn = (typeof OPERATIONAL_COLUMNS)[number]
