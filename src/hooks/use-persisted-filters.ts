'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

function storageKey(page: string, userId: number | string): string {
  return `minutor_filters__${page}__${userId}`
}

function readStorage<T>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

function writeStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded — silently ignore
  }
}

/**
 * Persistent filter hook.
 *
 * Usage:
 *   const { filters, set, clear } = usePersistedFilters('timesheets', userId, defaults)
 *   // set individual key:
 *   set('status', 'approved')
 *   // set multiple at once:
 *   set({ status: 'approved', page: 1 })
 *   // clear all (also wipes localStorage):
 *   clear()
 *
 * @param pageKey   Unique page identifier (e.g. 'timesheets', 'expenses')
 * @param userId    Current user's id — filters are isolated per user
 * @param defaults  Default values used when no saved state exists
 */
export function usePersistedFilters<T extends Record<string, unknown>>(
  pageKey: string,
  userId: number | string | null | undefined,
  defaults: T,
): {
  filters: T
  set: ((key: keyof T, value: T[keyof T]) => void) & ((partial: Partial<T>) => void)
  clear: () => void
} {
  const key = userId != null ? storageKey(pageKey, userId) : null
  const keyRef = useRef(key)
  keyRef.current = key

  const [filters, setFilters] = useState<T>(() => {
    if (key == null) return defaults
    return readStorage(key, defaults)
  })

  // Re-load from storage when userId changes (login switch)
  useEffect(() => {
    if (key == null) { setFilters(defaults); return }
    setFilters(readStorage(key, defaults))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Persist whenever filters change
  useEffect(() => {
    if (keyRef.current == null) return
    writeStorage(keyRef.current, filters)
  }, [filters])

  const set = useCallback((keyOrPartial: keyof T | Partial<T>, value?: T[keyof T]) => {
    setFilters(prev => {
      if (typeof keyOrPartial === 'object') {
        return { ...prev, ...keyOrPartial }
      }
      return { ...prev, [keyOrPartial]: value }
    })
  }, []) as ((key: keyof T, value: T[keyof T]) => void) & ((partial: Partial<T>) => void)

  const clear = useCallback(() => {
    if (keyRef.current != null) {
      try { localStorage.removeItem(keyRef.current) } catch { /* noop */ }
    }
    setFilters(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyRef])

  return { filters, set, clear }
}
