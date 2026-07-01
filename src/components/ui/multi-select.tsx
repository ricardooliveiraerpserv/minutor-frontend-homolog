'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

// depth > 0 = projeto filho: indenta e prefixa com uma seta azul "↳".
export interface MultiSelectOption { id: number | string; name: string; depth?: number }

export function MultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  wide,
  fullWidth,
  disabled,
}: {
  label?: string
  value: string[]
  onChange: (v: string[]) => void
  options: MultiSelectOption[]
  placeholder: string
  wide?: boolean
  fullWidth?: boolean
  disabled?: boolean
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const [pos,   setPos]   = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const ref      = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(
    () => options.filter(o => o.name.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  )

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])

  const triggerLabel = value.length === 0
    ? placeholder
    : value.length === 1
      ? (options.find(o => String(o.id) === value[0])?.name ?? `1 selecionado`)
      : `${value.length} selecionados`

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', h)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', h)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const openDropdown = () => {
    if (open) { setOpen(false); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const dropW = fullWidth ? r.width : Math.max(r.width, wide ? 240 : 200)
    const left = Math.min(r.left, window.innerWidth - dropW - 8)
    setPos({ top: r.bottom + 4, left: Math.max(8, left), width: dropW })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </label>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-medium outline-none text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${fullWidth ? 'w-full' : wide ? 'min-w-52' : 'min-w-36'}`}
        style={{
          background: 'var(--field)',
          border: `1px solid ${value.length > 0 ? 'var(--primary)' : 'var(--border)'}`,
          color: value.length > 0 ? 'var(--text)' : 'var(--text-muted)',
        }}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {open && pos && (
        <div
          ref={ref}
          className="rounded-xl overflow-hidden"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
            zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg outline-none ds-input"
                style={{ paddingLeft: '2rem', paddingRight: '0.75rem', paddingTop: '0.375rem', paddingBottom: '0.375rem', fontSize: '0.75rem' }}
              />
            </div>
          </div>
          {filtered.length > 0 && (() => {
            const ids = filtered.map(o => String(o.id))
            const allSelected = ids.every(id => value.includes(id))
            return (
              <button type="button"
                onClick={() => allSelected
                  ? onChange(value.filter(v => !ids.includes(v)))
                  : onChange(Array.from(new Set([...value, ...ids])))}
                className="w-full text-left px-3 py-2 text-xs font-semibold transition-colors flex items-center gap-2"
                style={{ color: 'var(--primary)', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <span className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border"
                  style={{ borderColor: 'var(--primary)', background: allSelected ? 'var(--primary)' : 'var(--surface)' }}>
                  {allSelected && <Check size={9} color="var(--primary-fg)" strokeWidth={3} />}
                </span>
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}{query ? ' (filtrados)' : ''}
              </button>
            )
          })()}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              Limpar seleção
            </button>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum resultado</p>
              : filtered.map(o => {
                  const checked = value.includes(String(o.id))
                  return (
                    <button key={o.id} type="button" onClick={() => toggle(String(o.id))}
                      className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2"
                      style={{ color: checked ? 'var(--primary)' : 'var(--text)', fontWeight: checked ? 500 : 400 }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <span className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border"
                        style={{ borderColor: checked ? 'var(--primary)' : 'var(--border-strong)', background: checked ? 'var(--primary)' : 'var(--surface)' }}>
                        {checked && <Check size={9} color="var(--primary-fg)" strokeWidth={3} />}
                      </span>
                      {o.depth ? (
                        <span className="inline-flex items-center gap-1 truncate" style={{ paddingLeft: (o.depth - 1) * 14 }}>
                          <span style={{ color: 'var(--primary)' }}>↳</span>
                          <span className="truncate">{o.name}</span>
                        </span>
                      ) : <span className="truncate">{o.name}</span>}
                    </button>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}
