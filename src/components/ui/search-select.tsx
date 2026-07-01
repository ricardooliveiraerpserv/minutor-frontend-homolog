'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export interface SearchSelectOption { id: number | string; name: string }

export function SearchSelect({ label, value, onChange, options, placeholder, wide, fullWidth, disabled }: {
  label?: string
  value: string | number
  onChange: (v: string) => void
  options: SearchSelectOption[]
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

  const selected = options.find(o => String(o.id) === String(value))
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', h)
    // Em telas de toque NÃO fechar no scroll: ao focar o input de busca o iOS
    // rola a tela pra acomodar o teclado, o que fecharia o dropdown e impediria
    // de digitar. No desktop mantém o fecha-ao-rolar.
    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    if (!isCoarse) window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', h)
      if (!isCoarse) window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const dropW = fullWidth ? r.width : Math.max(r.width, wide ? 240 : 200)
    const left = Math.min(r.left, window.innerWidth - dropW - 8)
    setPos({ top: r.bottom + 4, left: Math.max(8, left), width: dropW })
    setOpen(true)
  }

  const select = (id: string) => { onChange(id); setOpen(false) }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
          {label}
        </label>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm outline-none text-left disabled:opacity-50 disabled:cursor-not-allowed ${fullWidth ? 'w-full' : wide ? 'min-w-52' : 'min-w-36'}`}
        style={{
          background: 'var(--field)',
          border: `1px solid ${selected ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
          color: selected ? 'var(--brand-text)' : 'var(--brand-subtle)',
        }}
      >
        <span className="truncate text-sm">{selected ? selected.name : placeholder}</span>
        <ChevronDown size={13} style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
      </button>

      {open && pos && (
        <div
          ref={ref}
          className="rounded-xl shadow-2xl overflow-hidden"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
            zIndex: 9999, background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--field)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button type="button" onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors"
              style={{ color: !value ? 'var(--brand-primary)' : 'var(--brand-subtle)' }}>
              {placeholder}
            </button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>
              : filtered.map(o => (
                <button key={o.id} type="button" onClick={() => select(String(o.id))}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                  style={{ color: String(o.id) === String(value) ? 'var(--brand-primary)' : 'var(--brand-text)' }}>
                  {o.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
