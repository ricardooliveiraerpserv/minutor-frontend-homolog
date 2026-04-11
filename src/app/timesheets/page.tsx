'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet, PaginatedResponse } from '@/types'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Clock, RefreshCw, FileSpreadsheet, Plus, Pencil,
  Trash2, X, Globe, Webhook, MoreHorizontal, Eye,
} from 'lucide-react'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, Select, TextInput, Pagination,
  EmptyState, SkeletonTable,
} from '@/components/ds'

// ─── Types ───────────────────────────────────────────────────────────────────

type SortField = 'date' | 'status' | 'user.name' | 'project.name' | 'customer.name' | 'effort_hours'
type SortDir   = 'asc' | 'desc'

interface SelectOption { id: number; name: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

// ─── Origin badge ─────────────────────────────────────────────────────────────

function OriginBadge({ origin }: { origin?: string }) {
  if (origin === 'webhook') return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
    >
      <Webhook size={9} /> Auto
    </span>
  )
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}
    >
      <Globe size={9} /> Web
    </span>
  )
}

// ─── Row actions ─────────────────────────────────────────────────────────────

function RowActions({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const [open, setOpen]       = useState(false)
  const [deleting, setDeleting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
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
    } finally { setDeleting(false); setOpen(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: 'var(--brand-subtle)' }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-36 rounded-xl shadow-xl py-1"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          <Link
            href={`/timesheets/${id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/5"
            style={{ color: 'var(--brand-muted)' }}
          >
            <Eye size={11} /> Visualizar
          </Link>
          <Link
            href={`/timesheets/${id}/edit`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/5"
            style={{ color: 'var(--brand-muted)' }}
          >
            <Pencil size={11} /> Editar
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors disabled:opacity-50 hover:bg-white/5"
            style={{ color: 'var(--brand-danger)' }}
          >
            <Trash2 size={11} /> {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── STATUS OPTIONS ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '',           label: 'Todos os status' },
  { value: 'pending',    label: 'Pendente' },
  { value: 'approved',   label: 'Aprovado' },
  { value: 'rejected',   label: 'Rejeitado' },
  { value: 'conflicted', label: 'Conflito' },
]

const ORIGIN_OPTIONS = [
  { value: '',        label: 'Todas as origens' },
  { value: 'web',     label: 'Web (manual)' },
  { value: 'webhook', label: 'Auto (Movidesk)' },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const [page, setPage]               = useState(1)
  const [status, setStatus]           = useState('')
  const [origin, setOrigin]           = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('')
  const [contractTypeId, setContractTypeId] = useState('')
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [ticket, setTicket]           = useState('')
  const [exporting, setExporting]     = useState(false)
  const [sortField, setSortField]     = useState<SortField | null>('date')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return field }
      setSortDir('asc'); return field
    })
    setPage(1)
  }, [])

  const { data: serviceTypes }  = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/service-types')
  const { data: contractTypes } = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/contract-types')

  const serviceTypeList: SelectOption[] = Array.isArray(serviceTypes)
    ? serviceTypes : (serviceTypes as any)?.items ?? []
  const contractTypeList: SelectOption[] = Array.isArray(contractTypes)
    ? contractTypes : (contractTypes as any)?.items ?? []

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status)         p.set('status', status)
    if (origin)         p.set('origin', origin)
    if (serviceTypeId)  p.set('service_type_id', serviceTypeId)
    if (contractTypeId) p.set('contract_type_id', contractTypeId)
    if (startDate)      p.set('start_date', startDate)
    if (endDate)        p.set('end_date', endDate)
    if (ticket)         p.set('ticket', ticket)
    if (sortField)      p.set('order', sortDir === 'desc' ? `-${sortField}` : sortField)
    return p.toString()
  }, [page, status, origin, serviceTypeId, contractTypeId, startDate, endDate, ticket, sortField, sortDir])

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<Timesheet>>(
    `/timesheets?${params}`, [params]
  )

  const resetPage = useCallback(() => setPage(1), [])
  const hasFilters = !!(status || origin || serviceTypeId || contractTypeId || startDate || endDate || ticket)

  const clearFilters = useCallback(() => {
    setStatus(''); setOrigin(''); setServiceTypeId(''); setContractTypeId('')
    setStartDate(''); setEndDate(''); setTicket(''); setPage(1)
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
      const res = await fetch(`/api/v1/timesheets/export?${p}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `apontamentos_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Erro ao exportar. Tente novamente.') }
    finally { setExporting(false) }
  }

  return (
    <AppLayout title="Apontamentos">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Clock}
          title="Apontamentos"
          subtitle="Registro de horas por projeto e colaborador"
          actions={
            <>
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()}>Atualizar</Button>
              <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={handleExport} loading={exporting}>
                {exporting ? 'Exportando...' : 'Excel'}
              </Button>
              <Link href="/timesheets/new">
                <Button variant="primary" size="sm" icon={Plus}>Novo</Button>
              </Link>
            </>
          }
        />

        {/* Filters */}
        <div
          className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5 rounded-2xl mb-6"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          <Select value={serviceTypeId} onChange={e => { setServiceTypeId(e.target.value); resetPage() }}>
            <option value="">Tipo de serviço</option>
            {serviceTypeList.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </Select>

          <Select value={contractTypeId} onChange={e => { setContractTypeId(e.target.value); resetPage() }}>
            <option value="">Tipo de contrato</option>
            {contractTypeList.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </Select>

          <Select value={status} onChange={e => { setStatus(e.target.value); resetPage() }}>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>

          <Select value={origin} onChange={e => { setOrigin(e.target.value); resetPage() }}>
            {ORIGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>

          <TextInput
            placeholder="Nº ticket..."
            value={ticket}
            onChange={e => { setTicket(e.target.value); resetPage() }}
          />

          <div className="flex items-center gap-2 col-span-2 md:col-span-3">
            <TextInput
              type="date"
              label="De"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); resetPage() }}
              className="flex-1"
            />
            <TextInput
              type="date"
              label="Até"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); resetPage() }}
              className="flex-1"
            />
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-6 flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs transition-all hover:bg-white/5"
                style={{ color: 'var(--brand-danger)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <X size={11} /> Limpar
              </button>
            )}
          </div>
        </div>

        {/* Total horas */}
        {data && data.totalEffortHours && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Total de horas:</span>
            <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{data.totalEffortHours}</span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={8} cols={8} />
        ) : error ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--brand-danger)' }}>{error}</div>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="w-10" />
                <Th sortable active={sortField === 'date'}          dir={sortDir} onClick={() => handleSort('date')}>Data</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Origem</Th>
                <Th sortable active={sortField === 'user.name'}     dir={sortDir} onClick={() => handleSort('user.name')} className="hidden md:table-cell">Colaborador</Th>
                <Th sortable active={sortField === 'project.name'}  dir={sortDir} onClick={() => handleSort('project.name')}>Projeto</Th>
                <Th sortable active={sortField === 'customer.name'} dir={sortDir} onClick={() => handleSort('customer.name')} className="hidden lg:table-cell">Cliente</Th>
                <Th className="hidden xl:table-cell">Contrato</Th>
                <Th right sortable active={sortField === 'effort_hours'} dir={sortDir} onClick={() => handleSort('effort_hours')}>Tempo</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.items.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState icon={Clock} title="Nenhum apontamento encontrado" description="Tente ajustar os filtros ou criar um novo apontamento." />
                  </td>
                </tr>
              ) : data?.items.map(ts => (
                <Tr key={ts.id} className="group">
                  <Td className="w-10">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <RowActions id={ts.id} onDeleted={refetch} />
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap font-medium">{formatDate(ts.date)}</Td>
                  <Td>
                    <Badge variant={ts.status}>{ts.status_display ?? ts.status}</Badge>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <OriginBadge origin={ts.origin} />
                  </Td>
                  <Td muted className="hidden md:table-cell">{ts.user?.name ?? '—'}</Td>
                  <Td className="max-w-[160px]">
                    <Link
                      href={`/timesheets/${ts.id}`}
                      className="truncate block transition-colors hover:underline"
                      style={{ color: 'var(--brand-text)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-text)')}
                    >
                      {ts.project?.name ?? `Projeto #${ts.project_id}`}
                    </Link>
                  </Td>
                  <Td muted className="hidden lg:table-cell truncate max-w-[140px]">
                    {ts.customer?.name ?? ts.project?.customer?.name ?? '—'}
                  </Td>
                  <Td muted className="hidden xl:table-cell truncate max-w-[140px]">
                    {ts.project?.contract_type_display ?? '—'}
                  </Td>
                  <Td right mono className="font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    {formatMinutes(ts.effort_minutes)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        {/* Pagination */}
        {!loading && (data?.items.length ?? 0) > 0 && (
          <Pagination
            page={page}
            hasNext={data?.hasNext ?? false}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => p + 1)}
          />
        )}
      </div>
    </AppLayout>
  )
}
