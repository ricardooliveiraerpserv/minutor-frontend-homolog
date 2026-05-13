'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import type { ProjectKanbanItem } from '@/hooks/use-projects-for-kanban'

interface Props {
  project: ProjectKanbanItem
  isDragging?: boolean
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function ProjectKanbanCard({ project, isDragging }: Props) {
  const sold = n(project.sold_hours)
  const consumed = n(project.consumed_hours)
  const pct = sold > 0 ? Math.min(100, Math.round((consumed / sold) * 100)) : 0
  const consultants = project.consultants?.length ?? 0
  const due = formatDate(project.expected_end_date)
  const overdue = project.expected_end_date
    && new Date(project.expected_end_date) < new Date()
    && project.status !== 'finished'

  const healthColor =
    pct >= 90 ? 'var(--danger)' :
    pct >= 70 ? 'var(--warning)' : 'var(--success)'

  return (
    <Link
      href={`/projetos/${project.id}`}
      className="ds-card"
      style={{
        display: 'block',
        padding: 12,
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--surface)',
        borderLeft: overdue ? '2px solid var(--danger)' : '1px solid var(--border)',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
        transition: 'box-shadow .12s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {project.name}
        </div>
        {project.code && (
          <span style={{ fontSize: 10, color: 'var(--text-light)', fontFamily: 'monospace' }}>
            {project.code}
          </span>
        )}
      </div>

      {project.customer?.name && (
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {project.customer.name}
        </div>
      )}

      {sold > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            height: 3,
            width: '100%',
            background: 'var(--surface-hover)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: healthColor,
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            <span>{Math.round(consumed)}h / {Math.round(sold)}h</span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Users size={11} />
          {consultants}
        </span>
        {due && (
          <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>
            {due}
          </span>
        )}
      </div>
    </Link>
  )
}
