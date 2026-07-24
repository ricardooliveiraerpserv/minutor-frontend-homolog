'use client'

import { useApiQuery } from './use-query'

export interface UserCapacityRow {
  user: { id: number; name: string; email: string }
  capacity_hours: number
  planned_hours: number
  actual_hours: number
  remaining_hours: number
  usage_pct: number              // ocupação do MÊS mais cheio ÷ capacidade mensal
  peak_month?: string | null     // 'YYYY-MM' do mês mais cheio
  peak_month_hours?: number      // horas planejadas nesse mês
  monthly?: { month: string; hours: number }[]  // distribuição mês a mês (tooltip)
  allocation_count: number
  overload: boolean
  overload_reasons: string[]
}

export interface UserCapacityAllocation {
  allocation_id: number
  stage_id: number
  stage_name: string
  project_id: number
  project_name: string
  customer_name: string | null
  planned_hours: number
  actual_hours: number
  remaining_hours: number
  health: 'ok' | 'atencao' | 'estourado' | 'unknown'
}

export interface UserCapacityDetail {
  user: { id: number; name: string; email: string }
  items: UserCapacityAllocation[]
  totals: { planned_hours: number; actual_hours: number; remaining_hours: number }
  capacity_hours: number
  overload: boolean
  overload_reasons: string[]
}

interface IndexResponse {
  items: UserCapacityRow[]
  summary: { overloaded_count: number; total_count: number }
}

export function useUserCapacityIndex() {
  const { data, loading, error, refetch } = useApiQuery<IndexResponse>('/users/capacity')
  return {
    items: data?.items ?? [],
    summary: data?.summary ?? { overloaded_count: 0, total_count: 0 },
    byUserId: (data?.items ?? []).reduce<Record<number, UserCapacityRow>>((acc, r) => {
      acc[r.user.id] = r
      return acc
    }, {}),
    loading,
    error,
    refetch,
  }
}

export function useUserCapacity(userId: number | null) {
  const path = userId ? `/users/${userId}/capacity` : null
  const { data, loading, error, refetch } = useApiQuery<UserCapacityDetail>(path)
  return { data, loading, error, refetch }
}
