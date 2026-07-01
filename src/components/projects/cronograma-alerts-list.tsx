'use client'

import { useState } from 'react'
import { AlertTriangle, AlertOctagon, ChevronDown, ChevronRight } from 'lucide-react'
import type { CronogramaAlert } from '@/hooks/use-project-schedule'

interface Props {
  alerts: CronogramaAlert[]
}

/**
 * Lista compacta de alertas operacionais do Cronograma (Fase 10).
 * Colapsável; mostra contadores no header.
 */
export function CronogramaAlertsList({ alerts }: Props) {
  const [open, setOpen] = useState(false)
  if (alerts.length === 0) return null

  const danger = alerts.filter(a => a.severity === 'danger')
  const warn   = alerts.filter(a => a.severity === 'warning')

  return (
    <div className="ds-card" style={{
      padding: '8px 12px', marginBottom: 12,
      borderLeft: `3px solid ${danger.length > 0 ? 'var(--danger)' : 'var(--warning)'}`,
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0, color: 'var(--text)', fontSize: 13, fontWeight: 600,
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {danger.length > 0 ? <AlertOctagon size={14} style={{ color: 'var(--danger)' }} /> : <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />}
        <span>Alertas operacionais</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>
          ({danger.length > 0 && `${danger.length} crítico${danger.length > 1 ? 's' : ''}`}
          {danger.length > 0 && warn.length > 0 && ' · '}
          {warn.length > 0 && `${warn.length} aviso${warn.length > 1 ? 's' : ''}`})
        </span>
      </button>
      {open && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0 0', padding: 0, fontSize: 12 }}>
          {[...danger, ...warn].slice(0, 30).map((a, i) => (
            <li key={i} style={{
              padding: '4px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: a.severity === 'danger' ? 'var(--danger)' : 'var(--warning)',
                flexShrink: 0,
              }} />
              <span style={{ color: 'var(--text-muted)', flex: 1 }}>
                <strong style={{ color: 'var(--text)' }}>{a.title ?? '—'}</strong>: {a.message}
              </span>
            </li>
          ))}
          {alerts.length > 30 && (
            <li style={{ padding: '4px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              e mais {alerts.length - 30} alertas…
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
