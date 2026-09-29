'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown, Search } from 'lucide-react'

// Seletor de Serviço em ÁRVORE (pai/filhos) — estilo Movidesk: expansível, com busca e
// nós não-selecionáveis (selectable_by_agent=false) apenas como agrupadores (cinza).
export interface SvcNode { id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }

export function ServiceTreeSelect({ services, value, onChange, placeholder = '—' }: { services: SvcNode[]; value: number | null; onChange: (id: number | null) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const childrenOf = useMemo(() => {
    const m = new Map<number, SvcNode[]>()
    for (const s of services) { const k = s.parent_id ?? 0; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s) }
    return m
  }, [services])

  const selected = services.find(s => s.id === value) ?? null
  const q = query.trim().toLowerCase()
  // Em busca: mantém os nós que casam + seus ancestrais (mostra o caminho na árvore).
  const matchSet = useMemo(() => {
    if (!q) return null
    const byId = new Map(services.map(s => [s.id, s]))
    const keep = new Set<number>()
    for (const s of services) {
      if (s.name.toLowerCase().includes(q)) {
        let cur: SvcNode | undefined = s
        while (cur) { keep.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
      }
    }
    return keep
  }, [q, services])

  const isExpanded = (id: number) => (q ? true : expanded.has(id))
  const toggle = (id: number) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pick = (s: SvcNode) => { if (s.selectable_by_agent === false) return; onChange(s.id); setOpen(false); setQuery('') }

  const renderNodes = (parentKey: number, depth: number): React.ReactNode => {
    const kids = (childrenOf.get(parentKey) ?? []).filter(s => !matchSet || matchSet.has(s.id))
    return kids.map(s => {
      const hasKids = (childrenOf.get(s.id) ?? []).length > 0
      const disabled = s.selectable_by_agent === false
      return (
        <div key={s.id}>
          <div className="flex items-center gap-1 rounded ds-row-hover" style={{ paddingLeft: 6 + depth * 16 }}>
            {hasKids
              ? <button onClick={e => { e.stopPropagation(); toggle(s.id) }} className="shrink-0 p-0.5" aria-label="Expandir">{isExpanded(s.id) ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}</button>
              : <span className="w-[18px] shrink-0" />}
            <button className="text-sm text-left flex-1 py-1.5 truncate" disabled={disabled} onClick={() => pick(s)}
              style={{ color: disabled ? 'var(--text-light)' : (s.id === value ? 'var(--primary)' : 'var(--text)'), cursor: disabled ? 'default' : 'pointer', fontWeight: s.id === value ? 600 : 400 }}>
              {s.name}{s.code ? <span style={{ color: 'var(--text-light)' }}> ({s.code})</span> : ''}
            </button>
          </div>
          {hasKids && isExpanded(s.id) && renderNodes(s.id, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none flex items-center justify-between gap-2"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: selected ? 'var(--text)' : 'var(--text-light)' }}>
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <ChevronDown size={14} style={{ color: 'var(--text-light)' }} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-lg shadow-xl max-h-72 overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: 'var(--surface-sunken)' }}>
              <Search size={13} style={{ color: 'var(--text-light)' }} />
              <input autoFocus className="bg-transparent outline-none text-sm flex-1 min-w-0" style={{ color: 'var(--text)' }} placeholder="Buscar serviço…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="overflow-y-auto p-1">
            <button className="w-full text-left text-sm px-2 py-1.5 rounded ds-row-hover" style={{ color: 'var(--text-muted)' }} onClick={() => { onChange(null); setOpen(false); setQuery('') }}>— Selecione —</button>
            {renderNodes(0, 0)}
            {matchSet && matchSet.size === 0 && <div className="text-xs text-center py-3" style={{ color: 'var(--text-light)' }}>Nenhum serviço encontrado.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
