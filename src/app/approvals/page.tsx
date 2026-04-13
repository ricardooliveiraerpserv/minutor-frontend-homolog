'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Clock, Receipt, ChevronLeft, ChevronRight,
  Check, XCircle, X, Filter, ChevronDown,
} from 'lucide-react'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TSItem {
  id: number
  date: string
  user?: { id: number; name: string }
  project?: { id: number; name: string; customer?: { id: number; name: string } }
  effort_minutes: number
  observation?: string
  status: string
}

interface ExpItem {
  id: number
  expense_date: string
  user?: { id: number; name: string }
  project?: { id: number; name: string; customer?: { id: number; name: string } }
  category?: { id: number; name: string }
  amount: number
  description: string
  status: string
}

interface Pagination {
  current_page: number
  last_page: number
  total: number
  per_page: number
  from?: number
  to?: number
}

interface UserOption    { id: number; name: string }
interface ProjectOption { id: number; name: string }
interface CustomerOption{ id: number; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtMin(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function fmtBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [tab, setTab] = useState<'timesheets' | 'expenses'>('timesheets')

  // Filters
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [userId,      setUserId]      = useState('')
  const [projectId,   setProjectId]   = useState('')
  const [customerId,  setCustomerId]  = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Support data for filters
  const [users,     setUsers]     = useState<UserOption[]>([])
  const [projects,  setProjects]  = useState<ProjectOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  // List state
  const [tsItems,   setTsItems]   = useState<TSItem[]>([])
  const [expItems,  setExpItems]  = useState<ExpItem[]>([])
  const [tsPag,     setTsPag]     = useState<Pagination | null>(null)
  const [expPag,    setExpPag]    = useState<Pagination | null>(null)
  const [tsLoading, setTsLoading] = useState(true)
  const [expLoading,setExpLoading]= useState(true)
  const [tsPage,    setTsPage]    = useState(1)
  const [expPage,   setExpPage]   = useState(1)

  // Selection & actions
  const [selected,     setSelected]     = useState<number[]>([])
  const [approving,    setApproving]    = useState(false)
  const [actioning,    setActioning]    = useState<number | null>(null)
  const [rejectModal,  setRejectModal]  = useState<{ open: boolean; ids: number[] }>({ open: false, ids: [] })
  const [rejectReason, setRejectReason] = useState('')

  // Load support data
  useEffect(() => {
    api.get<any>('/users?pageSize=200&role=Consultor').then(r => {
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(list.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/projects?pageSize=500').then(r => {
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))
    }).catch(() => {})
    api.get<any>('/customers?pageSize=500').then(r => {
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCustomers(list.map((c: any) => ({ id: c.id, name: c.name })))
    }).catch(() => {})
  }, [])

