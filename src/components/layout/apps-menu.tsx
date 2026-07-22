'use client'

import { useState, useRef, useEffect } from 'react'
import { LayoutGrid, icons as lucideIcons } from 'lucide-react'
import { useModules } from '@/contexts/module-context'

// Resolve um ícone lucide pelo nome (string vinda do Configurador); fallback = grade.
function iconByName(name?: string) {
  const I = (name && (lucideIcons as Record<string, React.ComponentType<{ size?: number }>>)[name]) || LayoutGrid
  return I as React.ComponentType<{ size?: number }>
}

// Launcher de apps estilo ERP: ícone de grade no header → dropdown com os módulos do perfil
// (definidos no Configurador). Trocar de módulo recarrega o menu lateral.
export function AppsMenu() {
  const { modules, selectedModule, setModule } = useModules()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (modules.length < 2) return null // só faz sentido com ≥2 módulos

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Aplicativos"
        aria-label="Aplicativos"
        className="p-1 sm:p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text)' }}
      >
        <LayoutGrid size={18} className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
      </button>
      {open && (
        <div
          className="fixed left-2 right-2 top-[calc(var(--env-banner-h,0px)+3.5rem)] w-auto sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-64 z-50 rounded-xl p-3 shadow-xl grid grid-cols-2 gap-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}
        >
          {modules.map(m => {
            const Icon = iconByName(m.icon)
            return (
              <button
                key={m.key}
                onClick={() => { setModule(m.key); setOpen(false) }}
                className="flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors"
                style={selectedModule === m.key
                  ? { background: 'var(--primary-soft)', border: '1px solid var(--primary)' }
                  : { border: '1px solid var(--border)' }}
              >
                <Icon size={26} />
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--text)' }}>{m.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
