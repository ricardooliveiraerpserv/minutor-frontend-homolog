export type FollowUpStatus = 'pending' | 'in_progress' | 'waiting_third' | 'completed' | 'cancelled'
export type FollowUpWaiting = 'client' | 'partner' | 'supplier' | 'approval'
export type FollowUpPriority = 'baixa' | 'media' | 'alta' | 'critica'
export type FollowUpCategory =
  | 'reuniao' | 'projeto' | 'cliente' | 'aprovacao' | 'homologacao'
  | 'financeiro' | 'comercial' | 'juridico' | 'suporte' | 'outro'

export interface UserMini { id: number; name: string; email?: string | null }

export interface FollowUp {
  id: number
  title: string
  description: string | null
  status: FollowUpStatus
  status_display: string
  waiting_subtype: FollowUpWaiting | null
  category: FollowUpCategory
  priority: FollowUpPriority
  due_date: string | null
  is_overdue: boolean
  days_overdue: number | null
  responsible_user_id: number | null
  requester_user_id: number | null
  client_involved: boolean
  client_user_id: number | null
  client_email: string | null
  customer_id: number | null
  contract_id: number | null
  project_id: number | null
  stage_id: number | null
  delivery_id: number | null
  kanban_order: number
  completed_at: string | null
  created_at: string
  responsible?: UserMini | null
  requester?: UserMini | null
  client?: UserMini | null
  createdBy?: UserMini | null
  customer?: { id: number; name: string } | null
  project?: { id: number; name: string; code?: string | null } | null
  stage?: { id: number; name: string } | null
  delivery?: { id: number; title: string } | null
}

export interface FollowUpEvent {
  id: number
  follow_up_id: number
  actor_user_id: number | null
  actor?: UserMini | null
  type: 'created' | 'status_changed' | 'reassigned' | 'deadline_changed' | 'comment'
      | 'concluded' | 'reopened' | 'waiting_set' | 'waiting_cleared'
  payload: Record<string, unknown> | null
  attachment_path?: string | null
  attachment_original_name?: string | null
  attachment_mime?: string | null
  attachment_size?: number | null
  created_at: string
}

// Revisão conceitual: Acompanhamento só tem Aberto/Concluído (sem workflow complexo).
// Status legados (in_progress/waiting_third) são exibidos como "Aberto".
export const FU_STATUS_LABEL: Record<FollowUpStatus, string> = {
  pending: 'Aberto', in_progress: 'Aberto', waiting_third: 'Aberto',
  completed: 'Concluído', cancelled: 'Cancelado',
}
export const FU_PRIORITY_LABEL: Record<FollowUpPriority, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
}
export const FU_CATEGORY_LABEL: Record<FollowUpCategory, string> = {
  reuniao: 'Reunião', projeto: 'Projeto', cliente: 'Cliente', aprovacao: 'Aprovação',
  homologacao: 'Homologação', financeiro: 'Financeiro', comercial: 'Comercial',
  juridico: 'Jurídico', suporte: 'Suporte', outro: 'Outro',
}

/** Kanban gerencial: só Aberto/Concluído (sem workflow paralelo à atividade). */
export const FU_KANBAN_COLUMNS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Aberto' },
  { key: 'completed', label: 'Concluído' },
]

/** Mapeia um follow-up para a coluna do kanban (aberto vs concluído). */
export function fuColumnOf(f: FollowUp): string {
  return f.status === 'completed' ? 'completed' : 'pending'
}
