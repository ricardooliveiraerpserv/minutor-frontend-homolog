'use client'

import { useApiQuery } from './use-query'

export interface ActivityAporte {
  id: number
  stage_id: number
  delivery_id: number | null
  user_id: number
  user?: { id: number; name: string; email?: string } | null
  hours: string | number
  reason: string
  created_at: string
}

interface Response {
  items: ActivityAporte[]
  totals: { count: number; hours: number }
}

export function useActivityAportes(deliveryId: number | null | undefined) {
  const path = deliveryId ? `/activities/${deliveryId}/aportes` : null
  const { data, loading, error, refetch } = useApiQuery<Response>(path)
  return {
    items: data?.items ?? [],
    totals: data?.totals ?? { count: 0, hours: 0 },
    loading,
    error,
    refetch,
  }
}
