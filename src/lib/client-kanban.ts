import { api } from '@/lib/api'

// ─── Tipos ──────────────────────────────────────────────────────────────────
export interface KLabel { id: number; name: string; color?: string | null }
export interface KUserRef { id: number; name: string }

export type KFieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'datetime' | 'select' | 'multiselect' | 'checkbox' | 'link_user'
export interface KField {
  id: number
  name: string
  type: KFieldType
  required: boolean
  show_on_front: boolean
  options: string[]
  default_value?: string | null
  position: number
}
/** Mapa field_id (string) → valor bruto (string; multiselect = JSON de array). */
export type KFieldValues = Record<string, string | null>

export const FIELD_TYPE_LABELS: Record<KFieldType, string> = {
  text: 'Texto curto', textarea: 'Texto longo', number: 'Número', money: 'Valor monetário',
  date: 'Data', datetime: 'Data e hora', select: 'Lista de seleção', multiselect: 'Seleção múltipla',
  checkbox: 'Sim/Não', link_user: 'Usuário',
}

export interface KCardSummary {
  id: number
  column_id: number
  title: string
  description?: boolean | string | null
  priority?: 'low' | 'medium' | 'high' | null
  start_date?: string | null
  due_date?: string | null
  position: number
  responsible?: KUserRef | null
  labels: KLabel[]
  checklist_total: number
  checklist_done: number
  comments_count: number
  field_values: KFieldValues
}

export interface KColumn {
  id: number
  name: string
  color?: string | null
  position: number
  cards: KCardSummary[]
}

export interface KBoardFull {
  id: number
  name: string
  description?: string | null
  color?: string | null
  labels: KLabel[]
  fields: KField[]
  columns: KColumn[]
}

export interface KBoardListItem {
  id: number
  name: string
  description?: string | null
  color?: string | null
  position: number
  columns_count: number
  cards_count: number
}

export interface KChecklistItem { id: number; text: string; is_done: boolean }
export interface KComment { id: number; body: string; created_at?: string | null; user?: KUserRef | null }
export interface KAttachment { id: number; name: string; mime?: string | null }

export interface KCardFull extends KCardSummary {
  description?: string | null
  members: KUserRef[]
  checklist: KChecklistItem[]
  comments: KComment[]
  attachments: KAttachment[]
}

export interface KCardEvent {
  id: number
  type: 'created' | 'moved' | 'updated' | 'comment' | 'deleted' | string
  card_title?: string | null
  from_column_id?: number | null
  to_column_id?: number | null
  at?: string | null
  user?: KUserRef | null
}

export interface KReport {
  totals: { cards: number; done: number; overdue: number; open: number }
  by_column: { column_id: number; name: string; color?: string | null; count: number }[]
  by_responsible: { user_id: number; name: string; count: number }[]
  avg_days_per_column: { column_id: number; avg_days: number }[]
}

// ─── API ──────────────────────────────────────────────────────────────────
const base = '/client/kanban'

export const kanbanApi = {
  boards: () => api.get<{ items: KBoardListItem[] }>(`${base}/boards`),
  createBoard: (body: { name: string; description?: string; color?: string }) => api.post<KBoardFull>(`${base}/boards`, body),
  board: (id: number) => api.get<KBoardFull>(`${base}/boards/${id}`),
  updateBoard: (id: number, body: Record<string, unknown>) => api.put<KBoardFull>(`${base}/boards/${id}`, body),
  deleteBoard: (id: number) => api.delete(`${base}/boards/${id}`),
  duplicateBoard: (id: number) => api.post<KBoardFull>(`${base}/boards/${id}/duplicate`, {}),

  addColumn: (boardId: number, body: { name: string; color?: string }) => api.post<KColumn>(`${base}/boards/${boardId}/columns`, body),
  updateColumn: (id: number, body: Record<string, unknown>) => api.put<KColumn>(`${base}/columns/${id}`, body),
  deleteColumn: (id: number) => api.delete(`${base}/columns/${id}`),
  reorderColumns: (boardId: number, order: number[]) => api.post(`${base}/boards/${boardId}/columns/reorder`, { order }),

  addLabel: (boardId: number, body: { name: string; color?: string }) => api.post<KLabel>(`${base}/boards/${boardId}/labels`, body),
  deleteLabel: (id: number) => api.delete(`${base}/labels/${id}`),

  addField: (boardId: number, body: Record<string, unknown>) => api.post<KField>(`${base}/boards/${boardId}/fields`, body),
  updateField: (id: number, body: Record<string, unknown>) => api.put<KField>(`${base}/fields/${id}`, body),
  deleteField: (id: number) => api.delete(`${base}/fields/${id}`),

  addCard: (columnId: number, body: Record<string, unknown>) => api.post<KCardFull>(`${base}/columns/${columnId}/cards`, body),
  card: (id: number) => api.get<KCardFull>(`${base}/cards/${id}`),
  updateCard: (id: number, body: Record<string, unknown>) => api.put<KCardFull>(`${base}/cards/${id}`, body),
  deleteCard: (id: number) => api.delete(`${base}/cards/${id}`),
  moveCard: (id: number, columnId: number, position: number) => api.post(`${base}/cards/${id}/move`, { column_id: columnId, position }),

  addChecklist: (cardId: number, text: string) => api.post<KChecklistItem>(`${base}/cards/${cardId}/checklist`, { text }),
  updateChecklist: (id: number, body: Record<string, unknown>) => api.put<KChecklistItem>(`${base}/checklist/${id}`, body),
  deleteChecklist: (id: number) => api.delete(`${base}/checklist/${id}`),

  addComment: (cardId: number, body: string) => api.post<KComment>(`${base}/cards/${cardId}/comments`, { body }),
  deleteComment: (id: number) => api.delete(`${base}/comments/${id}`),

  assignableUsers: () => api.get<{ items: KUserRef[] }>(`${base}/assignable-users`),

  cardHistory: (id: number) => api.get<{ items: KCardEvent[] }>(`${base}/cards/${id}/history`),
  boardMembers: (boardId: number) => api.get<{ user_ids: number[] }>(`${base}/boards/${boardId}/members`),
  setBoardMembers: (boardId: number, userIds: number[]) => api.put<{ user_ids: number[] }>(`${base}/boards/${boardId}/members`, { user_ids: userIds }),
  report: (boardId: number) => api.get<KReport>(`${base}/boards/${boardId}/report`),
}

export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: '#94a3b8' },
  medium: { label: 'Média', color: '#f59e0b' },
  high: { label: 'Alta', color: '#ef4444' },
}
