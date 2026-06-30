'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, Check, ChevronDown } from 'lucide-react'

export interface MSOpt { id: number; name: string; sub?: string }

/**
 * Multi-seleção com busca por texto: lista rolável + checkbox + chips dos selecionados.
 * `search(q)` retorna as opções (q='' = lista inicial). Use useCallback no pai p/ estabilidade.
 */
export function MultiSelect({ placeholder, selected, onChange, search, danger }: {
  placeholder: string
  selected: MSOpt[]
  onChange: (next: MSOpt[]) => void
  search: (q: string) => Promise<MSOpt[]>
  danger?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState<MSOpt[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(() => {
      search(q).then(r => setOpts(r ?? [])).catch(() => setOpts([])).finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q, open, search])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const selIds = new Set(selected.map(s => s.id))
  const accent = danger ? 'var(--danger)' : 'var(--primary)'
  const accentSoft = danger ? 'var(--danger-bg)' : 'var(--primary-soft)'
  const toggle = (o: MSOpt) => onChange(selIds.has(o.id) ? selected.filter(s => s.id !== o.id) : [...selected, o])

  return (
    <div className="relative" ref={ref}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {selected.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: accentSoft, color: accent }}>
              {s.name}<button type="button" onClick={() => onChange(selected.filter(x => x.id !== s.id))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-left"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-light)' }}>
        <Search size={13} style={{ color: 'var(--text-light)' }} />
        <span className="flex-1" style={{ color: selected.length ? 'var(--text)' : 'var(--text-light)' }}>
          {selected.length ? `${selected.length} selecionado${selected.length > 1 ? 's' : ''}` : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-light)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg overflow-hidden shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-light)' }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
              className="text-sm py-0.5 outline-none w-full bg-transparent" style={{ color: 'var(--text)' }} />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {loading && <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Buscando…</div>}
            {!loading && opts.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum resultado.</div>}
            {!loading && opts.map(o => {
              const on = selIds.has(o.id)
              return (
                <button key={o.id} type="button" onClick={() => toggle(o)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:opacity-90"
                  style={{ background: on ? accentSoft : 'transparent', color: 'var(--text)' }}>
                  <span className="inline-flex items-center justify-center shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${on ? accent : 'var(--border)'}`, background: on ? accent : 'transparent' }}>
                    {on && <Check size={11} style={{ color: 'var(--primary-fg)' }} />}
                  </span>
                  <span className="flex-1 truncate">{o.name}{o.sub && <span className="text-[11px] ml-1" style={{ color: 'var(--text-light)' }}>· {o.sub}</span>}</span>
                </button>
              )
            })}
          </div>
          {selected.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t text-[11px]" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-light)' }}>{selected.length} selecionado{selected.length > 1 ? 's' : ''}</span>
              <button type="button" onClick={() => onChange([])} style={{ color: accent }}>limpar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
