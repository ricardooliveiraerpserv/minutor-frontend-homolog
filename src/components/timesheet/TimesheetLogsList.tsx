'use client'

import { Skeleton } from '@/components/ds'
import { Clock, User, Webhook, Trash2, Pencil, RotateCcw, Settings } from 'lucide-react'

export interface TimesheetLog {
  id: number
  timesheet_id: number
  changed_by: { id: number; name: string } | null
  source: 'manual' | 'movidesk_sync' | 'system' | string
  action: 'updated' | 'deleted' | 'restored' | string
  changes: Record<string, { old: unknown; new: unknown; old_label?: string | null; new_label?: string | null }>
  created_at: string
  timesheet?: {
    id: number
    date: string
    ticket?: string | null
    user?: { id: number; name: string } | null
    project?: { id: number; code: string; name: string } | null
    customer?: { id: number; name: string } | null
  } | null
}

const FIELD_LABELS: Record<string, string> = {
  date: 'Data',
  start_time: 'Início',
  end_time: 'Fim',
  effort_minutes: 'Esforço (min)',
  observation: 'Observação',
  ticket: 'Ticket',
  project_id: 'Projeto',
  customer_id: 'Cliente',
  status: 'Status',
  rejection_reason: 'Motivo da rejeição',
  is_billable_only: 'Somente faturável',
  client_extra_pct: '% extra cliente',
  consultant_extra_pct: '% extra consultor',
  reviewed_by: 'Revisor',
  reviewed_at: 'Revisado em',
  user_id: 'Colaborador',
  origin: 'Origem',
  is_internal_action: 'Ação interna',
  deleted_at: 'Excluído em',
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  manual:        { label: 'Manual',          color: 'var(--primary-soft)' },
  movidesk_sync: { label: 'Sync Movidesk',   color: 'rgba(139,92,246,0.18)' },
  system:        { label: 'Sistema',         color: 'var(--surface-hover)' },
}

const ACTION_LABEL: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  updated:  { label: 'Atualizado', icon: Pencil,    color: 'var(--primary)' },
  deleted:  { label: 'Excluído',   icon: Trash2,    color: 'var(--danger)' },
  restored: { label: 'Restaurado', icon: RotateCcw, color: 'var(--success)' },
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return iso }
}

// Formata valores brutos do log de forma amigável.
// Datetime "2026-05-11 14:48:48" → "11/05/2026 14:48"
// Data "2026-05-11" → "11/05/2026"
// Hora "14:48:48" → "14:48"
function fmtValue(value: unknown): string {
  if (value === null || value === undefined) return '∅'
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  if (typeof value === 'object') return JSON.stringify(value)
  const s = String(value)

  // datetime ISO-like: YYYY-MM-DD HH:MM[:SS] (com ou sem T no meio)
  const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/)
  if (dt) return `${dt[3]}/${dt[2]}/${dt[1]} ${dt[4]}:${dt[5]}`

  // data isolada: YYYY-MM-DD
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (d) return `${d[3]}/${d[2]}/${d[1]}`

  // hora isolada com segundos: HH:MM:SS
  const t = s.match(/^(\d{2}):(\d{2}):\d{2}$/)
  if (t) return `${t[1]}:${t[2]}`

  return s
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

interface Props {
  logs: TimesheetLog[]
  loading?: boolean
  empty?: string
  showTimesheetInfo?: boolean
}

export function TimesheetLogsList({ logs, loading, empty = 'Nenhum log encontrado.', showTimesheetInfo = false }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
        {empty}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {logs.map(log => {
        const action = ACTION_LABEL[log.action] ?? { label: log.action, icon: Settings, color: '#9CA3AF' }
        const source = SOURCE_LABEL[log.source] ?? { label: log.source, color: 'rgba(255,255,255,0.06)' }
        const ActionIcon = action.icon

        return (
          <div
            key={log.id}
            className="rounded-xl px-4 py-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {/* Header: ação + source + autor + data */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--primary-soft)', color: action.color, border: `1px solid ${action.color}` }}
                >
                  <ActionIcon size={11} />
                  {action.label}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: source.color, color: 'var(--text-muted)' }}
                >
                  {log.source === 'movidesk_sync' && <Webhook size={11} />}
                  {source.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-light)' }}>
                <User size={11} />
                <span>{log.changed_by?.name ?? '—'}</span>
                <span>·</span>
                <Clock size={11} />
                <span>{fmtDateTime(log.created_at)}</span>
              </div>
            </div>

            {/* Info do timesheet (só na tela de auditoria) */}
            {showTimesheetInfo && log.timesheet && (
              <div className="mb-2 text-xs" style={{ color: 'var(--text-light)' }}>
                Apontamento <strong>#{log.timesheet.id}</strong>
                {log.timesheet.customer ? ` · ${log.timesheet.customer.name}` : ''}
                {` · Serviço ${fmtValue(log.timesheet.date)}`}
                {log.timesheet.user ? ` · ${log.timesheet.user.name}` : ''}
                {log.timesheet.project ? ` · ${log.timesheet.project.code} ${log.timesheet.project.name}` : ''}
                {log.timesheet.ticket ? ` · Ticket #${log.timesheet.ticket}` : ''}
              </div>
            )}

            {/* Changes (diff) */}
            {Object.keys(log.changes ?? {}).length > 0 ? (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Campo</th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>De</th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(log.changes).map(([field, diff]) => {
                      // Se o backend resolveu label (campos FK como project/customer/user),
                      // mostra o nome humano em vez do ID cru.
                      const oldDisplay = diff.old_label ?? fmtValue(diff.old)
                      const newDisplay = diff.new_label ?? fmtValue(diff.new)
                      return (
                        <tr key={field} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{fieldLabel(field)}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                            <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.08)' }}>
                              {oldDisplay}
                            </code>
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                            <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.08)' }}>
                              {newDisplay}
                            </code>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--text-light)' }}>
                (sem detalhes de campo)
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
