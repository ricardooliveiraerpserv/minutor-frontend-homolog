'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApiQuery<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: !!path, error: null })

  const fetch = useCallback(async () => {
    if (!path) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.get<T>(path)
      setState({ data, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro desconhecido'
      setState({ data: null, loading: false, error: msg })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  useEffect(() => { fetch() }, [fetch])

  return { ...state, refetch: fetch }
}
