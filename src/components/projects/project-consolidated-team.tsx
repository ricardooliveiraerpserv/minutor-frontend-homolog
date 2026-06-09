'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import { useConsolidatedTeam, type ConsolidatedTeamRow } from '@/hooks/use-consolidated-team'

interface Props {
  projectId: number
}

function formatHours(n: number): string {
  const v = Number(n) || 0
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

function ConsultantRow({ row }: { row: ConsolidatedTeamRow }) {
  const [expanded, setExpanded] = useState(false)
  const pct = row.total_planned > 0
    ? Math.min(150, Math.round((row.total_actual / row.total_planned) * 100))
    : 0
  const isOverrun = row.total_actual > row.total_planned
  const barColor = isOverrun
    ? 'var(--danger)'
    : pct > 80
      ? 'var(--warning)'
      : 'var(--success)'

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
            {row.user.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {row.stages.length} {row.stages.length === 1 ? 'etapa' : 'etapas'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 220px' }}>
          <div style={{
            flex: 1, height: 5,
            background: 'var(--surface-hover)',
            borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, pct)}%`,
              background: barColor,
              transition: 'width .2s ease',
            }} />
          </div>
          <span style={{
            fontSize: 11,
            color: isOverrun ? 'var(--danger)' : 'var(--text-muted)',
            fontWeight: isOverrun ? 600 : 400,
            whiteSpace: 'nowrap',
            minWidth: 150,
            textAlign: 'right',
          }}>
            {formatHours(row.total_actual)} / {formatHours(row.total_planned)}
            <span style={{ marginLeft: 6, color: row.total_remaining < 0 ? 'var(--danger)' : 'var(--text-light)' }}>
              · saldo {formatHours(row.total_remaining)}
            </span>
          </span>
        </div>
      </button>

      {expanded && (
        <ul style={{
          listStyle: 'none', margin: 0, padding: '8px 12px 10px 36px',
          background: 'var(--surface-hover)',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {row.stages.map(s => {
            const sPct = s.planned > 0 ? Math.round((s.actual / s.planned) * 100) : 0
            const sOverrun = s.actual > s.planned
            return (
              <li key={s.stage_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 12,
              }}>
                <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.stage_name}
                </span>
                <span style={{
                  color: sOverrun ? 'var(--danger)' : 'var(--text-muted)',
                  fontWeight: sOverrun ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {formatHours(s.actual)} / {formatHours(s.planned)} · {sPct}%
                  <span style={{ marginLeft: 6, color: (s.planned - s.actual) < 0 ? 'var(--danger)' : 'var(--text-light)' }}>
                    · saldo {formatHours(s.planned - s.actual)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function ProjectConsolidatedTeam({ projectId }: Props) {
  const { items, isOperational, totals, loading, error } = useConsolidatedTeam(projectId)

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando equipe…</div>
  }
  if (error) {
    return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
  }
  if (!isOperational) {
    // Sustentação usa equipe direta — não renderiza esta view aqui
    return null
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10, gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600,
          }}>
            Equipe consolidada
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {totals.consultant_count} {totals.consultant_count === 1 ? 'consultor' : 'consultores'}
          {' · '}
          {formatHours(totals.total_actual)} / {formatHours(totals.total_planned)}
          <span style={{ marginLeft: 6, color: (totals.total_planned - totals.total_actual) < 0 ? 'var(--danger)' : 'var(--text-light)' }}>
            · saldo {formatHours(totals.total_planned - totals.total_actual)}
          </span>
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: '24px 16px', textAlign: 'center',
          fontSize: 13, color: 'var(--text-muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          Nenhuma alocação ainda. Aloque consultores nas etapas.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(row => <ConsultantRow key={row.user.id} row={row} />)}
        </div>
      )}
    </div>
  )
}
