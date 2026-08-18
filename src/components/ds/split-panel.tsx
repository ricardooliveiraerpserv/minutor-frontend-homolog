'use client'

// ds/ · SplitPanel — painel esquerdo redimensionável (min/max), handle discreto,
// SEM jitter (largura aplicada por ref durante o arrasto; estado só no pointerup),
// persistência opcional (localStorage). Em tela pequena empilha (base p/ drawer futuro).

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface SplitPanelProps {
  left: ReactNode
  right: ReactNode
  min?: number
  max?: number
  defaultWidth?: number
  /** se fornecido, persiste a largura em localStorage */
  storageKey?: string
  className?: string
}

export function SplitPanel({ left, right, min = 280, max = 500, defaultWidth = 320, storageKey, className }: SplitPanelProps) {
  const clamp = useCallback((w: number) => Math.max(min, Math.min(max, w)), [min, max])
  const [width, setWidth] = useState<number>(clamp(defaultWidth))
  const leftRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // hidrata largura persistida (client-only, evita mismatch de SSR)
  useEffect(() => {
    if (!storageKey) return
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
    const n = raw ? parseInt(raw, 10) : NaN
    if (!Number.isNaN(n)) setWidth(clamp(n))
  }, [storageKey, clamp])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !leftRef.current) return
    const rect = leftRef.current.parentElement!.getBoundingClientRect()
    const w = clamp(e.clientX - rect.left)
    // jitter-free: aplica direto no DOM durante o arrasto (sem re-render por pixel)
    leftRef.current.style.width = `${w}px`
  }, [clamp])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    const w = leftRef.current ? parseInt(leftRef.current.style.width || `${width}`, 10) : width
    const cw = clamp(w)
    setWidth(cw)
    if (storageKey) window.localStorage.setItem(storageKey, String(cw))
  }, [clamp, storageKey, width])

  // teclado no handle: ←/→ ajustam 16px
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setWidth((w) => {
      const cw = clamp(w + (e.key === 'ArrowRight' ? 16 : -16))
      if (storageKey) window.localStorage.setItem(storageKey, String(cw))
      return cw
    })
  }, [clamp, storageKey])

  return (
    <div className={cn('flex min-h-0 w-full flex-col md:flex-row', className)}>
      <div
        ref={leftRef}
        className="min-h-0 w-full shrink-0 overflow-auto md:w-[var(--split-w)]"
        style={{ ['--split-w' as string]: `${width}px` }}
      >
        {left}
      </div>
      {/* handle — só no desktop (md+); em telas pequenas empilha */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className="group hidden w-px shrink-0 cursor-col-resize bg-[color:var(--border)] md:block"
        title="Arraste para redimensionar"
      >
        <div className="mx-[-3px] h-full w-[7px] group-hover:bg-[color:var(--accent,#2563eb)]" />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{right}</div>
    </div>
  )
}
