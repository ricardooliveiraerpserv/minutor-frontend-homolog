'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet, PaginatedResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, ChevronLeft, ChevronRight, Globe, Webhook, RefreshCw, FileSpreadsheet, Plus, ChevronsUpDown, ChevronUp, ChevronDown, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { toast } from 'sonner'

type SortField = 'date' | 'status' | 'user.name' | 'project.name' | 'customer.name' | 'effort_hours'
type SortDir   = 'asc' | 'desc'

function SortHeader({
  label, field, current, dir, onSort, className,
}: {
  label: string
  field: SortField
  current: SortField | null
  dir: SortDir
  onSort: (f: SortField) => void
  className?: string
}) {
  const active = current === field
  return (
    <th
      className={`text-left px-3 py-2.5 text-zinc-500 font-medium cursor-pointer select-none hover:text-zinc-300 transition-colors whitespace-nowrap ${className ?? ''}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc'
            ? <ChevronUp size={11} className="text-blue-400" />
            : <ChevronDown size={11} className="text-blue-400" />
          : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  )
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:    'secondary',
  approved:   'default',
  rejected:   'destructive',
  conflicted: 'outline',
}

const STATUS_OPTIONS = [
  { value: '',           label: 'Todos os status' },
  { value: 'pending',    label: 'Pendente' },
  { value: 'approved',   label: 'Aprovado' },
  { value: 'rejected',   label: 'Rejeitado' },
  { value: 'conflicted', label: 'Conflito' },
]

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function OriginBadge({ origin }: { origin?: string }) {
  if (origin === 'webhook') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
        <Webhook size={9} />
        Auto
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
      <Globe size={9} />
      Web
    </span>
  )
}

function RowActions({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDelete = async () => {
    if (!confirm('Excluir este apontamento?')) return
    setDeleting(true)
    try {
      await api.delete(`/timesheets/${id}`)
      toast.success('Apontamento excluído')
      onDeleted()
    } catch {
      toast.error('Erro ao excluir')
    } finally {
      setDeleting(false)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-36 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1">
          <Link
            href={`/timesheets/${id}/edit`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Pencil size={11} />
            Editar
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={11} />
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      )}
    </div>
  )
}

interface SelectOption { id: number; name: string }

export default function TimesheetsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus]               = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('')
  const [contractTypeId, setContractTypeId] = useState('')
  const [startDate, setStartDate]         = useState('')
  const [endDate, setEndDate]             = useState('')
  const [ticket, setTicket]               = useState('')
  const [exporting, setExporting]         = useState(false)
  const [sortField, setSortField]         = useState<SortField | null>('date')
  const [sortDir, setSortDir]             = useState<SortDir>('desc')

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return field
      }
      setSortDir('asc')
      return field
    })
    setPage(1)
  }, [])

  const { data: serviceTypes } = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/service-types')
  const { data: contractTypes } = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/contract-types')

  const serviceTypeList: SelectOption[] = Array.isArray(serviceTypes)
    ? serviceTypes
    : (serviceTypes as { items?: SelectOption[] })?.items ?? []

  const contractTypeList: SelectOption[] = Array.isArray(contractTypes)
    ? contractTypes
    : (contractTypes as { items?: SelectOption[] })?.items ?? []

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status)         p.set('status', status)
    if (serviceTypeId)  p.set('service_type_id', serviceTypeId)
    if (contractTypeId) p.set('contract_type_id', contractTypeId)
    if (startDate)      p.set('start_date', startDate)
    if (endDate)        p.set('end_date', endDate)
    if (ticket)         p.set('ticket', ticket)
    if (sortField)      p.set('order', sortDir === 'desc' ? `-${sortField}` : sortField)
    return p.toString()
  }, [page, status, serviceTypeId, contractTypeId, startDate, endDate, ticket, sortField, sortDir])

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<Timesheet>>(
    `/timesheets?${params}`,
    [params]
  )

  const resetPage = useCallback(() => setPage(1), [])

  const hasFilters = !!(status || serviceTypeId || contractTypeId || startDate || endDate || ticket)

  const clearFilters = useCallback(() => {
    setStatus('')
    setServiceTypeId('')
    setContractTypeId('')
    setStartDate('')
    setEndDate('')
    setTicket('')
    setPage(1)
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (status)         p.set('status', status)
      if (serviceTypeId)  p.set('service_type_id', serviceTypeId)
      if (contractTypeId) p.set('contract_type_id', contractTypeId)
      if (startDate)      p.set('start_date', startDate)
      if (endDate)        p.set('end_date', endDate)
      if (ticket)         p.set('ticket', ticket)

      const token = localStorage.getItem('minutor_token')
      const res = await fetch(`/api/v1/timesheets/export?${p.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Falha no export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `apontamentos_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao exportar. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const actions = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => refetch()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <RefreshCw size={12} />
        Atualizar
      </button>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
      >
        <FileSpreadsheet size={12} />
        {exporting ? 'Exportando...' : 'Exportar Excel'}
      </button>
      <Link
        href="/timesheets/new"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
      >
        <Plus size={12} />
        Novo Apontamento
      </Link>
    </div>
  )

  return (
    <AppLayout title="Apontamentos" actions={actions}>
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <select
          value={serviceTypeId}
          onChange={e => { setServiceTypeId(e.target.value); resetPage() }}
          className="px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Selecione um tipo...</option>
          {serviceTypeList.map(s => (
            <option key={s.id} value={String(s.id)}>{s.name}</option>
          ))}
        </select>

        <select
          value={contractTypeId}
          onChange={e => { setContractTypeId(e.target.value); resetPage() }}
          className="px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Selecione um tipo de contrato...</option>
          {contractTypeList.map(c => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); resetPage() }}
          className="px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); resetPage() }}
            className="flex-1 min-w-0 px-2 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-zinc-400 text-xs">-</span>
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); resetPage() }}
            className="flex-1 min-w-0 px-2 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Ticket</label>
        <input
          type="text"
          value={ticket}
          onChange={e => { setTicket(e.target.value); resetPage() }}
          placeholder="Digite o número do ticket..."
          className="w-56 px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border border-zinc-200 dark:border-zinc-700 transition-colors"
          >
            <X size={11} />
            Limpar filtros
          </button>
        )}
      </div>

      {data && (
        <p className="text-xs text-zinc-500 mb-3">
          Total de horas: <strong className="text-zinc-300">{data.totalEffortHours ?? '—'}</strong>
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <th className="w-8 px-2 py-2.5" />
              <SortHeader label="Data"         field="date"          current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Status"       field="status"        current={sortField} dir={sortDir} onSort={handleSort} />
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Origem</th>
              <SortHeader label="Colaborador"  field="user.name"     current={sortField} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
              <SortHeader label="Projeto"      field="project.name"  current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Cliente"      field="customer.name" current={sortField} dir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden xl:table-cell">Tipo Contrato</th>
              <SortHeader label="Tempo"        field="effort_hours"  current={sortField} dir={sortDir} onSort={handleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/60">
                <td className="px-2 py-2.5 w-8" />
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-4 w-16 rounded-full" /></td>
                <td className="px-3 py-2.5 hidden sm:table-cell"><Skeleton className="h-4 w-12 rounded" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-32" /></td>
                <td className="px-3 py-2.5 hidden lg:table-cell"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-2.5 hidden xl:table-cell"><Skeleton className="h-3 w-28" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-12 ml-auto" /></td>
              </tr>
            ))}

            {!loading && error && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-red-500">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && data?.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-zinc-500">
                  <Clock size={24} className="mx-auto mb-2 opacity-30" />
                  Nenhum apontamento encontrado
                </td>
              </tr>
            )}

            {!loading && !error && data?.items.map(ts => (
              <tr
                key={ts.id}
                className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group"
              >
                <td className="px-2 py-2.5 w-8">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <RowActions id={ts.id} onDeleted={refetch} />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                  {formatDate(ts.date)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={STATUS_VARIANT[ts.status] ?? 'secondary'} className="text-[10px] whitespace-nowrap">
                    {ts.status_display ?? ts.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <OriginBadge origin={ts.origin} />
                </td>
                <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300 hidden md:table-cell">
                  {ts.user?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 max-w-[160px]">
                  <Link
                    href={`/timesheets/${ts.id}`}
                    className="text-zinc-800 dark:text-zinc-200 hover:text-blue-500 dark:hover:text-blue-400 truncate block"
                  >
                    {ts.project?.name ?? `Projeto #${ts.project_id}`}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden lg:table-cell truncate max-w-[140px]">
                  {ts.customer?.name ?? ts.project?.customer?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden xl:table-cell truncate max-w-[140px]">
                  {ts.project?.contract_type_display ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap font-mono">
                  {formatMinutes(ts.effort_minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(data?.items.length ?? 0) > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-zinc-500">Página {page}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!data?.hasNext}
              className="p-1.5 rounded-md text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
