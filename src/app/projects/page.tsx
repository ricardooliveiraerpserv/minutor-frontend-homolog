'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { Project, PaginatedResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { FolderOpen, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Search } from 'lucide-react'

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-500/20 text-green-400 border-green-500/30',
  inactive:  'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  closed:    'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  started:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
  paused:    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  finished:  'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

interface ProjectForm {
  name: string
  code: string
  customer_id: string
  contract_type_id: string
  status: string
  start_date: string
  end_date: string
  consultant_hours: string
  parent_project_id: string
  consultant_ids: number[]
  coordinator_ids: number[]
}

interface SelectOption { id: number; name: string }
interface ProjectStatus { code: string; name: string }

function ProgressBar({ pct }: { pct?: number }) {
  const val = Math.min(100, Math.max(0, pct ?? 0))
  const color = val > 90 ? 'bg-red-500' : val > 70 ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div className="w-full bg-zinc-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${val}%` }} />
    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 z-10">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}

const EMPTY_FORM: ProjectForm = {
  name: '', code: '', customer_id: '', contract_type_id: '', status: 'started',
  start_date: '', end_date: '', consultant_hours: '', parent_project_id: '',
  consultant_ids: [], coordinator_ids: [],
}

export default function ProjectsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<PaginatedResponse<Project> | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; item?: Project }>({ open: false })
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  // opções dos selects
  const [customers, setCustomers] = useState<SelectOption[]>([])
  const [contractTypes, setContractTypes] = useState<SelectOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<ProjectStatus[]>([])
  const [consultants, setConsultants] = useState<SelectOption[]>([])
  const [parentProjects, setParentProjects] = useState<SelectOption[]>([])

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status) p.set('status', status)
    if (search) p.set('search', search)
    return p.toString()
  }, [page, status, search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<PaginatedResponse<Project>>(`/projects?${params}`)
      setData(r)
    } catch { toast.error('Erro ao carregar projetos') }
    finally { setLoading(false) }
  }, [params])

  useEffect(() => { load() }, [load])

  // carrega opções ao abrir modal
  const loadOptions = useCallback(async () => {
    try {
      const [c, ct, ps, u, pp] = await Promise.all([
        api.get<{ data: SelectOption[] }>('/customers?per_page=200&active=1'),
        api.get<{ data: SelectOption[] }>('/contract-types?per_page=200&active=1'),
        api.get<{ data: ProjectStatus[] }>('/project-statuses'),
        api.get<{ data: SelectOption[] }>('/users?per_page=200&enabled=1'),
        api.get<PaginatedResponse<Project>>('/projects?per_page=200&no_parent=1'),
      ])
      setCustomers(Array.isArray((c as any)?.items) ? (c as any).items : Array.isArray((c as any)?.data) ? (c as any).data : [])
      setContractTypes(Array.isArray((ct as any)?.items) ? (ct as any).items : Array.isArray((ct as any)?.data) ? (ct as any).data : [])
      setProjectStatuses(Array.isArray((ps as any)?.items) ? (ps as any).items : Array.isArray((ps as any)?.data) ? (ps as any).data : [])
      setConsultants(Array.isArray((u as any)?.items) ? (u as any).items : Array.isArray((u as any)?.data) ? (u as any).data : [])
      setParentProjects(Array.isArray(pp?.items) ? pp.items : [])
    } catch { /* silencioso */ }
  }, [])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    loadOptions()
    setModal({ open: true })
  }

  const openEdit = (item: Project) => {
    setForm({
      name: item.name,
      code: item.code,
      customer_id: String(item.customer_id),
      contract_type_id: '',
      status: item.status,
      start_date: '',
      end_date: '',
      consultant_hours: '',
      parent_project_id: '',
      consultant_ids: [],
      coordinator_ids: [],
    })
    loadOptions()
    // busca detalhes completos
    api.get<{ data: Project & { start_date?: string; end_date?: string; contract_type_id?: number; consultant_hours?: number; parent_project_id?: number; consultants?: SelectOption[]; coordinators?: SelectOption[] } }>(`/projects/${item.id}`).then(r => {
      const d = r.data ?? r as unknown as Project & { start_date?: string; end_date?: string; contract_type_id?: number; consultant_hours?: number; parent_project_id?: number; consultants?: SelectOption[]; coordinators?: SelectOption[] }
      setForm(f => ({
        ...f,
        contract_type_id: d.contract_type_id ? String(d.contract_type_id) : '',
        start_date: d.start_date ?? '',
        end_date: d.end_date ?? '',
        consultant_hours: d.consultant_hours ? String(d.consultant_hours) : '',
        parent_project_id: d.parent_project_id ? String(d.parent_project_id) : '',
        consultant_ids: d.consultants?.map(c => c.id) ?? [],
        coordinator_ids: d.coordinators?.map(c => c.id) ?? [],
      }))
    }).catch(() => {})
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        code: form.code,
        customer_id: Number(form.customer_id),
        contract_type_id: Number(form.contract_type_id),
        status: form.status,
        consultant_ids: form.consultant_ids,
        coordinator_ids: form.coordinator_ids,
      }
      if (form.start_date) payload.start_date = form.start_date
      if (form.end_date) payload.end_date = form.end_date
      if (form.consultant_hours) payload.consultant_hours = Number(form.consultant_hours)
      if (form.parent_project_id) payload.parent_project_id = Number(form.parent_project_id)

      if (modal.item) await api.put(`/projects/${modal.item.id}`, payload)
      else await api.post('/projects', payload)

      toast.success(modal.item ? 'Projeto atualizado' : 'Projeto criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Confirmar exclusão do projeto?')) return
    setDeleting(id)
    try {
      await api.delete(`/projects/${id}`)
      toast.success('Projeto excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const toggleArr = (arr: number[], id: number) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]

  return (
    <AppLayout title="Projetos">
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar projeto..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          {[
            { value: '', label: 'Todos' },
            { value: 'started', label: 'Iniciados' },
            { value: 'paused', label: 'Pausados' },
            { value: 'finished', label: 'Encerrados' },
            { value: 'cancelled', label: 'Cancelados' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => { setStatus(value); setPage(1) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${status === value ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5 ml-auto">
          <Plus size={13} /> Novo
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Código</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Projeto</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Cliente</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell w-32">Saldo</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800">
                {[...Array(6)].map((_, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3 w-full" /></td>)}
              </tr>
            ))}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-zinc-500">
                <FolderOpen size={24} className="mx-auto mb-2 opacity-30" />Nenhum projeto encontrado
              </td></tr>
            )}
            {!loading && data?.items.map(p => (
              <tr key={p.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-500 font-mono">{p.code}</td>
                <td className="px-3 py-2.5 max-w-[200px]">
                  <span className="text-zinc-200 truncate block">{p.name}</span>
                </td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate max-w-[160px]">{p.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell w-32">
                  {p.balance_percentage != null ? (
                    <div className="space-y-1">
                      <ProgressBar pct={p.balance_percentage} />
                      <span className="text-[10px] text-zinc-500">{p.balance_percentage.toFixed(0)}%</span>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={`text-[10px] border ${STATUS_CLASS[p.status] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}>
                    {p.status_display ?? p.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(p)} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"><Pencil size={12} /></button>
                    <button onClick={() => remove(p.id)} disabled={deleting === p.id} className="p-1 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {(data?.items.length ?? 0) > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-zinc-500">Página {page}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
            <button onClick={() => setPage(p => p + 1)} disabled={!data?.hasNext}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Projeto' : 'Novo Projeto'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-zinc-400">Nome *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Código *</Label>
                  <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Status</Label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                    {projectStatuses.length > 0
                      ? projectStatuses.map(s => <option key={s.code} value={s.code}>{s.name}</option>)
                      : [
                          { code: 'started', name: 'Iniciado' },
                          { code: 'paused', name: 'Pausado' },
                          { code: 'cancelled', name: 'Cancelado' },
                          { code: 'finished', name: 'Encerrado' },
                        ].map(s => <option key={s.code} value={s.code}>{s.name}</option>)
                    }
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-zinc-400">Cliente *</Label>
                  <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                    <option value="">Selecione...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-zinc-400">Tipo de Contrato *</Label>
                  <select value={form.contract_type_id} onChange={e => setForm(f => ({ ...f, contract_type_id: e.target.value }))}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                    <option value="">Selecione...</option>
                    {contractTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Data Início</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Data Fim</Label>
                  <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Horas Contratadas</Label>
                  <Input type="number" min="0" value={form.consultant_hours} onChange={e => setForm(f => ({ ...f, consultant_hours: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Projeto Pai</Label>
                  <select value={form.parent_project_id} onChange={e => setForm(f => ({ ...f, parent_project_id: e.target.value }))}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                    <option value="">Nenhum</option>
                    {parentProjects.filter(p => !modal.item || p.id !== modal.item.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Consultores */}
              {consultants.length > 0 && (
                <div>
                  <Label className="text-xs text-zinc-400 mb-2 block">Consultores</Label>
                  <div className="border border-zinc-700 rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                    {consultants.map(u => (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                        <div onClick={() => setForm(f => ({ ...f, consultant_ids: toggleArr(f.consultant_ids, u.id) }))}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${form.consultant_ids.includes(u.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-600'}`}>
                          {form.consultant_ids.includes(u.id) && <span className="text-white text-[9px]">✓</span>}
                        </div>
                        <span className="text-xs text-zinc-300">{u.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Aprovadores */}
              {consultants.length > 0 && (
                <div>
                  <Label className="text-xs text-zinc-400 mb-2 block">Aprovadores</Label>
                  <div className="border border-zinc-700 rounded-md p-2 max-h-28 overflow-y-auto space-y-1">
                    {consultants.map(u => (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                        <div onClick={() => setForm(f => ({ ...f, coordinator_ids: toggleArr(f.coordinator_ids, u.id) }))}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${form.coordinator_ids.includes(u.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-600'}`}>
                          {form.coordinator_ids.includes(u.id) && <span className="text-white text-[9px]">✓</span>}
                        </div>
                        <span className="text-xs text-zinc-300">{u.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name || !form.code || !form.customer_id}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </AppLayout>
  )
}
