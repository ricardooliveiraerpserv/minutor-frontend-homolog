'use client'

import { useApiQuery } from '@/hooks/use-query'

interface Project {
  id: number
  name: string
  code: string | null
  status: string
  status_display?: string
  customer?: { id: number; name: string } | null
  sold_hours?: number | string | null
  consumed_hours?: number | string | null
  general_hours_balance?: number | string | null
  expected_end_date?: string | null
  kanban_stage?: string | null
}

interface TimesheetItem {
  id: number
  date: string
  user?: { name: string } | null
  effort_minutes: number
  observation?: string | null
}

interface Props {
  project: Project
  consultantsCount?: number
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function formatHours(value: number): string {
  if (!value) return '0h'
  return value >= 100 ? `${Math.round(value)}h` : `${value.toFixed(1)}h`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 8,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export function ProjectHeaderExecutive({ project }: Props) {
  const sold = n(project.sold_hours)
  const consumed = n(project.consumed_hours)
  const balance = n(project.general_hours_balance)
  const pct = sold > 0 ? Math.min(100, (consumed / sold) * 100) : 0

  const healthColor =
    pct >= 90 ? 'var(--danger)' :
    pct >= 70 ? 'var(--warning)' : 'var(--success)'

  // Última atividade — V1: último timesheet do projeto
  const { data: tsResp } = useApiQuery<{ items: TimesheetItem[] }>(
    `/timesheets?project_id=${project.id}&pageSize=1&order=-date,-created_at`
  )
  const last = tsResp?.items?.[0]

  return (
    <div style={{
      padding: '16px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--brand-bg)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {project.name}
            </h1>
            {project.code && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {project.code}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
            {project.customer?.name && <span>{project.customer.name}</span>}
            {project.status_display && (
              <span className="ds-status ds-status-info" style={{ fontSize: 11 }}>
                {project.status_display}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginTop: 14,
      }}>
        <KPI label="Vendidas" value={formatHours(sold)} />
        <KPI label="Consumidas" value={formatHours(consumed)} sub={`${Math.round(pct)}%`} />
        <KPI label="Saldo" value={formatHours(balance)} />
        {project.expected_end_date && (
          <KPI label="Prazo" value={new Date(project.expected_end_date).toLocaleDateString('pt-BR')} />
        )}
      </div>

      {sold > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            height: 4,
            width: '100%',
            background: 'var(--surface-hover)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: healthColor,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      )}

      {last && (
        <div style={{
          marginTop: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--success)',
            display: 'inline-block',
          }} />
          <span>
            <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{last.user?.name ?? 'Alguém'}</strong>
            {' apontou '}
            {formatHours((last.effort_minutes ?? 0) / 60)}
            {' · '}
            {timeAgo(last.date)}
          </span>
        </div>
      )}
    </div>
  )
}
