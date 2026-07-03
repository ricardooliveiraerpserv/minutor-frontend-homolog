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
 */
export function useCrudActions(endpoint: string, opts: {
  onSaved?: () => void
  onDeleted?: () => void
  messages?: CrudMessages
} = {}) {
  const m = opts.messages ?? {}

  const saveAction = useAsyncAction(async (id: Key | null, payload: unknown) => {
    if (id != null) await api.put(`/${endpoint}/${id}`, payload)
    else await api.post(`/${endpoint}`, payload)
    toast.success(id != null ? (m.updated ?? 'Salvo') : (m.created ?? 'Criado'))
    opts.onSaved?.()
  }, { onError: e => toast.error(e instanceof ApiError ? e.message : (m.saveError ?? 'Erro ao salvar')) })

  const [deletingId, setDeletingId] = useState<Key | null>(null)
  const deleteAction = useAsyncAction(async (id: Key) => {
    await api.delete(`/${endpoint}/${id}`)
    toast.success(m.deleted ?? 'Excluído')
    opts.onDeleted?.()
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
