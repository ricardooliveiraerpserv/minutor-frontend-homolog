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
  const color = val > 90 ? 'var(--brand-danger)' : val > 70 ? 'var(--brand-warning)' : 'var(--brand-primary)'
  return (
    <div className="w-full rounded-full h-1.5" style={{ background: 'var(--brand-border)' }}>
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${val}%`, background: color }} />
    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg z-10 hover:bg-white/5 transition-colors"
          style={{ color: 'var(--brand-muted)' }}
        >
          <X size={14} />
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
        api.get<{ data: SelectOption[] }>('/customers?pageSize=1000'),
        api.get<{ data: SelectOption[] }>('/contract-types?pageSize=200'),
        api.get<{ data: ProjectStatus[] }>('/project-statuses'),
        api.get<{ data: SelectOption[] }>('/users?pageSize=200&enabled=1'),
        api.get<PaginatedResponse<Project>>('/projects?pageSize=200&no_parent=1'),
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
      <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(0,245,255,0.08)' }}>
            <FolderOpen size={16} color="var(--brand-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>Projetos</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>Gestão de projetos e contratos</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
        >
          <Plus size={14} /> Novo
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-6 p-4 rounded-2xl flex-wrap" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar projeto..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
          {[
            { value: '', label: 'Todos' },
            { value: 'started',   label: 'Iniciados' },
            { value: 'paused',    label: 'Pausados' },
            { value: 'finished',  label: 'Encerrados' },
            { value: 'cancelled', label: 'Cancelados' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setStatus(value); setPage(1) }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={status === value
                ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                : { color: 'var(--brand-muted)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
            <thead style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Código</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Projeto</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--brand-subtle)' }}>Cliente</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell w-36" style={{ color: 'var(--brand-subtle)' }}>Saldo</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Status</th>
                <th className="px-5 py-3.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 rounded animate-pulse" style={{ background: 'var(--brand-border)', width: '70%' }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.06)' }}>
                        <FolderOpen size={20} color="var(--brand-primary)" />
                      </div>
                      <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && data?.items.map((p, idx) => (
                <tr
                  key={p.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--brand-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
                      {p.code}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 max-w-[200px]">
                    <span className="font-medium truncate block" style={{ color: 'var(--brand-text)' }}>{p.name}</span>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell truncate max-w-[160px] text-sm" style={{ color: 'var(--brand-muted)' }}>
                    {p.customer?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell w-36">
                    {p.balance_percentage != null ? (
                      <div className="space-y-1">
                        <ProgressBar pct={p.balance_percentage} />
                        <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{p.balance_percentage.toFixed(0)}%</span>
                      </div>
                    ) : <span style={{ color: 'var(--brand-subtle)' }}>—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {(() => {
                      const s = p.status ?? ''
                      const variant = s === 'active' || s === 'started' ? 'started'
                        : s === 'paused' ? 'paused'
                        : s === 'cancelled' ? 'cancelled'
                        : s === 'finished' ? 'finished'
                        : 'default'
                      return (
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: variant === 'started' ? 'rgba(0,245,255,0.10)'
                              : variant === 'paused' ? 'rgba(245,158,11,0.12)'
                              : variant === 'cancelled' ? 'rgba(239,68,68,0.12)'
                              : variant === 'finished' ? 'rgba(161,161,170,0.12)'
                              : 'rgba(161,161,170,0.12)',
                            color: variant === 'started' ? '#00F5FF'
                              : variant === 'paused' ? '#F59E0B'
                              : variant === 'cancelled' ? '#EF4444'
                              : variant === 'finished' ? '#71717A'
                              : '#A1A1AA',
                          }}
                        >
                          {p.status_display ?? p.status}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                        style={{ color: 'var(--brand-subtle)' }}
                      ><Pencil size={13} /></button>
                      <button
                        onClick={() => remove(p.id)}
                        disabled={deleting === p.id}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
                        style={{ color: 'var(--brand-danger)' }}
                      ><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {(data?.items.length ?? 0) > 0 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Página {page}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
              style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}
            ><ChevronLeft size={13} /> Anterior</button>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>{page}</span>
            <button
              onClick={() => setPage(p => p + 1)} disabled={!data?.hasNext}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
              style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}
            >Próxima <ChevronRight size={13} /></button>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-6">
            <h3 className="text-base font-bold mb-5" style={{ color: 'var(--brand-text)' }}>
              {modal.item ? 'Editar Projeto' : 'Novo Projeto'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Código *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none font-mono"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                    {(projectStatuses.length > 0 ? projectStatuses : [
                      { code: 'started', name: 'Iniciado' }, { code: 'paused', name: 'Pausado' },
                      { code: 'cancelled', name: 'Cancelado' }, { code: 'finished', name: 'Encerrado' },
                    ]).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Cliente *</label>
                  <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                    <option value="">Selecione...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Tipo de Contrato *</label>
                  <select value={form.contract_type_id} onChange={e => setForm(f => ({ ...f, contract_type_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                    <option value="">Selecione...</option>
                    {contractTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Data Início</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Data Fim</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Horas Contratadas</label>
                  <input type="number" min="0" value={form.consultant_hours} onChange={e => setForm(f => ({ ...f, consultant_hours: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Projeto Pai</label>
                  <select value={form.parent_project_id} onChange={e => setForm(f => ({ ...f, parent_project_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                    <option value="">Nenhum</option>
                    {parentProjects.filter(p => !modal.item || p.id !== modal.item.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Consultores */}
              {consultants.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Consultores</label>
                  <div className="rounded-xl p-3 max-h-32 overflow-y-auto space-y-1" style={{ border: '1px solid var(--brand-border)', background: 'var(--brand-bg)' }}>
                    {consultants.map(u => (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <div
                          onClick={() => setForm(f => ({ ...f, consultant_ids: toggleArr(f.consultant_ids, u.id) }))}
                          className="w-4 h-4 rounded flex items-center justify-center cursor-pointer shrink-0"
                          style={{
                            background: form.consultant_ids.includes(u.id) ? 'var(--brand-primary)' : 'transparent',
                            border: `1px solid ${form.consultant_ids.includes(u.id) ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
                          }}
                        >
                          {form.consultant_ids.includes(u.id) && <span className="text-[9px] font-bold" style={{ color: '#0A0A0B' }}>✓</span>}
                        </div>
                        <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>{u.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Aprovadores */}
              {consultants.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Aprovadores</label>
                  <div className="rounded-xl p-3 max-h-28 overflow-y-auto space-y-1" style={{ border: '1px solid var(--brand-border)', background: 'var(--brand-bg)' }}>
                    {consultants.map(u => (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <div
                          onClick={() => setForm(f => ({ ...f, coordinator_ids: toggleArr(f.coordinator_ids, u.id) }))}
                          className="w-4 h-4 rounded flex items-center justify-center cursor-pointer shrink-0"
                          style={{
                            background: form.coordinator_ids.includes(u.id) ? 'var(--brand-primary)' : 'transparent',
                            border: `1px solid ${form.coordinator_ids.includes(u.id) ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
                          }}
                        >
                          {form.coordinator_ids.includes(u.id) && <span className="text-[9px] font-bold" style={{ color: '#0A0A0B' }}>✓</span>}
                        </div>
                        <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>{u.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => setModal({ open: false })}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
                style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}
              >Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !form.name || !form.code || !form.customer_id}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      </div>
    </AppLayout>
  )
}
