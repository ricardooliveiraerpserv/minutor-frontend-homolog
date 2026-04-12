'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { Project, PaginatedResponse, ProjectChangeLog, HourContribution } from '@/types'
import { toast } from 'sonner'
import { FolderOpen, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Search, ChevronDown, Eye, Clock, Users, TrendingUp, Tag, History, HandCoins, Save, AlertCircle } from 'lucide-react'

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

// ─── Tree ────────────────────────────────────────────────────────────────────

interface TreeRow extends Project {
  _level: number
  _hasChildren: boolean
  _isExpanded: boolean
  _parentId: number | null
  _node_state: 'ACTIVE' | 'DISABLED' | null
}

function cleanName(name: string) {
  return (name || '').replace(/^\[.*?\]\s*/g, '').trim()
}

function toTreeRow(p: Project, level = 0, parentId: number | null = null, nodeState: 'ACTIVE' | 'DISABLED' | null = null): TreeRow {
  return { ...p, _level: level, _hasChildren: (p.child_projects?.length ?? 0) > 0, _isExpanded: false, _parentId: parentId, _node_state: nodeState }
}

// % consumido = consumed / (sold + contributions) * 100
function calcConsumedPct(row: TreeRow): number | null {
  const sold = row.sold_hours ?? 0
  const contrib = row.total_contributions_hours ?? row.hour_contribution ?? 0
  const totalSold = sold + contrib
  if (totalSold <= 0) return null
  const consumed = row.consumed_hours != null
    ? row.consumed_hours
    : row.total_logged_minutes != null ? row.total_logged_minutes / 60 : null
  if (consumed == null) return null
  return Math.round((consumed / totalSold) * 100)
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

// Barra de consumo: % consumido (0-100+)
function ProgressBar({ pct }: { pct?: number }) {
  const val = Math.min(100, Math.max(0, pct ?? 0))
  const color = val >= 90 ? '#ef4444' : val >= 70 ? '#f59e0b' : val >= 50 ? '#22c55e' : '#2563EB'
  return (
    <div className="w-full rounded-full h-1" style={{ background: 'var(--brand-border)' }}>
      <div className="h-1 rounded-full transition-all" style={{ width: `${val}%`, background: color }} />
    </div>
  )
}

// Coluna Saldo: destaque nas horas, % auxiliar
function SaldoCell({ balance, consumedPct, barPct, consumed, isOnDemand }: {
  balance: number | null | undefined
  consumedPct: number | null
  barPct: number | null
  consumed: number | null
  isOnDemand: boolean
}) {
  if (isOnDemand) {
    return (
      <div className="space-y-1.5 min-w-[130px]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tabular-nums" style={{ color: '#71717A' }}>{consumed ?? 0}h</span>
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--brand-subtle)' }}>consumidas</span>
        </div>
        <ProgressBar pct={0} />
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>On Demand · sem saldo</span>
      </div>
    )
  }

  if (balance == null && consumedPct == null) {
    return <span style={{ color: 'var(--brand-subtle)' }}>—</span>
  }

  const isNegative = balance != null && balance < 0
  const isExceeded = consumedPct != null && consumedPct >= 100
  const balanceColor = isNegative || isExceeded ? '#ef4444'
    : consumedPct != null && consumedPct >= 70 ? '#f59e0b'
    : '#2563EB'

  return (
    <div className="space-y-1.5 min-w-[130px]">
      {/* Valor principal: horas de saldo */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold tabular-nums" style={{ color: balanceColor }}>
          {balance != null ? `${balance}h` : '—'}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--brand-subtle)' }}>
          {isNegative ? 'excedido' : 'saldo'}
        </span>
      </div>

      {/* Barra de progresso */}
      {barPct != null && <ProgressBar pct={barPct} />}

      {/* Percentual auxiliar */}
      {consumedPct != null && (
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>
          {isNegative || isExceeded ? '⚠ Excedido' : `${consumedPct}% utilizado`}
        </span>
      )}
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
  const [multiContratual, setMultiContratual] = useState(false)
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
  const [viewProject, setViewProject] = useState<Project | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewTab, setViewTab] = useState<'overview' | 'contributions' | 'history'>('overview')
  // Aportes
  const [contributions, setContributions] = useState<HourContribution[]>([])
  const [contribLoading, setContribLoading] = useState(false)
  const [contribModal, setContribModal] = useState<{ open: boolean; item?: HourContribution }>({ open: false })
  const [contribForm, setContribForm] = useState({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' })
  const [contribSaving, setContribSaving] = useState(false)
  // Histórico
  const [history, setHistory] = useState<ProjectChangeLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFieldFilter, setHistoryFieldFilter] = useState('all')
  const [editingLog, setEditingLog] = useState<ProjectChangeLog | null>(null)
  const [editLogReason, setEditLogReason] = useState('')
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
    if (multiContratual) p.set('parent_projects_only', 'true')
    if (statusFilter) p.set('status', statusFilter)
    if (search) p.set('search', search)
    if (filterCustomer) p.set('customer_id', filterCustomer)
    if (!multiContratual && filterContractType) p.set('contract_type_id', filterContractType)
    if (filterApprover) p.set('approver_id', filterApprover)
    if (filterExecutive) p.set('executive_id', filterExecutive)
    return p.toString()
  }, [page, multiContratual, statusFilter, search, filterCustomer, filterContractType, filterApprover, filterExecutive])

  const [rows, setRows] = useState<TreeRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<PaginatedResponse<Project>>(`/projects?${params}`)
      setData(r)
      setRows((r?.items ?? []).map(p => toTreeRow(p)))
    } catch { toast.error('Erro ao carregar projetos') }
    finally { setLoading(false) }
  }, [params])

  useEffect(() => { load() }, [load])

  const toggleExpand = useCallback((row: TreeRow) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === row.id && r._level === 0)
      if (idx === -1) return prev
      if (row._isExpanded) {
        // Recolher: remove filhos e marca como fechado
        const next = prev.filter(r => r._parentId !== row.id)
        next[next.findIndex(r => r.id === row.id)] = { ...row, _isExpanded: false }
        return [...next]
      } else {
        // Expandir: insere filhos logo após o pai
        const children = (row.child_projects ?? []).map(child => {
          // node_state: se há filtro de status, filhos que não batem ficam DISABLED
          const nodeState = statusFilter && statusFilter !== 'all'
            ? (child.status === statusFilter ? 'ACTIVE' : 'DISABLED')
            : null
          return toTreeRow(child, 1, row.id, nodeState)
        })
        const updated = { ...row, _isExpanded: true }
        return [
          ...prev.slice(0, idx),
          updated,
          ...children,
          ...prev.slice(idx + 1),
        ]
      }
    })
  }, [statusFilter])

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

  const openView = async (item: Project) => {
    setViewProject(item)
    setViewTab('overview')
    setContributions([])
    setHistory([])
    setViewLoading(true)
    try {
      const r = await api.get<any>(`/projects/${item.id}`)
      const d = (r?.data && typeof r.data === 'object' && 'id' in r.data) ? r.data : r
      setViewProject(d)
    } catch {
      // mantém dados parciais da listagem
    } finally {
      setViewLoading(false)
    }
  }

  const loadContributions = async (projectId: number) => {
    setContribLoading(true)
    try {
      const r = await api.get<{ items: HourContribution[] }>(`/projects/${projectId}/hour-contributions`)
      setContributions((r.items ?? []).map(c => ({ ...c, total_value: c.contributed_hours * c.hourly_rate })))
    } catch { toast.error('Erro ao carregar aportes') }
    finally { setContribLoading(false) }
  }

  const saveContrib = async () => {
    if (!viewProject) return
    if (!contribForm.contributed_hours || !contribForm.hourly_rate || !contribForm.contributed_at) {
      toast.error('Preencha horas, valor/hora e data')
      return
    }
    setContribSaving(true)
    try {
      const payload = {
        contributed_hours: Number(contribForm.contributed_hours),
        hourly_rate: Number(contribForm.hourly_rate),
        contributed_at: contribForm.contributed_at,
        description: contribForm.description || null,
      }
      if (contribModal.item) {
        await api.put(`/projects/${viewProject.id}/hour-contributions/${contribModal.item.id}`, payload)
        toast.success('Aporte atualizado')
      } else {
        await api.post(`/projects/${viewProject.id}/hour-contributions`, payload)
        toast.success('Aporte adicionado')
      }
      setContribModal({ open: false })
      loadContributions(viewProject.id)
    } catch { toast.error('Erro ao salvar aporte') }
    finally { setContribSaving(false) }
  }

  const deleteContrib = async (c: HourContribution) => {
    if (!viewProject || !confirm(`Excluir aporte de ${c.contributed_hours}h?`)) return
    try {
      await api.delete(`/projects/${viewProject.id}/hour-contributions/${c.id}`)
      toast.success('Aporte excluído')
      loadContributions(viewProject.id)
    } catch { toast.error('Erro ao excluir aporte') }
  }

  const loadHistory = async (projectId: number, fieldFilter = 'all') => {
    setHistoryLoading(true)
    try {
      const qs = new URLSearchParams({ page: '1', pageSize: '50' })
      if (fieldFilter !== 'all') qs.set('field_name', fieldFilter)
      const r = await api.get<{ items: ProjectChangeLog[] }>(`/projects/${projectId}/change-history?${qs}`)
      setHistory(r.items ?? [])
    } catch { toast.error('Erro ao carregar histórico') }
    finally { setHistoryLoading(false) }
  }

  const saveLogEdit = async () => {
    if (!viewProject || !editingLog) return
    try {
      await api.put(`/projects/${viewProject.id}/change-history/${editingLog.id}`, { reason: editLogReason })
      toast.success('Registro atualizado')
      setEditingLog(null)
      loadHistory(viewProject.id, historyFieldFilter)
    } catch { toast.error('Erro ao atualizar registro') }
  }

  const deleteLog = async (log: ProjectChangeLog) => {
    if (!viewProject || !confirm('Excluir este registro do histórico?')) return
    try {
      await api.delete(`/projects/${viewProject.id}/change-history/${log.id}`)
      toast.success('Registro removido')
      loadHistory(viewProject.id, historyFieldFilter)
    } catch { toast.error('Erro ao excluir registro') }
  }

  const handleViewTab = (tab: 'overview' | 'contributions' | 'history') => {
    setViewTab(tab)
    if (!viewProject) return
    if (tab === 'contributions' && contributions.length === 0) loadContributions(viewProject.id)
    if (tab === 'history' && history.length === 0) loadHistory(viewProject.id, historyFieldFilter)
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
            <SearchSelect
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1) }}
              options={[
                { id: 'started',   name: 'Iniciados' },
                { id: 'paused',    name: 'Pausados' },
                { id: 'finished',  name: 'Encerrados' },
                { id: 'cancelled', name: 'Cancelados' },
              ]}
              placeholder="Todos os status"
            />
            {(filterCustomer || filterContractType || filterApprover || filterExecutive || statusFilter || search) && (
              <button
                onClick={() => { setFilterCustomer(''); setFilterContractType(''); setFilterApprover(''); setFilterExecutive(''); setStatusFilter(''); setSearch(''); setPage(1) }}
                className="px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
                style={{ color: 'var(--brand-danger)', border: '1px solid var(--brand-border)' }}
              >Limpar</button>
            )}
          </div>
          {/* Linha 2: Multi-contratual + pills de tipo de contrato */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Botão Multi-contratual em destaque */}
            <button
              onClick={() => { setMultiContratual(v => { if (!v) setFilterContractType(''); return !v }); setPage(1) }}
              className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={multiContratual
                ? { background: 'var(--brand-primary)', color: '#0A0A0B', boxShadow: '0 0 12px rgba(0,245,255,0.35)' }
                : { background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.25)' }
              }
            >
              ⬡ Multi-contratual
            </button>

          {/* pills de tipo de contrato — desabilitado quando Multi-contratual ativo */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl w-fit transition-opacity"
            style={{
              background: 'var(--brand-bg)',
              border: '1px solid var(--brand-border)',
              opacity: multiContratual ? 0.35 : 1,
              pointerEvents: multiContratual ? 'none' : 'auto',
            }}
          >
            <button
              onClick={() => { setFilterContractType(''); setPage(1) }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={!filterContractType
                ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                : { color: 'var(--brand-muted)' }}
            >
              Todos
            </button>
            {filterContractTypes.map(ct => (
              <button
                key={ct.id}
                onClick={() => { setFilterContractType(String(ct.id)); setPage(1) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={filterContractType === String(ct.id)
                  ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                  : { color: 'var(--brand-muted)' }}
              >
                {ct.name}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ background: 'var(--brand-surface)', minWidth: '900px', width: '100%' }}>
              <thead style={{ borderBottom: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)', width: '110px' }}>Código</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)', minWidth: '200px' }}>Projeto</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)', width: '140px' }}>Cliente</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)', width: '150px' }}>Tipo de Contrato</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)', width: '110px' }}>Hs Vendidas</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)', width: '120px' }}>Hs Consumidas</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)', width: '160px' }}>Saldo</th>
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
                {!loading && rows.length === 0 && (
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
                {!loading && rows.map(p => {
                  const isDisabled = p._node_state === 'DISABLED'
                  const isOnDemand = p.contract_type_display?.toLowerCase().includes('on demand')
                  const consumedPct = isOnDemand ? 0 : calcConsumedPct(p)
                  const barPct = consumedPct != null ? Math.min(100, Math.max(0, consumedPct)) : null
                  const balance = p.general_hours_balance
                  // balanceColor não mais usado inline — delegado ao SaldoCell
                  const consumed = p.consumed_hours != null ? p.consumed_hours
                    : p.total_logged_minutes != null ? Math.round(p.total_logged_minutes / 60 * 10) / 10 : null
                  const sold = p.sold_hours ?? 0
                  const contrib = p.total_contributions_hours ?? p.hour_contribution ?? 0
                  const s = p.status ?? ''
                  const statusVariant = s === 'active' || s === 'started' ? 'started'
                    : s === 'paused' ? 'paused'
                    : s === 'cancelled' ? 'cancelled'
                    : s === 'finished' ? 'finished' : 'default'

                  return (
                    <tr
                      key={`${p.id}-${p._level}-${p._parentId}`}
                      className="transition-colors"
                      style={{
                        borderBottom: '1px solid var(--brand-border)',
                        opacity: isDisabled ? 0.4 : 1,
                        background: p._level > 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      }}
                      onMouseEnter={e => !isDisabled && (e.currentTarget.style.background = 'rgba(0,245,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = p._level > 0 ? 'rgba(255,255,255,0.015)' : 'transparent')}
                    >
                      {/* Código */}
                      <td className="px-4 py-3" style={{ paddingLeft: p._level > 0 ? `${16 + p._level * 24}px` : undefined }}>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>
                          {p.code}
                        </span>
                      </td>

                      {/* Nome com controle de árvore */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-1.5">
                          {/* Botão expand/collapse — só no modo Multi-contratual */}
                          {multiContratual && p._hasChildren && (
                            <button
                              onClick={() => toggleExpand(p)}
                              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-colors hover:bg-white/10"
                              style={{ background: 'var(--brand-border)', color: 'var(--brand-primary)' }}
                            >
                              {p._isExpanded ? '−' : '+'}
                            </button>
                          )}
                          {/* Espaçador para pais sem filhos */}
                          {multiContratual && !p._hasChildren && p._level === 0 && <span className="w-5 shrink-0" />}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            {/* Badge PAI/FILHO */}
                            {p._level === 0 && p._hasChildren && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded w-fit" style={{ background: 'rgba(0,245,255,0.12)', color: 'var(--brand-primary)' }}>PAI</span>
                            )}
                            {p._level > 0 && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded w-fit" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>FILHO</span>
                            )}
                            <span className="font-medium text-sm leading-snug" style={{ color: 'var(--brand-text)', whiteSpace: 'normal', wordBreak: 'break-word' }}>{cleanName(p.name)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>
                        {p.customer?.name ?? '—'}
                      </td>

                      {/* Tipo de contrato */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>
                        {p.contract_type_display ?? '—'}
                      </td>

                      {/* Hs Vendidas */}
                      <td className="px-4 py-3 text-xs text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>
                        {isOnDemand ? '—'
                          : sold > 0 ? (contrib > 0 ? `${sold}h (+${contrib})` : `${sold}h`)
                          : '—'}
                      </td>

                      {/* Hs Consumidas */}
                      <td className="px-4 py-3 text-xs text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>
                        {consumed != null ? `${consumed}h` : '—'}
                      </td>

                      {/* Saldo */}
                      <td className="px-4 py-3" style={{ minWidth: '150px' }}>
                        <SaldoCell
                          balance={balance}
                          consumedPct={consumedPct}
                          barPct={barPct}
                          consumed={consumed}
                          isOnDemand={!!isOnDemand}
                        />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: statusVariant === 'started' ? 'rgba(0,245,255,0.10)'
                              : statusVariant === 'paused' ? 'rgba(245,158,11,0.12)'
                              : statusVariant === 'cancelled' ? 'rgba(239,68,68,0.12)'
                              : statusVariant === 'finished' ? 'rgba(161,161,170,0.12)'
                              : 'rgba(161,161,170,0.12)',
                            color: statusVariant === 'started' ? '#00F5FF'
                              : statusVariant === 'paused' ? '#F59E0B'
                              : statusVariant === 'cancelled' ? '#EF4444'
                              : statusVariant === 'finished' ? '#71717A'
                              : '#A1A1AA',
                          }}
                        >
                          {p.status_display ?? p.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openView(p)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                            style={{ color: 'var(--brand-primary)' }}
                            title="Visualizar"
                          >
                            <Eye size={13} />
                          </button>
                          {!isDisabled && (
                            <>
                              <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--brand-subtle)' }} title="Editar">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => remove(p.id)} disabled={deleting === p.id} className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50" style={{ color: 'var(--brand-danger)' }} title="Excluir">
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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

        {/* Modal de Visualização */}
        {viewProject && (
          <ModalOverlay onClose={() => setViewProject(null)}>
            <div className="flex flex-col max-h-[88vh]">
              {/* Header fixo */}
              <div className="px-6 pt-6 pb-0 pr-12 shrink-0">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.08)' }}>
                    <FolderOpen size={16} color="var(--brand-primary)" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--brand-border)', color: 'var(--brand-subtle)' }}>{viewProject.code}</span>
                      {viewProject.status_display && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                          background: viewProject.status === 'started' ? 'rgba(0,245,255,0.10)' : viewProject.status === 'paused' ? 'rgba(245,158,11,0.12)' : viewProject.status === 'cancelled' ? 'rgba(239,68,68,0.12)' : 'rgba(161,161,170,0.12)',
                          color: viewProject.status === 'started' ? '#00F5FF' : viewProject.status === 'paused' ? '#F59E0B' : viewProject.status === 'cancelled' ? '#EF4444' : '#71717A',
                        }}>{viewProject.status_display}</span>
                      )}
                    </div>
                    <h2 className="text-base font-bold mt-1" style={{ color: 'var(--brand-text)' }}>{cleanName(viewProject.name)}</h2>
                    {viewProject.customer?.name && <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>{viewProject.customer.name}</p>}
                  </div>
                </div>

                {/* Abas */}
                <div className="flex gap-1 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  {([
                    { id: 'overview', label: 'Visão Geral', icon: Eye },
                    { id: 'contributions', label: 'Aportes', icon: HandCoins },
                    { id: 'history', label: 'Histórico', icon: History },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => handleViewTab(id)}
                      className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px"
                      style={{
                        borderColor: viewTab === id ? 'var(--brand-primary)' : 'transparent',
                        color: viewTab === id ? 'var(--brand-primary)' : 'var(--brand-subtle)',
                      }}
                    >
                      <Icon size={12} />{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conteúdo scrollável */}
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* ── ABA: VISÃO GERAL ── */}
                {viewTab === 'overview' && (
                  <div>
                    {viewLoading && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Carregando detalhes...</p>}

                    {/* Card saldo/horas */}
                    {(() => {
                      const isOD = viewProject.contract_type_display?.toLowerCase().includes('on demand')
                      const sold = viewProject.sold_hours ?? 0
                      const contrib = (viewProject as any).total_contributions_hours ?? viewProject.hour_contribution ?? 0
                      const consumed = viewProject.consumed_hours != null
                        ? viewProject.consumed_hours
                        : viewProject.total_logged_minutes != null
                          ? Math.round(viewProject.total_logged_minutes / 60 * 10) / 10
                          : null
                      const balance = viewProject.general_hours_balance
                      const pct = isOD ? 0 : (consumed != null && sold + contrib > 0 ? Math.round(consumed / (sold + contrib) * 100) : null)
                      const barVal = pct != null ? Math.min(100, Math.max(0, pct)) : 0
                      const barColor = barVal >= 90 ? '#ef4444' : barVal >= 70 ? '#f59e0b' : '#2563EB'
                      const balColor = balance != null && balance < 0 ? '#ef4444' : barVal >= 90 ? '#ef4444' : barVal >= 70 ? '#f59e0b' : '#2563EB'
                      return (
                        <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                          <div className="grid grid-cols-3 gap-4 mb-3">
                            <div><p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Hs Vendidas</p><p className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>{isOD ? '—' : sold > 0 ? `${sold}h${contrib > 0 ? ` (+${contrib})` : ''}` : '—'}</p></div>
                            <div><p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Hs Consumidas</p><p className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>{consumed != null ? `${consumed}h` : '—'}</p></div>
                            <div><p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Saldo</p><p className="text-sm font-bold tabular-nums" style={{ color: balColor }}>{isOD ? '—' : balance != null ? `${balance}h` : '—'}</p></div>
                          </div>
                          {!isOD && pct != null && (<><div className="w-full rounded-full h-1.5 mb-1.5" style={{ background: 'var(--brand-border)' }}><div className="h-1.5 rounded-full transition-all" style={{ width: `${barVal}%`, background: barColor }} /></div><p className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>{pct}% utilizado{balance != null && balance < 0 ? ' · ⚠ Excedido' : ''}</p></>)}
                        </div>
                      )
                    })()}

                    {/* Detalhes */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-5">
                      {([
                        { icon: Tag, label: 'Tipo de Contrato', value: viewProject.contract_type_display },
                        { icon: Tag, label: 'Tipo de Serviço', value: (viewProject as any).service_type?.name },
                        { icon: FolderOpen, label: 'Projeto Pai', value: (viewProject as any).parentProject?.name ? cleanName((viewProject as any).parentProject.name) : null },
                        { icon: Clock, label: 'Data de Início', value: (viewProject as any).start_date },
                        { icon: TrendingUp, label: 'Valor do Projeto', value: (viewProject as any).project_value != null ? `R$ ${Number((viewProject as any).project_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null },
                        { icon: Clock, label: 'Taxa/Hora', value: (viewProject as any).hourly_rate != null ? `R$ ${Number((viewProject as any).hourly_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null },
                      ] as const).filter(f => f.value).map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-2">
                          <Icon size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-subtle)' }} />
                          <div><p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p><p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p></div>
                        </div>
                      ))}
                    </div>

                    {/* Equipe */}
                    {((viewProject as any).consultants?.length > 0 || (viewProject as any).coordinators?.length > 0) && (
                      <div className="mb-5 grid grid-cols-2 gap-4">
                        {(viewProject as any).consultants?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Consultores</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(viewProject as any).consultants.map((c: any) => (
                                <span key={c.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.15)' }}>{c.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(viewProject as any).coordinators?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Coordenadores</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(viewProject as any).coordinators.map((c: any) => (
                                <span key={c.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.10)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.2)' }}>{c.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Filhos */}
                    {viewProject.child_projects && viewProject.child_projects.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Projetos Filhos</p>
                        <div className="space-y-1">
                          {viewProject.child_projects.map(c => (
                            <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                              <div><span className="font-mono text-[10px] mr-2" style={{ color: 'var(--brand-subtle)' }}>{c.code}</span><span className="text-xs" style={{ color: 'var(--brand-text)' }}>{cleanName(c.name)}</span></div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.status === 'started' ? 'rgba(0,245,255,0.08)' : 'rgba(161,161,170,0.08)', color: c.status === 'started' ? '#00F5FF' : '#71717A' }}>{c.status_display ?? c.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ABA: APORTES ── */}
                {viewTab === 'contributions' && (
                  <div>
                    {/* Resumo financeiro */}
                    {contributions.length > 0 && (() => {
                      const vp = viewProject as any
                      const baseHs = vp.sold_hours ?? 0
                      const baseRate = vp.hourly_rate ?? 0
                      const baseVal = baseHs * baseRate
                      const contribHs = contributions.reduce((s, c) => s + c.contributed_hours, 0)
                      const contribVal = contributions.reduce((s, c) => s + c.contributed_hours * c.hourly_rate, 0)
                      const totalHs = baseHs + contribHs
                      const totalVal = baseVal + contribVal
                      const avg = totalHs > 0 ? totalVal / totalHs : 0
                      return (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {[
                            { label: 'Hs Base', value: `${baseHs}h`, sub: baseRate > 0 ? `R$ ${baseRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h` : '' },
                            { label: 'Hs Aportes', value: `${contribHs}h`, sub: `R$ ${contribVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                            { label: 'Total', value: `${totalHs}h`, sub: `R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · média R$ ${avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h` },
                          ].map(({ label, value, sub }) => (
                            <div key={label} className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                              <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{value}</p>
                              {sub && <p className="text-[10px] tabular-nums mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{sub}</p>}
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Botão adicionar */}
                    <div className="flex justify-end mb-3">
                      <button
                        onClick={() => {
                          const lastRate = contributions.length > 0 ? contributions[0].hourly_rate : (viewProject as any).hourly_rate ?? 0
                          setContribForm({ contributed_hours: '', hourly_rate: String(lastRate || ''), contributed_at: new Date().toISOString().split('T')[0], description: '' })
                          setContribModal({ open: true })
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
                      ><Plus size={12} />Novo Aporte</button>
                    </div>

                    {contribLoading && <p className="text-xs text-center py-6" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>}

                    {!contribLoading && contributions.length === 0 && (
                      <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhum aporte registrado.</p>
                    )}

                    {/* Lista */}
                    {!contribLoading && contributions.length > 0 && (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                        <table className="w-full text-xs">
                          <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--brand-border)' }}>
                            <tr>
                              {['Data', 'Horas', 'Valor/h', 'Total', 'Registrado por', 'Descrição', ''].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {contributions.map(c => (
                              <tr key={c.id} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{new Date(c.contributed_at).toLocaleDateString('pt-BR')}</td>
                                <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{c.contributed_hours}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>R$ {c.hourly_rate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: 'var(--brand-text)' }}>R$ {(c.contributed_hours * c.hourly_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-3 py-2.5" style={{ color: 'var(--brand-muted)' }}>{c.contributed_by_user?.name ?? '—'}</td>
                                <td className="px-3 py-2.5 max-w-[140px] truncate" style={{ color: 'var(--brand-muted)' }}>{c.description ?? '—'}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => { setContribForm({ contributed_hours: String(c.contributed_hours), hourly_rate: String(c.hourly_rate), contributed_at: c.contributed_at.split('T')[0], description: c.description ?? '' }); setContribModal({ open: true, item: c }) }} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--brand-subtle)' }}><Pencil size={11} /></button>
                                    <button onClick={() => deleteContrib(c)} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--brand-danger)' }}><Trash2 size={11} /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ABA: HISTÓRICO ── */}
                {viewTab === 'history' && (
                  <div>
                    {/* Filtro por campo */}
                    <div className="mb-3">
                      <select
                        value={historyFieldFilter}
                        onChange={e => { setHistoryFieldFilter(e.target.value); loadHistory(viewProject.id, e.target.value) }}
                        className="px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                      >
                        <option value="all">Todos os campos</option>
                        <option value="project_value">Valor do Projeto</option>
                        <option value="hourly_rate">Valor/Hora</option>
                        <option value="sold_hours">Horas Vendidas</option>
                        <option value="hour_contribution">Aporte de Horas</option>
                        <option value="consultant_hours">Horas por Consultor</option>
                        <option value="coordinator_hours">% Horas Coordenador</option>
                        <option value="additional_hourly_rate">Valor/Hora Adicional</option>
                        <option value="max_expense_per_consultant">Despesa Máx/Consultor</option>
                      </select>
                    </div>

                    {historyLoading && <p className="text-xs text-center py-6" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>}
                    {!historyLoading && history.length === 0 && <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhuma alteração encontrada.</p>}

                    {!historyLoading && history.length > 0 && (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs" style={{ minWidth: '700px' }}>
                            <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--brand-border)' }}>
                              <tr>
                                {['Data', 'Alterado por', 'Campo', 'Valor Anterior', 'Novo Valor', 'Vigência', 'Motivo', ''].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {history.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{log.changed_by_user?.name ?? '—'}</td>
                                  <td className="px-3 py-2.5 whitespace-nowrap"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>{log.field_label}</span></td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{log.old_value_formatted ?? String(log.old_value ?? '—')}</td>
                                  <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: 'var(--brand-text)' }}>{log.new_value_formatted ?? String(log.new_value ?? '—')}</td>
                                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{log.effective_from ? new Date(log.effective_from + '-01').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : '—'}</td>
                                  <td className="px-3 py-2.5 max-w-[120px] truncate" style={{ color: 'var(--brand-muted)' }} title={log.reason ?? ''}>{log.reason ?? '—'}</td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => { setEditingLog(log); setEditLogReason(log.reason ?? '') }} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--brand-subtle)' }}><Pencil size={11} /></button>
                                      <button onClick={() => deleteLog(log)} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--brand-danger)' }}><Trash2 size={11} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--brand-border)' }}>
                <button onClick={() => { setViewProject(null); openEdit(viewProject) }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }}>
                  <Pencil size={13} />Editar
                </button>
                <button onClick={() => setViewProject(null)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* Modal de Aporte */}
        {contribModal.open && viewProject && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
            <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <div className="p-5">
                <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--brand-text)' }}>{contribModal.item ? 'Editar Aporte' : 'Novo Aporte'}</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Horas *</label>
                      <input type="number" min="1" max="999999" value={contribForm.contributed_hours} onChange={e => setContribForm(f => ({ ...f, contributed_hours: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor/Hora (R$) *</label>
                      <input type="number" min="0.01" step="0.01" value={contribForm.hourly_rate} onChange={e => setContribForm(f => ({ ...f, hourly_rate: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} placeholder="0,00" />
                    </div>
                  </div>
                  {contribForm.contributed_hours && contribForm.hourly_rate && (
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                      Total: R$ {(Number(contribForm.contributed_hours) * Number(contribForm.hourly_rate)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Data *</label>
                    <input type="date" value={contribForm.contributed_at} onChange={e => setContribForm(f => ({ ...f, contributed_at: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Descrição</label>
                    <textarea rows={2} value={contribForm.description} onChange={e => setContribForm(f => ({ ...f, description: e.target.value }))} maxLength={1000} className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} placeholder="Opcional..." />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setContribModal({ open: false })} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
                  <button onClick={saveContrib} disabled={contribSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                    <Save size={13} />{contribSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal editar motivo do histórico */}
        {editingLog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
            <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <div className="p-5">
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--brand-text)' }}>Editar Registro</h3>
                <p className="text-xs mb-4" style={{ color: 'var(--brand-muted)' }}><span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{editingLog.field_label}</span> · {editingLog.old_value_formatted ?? String(editingLog.old_value)} → {editingLog.new_value_formatted ?? String(editingLog.new_value)}</p>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Motivo</label>
                  <textarea rows={3} value={editLogReason} onChange={e => setEditLogReason(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} placeholder="Descreva o motivo da alteração..." />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setEditingLog(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
                  <button onClick={saveLogEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                    <Save size={13} />Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
