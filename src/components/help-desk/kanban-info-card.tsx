'use client'

import { useState } from 'react'
import { Info, ChevronDown } from 'lucide-react'

export interface KanbanInfoColumn { label: string; cor?: string | null; desc: string }
export interface KanbanInfoSla { dot: string; label: string }

/**
 * Card recolhível de ajuda do kanban: explica o que cada COLUNA significa + os indicadores de SLA.
 * Reutilizado nos 3 perfis (cliente no portal, consultor e admin na Fila). Recebe as colunas e a
 * legenda de SLA já montadas por cada tela (as descrições variam por contexto).
 */
export function KanbanInfoCard({ columns, sla, defaultOpen = false }: {
  columns: KanbanInfoColumn[]
  sla?: KanbanInfoSla[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="ds-card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
        <Info size={15} style={{ color: 'var(--primary)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Entenda o quadro</span>
        <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>— o que cada coluna significa e o SLA</span>
        <ChevronDown size={16} className="ml-auto shrink-0 transition-transform" style={{ color: 'var(--text-light)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-light)' }}>Colunas</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {columns.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: c.cor ?? 'var(--text-muted)' }} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: c.cor ?? 'var(--text)' }}>{c.label}</div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {sla && sla.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-light)' }}>SLA — prazo de atendimento</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {sla.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="text-sm leading-none">{s.dot}</span> {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
