'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, X, Trash2, FileText, Download, Rocket, Eye, Pencil, CheckCircle, ChevronLeft, ChevronRight, ExternalLink, LayoutGrid } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractContact {
  id?: number
  name: string
  cargo: string
  email: string
  phone: string
}

interface CustomerContact {
  id: number
  customer_id: number
  name: string
  cargo: string
  email: string
  phone: string
}

interface ContractAttachment {
  id: number
  type: 'proposta' | 'contrato' | 'logo'
  original_name: string
  size: number | null
  created_at: string
}

interface Contract {
  id: number
  customer_id: number
  customer?: { id: number; name: string }
  status: 'rascunho' | 'aprovado' | 'inicio_autorizado' | 'ativo'
  categoria: 'projeto' | 'sustentacao'
  service_type_id: number | null
  service_type?: { id: number; name: string }
  contract_type_id: number | null
  contract_type?: { id: number; name: string }
  cobra_despesa_cliente: boolean
  architect_id: number | null
  architect?: { id: number; name: string }
  tipo_alocacao: 'remoto' | 'presencial' | 'ambos' | null
  horas_contratadas: number
  valor_projeto: number | null
  valor_hora: number | null
  hora_adicional: number | null
  pct_horas_coordenador: number | null
  horas_consultor: number | null
  expectativa_inicio: string | null
  condicao_pagamento: string | null
  limite_despesa: number | null
  executivo_conta_id: number | null
  executivo_conta?: { id: number; name: string }
  vendedor_id: number | null
  vendedor?: { id: number; name: string }
  observacoes: string | null
  project_id: number | null
  project?: { id: number; code: string; name: string }
  generated_at: string | null
  contacts: ContractContact[]
  attachments: ContractAttachment[]
  created_at: string
}

interface SelectOption { id: number; name: string; code_prefix?: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aprovado: 'Aprovado',
  inicio_autorizado: 'Início Autorizado',
  ativo: 'Ativo',
}

const STATUS_COLOR: Record<string, string> = {
  rascunho: '#71717a',
  aprovado: '#3b82f6',
  inicio_autorizado: '#eab308',
  ativo: '#22c55e',
}

const CATEGORIA_LABEL: Record<string, string> = {
  projeto: 'Projeto',
  sustentacao: 'Sustentação',
}

const CURRENT_YEAR_2D = new Date().getFullYear().toString().slice(-2)

const ATTACHMENT_TYPE_LABEL: Record<string, string> = {
  proposta: 'Proposta',
  contrato: 'Contrato',
  logo: 'Logo',
}

type FormState = {
  customer_id: string
  project_name: string
  parent_project_id: string
  code_seq: string
  code_year: string
  categoria: 'projeto' | 'sustentacao'
  service_type_id: string
  contract_type_id: string
  cobra_despesa_cliente: boolean
  limite_despesa: string
  architect_id: string
  tipo_alocacao: 'remoto' | 'presencial' | 'ambos'
  horas_contratadas: string
  valor_projeto: string
  valor_hora: string
  hora_adicional: string
  pct_horas_coordenador: string
  horas_consultor: string
  expectativa_inicio: string
  condicao_pagamento: string
  executivo_conta_id: string
  vendedor_id: string
  observacoes: string
}

