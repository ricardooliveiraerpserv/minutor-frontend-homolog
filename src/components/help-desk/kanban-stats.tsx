'use client'

export interface KanbanStat { label: string; count: number; cor?: string | null }
export interface KanbanMetric { label: string; value: string | number; hint?: string; cor?: string | null }

/**
 * Faixa de indicadores do kanban: em cima os chamados por COLUNA/fila; embaixo os indicadores
 * (total de abertos, % de SLA no prazo, vencendo/estourado, agendados, etc.). Reutilizado nos 3
 * perfis (cliente/consultor/admin); cada tela calcula seus números.
 */
export function KanbanStats({ columns, activeColumn, onColumnClick, total }: { columns: KanbanStat[]; activeColumn?: string; onColumnClick?: (label: string) => void; total?: number }) {
  const clickable = !!onColumnClick
  return (
    <div className="space-y-2.5">
      {columns.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Chamados por coluna{clickable ? ' · clique para filtrar' : ''}</span>
            {typeof total === 'number' && (
              <span className="inline-flex items-baseline gap-1 shrink-0 px-2.5 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <span className="text-sm font-bold leading-none">{total}</span>
                <span className="text-[11px] font-medium">{total === 1 ? 'chamado' : 'chamados'}</span>
              </span>
            )}
          </div>
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {columns.map((s, i) => {
              const active = !!activeColumn && activeColumn === s.label
              return (
                <button key={i} type="button" disabled={!clickable} onClick={() => onColumnClick?.(s.label)}
                  title={clickable ? (active ? 'Remover filtro' : `Filtrar: ${s.label}`) : undefined}
                  className={`ds-card appearance-none text-left shrink-0 px-2.5 py-2 flex items-center gap-2 min-w-max transition ${clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
                  style={{ borderLeft: `3px solid ${s.cor ?? 'var(--border)'}`, ...(active ? { boxShadow: `inset 0 0 0 2px ${s.cor ?? 'var(--primary)'}`, background: `${(s.cor ?? '#64748b')}14` } : {}) }}>
                  <span className="text-lg font-bold leading-none" style={{ color: 'var(--text)' }}>{s.count}</span>
                  <span className="text-[11px] leading-tight whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
