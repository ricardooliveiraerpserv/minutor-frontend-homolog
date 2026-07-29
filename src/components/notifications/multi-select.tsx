'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Check, ChevronDown } from 'lucide-react'

export interface MSOpt { id: number; name: string; sub?: string }

/**
 * Multi-seleção com busca por texto: lista rolável + checkbox + chips dos selecionados.
 * `search(q)` retorna as opções (q='' = lista inicial). Use useCallback no pai p/ estabilidade.
 *
 * O painel aberto é renderizado em PORTAL (document.body) com posição `fixed`, para NÃO ser
 * cortado por `overflow-hidden` de modais/cards ancestrais (ex.: modal Nova reunião).
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
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // Posição fixed do painel (portal). up = abre pra cima quando falta espaço embaixo.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)

  const recalc = () => {
    const b = btnRef.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const up = spaceBelow < 260 && spaceAbove > spaceBelow
    const maxH = Math.max(140, Math.min(320, (up ? spaceAbove : spaceBelow) - 16))
    setPos(up
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxH }
      : { left: r.left, width: r.width, top: r.bottom + 4, maxH })
  }

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    recalc()
    const onScroll = () => recalc()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll) }
  }, [open])

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
    // Fecha ao clicar fora — considera TANTO o gatilho (ref) quanto o painel portado (popRef).
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
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

      <button type="button" ref={btnRef} onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-left"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-light)' }}>
        <Search size={13} style={{ color: 'var(--text-light)' }} />
        <span className="flex-1" style={{ color: selected.length ? 'var(--text)' : 'var(--text-light)' }}>
          {selected.length ? `${selected.length} selecionado${selected.length > 1 ? 's' : ''}` : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-light)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} className="rounded-lg overflow-hidden shadow-lg"
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, zIndex: 90, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-light)' }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
              className="text-sm py-0.5 outline-none w-full bg-transparent" style={{ color: 'var(--text)' }} />
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxH }}>
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
        </div>,
        document.body,
      )}
    </div>
  )
}
