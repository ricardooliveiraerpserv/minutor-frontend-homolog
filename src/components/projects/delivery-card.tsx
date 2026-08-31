'use client'

import type { StageDelivery } from '@/lib/types/project-stage'

interface Props {
  delivery: StageDelivery
  onClick: () => void
  isDragging?: boolean
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--text-light)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
}

function formatDue(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
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

function fmtH(v: number): string {
  const n = Number(v) || 0
  return `${Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10}h`
}

export function DeliveryCard({ delivery, onClick, isDragging }: Props) {
  const planned = Number(delivery.hours_planned ?? 0)
  const actual = delivery.effort_minutes_sum !== undefined && delivery.effort_minutes_sum !== null
    ? Number(delivery.effort_minutes_sum) / 60
    : undefined
  // Disponível ao consultor (planejadas) · Apontadas · Saldo.
  const disp = planned
  const apont = actual ?? 0
  const saldo = disp - apont
  const overdue = delivery.due_date && new Date(delivery.due_date) < new Date() && delivery.status !== 'done'
  const due = formatDue(delivery.due_date)

  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-card"
      style={{
        display: 'block',
        width: '100%',
        padding: 12,
        textAlign: 'left',
        cursor: isDragging ? 'grabbing' : 'pointer',
        background: 'var(--surface)',
        borderLeft: overdue ? '2px solid var(--danger)' : '1px solid var(--border)',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
        transition: 'box-shadow .12s ease, transform .12s ease',
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
        <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Prazo: <b style={{ color: overdue ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>{due ?? '—'}</b>
        </span>
      </div>

      {/* Horas do consultor na atividade: Disponível (planejadas), Apontadas e Saldo. */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 8, fontSize: 10,
        color: 'var(--text-light)',
      }}>
        <span>Disp <b style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtH(disp)}</b></span>
        <span>Apont <b style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtH(apont)}</b></span>
        <span>Saldo <b style={{ color: saldo < 0 ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>{fmtH(saldo)}</b></span>
      </div>
    </button>
  )
}
