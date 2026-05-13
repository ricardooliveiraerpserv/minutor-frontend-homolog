'use client'

import Link from 'next/link'
import type { ProjectStage } from '@/lib/types/project-stage'
import { computeStageHealth } from '@/lib/utils/stage-health'
import { HealthDots } from './health-dots'

interface Props {
  stage: ProjectStage
  projectId: number
  hoursActual?: number
}

function formatHours(n: number): string {
  if (!n) return '0h'
  return n >= 10 ? `${Math.round(n)}h` : `${n.toFixed(1)}h`
}

export function StageCard({ stage, projectId, hoursActual }: Props) {
  const health = computeStageHealth({ stage, hoursActual })
  const planned = Number(stage.hours_planned ?? 0)
  const total = stage.deliveries_count ?? 0
  const done = stage.deliveries_done_count ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const consumedPct = planned > 0 && hoursActual !== undefined
    ? Math.round((hoursActual / planned) * 100)
    : null

  return (
    <Link
      href={`/projetos/${projectId}/etapas/${stage.id}`}
      className="ds-card ds-card-pad ds-row-hover"
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform .12s ease, border-color .12s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {stage.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {stage.responsible?.name ?? 'Sem responsável'}
          </div>
        </div>
        <HealthDots health={health} />
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{
          height: 4,
          width: '100%',
          background: 'var(--surface-hover)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, pct)}%`,
            background: 'var(--primary)',
            transition: 'width .3s ease',
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <span>{total > 0 ? `${done}/${total} entregas` : 'Sem entregas'}</span>
          <span>{pct}%</span>
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 10,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        <span>
          {hoursActual !== undefined ? formatHours(hoursActual) : '—'}
          <span style={{ opacity: .5 }}> / {formatHours(planned)}</span>
        </span>
        {consumedPct !== null && (
          <span>{consumedPct}% horas</span>
        )}
      </div>
    </Link>
  )
}
