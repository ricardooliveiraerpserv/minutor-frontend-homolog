import { api } from './api'
import type {
  ChatUser,
  ConversationDetail,
  ConversationSummary,
  InboxMessage,
  NotificationStatusValue,
  PaginatedMessages,
  PresenceEntry,
  PresenceStatusValue,
  UnreadSummary,
} from '@/types/inbox'

export function listConversations(): Promise<{ data: ConversationSummary[] }> {
  return api.get('/inbox/conversations')
}

export function listMessages(conversationId: number, perPage = 50): Promise<PaginatedMessages> {
  return api.get(`/inbox/conversations/${conversationId}/messages?per_page=${perPage}`)
}

export function sendMessage(
  conversationId: number,
  body: string,
  opts?: { metadata?: Record<string, unknown>; files?: File[]; replyToId?: number },
): Promise<{ data: InboxMessage }> {
  const files = opts?.files ?? []
  if (files.length === 0) {
    return api.post(`/inbox/conversations/${conversationId}/messages`, {
      body,
      metadata: opts?.metadata,
      reply_to_id: opts?.replyToId ?? null,
    })
  }
  // Multipart: corpo opcional, arquivos[] obrigatório
  const fd = new FormData()
  if (body) fd.append('body', body)
  if (opts?.metadata) fd.append('metadata', JSON.stringify(opts.metadata))
  if (opts?.replyToId) fd.append('reply_to_id', String(opts.replyToId))
  files.forEach(f => fd.append('files[]', f))
  return api.post(`/inbox/conversations/${conversationId}/messages`, fd)
}

export function markRead(conversationId: number): Promise<{ marked_read: boolean }> {
  return api.post(`/inbox/conversations/${conversationId}/read`, {})
}

export function editMessage(messageId: number, body: string): Promise<{ data: InboxMessage }> {
  return api.patch(`/inbox/messages/${messageId}`, { body })
}

export function deleteMessage(messageId: number): Promise<{ data: { id: number; deleted: boolean } }> {
  return api.delete(`/inbox/messages/${messageId}`)
}

export function toggleReaction(messageId: number, emoji: string): Promise<{ action: 'added'|'removed'; reactions: import('@/types/inbox').ReactionGroup[] }> {
  return api.post(`/inbox/messages/${messageId}/reactions`, { emoji })
}

export function togglePin(messageId: number): Promise<{ action: 'pinned'|'unpinned'; message_id: number }> {
  return api.post(`/inbox/messages/${messageId}/pin`, {})
}

export function listPinned(conversationId: number): Promise<{ data: InboxMessage[] }> {
  return api.get(`/inbox/conversations/${conversationId}/pinned`)
}

export function muteConversation(conversationId: number, hours: number | null): Promise<{ muted_until: string | null }> {
  return api.post(`/inbox/conversations/${conversationId}/mute`, { hours })
}

export function getReadStatus(conversationId: number): Promise<{ data: { user_id: number; name: string; last_read_at: string | null }[] }> {
  return api.get(`/inbox/conversations/${conversationId}/read-status`)
}

export function toggleFavorite(messageId: number): Promise<{ action: 'added'|'removed'; is_favorite: boolean }> {
  return api.post(`/inbox/messages/${messageId}/favorite`, {})
}

export function listFavorites(): Promise<{ data: InboxMessage[] }> {
  return api.get('/inbox/favorites')
}

export function exportConversationUrl(conversationId: number, format: 'txt' | 'json'): string {
  return `/api/v1/inbox/conversations/${conversationId}/export?format=${format}`
}

export function sendTyping(conversationId: number): Promise<{ ok: boolean }> {
  return api.post(`/inbox/conversations/${conversationId}/typing`, {})
}

export function listTyping(conversationId: number): Promise<{ data: { user_id: number; name: string }[] }> {
  return api.get(`/inbox/conversations/${conversationId}/typing`)
}

export interface SearchHit {
  id: number
  snippet: string
  sender: { id: number; name: string } | null
  created_at: string | null
  conversation: { id: number; type: string; title: string | null } | null
}

export function searchMessagesGlobal(q: string, limit = 50): Promise<{ data: SearchHit[]; query: string; count: number }> {
  return api.get(`/inbox/search?q=${encodeURIComponent(q)}&limit=${limit}`)
}

export function updateMessageStatus(
  messageId: number,
  status: NotificationStatusValue,
  snoozed_until?: string,
): Promise<{ data: { id: number; status: NotificationStatusValue; snoozed_until: string | null } }> {
  return api.patch(`/inbox/messages/${messageId}/status`, snoozed_until ? { status, snoozed_until } : { status })
}

export function unreadSummary(): Promise<UnreadSummary> {
  return api.get('/inbox/unread-summary')
}

export function presenceHeartbeat(status?: PresenceStatusValue): Promise<PresenceEntry> {
  return api.post('/presence/heartbeat', status ? { status } : {})
}

export function listPresence(userIds?: number[]): Promise<{ data: PresenceEntry[] }> {
  const q = userIds && userIds.length ? `?user_ids=${userIds.join(',')}` : ''
  return api.get(`/presence${q}`)
}

// --- Chat humano ---

export function listChatUsers(q?: string): Promise<{ data: ChatUser[] }> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  return api.get(`/conversations/users${qs}`)
}

export function createDirectConversation(userId: number): Promise<{ data: ConversationDetail }> {
  return api.post('/conversations', { type: 'direct', user_id: userId })
}

export function createGroupConversation(name: string, participantIds: number[]): Promise<{ data: ConversationDetail }> {
  return api.post('/conversations', { type: 'group', name, participant_ids: participantIds })
}

export function addParticipant(conversationId: number, userId: number): Promise<{ data: ConversationDetail }> {
  return api.post(`/conversations/${conversationId}/participants`, { user_id: userId })
}

export function removeParticipant(conversationId: number, userId: number): Promise<{ removed: boolean }> {
  return api.delete(`/conversations/${conversationId}/participants/${userId}`)
}

export function botQuery(
  conversationId: number,
  question: string,
): Promise<{ user_message: InboxMessage; bot_message: InboxMessage; tools_called: string[] }> {
  return api.post(`/conversations/${conversationId}/bot-query`, { question })
}
