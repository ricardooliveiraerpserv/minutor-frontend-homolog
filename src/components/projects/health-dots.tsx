'use client'

import type { HealthLevel, StageHealth } from '@/lib/utils/stage-health'

const COLOR: Record<HealthLevel, string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  bad: 'var(--danger)',
  unknown: 'var(--border)',
}

const LABEL: Record<HealthLevel, string> = {
  ok: 'saudável',
  warn: 'atenção',
  bad: 'crítico',
  unknown: 'sem dado',
}

function Dot({ level, title }: { level: HealthLevel; title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: COLOR[level],
        flexShrink: 0,
      }}
    />
  )
}

export function HealthDots({ health }: { health: StageHealth }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Dot level={health.deadline} title={`Prazo: ${LABEL[health.deadline]}`} />
      <Dot level={health.hours} title={`Horas: ${LABEL[health.hours]}`} />
      <Dot level={health.delivery} title={`Entrega: ${LABEL[health.delivery]}`} />
    </div>
  )
}
