'use client'

import { useState, useRef, useEffect } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useModules } from '@/contexts/module-context'
import { MODULES } from '@/lib/modules'

// Launcher de apps estilo ERP (Movidesk): ícone de grade no header → dropdown com os
// módulos do perfil. Trocar de módulo navega pra home dele (não sobra nada do anterior).
export function AppsMenu() {
  const { allowedModules, selectedModule, setModule } = useModules()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const tiles = MODULES.filter(m => allowedModules.includes(m.id))
  if (tiles.length < 2) return null // só faz sentido com ≥2 módulos

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Aplicativos"
        aria-label="Aplicativos"
        className="p-1.5 rounded-md transition-colors hover:bg-zinc-800"
        style={{ color: 'var(--brand-text)' }}
      >
        <LayoutGrid size={18} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 z-50 rounded-xl p-3 shadow-xl grid grid-cols-2 gap-2 w-64"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}
        >
          {tiles.map(m => (
            <button
              key={m.id}
              onClick={() => { setModule(m.id); setOpen(false) }}
              className="flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors"
              style={selectedModule === m.id
                ? { background: 'var(--primary-soft)', border: '1px solid var(--primary)' }
                : { border: '1px solid var(--brand-border)' }}
            >
              <span className="text-3xl" aria-hidden>{m.emoji}</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
