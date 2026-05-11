'use client'

import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ConflictingTs {
  id: number
  date: string
  start_time: string | null
  end_time: string | null
  effort_hours: string | null
  customer_name: string | null
  project_name: string | null
  origin?: string | null
}

export interface ConflictTimesheet {
  id: number
  date: string
  start_time?: string | null
  end_time?: string | null
  effort_hours?: string | null
  customer?: { name?: string | null } | null
  project?: { name?: string | null; customer?: { name?: string | null } | null } | null
  conflicting_timesheets?: ConflictingTs[]
}

interface Props {
  timesheet: ConflictTimesheet
  onClose: () => void
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

export function TimesheetConflictModal({ timesheet, onClose }: Props) {
  const conflicts = timesheet.conflicting_timesheets ?? []
  const customerName =
    timesheet.customer?.name ?? timesheet.project?.customer?.name ?? '—'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-md overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--brand-card-shadow-md)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ background: 'rgba(249,115,22,0.10)', borderColor: '#F97316' }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: '#F97316' }}
          >
            <AlertTriangle size={16} style={{ color: '#FFFFFF' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: '#9A3412' }}>
              Apontamento em Conflito
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              #{timesheet.id} · {fmtDate(timesheet.date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Apontamento atual */}
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-light)' }}
            >
              Este apontamento
            </p>
            <div
              className="rounded-xl p-3 space-y-1.5"
              style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid #F97316' }}
            >
              <Row label="Data"     value={fmtDate(timesheet.date)} />
              <Row label="Cliente"  value={customerName} />
              <Row label="Projeto"  value={timesheet.project?.name ?? '—'} />
              <Row label="Horário"  value={`${timesheet.start_time ?? '—'} – ${timesheet.end_time ?? '—'}`} mono />
              <Row label="Total"    value={timesheet.effort_hours ?? '—'} mono bold />
            </div>
          </div>

          {/* Conflitos */}
          {conflicts.length > 0 ? (
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-light)' }}
              >
                Conflita com {conflicts.length > 1 ? `${conflicts.length} apontamentos` : 'este apontamento'}
              </p>
              <div className="space-y-2">
                {conflicts.map(ct => (
                  <div
                    key={ct.id}
                    className="rounded-xl p-3 space-y-1.5"
                    style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}
                  >
                    <Row label="Data"     value={fmtDate(ct.date)} />
                    <Row label="Cliente"  value={ct.customer_name ?? '—'} />
                    <Row label="Projeto"  value={ct.project_name ?? '—'} />
                    <Row label="Horário"  value={`${ct.start_time ?? '—'} – ${ct.end_time ?? '—'}`} mono />
                    <Row label="Total"    value={ct.effort_hours ?? '—'} mono bold />
                    {ct.origin === 'webhook' && (
                      <Row label="Origem" value="Integração Movidesk" highlight />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
              O apontamento que gerou o conflito foi removido ou alterado.
            </p>
          )}

          <p className="text-[11px] text-center" style={{ color: 'var(--text-light)' }}>
            Para resolver, contate seu coordenador ou aguarde a revisão.
          </p>
        </div>

        <div
          className="px-5 py-4 border-t flex justify-end"
          style={{ borderColor: 'var(--border)' }}
        >
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  bold,
  highlight,
}: {
  label: string
  value: string
  mono?: boolean
  bold?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className={[mono && 'font-mono', bold ? 'font-bold' : 'font-medium'].filter(Boolean).join(' ')}
        style={{ color: highlight ? 'var(--primary)' : 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  )
}
