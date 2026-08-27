import { api } from '@/lib/api'

// ─── Tipos ──────────────────────────────────────────────────────────────────
export interface KLabel { id: number; name: string; color?: string | null }
export interface KUserRef { id: number; name: string }

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
  checklist: KChecklistItem[]
  comments: KComment[]
  attachments: KAttachment[]
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
}

export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: '#94a3b8' },
  medium: { label: 'Média', color: '#f59e0b' },
  high: { label: 'Alta', color: '#ef4444' },
}