  // Build filter params
  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (dateFrom)   p.set('date_from',   dateFrom)
    if (dateTo)     p.set('date_to',     dateTo)
    if (userId)     p.set('user_id',     userId)
    if (projectId)  p.set('project_id',  projectId)
    if (customerId) p.set('customer_id', customerId)
    return p.toString()
  }, [dateFrom, dateTo, userId, projectId, customerId])

  // Load timesheets
  const loadTs = useCallback(async () => {
    setTsLoading(true)
    try {
      const p = new URLSearchParams(filterParams)
      p.set('page',     String(tsPage))
      p.set('per_page', '30')
      const r = await api.get<any>(`/approvals/timesheets?${p}`)
      setTsItems(Array.isArray(r?.data) ? r.data : [])
      setTsPag(r?.pagination ?? null)
    } catch { toast.error('Erro ao carregar apontamentos') }
    finally { setTsLoading(false) }
  }, [tsPage, filterParams])

  // Load expenses
  const loadExp = useCallback(async () => {
    setExpLoading(true)
    try {
      const p = new URLSearchParams(filterParams)
      p.set('page',     String(expPage))
      p.set('per_page', '30')
      const r = await api.get<any>(`/approvals/expenses?${p}`)
      setExpItems(Array.isArray(r?.data) ? r.data : [])
      setExpPag(r?.pagination ?? null)
    } catch { toast.error('Erro ao carregar despesas') }
    finally { setExpLoading(false) }
  }, [expPage, filterParams])

  useEffect(() => { loadTs() },  [loadTs])
  useEffect(() => { loadExp() }, [loadExp])

  // Reset pages when filters change
  useEffect(() => { setTsPage(1); setExpPage(1); setSelected([]) }, [filterParams])

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setUserId(''); setProjectId(''); setCustomerId('')
  }
  const hasFilters = !!(dateFrom || dateTo || userId || projectId || customerId)

  // Current tab data
  const currentItems   = tab === 'timesheets' ? tsItems   : expItems
  const currentLoading = tab === 'timesheets' ? tsLoading : expLoading
  const currentPag     = tab === 'timesheets' ? tsPag     : expPag

  const allSelected = currentItems.length > 0 && currentItems.every(i => selected.includes(i.id))

  const toggleAll = () => {
    if (allSelected) setSelected(s => s.filter(id => !currentItems.find(i => i.id === id)))
    else setSelected(s => [...new Set([...s, ...currentItems.map(i => i.id)])])
  }
  const toggleOne = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  // Approve one
  const approveOne = async (id: number) => {
    setActioning(id)
    try {
      if (tab === 'timesheets') {
        await api.post(`/timesheets/${id}/approve`, {})
        toast.success('Apontamento aprovado')
        loadTs()
      } else {
        await api.post(`/expenses/${id}/approve`, { charge_client: false })
        toast.success('Despesa aprovada')
        loadExp()
      }
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
    finally { setActioning(null) }
  }

  // Bulk approve
  const bulkApprove = async () => {
    if (!selected.length) return
    setApproving(true)
    try {
      if (tab === 'timesheets') {
        await api.post('/approvals/timesheets/bulk-approve', { timesheet_ids: selected })
        toast.success(`${selected.length} apontamento(s) aprovado(s)`)
        loadTs()
      } else {
        await api.post('/approvals/expenses/bulk-approve', { expense_ids: selected })
        toast.success(`${selected.length} despesa(s) aprovada(s)`)
        loadExp()
      }
      setSelected([])
    } catch { toast.error('Erro ao aprovar em lote') }
    finally { setApproving(false) }
  }

  // Reject
  const handleReject = async () => {
    if (!rejectModal.ids.length) return
    setApproving(true)
    try {
      if (tab === 'timesheets') {
        if (rejectModal.ids.length === 1)
          await api.post(`/timesheets/${rejectModal.ids[0]}/reject`, { reason: rejectReason })
        else
          await api.post('/approvals/timesheets/bulk-reject', { timesheet_ids: rejectModal.ids, reason: rejectReason })
        toast.success(`${rejectModal.ids.length} apontamento(s) rejeitado(s)`)
        loadTs()
      } else {
        if (rejectModal.ids.length === 1)
          await api.post(`/expenses/${rejectModal.ids[0]}/reject`, { reason: rejectReason })
        else
          await api.post('/approvals/expenses/bulk-reject', { expense_ids: rejectModal.ids, reason: rejectReason })
        toast.success(`${rejectModal.ids.length} despesa(s) rejeitada(s)`)
        loadExp()
      }
      setSelected([])
      setRejectModal({ open: false, ids: [] })
      setRejectReason('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao rejeitar') }
    finally { setApproving(false) }
  }

  const handleTabChange = (t: 'timesheets' | 'expenses') => {
    setTab(t); setSelected([])
  }

  return (
    <AppLayout title="Aprovações">

      {/* ── Tabs ── */}
      <div className="flex items-center gap-0.5 border-b border-zinc-800 mb-5">
        {([
          { id: 'timesheets' as const, icon: Clock,    label: 'Apontamentos', count: tsPag?.total ?? 0 },
          { id: 'expenses'   as const, icon: Receipt,  label: 'Despesas',     count: expPag?.total ?? 0 },
        ]).map(({ id, icon: Icon, label, count }) => (
          <button key={id} onClick={() => handleTabChange(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
            }`}>
            <Icon size={14} />
            {label}
            {count > 0 && (
              <span className="bg-blue-500 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900">
        {/* Filter header */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          <div className="flex items-center gap-2">
            <Filter size={13} />
            <span className="font-medium">Filtros</span>
            {hasFilters && (
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 text-[10px]">
                ativos
              </span>
            )}
          </div>
          <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="border-t border-zinc-800 px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">

              {/* Data de */}
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Data de</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-200" />
              </div>

              {/* Data até */}
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Data até</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-200" />
              </div>

              {/* Colaborador */}
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Colaborador</Label>
                <select value={userId} onChange={e => setUserId(e.target.value)}
                  className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md px-2 outline-none">
                  <option value="">Todos</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              {/* Cliente */}
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Cliente</Label>
                <select value={customerId} onChange={e => { setCustomerId(e.target.value); setProjectId('') }}
                  className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md px-2 outline-none">
                  <option value="">Todos</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Projeto */}
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Projeto</Label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md px-2 outline-none">
                  <option value="">Todos</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {hasFilters && (
              <button onClick={clearFilters}
                className="mt-3 text-[11px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1">
                <X size={11} /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selected.length > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/20">
          <span className="text-xs text-blue-300 flex-1">
            {selected.length} item(ns) selecionado(s)
          </span>
          <button onClick={bulkApprove} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors">
            <Check size={12} />{approving ? 'Aprovando...' : 'Aprovar todos'}
          </button>
          <button onClick={() => { setRejectModal({ open: true, ids: selected }); setRejectReason('') }} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors">
            <XCircle size={12} /> Rejeitar todos
          </button>
          <button onClick={() => setSelected([])} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
              </th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Data</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Colaborador</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Cliente</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Projeto</th>
              {tab === 'expenses' && (
                <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Descrição</th>
              )}
              <th className="text-right px-3 py-2.5 text-zinc-500 font-medium">
                {tab === 'timesheets' ? 'Tempo' : 'Valor'}
              </th>
              <th className="px-3 py-2.5 w-16 text-right text-zinc-500 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* Loading skeleton */}
            {currentLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800/60">
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-3" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-28" /></td>
                <td className="px-3 py-2.5 hidden sm:table-cell"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-32" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-14 ml-auto" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-10 ml-auto" /></td>
              </tr>
            ))}

            {/* Empty */}
            {!currentLoading && currentItems.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center text-zinc-500">
                  <CheckSquare size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum item pendente de aprovação</p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
                      Limpar filtros
                    </button>
                  )}
                </td>
              </tr>
            )}

            {/* Timesheets */}
            {!currentLoading && tab === 'timesheets' && tsItems.map(ts => (
              <tr key={ts.id} onClick={() => toggleOne(ts.id)}
                className={`border-b border-zinc-800/60 cursor-pointer transition-colors ${
                  selected.includes(ts.id)
                    ? 'bg-blue-950/30 border-l-2 border-l-blue-500'
                    : 'hover:bg-zinc-800/40'
                }`}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(ts.id)} onChange={() => toggleOne(ts.id)}
                    className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                </td>
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{fmt(ts.date)}</td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{ts.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden sm:table-cell">
                  {ts.project?.customer?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate max-w-[200px]">
                  {ts.project?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">
                  {fmtMin(ts.effort_minutes)}
                </td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => approveOne(ts.id)} disabled={actioning === ts.id}
                      title="Aprovar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-green-400 hover:bg-green-400/10 transition-colors">
                      <Check size={13} />
                    </button>
                    <button onClick={() => { setRejectModal({ open: true, ids: [ts.id] }); setRejectReason('') }}
                      title="Rejeitar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <XCircle size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* Expenses */}
            {!currentLoading && tab === 'expenses' && expItems.map(exp => (
              <tr key={exp.id} onClick={() => toggleOne(exp.id)}
                className={`border-b border-zinc-800/60 cursor-pointer transition-colors ${
                  selected.includes(exp.id)
                    ? 'bg-blue-950/30 border-l-2 border-l-blue-500'
                    : 'hover:bg-zinc-800/40'
                }`}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(exp.id)} onChange={() => toggleOne(exp.id)}
                    className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                </td>
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{fmt(exp.expense_date)}</td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{exp.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden sm:table-cell">
                  {exp.project?.customer?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate max-w-[160px]">
                  {exp.project?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell truncate max-w-[140px]">
                  {exp.description}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">
                  {fmtBRL(parseFloat(String(exp.amount)) || 0)}
                </td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => approveOne(exp.id)} disabled={actioning === exp.id}
                      title="Aprovar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-green-400 hover:bg-green-400/10 transition-colors">
                      <Check size={13} />
                    </button>
                    <button onClick={() => { setRejectModal({ open: true, ids: [exp.id] }); setRejectReason('') }}
                      title="Rejeitar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <XCircle size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {currentItems.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-zinc-500">
            {currentPag
              ? `${currentPag.from ?? 1}–${currentPag.to ?? currentItems.length} de ${currentPag.total} itens`
              : `${currentItems.length} itens`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => tab === 'timesheets' ? setTsPage(p => Math.max(1, p - 1)) : setExpPage(p => Math.max(1, p - 1))}
              disabled={(currentPag?.current_page ?? 1) === 1}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-zinc-500 px-1">
              {currentPag?.current_page ?? 1} / {currentPag?.last_page ?? 1}
            </span>
            <button
              onClick={() => tab === 'timesheets' ? setTsPage(p => p + 1) : setExpPage(p => p + 1)}
              disabled={(currentPag?.current_page ?? 1) >= (currentPag?.last_page ?? 1)}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal rejeição ── */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">
              {rejectModal.ids.length === 1 ? 'Rejeitar item' : `Rejeitar ${rejectModal.ids.length} itens`}
            </h3>
            <p className="text-xs text-zinc-400 mb-3">Informe o motivo da rejeição (opcional).</p>
            <Label className="text-xs text-zinc-400">Motivo</Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ex: Fora do prazo, informação incorreta..."
              className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => setRejectModal({ open: false, ids: [] })}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={handleReject} disabled={approving}
                className="h-8 text-xs bg-red-600 hover:bg-red-500 text-white">
                {approving ? 'Rejeitando...' : 'Confirmar rejeição'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
