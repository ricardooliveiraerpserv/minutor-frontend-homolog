'use client'

export interface KanbanStat { label: string; count: number; cor?: string | null }
export interface KanbanMetric { label: string; value: string | number; hint?: string; cor?: string | null }

/**
 * Faixa de indicadores do kanban: em cima os chamados por COLUNA/fila; embaixo os indicadores
 * (total de abertos, % de SLA no prazo, vencendo/estourado, agendados, etc.). Reutilizado nos 3
 * perfis (cliente/consultor/admin); cada tela calcula seus números.
 */
export function KanbanStats({ columns, metrics }: { columns: KanbanStat[]; metrics: KanbanMetric[] }) {
  return (
    <div className="space-y-2.5">
      {columns.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>Chamados por coluna</div>
          <div className="flex flex-wrap gap-2">
            {columns.map((s, i) => (
              <div key={i} className="ds-card px-3 py-2 flex items-center gap-2.5 min-w-[104px]" style={{ borderLeft: `3px solid ${s.cor ?? 'var(--border)'}` }}>
                <span className="text-lg font-bold leading-none" style={{ color: 'var(--text)' }}>{s.count}</span>
                <span className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {metrics.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>Indicadores</div>
          <div className="flex flex-wrap gap-2">
            {metrics.map((m, i) => (
              <div key={i} className="ds-card px-3 py-2 min-w-[120px]"
                style={{ borderLeft: `3px solid ${m.cor ?? 'var(--border)'}`, ...(m.cor ? { background: `${m.cor}12` } : {}) }}>
                <div className="text-xl font-bold leading-none" style={{ color: m.cor ?? 'var(--text)' }}>{m.value}</div>
                <div className="text-[11px] mt-1 leading-tight" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
                {m.hint && <div className="text-[10px] leading-tight" style={{ color: 'var(--text-light)' }}>{m.hint}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
