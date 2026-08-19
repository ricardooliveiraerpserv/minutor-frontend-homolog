'use client'

import { Paperclip } from 'lucide-react'
import { useStageActivity } from '@/hooks/use-stage-activity'
import { secureUrl } from '@/lib/api'
import type { StageActivityEvent, StageActivityType } from '@/lib/types/stage-activity'

const TYPE_LABEL: Record<StageActivityType, string> = {
  delivery_moved:     'moveu',
  delivery_created:   'criou',
  delivery_completed: 'concluiu',
  hours_logged:       'apontou horas',
  aporte_created:     'aportou',
  block_set:          'bloqueou a etapa',
  block_cleared:      'desbloqueou a etapa',
  comment:            'comentou',
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'Em Execução',
  waiting_client: 'Aguardando Cliente',
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

function describe(ev: StageActivityEvent): string {
  const p = ev.payload || {}
  switch (ev.type) {
    case 'delivery_moved': {
      const title = String(p.title ?? '')
      const from = STATUS_LABEL[p.from as string] ?? String(p.from ?? '—')
      const to = STATUS_LABEL[p.to as string] ?? String(p.to ?? '—')
      return `moveu "${title}" de ${from} para ${to}`
    }
    case 'delivery_created':
      return `criou entrega "${p.title ?? ''}"`
    case 'delivery_completed':
      return `concluiu "${p.title ?? ''}"`
    case 'aporte_created': {
      const hours = Number(p.hours ?? 0)
      const sign = hours >= 0 ? '+' : ''
      return `aporte ${sign}${hours}h — ${p.reason ?? ''}`
    }
    case 'block_set':
      return `bloqueou a etapa: ${p.reason ?? ''}`
    case 'block_cleared':
      return 'desbloqueou a etapa'
    case 'hours_logged':
      return `apontou ${p.hours ?? '?'}h`
    case 'comment':
      return 'comentou'
    default:
      return TYPE_LABEL[ev.type] ?? ev.type
  }
}

interface Props {
  stageId: number
  limit?: number
}

export function StageActivityTimeline({ stageId, limit = 50 }: Props) {
  const { items, loading, error } = useStageActivity(stageId, limit)

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Carregando atividade…</div>
  if (error) return <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>
  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Sem atividade registrada ainda.
      </div>
    )
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((ev, i) => (
        <li
          key={ev.id}
          style={{
            display: 'flex', gap: 10,
            padding: '8px 0',
            borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border)',
          }}
        >
          <div style={{ flexShrink: 0, paddingTop: 5 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6,
              borderRadius: '50%', background: 'var(--info)',
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text)' }}>
              <strong style={{ fontWeight: 500 }}>{ev.actor?.name ?? 'Sistema'}</strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{describe(ev)}</span>
            </div>
            {ev.type === 'comment' && (
              <CommentBody event={ev} />
            )}
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
              {timeAgo(ev.created_at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * Render do corpo de um comentário: texto com mentions parseadas + anexo.
 * Mentions seguem o pattern `@[id:Name]` (server-side parse).
 */
function CommentBody({ event }: { event: StageActivityEvent }) {
  const p = event.payload || {}
  const text = String(p.text ?? '')
  const path = event.attachment_path
  const url = path ? secureUrl(`/storage/${path}`) : null

  return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {text && (
        <div style={{
          fontSize: 13, color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          lineHeight: 1.4,
        }}>
          {renderTextWithMentions(text)}
        </div>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: 'var(--primary)',
            padding: '4px 8px',
            background: 'var(--surface-hover)',
            borderRadius: 4,
            textDecoration: 'none',
            maxWidth: '100%',
            width: 'fit-content',
          }}
        >
          <Paperclip size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.attachment_original_name ?? 'anexo'}
          </span>
          {typeof event.attachment_size === 'number' && (
            <span style={{ color: 'var(--text-light)' }}>· {formatSize(event.attachment_size)}</span>
          )}
        </a>
      )}
    </div>
  )
}

/**
 * Parseia `@[id:Name]` como chip clickable. Tudo fora é texto plano.
 */
function renderTextWithMentions(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /@\[(\d+):([^\]]+)\]/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index))
    }
    parts.push(
      <span
        key={`m-${key++}`}
        style={{
          display: 'inline-block',
          padding: '0 4px',
          borderRadius: 3,
          background: 'var(--primary-soft)',
          color: 'var(--primary)',
          fontWeight: 500,
        }}
      >
        @{m[2]}
      </span>
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
