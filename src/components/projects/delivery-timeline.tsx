'use client'

import { useDeliveryEvents } from '@/hooks/use-delivery-events'
import type { DeliveryEvent } from '@/lib/types/project-stage'

const TYPE_LABEL: Record<string, string> = {
  created: 'criou',
  status_changed: 'mudou status',
  reassigned: 'reatribuiu',
  completed: 'concluiu',
  hours_logged: 'lançou horas',
  hours_edited: 'editou horas',
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando cliente',
  review: 'Homologação',
  done: 'Concluído',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function describe(ev: DeliveryEvent): string {
  if (ev.type === 'status_changed') {
    const from = STATUS_LABEL[ev.payload?.from as string] ?? '—'
    const to = STATUS_LABEL[ev.payload?.to as string] ?? '—'
    return `mudou status: ${from} → ${to}`
  }
  if (ev.type === 'completed') return 'concluiu a entrega'
  if (ev.type === 'created') return 'criou a entrega'
  if (ev.type === 'reassigned') return 'reatribuiu responsável'
  return TYPE_LABEL[ev.type] ?? ev.type
}

export function DeliveryTimeline({ deliveryId }: { deliveryId: number }) {
  const { events, loading, error } = useDeliveryEvents(deliveryId)

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Carregando timeline…</div>
  if (error) return <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>
  if (events.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sem eventos.</div>

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {events.map((ev, i) => (
        <li
          key={ev.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '8px 0',
            borderBottom: i === events.length - 1 ? 'none' : '1px solid var(--border)',
          }}
        >
          <div style={{ flexShrink: 0, paddingTop: 4 }}>
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--info)',
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text)' }}>
              <strong style={{ fontWeight: 500 }}>{ev.actor?.name ?? 'Sistema'}</strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{describe(ev)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
              {timeAgo(ev.created_at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
