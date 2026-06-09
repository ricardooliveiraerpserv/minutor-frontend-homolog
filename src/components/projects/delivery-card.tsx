'use client'

import { Lock } from 'lucide-react'
import type { StageDelivery } from '@/lib/types/project-stage'
import { parseDateLocal } from '@/lib/date-only'
import { ResponsibleChip } from './responsible-chip'
import { useUserCapacityIndex } from '@/hooks/use-user-capacity'

interface Props {
  delivery: StageDelivery
  onClick: () => void
  isDragging?: boolean
  /** Título da atividade predecessora (pra "Bloqueada por: {X}"). Passado pelo parent que tem visibilidade do conjunto. */
  predecessorTitle?: string
  /** Código hierárquico (1.1, 1.2...) — passado pelo parent. Fase 7. */
  code?: string
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

function formatHours(planned: number, actual: number | undefined): string {
  if (actual === undefined) return planned ? `${planned}h` : '—'
  return `${actual.toFixed(1)}/${planned}h`
}

export function DeliveryCard({ delivery, onClick, isDragging, predecessorTitle, code }: Props) {
  const planned = Number(delivery.hours_planned ?? 0)
  const actual = delivery.effort_minutes_sum !== undefined && delivery.effort_minutes_sum !== null
    ? Number(delivery.effort_minutes_sum) / 60
    : undefined
  const overdue = delivery.due_date && parseDateLocal(delivery.due_date) < new Date(new Date().toDateString()) && delivery.status !== 'done'
  const due = formatDue(delivery.due_date)
  const isBlocked = delivery.predecessor_state === 'pending' && delivery.status === 'backlog'
  const { byUserId } = useUserCapacityIndex()
  const responsibleCapacity = delivery.responsible_user_id ? byUserId[delivery.responsible_user_id] : undefined

  return (
    // NÃO usar <button>: o @hello-pangea/dnd não inicia drag a partir de elementos
    // interativos (button/input/a). Como o card vive dentro de um Draggable, usamos
    // <div role="button"> pra permitir o arrastar mantendo o clique/teclado.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
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
            {code && <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginRight: 4, fontVariantNumeric: 'tabular-nums' }}>{code}</span>}
            {delivery.title}
          </div>
          {isBlocked && (
            <div
              title={predecessorTitle ? `Bloqueada por: ${predecessorTitle}` : 'Aguardando conclusão do predecessor'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                fontSize: 10,
                fontWeight: 500,
                maxWidth: '100%',
              }}
            >
              <Lock size={9} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Bloqueada por: <strong>{predecessorTitle ?? 'predecessor'}</strong>
              </span>
            </div>
          )}
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
        <span style={{ overflow: 'hidden', maxWidth: '60%' }}>
          <ResponsibleChip user={delivery.responsible} capacity={responsibleCapacity} compact />
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {due && (
            <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>{due}</span>
          )}
          <span>{formatHours(planned, actual)}</span>
        </span>
      </div>
    </div>
  )
}
