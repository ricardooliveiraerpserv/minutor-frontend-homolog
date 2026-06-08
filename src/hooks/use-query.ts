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

  const fetch = useCallback(async (): Promise<T | null> => {
    if (!path) return null
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.get<T>(path)
      setState({ data, loading: false, error: null })
      return data
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro desconhecido'
      setState({ data: null, loading: false, error: msg })
      return null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  useEffect(() => { fetch() }, [fetch])

  // Atualização otimista do cache local (sem esperar o refetch) — usado quando o
  // refetch imediato pós-mutação não reflete a mudança e a tela parece "não mudar".
  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setState(s => ({
      ...s,
      data: typeof updater === 'function'
        ? (updater as (prev: T | null) => T | null)(s.data)
        : updater,
    }))
  }, [])

  return { ...state, refetch: fetch, setData }
}
