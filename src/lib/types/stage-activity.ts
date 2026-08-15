export type StageActivityType =
  | 'delivery_moved'
  | 'delivery_created'
  | 'delivery_completed'
  | 'hours_logged'
  | 'aporte_created'
  | 'block_set'
  | 'block_cleared'
  | 'comment'
  | 'client_involved'
  | 'client_removed'
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'

export interface StageActivityActor {
  id: number
  name: string
  email?: string
}

export interface StageActivityEvent {
  id: number
  stage_id: number
  actor_user_id: number | null
  actor?: StageActivityActor | null
  type: StageActivityType
  payload: Record<string, unknown> | null
  /** Público da mensagem: subconjunto de ['cliente','consultor']. Vazio = só admin/coord. */
  audiences?: string[] | null
  created_at: string
  attachment_path?: string | null
  attachment_original_name?: string | null
  attachment_mime?: string | null
  attachment_size?: number | null
}

export interface StageActivityResponse {
  items: StageActivityEvent[]
}
