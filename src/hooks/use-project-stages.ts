'use client'

import { useApiQuery } from './use-query'
import type { ProjectStage } from '@/lib/types/project-stage'

interface StagesResponse {
  items: ProjectStage[]
}

export function useProjectStages(projectId: number | null) {
  const path = projectId ? `/projects/${projectId}/stages` : null
  const { data, loading, error, refetch } = useApiQuery<StagesResponse>(path)

  return {
    stages: data?.items ?? [],
    loading,
    error,
    refetch,
  }
}
