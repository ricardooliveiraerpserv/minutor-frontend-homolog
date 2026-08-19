'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Filtros globais do Cronograma — atravessam Operação / Planejamento / Linha do Tempo.
 *
 * Estrutura preparada (sem lógica de aplicação ainda): valores ficam no `?fl_*`
 * da URL pra serem shareable e sobreviverem à troca de view. Quando uma view
 * decidir consumir, basta ler `filters.responsavel` etc.
 *
 * Filtros suportados (todos opcionais, todos string|number[]):
 *  - responsavel  → user_id
 *  - status       → DeliveryStatus (backlog/in_progress/...)
 *  - cliente      → customer_id
 *  - bloqueada    → true/false
 *  - homologacao  → true/false (atalho pra status=review)
 *  - sprint       → string/id (futuro)
 *  - risco        → 'low'|'medium'|'high' (futuro, vem de stage.risk_level)
 *
 * Chaves URL prefixadas `fl_` pra não conflitar com `view`, `stage`, `activity`.
 */

export interface CronogramaFilters {
  responsavel?: number | null
  status?: string | null
  cliente?: number | null
  bloqueada?: boolean
  homologacao?: boolean
  sprint?: string | null
  risco?: 'low' | 'medium' | 'high' | null
}

const KEY_MAP: Record<keyof CronogramaFilters, string> = {
  responsavel: 'fl_resp',
  status:      'fl_status',
  cliente:     'fl_cli',
  bloqueada:   'fl_block',
  homologacao: 'fl_homo',
  sprint:      'fl_sprint',
  risco:       'fl_risk',
}

function parseValue<K extends keyof CronogramaFilters>(key: K, raw: string | null): CronogramaFilters[K] | undefined {
  if (raw === null || raw === '') return undefined
  switch (key) {
    case 'responsavel':
    case 'cliente': {
      const n = Number(raw)
      return (Number.isInteger(n) && n > 0 ? n : null) as CronogramaFilters[K]
    }
    case 'bloqueada':
    case 'homologacao':
      return (raw === '1' || raw === 'true') as CronogramaFilters[K]
    case 'risco':
      return (['low', 'medium', 'high'].includes(raw) ? raw : null) as CronogramaFilters[K]
    case 'status':
    case 'sprint':
      return raw as CronogramaFilters[K]
  }
  return undefined
}

function serializeValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '' || v === false) return null
  if (v === true) return '1'
  return String(v)
}

export function useCronogramaFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters: CronogramaFilters = useMemo(() => {
    const out: CronogramaFilters = {}
    ;(Object.keys(KEY_MAP) as (keyof CronogramaFilters)[]).forEach(k => {
      const raw = searchParams.get(KEY_MAP[k])
      const parsed = parseValue(k, raw)
      if (parsed !== undefined) (out as Record<string, unknown>)[k] = parsed
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  const setFilter = useCallback(<K extends keyof CronogramaFilters>(key: K, value: CronogramaFilters[K] | null) => {
    const sp = new URLSearchParams(searchParams.toString())
    const ser = serializeValue(value)
    if (ser === null) sp.delete(KEY_MAP[key])
    else sp.set(KEY_MAP[key], ser)
    router.replace(`?${sp.toString()}`)
  }, [router, searchParams])

  const clearAll = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString())
    ;(Object.values(KEY_MAP) as string[]).forEach(k => sp.delete(k))
    router.replace(`?${sp.toString()}`)
  }, [router, searchParams])

  const activeCount = useMemo(() => {
    let n = 0
    ;(Object.keys(filters) as (keyof CronogramaFilters)[]).forEach(k => {
      const v = filters[k]
      if (v !== undefined && v !== null && v !== false && v !== '') n++
    })
    return n
  }, [filters])

  return { filters, setFilter, clearAll, activeCount }
}
