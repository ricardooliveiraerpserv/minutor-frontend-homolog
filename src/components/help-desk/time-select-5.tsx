'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Seletor de horário de campo ÚNICO, lista de 5 em 5 min, com BUSCA/DIGITAÇÃO — ao abrir,
// um campo focado permite digitar a hora (filtra a lista e aceita valor digitado no Enter).
// Determinístico (não depende do picker nativo). Opcionalmente exibe uma opção no TOPO
// (ex.: "Sem apontamento") que, ao ser escolhida, trava os demais campos.

const TIMES: string[] = []
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 5) {
    TIMES.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

// Converte o que foi digitado em 'HH:MM' válido (ou null). Aceita "14:30", "1430", "930", "14".
function parseTyped(q: string): string | null {
  const s = q.trim()
  if (!s) return null
  let hh: string, mm: string
  if (s.includes(':')) {
    const [a, b] = s.split(':')
    hh = a; mm = (b ?? '').padEnd(2, '0').slice(0, 2)
  } else {
    const d = s.replace(/\D/g, '')
    if (!d) return null
    if (d.length <= 2) { hh = d; mm = '00' }
    else if (d.length === 3) { hh = d.slice(0, 1); mm = d.slice(1) }
    else { hh = d.slice(0, 2); mm = d.slice(2, 4) }
  }
  const H = Number(hh), M = Number(mm)
  if (!Number.isInteger(H) || !Number.isInteger(M) || H < 0 || H > 23 || M < 0 || M > 59) return null
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`
}

export function TimeSelect5({
  value,
  onChange,
  disabled,
  topOption,
  ariaLabel,
  minAfter,
  maxBefore,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  topOption?: { label: string; active: boolean; onSelect: () => void }
  ariaLabel?: string
  minAfter?: string   // desabilita horários <= este (fim precisa ser > início)
  maxBefore?: string  // desabilita horários >= este (início precisa ser < fim)
}) {
  // Comparação lexicográfica funciona p/ 'HH:MM' com zero-pad (24h).
  const isBlocked = (t: string) =>
    (!!minAfter && t <= minAfter) || (!!maxBefore && t >= maxBefore)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Ao abrir: limpa a busca, foca o campo e rola até o horário selecionado.
  useEffect(() => {
    if (!open) return
    setQuery('')
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    const el = listRef.current?.querySelector('[data-sel="1"]') as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'center' })
    return () => clearTimeout(t)
  }, [open])

  const digits = query.replace(/\D/g, '')
  const filtered = query.trim() === ''
    ? TIMES
    : TIMES.filter(t => t.replace(':', '').startsWith(digits) || t.startsWith(query))
  // Opções bloqueadas (fim <= início / início >= fim) ficam OCULTAS, não desabilitadas.
  const visible = filtered.filter(t => !isBlocked(t))

  const commit = (v: string) => { if (isBlocked(v)) return; onChange(v); setOpen(false) }
  const onEnter = () => {
    const typed = parseTyped(query)
    if (typed && !isBlocked(typed)) commit(typed)
    else if (!typed) { const first = filtered.find(t => !isBlocked(t)); if (first) commit(first) }
  }

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
        <div className="absolute z-50 mt-1 left-0 rounded-lg shadow-xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: topOption ? 150 : 108 }}>
          {/* Campo de digitação (busca/entrada direta) */}
          <div className="p-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <input ref={inputRef} value={query} inputMode="numeric"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } else if (e.key === 'Escape') setOpen(false) }}
              placeholder="Digite (ex: 14:30)"
              className="ds-input w-full" style={{ height: 28, fontSize: 12, padding: '0 8px' }} />
          </div>
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {topOption && query.trim() === '' && (
              <button type="button" onClick={() => { topOption.onSelect(); setOpen(false) }}
                className="w-full text-left px-2.5 py-1.5 text-xs border-b"
                style={{ borderColor: 'var(--border)', background: topOption.active ? 'var(--primary-soft)' : 'transparent', color: topOption.active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                {topOption.label}
              </button>
            )}
            {visible.map(t => (
              <button key={t} type="button" data-sel={t === value ? '1' : undefined}
                onClick={() => commit(t)}
                className="w-full text-left px-2.5 py-1 text-xs ds-row-hover"
                style={{ background: t === value ? 'var(--primary-soft)' : 'transparent', color: t === value ? 'var(--primary)' : 'var(--text)', cursor: 'pointer' }}>
                {t}
              </button>
            ))}
            {visible.length === 0 && (
              <div className="px-2.5 py-2 text-xs" style={{ color: 'var(--text-light)' }}>
                {parseTyped(query) ? `Enter para usar ${parseTyped(query)}` : 'Nenhum horário'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
