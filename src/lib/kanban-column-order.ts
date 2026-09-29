'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Ordem das COLUNAS do kanban, persistida por usuário (localStorage). O usuário arrasta os
 * cabeçalhos das colunas p/ reordenar; colunas novas (ainda sem posição salva) vão pro fim.
 */
function storageKey(kanban: string, userId?: number | string | null): string {
  return `hd_col_order_${kanban}_${userId ?? 'anon'}`
}

function load(key: string): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(window.localStorage.getItem(key) || '[]') } catch { return [] }
}

/** Ordena `ids` conforme `saved`; ids desconhecidos entram no fim, na ordem original. */
export function applyOrder(ids: string[], saved: string[]): string[] {
  const known = saved.filter(id => ids.includes(id))
  const rest = ids.filter(id => !known.includes(id))
  return [...known, ...rest]
}

export function useColumnOrder(kanban: string, ids: string[], userId?: number | string | null) {
  const key = storageKey(kanban, userId)
  const [saved, setSaved] = useState<string[]>([])
  const dragId = useRef<string | null>(null)

  useEffect(() => { setSaved(load(key)) }, [key])

  const ordered = useMemo(() => applyOrder(ids, saved), [ids, saved])

  const move = useCallback((dragged: string, over: string) => {
    const cur = applyOrder(ids, saved)
    const from = cur.indexOf(dragged), to = cur.indexOf(over)
    if (from < 0 || to < 0 || from === to) return
    const next = [...cur]
    next.splice(from, 1)
    next.splice(to, 0, dragged)
    setSaved(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next))
  }, [ids, saved, key])

  /** Handlers p/ o cabeçalho da coluna (drag nativo, não conflita com o dnd dos cards). */
  const headerProps = useCallback((colId: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { dragId.current = colId; e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragId.current) move(dragId.current, colId); dragId.current = null },
    style: { cursor: 'grab' as const },
  }), [move])

  return { ordered, headerProps }
}
