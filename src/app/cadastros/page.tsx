'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { FileType, Wrench, Users, Star, UserCheck, CalendarDays, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Search, Check, Tag, CreditCard, Receipt, Contact, Download } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { RowMenu } from '@/components/ui/row-menu'
import type { CustomerFull, Executive, ConsultantGroup } from '@/types'
import { useAuth } from '@/hooks/use-auth'

// ─── helpers ─────────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant="outline" className={`text-[10px] border ${active
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-zinc-500/10 text-zinc-400 border-zinc-700'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </Badge>
  )
}

function TableSkeleton({ cols }: { cols: number }) {
  return <>{Array.from({ length: 5 }).map((_, i) => (
    <tr key={i} className="border-b border-zinc-800">
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} className="px-3 py-2.5"><Skeleton className="h-3 w-full bg-zinc-800" /></td>
      ))}
    </tr>
  ))}</>
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="relative w-full max-w-lg rounded-xl shadow-2xl bg-zinc-900 border border-zinc-800 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        {children}
      </div>
    </div>
  )
}

// ─── TABS ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'contracts',          label: 'Tipos de Contrato',     icon: FileType },
  { id: 'services',           label: 'Tipos de Serviço',      icon: Wrench },
  { id: 'customers',          label: 'Clientes',               icon: Users },
  { id: 'customer_contacts',  label: 'Contatos de Clientes',  icon: Contact },
  { id: 'executives',         label: 'Executivos',             icon: Star },
  { id: 'groups',             label: 'Grupos de Consultor',   icon: UserCheck },
  { id: 'holidays',           label: 'Feriados',              icon: CalendarDays },
  { id: 'expense_categories', label: 'Categorias de Despesa', icon: Tag },
  { id: 'expense_types',      label: 'Tipos de Despesa',      icon: Receipt },
  { id: 'payment_methods',    label: 'Formas de Pagamento',   icon: CreditCard },
]

// ─── TAB: CRUD (Tipos de Contrato e Serviço) ─────────────────────────────────

interface CrudItem { id: number; name: string; code: string; description?: string; active: boolean; created_at: string }

