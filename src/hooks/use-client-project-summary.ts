'use client'

import { useApiQuery } from './use-query'

export type HealthLevel = 'ok' | 'atencao' | 'atrasado' | 'estourando'

export interface ActivityItem {
  type: 'hours_approved' | 'delivery_completed'
  label: string
  who: string | null
  when: string
  value: string
}

export interface ClientProjectSummary {
  project: {
    id: number
    name: string
    code: string | null
    customer: { id: number; name: string } | null
  }
  status_macro: string
  progress_pct: number
  expected_end_date: string | null
  sold_hours: number
  consumed_hours: number
  health: HealthLevel
  recent_activity: ActivityItem[]
}

export function useClientProjectSummary(projectId: number | null) {
  const path = projectId
    ? `/client/portal/projects/${projectId}/operational-summary`
    : null
  return useApiQuery<ClientProjectSummary>(path)
}
