'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useAsyncAction } from './use-async-action'

type Key = number | string

export interface CrudMessages {
  created?: string
  updated?: string
  deleted?: string
  saveError?: string
  deleteError?: string
}

/** Contexto entregue aos hooks de telemetria. */
export interface CrudTelemetryCtx {
  action: 'save' | 'delete'
  endpoint: string
  durationMs: number
  error?: unknown
}

/**
 * Pontos de extensão do CRUD — HOJE no-op. Existem para que capacidades futuras (analytics,
 * métricas de duração, breadcrumbs, retry central) sejam ligadas AQUI, sem tocar nas 7/20/50
 * telas que consomem o hook.
 */
export interface CrudTelemetry {
  beforeAction?: (ctx: Omit<CrudTelemetryCtx, 'durationMs'>) => void
  afterSuccess?: (ctx: CrudTelemetryCtx) => void
  afterError?: (ctx: CrudTelemetryCtx) => void
  afterFinally?: (ctx: CrudTelemetryCtx) => void
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

/**
 * Fase 2 — CRUD padrão (create/update/delete) sobre `useAsyncAction`.
 * Elimina a duplicação do par save/delete espalhado pelos cadastros.
 *
 * O hook DONA o estado (shared-busy, ver docs/ASYNC_PATTERNS.md §5): o `saving` compartilha
 * o `disabled` com Cancelar; o delete dispara depois de fechar o confirm e a linha mostra
 * `deletingId`. Por isso é hook, não um AsyncButton por botão.
 *
 * Renderização (regra oficial): `saving`/`deletingId` só para `disabled`; spinner só via
 * `savingRunning`/`deletingRunning` (nunca via `pending`).
 *
 * Fluxos que NÃO são CRUD de modal (upload, importação em lote, toggle por linha, wizard,
 * job assíncrono longo) NÃO usam este hook — ver docs/ASYNC_PATTERNS.md §9.
 */
export function useCrudActions(endpoint: string, opts: {
  onSaved?: () => void
  onDeleted?: () => void
  messages?: CrudMessages
  /** Pontos de extensão (no-op por padrão) — ligar capacidades futuras aqui, não nas telas. */
  telemetry?: CrudTelemetry
} = {}) {
  const m = opts.messages ?? {}
  const t = opts.telemetry

  // Envolve uma ação com o ciclo de telemetria. Relança o erro (useAsyncAction cuida do status/onError).
  const withTelemetry = async (action: 'save' | 'delete', fn: () => Promise<void>) => {
    const start = now()
    t?.beforeAction?.({ action, endpoint })
    try {
      await fn()
      t?.afterSuccess?.({ action, endpoint, durationMs: now() - start })
    } catch (e) {
      t?.afterError?.({ action, endpoint, durationMs: now() - start, error: e })
      throw e
    } finally {
      t?.afterFinally?.({ action, endpoint, durationMs: now() - start })
    }
  }

  const saveAction = useAsyncAction(async (id: Key | null, payload: unknown) => {
    await withTelemetry('save', async () => {
      if (id != null) await api.put(`/${endpoint}/${id}`, payload)
      else await api.post(`/${endpoint}`, payload)
      toast.success(id != null ? (m.updated ?? 'Salvo') : (m.created ?? 'Criado'))
      opts.onSaved?.()
    })
  }, { onError: e => toast.error(e instanceof ApiError ? e.message : (m.saveError ?? 'Erro ao salvar')) })

  const [deletingId, setDeletingId] = useState<Key | null>(null)
  const deleteAction = useAsyncAction(async (id: Key) => {
    await withTelemetry('delete', async () => {
      await api.delete(`/${endpoint}/${id}`)
      toast.success(m.deleted ?? 'Excluído')
      opts.onDeleted?.()
    })
  }, { onError: e => toast.error(e instanceof ApiError ? e.message : (m.deleteError ?? 'Erro ao excluir')) })

  const del = async (id: Key) => {
    setDeletingId(id)
    try { await deleteAction.run(id) } finally { setDeletingId(null) }
  }

  return {
    /** create (id = null) ou update (id definido) com o payload */
    save: (id: Key | null, payload: unknown) => saveAction.run(id, payload),
    saving: saveAction.pending,            // disabled (imediato)
    savingRunning: saveAction.running,     // spinner (atrasado)
    del,
    deletingId,                            // linha em exclusão (imediato) — disabled
    deletingRunning: deleteAction.running, // spinner (atrasado)
  }
}
