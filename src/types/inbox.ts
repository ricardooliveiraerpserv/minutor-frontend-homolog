export type ConversationTypeValue = 'direct' | 'group' | 'bot'

export type MessageTypeValue = 'user' | 'system' | 'bot' | 'ai_insight' | 'alert'

export type PresenceStatusValue = 'online' | 'away' | 'offline'

export type NotificationStatusValue = 'unread' | 'read' | 'resolved' | 'archived' | 'snoozed'

export type SeverityValue = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface SeverityBreakdown {
  critical: number
  high: number
  medium: number
  low: number
  info: number
  total: number
}

export interface ConversationSummary {
  id: number
  type: ConversationTypeValue
  title: string
  customer?: { id: number; name: string } | null
  other_user?: { id: number; name: string; profile_photo?: string | null } | null
  participants_count?: number
  last_message?: {
    id: number
    type: MessageTypeValue
    severity?: SeverityValue | null
    preview: string
    created_at: string
  } | null
  unread_count: number
  unread_by_severity: SeverityBreakdown
  last_message_at: string | null
  muted_until?: string | null
}

export interface ChatUser {
  id: number
  name: string
  email: string
  profile_photo?: string | null
  presence: {
    status: PresenceStatusValue
    last_seen_at?: string | null
  }
}

export interface ConversationDetail {
  id: number
  type: ConversationTypeValue
  title: string | null
  created_by: number | null
  last_message_at: string | null
  participants: Array<{
    user_id: number
    role: 'member' | 'admin'
    user: { id: number; name: string; profile_photo?: string | null } | null
  }>
}

export interface InboxMessage {
  id: number
  conversation_id: number
  type: { value: MessageTypeValue; label: string }
  sender?: {
    id: number
    name: string
    profile_photo_url?: string | null
  } | null
  body: string
  metadata?: Record<string, unknown> | null
  reply_to_id?: number | null
  status: NotificationStatusValue
  snoozed_until?: string | null
  resolved_at?: string | null
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
  attachments?: MessageAttachment[]
  reply_to?: ReplyToSummary | null
  reactions?: ReactionGroup[]
  pinned_at?: string | null
  pinned_by?: number | null
  is_favorite?: boolean
}

export interface ReactionGroup {
  emoji: string
  count: number
  by_me: boolean
  users: { id: number; name: string }[]
}

export interface ReplyToSummary {
  id: number
  body: string
  sender: { id: number; name: string } | null
}

export interface MessageAttachment {
  id: number
  filename: string
  mime: string
  size: number
  url: string
  is_image: boolean
}

export interface PresenceEntry {
  user_id: number
  status: PresenceStatusValue
  last_seen_at?: string | null
}

export interface PaginatedMessages {
  data: InboxMessage[]
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
  }
}

export interface UnreadSummary {
  total_unread: number
  by_severity: Omit<SeverityBreakdown, 'total'>
  conversations_count: number
}
