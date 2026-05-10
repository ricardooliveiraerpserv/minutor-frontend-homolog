'use client'

import { useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/ds'
import { FileText } from 'lucide-react'
import { useApiQuery } from '@/hooks/use-query'
import { TimesheetLogsList, type TimesheetLog } from '@/components/timesheet/TimesheetLogsList'

interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

const SOURCES = [
  { value: '',              label: 'Todos' },
  { value: 'manual',        label: 'Manual' },
  { value: 'movidesk_sync', label: 'Sync Movidesk' },
  { value: 'system',        label: 'Sistema' },
]

const ACTIONS = [
  { value: '',         label: 'Todas' },
  { value: 'updated',  label: 'Atualizado' },
  { value: 'deleted',  label: 'Excluído' },
  { value: 'restored', label: 'Restaurado' },
]

export default function AuditoriaApontamentosPage() {
  const [filters, setFilters] = useState({
    source:     '',
    action:     '',
    user_id:    '',
    project_id: '',
    start_date: '',
    end_date:   '',
    page:       1,
  })

  const path = useMemo(() => {
    const p = new URLSearchParams()
    p.set('per_page', '50')
    p.set('page', String(filters.page))
    if (filters.source)     p.set('source',     filters.source)
    if (filters.action)     p.set('action',     filters.action)
    if (filters.user_id)    p.set('user_id',    filters.user_id)
    if (filters.project_id) p.set('project_id', filters.project_id)
    if (filters.start_date) p.set('start_date', filters.start_date)
    if (filters.end_date)   p.set('end_date',   filters.end_date)
    return `/timesheet-logs?${p}`
  }, [filters])

  const { data, loading, error } = useApiQuery<Paginated<TimesheetLog>>(path, [path])

  const update = <K extends keyof typeof filters>(key: K, value: typeof filters[K]) =>
    setFilters(f => ({ ...f, [key]: value, page: key === 'page' ? Number(value) : 1 }))

  const filterField = (label: string, child: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--brand-subtle)' }}>{label}</label>
      {child}
    </div>
  )

  const inputStyle: React.CSSProperties = {
    background: 'var(--brand-surface)',
    border: '1px solid var(--brand-border)',
    color: 'var(--brand-text)',
  }

  return (
    <AppLayout title="Auditoria de Apontamentos">
      <div className="max-w-6xl mx-auto space-y-5">
        <PageHeader
          icon={FileText}
          title="Auditoria de Apontamentos"
          subtitle={data ? `${data.total} alteração(ões) encontrada(s)` : 'Carregando...'}
        />

        {/* Filtros */}
        <div className="rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>

          {filterField('Origem', (
            <select className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
              value={filters.source} onChange={e => update('source', e.target.value)}>
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          ))}

          {filterField('Ação', (
            <select className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
              value={filters.action} onChange={e => update('action', e.target.value)}>
              {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          ))}

          {filterField('User ID', (
            <input type="number" placeholder="ex: 5" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
              value={filters.user_id} onChange={e => update('user_id', e.target.value)} />
          ))}

          {filterField('Projeto ID', (
            <input type="number" placeholder="ex: 12" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
              value={filters.project_id} onChange={e => update('project_id', e.target.value)} />
          ))}

          {filterField('Data inicial', (
            <input type="date" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
              value={filters.start_date} onChange={e => update('start_date', e.target.value)} />
          ))}

          {filterField('Data final', (
            <input type="date" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
              value={filters.end_date} onChange={e => update('end_date', e.target.value)} />
          ))}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
            Erro ao carregar logs: {error}
          </div>
        )}

        {/* Lista */}
        <TimesheetLogsList logs={data?.data ?? []} loading={loading} showTimesheetInfo />

        {/* Paginação */}
        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between text-xs px-1"
            style={{ color: 'var(--brand-muted)' }}>
            <span>Página {data.current_page} de {data.last_page}</span>
            <div className="flex gap-2">
              <button
                onClick={() => update('page', Math.max(1, data.current_page - 1))}
                disabled={data.current_page === 1}
                className="px-3 py-1.5 rounded-lg disabled:opacity-30"
                style={inputStyle}
              >
                Anterior
              </button>
              <button
                onClick={() => update('page', Math.min(data.last_page, data.current_page + 1))}
                disabled={data.current_page === data.last_page}
                className="px-3 py-1.5 rounded-lg disabled:opacity-30"
                style={inputStyle}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
