import { api } from './api'
import type {
  OperationalFeed,
  OperationalFeedFilters,
  OperationalFeedListResponse,
} from '@/types/operational-feed'

function toQueryString(filters: OperationalFeedFilters): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      params.set(key, value.join(','))
    } else {
      params.set(key, String(value))
    }
  }

  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listOperationalFeed(
  filters: OperationalFeedFilters = {},
): Promise<OperationalFeedListResponse> {
  return api.get<OperationalFeedListResponse>(
    `/operational-feed${toQueryString(filters)}`,
  )
}

export function getOperationalFeed(id: number): Promise<{ data: OperationalFeed }> {
  return api.get<{ data: OperationalFeed }>(`/operational-feed/${id}`)
}

export interface CreateOperationalFeedPayload {
  event_type: string
  severity: string
  title: string
  message: string
  customer_id?: number
  contract_id?: number
  project_id?: number
  metadata?: Record<string, unknown>
}

export function createOperationalFeed(
  payload: CreateOperationalFeedPayload,
): Promise<{ data: OperationalFeed }> {
  return api.post<{ data: OperationalFeed }>('/operational-feed', payload)
}

export function deleteOperationalFeed(id: number): Promise<{ deleted: boolean }> {
  return api.delete<{ deleted: boolean }>(`/operational-feed/${id}`)
}
