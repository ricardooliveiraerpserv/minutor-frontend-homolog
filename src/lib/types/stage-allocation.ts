export type AllocationHealth = 'ok' | 'atencao' | 'estourado' | 'unknown'

export interface AllocationUser {
  id: number
  name: string
  email: string
}

export interface StageAllocationItem {
  id: number
  stage_id: number
  delivery_id?: number | null
  user_id: number
  user: AllocationUser | null
  planned_hours: number
  actual_hours: number
  remaining_hours: number
  health: AllocationHealth
  /** Janela de alocação parcial (opcional). */
  allocation_start_at?: string | null
  allocation_end_at?: string | null
  /** Owner principal da atividade. Único por delivery; espelha responsible_user_id. */
  is_primary?: boolean
}

export interface StageAllocationTotals {
  planned_hours: number
  actual_hours: number
  remaining_hours: number
  overrun_count: number
}

export interface StageAllocationsResponse {
  items: StageAllocationItem[]
  totals: StageAllocationTotals
}
