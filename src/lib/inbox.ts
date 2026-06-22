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
  metadata?: Record<string, unknown>,
): Promise<{ data: InboxMessage }> {
  return api.post(`/inbox/conversations/${conversationId}/messages`, { body, metadata })
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
