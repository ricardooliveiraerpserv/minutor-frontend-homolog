'use client'

import type { StageDelivery } from '@/lib/types/project-stage'

interface Props {
  delivery: StageDelivery
  onClick: () => void
  isDragging?: boolean
  code?: string
  predecessorTitle?: string
  /** Colunas disponíveis + callback para mover via dropdown (além do arrastar). */
  columns?: { status: string; label: string }[]
  onMove?: (status: string) => void
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--text-light)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
}

function formatDue(iso: string | null): string | null {
  if (!iso) return null
  // Data YYYY-MM-DD parseada por new Date() vira UTC → no Brasil (UTC-3) volta 1 dia.
  // Força meia-noite LOCAL para exibir o dia correto (ex.: 02/09 não virar "01 de set.").
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  if (days === -1) return 'ontem'
  if (days > 0 && days < 7) return `em ${days}d`
  if (days < 0) return `${Math.abs(days)}d atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatHours(planned: number, actual: number | undefined): string {
  if (actual === undefined) return planned ? `${planned}h` : '—'
  return `${actual.toFixed(1)}/${planned}h`
}

export function DeliveryCard({ delivery, onClick, isDragging, columns, onMove }: Props) {
  const planned = Number(delivery.hours_planned ?? 0)
  const actual = delivery.effort_minutes_sum !== undefined && delivery.effort_minutes_sum !== null
    ? Number(delivery.effort_minutes_sum) / 60
    : undefined
  const overdue = delivery.due_date && new Date(delivery.due_date) < new Date() && delivery.status !== 'done'
  const due = formatDue(delivery.due_date)

  return (
    <div
      className="ds-card"
      style={{
        width: '100%',
        background: 'var(--surface)',
        borderLeft: overdue ? '2px solid var(--danger)' : '1px solid var(--border)',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
        transition: 'box-shadow .12s ease, transform .12s ease',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'block',
          width: '100%',
          padding: 12,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: isDragging ? 'grabbing' : 'pointer',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span
          title={`Prioridade: ${delivery.priority}`}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: PRIORITY_COLOR[delivery.priority] ?? PRIORITY_COLOR.medium,
            marginTop: 6,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.35,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {delivery.title}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {delivery.responsible?.name ?? '—'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {due && (
            <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>{due}</span>
          )}
          <span>{formatHours(planned, actual)}</span>
        </span>
      </div>
      </button>
      {onMove && columns && columns.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{ borderTop: '1px solid var(--border)', padding: '6px 10px' }}
        >
          <select
            className="ds-input"
            value=""
            onChange={e => { const v = e.target.value; if (v) onMove(v); e.currentTarget.value = '' }}
            title="Mover para outra coluna"
            style={{ width: '100%', fontSize: 11, padding: '3px 6px', color: 'var(--text-muted)' }}
          >
            <option value="">Mover para…</option>
            {columns.filter(c => c.status !== delivery.status).map(c => (
              <option key={c.status} value={c.status}>{c.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
