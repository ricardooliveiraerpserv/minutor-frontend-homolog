'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export interface SearchSelectOption { id: number | string; name: string }

export function SearchSelect({ label, value, onChange, options, placeholder, wide, fullWidth, disabled, inline, subtle }: {
  label?: string
  value: string | number
  onChange: (v: string) => void
  options: SearchSelectOption[]
  placeholder: string
  wide?: boolean
  fullWidth?: boolean
  disabled?: boolean
  inline?: boolean   // dropdown no fluxo (absolute abaixo do campo), sem position:fixed — não corta
  subtle?: boolean   // variante visual compacta (usada no Cronograma)
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const [pos,   setPos]   = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const ref      = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => String(o.id) === String(value))
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  // Recalcula a posição do dropdown a partir do botão. Decide abrir pra cima quando
  // não há espaço suficiente embaixo (perto do rodapé). Chamado no abrir e em cada
  // scroll/resize pra manter o menu COLADO ao campo (não deixa "descolar").
  const updatePos = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const dropW = fullWidth ? r.width : Math.max(r.width, wide ? 240 : 200)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - dropW - 8))
    // Altura estimada do menu (header de busca + lista max-h-52 ≈ 208px).
    const DROP_H = 264
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < DROP_H && r.top > spaceBelow
    setPos({ top: openUp ? r.top - 4 : r.bottom + 4, left, width: dropW, up: openUp })
  }

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    if (inline) return () => document.removeEventListener('mousedown', h)
    // Menu com position:fixed: reposiciona (NÃO fecha) em qualquer scroll/resize
    // pra ficar sempre colado ao campo. capture:true pega também o scroll de
    // containers ancestrais (ex.: a tabela do Cronograma), não só o da janela.
    updatePos()
    const reposition = () => updatePos()
    window.addEventListener('scroll', reposition, { passive: true, capture: true })
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', h)
      window.removeEventListener('scroll', reposition, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', reposition)
    }
  }, [open, inline])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); return }
    if (inline) { setOpen(true); return }   // inline = dropdown no fluxo, sem pos fixo
    updatePos()
    setOpen(true)
  }

  const select = (id: string) => { onChange(id); setOpen(false) }

  const dropdown = (open && (inline || pos)) ? (
    <div
      ref={ref}
      className="rounded-xl shadow-2xl overflow-hidden"
      style={inline
        ? { position: 'absolute', top: '100%', left: 0, marginTop: 4, width: fullWidth ? '100%' : (wide ? 240 : 200), zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)' }
        : { position: 'fixed', top: pos!.top, left: pos!.left, width: pos!.width, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
            // Quando abre pra cima, ancora a base do menu no topo do botão.
            transform: pos!.up ? 'translateY(-100%)' : undefined }
      }
    >
      <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--field)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto">
        <button type="button" onClick={() => select('')}
          className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors"
          style={{ color: !value ? 'var(--primary)' : 'var(--text-light)' }}>
          {placeholder}
        </button>
        {filtered.length === 0
          ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>
          : filtered.map(o => (
            <button key={o.id} type="button" onClick={() => select(String(o.id))} title={o.name}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors whitespace-normal break-words leading-snug"
              style={{ color: String(o.id) === String(value) ? 'var(--primary)' : 'var(--text)' }}>
              {o.name}
            </button>
          ))}
      </div>
    </div>
  ) : null

  return (
    <div className="flex flex-col gap-1.5" style={inline ? { position: 'relative' } : undefined}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
          {label}
        </label>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`flex items-center justify-between gap-2 outline-none text-left disabled:opacity-50 disabled:cursor-not-allowed ${subtle ? 'px-2 py-1 text-xs rounded-lg' : 'px-4 py-2.5 text-sm rounded-xl'} ${fullWidth ? 'w-full' : subtle ? 'min-w-0 max-w-[168px]' : wide ? 'min-w-52' : 'min-w-36'}`}
        style={{
          background: 'var(--field)',
          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          color: selected ? 'var(--text)' : 'var(--text-light)',
        }}
      >
        <span className="truncate" title={selected ? selected.name : undefined}>{selected ? selected.name : placeholder}</span>
        <ChevronDown size={subtle ? 12 : 13} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
      </button>

      {dropdown}
    </div>
  )
}
