'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Clock, Receipt, ChevronLeft, ChevronRight,
  Check, XCircle, X, Filter, ChevronDown, Eye, Pencil,
} from 'lucide-react'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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
  ticket?: string
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
  expense_type?: string
  payment_method?: string
  charge_client: boolean
  receipt_url?: string
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

// ─── SearchableSelect ─────────────────────────────────────────────────────────

interface SelectOption { id: number | string; name: string }

function SearchableSelect({
  value, onChange, options, placeholder = 'Todos', label,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  label: string
}) {
  const [open,    setOpen]    = useState(false)
  const [search,  setSearch]  = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() =>
    options.filter(o => o.name.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  )

  const selected = options.find(o => String(o.id) === value)

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (id: string) => {
    onChange(id); setOpen(false); setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <Label className="text-[11px] text-zinc-500 mb-1 block">{label}</Label>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-8 flex items-center justify-between gap-1 px-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md outline-none hover:border-zinc-500 transition-colors">
        <span className={`truncate ${!selected ? 'text-zinc-500' : ''}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={11} className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          {/* Campo de busca */}
          <div className="p-1.5 border-b border-zinc-800">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-7 px-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
          </div>
          {/* Opções */}
          <div className="max-h-48 overflow-y-auto py-0.5">
            <button type="button" onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                !value ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}>
              {!value && <Check size={10} className="shrink-0" />}
              <span className={!value ? '' : 'ml-[14px]'}>{placeholder}</span>
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-zinc-600 italic">Nenhum resultado</p>
            )}
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => select(String(o.id))}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                  String(o.id) === value ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}>
                {String(o.id) === value && <Check size={10} className="shrink-0" />}
                <span className={String(o.id) === value ? '' : 'ml-[14px]'}>{o.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal: visualizar apontamento ───────────────────────────────────────────

function TsViewModal({ item, onClose }: { item: TSItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Apontamento</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3 text-xs">
          <Row label="Colaborador"  value={item.user?.name} />
          <Row label="Data"         value={fmt(item.date)} />
          <Row label="Cliente"      value={item.project?.customer?.name} />
          <Row label="Projeto"      value={item.project?.name} />
          <Row label="Tempo"        value={fmtMin(item.effort_minutes)} />
          {item.ticket && <Row label="Ticket" value={`#${item.ticket}`} />}
          {item.observation && (
            <div>
              <span className="text-zinc-500 block mb-1">Descrição</span>
              <p className="text-zinc-200 bg-zinc-800 rounded-lg p-3 leading-relaxed">{item.observation}</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs border-zinc-700 text-zinc-300">Fechar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── ReceiptLink: abre comprovante autenticado ────────────────────────────────

function ReceiptLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)

  const open = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('minutor_token')
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('Comprovante não encontrado no servidor'); return }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch { toast.error('Erro ao abrir comprovante') }
    finally { setLoading(false) }
  }

  return (
    <button onClick={open} disabled={loading}
      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 underline text-xs disabled:opacity-50">
      {loading ? 'Carregando...' : 'Ver comprovante'}
    </button>
  )
}

// ─── Modal: visualizar / aprovar despesa ─────────────────────────────────────

function ExpApproveModal({
  item, onClose, onApprove, onReject, approving,
}: {
  item: ExpItem
  onClose: () => void
  onApprove: (chargeClient: boolean) => void
  onReject: () => void
  approving: boolean
}) {
  const [chargeClient, setChargeClient] = useState<boolean | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleApprove = () => {
    setSubmitted(true)
    if (chargeClient === null) return
    onApprove(chargeClient)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Aprovação de Despesa</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-3 text-xs">
          <Row label="Colaborador"  value={item.user?.name} />
          <Row label="Data"         value={fmt(item.expense_date)} />
          <Row label="Cliente"      value={item.project?.customer?.name} />
          <Row label="Projeto"      value={item.project?.name} />
          <Row label="Categoria"    value={item.category?.name} />
          <Row label="Valor"        value={fmtBRL(parseFloat(String(item.amount)) || 0)} highlight />
          <div>
            <span className="text-zinc-500 block mb-1">Descrição</span>
            <p className="text-zinc-200 bg-zinc-800 rounded-lg p-3 leading-relaxed">{item.description || '—'}</p>
          </div>
          {item.receipt_url && (
            <ReceiptLink url={item.receipt_url} />
          )}

          {/* Campo obrigatório: cobrar do cliente */}
          <div className="pt-2 border-t border-zinc-800">
            <Label className={`text-xs mb-2 block font-semibold ${submitted && chargeClient === null ? 'text-red-400' : 'text-zinc-300'}`}>
              Cobrar do cliente? *
            </Label>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => setChargeClient(true)}
                className={`flex-1 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                  chargeClient === true
                    ? 'bg-green-600/20 border-green-500 text-green-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}>
                Sim — cobrar do cliente
              </button>
              <button type="button"
                onClick={() => setChargeClient(false)}
                className={`flex-1 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                  chargeClient === false
                    ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}>
                Não — absorver internamente
              </button>
            </div>
            {submitted && chargeClient === null && (
              <p className="text-red-400 text-[11px] mt-1.5">Selecione uma opção antes de aprovar</p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex gap-2 justify-end">
          <Button variant="outline" onClick={onReject}
            className="h-8 text-xs border-red-700/50 text-red-400 hover:bg-red-400/10">
            <XCircle size={12} className="mr-1" /> Rejeitar
          </Button>
          <Button variant="outline" onClick={onClose}
            className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
          <Button onClick={handleApprove} disabled={approving}
            className="h-8 text-xs bg-green-600 hover:bg-green-500 text-white">
            <Check size={12} className="mr-1" />
            {approving ? 'Aprovando...' : 'Aprovar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-right font-medium ${highlight ? 'text-cyan-400' : 'text-zinc-200'}`}>{value || '—'}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [tab, setTab] = useState<'timesheets' | 'expenses'>('timesheets')

  // Filters
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [userId,        setUserId]        = useState('')
  const [coordinatorId, setCoordinatorId] = useState('')
  const [executiveId,   setExecutiveId]   = useState('')
  const [projectId,     setProjectId]     = useState('')
  const [customerId,    setCustomerId]    = useState('')
  const [showFilters,   setShowFilters]   = useState(true)

  // Support data
  const [users,        setUsers]        = useState<UserOption[]>([])
  const [coordinators, setCoordinators] = useState<UserOption[]>([])
  const [executives,   setExecutives]   = useState<UserOption[]>([])
  const [projects,     setProjects]     = useState<ProjectOption[]>([])
  const [customers,    setCustomers]    = useState<CustomerOption[]>([])

  // List state
  const [tsItems,    setTsItems]    = useState<TSItem[]>([])
  const [expItems,   setExpItems]   = useState<ExpItem[]>([])
  const [tsPag,      setTsPag]      = useState<Pagination | null>(null)
  const [expPag,     setExpPag]     = useState<Pagination | null>(null)
  const [tsLoading,  setTsLoading]  = useState(true)
  const [expLoading, setExpLoading] = useState(true)
  const [tsPage,     setTsPage]     = useState(1)
  const [expPage,    setExpPage]    = useState(1)

  // Selection & actions (only timesheets use bulk)
  const [selected,     setSelected]     = useState<number[]>([])
  const [approving,    setApproving]    = useState(false)
  const [actioning,    setActioning]    = useState<number | null>(null)
  const [rejectModal,  setRejectModal]  = useState<{ open: boolean; ids: number[] }>({ open: false, ids: [] })
  const [rejectReason, setRejectReason] = useState('')

  // View / approve-expense modals
  const [tsView,       setTsView]       = useState<TSItem | null>(null)
  const [expApprove,   setExpApprove]   = useState<ExpItem | null>(null)

  // Load support data
  useEffect(() => {
    api.get<any>('/users?pageSize=500').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/users?pageSize=500&role=Coordenador').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCoordinators(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/users?pageSize=500&is_executive=true').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setExecutives(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/projects?pageSize=500').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setProjects(l.map((p: any) => ({ id: p.id, name: p.name })))
    }).catch(() => {})
    api.get<any>('/customers?pageSize=500').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCustomers(l.map((c: any) => ({ id: c.id, name: c.name })))
    }).catch(() => {})
  }, [])

  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (dateFrom)      p.set('date_from',      dateFrom)
    if (dateTo)        p.set('date_to',        dateTo)
    if (userId)        p.set('user_id',        userId)
    if (coordinatorId) p.set('coordinator_id', coordinatorId)
    if (executiveId)   p.set('executive_id',   executiveId)
    if (projectId)     p.set('project_id',     projectId)
    if (customerId)    p.set('customer_id',    customerId)
    return p.toString()
  }, [dateFrom, dateTo, userId, coordinatorId, executiveId, projectId, customerId])

  const loadTs = useCallback(async () => {
    setTsLoading(true)
    try {
      const p = new URLSearchParams(filterParams)
      p.set('page', String(tsPage)); p.set('per_page', '30')
      const r = await api.get<any>(`/approvals/timesheets?${p}`)
      setTsItems(Array.isArray(r?.data) ? r.data : [])
      setTsPag(r?.pagination ?? null)
    } catch { toast.error('Erro ao carregar apontamentos') }
    finally { setTsLoading(false) }
  }, [tsPage, filterParams])

  const loadExp = useCallback(async () => {
    setExpLoading(true)
    try {
      const p = new URLSearchParams(filterParams)
      p.set('page', String(expPage)); p.set('per_page', '30')
      const r = await api.get<any>(`/approvals/expenses?${p}`)
      setExpItems(Array.isArray(r?.data) ? r.data : [])
      setExpPag(r?.pagination ?? null)
    } catch { toast.error('Erro ao carregar despesas') }
    finally { setExpLoading(false) }
  }, [expPage, filterParams])

  useEffect(() => { loadTs() },  [loadTs])
  useEffect(() => { loadExp() }, [loadExp])
  useEffect(() => { setTsPage(1); setExpPage(1); setSelected([]) }, [filterParams])

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setUserId(''); setCoordinatorId('')
    setExecutiveId(''); setProjectId(''); setCustomerId('')
  }
  const hasFilters = !!(dateFrom || dateTo || userId || coordinatorId || executiveId || projectId || customerId)

  // Timesheets: bulk allowed
  const currentItems   = tab === 'timesheets' ? tsItems   : expItems
  const currentLoading = tab === 'timesheets' ? tsLoading : expLoading
  const currentPag     = tab === 'timesheets' ? tsPag     : expPag

  const allSelected = currentItems.length > 0 && currentItems.every(i => selected.includes(i.id))
  const toggleAll   = () => {
    if (allSelected) setSelected(s => s.filter(id => !currentItems.find(i => i.id === id)))
    else setSelected(s => [...new Set([...s, ...currentItems.map(i => i.id)])])
  }
  const toggleOne = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  // Approve timesheet (direct)
  const approveTs = async (id: number) => {
    setActioning(id)
    try {
      await api.post(`/timesheets/${id}/approve`, {})
      toast.success('Apontamento aprovado')
      loadTs()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
    finally { setActioning(null) }
  }

  // Approve expense (via modal with charge_client)
  const approveExp = async (chargeClient: boolean) => {
    if (!expApprove) return
    setApproving(true)
    try {
      await api.post(`/expenses/${expApprove.id}/approve`, { charge_client: chargeClient })
      toast.success('Despesa aprovada')
      setExpApprove(null)
      loadExp()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
    finally { setApproving(false) }
  }

  // Bulk approve timesheets only
  const bulkApproveTs = async () => {
    if (!selected.length) return
    setApproving(true)
    try {
      await api.post('/approvals/timesheets/bulk-approve', { timesheet_ids: selected })
      toast.success(`${selected.length} apontamento(s) aprovado(s)`)
      setSelected([])
      loadTs()
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
        await api.post(`/expenses/${rejectModal.ids[0]}/reject`, { reason: rejectReason })
        toast.success('Despesa rejeitada')
        setExpApprove(null)
        loadExp()
      }
      setSelected([])
      setRejectModal({ open: false, ids: [] })
      setRejectReason('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao rejeitar') }
    finally { setApproving(false) }
  }

  const handleTabChange = (t: 'timesheets' | 'expenses') => { setTab(t); setSelected([]) }

  return (
    <AppLayout title="Aprovações">

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 mb-5">
        {([
          { id: 'timesheets' as const, icon: Clock,   label: 'Apontamentos', count: tsPag?.total  ?? 0 },
          { id: 'expenses'   as const, icon: Receipt, label: 'Despesas',     count: expPag?.total ?? 0 },
        ]).map(({ id, icon: Icon, label, count }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => handleTabChange(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                active
                  ? 'bg-cyan-400 border-cyan-400 text-zinc-900'
                  : 'bg-transparent border-cyan-500/40 text-cyan-400 hover:border-cyan-400'
              }`}>
              <Icon size={14} />
              {label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                  active ? 'bg-zinc-900/30 text-zinc-900' : 'bg-cyan-400/20 text-cyan-300'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900">
        <button onClick={() => setShowFilters(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          <div className="flex items-center gap-2">
            <Filter size={13} />
            <span className="font-medium">Filtros</span>
            {hasFilters && (
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 text-[10px]">ativos</span>
            )}
          </div>
          <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="border-t border-zinc-800 px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Data de</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-200" />
              </div>
              <div>
                <Label className="text-[11px] text-zinc-500 mb-1 block">Data até</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-200" />
              </div>
              <SearchableSelect
                label="Colaborador"
                value={userId}
                onChange={setUserId}
                options={users}
              />
              <SearchableSelect
                label="Coordenador"
                value={coordinatorId}
                onChange={setCoordinatorId}
                options={coordinators}
              />
              <SearchableSelect
                label="Executivo"
                value={executiveId}
                onChange={setExecutiveId}
                options={executives}
              />
              <SearchableSelect
                label="Cliente"
                value={customerId}
                onChange={v => { setCustomerId(v); setProjectId('') }}
                options={customers}
              />
              <SearchableSelect
                label="Projeto"
                value={projectId}
                onChange={setProjectId}
                options={projects}
              />
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

      {/* ── Bulk action bar (apontamentos only) ── */}
      {tab === 'timesheets' && selected.length > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/20">
          <span className="text-xs text-blue-300 flex-1">{selected.length} apontamento(s) selecionado(s)</span>
          <button onClick={bulkApproveTs} disabled={approving}
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
              {tab === 'timesheets' && (
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                </th>
              )}
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
              <th className="px-3 py-2.5 text-right text-zinc-500 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* Loading */}
            {currentLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800/60">
                {tab === 'timesheets' && <td className="px-3 py-2.5"><Skeleton className="h-3 w-3" /></td>}
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-28" /></td>
                <td className="px-3 py-2.5 hidden sm:table-cell"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-32" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-14 ml-auto" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-16 ml-auto" /></td>
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

            {/* Timesheets rows */}
            {!currentLoading && tab === 'timesheets' && tsItems.map(ts => (
              <tr key={ts.id} onClick={() => toggleOne(ts.id)}
                className={`border-b border-zinc-800/60 cursor-pointer transition-colors ${
                  selected.includes(ts.id) ? 'bg-blue-950/30' : 'hover:bg-zinc-800/40'
                }`}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(ts.id)} onChange={() => toggleOne(ts.id)}
                    className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                </td>
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{fmt(ts.date)}</td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{ts.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden sm:table-cell">{ts.project?.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate max-w-[200px]">{ts.project?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{fmtMin(ts.effort_minutes)}</td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-0.5 justify-end">
                    <button onClick={() => setTsView(ts)} title="Visualizar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors">
                      <Eye size={12} />
                    </button>
                    <button onClick={() => approveTs(ts.id)} disabled={actioning === ts.id} title="Aprovar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-green-400 hover:bg-green-400/10 transition-colors">
                      <Check size={13} />
                    </button>
                    <button onClick={() => { setRejectModal({ open: true, ids: [ts.id] }); setRejectReason('') }} title="Rejeitar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <XCircle size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* Expenses rows */}
            {!currentLoading && tab === 'expenses' && expItems.map(exp => (
              <tr key={exp.id}
                className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{fmt(exp.expense_date)}</td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{exp.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden sm:table-cell">{exp.project?.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate max-w-[160px]">{exp.project?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell truncate max-w-[140px]">{exp.description}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{fmtBRL(parseFloat(String(exp.amount)) || 0)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-0.5 justify-end">
                    <button onClick={() => setExpApprove(exp)} title="Ver e aprovar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors">
                      <Eye size={12} />
                    </button>
                    <button onClick={() => setExpApprove(exp)} title="Aprovar"
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-green-400 hover:bg-green-400/10 transition-colors">
                      <Check size={13} />
                    </button>
                    <button onClick={() => { setRejectModal({ open: true, ids: [exp.id] }); setRejectReason('') }} title="Rejeitar"
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

      {/* ── Modal: visualizar apontamento ── */}
      {tsView && <TsViewModal item={tsView} onClose={() => setTsView(null)} />}

      {/* ── Modal: aprovar despesa ── */}
      {expApprove && (
        <ExpApproveModal
          item={expApprove}
          approving={approving}
          onClose={() => setExpApprove(null)}
          onApprove={approveExp}
          onReject={() => {
            setRejectModal({ open: true, ids: [expApprove.id] })
            setRejectReason('')
            setExpApprove(null)
          }}
        />
      )}

      {/* ── Modal: rejeição ── */}
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
