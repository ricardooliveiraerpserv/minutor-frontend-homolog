'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { toast } from 'sonner'
import { Users, Search, RefreshCw, Pencil, Check, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useActiveCompany } from '@/hooks/use-active-company'
import { useDeniedActions } from '@/contexts/denied-actions-context'

interface Row {
  id: number
  name: string
  cgc: string | null
  active: boolean
  is_bizify_customer: boolean
  executive_id: number | null
  executive_name: string | null
}
interface ExecOpt { id: number; name: string }

const NONE = 'none' // valor sentinela p/ "sem executivo"

export default function ClientesExecutivosPage() {
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const { isBizify } = useActiveCompany()
  const { isDenied } = useDeniedActions()
  // Edição só admin (e respeitando o configurador universal).
  const canEdit = isAdmin && !isDenied('/clientes/executivos', 'edit')

  const [rows, setRows] = useState<Row[]>([])
  const [execs, setExecs] = useState<ExecOpt[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterExec, setFilterExec] = useState<string>('') // '' = todos, 'none' = sem exec, id
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Ordenação (client-side)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'name', dir: 'asc' })
  const requestSort = (key: string) =>
    setSort(p => (p?.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const thProps = (key: string) => ({
    sortable: true,
    active: sort?.key === key,
    dir: sort?.key === key ? sort.dir : undefined,
    onClick: () => requestSort(key),
  })

  // Seleção p/ ação em massa
  const [sel, setSel] = useState<Set<number>>(new Set())
  const toggleSel = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Edição inline (unitária)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  // Ação em massa
  const [bulkExec, setBulkExec] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, ex] = await Promise.all([
        api.get<{ data: Row[] }>('/customers/executives-overview'),
        api.get<{ items: ExecOpt[] }>('/executives?pageSize=500'),
      ])
      setRows(Array.isArray(ov?.data) ? ov.data : [])
      setExecs(Array.isArray(ex?.items) ? ex.items : [])
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao carregar'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // Opções de executivo p/ os combos (com "sem executivo").
  const execSelectOptions = useMemo(
    () => [{ id: NONE, name: '— Sem executivo —' }, ...execs.map(e => ({ id: String(e.id), name: e.name }))],
    [execs],
  )
  const filterExecOptions = useMemo(
    () => [{ id: '', name: 'Todos os executivos' }, { id: NONE, name: '— Sem executivo —' }, ...execs.map(e => ({ id: String(e.id), name: e.name }))],
    [execs],
  )

  // Filtro + ordenação client-side.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let r = rows.filter(row => {
      if (filterStatus === 'active' && !row.active) return false
      if (filterStatus === 'inactive' && row.active) return false
      if (filterExec === NONE && row.executive_id != null) return false
      if (filterExec && filterExec !== NONE && String(row.executive_id) !== filterExec) return false
      if (q && !(`${row.name} ${row.cgc ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
    if (sort) {
      const get = (row: Row, key: string): unknown =>
        key === 'executive_name' ? (row.executive_name ?? null)
          : key === 'status' ? (row.active ? 1 : 0)
            : (row as unknown as Record<string, unknown>)[key]
      const mul = sort.dir === 'asc' ? 1 : -1
      r = [...r].sort((a, b) => {
        const av = get(a, sort.key); const bv = get(b, sort.key)
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
        return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' }) * mul
      })
    }
    return r
  }, [rows, search, filterExec, filterStatus, sort])

  const allSelected = filtered.length > 0 && filtered.every(r => sel.has(r.id))
  const someSelected = sel.size > 0 && !allSelected

  // Salva o executivo de UM cliente (inline).
  const saveOne = async (row: Row, value: string) => {
    const execId = value === NONE || value === '' ? null : Number(value)
    setSavingId(row.id)
    try {
      await api.patch(`/customers/${row.id}/executive`, { executive_id: execId })
      const ename = execId == null ? null : (execs.find(e => e.id === execId)?.name ?? null)
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, executive_id: execId, executive_name: ename } : r))
      setEditingId(null)
      toast.success('Executivo atualizado')
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao salvar'))
    } finally {
      setSavingId(null)
    }
  }

  // Ação em massa.
  const applyBulk = async () => {
    if (sel.size === 0) return
    const execId = bulkExec === NONE || bulkExec === '' ? null : Number(bulkExec)
    setBulkBusy(true)
    try {
      const ids = [...sel]
      const res = await api.post<{ data: { updated: number } }>('/customers/executives/bulk', {
        customer_ids: ids, executive_id: execId,
      })
      const ename = execId == null ? null : (execs.find(e => e.id === execId)?.name ?? null)
      const idSet = new Set(ids)
      setRows(rs => rs.map(r => idSet.has(r.id) ? { ...r, executive_id: execId, executive_name: ename } : r))
      setSel(new Set()); setBulkExec('')
      toast.success(`${res?.data?.updated ?? ids.length} cliente(s) atualizado(s)`)
    } catch (e) {
      toast.error(apiMessage(e, 'Erro na atualização em massa'))
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <AppLayout title="Cliente × Executivo">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Header */}
        <div className="px-4 md:px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Users size={20} style={{ color: 'var(--primary)' }} />
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Cliente × Executivo</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Executivo responsável por cada cliente{isBizify ? ' (empresa Bizify)' : ''}.
                {canEdit ? ' Edite individualmente ou em massa.' : ''}
              </p>
            </div>
            <button
              onClick={load}
              className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Recarregar"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3 mt-4">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente ou CNPJ..."
                className="pl-8 pr-3 py-2 rounded-lg text-sm w-64 outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div className="w-56">
              <SearchSelect
                value={filterExec}
                onChange={setFilterExec}
                options={filterExecOptions}
                placeholder="Executivo"
                fullWidth
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="py-2 px-3 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-light)' }}>
              {filtered.length} cliente(s)
            </span>
          </div>

          {/* Barra de ação em massa (só admin, com seleção) */}
          {canEdit && sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 px-3 py-2 rounded-lg" style={{ border: '1px solid var(--primary)', background: 'var(--surface)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{sel.size} selecionado(s)</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· atribuir executivo:</span>
              <div className="w-56">
                <SearchSelect value={bulkExec} onChange={setBulkExec} options={execSelectOptions} placeholder="Selecionar executivo..." fullWidth />
              </div>
              <button
                onClick={applyBulk}
                disabled={bulkBusy || bulkExec === ''}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
              >
                {bulkBusy ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Aplicar
              </button>
              <button onClick={() => { setSel(new Set()); setBulkExec('') }} className="text-xs hover:underline" style={{ color: 'var(--text-light)' }}>
                Limpar seleção
              </button>
            </div>
          )}
        </div>

        {/* Tabela */}
        <div className="p-4 md:p-6">
          {loading ? (
            <SkeletonTable rows={8} cols={canEdit ? 5 : 4} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum cliente" description="Ajuste os filtros ou a busca." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  {canEdit && (
                    <Th>
                      <input
                        type="checkbox"
                        title="Selecionar todos"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={e => setSel(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())}
                      />
                    </Th>
                  )}
                  <Th {...thProps('name')}>Cliente</Th>
                  <Th {...thProps('status')}>Status</Th>
                  <Th {...thProps('executive_name')}>Executivo</Th>
                  {canEdit && <Th right>Ações</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {filtered.map(row => {
                  const editing = editingId === row.id
                  return (
                    <Tr key={row.id}>
                      {canEdit && (
                        <Td>
                          <input type="checkbox" checked={sel.has(row.id)} onChange={() => toggleSel(row.id)} />
                        </Td>
                      )}
                      <Td label="Cliente">
                        <div className="flex flex-col">
                          <span className="font-medium" style={{ color: 'var(--text)' }}>{row.name}</span>
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                            {row.cgc || '—'}{row.is_bizify_customer ? ' · Bizify' : ''}
                          </span>
                        </div>
                      </Td>
                      <Td label="Status">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={row.active
                            ? { background: 'var(--success-bg)', color: 'var(--success)' }
                            : { background: 'var(--surface-hover)', color: 'var(--text-muted)' }}
                        >
                          {row.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </Td>
                      <Td label="Executivo">
                        {editing ? (
                          <div className="w-60">
                            <SearchSelect
                              value={row.executive_id != null ? String(row.executive_id) : NONE}
                              onChange={v => saveOne(row, v)}
                              options={execSelectOptions}
                              placeholder="Selecionar executivo..."
                              fullWidth
                              disabled={savingId === row.id}
                            />
                          </div>
                        ) : (
                          <span style={{ color: row.executive_name ? 'var(--text)' : 'var(--text-light)' }}>
                            {row.executive_name || '— sem executivo —'}
                          </span>
                        )}
                      </Td>
                      {canEdit && (
                        <Td right>
                          {editing ? (
                            <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--text-light)' }} title="Cancelar">
                              <X size={13} /> Cancelar
                            </button>
                          ) : (
                            <button onClick={() => setEditingId(row.id)} className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--primary)' }} title="Alterar executivo">
                              <Pencil size={13} /> Alterar
                            </button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
