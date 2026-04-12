'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { Project, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import { FolderOpen, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Search, ChevronDown } from 'lucide-react'

interface ProjectForm {
  name: string
  code: string
  description: string
  customer_id: string
  service_type_id: string
  contract_type_id: string
  status: string
  start_date: string
  // Valores e Horas
  project_value: string
  hourly_rate: string
  additional_hourly_rate: string
  sold_hours: string
  consultant_hours: string
  coordinator_hours: string
  initial_hours_balance: string
  initial_cost: string
  // Projeto pai
  parent_project_id: string
  // Política de despesas
  max_expense_per_consultant: string
  // Apontamentos
  timesheet_retroactive_limit_days: string
  allow_manual_timesheets: boolean
  allow_negative_balance: boolean
  // Equipe
  consultant_ids: number[]
  coordinator_ids: number[]
}

interface SelectOption { id: number; name: string }
interface ContractType { id: number; name: string }
interface ProjectStatus { code: string; name: string }

const EMPTY_FORM: ProjectForm = {
  name: '', code: '', description: '',
  customer_id: '', service_type_id: '', contract_type_id: '',
  status: 'started', start_date: '',
  project_value: '', hourly_rate: '', additional_hourly_rate: '',
  sold_hours: '', consultant_hours: '', coordinator_hours: '', initial_hours_balance: '', initial_cost: '',
  parent_project_id: '',
  max_expense_per_consultant: '',
  timesheet_retroactive_limit_days: '',
  allow_manual_timesheets: true,
  allow_negative_balance: false,
  consultant_ids: [], coordinator_ids: [],
}

// ─── SearchSelect ────────────────────────────────────────────────────────────

interface SearchSelectOption { id: number | string; name: string }

function SearchSelect({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: SearchSelectOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => String(o.id) === value)
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const select = (id: string) => { onChange(id); setOpen(false) }

  return (
    <div ref={ref} className="relative min-w-44">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm outline-none text-left"
        style={{
          background: 'var(--brand-bg)',
          border: '1px solid var(--brand-border)',
          color: selected ? 'var(--brand-text)' : 'var(--brand-subtle)',
        }}
      >
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <ChevronDown size={13} style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 w-full min-w-56 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors"
              style={{ color: !value ? 'var(--brand-primary)' : 'var(--brand-subtle)' }}
            >
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => select(String(o.id))}
                className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                style={{ color: String(o.id) === value ? 'var(--brand-primary)' : 'var(--brand-text)' }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-primary)' }}>{children}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--brand-border)' }} />
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>
      {children}{required && <span style={{ color: 'var(--brand-danger)' }}> *</span>}
    </label>
  )
}

const inputStyle = {
  background: 'var(--brand-bg)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
} as const

function FieldInput({ value, onChange, type = 'text', placeholder, step, min, max, className = '' }: {
  value: string; onChange: (v: string) => void; type?: string;
  placeholder?: string; step?: string; min?: string; max?: string; className?: string
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} step={step} min={min} max={max}
      className={`w-full px-3 py-2.5 rounded-xl text-sm outline-none ${className}`}
      style={inputStyle}
    />
  )
}

function FieldSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
      style={inputStyle}
    >
      {children}
    </select>
  )
}

function Toggle({ checked, onChange, labelOn, labelOff }: { checked: boolean; onChange: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs"
      style={{ color: 'var(--brand-muted)' }}
    >
      <div
        className="relative w-9 h-5 rounded-full transition-colors"
        style={{ background: checked ? 'var(--brand-primary)' : 'var(--brand-border)' }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
          style={{ background: checked ? '#0A0A0B' : 'var(--brand-muted)', left: checked ? '18px' : '2px' }}
        />
      </div>
      <span>{checked ? labelOn : labelOff}</span>
    </button>
  )
}

// Geração automática de código de projeto
function generateCompactCode(text: string, maxLength: number): string {
  const normalized = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim()
  const words = normalized.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].substring(0, maxLength)
  let result = ''
  const lettersPerWord = Math.max(1, Math.floor(maxLength / words.length))
  const extra = maxLength % words.length
  for (let i = 0; i < words.length && result.length < maxLength; i++) {
    let take = lettersPerWord + (i < extra ? 1 : 0)
    take = Math.min(take, words[i].length, maxLength - result.length)
    result += words[i].substring(0, take)
  }
  return result
}

