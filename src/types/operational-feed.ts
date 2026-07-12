export type FeedSeverityValue = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type FeedSourceValue =
  | 'system'
  | 'ai'
  | 'movidesk'
  | 'manual'
  | 'health_engine'
  | 'cs_engine'
  | 'finance'
  | 'training'

export type FeedEventTypeValue =
  | 'hour_overrun'
  | 'sla_breach'
  | 'ticket_spike'
  | 'churn_risk'
  | 'expansion_opportunity'
  | 'project_stalled'
  | 'ai_suggestion'
  | 'financial_alert'
  | 'training_recommended'
  | 'contract_renewal'
  | 'custom'

export interface FeedSeverity {
  value: FeedSeverityValue
  label: string
  color: string
}

export interface FeedSource {
  value: FeedSourceValue
  label: string
}

export interface FeedEventType {
  value: FeedEventTypeValue
  label: string
}

export interface OperationalFeed {
  id: number
  customer?: { id: number; name: string } | null
  contract?: { id: number } | null
  project?: { id: number; name?: string | null } | null
  source: FeedSource
  event_type: FeedEventType
  severity: FeedSeverity
  title: string
  message: string
  metadata?: Record<string, unknown> | null
  created_by?: { id: number; name: string } | null
  created_at: string
}

export interface OperationalFeedListResponse {
  data: OperationalFeed[]
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
  }
  links: {
    first?: string
    last?: string
    prev?: string | null
    next?: string | null
  }
}

export interface OperationalFeedFilters {
  customer_id?: number
  contract_id?: number
  project_id?: number
  severity?: FeedSeverityValue | FeedSeverityValue[]
  source?: FeedSourceValue | FeedSourceValue[]
  event_type?: FeedEventTypeValue | FeedEventTypeValue[]
  per_page?: number
  page?: number
}
