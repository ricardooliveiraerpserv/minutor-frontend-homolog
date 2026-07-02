'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '@/lib/api'
import { uploadDirect } from '@/lib/upload'
import { toast } from 'sonner'
import { Plus, X, Trash2, FileText, Download, ExternalLink, CheckCircle } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'

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
  horas_coordenacao?: number | null
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

// Regra de combinação Tipo de Serviço × Tipo de Contrato:
// - Projeto     → permite: BH Fixo, BH Mensal, Fechado          (proíbe: On Demand, SaaS, Cloud)
// - Sustentação → permite: BH Fixo, BH Mensal, On Demand, Cloud (proíbe: Fechado, SaaS)
// - Bizify      → permite: BH Fixo, Fechado, On Demand, SaaS    (proíbe: BH Mensal, Cloud)
// Subprojeto (filho) → adicionalmente proíbe BH Mensal, SaaS e Cloud (mensalidade
// fica no projeto pai; filho herda regra de cobrança).
// O contract_type atualmente selecionado é sempre mantido visível (caso de edição
// de contrato pré-existente que viole a nova regra).
const allowedForService = (
  contractTypes: SelectOption[],
  serviceTypeName: string | null | undefined,
  selectedContractTypeId: string | number | null | undefined,
  isSubproject: boolean = false,
): SelectOption[] => {
  const sn = (serviceTypeName ?? '').toLowerCase()
  const isProjeto = sn.includes('projeto')
  const isSustenta = sn.includes('sustenta')
  const isBizify = sn.includes('bizify')
  if (!isProjeto && !isSustenta && !isBizify && !isSubproject) return contractTypes
  return contractTypes.filter(ct => {
    if (String(ct.id) === String(selectedContractTypeId ?? '')) return true
    const n = String(ct.name ?? '').toLowerCase()
    if (isSubproject && (n.includes('banco de horas mensal') || n.includes('saas') || n === 'cloud')) return false
    if (isProjeto && (n.includes('saas') || n === 'cloud')) return false
    if (isSustenta && (n.includes('fechado') || n.includes('saas'))) return false
    if (isBizify && (n.includes('banco de horas mensal') || n === 'cloud')) return false
    return true
  })
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR_2D = new Date().getFullYear().toString().slice(-2)

const ATTACHMENT_TYPE_LABEL: Record<string, string> = {
  proposta: 'Proposta',
  contrato: 'Contrato',
  logo: 'Logo',
}

type FormState = {
  customer_id: string
  project_name: string
  is_subproject: boolean
  sub_seq: string
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
  horas_coordenacao: string
  horas_consultor: string
  expectativa_inicio: string
  condicao_pagamento: string
  executivo_conta_id: string
  vendedor_id: string
  observacoes: string
  // Aporte v2 — fluxo alternativo (toggle "É aporte?" no topo da tab Cliente).
  // Aporte não vira projeto/contrato; abastece hour_contributions e renderiza
  // como card na coluna "Aporte" do Kanban (somente quando projeto destino é pai).
  is_aporte: boolean
  aporte_target_project_id: string
  aporte_horas: string
  aporte_valor_hora: string
  aporte_motivo: 'aporte' | 'excedentes' | 'absorvidas'
  aporte_descricao: string
  aporte_data: string
}

const EMPTY_FORM: FormState = {
  customer_id: '',
  project_name: '',
  is_subproject: false,
  sub_seq: '',
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
  horas_coordenacao: '',
  horas_consultor: '',
  expectativa_inicio: '',
  condicao_pagamento: '',
  executivo_conta_id: '',
  vendedor_id: '',
  observacoes: '',
  is_aporte: false,
  aporte_target_project_id: '',
  aporte_horas: '',
  aporte_valor_hora: '',
  aporte_motivo: 'aporte',
  aporte_descricao: '',
  aporte_data: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ContractFormModalProps {
  open: boolean
  editContract?: Contract | null
  onClose: () => void
  onSaved: () => void
  // Pré-preenchimento ao criar (ex.: oportunidade CRM GANHA → Novo Contrato).
  prefill?: Partial<FormState>
  prefillContacts?: ContractContact[]
  opportunityId?: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContractFormModal({ open, editContract, onClose, onSaved, prefill, prefillContacts, opportunityId }: ContractFormModalProps) {
  // Master data
  const [customers, setCustomers]         = useState<SelectOption[]>([])
  const [users, setUsers]                 = useState<SelectOption[]>([])
  const [serviceTypes, setServiceTypes]   = useState<SelectOption[]>([])
  const [contractTypes, setContractTypes] = useState<SelectOption[]>([])

  // Form state
  const [form, setForm]       = useState<FormState>({ ...EMPTY_FORM })
  const [contacts, setContacts] = useState<ContractContact[]>([])
  const [saving, setSaving]   = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  // Contatos do cadastro do cliente selecionado
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([])
  const [contactSearch, setContactSearch] = useState('')

  // Projetos pai disponíveis para o cliente selecionado
  const [parentProjects, setParentProjects] = useState<SelectOption[]>([])

  // Aporte v2 — lista de TODOS os projetos (pai + filho) do cliente, usada quando
  // is_aporte=true para escolher o projeto de destino. Cada item carrega o flag
  // `is_child` pra UI mostrar o banner "será registrado no pai" + o `hourly_rate`
  // do projeto/pai pra auto-preencher Valor da hora.
  const [aporteProjects, setAporteProjects] = useState<Array<{ id: string; name: string; is_child: boolean; parent_code?: string; parent_name?: string; hourly_rate?: number | null; parent_hourly_rate?: number | null }>>([])

  // Attachments
  const [pendingFiles, setPendingFiles] = useState<{ file: File; type: 'proposta' | 'contrato' | 'logo' }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedAttachType, setSelectedAttachType] = useState<'proposta' | 'contrato' | 'logo'>('proposta')

  // Code validation
  const [codeExists, setCodeExists] = useState(false)
  const [codeChecking, setCodeChecking] = useState(false)

  // Internal edit state (loaded full contract)
  const [internalEdit, setInternalEdit] = useState<Contract | null>(null)

  // Load master data once
  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r => setCustomers(r?.items ?? r ?? [])).catch(() => {})
    api.get<any>('/users?pageSize=500').then(r => setUsers(r?.items ?? r ?? [])).catch(() => {})
    api.get<any>('/service-types?pageSize=100').then(r => setServiceTypes(r?.items ?? r?.data ?? r ?? [])).catch(() => {})
    api.get<any>('/contract-types?pageSize=100').then(r => setContractTypes(r?.items ?? r?.data ?? r ?? [])).catch(() => {})
  }, [])

  // Initialize form when modal opens
  useEffect(() => {
    if (!open) return
    setActiveTab(0)
    setCodeExists(false)
    setPendingFiles([])

    if (editContract) {
      // Load full contract data
      api.get<Contract>(`/contracts/${editContract.id}`).then(full => {
        setInternalEdit(full)
        // Parse o código existente (ex: "AVN005-26" ou "AVN005-26-01") pros segmentos
        const codeMatch = ((full as any).project_code_preview ?? '').match(/^[A-Za-z]+(\d+)-(\d{2})(?:-(\d{2}))?$/)
        setForm({
          customer_id:           String(full.customer_id),
          project_name:          (full as any).project_name ?? '',
          is_subproject:         !!(full as any).parent_project_id,
          sub_seq:               codeMatch?.[3] ?? '',
          parent_project_id:     (full as any).parent_project_id ? String((full as any).parent_project_id) : '',
          code_seq:              codeMatch?.[1] ?? '',
          code_year:             codeMatch?.[2] ?? CURRENT_YEAR_2D,
          categoria:             full.categoria,
          service_type_id:       full.service_type_id ? String(full.service_type_id) : '',
          contract_type_id:      full.contract_type_id ? String(full.contract_type_id) : '',
          cobra_despesa_cliente: full.cobra_despesa_cliente,
          limite_despesa:        full.limite_despesa != null ? String(full.limite_despesa) : '',
          architect_id:          full.architect_id ? String(full.architect_id) : '',
          tipo_alocacao:         full.tipo_alocacao ?? 'remoto',
          horas_contratadas:     String(full.horas_contratadas),
          valor_projeto:         full.valor_projeto != null ? String(full.valor_projeto) : '',
          valor_hora:            full.valor_hora != null ? String(full.valor_hora) : '',
          hora_adicional:        full.hora_adicional != null ? String(full.hora_adicional) : '',
          pct_horas_coordenador: full.pct_horas_coordenador != null ? String(full.pct_horas_coordenador) : '',
          horas_coordenacao:     (full as any).horas_coordenacao != null ? String((full as any).horas_coordenacao) : '',
          horas_consultor:       full.horas_consultor != null ? String(full.horas_consultor) : '',
          expectativa_inicio:    full.expectativa_inicio ?? '',
          condicao_pagamento:    full.condicao_pagamento ?? '',
          executivo_conta_id:    full.executivo_conta_id ? String(full.executivo_conta_id) : '',
          vendedor_id:           full.vendedor_id ? String(full.vendedor_id) : '',
          observacoes:           full.observacoes ?? '',
          // Aporte v2: edição de contrato existente nunca entra no fluxo aporte
          is_aporte:                false,
          aporte_target_project_id: '',
          aporte_horas:             '',
          aporte_valor_hora:        '',
          aporte_motivo:            'aporte',
          aporte_descricao:         '',
          aporte_data:              '',
        })
        setContacts(full.contacts ?? [])
      }).catch(() => toast.error('Erro ao carregar contrato'))
    } else {
      setInternalEdit(null)
      setForm({ ...EMPTY_FORM, ...(prefill ?? {}) })
      setContacts(prefillContacts ?? [])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editContract])

  // Se a oportunidade tem proposta ASSINADA, o BACKEND anexa o PDF automaticamente ao criar o contrato
  // (server-side, robusto — sem download+reupload no browser). Aqui só detectamos para exibir o aviso.
  const [autoProposta, setAutoProposta] = useState(false)
  useEffect(() => {
    if (!open || !opportunityId || editContract) { setAutoProposta(false); return }
    let cancel = false
    ;(async () => {
      try {
        const r = await api.get<{ data: { status: string; document_id?: number | null }[] }>(`/crm/proposals?opportunity_id=${opportunityId}`)
        const ass = (r?.data ?? []).find(p => ['assinada', 'liberada', 'convertida'].includes(p.status) && p.document_id)
        if (!cancel) setAutoProposta(!!ass)
      } catch { /* silencioso */ }
    })()
    return () => { cancel = true }
  }, [open, opportunityId, editContract])

  // Carrega contatos e projetos pai do cliente selecionado
  useEffect(() => {
    if (!form.customer_id) { setCustomerContacts([]); setParentProjects([]); setAporteProjects([]); return }
    api.get<CustomerContact[]>(`/customer-contacts?customer_id=${form.customer_id}`)
      .then(r => setCustomerContacts(Array.isArray(r) ? r : []))
      .catch(() => setCustomerContacts([]))
    // Projetos pausados/encerrados/cancelados não podem receber novos subprojetos nem aportes —
    // filtra todos os 3 status em ambos os dropdowns.
    const INACTIVE_STATUSES = new Set(['paused', 'finished', 'cancelled'])
    api.get<any>(`/projects?customer_id=${form.customer_id}&parent_projects_only=true&pageSize=100`)
      .then(r => setParentProjects(
        ((r?.items ?? []) as any[])
          .filter(p => !INACTIVE_STATUSES.has(p.status))
          .map((p: any) => ({ id: p.id, name: `${p.code} — ${p.name}` }))
      ))
      .catch(() => setParentProjects([]))
    // TODOS os projetos do cliente (pai + filho) para o select do form de aporte.
    // Ordena pais alfabético e filhos imediatamente abaixo do pai (indented).
    api.get<any>(`/projects?customer_id=${form.customer_id}&pageSize=200`)
      .then(r => {
        const raw: any[] = r?.items ?? []
        const list = raw.filter(p => !INACTIVE_STATUSES.has(p.status))
        const byId = new Map<number, any>(list.map(p => [p.id, p]))
        const parents = list.filter(p => !p.parent_project_id).sort((a, b) => String(a.code).localeCompare(String(b.code)))
        const childrenByParent = new Map<number, any[]>()
        for (const p of list) {
          if (p.parent_project_id) {
            const arr = childrenByParent.get(p.parent_project_id) ?? []
            arr.push(p)
            childrenByParent.set(p.parent_project_id, arr)
          }
        }
        const orphans = list.filter(p => p.parent_project_id && !byId.has(p.parent_project_id))
        const ordered: any[] = []
        for (const par of parents) {
          ordered.push({ ...par, _is_child: false })
          const kids = (childrenByParent.get(par.id) ?? []).sort((a, b) => String(a.code).localeCompare(String(b.code)))
          for (const k of kids) ordered.push({ ...k, _is_child: true, _parent: par })
        }
        for (const o of orphans) ordered.push({ ...o, _is_child: true, _parent: byId.get(o.parent_project_id) })

        setAporteProjects(ordered.map(p => {
          const parent = p._parent
          const ownRate = Number(p.hourly_rate ?? p.valor_hora ?? 0) || null
          const parentRate = parent ? (Number(parent.hourly_rate ?? parent.valor_hora ?? 0) || null) : null
          return {
            id: String(p.id),
            name: p._is_child && parent
              ? `   └─ ${p.code} — ${p.name}  (filho de ${parent.code})`
              : `${p.code} — ${p.name}`,
            is_child: p._is_child,
            parent_code: parent?.code,
            parent_name: parent?.name,
            hourly_rate: ownRate,
            parent_hourly_rate: parentRate,
          }
        }))
      })
      .catch(() => setAporteProjects([]))
  }, [form.customer_id])

  // Aporte v2 — auto-preencher Valor da hora ao selecionar projeto destino.
  // Regra: pai → usa valor_hora dele; filho → herda valor_hora do pai.
  useEffect(() => {
    if (!form.is_aporte || !form.aporte_target_project_id) return
    const sel = aporteProjects.find(p => p.id === form.aporte_target_project_id)
    if (!sel) return
    const candidate = sel.is_child ? (sel.parent_hourly_rate ?? null) : (sel.hourly_rate ?? null)
    if (candidate && candidate > 0) {
      setForm(f => ({ ...f, aporte_valor_hora: String(candidate) }))
      return
    }
    // Fallback: GET no projeto certo (filho → busca pai)
    let cancelled = false
    api.get<any>(`/projects/${form.aporte_target_project_id}`)
      .then(p => {
        if (cancelled) return
        const ownRate = Number(p?.hourly_rate ?? p?.valor_hora ?? 0)
        if (sel.is_child && p?.parent_project_id) {
          api.get<any>(`/projects/${p.parent_project_id}`)
            .then(parent => {
              if (cancelled) return
              const parentRate = Number(parent?.hourly_rate ?? parent?.valor_hora ?? 0)
              if (parentRate > 0) setForm(f => ({ ...f, aporte_valor_hora: String(parentRate) }))
              else if (ownRate > 0) setForm(f => ({ ...f, aporte_valor_hora: String(ownRate) }))
            })
            .catch(() => {})
        } else if (ownRate > 0) {
          setForm(f => ({ ...f, aporte_valor_hora: String(ownRate) }))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.aporte_target_project_id, form.is_aporte])

  // Subprojeto: pré-preenche "Valor da Hora" com o do projeto PAI (editável).
  // Só preenche se o campo estiver vazio → não sobrescreve subprojeto já existente em edição.
  useEffect(() => {
    if (!form.is_subproject || !form.parent_project_id) return
    let cancelled = false
    api.get<any>(`/projects/${form.parent_project_id}`)
      .then(r => {
        if (cancelled) return
        const hr = Number(r?.valor_hora ?? r?.hourly_rate ?? 0)
        if (hr > 0) setForm(f => f.valor_hora ? f : { ...f, valor_hora: String(hr) })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.parent_project_id, form.is_subproject])

  // Derived: selected contract type for conditional fields
  const selectedContractType = useMemo(
    () => contractTypes.find(t => String(t.id) === String(form.contract_type_id)),
    [contractTypes, form.contract_type_id]
  )
  const isOnDemand  = selectedContractType?.name.toLowerCase().trim() === 'on demand'
  const isBankHours = selectedContractType?.name.toLowerCase().includes('banco de horas') ?? false
  const ctNameLower = selectedContractType?.name.toLowerCase().trim() ?? ''
  // Mensalidade: Cloud e SaaS — só "Valor do Contrato" como mensalidade fixa.
  const isMensalidade = ctNameLower === 'cloud' || ctNameLower === 'saas'
  const isFechado   = !!selectedContractType && !isOnDemand && !isBankHours && !isMensalidade
  // BH Mensal: banco de horas que não é fixo. Não tem horas de coordenador.
  const isBhMensal  = isBankHours && !ctNameLower.includes('fixo')
  const isBhFixo    = isBankHours && ctNameLower.includes('fixo')

  // "Horas de Gestão" derivado do Percentual Gestão sobre as Horas Vendidas (contratadas).
  const [gestaoDraft, setGestaoDraft] = useState<string | null>(null)

  // Derived: project code preview
  const selectedCustomerObj = useMemo(
    () => customers.find(c => String(c.id) === String(form.customer_id)),
    [customers, form.customer_id]
  )
  const codePrefix = selectedCustomerObj?.code_prefix?.toUpperCase() ?? ''
  const codePreview = useMemo(() => {
    if (!codePrefix || !form.code_seq.trim()) return ''
    const base = `${codePrefix}${form.code_seq.padStart(3, '0')}-${form.code_year}`
    if (form.is_subproject && form.sub_seq.trim())
      return `${base}-${form.sub_seq.padStart(2, '0')}`
    return base
  }, [codePrefix, form.code_seq, form.code_year, form.is_subproject, form.sub_seq])

  const checkCodeExists = useCallback(async () => {
    if (!codePreview) { setCodeExists(false); return }
    setCodeChecking(true)
    try {
      const r = await api.get<any>(`/projects?code=${encodeURIComponent(codePreview)}`)
      setCodeExists((r?.total ?? 0) > 0)
    } catch { setCodeExists(false) }
    finally { setCodeChecking(false) }
  }, [codePreview])

  // ─── Save ─────────────────────────────────────────────────────────────────

  const save = async () => {
    // ── Ramo APORTE — cria hour_contribution (não cria contract/project) ──
    if (form.is_aporte && !internalEdit) {
      if (!form.customer_id)                                  { toast.error('Selecione o cliente'); return }
      if (!form.aporte_target_project_id)                     { toast.error('Selecione o projeto que recebe o aporte'); return }
      if (!form.aporte_horas || Number(form.aporte_horas) <= 0)        { toast.error('Informe a quantidade de horas'); return }
      if (!form.aporte_valor_hora || Number(form.aporte_valor_hora) <= 0) { toast.error('Informe o valor da hora'); return }
      if (!form.aporte_data) { toast.error('Informe a data do aporte'); return }
      const selProj = aporteProjects.find(p => p.id === form.aporte_target_project_id)
      const isChildTarget = !!selProj?.is_child
      const pendProposta = pendingFiles.find(p => p.type === 'proposta')
      if (!isChildTarget && !pendProposta) {
        toast.error('Anexe a aprovação/proposta — obrigatório para aporte em projeto pai')
        return
      }
      setSaving(true)
      try {
        const fd = new FormData()
        fd.append('contributed_hours', String(Number(form.aporte_horas)))
        fd.append('hourly_rate',       String(Number(form.aporte_valor_hora)))
        fd.append('motivo',            form.aporte_motivo)
        fd.append('contributed_at',    form.aporte_data)
        if (form.aporte_descricao) fd.append('description', form.aporte_descricao)
        if (!isChildTarget && pendProposta) fd.append('proposta', pendProposta.file)
        await uploadDirect(`/projects/${form.aporte_target_project_id}/hour-contributions`, fd)
        toast.success(isChildTarget
          ? 'Aporte registrado no projeto filho (consumindo do saldo do pai)'
          : 'Aporte criado — card disponível no Kanban')
        onSaved()
        onClose()
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao criar aporte')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!form.customer_id)                                               { toast.error('Selecione o cliente'); setActiveTab(0); return }
    if (!(form as any).project_name?.trim())                             { toast.error('Informe o nome do projeto'); setActiveTab(0); return }
    if (form.is_subproject && !form.parent_project_id)                   { toast.error('Selecione o projeto pai para o subprojeto'); setActiveTab(0); return }
    if (!isOnDemand && !isMensalidade && !form.horas_contratadas)        { toast.error('Informe as horas contratadas'); setActiveTab(4); return }
    if (isMensalidade && !form.valor_projeto)                            { toast.error('Informe o Valor do Contrato (mensalidade)'); setActiveTab(4); return }
    if (isOnDemand && !isMensalidade && !form.valor_projeto)             { toast.error('Informe o Valor do Projeto'); setActiveTab(4); return }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        customer_id:           Number(form.customer_id),
        project_name:          (form as any).project_name || null,
        parent_project_id:     (form as any).parent_project_id ? Number((form as any).parent_project_id) : null,
        project_code_preview:  codePreview || null,
        categoria:             form.categoria,
        service_type_id:       form.service_type_id ? Number(form.service_type_id) : null,
        contract_type_id:      form.contract_type_id ? Number(form.contract_type_id) : null,
        cobra_despesa_cliente: form.cobra_despesa_cliente,
        limite_despesa:        form.limite_despesa ? Number(form.limite_despesa) : null,
        architect_id:          form.architect_id ? Number(form.architect_id) : null,
        tipo_alocacao:         form.tipo_alocacao,
        horas_contratadas:     (isOnDemand || isMensalidade) ? 0 : Number(form.horas_contratadas),
        valor_projeto:         form.valor_projeto ? Number(form.valor_projeto) : null,
        valor_hora:            form.valor_hora ? Number(form.valor_hora) : null,
        hora_adicional:        form.hora_adicional ? Number(form.hora_adicional) : null,
        pct_horas_coordenador: isBhMensal ? null : (form.pct_horas_coordenador ? Number(form.pct_horas_coordenador) : null),
        horas_coordenacao:     isBhMensal ? null : (form.horas_coordenacao ? Number(form.horas_coordenacao) : null),
        horas_consultor:       form.horas_consultor ? Number(form.horas_consultor) : null,
        expectativa_inicio:    form.expectativa_inicio || null,
        condicao_pagamento:    form.condicao_pagamento || null,
        executivo_conta_id:    form.executivo_conta_id ? Number(form.executivo_conta_id) : null,
        vendedor_id:           form.vendedor_id ? Number(form.vendedor_id) : null,
        observacoes:           form.observacoes || null,
        contacts,
      }
      // Criação a partir de oportunidade GANHA → vincula a opp (backend faz o convert idempotente).
      if (!internalEdit && opportunityId) payload.opportunity_id = opportunityId

      let contract: Contract
      if (internalEdit) {
        contract = await api.put<Contract>(`/contracts/${internalEdit.id}`, payload)
        toast.success('Contrato atualizado')
      } else {
        contract = await api.post<Contract>('/contracts', payload)
        toast.success('Contrato criado')
      }

      if (pendingFiles.length > 0) {
        setUploading(true)
        // Anexo é best-effort: o CONTRATO já foi criado. Falha de upload NÃO desfaz o contrato
        // nem prende o usuário — só avisa (pode reanexar depois pela edição do contrato).
        const falhas: string[] = []
        for (const { file, type } of pendingFiles) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('type', type)
          try { await uploadDirect(`/contracts/${contract.id}/attachments`, fd) }
          catch (err: any) { falhas.push(`${file.name}: ${err?.message ?? 'falha'}`) }
        }
        setUploading(false)
        if (falhas.length) toast.warning(`Contrato criado, mas o anexo não subiu (${falhas[0]}). Anexe pela edição do contrato.`)
      }

      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar contrato')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // ─── Attachment helpers ───────────────────────────────────────────────────

  const downloadAttachment = async (contractId: number, att: ContractAttachment) => {
    const res = await fetch(`/api/v1/contracts/${contractId}/attachments/${att.id}`, {
      credentials: 'same-origin',
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
      if (internalEdit) {
        const full = await api.get<Contract>(`/contracts/${contractId}`)
        setInternalEdit(full)
      }
    } catch { toast.error('Erro ao remover arquivo') }
  }

  // ─── Contacts helpers ─────────────────────────────────────────────────────

  const addContact    = () => setContacts(c => [...c, { name: '', cargo: '', email: '', phone: '' }])
  const updateContact = (i: number, field: keyof ContractContact, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!open) return null

  // Aba "Anexos" removida: o upload da Proposta/Aprovação já fica na 1ª aba (Cliente) e alimenta o mesmo pendingFiles.
  const TABS = ['Cliente', 'Classificação', 'Faturamento', 'Despesas', 'Operacional', 'Contatos', 'Financeiro', 'Comercial', 'Observações']

  const inputCls   = 'w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none focus:ring-1 focus:ring-cyan-500/40'
  const inputStyle = { border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }
  const labelCls   = 'block text-xs text-[var(--text-muted)] mb-1'

  const attachmentSection = (
    <div className="space-y-4">
      {internalEdit && internalEdit.attachments.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Arquivos já enviados</p>
          <div className="space-y-2">
            {internalEdit.attachments.map(att => (
              <div key={att.id} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-[var(--text-muted)]" />
                  <div>
                    <p className="text-xs text-[var(--text)]">{att.original_name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{ATTACHMENT_TYPE_LABEL[att.type]} · {fmt(att.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadAttachment(internalEdit.id, att)} className="p-1 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"><Download size={13} /></button>
                  <button onClick={() => deleteAttachment(internalEdit.id, att.id)} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2">Adicionar arquivo</p>
        <div className="flex items-center gap-2 mb-3">
          {(['proposta', 'contrato', 'logo'] as const).map(t => (
            <button key={t} onClick={() => setSelectedAttachType(t)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: selectedAttachType === t ? 'var(--primary-soft)' : 'transparent', border: '1px solid var(--brand-border)', color: selectedAttachType === t ? 'var(--text)' : 'var(--text-muted)' }}>
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
          className="w-full py-6 rounded-lg border-2 border-dashed text-xs text-[var(--text-light)] hover:border-[var(--primary)]/40 hover:text-[var(--text)] transition-colors"
          style={{ borderColor: 'var(--brand-border)' }}>
          Clique para selecionar arquivo ({ATTACHMENT_TYPE_LABEL[selectedAttachType]})
        </button>
      </div>

      {pendingFiles.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">Aguardando upload ({pendingFiles.length})</p>
          {pendingFiles.map((pf, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
              <div>
                <p className="text-xs text-[var(--text)]">{pf.file.name}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{ATTACHMENT_TYPE_LABEL[pf.type]} · {fmt(pf.file.size)}</p>
              </div>
              <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-[var(--danger)]"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h2 className="text-base font-semibold text-white">{internalEdit ? 'Editar Contrato' : 'Novo Contrato'}</h2>
            {(selectedContractType || form.service_type_id) && (
              <p className="text-[11px] text-[var(--text-light)] mt-0.5 flex items-center gap-1.5">
                {selectedContractType && <span style={{ color: 'var(--primary)' }}>{selectedContractType.name}</span>}
                {selectedContractType && form.service_type_id && <span className="text-[var(--text-muted)]">·</span>}
                {form.service_type_id && <span>{serviceTypes.find(s => String(s.id) === String(form.service_type_id))?.name}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--text-light)] hover:text-[var(--text)] transition-colors"><X size={18} /></button>
        </div>

        {/* Tabs (escondidas quando is_aporte — form de aporte é single-page) */}
        {!form.is_aporte && (
          <div className="flex border-b overflow-x-auto shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setActiveTab(i)}
                className="px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0"
                style={{ color: activeTab === i ? 'var(--text)' : 'var(--text-muted)', borderBottom: activeTab === i ? '2px solid var(--primary)' : '2px solid transparent' }}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Tab 0: Cliente */}
          {activeTab === 0 && (
            <div className="space-y-5">
              {/* ── Toggle "É aporte?" — primeira opção do form (Aporte v2) ── */}
              {!internalEdit && (
                <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                  style={{ background: form.is_aporte ? 'rgba(34,197,94,0.08)' : 'var(--surface-hover)',
                           border: `1px solid ${form.is_aporte ? 'rgba(34,197,94,0.45)' : 'var(--brand-border)'}` }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: form.is_aporte ? '#22c55e' : 'var(--text)' }}>
                      É aporte?
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                      Aporte de horas em projeto existente — sem criar novo projeto/contrato.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_aporte: !f.is_aporte }))}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors"
                    style={{ background: form.is_aporte ? '#22c55e' : 'rgba(255,255,255,0.18)' }}
                  >
                    <span className="pointer-events-none inline-block h-5 w-5 mt-0.5 ml-0.5 rounded-full bg-[var(--surface)] shadow transition-transform"
                      style={{ transform: form.is_aporte ? 'translateX(20px)' : 'translateX(0)' }} />
                  </button>
                </div>
              )}

              {/* ── Form simplificado de APORTE ── */}
              {form.is_aporte && !internalEdit && (() => {
                const selectedAporteProj = aporteProjects.find(p => p.id === form.aporte_target_project_id)
                const isChildTarget = !!selectedAporteProj?.is_child
                const total = (Number(form.aporte_horas) || 0) * (Number(form.aporte_valor_hora) || 0)
                const pendProposta = pendingFiles.find(p => p.type === 'proposta')
                return (
                  <div className="space-y-5">
                    {/* Cliente */}
                    <div>
                      <label className={labelCls}>Cliente <span style={{ color: '#ef4444' }}>*</span></label>
                      <SearchSelect
                        value={form.customer_id}
                        onChange={v => setForm(f => ({ ...f, customer_id: v, aporte_target_project_id: '' }))}
                        options={customers}
                        placeholder="Buscar cliente..."
                      />
                    </div>

                    {/* Projeto destino (pai ou filho) */}
                    {form.customer_id && (
                      <div>
                        <label className={labelCls}>Projeto que recebe o aporte <span style={{ color: '#ef4444' }}>*</span></label>
                        {aporteProjects.length === 0
                          ? <p className="text-xs text-[var(--warning)] italic px-3 py-2 rounded-lg" style={inputStyle}>Nenhum projeto disponível para este cliente</p>
                          : <SearchSelect
                              value={form.aporte_target_project_id}
                              onChange={v => setForm(f => ({ ...f, aporte_target_project_id: v }))}
                              options={aporteProjects.map(p => ({ id: p.id, name: p.name }))}
                              placeholder="Selecionar projeto..."
                            />
                        }
                      </div>
                    )}

                    {/* Banner azul quando destino é projeto filho */}
                    {isChildTarget && selectedAporteProj && (
                      <div className="rounded-xl p-3 flex items-start gap-2"
                        style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.45)' }}>
                        <span className="text-base" style={{ color: '#38bdf8' }}>ℹ</span>
                        <div className="text-[11px]" style={{ color: '#38bdf8' }}>
                          Este aporte será registrado no projeto <span className="font-semibold">{selectedAporteProj.name}</span>,
                          consumindo do saldo do pai <span className="font-semibold">{selectedAporteProj.parent_code} — {selectedAporteProj.parent_name}</span>.
                          <br/>
                          <span style={{ opacity: 0.85 }}>Não criará card no Kanban (cards só geram proposta comercial para projetos pai).</span>
                        </div>
                      </div>
                    )}

                    {/* Horas + Valor/hora + Total */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Quantidade de horas <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="number" min="0.01" step="0.5"
                          value={form.aporte_horas}
                          onChange={e => setForm(f => ({ ...f, aporte_horas: e.target.value }))}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                          style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelCls}>Valor da hora (R$) <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="number" min="0.01" step="0.01"
                          value={form.aporte_valor_hora}
                          onChange={e => setForm(f => ({ ...f, aporte_valor_hora: e.target.value }))}
                          placeholder="0,00"
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                          style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelCls}>Total do aporte</label>
                        <div className="px-3 py-2 rounded-lg text-sm font-semibold tabular-nums"
                          style={{ ...inputStyle, background: 'rgba(34,197,94,0.10)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}>
                          {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>
                    </div>

                    {/* Motivo (dropdown) */}
                    <div>
                      <label className={labelCls}>Motivo do aporte <span style={{ color: '#ef4444' }}>*</span></label>
                      <select
                        value={form.aporte_motivo}
                        onChange={e => setForm(f => ({ ...f, aporte_motivo: e.target.value as FormState['aporte_motivo'] }))}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={inputStyle}
                      >
                        <option value="aporte">Aporte</option>
                        <option value="excedentes">Excedentes</option>
                        <option value="absorvidas">Absorvidas</option>
                      </select>
                    </div>

                    {/* Data do aporte */}
                    <div>
                      <label className={labelCls}>Data do aporte <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="date"
                        value={form.aporte_data}
                        onChange={e => setForm(f => ({ ...f, aporte_data: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={inputStyle} />
                    </div>

                    {/* Descrição */}
                    <div>
                      <label className={labelCls}>Descrição</label>
                      <textarea
                        rows={3}
                        value={form.aporte_descricao}
                        onChange={e => setForm(f => ({ ...f, aporte_descricao: e.target.value }))}
                        placeholder="Detalhamento do aporte (opcional)"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40 resize-none"
                        style={inputStyle}
                      />
                    </div>

                    {/* Anexo "Proposta / Aprovação" — SÓ quando destino é projeto PAI */}
                    {!isChildTarget && (
                      <div>
                        <label className={labelCls}>Aprovação do Cliente / Proposta Assinada <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingFiles(p => [...p.filter(x => x.type !== 'proposta'), { file: f, type: 'proposta' }]); e.target.value = '' } }}
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-[var(--primary-soft)] file:text-[var(--primary)] hover:file:bg-[var(--primary-soft)] file:cursor-pointer"
                          style={inputStyle}
                        />
                        {pendProposta
                          ? <p className="text-[11px] text-[var(--success)] mt-1">✓ {pendProposta.file.name} ({Math.round(pendProposta.file.size / 1024)} KB)</p>
                          : <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>Anexe a aprovação formal — gera proposta comercial pro projeto pai (PDF, imagem, etc. — máx 20 MB)</p>
                        }
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Form padrão (contrato comum) — só quando NÃO é aporte ── */}
              {!form.is_aporte && (<>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls} style={{ marginBottom: 0 }}>Cliente *</label>
                  <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[var(--primary)] hover:text-[var(--primary)] transition-colors">
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

              {/* Toggle subprojeto — logo após cliente, sempre visível */}
              {form.customer_id && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_subproject: !f.is_subproject, sub_seq: '', parent_project_id: '' }))}
                    className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                    style={{ background: form.is_subproject ? 'var(--brand-primary)' : 'rgba(255,255,255,0.12)' }}
                  >
                    <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-[var(--surface)] shadow transition-transform"
                      style={{ transform: form.is_subproject ? 'translateX(16px)' : 'translateX(0)' }} />
                  </button>
                  <label className="text-sm cursor-pointer select-none"
                    style={{ color: form.is_subproject ? 'var(--brand-primary)' : 'var(--brand-subtle)' }}
                    onClick={() => setForm(f => ({ ...f, is_subproject: !f.is_subproject, sub_seq: '', parent_project_id: '' }))}>
                    É subprojeto
                  </label>
                </div>
              )}

              {/* Código do Projeto */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-light)] mb-2">Código do Projeto</p>
                {codePrefix ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center select-none"
                        style={{ ...inputStyle, opacity: 0.5, minWidth: '4.5rem' }}>
                        {codePrefix}
                      </div>
                      <input type="text" maxLength={3} placeholder="001"
                        value={form.code_seq}
                        onChange={e => { setForm(f => ({ ...f, code_seq: e.target.value.replace(/\D/g, '').slice(0, 3) })); setCodeExists(false) }}
                        onBlur={checkCodeExists}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={{ ...inputStyle, width: '5rem' }} />
                      <span className="text-[var(--text-light)] text-sm font-mono">-</span>
                      <input type="text" maxLength={2} placeholder="26"
                        value={form.code_year}
                        onChange={e => setForm(f => ({ ...f, code_year: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                        onBlur={checkCodeExists}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={{ ...inputStyle, width: '4rem' }} />
                      {form.is_subproject && (
                        <>
                          <span className="text-[var(--text-light)] text-sm font-mono">-</span>
                          <input type="text" maxLength={2} placeholder="01"
                            value={form.sub_seq}
                            onChange={e => { setForm(f => ({ ...f, sub_seq: e.target.value.replace(/\D/g, '').slice(0, 2) })); setCodeExists(false) }}
                            onBlur={checkCodeExists}
                            className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                            style={{ ...inputStyle, width: '4rem' }} />
                        </>
                      )}
                      {codePreview && (
                        <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                          {codePreview}{form.is_subproject && !form.sub_seq.trim() ? '-??' : ''}
                        </span>
                      )}
                      {!form.code_seq && (
                        <span className="text-xs text-[var(--text-light)] italic">deixe vazio para gerar automaticamente</span>
                      )}
                    </div>
                    {codeChecking && <p className="text-[11px] text-[var(--text-light)]">Verificando código...</p>}
                    {codeExists && !codeChecking && (
                      <p className="text-[11px] text-[var(--danger)]">⚠ Código <span className="font-mono font-semibold">{codePreview}</span> já existe em outro projeto.</p>
                    )}
                  </div>
                ) : form.customer_id ? (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={inputStyle}>
                    <span className="text-xs text-[var(--warning)] italic flex-1">Cliente sem prefixo configurado</span>
                    <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:opacity-80 shrink-0"
                      style={{ background: 'var(--brand-primary)', color: 'var(--primary-fg)' }}>
                      Configurar prefixo
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] italic">Selecione um cliente para ver o código</p>
                )}
              </div>

              {/* Nome do Projeto */}
              <div>
                <label className={labelCls}>Nome do Projeto <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  placeholder="Nome do projeto"
                  value={(form as any).project_name ?? ''}
                  onChange={e => setForm(f => ({ ...f, project_name: e.target.value } as any))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                  style={{ ...inputStyle, ...(!(form as any).project_name?.trim() ? { borderColor: 'rgba(239,68,68,0.5)' } : {}) }}
                />
              </div>

              {/* Projeto Pai */}
              {form.customer_id && form.is_subproject && (
                <div>
                  <label className={labelCls}>Projeto Pai <span style={{ color: '#ef4444' }}>*</span></label>
                  {parentProjects.length === 0
                    ? <p className="text-xs text-[var(--warning)] italic px-3 py-2 rounded-lg" style={inputStyle}>Nenhum projeto pai disponível para este cliente</p>
                    : <SearchSelect
                        value={(form as any).parent_project_id ?? ''}
                        onChange={v => setForm(f => ({ ...f, parent_project_id: v } as any))}
                        options={parentProjects}
                        placeholder="Selecionar projeto pai..."
                      />
                  }
                </div>
              )}

              {/* Aprovação do Cliente / Proposta Assinada — mesmo campo da criação */}
              <div>
                <label className={labelCls}>Aprovação do Cliente / Proposta Assinada</label>
                {internalEdit && internalEdit.attachments.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {internalEdit.attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={13} className="shrink-0 text-[var(--text-muted)]" />
                          <div className="min-w-0">
                            <p className="text-xs truncate text-[var(--text)]">{att.original_name}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{ATTACHMENT_TYPE_LABEL[att.type]} · {fmt(att.size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => downloadAttachment(internalEdit.id, att)} className="p-1 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"><Download size={13} /></button>
                          <button type="button" onClick={() => deleteAttachment(internalEdit.id, att.id)} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingFiles(p => [...p.filter(x => x.type !== 'proposta'), { file: f, type: 'proposta' }]); e.target.value = '' } }}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-[var(--primary-soft)] file:text-[var(--primary)] hover:file:bg-[var(--primary-soft)] file:cursor-pointer"
                  style={inputStyle}
                />
                {(() => {
                  const pend = pendingFiles.find(p => p.type === 'proposta')
                  if (pend) return <p className="text-[11px] text-[var(--success)] mt-1">✓ {pend.file.name} ({Math.round(pend.file.size / 1024)} KB)</p>
                  if (autoProposta) return <p className="text-[11px] text-[var(--success)] mt-1">✓ A proposta assinada será anexada automaticamente ao gerar o contrato.</p>
                  if (internalEdit && internalEdit.attachments.length > 0) return <p className="text-[10px] mt-1 text-[var(--text-muted)]">Selecione um arquivo para substituir/adicionar.</p>
                  return <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>Anexe a aprovação formal (PDF, imagem ou e-mail exportado) — máx 20 MB</p>
                })()}
              </div>
              </>)}
            </div>
          )}

          {/* Tab 1: Classificação (oculta quando is_aporte) */}
          {activeTab === 1 && !form.is_aporte && (
            <div>
              <label className={labelCls}>Tipo de Serviço</label>
              <SearchSelect
                value={form.service_type_id}
                onChange={v => {
                  const stName = (serviceTypes.find(s => String(s.id) === String(v))?.name ?? '').toLowerCase()
                  const isSust = stName.includes('cloud') || stName.includes('bizify')
                    || stName.includes('sustentacao') || stName.includes('sustentação')
                  setForm(f => ({ ...f, service_type_id: v, categoria: isSust ? 'sustentacao' : 'projeto' }))
                }}
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
                {allowedForService(
                  contractTypes,
                  serviceTypes.find(s => String(s.id) === String(form.service_type_id))?.name,
                  form.contract_type_id,
                  !!form.is_subproject,
                ).map(ct => (
                  <label key={ct.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="contract_type_id" value={ct.id}
                      checked={String(form.contract_type_id) === String(ct.id)}
                      onChange={() => setForm(f => ({ ...f, contract_type_id: String(ct.id) }))} />
                    <span className="text-sm text-[var(--text)]">{ct.name}</span>
                  </label>
                ))}
                {contractTypes.length === 0 && (
                  <p className="text-xs text-[var(--text-light)]">Carregando tipos de contrato...</p>
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
                <span className="text-sm text-[var(--text)]">Cobrar despesas do cliente</span>
              </label>
              {form.cobra_despesa_cliente && (
                <div>
                  <label className={labelCls}>Limite de despesas (R$)</label>
                  <input type="number" min="0" step="0.01" placeholder="Ex: 5000.00"
                    value={form.limite_despesa}
                    onChange={e => setForm(f => ({ ...f, limite_despesa: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                  <p className="text-xs text-[var(--text-light)] mt-1">Deixe em branco para sem limite.</p>
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
                      <span className="text-sm text-[var(--text)] capitalize">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Horas e datas */}
              <div className="grid grid-cols-2 gap-4">
                {!isOnDemand && !isMensalidade && (
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

              {/* Valores e Horas */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-light)] mb-3">Valores e Horas</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>
                      {isMensalidade ? 'Valor do Contrato (R$) — mensalidade' : 'Valor do Projeto (R$)'}
                      {(isMensalidade || isOnDemand) && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
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
                  {!isMensalidade && !isOnDemand && (
                    <div>
                      <label className={labelCls}>Valor da Hora (R$)</label>
                      <input type="number" min="0" step="0.01" placeholder="0,00"
                        value={form.valor_hora}
                        onChange={e => {
                          const vh = e.target.value
                          const h = Number(form.horas_contratadas)
                          const vp = vh && h > 0 ? String((Number(vh) * h).toFixed(2)) : form.valor_projeto
                          setForm(f => ({ ...f, valor_hora: vh, valor_projeto: vp }))
                        }}
                        className={inputCls} style={inputStyle} />
                    </div>
                  )}
                  {!isOnDemand && !isMensalidade && (
                    <div>
                      <label className={labelCls}>Hora Adicional (R$)</label>
                      <input type="number" min="0" step="0.01" placeholder="0,00"
                        value={form.hora_adicional}
                        onChange={e => setForm(f => ({ ...f, hora_adicional: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                    </div>
                  )}
                  {(isFechado || isBhFixo) && (
                    <div>
                      <label className={labelCls}>Percentual Gestão (%)</label>
                      <input type="number" min="0" max="100" step="1" placeholder="0"
                        value={form.pct_horas_coordenador}
                        onChange={e => { setGestaoDraft(null); setForm(f => ({ ...f, pct_horas_coordenador: e.target.value })) }}
                        className={inputCls} style={inputStyle} />
                    </div>
                  )}
                  {(isFechado || isBhFixo) && (() => {
                    // Horas de Gestão = (Percentual Gestão / 100) × Horas Vendidas (contratadas).
                    // Bidirecional: editar aqui recalcula o %; editar o % recalcula isto.
                    const base = Number(form.horas_contratadas) || 0
                    const pct  = Number(form.pct_horas_coordenador) || 0
                    const derived = base > 0 ? Math.round((pct / 100) * base * 100) / 100 : 0
                    const shown = gestaoDraft ?? (derived ? String(derived) : '')
                    return (
                      <div>
                        <label className={labelCls}>Horas de Gestão</label>
                        <input type="number" min="0" step="0.5" placeholder="0" disabled={base <= 0}
                          value={shown}
                          onChange={e => {
                            const v = e.target.value
                            setGestaoDraft(v)
                            const h = Number(v) || 0
                            if (base > 0) setForm(f => ({ ...f, pct_horas_coordenador: String(Math.round((h / base) * 100 * 100) / 100) }))
                          }}
                          onBlur={() => setGestaoDraft(null)}
                          className={inputCls} style={inputStyle} />
                        <p className="text-[10px] mt-1 text-[var(--text-light)]">
                          {base > 0 ? `${pct || 0}% de ${base}h (vendidas)` : 'Informe Horas Contratadas para calcular'}
                        </p>
                      </div>
                    )
                  })()}
                  {(isFechado || isBhFixo) && (
                    <div>
                      <label className={labelCls}>Horas Consultor</label>
                      <input type="number" min="0" step="1" placeholder="0"
                        value={form.horas_consultor}
                        onChange={e => setForm(f => ({ ...f, horas_consultor: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                    </div>
                  )}
                  {(isFechado || isBhFixo) && (() => {
                    // Saving ERPSERV = Horas Vendidas − Consultor − Horas de Gestão (% × Vendidas).
                    const sold    = Number(form.horas_contratadas) || 0
                    const consult = Number(form.horas_consultor) || 0
                    const pct     = Number(form.pct_horas_coordenador) || 0
                    const gestao  = sold > 0 ? (pct / 100) * sold : 0
                    const sobra   = Math.round((sold - consult - gestao) * 100) / 100
                    return (
                      <div>
                        <label className={labelCls}>Saving ERPSERV</label>
                        <input readOnly tabIndex={-1} value={`${sobra}h`}
                          className={inputCls} style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }} />
                      </div>
                    )
                  })()}
                  {(isFechado || isBhFixo) && (
                    <div>
                      <label className={labelCls}>Horas Apontáveis <span className="text-[var(--danger)]">*</span></label>
                      <input type="number" min="0" step="0.5" placeholder="0"
                        value={form.horas_coordenacao}
                        onChange={e => setForm(f => ({ ...f, horas_coordenacao: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                      <p className="text-[10px] mt-1 text-[var(--text-light)]">Banco de horas apontáveis. Copiado pro projeto ao gerar.</p>
                      {form.horas_coordenacao !== '' && form.horas_contratadas !== '' && Number(form.horas_coordenacao) > Number(form.horas_contratadas) && (
                        <p className="text-[10px] mt-1 text-[var(--danger)]">Não pode exceder as horas vendidas ({form.horas_contratadas}h).</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Contatos */}
          {activeTab === 5 && (
            <div className="space-y-4">
              {/* Cadastro do cliente: UM botão (cadastra inline + grava no cadastro do cliente
                  ao salvar, sem sair da página). Legenda quando não há cadastro; busca quando há. */}
              {!form.customer_id ? (
                <p className="text-xs text-[var(--text-muted)] py-2 text-center">Selecione um cliente na aba Cliente para carregar os contatos do cadastro.</p>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-light)]">Do cadastro do cliente</p>
                    <button onClick={addContact}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium shrink-0"
                      style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)', color: 'var(--primary)' }}>
                      <Plus size={10} /> Adicionar contato
                    </button>
                  </div>
                  {customerContacts.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)]">Nenhum contato cadastrado para este cliente. Use “Adicionar contato” para cadastrar — será gravado no cadastro do cliente ao salvar.</p>
                  ) : (
                    <>
                      <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                        placeholder="Buscar contato do cadastro..."
                        className={inputCls} style={inputStyle} />
                      <div className="space-y-1.5 mt-2">
                        {customerContacts
                          .filter(cc => {
                            const q = contactSearch.trim().toLowerCase()
                            return !q || (cc.name ?? '').toLowerCase().includes(q) || (cc.email ?? '').toLowerCase().includes(q) || (cc.cargo ?? '').toLowerCase().includes(q)
                          })
                          .map(cc => {
                            const alreadyAdded = contacts.some(c => c.name === cc.name && c.email === cc.email)
                            return (
                              <div key={cc.id}
                                className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors"
                                style={{
                                  borderColor: alreadyAdded ? 'var(--primary)' : 'var(--brand-border)',
                                  background: alreadyAdded ? 'var(--primary-soft)' : 'transparent',
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
                                  <p className="text-xs font-medium text-[var(--text)]">{cc.name}</p>
                                  <p className="text-[10px] text-[var(--text-light)]">{[cc.cargo, cc.email].filter(Boolean).join(' · ')}</p>
                                </div>
                                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                  style={{ background: alreadyAdded ? 'var(--primary)' : 'transparent', border: alreadyAdded ? 'none' : '1px solid #52525b' }}>
                                  {alreadyAdded && <CheckCircle size={12} style={{ color: '#000' }} />}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Contatos adicionados */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-light)]">
                    Contatos selecionados ({contacts.length})
                  </p>
                </div>
                {contacts.length === 0 && <p className="text-xs text-[var(--text-muted)] py-2 text-center">Nenhum contato selecionado.</p>}
                {contacts.map((ct, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2 mb-2" style={{ borderColor: 'var(--brand-border)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text)]">Contato {i + 1}</span>
                      <button onClick={() => removeContact(i)} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"><X size={12} /></button>
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
                <span className="ml-1 text-[var(--warning)] text-[10px]">(recomendado — será copiado integralmente ao projeto)</span>
              </label>
              <textarea value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                rows={10} placeholder="Descreva o escopo, premissas, restrições, responsabilidades e qualquer informação relevante para o projeto..."
                className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{form.observacoes.length} caracteres</p>
            </div>
          )}

          {/* Tab 9: Anexos */}
          {activeTab === 9 && attachmentSection}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            {!form.is_aporte && activeTab > 0 && (
              <button onClick={() => setActiveTab(t => t - 1)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white transition-colors" style={{ border: '1px solid var(--brand-border)' }}>
                ← Anterior
              </button>
            )}
            {!form.is_aporte && activeTab < TABS.length - 1 && (
              <button onClick={() => setActiveTab(t => t + 1)} className="px-4 py-2 rounded-lg text-sm text-[var(--text)] hover:text-white transition-colors" style={{ border: '1px solid var(--brand-border)' }}>
                Próximo →
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white transition-colors">
              Cancelar
            </button>
            {(form.is_aporte || internalEdit || activeTab === TABS.length - 1) && (
              <button onClick={save} disabled={saving || uploading || codeExists}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: form.is_aporte ? 'rgba(34,197,94,0.15)' : 'var(--primary-soft)',
                  border: `1px solid ${form.is_aporte ? 'rgba(34,197,94,0.45)' : 'var(--primary)'}`,
                  color: form.is_aporte ? '#22c55e' : 'var(--primary)',
                }}>
                {saving ? 'Salvando...' : uploading ? 'Enviando arquivos...' : form.is_aporte ? 'Criar aporte' : internalEdit ? 'Salvar alterações' : 'Criar contrato'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
