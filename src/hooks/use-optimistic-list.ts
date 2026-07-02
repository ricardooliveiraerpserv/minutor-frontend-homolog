'use client'

import { useEffect, useState } from 'react'

/**
 * Fase 2 — lista com update OTIMISTA genérico + rollback automático em falha.
 * NÃO é presa a nenhum layout: serve para tabelas, listas, kanbans, grids e cards.
 *
 * REGRA (classificação da Fase 2): usar SÓ em ações Categoria A (rápidas e reversíveis —
 * aprovar, mover card, arquivar, marcar como lido, favoritar, mudar status).
 * Categoria B (editar/cronograma/horas) só com rollback simples; Categoria C (exclusão
 * definitiva, faturamento, fechamento, documentos, integrações, financeiro) NUNCA otimista —
 * esperam a confirmação do servidor.
 *
 * `source` deve ser o estado vindo do servidor (memoizado/estável): ao chegar nova lista
 * (refetch), a hook re-sincroniza — o servidor é a fonte de verdade.
 */
export function useOptimisticList<T>(source: T[], keyOf: (item: T) => string | number) {
  const [items, setItems] = useState<T[]>(source)

  // Servidor manda: quando a lista de origem muda (refetch/poll), sincroniza.
  useEffect(() => { setItems(source) }, [source])

  /**
   * Aplica a transformação otimista JÁ na UI, executa o commit no servidor e, se falhar,
   * REVERTE para o snapshot anterior. Relança o erro para quem chamou tratar (toast/ErrorState).
   */
  async function mutate<R>(optimistic: (prev: T[]) => T[], commit: () => Promise<R>): Promise<R> {
    let snapshot: T[] = []
    setItems(prev => { snapshot = prev; return optimistic(prev) })
    try {
      return await commit()
    } catch (e) {
      setItems(snapshot)  // rollback
      throw e
    }
  }

  // Açúcares comuns — todos otimistas + rollback via mutate:
  const remove = (id: string | number, commit: () => Promise<unknown>) =>
    mutate(prev => prev.filter(i => keyOf(i) !== id), commit)

  const update = (id: string | number, patch: Partial<T>, commit: () => Promise<unknown>) =>
    mutate(prev => prev.map(i => (keyOf(i) === id ? { ...i, ...patch } : i)), commit)

  const upsert = (item: T, commit: () => Promise<unknown>) =>
    mutate(prev => (prev.some(i => keyOf(i) === keyOf(item))
      ? prev.map(i => (keyOf(i) === keyOf(item) ? item : i))
      : [...prev, item]), commit)

  return { items, setItems, mutate, remove, update, upsert }
}
