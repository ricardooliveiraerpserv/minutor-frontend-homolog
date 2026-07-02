'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export interface RowMenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface PopupState {
  top: number
  left: number
  height: number
}

export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [pos, setPos]       = useState<PopupState | null>(null)
  const [mounted, setMounted] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)
  const open    = pos !== null

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      // Não fecha se clicou no botão de abrir ou dentro do popup (que está em portal).
      if (btnRef.current && btnRef.current.contains(target)) return
      if (menuRef.current && menuRef.current.contains(target)) return
      setPos(null)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPos(null) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) { setPos(null); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    const W       = 200
    const margin  = 8
    const itemH   = 36
    const padding = 8
    const desiredH = items.length * itemH + padding
    const spaceBelow = vh - r.bottom - margin
    const spaceAbove = r.top - margin

    // Preferência: abrir embaixo do botão se houver pelo menos 200px ou couber inteiro.
    // Senão acima, com mesma regra. Senão, escolhe o lado com mais espaço.
    const minPreferredH = Math.min(200, desiredH)
    let top: number
    let height: number
    if (spaceBelow >= Math.min(desiredH, minPreferredH)) {
      top = r.bottom + 4
      height = Math.min(desiredH, spaceBelow - 4)
    } else if (spaceAbove >= minPreferredH) {
      const h = Math.min(desiredH, spaceAbove - 4)
      top = r.top - h - 4
      height = h
    } else if (spaceBelow >= spaceAbove) {
      top = r.bottom + 4
      height = Math.max(80, spaceBelow - 4)
    } else {
      const h = Math.max(80, spaceAbove - 4)
      top = r.top - h - 4
      height = h
    }

    let left = r.right + 4
    if (left + W > vw - margin) left = Math.max(margin, r.left - W - 4)
    setPos({ top, left, height })
  }

  // Popup renderizado em portal pra escapar de ancestrais com transform/filter
  // que quebrariam o position: fixed.
  const popup = pos && mounted ? createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        maxHeight: pos.height,
      }}
      className="min-w-[180px] bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl shadow-2xl py-1 overflow-y-auto"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { if (!item.disabled) { item.onClick(); setPos(null) } }}
          disabled={item.disabled}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed ${
            item.danger
              ? 'text-[var(--danger)] hover:bg-[var(--danger-bg)]'
              : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`p-1.5 rounded transition-colors ${
          open ? 'text-[var(--text)] bg-[var(--surface-hover)]' : 'text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
        }`}
      >
        <MoreVertical size={14} />
      </button>
      {popup}
    </>
  )
}
