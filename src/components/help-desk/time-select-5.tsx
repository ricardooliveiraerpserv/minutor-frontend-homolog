'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Seletor de horário de campo ÚNICO (formato antigo), lista de 5 em 5 min — determinístico,
// não depende do picker nativo. Opcionalmente exibe uma opção no TOPO da lista (ex.: "Sem
// apontamento") que, ao ser escolhida, trava os demais campos.

const TIMES: string[] = []
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 5) {
    TIMES.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

export function TimeSelect5({
  value,
  onChange,
  disabled,
  topOption,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  topOption?: { label: string; active: boolean; onSelect: () => void }
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Ao abrir, rola até o horário selecionado.
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector('[data-sel="1"]') as HTMLElement | null
      if (el) el.scrollIntoView({ block: 'center' })
    }
  }, [open])

  const label = topOption?.active ? topOption.label : (value || '--:--')
  const hasValue = topOption?.active || !!value

  return (
    <div ref={ref} className="relative inline-block" aria-label={ariaLabel}>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
        className="ds-input inline-flex items-center justify-between gap-1"
        style={{ height: 30, fontSize: 12, padding: '0 8px', width: topOption ? 138 : 96, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <span className="truncate" style={{ color: hasValue ? 'var(--text)' : 'var(--text-light)' }}>{label}</span>
        <ChevronDown size={12} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
      </button>
      {open && !disabled && (
        <div ref={listRef} className="absolute z-50 mt-1 left-0 rounded-lg shadow-xl overflow-y-auto"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: topOption ? 138 : 96, maxHeight: 220 }}>
          {topOption && (
            <button type="button" onClick={() => { topOption.onSelect(); setOpen(false) }}
              className="w-full text-left px-2.5 py-1.5 text-xs border-b sticky top-0"
              style={{ borderColor: 'var(--border)', background: topOption.active ? 'var(--primary-soft)' : 'var(--surface)', color: topOption.active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
              {topOption.label}
            </button>
          )}
          {TIMES.map(t => (
            <button key={t} type="button" data-sel={t === value ? '1' : undefined}
              onClick={() => { onChange(t); setOpen(false) }}
              className="w-full text-left px-2.5 py-1 text-xs ds-row-hover"
              style={{ background: t === value ? 'var(--primary-soft)' : 'transparent', color: t === value ? 'var(--primary)' : 'var(--text)' }}>
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
