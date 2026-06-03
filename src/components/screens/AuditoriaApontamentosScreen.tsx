'use client'

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ds'
import { FileText } from 'lucide-react'
import { useApiQuery } from '@/hooks/use-query'
import { SearchSelect } from '@/components/ui/search-select'
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

// Normaliza respostas paginadas ({items}|{data}|array) numa lista simples.
const asList = (r: unknown): any[] =>
  Array.isArray((r as any)?.items) ? (r as any).items
  : Array.isArray((r as any)?.data) ? (r as any).data
  : Array.isArray(r) ? (r as any[]) : []

export interface AuditoriaApontamentosScreenProps {
  scope?: 'sustentacao'
  embedded?: boolean
}

export function AuditoriaApontamentosScreen({ scope, embedded }: AuditoriaApontamentosScreenProps = {}) {
  const [filters, setFilters] = useState({
    source:        '',
    action:        '',
    user_id:       '',
    customer_id:   '',
    project_id:    '',
    incl_start:    '',
    incl_end:      '',
    service_start: '',
    service_end:   '',
    page:          1,
  })

  // ── Listas de cliente, projeto e consultor (com busca) ──
  const { data: customersRaw } = useApiQuery<unknown>('/customers?pageSize=500', [])
  const customers = useMemo(
    () => asList(customersRaw).map((c: any) => ({ id: c.id, name: c.name })),
    [customersRaw],
  )

  const { data: usersRaw } = useApiQuery<unknown>('/users?pageSize=500&exclude_type=cliente', [])
  const consultants = useMemo(
    () => asList(usersRaw).map((u: any) => ({ id: u.id, name: u.full_name || u.name })),
    [usersRaw],
  )

  const projectsPath = useMemo(() => {
    const p = new URLSearchParams({ minimal: 'true', pageSize: '2000' })
    if (filters.customer_id) p.set('customer_id', filters.customer_id)
    return `/projects?${p}`
  }, [filters.customer_id])
  const { data: projectsRaw } = useApiQuery<unknown>(projectsPath, [projectsPath])
  const projects = useMemo(
    () => asList(projectsRaw).map((p: any) => ({ id: p.id, name: p.code ? `${p.code} ${p.name}` : p.name })),
    [projectsRaw],
  )

  const path = useMemo(() => {
    const p = new URLSearchParams()
    p.set('per_page', '50')
    p.set('page', String(filters.page))
    if (scope)                 p.set('scope', scope)
    if (filters.source)        p.set('source',        filters.source)
    if (filters.action)        p.set('action',        filters.action)
    if (filters.user_id)       p.set('user_id',       filters.user_id)
    if (filters.customer_id)   p.set('customer_id',   filters.customer_id)
    if (filters.project_id)    p.set('project_id',    filters.project_id)
    if (filters.incl_start)    p.set('incl_start',    filters.incl_start)
    if (filters.incl_end)      p.set('incl_end',      filters.incl_end)
    if (filters.service_start) p.set('service_start', filters.service_start)
    if (filters.service_end)   p.set('service_end',   filters.service_end)
    return `/timesheet-logs?${p}`
  }, [filters, scope])

  const { data, loading, error } = useApiQuery<Paginated<TimesheetLog>>(path, [path])

  const update = <K extends keyof typeof filters>(key: K, value: typeof filters[K]) =>
    setFilters(f => ({
      ...f,
      [key]: value,
      // Trocar de cliente limpa o projeto (evita ID órfão de outro cliente).
      ...(key === 'customer_id' ? { project_id: '' } : {}),
      page: key === 'page' ? Number(value) : 1,
    }))

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
    <div className={embedded ? 'space-y-5' : 'max-w-6xl mx-auto space-y-5'}>
      {!embedded && (
        <PageHeader
          icon={FileText}
          title="Auditoria de Apontamentos"
          subtitle={data ? `${data.total} alteração(ões) encontrada(s)` : 'Carregando...'}
        />
      )}

      <div className="rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3"
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
        {filterField('Consultor', (
          <SearchSelect fullWidth placeholder="Todos os consultores"
            value={filters.user_id} onChange={v => update('user_id', v)} options={consultants} />
        ))}
        {filterField('Cliente', (
          <SearchSelect fullWidth placeholder="Todos os clientes"
            value={filters.customer_id} onChange={v => update('customer_id', v)} options={customers} />
        ))}
        {filterField('Projeto', (
          <SearchSelect fullWidth placeholder="Todos os projetos"
            value={filters.project_id} onChange={v => update('project_id', v)} options={projects} />
        ))}
        {filterField('Inclusão — de', (
          <input type="date" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
            value={filters.incl_start} onChange={e => update('incl_start', e.target.value)} />
        ))}
        {filterField('Inclusão — até', (
          <input type="date" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
            value={filters.incl_end} onChange={e => update('incl_end', e.target.value)} />
        ))}
        {filterField('Serviço — de', (
          <input type="date" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
            value={filters.service_start} onChange={e => update('service_start', e.target.value)} />
        ))}
        {filterField('Serviço — até', (
          <input type="date" className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}
            value={filters.service_end} onChange={e => update('service_end', e.target.value)} />
        ))}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          Erro ao carregar logs: {error}
        </div>
      )}

      <TimesheetLogsList logs={data?.data ?? []} loading={loading} showTimesheetInfo />

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
  )
}
