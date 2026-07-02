'use client'

import { useEffect } from 'react'
import { X, FileText } from 'lucide-react'
import { useApiQuery } from '@/hooks/use-query'
import { TimesheetLogsList, type TimesheetLog } from './TimesheetLogsList'

interface Props {
  timesheetId: number | null
  onClose: () => void
}

export function TimesheetLogsModal({ timesheetId, onClose }: Props) {
  const { data, loading } = useApiQuery<{ data: TimesheetLog[] }>(
    timesheetId ? `/timesheets/${timesheetId}/logs?per_page=100` : null,
    [timesheetId],
  )

  // ESC fecha
  useEffect(() => {
    if (!timesheetId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [timesheetId, onClose])

  if (!timesheetId) return null

  const logs = data?.data ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              <FileText size={14} />
            </span>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Histórico de alterações
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                Apontamento #{timesheetId}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: 'var(--text-light)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <TimesheetLogsList
            logs={logs}
            loading={loading}
            empty="Nenhuma alteração registrada para este apontamento."
          />
        </div>
      </div>
    </div>
  )
}
