'use client'

import { useApiQuery } from './use-query'
import type { StageDelivery } from '@/lib/types/project-stage'

interface Response {
  items: StageDelivery[]
}

export function useStageDeliveries(stageId: number | null) {
  const path = stageId ? `/stages/${stageId}/deliveries` : null
  const { data, loading, error, refetch } = useApiQuery<Response>(path)

  return {
    deliveries: data?.items ?? [],
    loading,
    error,
    refetch,
  }
}
