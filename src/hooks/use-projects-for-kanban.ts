'use client'

import { useApiQuery } from './use-query'
import type { KanbanStage } from '@/lib/types/project-stage'

export interface ProjectKanbanItem {
  id: number
  name: string
  code: string | null
  status: string
  status_display?: string
  kanban_stage: KanbanStage | null
  customer?: { id: number; name: string } | null
  sold_hours?: number | string | null
  consumed_hours?: number | string | null
  general_hours_balance?: number | string | null
  expected_end_date?: string | null
  consultants?: { id: number; name: string }[]
}

interface Response {
  hasNext?: boolean
  items: ProjectKanbanItem[]
}

export function useProjectsForKanban() {
  // pageSize alto para evitar paginação; modo gestão é mais leve no backend
  const { data, loading, error, refetch } = useApiQuery<Response>(
    `/projects?gestao=true&pageSize=200&with_team=true`
  )

  return {
    projects: data?.items ?? [],
    loading,
    error,
    refetch,
  }
}