function generateProjectCode(customerName: string, projectName: string, seq: number): string {
  const custCode = generateCompactCode(customerName, 3)
  const projCode = generateCompactCode(projectName, 8)
  return `${custCode}${projCode}${String(seq).padStart(3, '0')}`.toUpperCase()
}

export default function ProjectsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  // Filtros de lista
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterContractType, setFilterContractType] = useState('')
  const [filterApprover, setFilterApprover] = useState('')
  const [filterExecutive, setFilterExecutive] = useState('')
  // Opções de filtro de lista
  const [filterCustomers, setFilterCustomers] = useState<SelectOption[]>([])
  const [filterContractTypes, setFilterContractTypes] = useState<ContractType[]>([])
  const [filterApprovers, setFilterApprovers] = useState<SelectOption[]>([])
  const [filterExecutives, setFilterExecutives] = useState<SelectOption[]>([])

  const [data, setData] = useState<PaginatedResponse<Project> | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; item?: Project }>({ open: false })
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [codeManual, setCodeManual] = useState(false)

  // Opções dos selects do modal
  const [customers, setCustomers] = useState<SelectOption[]>([])
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [serviceTypes, setServiceTypes] = useState<SelectOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<ProjectStatus[]>([])
  const [consultants, setConsultants] = useState<SelectOption[]>([])
  const [approvers, setApprovers] = useState<SelectOption[]>([])
  const [parentProjects, setParentProjects] = useState<SelectOption[]>([])
  // Busca dentro das listas de equipe
  const [searchConsultant, setSearchConsultant] = useState('')
  const [searchApprover, setSearchApprover] = useState('')

  // Contract type helpers
  const selectedContractType = useMemo(
    () => contractTypes.find(ct => String(ct.id) === form.contract_type_id),
    [contractTypes, form.contract_type_id]
  )
  const isOnDemand = selectedContractType?.name.toLowerCase().trim() === 'on demand'
  const isBankHours = selectedContractType?.name.toLowerCase().includes('banco de horas') ?? false
  // Fechado e SaaS: não é On Demand nem Banco de Horas → mostra consultant_hours e save_erpserv
  const isFechado = !!selectedContractType && !isOnDemand && !isBankHours

  // save_erpserv = sold_hours - consultant_hours - (coordinator_hours/100 * consultant_hours)
  const saveErpserv = useMemo(() => {
    if (!isFechado) return null
    const sold = Number(form.sold_hours) || 0
    const consult = Number(form.consultant_hours) || 0
    const coord = Number(form.coordinator_hours) || 0
    const coordContrib = (coord * consult) / 100
    return Math.round((sold - consult - coordContrib) * 100) / 100
  }, [isFechado, form.sold_hours, form.consultant_hours, form.coordinator_hours])

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (statusFilter) p.set('status', statusFilter)
    if (search) p.set('search', search)
    if (filterCustomer) p.set('customer_id', filterCustomer)
    if (filterContractType) p.set('contract_type_id', filterContractType)
    if (filterApprover) p.set('approver_id', filterApprover)
    if (filterExecutive) p.set('executive_id', filterExecutive)
    return p.toString()
  }, [page, statusFilter, search, filterCustomer, filterContractType, filterApprover, filterExecutive])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<PaginatedResponse<Project>>(`/projects?${params}`)
      setData(r)
    } catch { toast.error('Erro ao carregar projetos') }
    finally { setLoading(false) }
  }, [params])

  useEffect(() => { load() }, [load])

  // Carrega opções dos filtros de lista uma única vez
  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.all([
      api.get<any>('/customers?pageSize=1000'),
      api.get<any>('/contract-types?pageSize=200'),
      api.get<any>('/users?pageSize=200&enabled=1'),
      api.get<any>('/executives?pageSize=1000'),
    ]).then(([c, ct, u, ex]) => {
      setFilterCustomers(items(c))
      setFilterContractTypes(items(ct))
      setFilterApprovers(items(u))
      setFilterExecutives(items(ex))
    }).catch(() => {})
  }, [])

  const loadOptions = useCallback(async () => {
    try {
      const [c, ct, st, ps, u, appr] = await Promise.all([
        api.get<any>('/customers?pageSize=1000'),
        api.get<any>('/contract-types?pageSize=200'),
        api.get<any>('/service-types?pageSize=200'),
        api.get<any>('/project-statuses'),
        api.get<any>('/users?pageSize=500&enabled=1'),
        api.get<any>('/users/approvers?pageSize=500'),
      ])
      const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCustomers(items(c))
      setContractTypes(items(ct))
      setServiceTypes(items(st))
      setProjectStatuses(items(ps))
      setConsultants(items(u))
      setApprovers(items(appr))
    } catch { /* silencioso */ }
  }, [])

  // Carrega projetos pais do cliente selecionado
  const loadParentProjects = useCallback(async (customerId: string, excludeId?: number) => {
    if (!customerId) { setParentProjects([]); return }
    try {
      const qs = new URLSearchParams({ pageSize: '200', parent_projects_only: 'true', customer_id: customerId })
      if (excludeId) qs.set('exclude_id', String(excludeId))
      const r = await api.get<PaginatedResponse<Project>>(`/projects?${qs}`)
      setParentProjects(Array.isArray(r?.items) ? r.items.map(p => ({ id: p.id, name: `${p.code} - ${p.name}` })) : [])
    } catch { setParentProjects([]) }
  }, [])

  // Auto-generate code when customer or name changes
  useEffect(() => {
    if (codeManual || modal.item) return
    const customer = customers.find(c => String(c.id) === form.customer_id)
    if (customer && form.name.trim()) {
      setForm(f => ({ ...f, code: generateProjectCode(customer.name, form.name, 1) }))
    }
  }, [form.customer_id, form.name, customers, codeManual, modal.item])

  // When customer changes, reload parent projects
  useEffect(() => {
    if (form.customer_id) {
      loadParentProjects(form.customer_id, modal.item?.id)
      // Reset parent when customer changes
      if (!modal.item) setForm(f => ({ ...f, parent_project_id: '' }))
    }
  }, [form.customer_id])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setCodeManual(false)
    editedFinancialRef.current = []
    setSearchConsultant('')
    setSearchApprover('')
    setParentProjects([])
    loadOptions()
    setModal({ open: true })
  }

  const openEdit = (item: Project) => {
    // Pré-preenche imediatamente com o que já temos da listagem
    setForm({
      ...EMPTY_FORM,
      name: item.name ?? '',
      code: item.code ?? '',
      customer_id: item.customer_id ? String(item.customer_id) : '',
      status: item.status ?? 'started',
    })
    setCodeManual(true)
    editedFinancialRef.current = []
    setSearchConsultant('')
    setSearchApprover('')
    loadOptions()
    setModal({ open: true, item })

    // Busca detalhes completos e complementa o form
    api.get<any>(`/projects/${item.id}`).then(r => {
      // Backend pode retornar { data: {...} } ou o objeto direto
      const d = (r?.data && typeof r.data === 'object' && 'id' in r.data) ? r.data : r

      const f: ProjectForm = {
        name: d.name ?? item.name ?? '',
        code: d.code ?? item.code ?? '',
        description: d.description ?? '',
        customer_id: d.customer_id ? String(d.customer_id) : String(item.customer_id ?? ''),
        service_type_id: d.service_type_id ? String(d.service_type_id) : '',
        contract_type_id: d.contract_type_id ? String(d.contract_type_id) : '',
        status: d.status ?? item.status ?? 'started',
        start_date: d.start_date ?? '',
        project_value: d.project_value != null ? String(d.project_value) : '',
        hourly_rate: d.hourly_rate != null ? String(d.hourly_rate) : '',
        additional_hourly_rate: d.additional_hourly_rate != null ? String(d.additional_hourly_rate) : '',
        sold_hours: d.sold_hours != null ? String(d.sold_hours) : '',
        consultant_hours: d.consultant_hours != null ? String(d.consultant_hours) : '',
        coordinator_hours: d.coordinator_hours != null ? String(d.coordinator_hours) : '',
        initial_hours_balance: d.initial_hours_balance != null ? String(d.initial_hours_balance) : '',
        initial_cost: d.initial_cost != null ? String(d.initial_cost) : '',
        parent_project_id: d.parent_project_id ? String(d.parent_project_id) : '',
        max_expense_per_consultant: d.max_expense_per_consultant != null ? String(d.max_expense_per_consultant) : '',
        timesheet_retroactive_limit_days: d.timesheet_retroactive_limit_days != null ? String(d.timesheet_retroactive_limit_days) : '',
        allow_manual_timesheets: d.allow_manual_timesheets ?? true,
        allow_negative_balance: d.allow_negative_balance ?? false,
        consultant_ids: (d.consultants ?? []).map((c: any) => c.id),
        coordinator_ids: (d.coordinators ?? d.approvers ?? []).map((c: any) => c.id),
      }
      setForm(f)

      // Inicializa editedFields com os campos já preenchidos
      const preloaded: ('project_value' | 'hourly_rate' | 'sold_hours')[] = []
      if (f.project_value) preloaded.push('project_value')
      if (f.sold_hours)    preloaded.push('sold_hours')
      if (f.hourly_rate)   preloaded.push('hourly_rate')
      editedFinancialRef.current = preloaded.slice(0, 2)

      if (d.customer_id) loadParentProjects(String(d.customer_id), item.id)
    }).catch(e => {
      console.error('Erro ao carregar projeto:', e)
      toast.error('Erro ao carregar detalhes do projeto')
    })
  }

  const save = async () => {
    if (!form.name || !form.code || !form.customer_id || !form.contract_type_id || !form.service_type_id) {
      toast.error('Preencha os campos obrigatórios')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        code: form.code,
        description: form.description || null,
        customer_id: Number(form.customer_id),
        service_type_id: Number(form.service_type_id),
        contract_type_id: Number(form.contract_type_id),
        status: form.status,
        consultant_ids: form.consultant_ids,
        coordinator_ids: form.coordinator_ids,
        allow_manual_timesheets: form.allow_manual_timesheets,
      }
      if (form.start_date) payload.start_date = form.start_date
      if (form.parent_project_id) payload.parent_project_id = Number(form.parent_project_id)
      if (form.project_value) payload.project_value = Number(form.project_value)
      if (form.hourly_rate) payload.hourly_rate = Number(form.hourly_rate)
      if (form.additional_hourly_rate) payload.additional_hourly_rate = Number(form.additional_hourly_rate)
      if (!isOnDemand) {
        if (form.sold_hours) payload.sold_hours = Number(form.sold_hours)
        if (form.consultant_hours) payload.consultant_hours = Number(form.consultant_hours)
        if (form.coordinator_hours) payload.coordinator_hours = Number(form.coordinator_hours)
        if (form.initial_hours_balance !== '') payload.initial_hours_balance = Number(form.initial_hours_balance)
        if (form.initial_cost !== '') payload.initial_cost = Number(form.initial_cost)
        payload.allow_negative_balance = form.allow_negative_balance
      }
      if (form.max_expense_per_consultant) payload.max_expense_per_consultant = Number(form.max_expense_per_consultant)
      if (form.timesheet_retroactive_limit_days !== '') payload.timesheet_retroactive_limit_days = Number(form.timesheet_retroactive_limit_days)

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

  const setF = (key: keyof ProjectForm) => (v: string | boolean | number[]) =>
    setForm(f => ({ ...f, [key]: v }))

  // Rastreia os 2 últimos campos financeiros editados pelo usuário
  // O 3º (não editado) é auto-calculado: pv = hr × sh | hr = pv ÷ sh | sh = pv ÷ hr
  const editedFinancialRef = useRef<('project_value' | 'hourly_rate' | 'sold_hours')[]>([])

  const handleFinancialChange = useCallback((
    field: 'project_value' | 'hourly_rate' | 'sold_hours',
    value: string
  ) => {
    const allFields = ['project_value', 'hourly_rate', 'sold_hours'] as const
    // Atualiza histórico de edição
    editedFinancialRef.current = [
      field,
      ...editedFinancialRef.current.filter(f => f !== field),
    ].slice(0, 2)
    const edited = editedFinancialRef.current

    setForm(f => {
      const next = { ...f, [field]: value }
      // Campo a calcular: o que NÃO está nos 2 últimos editados
      const toCalc: 'project_value' | 'hourly_rate' | 'sold_hours' =
        edited.length >= 2
          ? (allFields.find(x => !edited.includes(x)) ?? 'hourly_rate')
          : 'hourly_rate'

      const pv = Number(field === 'project_value' ? value : f.project_value) || 0
      const hr = Number(field === 'hourly_rate'   ? value : f.hourly_rate)   || 0
      const sh = Number(field === 'sold_hours'    ? value : f.sold_hours)    || 0

      let result = 0
      if (toCalc === 'project_value') result = Math.round(hr * sh * 100) / 100
      else if (toCalc === 'hourly_rate')  result = sh > 0 ? Math.round((pv / sh) * 100) / 100 : 0
      else                                result = hr > 0 ? Math.round(pv / hr)             : 0 // sold_hours é inteiro

      return { ...next, [toCalc]: result > 0 ? String(result) : '' }
    })
  }, [])

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
        <div className="mb-6 p-4 rounded-2xl space-y-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {/* Linha 1: busca + selects */}
          <div className="flex items-center gap-2 flex-wrap">
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
            <SearchSelect
              value={filterCustomer}
              onChange={v => { setFilterCustomer(v); setPage(1) }}
              options={filterCustomers}
              placeholder="Todos os clientes"
            />
            <SearchSelect
              value={filterContractType}
              onChange={v => { setFilterContractType(v); setPage(1) }}
              options={filterContractTypes}
              placeholder="Todos os tipos"
            />
            <SearchSelect
              value={filterApprover}
              onChange={v => { setFilterApprover(v); setPage(1) }}
              options={filterApprovers}
              placeholder="Todos os aprovadores"
            />
            {filterExecutives.length > 0 && (
              <SearchSelect
                value={filterExecutive}
                onChange={v => { setFilterExecutive(v); setPage(1) }}
                options={filterExecutives}
                placeholder="Todos os executivos"
              />
            )}
            {(filterCustomer || filterContractType || filterApprover || filterExecutive || search) && (
              <button
                onClick={() => { setFilterCustomer(''); setFilterContractType(''); setFilterApprover(''); setFilterExecutive(''); setSearch(''); setPage(1) }}
                className="px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
                style={{ color: 'var(--brand-danger)', border: '1px solid var(--brand-border)' }}
              >Limpar</button>
            )}
          </div>
          {/* Linha 2: botões de status */}
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            {[
              { value: '', label: 'Todos' },
              { value: 'started', label: 'Iniciados' },
              { value: 'paused', label: 'Pausados' },
              { value: 'finished', label: 'Encerrados' },
              { value: 'cancelled', label: 'Cancelados' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setStatusFilter(value); setPage(1) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={statusFilter === value
                  ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                  : { color: 'var(--brand-muted)' }}
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
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Código</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Projeto</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--brand-subtle)' }}>Cliente</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--brand-subtle)' }}>Tipo de Contrato</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider hidden xl:table-cell" style={{ color: 'var(--brand-subtle)' }}>Hs Vendidas</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider hidden xl:table-cell" style={{ color: 'var(--brand-subtle)' }}>Hs Consumidas</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell w-32" style={{ color: 'var(--brand-subtle)' }}>Saldo</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Status</th>
                  <th className="px-4 py-3.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 rounded animate-pulse" style={{ background: 'var(--brand-border)', width: '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.06)' }}>
                          <FolderOpen size={20} color="var(--brand-primary)" />
                        </div>
                        <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado</span>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && data?.items.map(p => (
                  <tr
                    key={p.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--brand-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
                        {p.code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        {p.parent_project_id && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(0,245,255,0.10)', color: 'var(--brand-primary)' }}>FILHO</span>
                        )}
                        <span className="font-medium truncate block" style={{ color: 'var(--brand-text)' }}>{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell truncate max-w-[140px] text-sm" style={{ color: 'var(--brand-muted)' }}>
                      {p.customer?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell text-xs" style={{ color: 'var(--brand-muted)' }}>
                      {p.contract_type_display ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell text-xs text-right tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                      {p.sold_hours != null ? `${p.sold_hours}h` : '—'}
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell text-xs text-right tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                      {p.consumed_hours != null ? `${p.consumed_hours}h` : p.total_logged_minutes != null ? `${(p.total_logged_minutes / 60).toFixed(1)}h` : '—'}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell w-32">
                      {(() => {
                        const sold = p.sold_hours ?? 0
                        const balance = p.general_hours_balance
                        const pct = p.balance_percentage != null
                          ? p.balance_percentage
                          : (sold > 0 && balance != null)
                            ? Math.round(((sold - balance) / sold) * 100)
                            : null
                        if (pct == null && balance == null) return <span style={{ color: 'var(--brand-subtle)' }}>—</span>
                        return (
                          <div className="space-y-1">
                            {pct != null && <ProgressBar pct={pct} />}
                            <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>
                              {pct != null ? `${pct}% · ` : ''}{balance != null ? `${balance}h` : ''}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3.5">
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
                    <td className="px-4 py-3.5">
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

              <div className="space-y-4">

                {/* ── Identificação ── */}
                <SectionTitle>Identificação</SectionTitle>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FieldLabel required>Nome do Projeto</FieldLabel>
                    <FieldInput value={form.name} onChange={setF('name')} />
                  </div>
                  <div>
                    <FieldLabel required>Código</FieldLabel>
                    <FieldInput
                      value={form.code}
                      onChange={v => { setCodeManual(true); setF('code')(v.toUpperCase()) }}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <FieldSelect value={form.status} onChange={setF('status')}>
                      {(projectStatuses.length > 0 ? projectStatuses : [
                        { code: 'started', name: 'Iniciado' },
                        { code: 'paused', name: 'Pausado' },
                        { code: 'cancelled', name: 'Cancelado' },
                        { code: 'finished', name: 'Encerrado' },
                      ]).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </FieldSelect>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Cliente</FieldLabel>
                    <FieldSelect value={form.customer_id} onChange={setF('customer_id')}>
                      <option value="">Selecione...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </FieldSelect>
                  </div>
                  <div>
                    <FieldLabel required>Tipo de Contrato</FieldLabel>
                    <FieldSelect value={form.contract_type_id} onChange={setF('contract_type_id')}>
                      <option value="">Selecione...</option>
                      {contractTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </FieldSelect>
                  </div>
                  <div>
                    <FieldLabel required>Tipo de Serviço</FieldLabel>
                    <FieldSelect value={form.service_type_id} onChange={setF('service_type_id')}>
                      <option value="">Selecione...</option>
                      {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </FieldSelect>
                  </div>
                  <div>
                    <FieldLabel>Data de Início</FieldLabel>
                    <FieldInput type="date" value={form.start_date} onChange={setF('start_date')} />
                  </div>
                  <div>
                    <FieldLabel>Projeto Pai</FieldLabel>
                    <FieldSelect value={form.parent_project_id} onChange={setF('parent_project_id')}>
                      <option value="">Nenhum</option>
                      {parentProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </FieldSelect>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Descrição</FieldLabel>
                    <textarea
                      value={form.description}
                      onChange={e => setF('description')(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* ── Valores e Horas ── */}
                <SectionTitle>Valores e Horas</SectionTitle>

                <div className="grid grid-cols-3 gap-3">
                  {!isOnDemand && (
                    <div>
                      <FieldLabel>Valor do Projeto (R$)</FieldLabel>
                      <FieldInput type="number" value={form.project_value} onChange={v => handleFinancialChange('project_value', v)} placeholder="0,00" min="0" step="0.01" />
                    </div>
                  )}
                  <div>
                    <FieldLabel>Valor da Hora (R$)</FieldLabel>
                    <FieldInput type="number" value={form.hourly_rate} onChange={v => handleFinancialChange('hourly_rate', v)} placeholder="0,00" min="0" step="0.01" />
                  </div>
                  {!isOnDemand && (
                    <div>
                      <FieldLabel>Hora Adicional (R$)</FieldLabel>
                      <FieldInput type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} placeholder="0,00" min="0" step="0.01" />
                    </div>
                  )}

                  {!isOnDemand && (
                    <>
                      <div>
                        <FieldLabel>Horas Vendidas</FieldLabel>
                        <FieldInput type="number" value={form.sold_hours} onChange={v => handleFinancialChange('sold_hours', v)} placeholder="0" min="0" step="1" />
                      </div>
                      <div>
                        <FieldLabel>% Horas Coordenador</FieldLabel>
                        <FieldInput type="number" value={form.coordinator_hours} onChange={setF('coordinator_hours')} placeholder="0" min="0" max="100" step="1" />
                      </div>
                      {isFechado && (
                        <>
                          <div>
                            <FieldLabel>Horas Consultor</FieldLabel>
                            <FieldInput type="number" value={form.consultant_hours} onChange={setF('consultant_hours')} placeholder="0" min="0" step="1" />
                          </div>
                          <div>
                            <FieldLabel>Save ERPSERV</FieldLabel>
                            <input
                              readOnly
                              value={saveErpserv ?? ''}
                              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-not-allowed"
                              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)', opacity: 0.7 }}
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {!isOnDemand && (
                  <div className="rounded-xl p-3 grid grid-cols-2 gap-3" style={{ border: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Histórico do sistema anterior</p>
                    </div>
                    <div>
                      <FieldLabel>Saldo Inicial de Horas</FieldLabel>
                      <FieldInput type="number" value={form.initial_hours_balance} onChange={setF('initial_hours_balance')} placeholder="0" step="0.5" />
                    </div>
                    <div>
                      <FieldLabel>Custo Inicial (R$)</FieldLabel>
                      <FieldInput type="number" value={form.initial_cost} onChange={setF('initial_cost')} placeholder="0,00" min="0" step="0.01" />
                    </div>
                  </div>
                )}

                {/* ── Política de Despesas ── */}
                <SectionTitle>Política de Despesas</SectionTitle>
                <div>
                  <FieldLabel>Valor Máximo por Consultor (R$)</FieldLabel>
                  <FieldInput
                    type="number"
                    value={form.max_expense_per_consultant}
                    onChange={setF('max_expense_per_consultant')}
                    placeholder="Deixe em branco para ilimitado"
                    min="0" step="0.01"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--brand-subtle)' }}>Deixe em branco para despesas ilimitadas</p>
                </div>

                {/* ── Configurações de Apontamento ── */}
                <SectionTitle>Apontamentos</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Prazo para lançamento (dias)</FieldLabel>
                    <FieldInput
                      type="number"
                      value={form.timesheet_retroactive_limit_days}
                      onChange={setF('timesheet_retroactive_limit_days')}
                      placeholder="Padrão global"
                      min="0" max="365"
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-0.5 gap-3">
                    <Toggle
                      checked={form.allow_manual_timesheets}
                      onChange={v => setF('allow_manual_timesheets')(v)}
                      labelOn="Apontamentos manuais permitidos"
                      labelOff="Somente via webhook"
                    />
                    {!isOnDemand && (
                      <Toggle
                        checked={form.allow_negative_balance}
                        onChange={v => setF('allow_negative_balance')(v)}
                        labelOn="Saldo negativo permitido"
                        labelOff="Bloquear ao zerar saldo"
                      />
                    )}
                  </div>
                </div>

                {/* ── Equipe ── */}
                <SectionTitle>Equipe do Projeto</SectionTitle>

                <div className="grid grid-cols-2 gap-3">
                  {/* Consultores */}
                  <div>
                    <FieldLabel>Consultores</FieldLabel>
                    <input
                      value={searchConsultant}
                      onChange={e => setSearchConsultant(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full px-3 py-1.5 rounded-lg text-xs outline-none mb-1.5"
                      style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                    />
                    <div className="rounded-xl p-2 max-h-40 overflow-y-auto space-y-0.5" style={{ border: '1px solid var(--brand-border)', background: 'var(--brand-bg)' }}>
                      {consultants
                        .filter(u => !searchConsultant || u.name.toLowerCase().includes(searchConsultant.toLowerCase()))
                        .map(u => (
                          <label key={u.id} className="flex items-center gap-2 cursor-pointer px-1 py-1 rounded-lg hover:bg-white/5">
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
                      {consultants.length === 0 && (
                        <p className="text-xs text-center py-2" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
                      )}
                    </div>
                  </div>

                  {/* Coordenadores — apenas perfil aprovador */}
                  <div>
                    <FieldLabel>Coordenadores/Aprovadores</FieldLabel>
                    <input
                      value={searchApprover}
                      onChange={e => setSearchApprover(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full px-3 py-1.5 rounded-lg text-xs outline-none mb-1.5"
                      style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                    />
                    <div className="rounded-xl p-2 max-h-40 overflow-y-auto space-y-0.5" style={{ border: '1px solid var(--brand-border)', background: 'var(--brand-bg)' }}>
                      {approvers
                        .filter(u => !searchApprover || u.name.toLowerCase().includes(searchApprover.toLowerCase()))
                        .map(u => (
                          <label key={u.id} className="flex items-center gap-2 cursor-pointer px-1 py-1 rounded-lg hover:bg-white/5">
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
                      {approvers.length === 0 && (
                        <p className="text-xs text-center py-2" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-6 justify-end">
                <button
                  onClick={() => setModal({ open: false })}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
                  style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}
                >Cancelar</button>
                <button
                  onClick={save}
                  disabled={saving || !form.name || !form.code || !form.customer_id || !form.contract_type_id || !form.service_type_id}
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