function CrudTab({ endpoint, label }: { endpoint: string; label: string }) {
  const [items, setItems] = useState<CrudItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; item?: CrudItem }>({ open: false })
  const [form, setForm] = useState({ name: '', code: '', description: '', active: true })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), per_page: '15' })
      if (search) p.set('search', search)
      if (filterActive) p.set('active', filterActive)
      const r = await api.get<{ items?: CrudItem[]; data?: CrudItem[]; hasNext?: boolean; meta?: { last_page: number } }>(`/${endpoint}?${p}`)
      setItems(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error(`Erro ao carregar ${label}`) }
    finally { setLoading(false) }
  }, [endpoint, label, page, search, filterActive])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ name: '', code: '', description: '', active: true }); setModal({ open: true }) }
  const openEdit = (item: CrudItem) => { setForm({ name: item.name, code: item.code, description: item.description ?? '', active: item.active }); setModal({ open: true, item }) }

  const save = async () => {
    setSaving(true)
    try {
      if (modal.item) await api.put(`/${endpoint}/${modal.item.id}`, form)
      else await api.post(`/${endpoint}`, form)
      toast.success(modal.item ? `${label} atualizado` : `${label} criado`)
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/${endpoint}/${deleteConfirm.id}`)
      toast.success(`${label} excluído`)
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
        </div>
        <select value={filterActive} onChange={e => { setFilterActive(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2">
          <option value="">Todos</option>
          <option value="1">Ativos</option>
          <option value="0">Inativos</option>
        </select>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Código</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={4} /> : items.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-500">Nenhum registro</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) },
                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(item.id), danger: true, disabled: deleting === item.id },
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-zinc-200">{item.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden sm:table-cell">{item.code}</td>
                <td className="px-3 py-2.5"><ActiveBadge active={item.active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? `Editar ${label}` : `Novo ${label}`}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Código *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs font-mono" />
                <p className="text-[11px] text-zinc-500 mt-1">Apenas letras minúsculas, números, _ e -</p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Descrição</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name || !form.code} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message={`Deseja excluir este ${label.toLowerCase()}? Esta ação não pode ser desfeita.`}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── TAB: CLIENTES ───────────────────────────────────────────────────────────

function CustomersTab() {
  const [items, setItems] = useState<CustomerFull[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterExecutive, setFilterExecutive] = useState('')
  const [executives, setExecutives] = useState<Executive[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; item?: CustomerFull }>({ open: false })
  const [form, setForm] = useState({ name: '', company_name: '', cgc: '', code_prefix: '', active: true, executive_id: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

  useEffect(() => {
    api.get<any>('/executives?pageSize=100').then(r => {
      const arr = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setExecutives(arr)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), per_page: '15' })
      if (search) p.set('search', search)
      if (filterExecutive) p.set('executive_id', filterExecutive)
      const r = await api.get<{ items?: CustomerFull[]; data?: CustomerFull[]; hasNext?: boolean; meta?: { last_page: number } }>(`/customers?${p}`)
      setItems(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar clientes') }
    finally { setLoading(false) }
  }, [page, search, filterExecutive])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ name: '', company_name: '', cgc: '', code_prefix: '', active: true, executive_id: '' }); setModal({ open: true }) }
  const openEdit = (item: CustomerFull) => {
    setForm({ name: item.name, company_name: item.company_name ?? '', cgc: item.cgc ?? '', code_prefix: item.code_prefix ?? '', active: item.active, executive_id: item.executive_id ? String(item.executive_id) : '' })
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        executive_id: form.executive_id ? Number(form.executive_id) : null,
        code_prefix: form.code_prefix || null,
      }
      if (modal.item) await api.put(`/customers/${modal.item.id}`, payload)
      else await api.post('/customers', payload)
      toast.success(modal.item ? 'Cliente atualizado' : 'Cliente criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/customers/${deleteConfirm.id}`)
      toast.success('Cliente excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar cliente..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
        </div>
        <select value={filterExecutive} onChange={e => { setFilterExecutive(e.target.value); setPage(1) }}
          className="px-3 py-1.5 rounded-lg text-xs outline-none appearance-none bg-zinc-800 border border-zinc-700 text-zinc-300 min-w-36">
          <option value="">Todos os executivos</option>
          {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Razão Social</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">CPF/CNPJ</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden xl:table-cell">Prefixo</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Executivo</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={7} /> : items.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">Nenhum cliente</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) },
                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(item.id), danger: true, disabled: deleting === item.id },
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-zinc-200">{item.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell">{item.company_name || '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden sm:table-cell">{item.cgc || '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden xl:table-cell">{item.code_prefix || '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell">{item.executive?.name || '—'}</td>
                <td className="px-3 py-2.5"><ActiveBadge active={item.active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Cliente' : 'Novo Cliente'}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Razão Social</Label>
                <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">CPF/CNPJ</Label>
                <Input value={form.cgc} onChange={e => setForm(f => ({ ...f, cgc: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Prefixo de Código (3 letras)</Label>
                <Input
                  value={form.code_prefix}
                  onChange={e => setForm(f => ({ ...f, code_prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))}
                  placeholder="ex: ABC"
                  maxLength={3}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs font-mono uppercase tracking-widest" />
                <p className="mt-1 text-[11px] text-zinc-500">Usado para gerar códigos automáticos dos projetos (ex: ABC001-26)</p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Executivo</Label>
                <select value={form.executive_id} onChange={e => setForm(f => ({ ...f, executive_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-xs outline-none appearance-none bg-zinc-800 border border-zinc-700 text-white">
                  <option value="">Sem executivo</option>
                  {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir este cliente? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── TAB: EXECUTIVOS ─────────────────────────────────────────────────────────

interface ExecutiveUser { id: number; name: string; email: string; is_executive: boolean }

function ExecutivesTab() {
  const [executives, setExecutives] = useState<ExecutiveUser[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<number | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [candidates, setCandidates] = useState<ExecutiveUser[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [searchCandidates, setSearchCandidates] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items?: ExecutiveUser[] }>('/executives?pageSize=100')
      setExecutives(Array.isArray(r?.items) ? r.items : [])
    } catch { toast.error('Erro ao carregar executivos') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadCandidates = useCallback(async (filter = '') => {
    setLoadingCandidates(true)
    try {
      const qs = new URLSearchParams({ pageSize: '50' })
      if (filter) qs.set('filter', filter)
      const r = await api.get<{ items?: ExecutiveUser[] }>(`/executives/all?${qs}`)
      setCandidates(Array.isArray(r?.items) ? r.items : [])
    } catch { toast.error('Erro ao carregar usuários') }
    finally { setLoadingCandidates(false) }
  }, [])

  const openAdd = () => { setSearchCandidates(''); setCandidates([]); setAddModal(true); loadCandidates() }

  const toggle = async (user: ExecutiveUser) => {
    setToggling(user.id)
    try {
      await api.patch(`/executives/${user.id}`, {})
      toast.success(user.is_executive ? `${user.name} removido dos executivos` : `${user.name} definido como executivo`)
      setAddModal(false)
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao alterar executivo') }
    finally { setToggling(null) }
  }

  const filtered = candidates.filter(c =>
    !searchCandidates || c.name.toLowerCase().includes(searchCandidates.toLowerCase()) || c.email.toLowerCase().includes(searchCandidates.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">Usuários marcados como executivos ficam disponíveis para vincular a clientes.</p>
        <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Adicionar
        </Button>
      </div>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">E-mail</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={3} /> : executives.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-zinc-500">Nenhum executivo cadastrado</td></tr>
            ) : executives.map(ex => (
              <tr key={ex.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-200 flex items-center gap-2"><Star size={11} className="text-yellow-500 shrink-0" />{ex.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden sm:table-cell">{ex.email}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => toggle(ex)} disabled={toggling === ex.id} className="p-1 text-zinc-500 hover:text-red-400 transition-colors" title="Remover executivo"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addModal && (
        <ModalOverlay onClose={() => setAddModal(false)}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Adicionar Executivo</h3>
            <p className="text-xs text-zinc-500 mb-4">Selecione um usuário interno para torná-lo executivo.</p>
            <div className="relative mb-3">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input value={searchCandidates} onChange={e => setSearchCandidates(e.target.value)}
                placeholder="Buscar por nome ou e-mail..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {loadingCandidates ? (
                <div className="py-6 text-center text-xs text-zinc-500">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">Nenhum usuário encontrado</div>
              ) : filtered.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                  <div>
                    <p className="text-xs text-zinc-200">{c.name}</p>
                    <p className="text-[11px] text-zinc-500">{c.email}</p>
                  </div>
                  <Button onClick={() => toggle(c)} disabled={toggling === c.id} className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3">
                    {toggling === c.id ? '...' : 'Definir'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ─── TAB: GRUPOS DE CONSULTOR ────────────────────────────────────────────────

function ConsultantGroupsTab() {
  const [items, setItems] = useState<ConsultantGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchConsultant, setSearchConsultant] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; item?: ConsultantGroup }>({ open: false })
  const [availConsultants, setAvailConsultants] = useState<{ id: number; name: string; email: string }[]>([])
  const [loadingConsultants, setLoadingConsultants] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', active: true, consultant_ids: [] as number[] })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })
  const [detailModal, setDetailModal] = useState<ConsultantGroup | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), per_page: '15' })
      if (search) p.set('search', search)
      const r = await api.get<{ items?: ConsultantGroup[]; data?: ConsultantGroup[]; hasNext?: boolean; meta?: { last_page: number } }>(`/consultant-groups?${p}`)
      setItems(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar grupos') }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { load() }, [load])

  const loadConsultants = async () => {
    setLoadingConsultants(true)
    try {
      const r = await api.get<{ items?: { id: number; name: string; email: string }[] }>('/users?pageSize=100&enabled=1')
      const list = Array.isArray(r?.items) ? r.items : Array.isArray((r as any)?.data) ? (r as any).data : []
      setAvailConsultants(list)
    } catch { setAvailConsultants([]) }
    finally { setLoadingConsultants(false) }
  }

  const openCreate = async () => {
    setForm({ name: '', description: '', active: true, consultant_ids: [] })
    setSearchConsultant('')
    setModal({ open: true })
    loadConsultants()
  }

  const openEdit = async (item: ConsultantGroup) => {
    setForm({ name: item.name, description: item.description ?? '', active: item.active, consultant_ids: item.consultants?.map(c => c.id) ?? [] })
    setSearchConsultant('')
    setModal({ open: true, item })
    loadConsultants()
  }

  const save = async () => {
    setSaving(true)
    try {
      if (modal.item) await api.put(`/consultant-groups/${modal.item.id}`, form)
      else await api.post('/consultant-groups', form)
      toast.success(modal.item ? 'Grupo atualizado' : 'Grupo criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/consultant-groups/${deleteConfirm.id}`)
      toast.success('Grupo excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const toggleConsultant = (id: number) =>
    setForm(f => ({
      ...f,
      consultant_ids: f.consultant_ids.includes(id)
        ? f.consultant_ids.filter(x => x !== id)
        : [...f.consultant_ids, id]
    }))

  const filteredConsultants = availConsultants.filter(c =>
    !searchConsultant ||
    c.name.toLowerCase().includes(searchConsultant.toLowerCase()) ||
    c.email.toLowerCase().includes(searchConsultant.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar grupo..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Consultores</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={4} /> : items.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-500">Nenhum grupo encontrado</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) },
                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(item.id), danger: true, disabled: deleting === item.id },
                  ]} />
                </td>
                <td className="px-3 py-2.5">
                  <button onClick={() => setDetailModal(item)} className="text-zinc-200 hover:text-blue-400 text-left font-medium">{item.name}</button>
                  {item.description && <p className="text-[11px] text-zinc-500 mt-0.5">{item.description}</p>}
                </td>
                <td className="px-3 py-2.5 text-zinc-400">{item.consultants_count ?? item.consultants?.length ?? 0}</td>
                <td className="px-3 py-2.5"><ActiveBadge active={item.active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* Modal de detalhe */}
      {detailModal && (
        <ModalOverlay onClose={() => setDetailModal(null)}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-1">{detailModal.name}</h3>
            {detailModal.description && <p className="text-xs text-zinc-400 mb-4">{detailModal.description}</p>}
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">Consultores vinculados</p>
            {detailModal.consultants && detailModal.consultants.length > 0 ? (
              <ul className="space-y-1.5">
                {detailModal.consultants.map(c => (
                  <li key={c.id} className="flex items-center gap-2 text-xs text-zinc-300">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-semibold text-zinc-400">{c.name[0]}</div>
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-zinc-500 text-[11px]">{c.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-zinc-500">Nenhum consultor vinculado</p>}
          </div>
        </ModalOverlay>
      )}

      {/* Modal de criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Grupo' : 'Novo Grupo'}</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-zinc-400">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" placeholder="Nome do grupo" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Descrição</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" placeholder="Opcional" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>

              {/* Consultores */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-zinc-400">Consultores</Label>
                  {form.consultant_ids.length > 0 && (
                    <span className="text-[11px] text-blue-400">{form.consultant_ids.length} selecionado{form.consultant_ids.length > 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="relative mb-1.5">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={searchConsultant}
                    onChange={e => setSearchConsultant(e.target.value)}
                    placeholder="Buscar consultor..."
                    className="pl-7 bg-zinc-800 border-zinc-700 text-white h-8 text-xs"
                  />
                </div>
                <div className="border border-zinc-700 rounded-md overflow-hidden">
                  {loadingConsultants ? (
                    <p className="text-xs text-zinc-500 text-center py-4">Carregando consultores...</p>
                  ) : filteredConsultants.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-4">Nenhum consultor encontrado</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-zinc-800">
                      {filteredConsultants.map(c => {
                        const selected = form.consultant_ids.includes(c.id)
                        return (
                          <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${selected ? 'bg-blue-600/10' : 'hover:bg-zinc-800/60'}`}>
                            <div
                              onClick={() => toggleConsultant(c.id)}
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${selected ? 'bg-blue-600 border-blue-600' : 'border-zinc-600 hover:border-zinc-400'}`}
                            >
                              {selected && <Check size={10} className="text-white" />}
                            </div>
                            <div className="min-w-0 flex-1" onClick={() => toggleConsultant(c.id)}>
                              <p className="text-xs text-zinc-200 font-medium truncate">{c.name}</p>
                              <p className="text-[11px] text-zinc-500 truncate">{c.email}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir este grupo? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── TAB: FERIADOS ───────────────────────────────────────────────────────────

interface HolidayItem { id: number; date: string; name: string; type: string; state?: string | null; active: boolean }

const HOLIDAY_TYPES = [
  { value: 'national', label: 'Nacional' },
  { value: 'state',    label: 'Estadual' },
  { value: 'municipal',label: 'Municipal' },
  { value: 'optional', label: 'Facultativo' },
]

function HolidaysTab() {
  const [items, setItems] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [modal, setModal] = useState<{ open: boolean; item?: HolidayItem }>({ open: false })
  const [form, setForm] = useState({ date: '', name: '', type: 'national', state: '', active: true })
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items?: HolidayItem[] }>(`/holidays?year=${year}`)
      setItems(r.items ?? [])
    } catch { toast.error('Erro ao carregar feriados') }
    finally { setLoading(false) }
  }, [year])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ date: `${year}-01-01`, name: '', type: 'national', state: '', active: true })
    setModal({ open: true })
  }

  const openEdit = (item: HolidayItem) => {
    setForm({ date: item.date, name: item.name, type: item.type, state: item.state ?? '', active: item.active })
    setModal({ open: true, item })
  }

  const save = async () => {
    if (!form.date || !form.name) { toast.error('Preencha data e nome'); return }
    setSaving(true)
    try {
      if (modal.item) await api.put(`/holidays/${modal.item.id}`, form)
      else await api.post('/holidays', form)
      toast.success(modal.item ? 'Feriado atualizado' : 'Feriado criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/holidays/${deleteConfirm.id}`)
      toast.success('Feriado excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const typeLabel = (t: string) => HOLIDAY_TYPES.find(x => x.value === t)?.label ?? t

  const importHolidays = async () => {
    setImporting(true)
    try {
      const r = await api.post<{ message: string; imported: number; items: HolidayItem[] }>(
        `/holidays/import?year=${year}`,
        {}
      )
      toast.success(r.message)
      setItems(r.items ?? [])
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao importar feriados')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {[String(new Date().getFullYear() - 1), String(new Date().getFullYear()), String(new Date().getFullYear() + 1)].map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1.5 font-medium transition-colors ${year === y ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
              {y}
            </button>
          ))}
        </div>
        <Button onClick={importHolidays} disabled={importing}
          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 h-8 text-xs gap-1.5 ml-auto">
          <Download size={13} /> {importing ? 'Importando…' : 'Importar Nacionais'}
        </Button>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Data</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Tipo</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={5} /> : items.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">Nenhum feriado em {year}</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) },
                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(item.id), danger: true, disabled: deleting === item.id },
                  ]} />
                </td>
                <td className="px-3 py-2.5 font-mono text-zinc-200">
                  {new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-3 py-2.5 text-zinc-200">{item.name}</td>
                <td className="px-3 py-2.5 text-zinc-400">{typeLabel(item.type)}{item.state && ` (${item.state})`}</td>
                <td className="px-3 py-2.5"><ActiveBadge active={item.active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Feriado' : 'Novo Feriado'}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Data *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" placeholder="Ex: Natal" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Tipo</Label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-md text-xs bg-zinc-800 border border-zinc-700 text-white outline-none">
                  {HOLIDAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.type === 'state' && (
                <div>
                  <Label className="text-xs text-zinc-400">Estado (UF)</Label>
                  <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                    maxLength={2} className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs w-20" placeholder="SP" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.date || !form.name} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir este feriado? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── TAB: Categorias / Tipos de Despesa / Formas de Pagamento ────────────────

interface IsActiveItem { id: number; name: string; code: string; description?: string; is_active: boolean; created_at: string }

function IsActiveCrudTab({ endpoint, label }: { endpoint: string; label: string }) {
  const [items, setItems]           = useState<IsActiveItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState('')
  const [page, setPage]             = useState(1)
  const [hasNext, setHasNext]       = useState(false)
  const [modal, setModal]           = useState<{ open: boolean; item?: IsActiveItem }>({ open: false })
  const [form, setForm]             = useState({ name: '', code: '', description: '', is_active: true })
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '15' })
      if (search) p.set('search', search)
      if (filterStatus) p.set('filter_status', filterStatus)
      const r = await api.get<{ items?: IsActiveItem[]; hasNext?: boolean }>(`/${endpoint}?${p}`)
      setItems(Array.isArray(r?.items) ? r.items : [])
      setHasNext(!!r?.hasNext)
    } catch { toast.error(`Erro ao carregar ${label}`) }
    finally { setLoading(false) }
  }, [endpoint, label, page, search, filterStatus])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ name: '', code: '', description: '', is_active: true }); setModal({ open: true }) }
  const openEdit = (item: IsActiveItem) => {
    setForm({ name: item.name, code: item.code, description: item.description ?? '', is_active: item.is_active })
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      if (modal.item) await api.put(`/${endpoint}/${modal.item.id}`, form)
      else await api.post(`/${endpoint}`, form)
      toast.success(modal.item ? `${label} atualizado` : `${label} criado`)
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/${endpoint}/${deleteConfirm.id}`)
      toast.success(`${label} excluído`)
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
        </div>
        <select value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2">
          <option value="">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Código</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={4} /> : items.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-500">Nenhum registro</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) },
                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => setDeleteConfirm({ open: true, id: item.id }), danger: true, disabled: deleting === item.id },
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-zinc-200">{item.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden sm:table-cell">{item.code}</td>
                <td className="px-3 py-2.5"><ActiveBadge active={item.is_active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? `Editar ${label}` : `Novo ${label}`}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Código *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs font-mono" />
                <p className="text-[11px] text-zinc-500 mt-1">Apenas letras minúsculas, números, _ e -</p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Descrição</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.is_active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.is_active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name || !form.code} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message={`Deseja excluir este ${label.toLowerCase()}? Esta ação não pode ser desfeita.`}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── TAB: CONTATOS DE CLIENTES ───────────────────────────────────────────────

interface CustomerContact {
  id: number
  customer_id: number
  customer?: { id: number; name: string }
  name: string
  cargo: string
  email: string
  phone: string
}

interface CustomerOption { id: number; name: string }

function CustomerContactsTab() {
  const [customers, setCustomers]       = useState<CustomerOption[]>([])
  const [customerId, setCustomerId]     = useState('')
  const [contacts, setContacts]         = useState<CustomerContact[]>([])
  const [loading, setLoading]           = useState(false)
  const [modal, setModal]               = useState<{ open: boolean; item?: CustomerContact }>({ open: false })
  const [form, setForm]                 = useState({ name: '', cargo: '', email: '', phone: '' })
  const [saving, setSaving]             = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; item?: CustomerContact }>({ open: false })

  const inputCls  = 'w-full rounded-lg border px-3 py-2 text-xs text-white bg-transparent outline-none transition-colors focus:border-cyan-500'
  const inputStyle = { borderColor: 'var(--brand-border)' }
  const labelCls  = 'block text-[10px] font-medium text-zinc-400 mb-1'

  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r => setCustomers(r?.items ?? [])).catch(() => {})
  }, [])

  const load = useCallback(async (cid: string) => {
    if (!cid) { setContacts([]); return }
    setLoading(true)
    try {
      const r = await api.get<CustomerContact[]>(`/customer-contacts?customer_id=${cid}`)
      setContacts(Array.isArray(r) ? r : [])
    } catch { toast.error('Erro ao carregar contatos') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(customerId) }, [customerId, load])

  const openCreate = () => {
    setForm({ name: '', cargo: '', email: '', phone: '' })
    setModal({ open: true })
  }
  const openEdit = (item: CustomerContact) => {
    setForm({ name: item.name, cargo: item.cargo ?? '', email: item.email ?? '', phone: item.phone ?? '' })
    setModal({ open: true, item })
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    if (!customerId) { toast.error('Selecione o cliente'); return }
    setSaving(true)
    try {
      if (modal.item) {
        await api.put(`/customer-contacts/${modal.item.id}`, form)
        toast.success('Contato atualizado')
      } else {
        await api.post('/customer-contacts', { ...form, customer_id: Number(customerId) })
        toast.success('Contato criado')
      }
      setModal({ open: false })
      load(customerId)
    } catch (e: any) { toast.error(e?.message ?? 'Erro') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.item) return
    try {
      await api.delete(`/customer-contacts/${deleteConfirm.item.id}`)
      toast.success('Contato excluído')
      setDeleteConfirm({ open: false })
      load(customerId)
    } catch { toast.error('Erro ao excluir') }
  }

  return (
    <div className="space-y-4">
      {/* Seletor de cliente */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-sm">
          <label className={labelCls}>Cliente</label>
          <SearchSelect
            value={customerId}
            onChange={setCustomerId}
            options={customers}
            placeholder="Selecione o cliente..."
          />
        </div>
        {customerId && (
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(0,245,255,0.10)', border: '1px solid rgba(0,245,255,0.25)', color: '#00F5FF' }}>
            <Plus size={13} /> Novo Contato
          </button>
        )}
      </div>

      {!customerId && (
        <p className="text-xs text-zinc-600 py-8 text-center">Selecione um cliente para ver e gerenciar seus contatos.</p>
      )}

      {customerId && loading && (
        <table className="w-full text-xs"><tbody><TableSkeleton cols={5} /></tbody></table>
      )}

      {customerId && !loading && contacts.length === 0 && (
        <p className="text-xs text-zinc-600 py-6 text-center">Nenhum contato cadastrado para este cliente.</p>
      )}

      {customerId && !loading && contacts.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                <th className="w-10" />
                <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Nome</th>
                <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Cargo</th>
                <th className="px-3 py-2.5 text-left font-medium text-zinc-400">E-mail</th>
                <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Telefone</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--brand-border)' }}>
                  <td className="px-2 py-2.5 w-10">
                    <RowMenu items={[
                      { label: 'Editar',  icon: <Pencil size={12} />, onClick: () => openEdit(c) },
                      { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => setDeleteConfirm({ open: true, item: c }), danger: true },
                    ]} />
                  </td>
                  <td className="px-3 py-2.5 text-zinc-200 font-medium">{c.name}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{c.cargo || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{c.email || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{c.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal add/edit */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Contato' : 'Novo Contato'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls} style={inputStyle} placeholder="Nome completo" />
                </div>
                <div>
                  <label className={labelCls}>Cargo</label>
                  <input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                    className={inputCls} style={inputStyle} placeholder="Cargo / Função" />
                </div>
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                    className={inputCls} style={inputStyle} placeholder="11999999999" maxLength={15} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>E-mail</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className={inputCls} style={inputStyle} placeholder="email@empresa.com"
                    pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setModal({ open: false })}>Cancelar</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir este contato? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

// Mapa de tab → permissão extra necessária (admin vê tudo)
const TAB_PERMISSION: Record<string, string> = {
  contracts:          'contracts.manage',
  services:           'services.manage',
  customers:          'customers.manage',
  customer_contacts:  'customers.manage',
  executives:         'executives.manage',
  groups:             'groups.manage',
  holidays:           'holidays.manage',
  expense_categories: 'expense_categories.manage',
  expense_types:      'expense_types.manage',
  payment_methods:    'payment_methods.manage',
}

function CadastrosContent() {
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const isAdmin = user?.type === 'admin'
  const ep = user?.extra_permissions ?? []

  // Filtra tabs conforme permissões do usuário
  const visibleTabs = TABS.filter(t =>
    isAdmin || ep.includes(TAB_PERMISSION[t.id] ?? '')
  )

  const tabParam = searchParams.get('tab') ?? ''
  const firstTab = visibleTabs[0]?.id ?? 'contracts'
  // Deriva activeTab diretamente — sem useState para evitar dessincronização quando user carrega
  const activeTab = visibleTabs.find(t => t.id === tabParam) ? tabParam : firstTab
  const active = TABS.find(t => t.id === activeTab) ?? TABS[0]

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto w-full">
        <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <active.icon size={14} className="text-zinc-400" />
          {active.label}
        </h2>
        <div className="flex-1 min-w-0">
          {activeTab === 'contracts'          && <CrudTab endpoint="contract-types"    label="Tipo de Contrato" />}
          {activeTab === 'services'           && <CrudTab endpoint="service-types"     label="Tipo de Serviço" />}
          {activeTab === 'customers'          && <CustomersTab />}
          {activeTab === 'customer_contacts'  && <CustomerContactsTab />}
          {activeTab === 'executives'         && <ExecutivesTab />}
          {activeTab === 'groups'             && <ConsultantGroupsTab />}
          {activeTab === 'holidays'           && <HolidaysTab />}
          {activeTab === 'expense_categories' && <IsActiveCrudTab endpoint="expense-categories" label="Categoria de Despesa" />}
          {activeTab === 'expense_types'      && <IsActiveCrudTab endpoint="expense-types"      label="Tipo de Despesa" />}
          {activeTab === 'payment_methods'    && <IsActiveCrudTab endpoint="payment-methods"    label="Forma de Pagamento" />}
        </div>
      </div>
    </AppLayout>
  )
}


export default function CadastrosPage() {
  return (
    <Suspense>
      <CadastrosContent />
    </Suspense>
  )
}
