'use client'

import { useState, useEffect } from 'react'
import { HelpCircle, ChevronUp, ChevronDown } from 'lucide-react'

/** Legenda/dica explicativa com opção de MINIMIZAR (recolhe e lembra a escolha por usuário/local). */
export function MinimizableHint({ storageKey, title, children }: { storageKey: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  useEffect(() => { try { setOpen(localStorage.getItem(storageKey) !== '0') } catch { /* sem storage */ } }, [storageKey])
  const toggle = () => setOpen(o => {
    const n = !o
    try { localStorage.setItem(storageKey, n ? '1' : '0') } catch { /* sem storage */ }
    return n
  })
  return (
    <div className="rounded-xl mb-3 overflow-hidden" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      <button onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 text-left" title={open ? 'Minimizar' : 'Expandir'}>
        <HelpCircle size={14} className="shrink-0" style={{ color: 'var(--primary)' }} />
        <span className="text-[12px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{title}</span>
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && <div className="px-3 pb-3 text-[12px] leading-relaxed space-y-1.5" style={{ color: 'var(--text-muted)' }}>{children}</div>}
    </div>
  )
}
