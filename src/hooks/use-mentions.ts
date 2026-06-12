'use client'

import { useApiQuery } from './use-query'

export interface MentionItem {
  id: number
  created_at: string
  actor: { id: number; name: string } | null
  text: string | null
  delivery_id: number | null
  delivery: string | null
  stage_id: number | null
  stage: string | null
  project_id: number | null
  project: string | null
}

interface Response {
  items: MentionItem[]
  count: number
}

export function useMentions() {
  const { data, loading, error, refetch } = useApiQuery<Response>('/me/mentions')
  return {
    items: data?.items ?? [],
    total: data?.count ?? 0,
    loading,
    error,
    refetch,
  }
}
