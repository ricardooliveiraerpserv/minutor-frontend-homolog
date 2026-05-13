'use client'

import { useApiQuery } from './use-query'
import type { DeliveryEvent } from '@/lib/types/project-stage'

interface Response {
  items: DeliveryEvent[]
}

export function useDeliveryEvents(deliveryId: number | null) {
  const path = deliveryId ? `/deliveries/${deliveryId}/events` : null
  const { data, loading, error, refetch } = useApiQuery<Response>(path)

  return {
    events: data?.items ?? [],
    loading,
    error,
    refetch,
  }
}
