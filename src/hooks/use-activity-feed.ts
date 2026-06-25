'use client'

import { useApiQuery } from './use-query'
import type { StageActivityEvent } from '@/lib/types/stage-activity'

interface Response {
  items: StageActivityEvent[]
}

/**
 * Timeline da atividade — eventos com delivery_id=X em stage_activity_events.
 * Inclui comentários (texto + anexos + mentions) e eventos automáticos
 * (movimentação, aportes, etc) escopados na atividade.
 */
export function useActivityFeed(deliveryId: number | null | undefined, limit = 50) {
  const path = deliveryId ? `/activities/${deliveryId}/activity?limit=${limit}` : null
  const { data, loading, error, refetch } = useApiQuery<Response>(path)
  return {
    items: data?.items ?? [],
    loading,
    error,
    refetch,
  }
}