const EMPTY_FORM: FormState = {
  customer_id: '',
  project_name: '',
  parent_project_id: '',
  code_seq: '',
  code_year: CURRENT_YEAR_2D,
  categoria: 'projeto',
  service_type_id: '',
  contract_type_id: '',
  cobra_despesa_cliente: false,
  limite_despesa: '',
  architect_id: '',
  tipo_alocacao: 'remoto',
  horas_contratadas: '',
  valor_projeto: '',
  valor_hora: '',
  hora_adicional: '',
  pct_horas_coordenador: '',
  horas_consultor: '',
  expectativa_inicio: '',
  condicao_pagamento: '',
  executivo_conta_id: '',
  vendedor_id: '',
  observacoes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (user && user.type !== 'admin') router.replace('/dashboard')
  }, [user, router])

  // List state
  const [contracts, setContracts] = useState<Contract[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [search, setSearch]       = useState('')

  // Master data
  const [customers, setCustomers]         = useState<SelectOption[]>([])
  const [users, setUsers]                 = useState<SelectOption[]>([])
  const [executives, setExecutives]       = useState<SelectOption[]>([])
  const [serviceTypes, setServiceTypes]   = useState<SelectOption[]>([])
  const [contractTypes, setContractTypes] = useState<SelectOption[]>([])

  const isSustAdmin = user?.type === 'admin' || (user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [viewContract, setViewContract] = useState<Contract | null>(null)
  const [sustQueue, setSustQueue]   = useState('')
  const [sustMoving, setSustMoving] = useState(false)
  const [editContract, setEditContract] = useState<Contract | null>(null)
  const [form, setForm]           = useState<FormState>({ ...EMPTY_FORM })
  const [contacts, setContacts]   = useState<ContractContact[]>([])
  const [saving, setSaving]       = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  // Contatos do cadastro do cliente selecionado
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([])

  // Projetos pai disponíveis para o cliente selecionado
  const [parentProjects, setParentProjects] = useState<SelectOption[]>([])

  // Attachments in modal
  const [pendingFiles, setPendingFiles] = useState<{ file: File; type: 'proposta' | 'contrato' | 'logo' }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedAttachType, setSelectedAttachType] = useState<'proposta' | 'contrato' | 'logo'>('proposta')

  // Code validation
  const [codeExists, setCodeExists] = useState(false)
  const [codeChecking, setCodeChecking] = useState(false)

  // Generate project modal
  const [genModal, setGenModal] = useState<{ contract: Contract } | null>(null)
  const [genCoordinatorIds, setGenCoordinatorIds] = useState<number[]>([])
  const [generating, setGenerating] = useState(false)
  const [coordinators, setCoordinators] = useState<SelectOption[]>([])

  // Derived: selected contract type for conditional fields
  const selectedContractType = useMemo(
    () => contractTypes.find(t => String(t.id) === String(form.contract_type_id)),
    [contractTypes, form.contract_type_id]
  )
  const isOnDemand  = selectedContractType?.name.toLowerCase().trim() === 'on demand'
  const isBankHours = selectedContractType?.name.toLowerCase().includes('banco de horas') ?? false
  const isFechado   = !!selectedContractType && !isOnDemand && !isBankHours

  // saveErpserv (read-only calc for Fechado)
  const saveErpserv = useMemo(() => {
    if (!isFechado) return null
    const sold    = Number(form.horas_contratadas) || 0
    const consult = Number(form.horas_consultor) || 0
    const coord   = Number(form.pct_horas_coordenador) || 0
    return sold - consult - Math.round((coord / 100) * consult)
  }, [isFechado, form.horas_contratadas, form.horas_consultor, form.pct_horas_coordenador])

  // Derived: project code preview
  const selectedCustomerObj = useMemo(
    () => customers.find(c => String(c.id) === String(form.customer_id)),
    [customers, form.customer_id]
  )
  const codePrefix = selectedCustomerObj?.code_prefix?.toUpperCase() ?? ''
  const codePreview = useMemo(() => {
    if (!codePrefix || !form.code_seq.trim()) return ''
    return `${codePrefix}${form.code_seq.padStart(3, '0')}-${form.code_year}`
  }, [codePrefix, form.code_seq, form.code_year])

  const checkCodeExists = useCallback(async () => {
    if (!codePreview) { setCodeExists(false); return }
    setCodeChecking(true)
    try {
      const r = await api.get<any>(`/projects?code=${encodeURIComponent(codePreview)}`)
      setCodeExists((r?.total ?? 0) > 0)
    } catch { setCodeExists(false) }
    finally { setCodeChecking(false) }
  }, [codePreview])

  // Load master data
  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r => setCustomers(r?.items ?? r ?? [])).catch(() => {})
    api.get<any>('/users?pageSize=500').then(r => setUsers(r?.items ?? r ?? [])).catch(() => {})
    api.get<any>('/executives?pageSize=100').then(r => setExecutives(r?.items ?? [])).catch(() => {})
    api.get<any>('/users?type=coordenador&pageSize=500').then(r => setCoordinators((r?.items ?? r ?? []).map((u: any) => ({ id: u.id, name: u.name })))).catch(() => {})
    api.get<any>('/service-types?pageSize=100').then(r => setServiceTypes(r?.items ?? r?.data ?? r ?? [])).catch(() => {})
    api.get<any>('/contract-types?pageSize=100').then(r => setContractTypes(r?.items ?? r?.data ?? r ?? [])).catch(() => {})
  }, [])

  // Carrega contatos e projetos pai do cliente selecionado
  useEffect(() => {
    if (!form.customer_id) { setCustomerContacts([]); setParentProjects([]); return }
    api.get<CustomerContact[]>(`/customer-contacts?customer_id=${form.customer_id}`)
      .then(r => setCustomerContacts(Array.isArray(r) ? r : []))
      .catch(() => setCustomerContacts([]))
    api.get<any>(`/projects?customer_id=${form.customer_id}&parent_projects_only=true&pageSize=100`)
      .then(r => setParentProjects((r?.items ?? []).map((p: any) => ({ id: p.id, name: `${p.code} — ${p.name}` }))))
      .catch(() => setParentProjects([]))
  }, [form.customer_id])

  const loadContracts = useCallback(async () => {
    setLoading(true)
    try {
      const qp = new URLSearchParams({ page: String(page), per_page: '20' })
      if (filterStatus) qp.set('status', filterStatus)
      if (filterCustomer) qp.set('customer_id', filterCustomer)
      if (search) qp.set('search', search)
      const r = await api.get<any>(`/contracts?${qp}`)
      setContracts(r?.data ?? [])
      setTotal(r?.total ?? 0)
    } catch { toast.error('Erro ao carregar contratos') }
    finally { setLoading(false) }
  }, [page, filterStatus, filterCustomer, search])

  useEffect(() => { loadContracts() }, [loadContracts])

  // Auto-open edit when ?editId=X is present in URL (e.g. from Kanban)
  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get('editId')
    if (!editId) return
    api.get<Contract>(`/contracts/${editId}`).then(full => {
      openEdit(full)
      window.history.replaceState({}, '', '/contratos')
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Open modal helpers ───────────────────────────────────────────────────

  const openNew = () => {
    setEditContract(null)
    setForm({ ...EMPTY_FORM })
    setContacts([])
    setPendingFiles([])
    setActiveTab(0)
    setModalOpen(true)
  }

  const openEdit = async (c: Contract) => {
    const full = await api.get<Contract>(`/contracts/${c.id}`)
    setEditContract(full)
    setForm({
      customer_id:          String(full.customer_id),
      project_name:         (full as any).project_name ?? '',
      parent_project_id:    (full as any).parent_project_id ? String((full as any).parent_project_id) : '',
      code_seq:             '',
      code_year:            CURRENT_YEAR_2D,
      categoria:            full.categoria,
      service_type_id:      full.service_type_id ? String(full.service_type_id) : '',
      contract_type_id:     full.contract_type_id ? String(full.contract_type_id) : '',
      cobra_despesa_cliente: full.cobra_despesa_cliente,
      limite_despesa:       full.limite_despesa != null ? String(full.limite_despesa) : '',
      architect_id:         full.architect_id ? String(full.architect_id) : '',
      tipo_alocacao:        full.tipo_alocacao ?? 'remoto',
      horas_contratadas:    String(full.horas_contratadas),
      valor_projeto:        full.valor_projeto != null ? String(full.valor_projeto) : '',
      valor_hora:           full.valor_hora != null ? String(full.valor_hora) : '',
      hora_adicional:       full.hora_adicional != null ? String(full.hora_adicional) : '',
      pct_horas_coordenador: full.pct_horas_coordenador != null ? String(full.pct_horas_coordenador) : '',
      horas_consultor:      full.horas_consultor != null ? String(full.horas_consultor) : '',
      expectativa_inicio:   full.expectativa_inicio ?? '',
      condicao_pagamento:   full.condicao_pagamento ?? '',
      executivo_conta_id:   full.executivo_conta_id ? String(full.executivo_conta_id) : '',
      vendedor_id:          full.vendedor_id ? String(full.vendedor_id) : '',
      observacoes:          full.observacoes ?? '',
    })
    setContacts(full.contacts ?? [])
    setPendingFiles([])
    setActiveTab(0)
    setModalOpen(true)
  }

  const openView = async (c: Contract) => {
    const full = await api.get<Contract>(`/contracts/${c.id}`)
    setSustQueue((full as any).sustentacao_column ?? '')
    setViewContract(full)
  }

  const handleSustMove = async () => {
    if (!viewContract || !sustQueue) return
    setSustMoving(true)
    try {
      await api.patch(`/contracts/${viewContract.id}/sustentacao-move`, { to_column: sustQueue })
      toast.success('Contrato movido para a fila de sustentação')
      loadContracts()
      setViewContract(null)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao mover para fila')
    } finally { setSustMoving(false) }
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!form.customer_id)                           { toast.error('Selecione o cliente'); setActiveTab(0); return }
    if (!isOnDemand && !form.horas_contratadas)      { toast.error('Informe as horas contratadas'); setActiveTab(4); return }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        customer_id:          Number(form.customer_id),
        project_name:         (form as any).project_name || null,
        parent_project_id:    (form as any).parent_project_id ? Number((form as any).parent_project_id) : null,
        project_code_preview: codePreview || null,
        categoria:            form.categoria,
        service_type_id:      form.service_type_id ? Number(form.service_type_id) : null,
        contract_type_id:     form.contract_type_id ? Number(form.contract_type_id) : null,
        cobra_despesa_cliente: form.cobra_despesa_cliente,
        limite_despesa:       form.limite_despesa ? Number(form.limite_despesa) : null,
        architect_id:         form.architect_id ? Number(form.architect_id) : null,
        tipo_alocacao:        form.tipo_alocacao,
        horas_contratadas:    isOnDemand ? 0 : Number(form.horas_contratadas),
        valor_projeto:        form.valor_projeto ? Number(form.valor_projeto) : null,
        valor_hora:           form.valor_hora ? Number(form.valor_hora) : null,
        hora_adicional:       form.hora_adicional ? Number(form.hora_adicional) : null,
        pct_horas_coordenador: form.pct_horas_coordenador ? Number(form.pct_horas_coordenador) : null,
        horas_consultor:      form.horas_consultor ? Number(form.horas_consultor) : null,
        expectativa_inicio:   form.expectativa_inicio || null,
        condicao_pagamento:   form.condicao_pagamento || null,
        executivo_conta_id:   form.executivo_conta_id ? Number(form.executivo_conta_id) : null,
        vendedor_id:          form.vendedor_id ? Number(form.vendedor_id) : null,
        observacoes:          form.observacoes || null,
        contacts,
      }

      let contract: Contract
      if (editContract) {
        contract = await api.put<Contract>(`/contracts/${editContract.id}`, payload)
        toast.success('Contrato atualizado')
      } else {
        contract = await api.post<Contract>('/contracts', payload)
        toast.success('Contrato criado')
      }

      if (pendingFiles.length > 0) {
        setUploading(true)
        for (const { file, type } of pendingFiles) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('type', type)
          await fetch(`/api/v1/contracts/${contract.id}/attachments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('minutor_token')}` },
            body: fd,
          })
        }
        setUploading(false)
      }

      setModalOpen(false)
      loadContracts()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar contrato')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // ─── Status update ────────────────────────────────────────────────────────

  const updateStatus = async (c: Contract, status: string) => {
    try {
      await api.patch(`/contracts/${c.id}/status`, { status })
      toast.success(`Status alterado para ${STATUS_LABEL[status]}`)
      loadContracts()
    } catch (e: any) { toast.error(e?.message ?? 'Erro') }
  }

  // ─── Generate project ─────────────────────────────────────────────────────

  const openGenModal = (c: Contract) => {
    // Pre-select architect if set
    const preIds: number[] = c.architect_id ? [c.architect_id] : []
    setGenCoordinatorIds(preIds)
    setGenModal({ contract: c })
  }

  const confirmGenerateProject = async () => {
    if (!genModal) return
    const c = genModal.contract
    setGenerating(true)
    try {
      if (c.status !== 'inicio_autorizado' && c.status !== 'aprovado') {
        await api.patch(`/contracts/${c.id}/status`, { status: 'inicio_autorizado' })
      }
      const r = await api.post<{ project_id: number; project_code: string }>(`/contracts/${c.id}/generate-project`, {
        coordinator_ids: genCoordinatorIds,
      })
      toast.success(`Projeto ${r.project_code} gerado com sucesso!`)
      setGenModal(null)
      loadContracts()
      router.push(`/projects?highlight=${r.project_id}`)
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao gerar projeto') }
    finally { setGenerating(false) }
  }

  // ─── Attachment helpers ───────────────────────────────────────────────────

  const downloadAttachment = async (contractId: number, att: ContractAttachment) => {
    const token = localStorage.getItem('minutor_token')
    const res = await fetch(`/api/v1/contracts/${contractId}/attachments/${att.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = att.original_name; a.click()
    URL.revokeObjectURL(url)
  }

  const deleteAttachment = async (contractId: number, attId: number) => {
    if (!confirm('Remover este arquivo?')) return
    try {
      await api.delete(`/contracts/${contractId}/attachments/${attId}`)
      if (editContract) {
        const full = await api.get<Contract>(`/contracts/${contractId}`)
        setEditContract(full)
      }
    } catch { toast.error('Erro ao remover arquivo') }
  }

  // ─── Contacts helpers ─────────────────────────────────────────────────────

  const addContact = () => setContacts(c => [...c, { name: '', cargo: '', email: '', phone: '' }])
  const updateContact = (i: number, field: keyof ContractContact, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))

  // ─── Render ───────────────────────────────────────────────────────────────

  const TABS = ['Cliente', 'Classificação', 'Faturamento', 'Despesas', 'Operacional', 'Contatos', 'Financeiro', 'Comercial', 'Observações', 'Anexos']
  const totalPages = Math.ceil(total / 20)

  const inputCls  = 'w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none focus:ring-1 focus:ring-cyan-500/40'
  const inputStyle = { border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }
  const labelCls  = 'block text-xs text-zinc-400 mb-1'

  return (
    <AppLayout title="Contratos">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Contratos</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{total} contrato{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/contratos/kanban')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
            <LayoutGrid size={14} /> Kanban
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.3)', color: '#00F5FF' }}>
            <Plus size={15} /> Novo Contrato
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text" placeholder="Buscar cliente..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className={inputCls} style={{ ...inputStyle, width: 220 }}
        />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className={inputCls} style={{ ...inputStyle, width: 180 }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterCustomer} onChange={e => { setFilterCustomer(e.target.value); setPage(1) }}
          className={inputCls} style={{ ...inputStyle, width: 200 }}>
          <option value="">Todos os clientes</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Cliente</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo de Contrato</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Horas</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Expectativa</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Projeto</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-500 text-xs">Carregando...</td></tr>
            )}
            {!loading && contracts.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhum contrato encontrado.</td></tr>
            )}
            {!loading && contracts.map((c, i) => (
              <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--brand-border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td className="px-4 py-3 text-white font-medium">{c.customer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-300">{CATEGORIA_LABEL[c.categoria]}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{c.contract_type?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center text-zinc-300">{c.horas_contratadas}h</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{fmtDate(c.expectativa_inicio)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: `${STATUS_COLOR[c.status]}18`, color: STATUS_COLOR[c.status] }}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {c.project
                    ? <span className="text-cyan-400 font-mono">{c.project.code}</span>
                    : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => openView(c)} title="Visualizar"
                      className="p-1.5 rounded-md transition-colors hover:bg-zinc-700/60 text-zinc-400 hover:text-white">
                      <Eye size={14} />
                    </button>
                    {!c.project_id && (
                      <button onClick={() => openEdit(c)} title="Editar"
                        className="p-1.5 rounded-md transition-colors hover:bg-zinc-700/60 text-zinc-400 hover:text-white">
                        <Pencil size={14} />
                      </button>
                    )}
                    {c.status === 'rascunho' && (
                      <button onClick={() => updateStatus(c, 'aprovado')} title="Aprovar"
                        className="p-1.5 rounded-md transition-colors hover:bg-blue-900/40 text-zinc-400 hover:text-blue-400">
                        <CheckCircle size={14} />
                      </button>
                    )}
                    {(c.status === 'aprovado' || c.status === 'rascunho') && !c.project_id && (
                      <button onClick={() => openGenModal(c)} title="Gerar Projeto"
                        className="p-1.5 rounded-md transition-colors hover:bg-yellow-900/40 text-zinc-400 hover:text-yellow-400">
                        <Rocket size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-zinc-500">
          <span>{total} contratos</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="p-1 rounded disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span>{page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              className="p-1 rounded disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <h2 className="text-base font-semibold text-white">{editContract ? 'Editar Contrato' : 'Novo Contrato'}</h2>
                {(selectedContractType || form.service_type_id) && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                    {selectedContractType && <span style={{ color: '#00F5FF' }}>{selectedContractType.name}</span>}
                    {selectedContractType && form.service_type_id && <span className="text-zinc-600">·</span>}
                    {form.service_type_id && <span>{serviceTypes.find(s => String(s.id) === String(form.service_type_id))?.name}</span>}
                  </p>
                )}
              </div>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b overflow-x-auto shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              {TABS.map((t, i) => (
                <button key={t} onClick={() => setActiveTab(i)}
                  className="px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0"
                  style={{ color: activeTab === i ? '#00F5FF' : '#71717a', borderBottom: activeTab === i ? '2px solid #00F5FF' : '2px solid transparent' }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Tab 0: Cliente */}
              {activeTab === 0 && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelCls} style={{ marginBottom: 0 }}>Cliente *</label>
                      <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors">
                        <Plus size={10} /> Novo cliente <ExternalLink size={9} />
                      </a>
                    </div>
                    <SearchSelect
                      value={form.customer_id}
                      onChange={v => { setForm(f => ({ ...f, customer_id: v })); setCodeExists(false) }}
                      options={customers}
                      placeholder="Buscar cliente..."
                    />
                  </div>

                  {/* Código do Projeto */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Código do Projeto</p>
                    {codePrefix ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {/* Prefix read-only */}
                          <div className="px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center select-none"
                            style={{ ...inputStyle, opacity: 0.5, minWidth: '4.5rem' }}>
                            {codePrefix}
                          </div>
                          {/* Sequence */}
                          <input type="text" maxLength={3} placeholder="001"
                            value={form.code_seq}
                            onChange={e => { setForm(f => ({ ...f, code_seq: e.target.value.replace(/\D/g, '').slice(0, 3) })); setCodeExists(false) }}
                            onBlur={checkCodeExists}
                            className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                            style={{ ...inputStyle, width: '5rem' }} />
                          <span className="text-zinc-500 text-sm font-mono">-</span>
                          {/* Year */}
                          <input type="text" maxLength={2} placeholder="26"
                            value={form.code_year}
                            onChange={e => setForm(f => ({ ...f, code_year: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                            onBlur={checkCodeExists}
                            className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                            style={{ ...inputStyle, width: '4rem' }} />
                          {codePreview && (
                            <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                              {codePreview}
                            </span>
                          )}
                          {!form.code_seq && (
                            <span className="text-xs text-zinc-500 italic">deixe vazio para gerar automaticamente</span>
                          )}
                        </div>
                        {codeChecking && <p className="text-[11px] text-zinc-500">Verificando código...</p>}
                        {codeExists && !codeChecking && (
                          <p className="text-[11px] text-red-400">⚠ Código <span className="font-mono font-semibold">{codePreview}</span> já existe em outro projeto.</p>
                        )}
                      </div>
                    ) : form.customer_id ? (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={inputStyle}>
                        <span className="text-xs text-amber-400 italic flex-1">Cliente sem prefixo configurado</span>
                        <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:opacity-80 shrink-0"
                          style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                          Configurar prefixo
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">Selecione um cliente para ver o código</p>
                    )}
                  </div>

                  {/* Nome do Projeto */}
                  <div>
                    <label className={labelCls}>Nome do Projeto <span className="text-zinc-600 font-normal">(opcional)</span></label>
                    <input
                      type="text"
                      placeholder="Gerado automaticamente se não preenchido"
                      value={(form as any).project_name ?? ''}
                      onChange={e => setForm(f => ({ ...f, project_name: e.target.value } as any))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                      style={inputStyle}
                    />
                  </div>

                  {/* Projeto Pai */}
                  {form.customer_id && parentProjects.length > 0 && (
                    <div>
                      <label className={labelCls}>Projeto Pai <span className="text-zinc-600 font-normal">(opcional — para subprojetos)</span></label>
                      <SearchSelect
                        value={(form as any).parent_project_id ?? ''}
                        onChange={v => setForm(f => ({ ...f, parent_project_id: v } as any))}
                        options={parentProjects}
                        placeholder="Selecionar projeto pai..."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tab 1: Classificação */}
              {activeTab === 1 && (
                <div>
                  <label className={labelCls}>Tipo de Serviço</label>
                  <SearchSelect
                    value={form.service_type_id}
                    onChange={v => setForm(f => ({ ...f, service_type_id: v }))}
                    options={serviceTypes}
                    placeholder="Selecionar tipo de serviço..."
                  />
                </div>
              )}

              {/* Tab 2: Faturamento */}
              {activeTab === 2 && (
                <div>
                  <label className={labelCls}>Tipo de Contrato *</label>
                  <div className="space-y-2">
                    {contractTypes.map(ct => (
                      <label key={ct.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="contract_type_id" value={ct.id}
                          checked={String(form.contract_type_id) === String(ct.id)}
                          onChange={() => setForm(f => ({ ...f, contract_type_id: String(ct.id) }))} />
                        <span className="text-sm text-zinc-300">{ct.name}</span>
                      </label>
                    ))}
                    {contractTypes.length === 0 && (
                      <p className="text-xs text-zinc-500">Carregando tipos de contrato...</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Despesas */}
              {activeTab === 3 && (
                <div className="space-y-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.cobra_despesa_cliente}
                      onChange={e => setForm(f => ({ ...f, cobra_despesa_cliente: e.target.checked }))} />
                    <span className="text-sm text-zinc-300">Cobrar despesas do cliente</span>
                  </label>
                  {form.cobra_despesa_cliente && (
                    <div>
                      <label className={labelCls}>Limite de despesas (R$)</label>
                      <input type="number" min="0" step="0.01" placeholder="Ex: 5000.00"
                        value={form.limite_despesa}
                        onChange={e => setForm(f => ({ ...f, limite_despesa: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                      <p className="text-xs text-zinc-500 mt-1">Deixe em branco para sem limite.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Operacional */}
              {activeTab === 4 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Arquiteto</label>
                    <SearchSelect
                      value={form.architect_id}
                      onChange={v => setForm(f => ({ ...f, architect_id: v }))}
                      options={[{ id: '', name: 'Sem arquiteto' }, ...users]}
                      placeholder="Buscar arquiteto..."
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Tipo de Alocação</label>
                    <div className="flex gap-4">
                      {(['remoto', 'presencial', 'ambos'] as const).map(v => (
                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="tipo_alocacao" value={v} checked={form.tipo_alocacao === v}
                            onChange={() => setForm(f => ({ ...f, tipo_alocacao: v }))} />
                          <span className="text-sm text-zinc-300 capitalize">{v}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Horas e datas */}
                  <div className="grid grid-cols-2 gap-4">
                    {!isOnDemand && (
                      <div>
                        <label className={labelCls}>Horas Contratadas *</label>
                        <input type="number" min="0" value={form.horas_contratadas}
                          onChange={e => {
                            const h = Number(e.target.value)
                            setForm(f => {
                              const vp = Number(f.valor_projeto)
                              const vh = Number(f.valor_hora)
                              let newVh = f.valor_hora
                              let newVp = f.valor_projeto
                              if (h > 0 && vp > 0) newVh = String((vp / h).toFixed(2))
                              else if (h > 0 && vh > 0) newVp = String((vh * h).toFixed(2))
                              return { ...f, horas_contratadas: e.target.value, valor_hora: newVh, valor_projeto: newVp }
                            })
                          }}
                          className={inputCls} style={inputStyle} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Expectativa de Início</label>
                      <input type="date" value={form.expectativa_inicio}
                        onChange={e => setForm(f => ({ ...f, expectativa_inicio: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                    </div>
                  </div>

                  {/* Valores e Horas — mesmas regras do projeto */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">Valores e Horas</p>
                    <div className="grid grid-cols-3 gap-3">
                      {!isOnDemand && (
                        <div>
                          <label className={labelCls}>Valor do Projeto (R$)</label>
                          <input type="number" min="0" step="0.01" placeholder="0,00"
                            value={form.valor_projeto}
                            onChange={e => {
                              const vp = e.target.value
                              const h = Number(form.horas_contratadas)
                              const vh = vp && h > 0 ? String((Number(vp) / h).toFixed(2)) : form.valor_hora
                              setForm(f => ({ ...f, valor_projeto: vp, valor_hora: vh }))
                            }}
                            className={inputCls} style={inputStyle} />
                        </div>
                      )}
                      <div>
                        <label className={labelCls}>Valor da Hora (R$)</label>
                        <input type="number" min="0" step="0.01" placeholder="0,00"
                          value={form.valor_hora}
                          onChange={e => {
                            const vh = e.target.value
                            const h = Number(form.horas_contratadas)
                            const vp = vh && h > 0 ? String((Number(vh) * h).toFixed(2)) : form.valor_projeto
                            setForm(f => ({ ...f, valor_hora: vh, valor_projeto: isOnDemand ? f.valor_projeto : vp }))
                          }}
                          className={inputCls} style={inputStyle} />
                      </div>
                      {!isOnDemand && (
                        <div>
                          <label className={labelCls}>Hora Adicional (R$)</label>
                          <input type="number" min="0" step="0.01" placeholder="0,00"
                            value={form.hora_adicional}
                            onChange={e => setForm(f => ({ ...f, hora_adicional: e.target.value }))}
                            className={inputCls} style={inputStyle} />
                        </div>
                      )}
                      {!isOnDemand && (
                        <div>
                          <label className={labelCls}>% Horas Coordenador</label>
                          <input type="number" min="0" max="100" step="1" placeholder="0"
                            value={form.pct_horas_coordenador}
                            onChange={e => setForm(f => ({ ...f, pct_horas_coordenador: e.target.value }))}
                            className={inputCls} style={inputStyle} />
                        </div>
                      )}
                      {isFechado && (
                        <>
                          <div>
                            <label className={labelCls}>Horas Consultor</label>
                            <input type="number" min="0" step="1" placeholder="0"
                              value={form.horas_consultor}
                              onChange={e => setForm(f => ({ ...f, horas_consultor: e.target.value }))}
                              className={inputCls} style={inputStyle} />
                          </div>
                          <div>
                            <label className={labelCls}>Save ERPSERV</label>
                            <input readOnly value={saveErpserv ?? ''}
                              className={inputCls} style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Contatos */}
              {activeTab === 5 && (
                <div className="space-y-4">
                  {/* Contatos do cadastro do cliente */}
                  {customerContacts.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Do cadastro do cliente</p>
                      <div className="space-y-1.5">
                        {customerContacts.map(cc => {
                          const alreadyAdded = contacts.some(c => c.name === cc.name && c.email === cc.email)
                          return (
                            <div key={cc.id}
                              className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors"
                              style={{
                                borderColor: alreadyAdded ? 'rgba(0,245,255,0.4)' : 'var(--brand-border)',
                                background: alreadyAdded ? 'rgba(0,245,255,0.06)' : 'transparent',
                              }}
                              onClick={() => {
                                if (alreadyAdded) {
                                  setContacts(cs => cs.filter(c => !(c.name === cc.name && c.email === cc.email)))
                                } else {
                                  setContacts(cs => [...cs, { name: cc.name, cargo: cc.cargo ?? '', email: cc.email ?? '', phone: cc.phone ?? '' }])
                                }
                              }}
                            >
                              <div>
                                <p className="text-xs font-medium text-zinc-200">{cc.name}</p>
                                <p className="text-[10px] text-zinc-500">{[cc.cargo, cc.email].filter(Boolean).join(' · ')}</p>
                              </div>
                              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                style={{ background: alreadyAdded ? '#00F5FF' : 'transparent', border: alreadyAdded ? 'none' : '1px solid #52525b' }}>
                                {alreadyAdded && <CheckCircle size={12} style={{ color: '#000' }} />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {!form.customer_id && (
                    <p className="text-xs text-zinc-600 py-2 text-center">Selecione um cliente na aba Cliente para carregar os contatos do cadastro.</p>
                  )}
                  {form.customer_id && customerContacts.length === 0 && (
                    <p className="text-[10px] text-zinc-600">Nenhum contato cadastrado para este cliente. <a href="/cadastros?tab=customer_contacts" target="_blank" className="text-cyan-500 hover:underline">Adicionar no cadastro →</a></p>
                  )}

                  {/* Contatos adicionados */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Contatos selecionados ({contacts.length})
                      </p>
                      <button onClick={addContact}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium"
                        style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: '#00F5FF' }}>
                        <Plus size={10} /> Adicionar manual
                      </button>
                    </div>
                    {contacts.length === 0 && <p className="text-xs text-zinc-600 py-2 text-center">Nenhum contato selecionado.</p>}
                    {contacts.map((ct, i) => (
                      <div key={i} className="rounded-lg border p-3 space-y-2 mb-2" style={{ borderColor: 'var(--brand-border)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-300">Contato {i + 1}</span>
                          <button onClick={() => removeContact(i)} className="text-zinc-600 hover:text-red-400 transition-colors"><X size={12} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelCls}>Nome *</label>
                            <input value={ct.name} onChange={e => updateContact(i, 'name', e.target.value)}
                              className={inputCls} style={inputStyle} placeholder="Nome completo" />
                          </div>
                          <div>
                            <label className={labelCls}>Cargo</label>
                            <input value={ct.cargo} onChange={e => updateContact(i, 'cargo', e.target.value)}
                              className={inputCls} style={inputStyle} placeholder="Cargo / Função" />
                          </div>
                          <div>
                            <label className={labelCls}>Email</label>
                            <input type="email" value={ct.email} onChange={e => updateContact(i, 'email', e.target.value)}
                              className={inputCls} style={inputStyle} placeholder="email@empresa.com"
                              pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}" />
                          </div>
                          <div>
                            <label className={labelCls}>Telefone</label>
                            <input type="tel" value={ct.phone}
                              onChange={e => updateContact(i, 'phone', e.target.value.replace(/\D/g, ''))}
                              className={inputCls} style={inputStyle} placeholder="11999999999" maxLength={15} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 6: Financeiro */}
              {activeTab === 6 && (
                <div>
                  <label className={labelCls}>Condição de Pagamento</label>
                  <textarea value={form.condicao_pagamento}
                    onChange={e => setForm(f => ({ ...f, condicao_pagamento: e.target.value }))}
                    rows={5} placeholder="Ex: 30 dias após entrega da NF..."
                    className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              )}

              {/* Tab 7: Comercial */}
              {activeTab === 7 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Vendedor</label>
                    <SearchSelect
                      value={form.vendedor_id}
                      onChange={v => setForm(f => ({ ...f, vendedor_id: v }))}
                      options={users}
                      placeholder="Buscar vendedor..."
                    />
                  </div>
                </div>
              )}

              {/* Tab 8: Observações */}
              {activeTab === 8 && (
                <div>
                  <label className={labelCls}>
                    Observações
                    <span className="ml-1 text-yellow-500 text-[10px]">(recomendado — será copiado integralmente ao projeto)</span>
                  </label>
                  <textarea value={form.observacoes}
                    onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                    rows={10} placeholder="Descreva o escopo, premissas, restrições, responsabilidades e qualquer informação relevante para o projeto..."
                    className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
                  <p className="text-[10px] text-zinc-600 mt-1">{form.observacoes.length} caracteres</p>
                </div>
              )}

              {/* Tab 9: Anexos */}
              {activeTab === 9 && (
                <div className="space-y-4">
                  {editContract && editContract.attachments.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-400 mb-2">Arquivos já enviados</p>
                      <div className="space-y-2">
                        {editContract.attachments.map(att => (
                          <div key={att.id} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-zinc-400" />
                              <div>
                                <p className="text-xs text-zinc-300">{att.original_name}</p>
                                <p className="text-[10px] text-zinc-600">{ATTACHMENT_TYPE_LABEL[att.type]} · {fmt(att.size)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => downloadAttachment(editContract.id, att)} className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"><Download size={13} /></button>
                              <button onClick={() => deleteAttachment(editContract.id, att.id)} className="p-1 text-zinc-400 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-zinc-400 mb-2">Adicionar arquivo</p>
                    <div className="flex items-center gap-2 mb-3">
                      {(['proposta', 'contrato', 'logo'] as const).map(t => (
                        <button key={t} onClick={() => setSelectedAttachType(t)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: selectedAttachType === t ? 'rgba(0,245,255,0.15)' : 'transparent', border: '1px solid var(--brand-border)', color: selectedAttachType === t ? '#00F5FF' : '#71717a' }}>
                          {ATTACHMENT_TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                    <input ref={fileInputRef} type="file" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { setPendingFiles(p => [...p, { file: f, type: selectedAttachType }]); e.target.value = '' }
                      }} />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-full py-6 rounded-lg border-2 border-dashed text-xs text-zinc-500 hover:border-cyan-500/40 hover:text-zinc-300 transition-colors"
                      style={{ borderColor: 'var(--brand-border)' }}>
                      Clique para selecionar arquivo ({ATTACHMENT_TYPE_LABEL[selectedAttachType]})
                    </button>
                  </div>

                  {pendingFiles.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-400">Aguardando upload ({pendingFiles.length})</p>
                      {pendingFiles.map((pf, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.15)' }}>
                          <div>
                            <p className="text-xs text-zinc-300">{pf.file.name}</p>
                            <p className="text-[10px] text-zinc-600">{ATTACHMENT_TYPE_LABEL[pf.type]} · {fmt(pf.file.size)}</p>
                          </div>
                          <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="flex items-center gap-2">
                {activeTab > 0 && (
                  <button onClick={() => setActiveTab(t => t - 1)} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors" style={{ border: '1px solid var(--brand-border)' }}>
                    ← Anterior
                  </button>
                )}
                {activeTab < TABS.length - 1 && (
                  <button onClick={() => setActiveTab(t => t + 1)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors" style={{ border: '1px solid var(--brand-border)' }}>
                    Próximo →
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
                  Cancelar
                </button>
                {(editContract || activeTab === TABS.length - 1) && (
                  <button onClick={save} disabled={saving || uploading || codeExists}
                    className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.3)', color: '#00F5FF' }}>
                    {saving ? 'Salvando...' : uploading ? 'Enviando arquivos...' : editContract ? 'Salvar alterações' : 'Criar contrato'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View Modal ── */}
      {viewContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <h2 className="text-base font-semibold text-white">{viewContract.customer?.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: `${STATUS_COLOR[viewContract.status]}18`, color: STATUS_COLOR[viewContract.status] }}>
                    {STATUS_LABEL[viewContract.status]}
                  </span>
                  <span className="text-[10px] text-zinc-500">Criado em {fmtDate(viewContract.created_at)}</span>
                </div>
              </div>
              <button onClick={() => setViewContract(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={18} /></button>
            </div>

            {isSustAdmin && (
              <div className="px-6 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--brand-border)', background: 'rgba(251,146,60,0.05)' }}>
                <span className="text-xs font-semibold shrink-0" style={{ color: '#f59e0b' }}>Fila de Sustentação</span>
                <select value={sustQueue} onChange={e => setSustQueue(e.target.value)}
                  className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none bg-zinc-800 border border-zinc-700 text-zinc-200">
                  <option value="">— Selecionar fila —</option>
                  <option value="sust_bh_fixo">BH Fixo</option>
                  <option value="sust_bh_mensal">BH Mensal</option>
                  <option value="sust_on_demand">On Demand</option>
                  <option value="sust_cloud">Cloud</option>
                  <option value="sust_bizify">Bizify</option>
                </select>
                <button onClick={handleSustMove} disabled={!sustQueue || sustMoving}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{ background: '#f59e0b', color: '#000' }}>
                  {sustMoving ? '...' : 'Mover'}
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Categoria</p><p className="text-zinc-300">{CATEGORIA_LABEL[viewContract.categoria]}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Tipo de Serviço</p><p className="text-zinc-300">{viewContract.service_type?.name ?? '—'}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Tipo de Contrato</p><p className="text-zinc-300">{viewContract.contract_type?.name ?? '—'}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Horas Contratadas</p><p className="text-zinc-300 font-semibold">{viewContract.horas_contratadas}h</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Alocação</p><p className="text-zinc-300 capitalize">{viewContract.tipo_alocacao ?? '—'}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Expectativa de Início</p><p className="text-zinc-300">{fmtDate(viewContract.expectativa_inicio)}</p></div>
                {viewContract.architect && <div><p className="text-[10px] text-zinc-500 mb-0.5">Arquiteto</p><p className="text-zinc-300">{viewContract.architect.name}</p></div>}
                {viewContract.executivo_conta && <div><p className="text-[10px] text-zinc-500 mb-0.5">Executivo</p><p className="text-zinc-300">{viewContract.executivo_conta.name}</p></div>}
                {viewContract.cobra_despesa_cliente && viewContract.limite_despesa != null && (
                  <div><p className="text-[10px] text-zinc-500 mb-0.5">Limite de Despesas</p><p className="text-zinc-300">R$ {Number(viewContract.limite_despesa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                )}
              </div>

              {viewContract.condicao_pagamento && (
                <div><p className="text-[10px] text-zinc-500 mb-1">Condição de Pagamento</p><p className="text-zinc-300 text-xs">{viewContract.condicao_pagamento}</p></div>
              )}

              {viewContract.observacoes && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-1">Observações</p>
                  <div className="rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                    {viewContract.observacoes}
                  </div>
                </div>
              )}

              {viewContract.contacts.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-2">Contatos ({viewContract.contacts.length})</p>
                  <div className="space-y-2">
                    {viewContract.contacts.map((ct, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF' }}>{ct.name[0]}</div>
                        <div>
                          <p className="text-zinc-200 font-medium">{ct.name} {ct.cargo && <span className="text-zinc-500">· {ct.cargo}</span>}</p>
                          <p className="text-zinc-500">{ct.email}{ct.email && ct.phone ? ' · ' : ''}{ct.phone}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewContract.attachments.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-2">Anexos ({viewContract.attachments.length})</p>
                  <div className="space-y-2">
                    {viewContract.attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-zinc-400" />
                          <div>
                            <p className="text-xs text-zinc-300">{att.original_name}</p>
                            <p className="text-[10px] text-zinc-600">{ATTACHMENT_TYPE_LABEL[att.type]} · {fmt(att.size)}</p>
                          </div>
                        </div>
                        <button onClick={() => downloadAttachment(viewContract.id, att)} className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"><Download size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewContract.project && (
                <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <p className="text-[10px] text-green-500 mb-1">Projeto gerado</p>
                  <p className="text-sm text-green-400 font-semibold font-mono">{viewContract.project.code}</p>
                  <p className="text-xs text-zinc-400">{viewContract.project.name}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="flex items-center gap-2">
                {viewContract.status === 'rascunho' && (
                  <button onClick={() => { updateStatus(viewContract, 'aprovado'); setViewContract(null) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}>
                    <CheckCircle size={13} /> Aprovar
                  </button>
                )}
                {!viewContract.project_id && (viewContract.status === 'aprovado' || viewContract.status === 'rascunho') && (
                  <button onClick={() => { openGenModal(viewContract); setViewContract(null) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}>
                    <Rocket size={13} /> Gerar Projeto
                  </button>
                )}
              </div>
              <button onClick={() => setViewContract(null)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Generate Project Modal ── */}
      {genModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Rocket size={16} style={{ color: '#eab308' }} /> Gerar Projeto
              </h2>
              <p className="text-xs text-zinc-500 mt-1">{genModal.contract.customer?.name}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">Coordenadores do Projeto</p>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {coordinators.length === 0 && (
                    <p className="text-xs text-zinc-600 italic">Nenhum coordenador cadastrado.</p>
                  )}
                  {coordinators.map(u => {
                    const sel = genCoordinatorIds.includes(u.id)
                    return (
                      <button key={u.id} type="button"
                        onClick={() => setGenCoordinatorIds(ids => sel ? ids.filter(i => i !== u.id) : [...ids, u.id])}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left"
                        style={{
                          background: sel ? 'rgba(0,245,255,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${sel ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
                          color: sel ? 'var(--brand-primary)' : 'var(--brand-text)',
                        }}>
                        <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-bold"
                          style={{ background: sel ? 'var(--brand-primary)' : 'transparent', border: `1px solid ${sel ? 'var(--brand-primary)' : 'var(--brand-border)'}`, color: '#0A0A0B' }}>
                          {sel ? '✓' : ''}
                        </span>
                        {u.name}
                      </button>
                    )
                  })}
                </div>
                {genCoordinatorIds.length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-2">Nenhum coordenador selecionado — o arquiteto do contrato será usado como fallback.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
              <button onClick={() => setGenModal(null)} disabled={generating}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={confirmGenerateProject} disabled={generating}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                style={{ background: '#eab308', color: '#0A0A0B' }}>
                <Rocket size={14} />
                {generating ? 'Gerando...' : 'Confirmar e Gerar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
