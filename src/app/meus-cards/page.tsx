'use client'

import Link from 'next/link'
import { AlertTriangle, Clock, Hourglass, Inbox, RefreshCw } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { CardsSkeleton } from '@/components/ui/loading'
import { useMyCards, type MyCard, type MyCardsSection } from '@/hooks/use-my-cards'

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--text-light)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
}

const SECTION_META: Record<MyCardsSection, { label: string; icon: typeof AlertTriangle; accent: string }> = {
  overdue:        { label: 'Atrasadas',         icon: AlertTriangle, accent: 'var(--danger)' },
  waiting_client: { label: 'Aguardando cliente', icon: Hourglass,     accent: 'var(--warning)' },
  in_progress:    { label: 'Em andamento',       icon: Clock,         accent: 'var(--primary)' },
  backlog:        { label: 'Backlog',            icon: Inbox,         accent: 'var(--text-muted)' },
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando cliente',
  review: 'Homologação',
  done: 'Concluída',
}

function formatDue(iso: string | null): { text: string | null; tone: 'normal' | 'soon' | 'overdue' } {
  if (!iso) return { text: null, tone: 'normal' }
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return { text: `${Math.abs(days)}d atrás`, tone: 'overdue' }
  if (days === 0) return { text: 'hoje', tone: 'soon' }
  if (days === 1) return { text: 'amanhã', tone: 'soon' }
  if (days < 7) return { text: `em ${days}d`, tone: 'soon' }
  return { text: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), tone: 'normal' }
}

function CardItem({ card }: { card: MyCard }) {
  const due = formatDue(card.due_date)
  const dueColor =
    due.tone === 'overdue' ? 'var(--danger)' :
    due.tone === 'soon' ? 'var(--warning)' :
    'var(--text-muted)'

  return (
    <Link
      href={`/projetos/${card.project_id}/etapas/${card.stage_id}`}
      className="ds-card"
      style={{
        display: 'block',
        padding: 12,
        textDecoration: 'none',
        background: 'var(--surface)',
        borderLeft: due.tone === 'overdue' ? '2px solid var(--danger)' : '1px solid var(--border)',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span
          title={`Prioridade: ${card.priority}`}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: PRIORITY_COLOR[card.priority] ?? PRIORITY_COLOR.medium,
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
            {card.title}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {card.customer_name ? `${card.customer_name} · ` : ''}{card.project_name} · {card.stage_name}
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
        <span>{STATUS_LABEL[card.status] ?? card.status}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {due.text && <span style={{ color: dueColor }}>{due.text}</span>}
          <span>{card.hours_planned ? `${card.hours_planned}h` : '—'}</span>
        </span>
      </div>
    </Link>
  )
}

function Section({
  section,
  items,
}: {
  section: MyCardsSection
  items: MyCard[]
}) {
  const meta = SECTION_META[section]
  const Icon = meta.icon
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={14} style={{ color: meta.accent }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {meta.label}
        </span>
        <span style={{
          fontSize: 11,
          padding: '1px 7px',
          borderRadius: 999,
          background: 'var(--surface-hover)',
          color: 'var(--text-muted)',
        }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{
          padding: '20px 12px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-light)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
        }}>
          Nada por aqui
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(c => <CardItem key={c.id} card={c} />)}
        </div>
      )}
    </div>
  )
}

export default function MeusCardsPage() {
  const { sections, totals, loading, error, refetch } = useMyCards()

  const total =
    (totals.overdue ?? 0) +
    (totals.waiting_client ?? 0) +
    (totals.in_progress ?? 0) +
    (totals.backlog ?? 0)

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
              Meus Cards
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {total} {total === 1 ? 'entrega atribuída' : 'entregas atribuídas'} a você
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="ds-btn-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 10px' }}
          >
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>

        {loading && total === 0 && (
          <CardsSkeleton count={4} />
        )}
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        )}

        {!error && !(loading && total === 0) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}>
            <Section section="overdue"        items={sections.overdue} />
            <Section section="waiting_client" items={sections.waiting_client} />
            <Section section="in_progress"    items={sections.in_progress} />
            <Section section="backlog"        items={sections.backlog} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
