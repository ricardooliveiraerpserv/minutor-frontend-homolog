'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '@/lib/api'
import { uploadDirect } from '@/lib/upload'
import { toast } from 'sonner'
import { Plus, X, CheckCircle, ExternalLink } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractContact { name: string; cargo: string; email: string; phone: string }
interface CustomerContact { id: number; customer_id: number; name: string; cargo: string; email: string; phone: string }
interface SelectOption { id: number | string; name: string; code_prefix?: string | null }

type FormState = {
  customer_id: string
  project_name: string
  is_subproject: boolean
  sera_faturado: boolean   // subprojeto faturado → gera card de aporte (Novo Contrato) no pai
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
  // Aporte v2 — toggle "É aporte?" no topo (cria hour_contribution, não contrato)
  is_aporte: boolean
  aporte_target_project_id: string
  aporte_horas: string
  aporte_valor_hora: string
  aporte_motivo: 'aporte' | 'excedentes' | 'absorvidas'
  aporte_descricao: string
  aporte_data: string
  // Aditivo — toggle "É aditivo?" (altera projeto pai/independente existente)
  is_aditivo: boolean
  aditivo_target_project_id: string
  aditivo_field: '' | 'valor_hora' | 'horas_contratadas' | 'valor_projeto'
  aditivo_value: string
  aditivo_effective_from: string // YYYY-MM (vigência; só valor_hora/horas)
  // Multi-alteração (Banco de Horas Mensal): novo valor-hora e/ou novas horas no mesmo aditivo.
  aditivo_m_rate: string
  aditivo_m_horas: string
}

const CURRENT_YEAR_2D = new Date().getFullYear().toString().slice(-2)

const EMPTY_FORM: FormState = {
  customer_id: '', project_name: '', is_subproject: false, sera_faturado: false, sub_seq: '', parent_project_id: '',
  code_seq: '', code_year: CURRENT_YEAR_2D,
  categoria: 'projeto', service_type_id: '', contract_type_id: '',
  cobra_despesa_cliente: false, limite_despesa: '',
  architect_id: '', tipo_alocacao: 'remoto',
  horas_contratadas: '', valor_projeto: '', valor_hora: '',
  hora_adicional: '', pct_horas_coordenador: '', horas_coordenacao: '', horas_consultor: '',
  expectativa_inicio: '', condicao_pagamento: '',
  executivo_conta_id: '', vendedor_id: '', observacoes: '',
  is_aporte: false, aporte_target_project_id: '', aporte_horas: '',
  aporte_valor_hora: '', aporte_motivo: 'aporte', aporte_descricao: '', aporte_data: '',
  is_aditivo: false, aditivo_target_project_id: '', aditivo_field: '',
  aditivo_value: '', aditivo_effective_from: new Date().toISOString().slice(0, 7),
  aditivo_m_rate: '', aditivo_m_horas: '',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onSuccess: (contractId: number) => void
  initialCustomerId?: number | string
  initialProjectName?: string
  initialParentProjectId?: number | string
  initialSubSeq?: string
  title?: string
  customerReadOnly?: boolean
  excludeSustentacao?: boolean
}

const isSustentacaoName = (name: string) => {
  const n = name.toLowerCase()
  return n.includes('sustentacao') || n.includes('sustentação')
    || n.includes('cloud') || n.includes('bizify')
    || n.includes('banco de horas') || n.includes('on demand') || n.includes('saas')
}

// Regra de combinação Tipo de Serviço × Tipo de Contrato:
// - Projeto     → permite: BH Fixo, BH Mensal, Fechado, On Demand (proíbe: SaaS, Cloud)
// - Sustentação → permite: BH Fixo, BH Mensal, On Demand, Cloud   (proíbe: Fechado, SaaS)
// - Bizify      → permite: BH Fixo, Fechado, On Demand, SaaS      (proíbe: BH Mensal, Cloud)
// Subprojeto (filho) → adicionalmente proíbe BH Mensal, SaaS e Cloud (mensalidade
// fica no projeto pai; filho herda regra de cobrança). Filho On Demand consome
// do pai via apontamentos (horas_contratadas=0, valor cobrado por hora apontada).
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ContractCreateModal({
  onClose, onSuccess,
  initialCustomerId, initialProjectName, initialParentProjectId, initialSubSeq,
  title = 'Novo Contrato',
  customerReadOnly = false,
  excludeSustentacao = false,
}: Props) {
  const TABS = ['Cliente', 'Classificação', 'Faturamento', 'Despesas', 'Operacional', 'Contatos', 'Financeiro', 'Comercial', 'Observações']
  const [activeTab, setActiveTab] = useState(customerReadOnly ? 1 : 0)
  const [saving, setSaving] = useState(false)
  const [clientApprovalFile, setClientApprovalFile] = useState<File | null>(null)

  const [customers, setCustomers]         = useState<SelectOption[]>([])
  const [users, setUsers]                 = useState<SelectOption[]>([])
  const [serviceTypes, setServiceTypes]   = useState<SelectOption[]>([])
  const [contractTypes, setContractTypes] = useState<SelectOption[]>([])
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([])
  const [parentProjects, setParentProjects]     = useState<SelectOption[]>([])
  // Aporte v2 — TODOS os projetos do cliente (pai + filho) usado no select do aporte.
  // `hourly_rate` é o do projeto; pra FILHO, usamos `parent_hourly_rate` (herdado do pai).
  const [aporteProjects, setAporteProjects] = useState<Array<{ id: string; name: string; is_child: boolean; parent_code?: string; parent_name?: string; hourly_rate?: number | null; parent_hourly_rate?: number | null }>>([])
  // Aditivo — projetos pai/independente (On Demand/Cloud/Mensal) elegíveis + o que cada um permite alterar.
  type AditivoProj = { id: number; code: string; name: string; type_code: string; type_name: string | null; allowed_fields: string[]; hourly_rate: number | null; sold_hours: number | null; project_value: number | null }
  const [aditivoProjects, setAditivoProjects] = useState<AditivoProj[]>([])
  const [pendingProposta, setPendingProposta] = useState<File | null>(null)

  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    customer_id:       initialCustomerId       ? String(initialCustomerId)       : '',
    project_name:      initialProjectName      ?? '',
    parent_project_id: initialParentProjectId  ? String(initialParentProjectId)  : '',
    is_subproject:     !!initialParentProjectId,
    sub_seq:           initialSubSeq           ?? '',
  })
  const [contacts, setContacts] = useState<ContractContact[]>([])
  const [codeExists, setCodeExists]   = useState(false)
  const [codeChecking, setCodeChecking] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [parentBalance, setParentBalance] = useState<{ balance: number; allow_negative: boolean } | null>(null)
  const [parentBalanceLoading, setParentBalanceLoading] = useState(false)

  // ── Load master data ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!customerReadOnly) {
      api.get<any>('/customers?pageSize=500').then(r => setCustomers(r?.items ?? r ?? [])).catch(() => {})
    }
    api.get<any>('/users?pageSize=500').then(r => setUsers(r?.items ?? r ?? [])).catch(() => {})
    api.get<any>('/service-types?pageSize=100').then(r => setServiceTypes(r?.items ?? r?.data ?? r ?? [])).catch(() => {})
    api.get<any>('/contract-types?pageSize=100').then(r => setContractTypes(r?.items ?? r?.data ?? r ?? [])).catch(() => {})
  }, [customerReadOnly])

  // When a parent project is selected, lock code fields to match the parent's code
  useEffect(() => {
    if (!form.is_subproject || !form.parent_project_id) return
    const parent = parentProjects.find(p => String(p.id) === String(form.parent_project_id))
    const code = parent?.code_prefix  // e.g. "AAM002-26"
    if (!code) return
    const match = code.match(/^[A-Za-z]+(\d+)-(\d+)$/)
    if (!match) return
    setForm(f => ({ ...f, code_seq: match[1], code_year: match[2] }))
  }, [form.parent_project_id, form.is_subproject, parentProjects])

  useEffect(() => {
    if (!form.parent_project_id) { setParentBalance(null); return }
    setParentBalanceLoading(true)
    api.get<any>(`/projects/${form.parent_project_id}`)
      .then(r => {
        const balance = r.general_hours_balance ?? ((r.sold_hours ?? 0) - (r.consumed_hours ?? 0))
        setParentBalance({ balance, allow_negative: r.allow_negative_balance ?? false })
        // Auto-preenche valor_hora com o do projeto pai
        if (r.hourly_rate) {
          const hr = Number(r.hourly_rate)
          setForm(f => {
            const hs = Number(f.horas_contratadas)
            return {
              ...f,
              valor_hora: String(hr),
              valor_projeto: hs > 0 ? String(+(hr * hs).toFixed(2)) : f.valor_projeto,
            }
          })
        }
      })
      .catch(() => setParentBalance(null))
      .finally(() => setParentBalanceLoading(false))
  }, [form.parent_project_id])

  useEffect(() => {
    if (!form.customer_id) { setCustomerContacts([]); setParentProjects([]); setAporteProjects([]); return }
    api.get<CustomerContact[]>(`/customer-contacts?customer_id=${form.customer_id}`)
      .then(r => setCustomerContacts(Array.isArray(r) ? r : []))
      .catch(() => setCustomerContacts([]))
    // Projetos pausados/encerrados/cancelados não podem receber novos subprojetos nem aportes —
    // filtra todos os 3 status em ambos os dropdowns (aporte e contrato normal).
    const INACTIVE_STATUSES = new Set(['paused', 'finished', 'cancelled'])
    api.get<any>(`/projects?customer_id=${form.customer_id}&per_page=200&parent_projects_only=true`)
      .then(r => {
        const list: any[] = r?.items ?? (Array.isArray(r) ? r : [])
        setParentProjects(
          list
            .filter((p: any) => !p.parent_project_id && !INACTIVE_STATUSES.has(p.status))
            .map((p: any) => ({ id: p.id, name: p.code ? `[${p.code}] ${p.name}` : p.name, code_prefix: p.code ?? null }))
        )
      })
      .catch(() => setParentProjects([]))
    // TODOS os projetos (pai + filho) — usado pelo select do aporte.
    // Ordena pais alfabético e filhos imediatamente abaixo do pai (indented).
    api.get<any>(`/projects?customer_id=${form.customer_id}&pageSize=200`)
      .then(r => {
        const raw: any[] = r?.items ?? (Array.isArray(r) ? r : [])
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
        // Filhos órfãos (pai não está no resultset) — joga no fim
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

  // Aporte v2 — auto-preencher Valor da hora ao selecionar projeto.
  // Regra: pai → usa valor_hora dele; filho → herda valor_hora do pai.
  // Fallback: se a listagem não trouxe o rate, faz GET no projeto certo.
  useEffect(() => {
    if (!form.is_aporte || !form.aporte_target_project_id) return
    const sel = aporteProjects.find(p => p.id === form.aporte_target_project_id)
    if (!sel) return
    // Pra filho, prioriza o valor do pai; pra pai, o próprio.
    let candidate = sel.is_child ? (sel.parent_hourly_rate ?? null) : (sel.hourly_rate ?? null)
    if (candidate && candidate > 0) {
      setForm(f => ({ ...f, aporte_valor_hora: String(candidate) }))
      return
    }
    // Fallback: busca direto no projeto certo (pai se filho, próprio se pai)
    let cancelled = false
    // pra filho preciso descobrir o id do pai. Como guardo só parent_code/name, vou fetcher pelo project_id
    api.get<any>(`/projects/${form.aporte_target_project_id}`)
      .then(p => {
        if (cancelled) return
        const ownRate = Number(p?.hourly_rate ?? p?.valor_hora ?? 0)
        if (sel.is_child && p?.parent_project_id) {
          // Busca o pai pra herdar o rate
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

  // Aditivo: carrega projetos pai/independente elegíveis (On Demand/Cloud/Mensal),
  // filtrando pelo cliente quando escolhido.
  useEffect(() => {
    if (!form.is_aditivo) { setAditivoProjects([]); return }
    let cancelled = false
    const qs = form.customer_id ? `?customer_id=${form.customer_id}` : ''
    api.get<{ data: AditivoProj[] }>(`/contracts/aditivo/eligible-projects${qs}`)
      .then(r => { if (!cancelled) setAditivoProjects(Array.isArray(r?.data) ? r.data : []) })
      .catch(() => { if (!cancelled) setAditivoProjects([]) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.is_aditivo, form.customer_id])

  // Sugere próximo code_seq quando customer muda (modo projeto raiz)
  useEffect(() => {
    if (!form.customer_id || form.is_subproject) return
    api.get<{ seq?: string; year?: string }>(`/projects/next-code?customer_id=${form.customer_id}`)
      .then(r => {
        if (r?.seq) setForm(f => ({ ...f, code_seq: r.seq!, code_year: r.year ?? f.code_year }))
      })
      .catch(() => {})
  }, [form.customer_id, form.is_subproject])

  // Sugere próximo sub_seq quando projeto pai muda (modo subprojeto)
  useEffect(() => {
    if (!form.is_subproject || !form.parent_project_id) return
    api.get<{ sub_seq?: string }>(`/projects/next-code?parent_project_id=${form.parent_project_id}`)
      .then(r => {
        if (r?.sub_seq) setForm(f => ({ ...f, sub_seq: r.sub_seq! }))
      })
      .catch(() => {})
  }, [form.parent_project_id, form.is_subproject])

  // Subprojeto herda a REGRA DE DESPESAS do projeto pai (read-only no form de filho).
  useEffect(() => {
    if (!form.is_subproject || !form.parent_project_id) return
    let cancelled = false
    api.get<any>(`/projects/${form.parent_project_id}`)
      .then(p => {
        if (cancelled || !p) return
        setForm(f => ({
          ...f,
          cobra_despesa_cliente: !!(p.cobra_despesa_cliente ?? false),
          limite_despesa: p.limite_despesa != null ? String(p.limite_despesa) : '',
        }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.is_subproject, form.parent_project_id])

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedContractType = useMemo(
    () => contractTypes.find(t => String(t.id) === String(form.contract_type_id)),
    [contractTypes, form.contract_type_id]
  )
  const isOnDemand = selectedContractType?.name.toLowerCase().trim() === 'on demand'
  const isBankHours = selectedContractType?.name.toLowerCase().includes('banco de horas') ?? false
  const ctNameLower = selectedContractType?.name.toLowerCase().trim() ?? ''
  const isBhFixo = isBankHours && ctNameLower.includes('fixo')
  // BH Mensal: banco de horas que não é fixo. Não tem horas de coordenador.
  const isBhMensal = isBankHours && !isBhFixo
  // Mensalidade: Cloud e SaaS — só "Valor do Contrato" como mensalidade fixa.
  const isMensalidade = ctNameLower === 'cloud' || ctNameLower === 'saas'
  const isFechado = !!selectedContractType && !isOnDemand && !isBankHours && !isMensalidade

  // "Horas de Gestão" é derivado do Percentual Gestão sobre as Horas Vendidas
  // (contratadas). Draft local pra digitar suave; quando null, mostra o derivado.
  const [gestaoDraft, setGestaoDraft] = useState<string | null>(null)

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

  // ── Contacts ──────────────────────────────────────────────────────────────

  const addContact = () => setContacts(c => [...c, { name: '', cargo: '', email: '', phone: '' }])
  const updateContact = (i: number, field: keyof ContractContact, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))

  // ── Tab validation ────────────────────────────────────────────────────────

  const validateCurrentTab = (): boolean => {
    switch (activeTab) {
      case 0: // Cliente
        if (!form.customer_id)          { toast.error('Selecione o cliente'); return false }
        if (!form.project_name.trim())  { toast.error('Informe o nome do projeto'); return false }
        if (!clientApprovalFile)        { toast.error('Anexe a aprovação do cliente / proposta assinada'); return false }
        return true

      case 1: // Classificação
        if (!form.service_type_id) { toast.error('Selecione o Tipo de Serviço'); return false }
        return true

      case 2: // Faturamento
        if (!form.contract_type_id) { toast.error('Selecione o Tipo de Contrato'); return false }
        return true

      case 4: // Operacional
        if (!isOnDemand && !isMensalidade && !form.horas_contratadas)        { toast.error('Informe as Horas Contratadas'); return false }
        if (!form.expectativa_inicio)                                        { toast.error('Informe a Expectativa de Início'); return false }
        if (isMensalidade && !form.valor_projeto)                            { toast.error('Informe o Valor do Contrato (mensalidade)'); return false }
        if (isOnDemand && !isMensalidade && !form.valor_projeto)             { toast.error('Informe o Valor do Projeto'); return false }
        if (!isMensalidade && !isOnDemand && !form.valor_hora)               { toast.error('Informe o Valor da Hora'); return false }
        // On Demand consome do pai por apontamento (horas_contratadas=0, cobrado por hora
        // apontada) — não reserva bloco de horas, então não valida o saldo do pai.
        if (form.parent_project_id && parentBalance && !parentBalance.allow_negative && !isOnDemand) {
          const childHours = Number(form.horas_contratadas) || 0
          if (childHours > parentBalance.balance) {
            toast.error(`Horas (${childHours.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h) excedem o saldo do projeto pai (${parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h)`)
            return false
          }
        }
        return true

      case 6: // Financeiro
        if (form.is_subproject) return true // subprojeto herda do pai
        if (!form.condicao_pagamento.trim()) { toast.error('Informe a Condição de Pagamento'); return false }
        return true

      case 8: // Observações
        if (!form.observacoes.trim()) { toast.error('Observações obrigatórias'); return false }
        return true

      default:
        return true
    }
  }

  // ── Number mask helpers ────────────────────────────────────────────────────

  const fmtBRInput = (v: string, field: string): string => {
    if (!v) return v
    if (focusedField === field) {
      // Durante digitação: exibe com vírgula como separador decimal
      return v.replace('.', ',')
    }
    const n = parseFloat(v)
    if (isNaN(n)) return v
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const parseBRInput = (v: string): string => {
    const trimmed = v.trim()
    if (!trimmed) return ''
    // Detecta se usuário ainda está digitando a parte decimal (termina com , ou .)
    const trailingDecimal = trimmed.endsWith(',') || trimmed.endsWith('.')
    const hasBoth = trimmed.includes('.') && trimmed.includes(',')
    const s = hasBoth
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed.includes(',') ? trimmed.replace(',', '.') : trimmed
    const cleaned = trailingDecimal ? s.replace(/[.,]$/, '') : s
    const n = parseFloat(cleaned)
    if (isNaN(n)) return ''
    // Preserva o ponto para permitir continuar digitando decimais
    return trailingDecimal ? String(n) + '.' : String(n)
  }

  // When extraOnChange is provided it is responsible for calling setForm (it receives the raw value).
  // When not provided, numInput calls setForm directly.
  const numInput = (field: keyof FormState, extraOnChange?: (raw: string) => void) => ({
    type: 'text' as const,
    value: fmtBRInput(form[field] as string, field),
    onFocus: () => setFocusedField(field),
    onBlur:  () => setFocusedField(null),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseBRInput(e.target.value)
      if (extraOnChange) {
        extraOnChange(raw)
      } else {
        setForm(f => ({ ...f, [field]: raw }))
      }
    },
    className: inputCls,
    style: inputStyle,
  })

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    // ── Ramo APORTE — cria hour_contribution (não cria contract/project) ──
    if (form.is_aporte) {
      if (!form.customer_id)                                              { toast.error('Selecione o cliente'); return }
      if (!form.aporte_target_project_id)                                  { toast.error('Selecione o projeto que recebe o aporte'); return }
      if (!form.aporte_horas || Number(form.aporte_horas) <= 0)            { toast.error('Informe a quantidade de horas'); return }
      if (!form.aporte_valor_hora || Number(form.aporte_valor_hora) <= 0)  { toast.error('Informe o valor da hora'); return }
      if (!form.aporte_data)                                               { toast.error('Informe a data do aporte'); return }
      const selProj = aporteProjects.find(p => p.id === form.aporte_target_project_id)
      const isChildTarget = !!selProj?.is_child
      if (!isChildTarget && !pendingProposta) {
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
        if (!isChildTarget && pendingProposta) fd.append('proposta', pendingProposta)
        await uploadDirect(`/projects/${form.aporte_target_project_id}/hour-contributions`, fd)
        toast.success(isChildTarget
          ? 'Aporte registrado no projeto filho (consumindo do saldo do pai)'
          : 'Aporte criado — card disponível no Kanban')
        // onSuccess espera um contractId; aporte não cria contract → passa 0 e o caller recarrega
        onSuccess(0)
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao criar aporte')
      } finally {
        setSaving(false)
      }
      return
    }

    // ── Ramo ADITIVO — altera projeto pai/independente (não cria projeto comum) ──
    if (form.is_aditivo) {
      if (!form.aditivo_target_project_id)                                 { toast.error('Selecione o projeto do aditivo'); return }
      const selAditProj = aditivoProjects.find(p => String(p.id) === form.aditivo_target_project_id)
      const isMensalAdit = (selAditProj?.allowed_fields?.length ?? 0) === 2 // Banco de Horas Mensal: valor-hora + horas
      if (!form.observacoes.trim())                                       { toast.error('Informe a observação'); return }
      if (!clientApprovalFile)                                            { toast.error('Anexe a aprovação do cliente / proposta assinada'); return }

      const payload: Record<string, unknown> = {
        aditivo_project_id: Number(form.aditivo_target_project_id),
        condicao_pagamento: form.condicao_pagamento || null,
        observacoes:        form.observacoes || null,
      }
      if (isMensalAdit) {
        // Mensal: valor-hora E/OU horas no mesmo aditivo — envia só os que mudaram.
        const changes: { field: string; value: number }[] = []
        if (form.aditivo_m_rate !== '' && Number(form.aditivo_m_rate) !== Number(selAditProj?.hourly_rate ?? 0)) {
          if (Number(form.aditivo_m_rate) < 0) { toast.error('Valor da hora inválido'); return }
          changes.push({ field: 'valor_hora', value: Number(form.aditivo_m_rate) })
        }
        if (form.aditivo_m_horas !== '' && Number(form.aditivo_m_horas) !== Number(selAditProj?.sold_hours ?? 0)) {
          if (Number(form.aditivo_m_horas) < 0) { toast.error('Quantidade de horas inválida'); return }
          changes.push({ field: 'horas_contratadas', value: Number(form.aditivo_m_horas) })
        }
        if (changes.length === 0) { toast.error('Altere o valor-hora e/ou a quantidade de horas'); return }
        payload.aditivo_changes        = changes
        payload.aditivo_effective_from = `${form.aditivo_effective_from}-01`
      } else {
        if (!form.aditivo_field)                                          { toast.error('Selecione o que será alterado'); return }
        if (!form.aditivo_value || Number(form.aditivo_value) <= 0)       { toast.error('Informe o novo valor'); return }
        payload.aditivo_field = form.aditivo_field
        payload.aditivo_value = Number(form.aditivo_value)
        if (form.aditivo_field !== 'valor_projeto') {
          payload.aditivo_effective_from = `${form.aditivo_effective_from}-01`
        }
      }
      setSaving(true)
      try {
        const res = await api.post<{ id: number }>('/contracts/aditivo', payload)
        // Anexa a aprovação do cliente / proposta ao contrato aditivo criado.
        if (clientApprovalFile) {
          const fd = new FormData()
          fd.append('file', clientApprovalFile)
          fd.append('type', 'aprovacao_cliente')
          // Não bloqueia o aditivo já aplicado, mas AVISA (antes falhava em silêncio).
          try { await uploadDirect(`/contracts/${res.id}/attachments`, fd) }
          catch (e: any) { toast.warning(`Aditivo aplicado, mas falha ao anexar o arquivo: ${e?.message ?? 'erro'}. Anexe manualmente na lista de contratos.`) }
        }
        toast.success('Aditivo aplicado ao projeto')
        onSuccess(res.id)
      } catch (e: any) {
        toast.error(e?.message ?? 'Erro ao criar aditivo')
      } finally {
        setSaving(false)
      }
      return
    }

    // Revalidate all required tabs before saving
    const checks: [number, () => boolean][] = [
      [0, () => !!form.customer_id && !!form.project_name.trim() && !!clientApprovalFile],
      [1, () => !!form.service_type_id],
      [2, () => !!form.contract_type_id],
      [4, () => {
        if (isMensalidade) return !!form.expectativa_inicio && !!form.valor_projeto
        if (isOnDemand)    return !!form.expectativa_inicio && !!form.valor_projeto
        return !!form.horas_contratadas && !!form.expectativa_inicio && !!form.valor_hora
      }],
      [6, () => form.is_subproject || !!form.condicao_pagamento.trim()],
      [8, () => !!form.observacoes.trim()],
    ]
    for (const [tab, check] of checks) {
      if (!check()) {
        setActiveTab(tab)
        validateCurrentTab()
        return
      }
    }

    // On Demand não reserva horas do pai (consome por apontamento) — não bloqueia por saldo.
    if (form.parent_project_id && parentBalance && !parentBalance.allow_negative && !isOnDemand) {
      const childHours = Number(form.horas_contratadas) || 0
      if (childHours > parentBalance.balance) {
        toast.error(`Horas (${childHours.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h) excedem o saldo do projeto pai (${parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h)`)
        setActiveTab(4)
        return
      }
    }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        customer_id:           Number(form.customer_id),
        project_name:          form.project_name || null,
        parent_project_id:     form.parent_project_id ? Number(form.parent_project_id) : null,
        project_code_preview:  codePreview || null,
        categoria:             form.categoria,
        service_type_id:       form.service_type_id ? Number(form.service_type_id) : null,
        contract_type_id:      form.contract_type_id ? Number(form.contract_type_id) : null,
        cobra_despesa_cliente: form.cobra_despesa_cliente,
        limite_despesa:        form.limite_despesa ? Number(form.limite_despesa) : null,
        architect_id:          form.architect_id ? Number(form.architect_id) : null,
        tipo_alocacao:         form.tipo_alocacao,
        horas_contratadas:     (isOnDemand || isMensalidade) ? 0 : Math.round(Number(form.horas_contratadas) || 0),
        valor_projeto:         form.valor_projeto ? Number(form.valor_projeto) : null,
        valor_hora:            form.valor_hora ? Number(form.valor_hora) : null,
        hora_adicional:        form.hora_adicional ? Number(form.hora_adicional) : null,
        pct_horas_coordenador: isBhMensal ? null : (form.pct_horas_coordenador ? Number(form.pct_horas_coordenador) : null),
        horas_coordenacao:     isBhMensal ? null : (form.horas_coordenacao ? Number(form.horas_coordenacao) : null),
        horas_consultor:       form.horas_consultor ? Math.round(Number(form.horas_consultor)) : null,
        expectativa_inicio:    form.expectativa_inicio || null,
        condicao_pagamento:    form.condicao_pagamento || null,
        executivo_conta_id:    form.executivo_conta_id ? Number(form.executivo_conta_id) : null,
        vendedor_id:           form.vendedor_id ? Number(form.vendedor_id) : null,
        observacoes:           form.observacoes || null,
        // Só subprojeto faturado dispara o aporte no pai.
        sera_faturado:         form.is_subproject && form.sera_faturado,
        contacts,
      }

      const contract = await api.post<{ id: number }>('/contracts', payload)

      if (clientApprovalFile) {
        const fd = new FormData()
        fd.append('file', clientApprovalFile)
        fd.append('type', 'aprovacao_cliente')
        try {
          await uploadDirect(`/contracts/${contract.id}/attachments`, fd)
        } catch (upErr: any) {
          toast.error(upErr?.message ?? 'Contrato criado, mas falha ao enviar aprovação. Anexe manualmente na edição.')
        }
      }

      toast.success('Contrato criado com sucesso')
      onSuccess(contract.id)
    } catch (e: any) {
      if (e?.data?.errors) {
        const msgs = Object.values(e.data.errors as Record<string, string[]>).flat()
        toast.error(msgs.join(' | '))
      } else {
        toast.error(e?.message ?? 'Erro ao salvar contrato')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls  = 'w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none focus:ring-1 focus:ring-cyan-500/40'
  const inputStyle = { border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--surface-sunken)' }
  const labelCls  = 'block text-xs mb-1'

  const tabOffset  = customerReadOnly ? 1 : 0
  // Abas visíveis (índices reais). Subprojeto NÃO tem aba Financeiro (índice 6) —
  // Condição de Pagamento é definida no contrato pai e herdada pelo filho.
  const hiddenTabs = form.is_subproject ? [6] : []
  const visibleTabs = TABS.map((_, i) => i).filter(i => i >= tabOffset && !hiddenTabs.includes(i))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
            {(selectedContractType || form.service_type_id) && (
              <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                {selectedContractType && <span style={{ color: 'var(--primary)' }}>{selectedContractType.name}</span>}
                {selectedContractType && form.service_type_id && <span style={{ color: 'var(--text-light)' }}>·</span>}
                {form.service_type_id && <span>{serviceTypes.find(s => String(s.id) === String(form.service_type_id))?.name}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="transition-colors" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Tabs (escondidas quando is_aporte/is_aditivo — esses forms são single-page) */}
        {!form.is_aporte && !form.is_aditivo && (
        <div className="flex border-b overflow-x-auto shrink-0" style={{ borderColor: 'var(--border)' }}>
          {visibleTabs.map((realIdx) => {
            const t = TABS[realIdx]
            return (
              <button
                key={t}
                type="button"
                disabled={activeTab !== realIdx}
                title={activeTab !== realIdx ? 'Use Próximo / Anterior para navegar' : undefined}
                className="px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0"
                style={{
                  color: activeTab === realIdx ? 'var(--text)' : 'var(--text-muted)',
                  borderBottom: activeTab === realIdx ? '2px solid var(--primary)' : '2px solid transparent',
                  cursor: activeTab === realIdx ? 'default' : 'not-allowed',
                  opacity: activeTab === realIdx ? 1 : 0.55,
                }}>
                {t}
              </button>
            )
          })}
        </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Tab 0: Cliente */}
          {activeTab === 0 && (
            <div className="space-y-5">
              {/* ── Toggle "É aporte?" — primeira opção do form (Aporte v2) ── */}
              {/* Cores via tokens do design system: o hardcode dark (white /
                  rgba branco) sumia no tema claro — título e chave invisíveis. */}
              <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                style={{ background: form.is_aporte ? 'var(--success-bg)' : 'var(--surface-sunken)',
                         border: `1px solid ${form.is_aporte ? 'var(--success-border)' : 'var(--border)'}` }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: form.is_aporte ? 'var(--success)' : 'var(--text)' }}>
                    É aporte?
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Aporte de horas em projeto existente — sem criar novo projeto/contrato.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_aporte: !f.is_aporte, is_aditivo: false }))}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors"
                  style={{ background: form.is_aporte ? 'var(--success-border)' : 'var(--text-light)' }}
                >
                  <span className="pointer-events-none inline-block h-5 w-5 mt-0.5 ml-0.5 rounded-full shadow transition-transform"
                    style={{ background: '#fff', transform: form.is_aporte ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>

              {/* ── Toggle "É aditivo?" — altera projeto pai/independente existente ── */}
              {!form.is_aporte && (
              <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                style={{ background: form.is_aditivo ? 'var(--primary-soft)' : 'var(--surface-sunken)',
                         border: `1px solid ${form.is_aditivo ? 'var(--primary)' : 'var(--border)'}` }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: form.is_aditivo ? 'var(--primary)' : 'var(--text)' }}>
                    É aditivo?
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Altera um projeto pai/independente existente (valor-hora, horas ou valor do contrato) — sem criar novo projeto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_aditivo: !f.is_aditivo, is_aporte: false }))}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors"
                  style={{ background: form.is_aditivo ? 'var(--primary)' : 'var(--text-light)' }}
                >
                  <span className="pointer-events-none inline-block h-5 w-5 mt-0.5 ml-0.5 rounded-full shadow transition-transform"
                    style={{ background: '#fff', transform: form.is_aditivo ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>
              )}

              {/* ── Form simplificado de ADITIVO ── */}
              {form.is_aditivo && (() => {
                const selProj = aditivoProjects.find(p => String(p.id) === form.aditivo_target_project_id)
                const allowed = selProj?.allowed_fields ?? []
                const fieldLabel: Record<string, string> = { valor_hora: 'Valor da Hora (R$)', horas_contratadas: 'Quantidade de Horas', valor_projeto: 'Valor do Contrato (R$)' }
                const curValue = selProj ? (form.aditivo_field === 'valor_hora' ? selProj.hourly_rate : form.aditivo_field === 'horas_contratadas' ? selProj.sold_hours : form.aditivo_field === 'valor_projeto' ? selProj.project_value : null) : null
                const usesVigencia = form.aditivo_field === 'valor_hora' || form.aditivo_field === 'horas_contratadas'
                return (
                  <div className="space-y-5">
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Cliente <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <SearchSelect
                        value={form.customer_id}
                        onChange={v => setForm(f => ({ ...f, customer_id: v, aditivo_target_project_id: '', aditivo_field: '' }))}
                        options={customers}
                        placeholder="Buscar cliente..."
                      />
                    </div>

                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Projeto (pai ou independente) <span style={{ color: 'var(--danger)' }}>*</span></label>
                      {aditivoProjects.length === 0
                        ? <p className="text-xs italic px-3 py-2 rounded-lg" style={{ ...inputStyle, color: 'var(--warning)' }}>Nenhum projeto On Demand / Cloud / Mensal {form.customer_id ? 'para este cliente' : 'disponível'}</p>
                        : <SearchSelect
                            value={form.aditivo_target_project_id}
                            onChange={v => { const p = aditivoProjects.find(x => String(x.id) === v); setForm(f => ({ ...f, aditivo_target_project_id: v, aditivo_field: (p?.allowed_fields.length === 1 ? p.allowed_fields[0] : '') as FormState['aditivo_field'], aditivo_value: '' })) }}
                            options={aditivoProjects.map(p => ({ id: String(p.id), name: `${p.code} — ${p.name} (${p.type_name})` }))}
                            placeholder="Selecionar projeto..."
                          />
                      }
                    </div>

                    {selProj && (allowed.length === 2 ? (
                      // ── Banco de Horas Mensal: multi-alteração (valor-hora E/OU horas) ──
                      (() => {
                        const newRate  = form.aditivo_m_rate  !== '' ? Number(form.aditivo_m_rate)  : Number(selProj.hourly_rate ?? 0)
                        const newHoras = form.aditivo_m_horas !== '' ? Number(form.aditivo_m_horas) : Number(selProj.sold_hours ?? 0)
                        const oldContract = Number(selProj.hourly_rate ?? 0) * Number(selProj.sold_hours ?? 0)
                        const newContract = newRate * newHoras
                        return (
                          <>
                            <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                              Banco de Horas Mensal — altere o valor-hora e/ou a quantidade de horas (impacta o valor do contrato). Preencha só o que muda.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Novo Valor da Hora (R$)</label>
                                <input type="number" min="0" step="0.01"
                                  value={form.aditivo_m_rate}
                                  onChange={e => setForm(f => ({ ...f, aditivo_m_rate: e.target.value }))}
                                  placeholder={`Atual: ${selProj.hourly_rate ?? 0}`} className={inputCls} style={inputStyle} />
                              </div>
                              <div>
                                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Nova Quantidade de Horas</label>
                                <input type="number" min="0" step="1"
                                  value={form.aditivo_m_horas}
                                  onChange={e => setForm(f => ({ ...f, aditivo_m_horas: e.target.value }))}
                                  placeholder={`Atual: ${selProj.sold_hours ?? 0}`} className={inputCls} style={inputStyle} />
                              </div>
                            </div>
                            <div>
                              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>A partir do mês <span style={{ color: 'var(--danger)' }}>*</span></label>
                              <input type="month" value={form.aditivo_effective_from} min={new Date().toISOString().slice(0, 7)}
                                onChange={e => setForm(f => ({ ...f, aditivo_effective_from: e.target.value }))}
                                className={inputCls} style={inputStyle} />
                              <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Meses anteriores não mudam.</p>
                            </div>
                            <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Valor do Contrato (mensal)</span>
                              <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                                R$ {oldContract.toFixed(2)} → R$ {newContract.toFixed(2)}
                              </span>
                            </div>
                          </>
                        )
                      })()
                    ) : (
                      // ── On Demand / Cloud: alteração única (fluxo original) ──
                      <>
                        <div>
                          <label className={labelCls} style={{ color: 'var(--text-muted)' }}>O que alterar <span style={{ color: 'var(--danger)' }}>*</span></label>
                          {allowed.length === 1 ? (
                            <div className="px-3 py-2 rounded-lg text-sm" style={{ ...inputStyle, opacity: 0.8 }}>{fieldLabel[allowed[0]]}</div>
                          ) : (
                            <select
                              value={form.aditivo_field}
                              onChange={e => setForm(f => ({ ...f, aditivo_field: e.target.value as FormState['aditivo_field'], aditivo_value: '' }))}
                              className={inputCls} style={inputStyle}
                            >
                              <option value="">Selecione...</option>
                              {allowed.map(a => <option key={a} value={a}>{fieldLabel[a]}</option>)}
                            </select>
                          )}
                        </div>

                        {form.aditivo_field && (
                          <div className={`grid ${usesVigencia ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                            <div>
                              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                                Novo {fieldLabel[form.aditivo_field]} <span style={{ color: 'var(--danger)' }}>*</span>
                              </label>
                              <input type="number" min="0" step={form.aditivo_field === 'horas_contratadas' ? '1' : '0.01'}
                                value={form.aditivo_value}
                                onChange={e => setForm(f => ({ ...f, aditivo_value: e.target.value }))}
                                placeholder={curValue != null ? `Atual: ${curValue}` : '0'} className={inputCls} style={inputStyle} />
                              {curValue != null && <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Valor atual: {curValue}</p>}
                            </div>
                            {usesVigencia && (
                              <div>
                                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>A partir do mês <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input type="month"
                                  value={form.aditivo_effective_from}
                                  min={new Date().toISOString().slice(0, 7)}
                                  onChange={e => setForm(f => ({ ...f, aditivo_effective_from: e.target.value }))}
                                  className={inputCls} style={inputStyle} />
                                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Meses anteriores não mudam.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ))}

                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Observação <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <textarea rows={3}
                        value={form.observacoes}
                        onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                        placeholder="Detalhe do aditivo"
                        className={`${inputCls} resize-none`} style={inputStyle} />
                    </div>

                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Aprovação do Cliente / Proposta Assinada <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                        onChange={e => setClientApprovalFile(e.target.files?.[0] ?? null)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:cursor-pointer"
                        style={{ ...inputStyle, ['--tw-ring-color' as any]: 'var(--primary)', ...(!clientApprovalFile ? { borderColor: 'var(--danger-border)' } : {}) }}
                      />
                      {clientApprovalFile
                        ? <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>✓ {clientApprovalFile.name} ({Math.round(clientApprovalFile.size / 1024)} KB)</p>
                        : <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Anexe a aprovação formal (PDF, imagem ou e-mail exportado) — máx 20 MB</p>
                      }
                    </div>
                  </div>
                )
              })()}

              {/* ── Form simplificado de APORTE (substitui o resto do form) ── */}
              {form.is_aporte && (() => {
                const selectedAporteProj = aporteProjects.find(p => p.id === form.aporte_target_project_id)
                const isChildTarget = !!selectedAporteProj?.is_child
                const total = (Number(form.aporte_horas) || 0) * (Number(form.aporte_valor_hora) || 0)
                return (
                  <div className="space-y-5">
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Cliente <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <SearchSelect
                        value={form.customer_id}
                        onChange={v => setForm(f => ({ ...f, customer_id: v, aporte_target_project_id: '' }))}
                        options={customers}
                        placeholder="Buscar cliente..."
                      />
                    </div>

                    {form.customer_id && (
                      <div>
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Projeto que recebe o aporte <span style={{ color: 'var(--danger)' }}>*</span></label>
                        {aporteProjects.length === 0
                          ? <p className="text-xs italic px-3 py-2 rounded-lg" style={{ ...inputStyle, color: 'var(--warning)' }}>Nenhum projeto disponível para este cliente</p>
                          : <SearchSelect
                              value={form.aporte_target_project_id}
                              onChange={v => setForm(f => ({ ...f, aporte_target_project_id: v }))}
                              options={aporteProjects.map(p => ({ id: p.id, name: p.name }))}
                              placeholder="Selecionar projeto..."
                            />
                        }
                      </div>
                    )}

                    {isChildTarget && selectedAporteProj && (
                      <div className="rounded-xl p-3 flex items-start gap-2"
                        style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
                        <span className="text-base" style={{ color: 'var(--primary)' }}>ℹ</span>
                        <div className="text-[11px]" style={{ color: 'var(--primary)' }}>
                          Este aporte será registrado no projeto <span className="font-semibold">{selectedAporteProj.name}</span>,
                          consumindo do saldo do pai <span className="font-semibold">{selectedAporteProj.parent_code} — {selectedAporteProj.parent_name}</span>.
                          <br/>
                          <span style={{ opacity: 0.85 }}>Não criará card no Kanban (cards só geram proposta comercial para projetos pai).</span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Horas <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input type="number" min="0.01" step="0.5"
                          value={form.aporte_horas}
                          onChange={e => setForm(f => ({ ...f, aporte_horas: e.target.value }))}
                          placeholder="0" className={inputCls} style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Valor da hora (R$) <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input type="number" min="0.01" step="0.01"
                          value={form.aporte_valor_hora}
                          onChange={e => setForm(f => ({ ...f, aporte_valor_hora: e.target.value }))}
                          placeholder="0,00" className={inputCls} style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Total do aporte</label>
                        <div className="px-3 py-2 rounded-lg text-sm font-semibold tabular-nums"
                          style={{ ...inputStyle, background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'var(--success-border)' }}>
                          {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Motivo do aporte <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <select
                        value={form.aporte_motivo}
                        onChange={e => setForm(f => ({ ...f, aporte_motivo: e.target.value as FormState['aporte_motivo'] }))}
                        className={inputCls} style={inputStyle}
                      >
                        <option value="aporte">Aporte</option>
                        <option value="excedentes">Excedentes</option>
                        <option value="absorvidas">Absorvidas</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Data do aporte <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input type="date"
                        value={form.aporte_data}
                        onChange={e => setForm(f => ({ ...f, aporte_data: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                    </div>

                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Descrição</label>
                      <textarea rows={3}
                        value={form.aporte_descricao}
                        onChange={e => setForm(f => ({ ...f, aporte_descricao: e.target.value }))}
                        placeholder="Detalhamento do aporte (opcional)"
                        className={`${inputCls} resize-none`} style={inputStyle}
                      />
                    </div>

                    {!isChildTarget && (
                      <div>
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Aprovação do Cliente / Proposta Assinada <span style={{ color: 'var(--danger)' }}>*</span></label>
                        {/* DS: file:* não aceita var() inline — cor do botão de arquivo via classes utilitárias tokenizadas */}
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                          onChange={e => setPendingProposta(e.target.files?.[0] ?? null)}
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:cursor-pointer"
                          style={{ ...inputStyle, ['--tw-ring-color' as any]: 'var(--primary)' }}
                        />
                        {pendingProposta
                          ? <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>✓ {pendingProposta.name} ({Math.round(pendingProposta.size / 1024)} KB)</p>
                          : <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Anexe a aprovação formal — gera proposta comercial pro projeto pai (PDF, imagem, etc. — máx 20 MB)</p>
                        }
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Form padrão (contrato comum) — só quando NÃO é aporte/aditivo ── */}
              {!form.is_aporte && !form.is_aditivo && (<>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls} style={{ marginBottom: 0, color: 'var(--text-muted)' }}>Cliente *</label>
                  {!customerReadOnly && (
                    <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] transition-colors" style={{ color: 'var(--primary)' }}>
                      <Plus size={10} /> Novo cliente <ExternalLink size={9} />
                    </a>
                  )}
                </div>
                {customerReadOnly
                  ? <div className="px-3 py-2 rounded-lg text-sm" style={{ ...inputStyle, opacity: 0.6 }}>
                      {customers.find(c => String(c.id) === String(form.customer_id))?.name ?? `Cliente #${form.customer_id}`}
                    </div>
                  : <SearchSelect
                      value={form.customer_id}
                      onChange={v => { setForm(f => ({ ...f, customer_id: v })); setCodeExists(false) }}
                      options={customers}
                      placeholder="Buscar cliente..."
                    />
                }
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Código do Projeto</p>
                {codePrefix ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center select-none"
                        style={{ ...inputStyle, opacity: 0.5, minWidth: '4.5rem' }}>{codePrefix}</div>
                      <input type="text" maxLength={3} placeholder="001"
                        value={form.code_seq}
                        onChange={e => { if (form.is_subproject && form.parent_project_id) return; setForm(f => ({ ...f, code_seq: e.target.value.replace(/\D/g, '').slice(0, 3) })); setCodeExists(false) }}
                        onBlur={checkCodeExists}
                        readOnly={form.is_subproject && !!form.parent_project_id}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={{ ...inputStyle, width: '5rem', opacity: form.is_subproject && form.parent_project_id ? 0.5 : 1 }} />
                      <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>-</span>
                      <input type="text" maxLength={2} placeholder="26"
                        value={form.code_year}
                        onChange={e => { if (form.is_subproject && form.parent_project_id) return; setForm(f => ({ ...f, code_year: e.target.value.replace(/\D/g, '').slice(0, 2) })) }}
                        onBlur={checkCodeExists}
                        readOnly={form.is_subproject && !!form.parent_project_id}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={{ ...inputStyle, width: '4rem', opacity: form.is_subproject && form.parent_project_id ? 0.5 : 1 }} />
                      {form.is_subproject && (
                        <>
                          <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>-</span>
                          <input type="text" maxLength={2} placeholder="01"
                            value={form.sub_seq}
                            onChange={e => { setForm(f => ({ ...f, sub_seq: e.target.value.replace(/\D/g, '').slice(0, 2) })); setCodeExists(false) }}
                            onBlur={checkCodeExists}
                            className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                            style={{ ...inputStyle, width: '4rem' }} />
                        </>
                      )}
                      {codePreview && (
                        <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
                          {codePreview}{form.is_subproject && !form.sub_seq.trim() ? '-??' : ''}
                        </span>
                      )}
                    </div>
                    {codeChecking && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Verificando código...</p>}
                    {codeExists && !codeChecking && (
                      <p className="text-[11px]" style={{ color: 'var(--danger)' }}>⚠ Código <span className="font-mono font-semibold">{codePreview}</span> já existe.</p>
                    )}
                  </div>
                ) : form.customer_id ? (
                  <p className="text-xs italic" style={{ color: 'var(--warning)' }}>Cliente sem prefixo configurado — código gerado automaticamente</p>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-light)' }}>Selecione um cliente para ver o código</p>
                )}
              </div>

              {/* Toggle subprojeto */}
              {form.customer_id && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_subproject: !f.is_subproject, sera_faturado: false, sub_seq: '', parent_project_id: '' }))}
                    className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                    style={{ background: form.is_subproject ? 'var(--primary)' : 'var(--border)' }}
                  >
                    <span className="pointer-events-none inline-block h-4 w-4 rounded-full shadow transition-transform"
                      style={{ background: '#fff', transform: form.is_subproject ? 'translateX(16px)' : 'translateX(0)' }} />
                  </button>
                  <label className="text-sm cursor-pointer select-none"
                    style={{ color: form.is_subproject ? 'var(--primary)' : 'var(--text-light)' }}
                    onClick={() => setForm(f => ({ ...f, is_subproject: !f.is_subproject, sera_faturado: false, sub_seq: '', parent_project_id: '' }))}>
                    É subprojeto
                  </label>
                </div>
              )}

              {form.customer_id && form.is_subproject && (
                <div className="space-y-1.5">
                  <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Projeto Pai <span style={{ color: 'var(--danger)' }}>*</span></label>
                  {parentProjects.length === 0
                    ? <p className="text-xs italic px-3 py-2 rounded-lg" style={{ ...inputStyle, color: 'var(--warning)' }}>Nenhum projeto pai disponível para este cliente</p>
                    : <SearchSelect
                        value={form.parent_project_id}
                        onChange={v => setForm(f => ({ ...f, parent_project_id: v }))}
                        options={parentProjects}
                        placeholder="Selecionar projeto pai..."
                      />
                  }
                  {form.parent_project_id && (() => {
                    const parent = parentProjects.find(p => String(p.id) === String(form.parent_project_id))
                    const code = parent?.code_prefix
                    if (!code) return null
                    return (
                      <p className="text-xs font-mono px-1 mt-0.5" style={{ color: 'var(--text-light)' }}>
                        Código do pai: <span className="font-semibold" style={{ color: 'var(--primary)' }}>{code}</span>
                        {' '}→ subprojeto será{' '}
                        <span className="font-semibold" style={{ color: 'var(--text)' }}>
                          {code}-{form.sub_seq ? form.sub_seq.padStart(2, '0') : '??'}
                        </span>
                      </p>
                    )
                  })()}
                </div>
              )}

              {/* Subprojeto faturado: cria também um card de APORTE em "Novo Contrato" no projeto pai,
                  valorado pelas horas × valor-hora deste subprojeto. */}
              {form.customer_id && form.is_subproject && (
                <div className="rounded-lg p-3" style={{ background: form.sera_faturado ? 'var(--success-bg)' : 'var(--surface-sunken)', border: `1px solid ${form.sera_faturado ? 'var(--success-border)' : 'var(--border)'}` }}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, sera_faturado: !f.sera_faturado }))}
                      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                      style={{ background: form.sera_faturado ? 'var(--success)' : 'var(--border)' }}
                    >
                      <span className="pointer-events-none inline-block h-4 w-4 rounded-full shadow transition-transform"
                        style={{ background: '#fff', transform: form.sera_faturado ? 'translateX(16px)' : 'translateX(0)' }} />
                    </button>
                    <label className="text-sm cursor-pointer select-none font-medium"
                      style={{ color: form.sera_faturado ? 'var(--success)' : 'var(--text-light)' }}
                      onClick={() => setForm(f => ({ ...f, sera_faturado: !f.sera_faturado }))}>
                      Será faturado?
                    </label>
                  </div>
                  {form.sera_faturado && (
                    <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                      Será criado um card de <b>Aporte</b> em <b>Novo Contrato</b> no projeto pai, com as horas e o valor-hora deste subprojeto (além do card do filho em Início Autorizado).
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Nome do Projeto <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input type="text" placeholder="Nome do projeto"
                  value={form.project_name}
                  onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                  style={{ ...inputStyle, ...(!form.project_name.trim() ? { borderColor: 'var(--danger-border)' } : {}) }} />
              </div>

              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Aprovação do Cliente / Proposta Assinada <span style={{ color: 'var(--danger)' }}>*</span></label>
                {/* DS: file:* não aceita var() inline — cor do botão de arquivo via classes utilitárias tokenizadas */}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                  onChange={e => setClientApprovalFile(e.target.files?.[0] ?? null)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:cursor-pointer"
                  style={{ ...inputStyle, ['--tw-ring-color' as any]: 'var(--primary)', ...(!clientApprovalFile ? { borderColor: 'var(--danger-border)' } : {}) }}
                />
                {clientApprovalFile
                  ? <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>✓ {clientApprovalFile.name} ({Math.round(clientApprovalFile.size / 1024)} KB)</p>
                  : <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Anexe a aprovação formal (PDF, imagem ou e-mail exportado) — máx 20 MB</p>
                }
              </div>

              </>)}
            </div>
          )}

          {/* Tab 1: Classificação (oculta quando is_aporte) */}
          {activeTab === 1 && !form.is_aporte && (
            <div className="space-y-4">
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                  Tipo de Serviço <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <SearchSelect
                  value={form.service_type_id}
                  onChange={v => setForm(f => ({ ...f, service_type_id: v }))}
                  options={(excludeSustentacao ? serviceTypes.filter(s => !isSustentacaoName(String(s.name))) : serviceTypes).filter(s => !String(s.name ?? '').toLowerCase().includes('arquitetura'))}
                  placeholder="Selecionar tipo de serviço..."
                />
                {!form.service_type_id && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Obrigatório</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Faturamento */}
          {activeTab === 2 && (
            <div>
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                Tipo de Contrato <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div className="space-y-2">
                {(() => {
                  const base = excludeSustentacao
                    ? contractTypes.filter(ct => !isSustentacaoName(String(ct.name)))
                    : contractTypes
                  const serviceName = serviceTypes.find(s => String(s.id) === String(form.service_type_id))?.name
                  return allowedForService(base, serviceName, form.contract_type_id, !!form.is_subproject)
                })().map(ct => (
                  <label key={ct.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="contract_type_id" value={ct.id}
                      checked={String(form.contract_type_id) === String(ct.id)}
                      onChange={() => setForm(f => ({ ...f, contract_type_id: String(ct.id) }))} />
                    <span className="text-sm" style={{ color: 'var(--text)' }}>{ct.name}</span>
                  </label>
                ))}
                {contractTypes.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando...</p>}
              </div>
            </div>
          )}

          {/* Tab 3: Despesas */}
          {activeTab === 3 && (
            <div className="space-y-4">
              {form.is_subproject && (
                <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  🔒 Regra de despesas herdada do projeto pai (somente leitura).
                </p>
              )}
              <label className="flex items-center gap-2" style={{ cursor: form.is_subproject ? 'default' : 'pointer' }}>
                <input type="checkbox" checked={form.cobra_despesa_cliente} disabled={form.is_subproject}
                  onChange={e => setForm(f => ({ ...f, cobra_despesa_cliente: e.target.checked }))} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Cobrar despesas do cliente</span>
              </label>
              {form.cobra_despesa_cliente && (
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Limite de despesas (R$)</label>
                  <input type="number" min="0" step="0.01" placeholder="Ex: 5000.00"
                    value={form.limite_despesa}
                    onChange={e => setForm(f => ({ ...f, limite_despesa: e.target.value }))}
                    readOnly={form.is_subproject}
                    className={inputCls} style={{ ...inputStyle, opacity: form.is_subproject ? 0.6 : 1 }} />
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Operacional */}
          {activeTab === 4 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Arquiteto</label>
                <SearchSelect
                  value={form.architect_id}
                  onChange={v => setForm(f => ({ ...f, architect_id: v }))}
                  options={[{ id: '', name: 'Sem arquiteto' }, ...users]}
                  placeholder="Buscar arquiteto..."
                />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Tipo de Alocação</label>
                <div className="flex gap-4">
                  {(['remoto', 'presencial', 'ambos'] as const).map(v => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="tipo_alocacao" value={v} checked={form.tipo_alocacao === v}
                        onChange={() => setForm(f => ({ ...f, tipo_alocacao: v }))} />
                      <span className="text-sm capitalize" style={{ color: 'var(--text)' }}>{v}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Legenda do saldo do projeto pai */}
              {form.parent_project_id && (
                <div className="rounded-xl p-3" style={{
                  background: parentBalance
                    ? parentBalance.balance > 0 ? 'var(--success-bg)' : 'var(--danger-bg)'
                    : 'var(--surface-sunken)',
                  border: `1px solid ${parentBalance
                    ? parentBalance.balance > 0 ? 'var(--success-border)' : 'var(--danger-border)'
                    : 'var(--border)'}`,
                }}>
                  {parentBalanceLoading ? (
                    <p className="text-xs animate-pulse" style={{ color: 'var(--text-light)' }}>Verificando saldo do projeto pai...</p>
                  ) : parentBalance ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                          style={{ color: parentBalance.balance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                          Saldo do Projeto Pai
                        </p>
                        <p className="text-lg font-bold tabular-nums"
                          style={{ color: parentBalance.balance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                        </p>
                      </div>
                      {isOnDemand && (
                        <div className="text-right">
                          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>On Demand</p>
                          <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
                            Não consome saldo do pai
                          </p>
                        </div>
                      )}
                      {!isOnDemand && parentBalance.balance <= 0 && (
                        <div className="text-right">
                          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Saldo negativo</p>
                          <p className="text-xs font-semibold"
                            style={{ color: parentBalance.allow_negative ? 'var(--warning)' : 'var(--danger)' }}>
                            {parentBalance.allow_negative ? 'Permitido' : 'Bloqueado'}
                          </p>
                        </div>
                      )}
                      {!isOnDemand && parentBalance.balance > 0 && Number(form.horas_contratadas) > 0 && (
                        <div className="text-right">
                          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Este subprojeto</p>
                          <p className="text-xs font-semibold"
                            style={{ color: Number(form.horas_contratadas) <= parentBalance.balance ? 'var(--success)' : 'var(--danger)' }}>
                            {Number(form.horas_contratadas).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h
                            {Number(form.horas_contratadas) > parentBalance.balance && ' ⚠ Excede saldo'}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {!isOnDemand && !isMensalidade && (
                  <div>
                    <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Horas Contratadas *</label>
                    <input {...numInput('horas_contratadas', raw =>
                      setForm(f => {
                        const vh = Number(f.valor_hora)
                        const vp = vh > 0 && Number(raw) > 0 ? String((vh * Number(raw)).toFixed(2)) : f.valor_projeto
                        return { ...f, horas_contratadas: raw, valor_projeto: vp }
                      })
                    )} placeholder="0,00" />
                  </div>
                )}
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                    Expectativa de Início <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input type="date" value={form.expectativa_inicio}
                    onChange={e => setForm(f => ({ ...f, expectativa_inicio: e.target.value }))}
                    className={inputCls} style={{ ...inputStyle, borderColor: !form.expectativa_inicio ? 'var(--danger-border)' : undefined }} />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Valores</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                      {isMensalidade ? 'Valor do Contrato (R$) — mensalidade' : 'Valor do Projeto (R$)'}
                      {(isMensalidade || isOnDemand) && <span style={{ color: 'var(--danger)' }}> *</span>}
                    </label>
                    <input {...numInput('valor_projeto', vp =>
                      setForm(f => {
                        const h = Number(f.horas_contratadas)
                        const vh = vp && h > 0 ? String((Number(vp) / h).toFixed(2)) : f.valor_hora
                        return { ...f, valor_projeto: vp, valor_hora: vh }
                      })
                    )} placeholder="0,00" />
                  </div>
                  {!isMensalidade && !isOnDemand && (
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                        Valor da Hora (R$) <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input {...numInput('valor_hora', vh =>
                        setForm(f => {
                          const h = Number(f.horas_contratadas)
                          const vp = vh && h > 0 ? String((Number(vh) * h).toFixed(2)) : f.valor_projeto
                          return { ...f, valor_hora: vh, valor_projeto: vp }
                        })
                      )} placeholder="0,00" />
                    </div>
                  )}
                  {!isOnDemand && !isMensalidade && (
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Hora Adicional (R$)</label>
                      <input {...numInput('hora_adicional')} placeholder="0,00" />
                    </div>
                  )}
                  {(isFechado || isBhFixo) && (
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Percentual Gestão (%)</label>
                      <input {...numInput('pct_horas_coordenador', raw => { setGestaoDraft(null); setForm(f => ({ ...f, pct_horas_coordenador: raw })) })} placeholder="0,00" />
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
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Horas de Gestão</label>
                        <input type="number" value={shown} min="0" step="0.5" disabled={base <= 0}
                          className={inputCls} style={inputStyle}
                          onChange={e => {
                            const v = e.target.value
                            setGestaoDraft(v)
                            const h = Number(v) || 0
                            if (base > 0) setForm(f => ({ ...f, pct_horas_coordenador: String(Math.round((h / base) * 100 * 100) / 100) }))
                          }}
                          onBlur={() => setGestaoDraft(null)}
                          placeholder="0" />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          {base > 0 ? `${pct || 0}% de ${base}h (vendidas)` : 'Informe Horas Contratadas para calcular'}
                        </p>
                      </div>
                    )
                  })()}
                  {(isFechado || isBhFixo) && (
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Horas Consultor</label>
                      <input {...numInput('horas_consultor')} placeholder="0,00" />
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
                        <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Saving ERPSERV</label>
                        <input readOnly tabIndex={-1} value={`${sobra}h`}
                          className={inputCls} style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }} />
                      </div>
                    )
                  })()}
                  {(isFechado || isBhFixo) && (
                    <div>
                      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Horas Apontáveis <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input {...numInput('horas_coordenacao')} placeholder="0,00" />
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Banco de horas apontáveis (copiado pro projeto ao gerar).</p>
                      {form.horas_coordenacao !== '' && form.horas_contratadas !== '' && Number(form.horas_coordenacao) > Number(form.horas_contratadas) && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Não pode exceder as horas vendidas ({form.horas_contratadas}h).</p>
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
              {form.customer_id && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Do cadastro do cliente</p>
                  <SearchSelect
                    value=""
                    onChange={v => {
                      const cc = customerContacts.find(c => String(c.id) === v)
                      if (cc && !contacts.some(c => c.name === cc.name && c.email === cc.email)) {
                        setContacts(cs => [...cs, { name: cc.name, cargo: cc.cargo ?? '', email: cc.email ?? '', phone: cc.phone ?? '' }])
                      }
                    }}
                    options={customerContacts
                      .filter(cc => !contacts.some(c => c.name === cc.name && c.email === cc.email))
                      .map(cc => ({ id: String(cc.id), name: cc.cargo ? `${cc.name} — ${cc.cargo}` : cc.name }))}
                    placeholder={customerContacts.length ? 'Buscar e adicionar contato do cadastro...' : 'Nenhum contato cadastrado para este cliente'}
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                    O contato escolhido entra na lista abaixo (editável). Contatos novos digitados aqui são salvos no cadastro do cliente ao salvar o contrato.
                  </p>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Contatos selecionados ({contacts.length})</p>
                  <button onClick={addContact}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium"
                    style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
                    <Plus size={10} /> Adicionar manual
                  </button>
                </div>
                {contacts.map((ct, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2 mb-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Contato {i + 1}</span>
                      <button onClick={() => removeContact(i)} className="transition-colors" style={{ color: 'var(--text-light)' }}><X size={12} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={labelCls} style={{ color: 'var(--text-muted)' }}>Nome *</label>
                        <input value={ct.name} onChange={e => updateContact(i, 'name', e.target.value)} className={inputCls} style={inputStyle} placeholder="Nome completo" /></div>
                      <div><label className={labelCls} style={{ color: 'var(--text-muted)' }}>Cargo</label>
                        <input value={ct.cargo} onChange={e => updateContact(i, 'cargo', e.target.value)} className={inputCls} style={inputStyle} placeholder="Cargo / Função" /></div>
                      <div><label className={labelCls} style={{ color: 'var(--text-muted)' }}>Email</label>
                        <input type="email" value={ct.email} onChange={e => updateContact(i, 'email', e.target.value)} className={inputCls} style={inputStyle} placeholder="email@empresa.com" /></div>
                      <div><label className={labelCls} style={{ color: 'var(--text-muted)' }}>Telefone</label>
                        <input type="tel" value={ct.phone} onChange={e => updateContact(i, 'phone', e.target.value.replace(/\D/g, ''))} className={inputCls} style={inputStyle} placeholder="11999999999" maxLength={15} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 6: Financeiro */}
          {activeTab === 6 && (
            <div>
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Condição de Pagamento <span style={{ color: 'var(--danger)' }}>*</span></label>
              <textarea value={form.condicao_pagamento}
                onChange={e => setForm(f => ({ ...f, condicao_pagamento: e.target.value }))}
                rows={5} placeholder="Ex: 30 dias após entrega da NF..."
                className={inputCls}
                style={{ ...inputStyle, resize: 'vertical', ...(!form.condicao_pagamento.trim() ? { borderColor: 'var(--danger-border)' } : {}) }} />
              {!form.condicao_pagamento.trim() && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Obrigatório</p>
              )}
            </div>
          )}

          {/* Tab 7: Comercial */}
          {activeTab === 7 && (
            <div>
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Vendedor</label>
              <SearchSelect
                value={form.vendedor_id}
                onChange={v => setForm(f => ({ ...f, vendedor_id: v }))}
                options={users}
                placeholder="Buscar vendedor..."
              />
            </div>
          )}

          {/* Tab 8: Observações */}
          {activeTab === 8 && (
            <div>
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                Observações <span style={{ color: 'var(--danger)' }}>*</span>
                <span className="ml-1 text-[10px]" style={{ color: 'var(--warning)' }}>(será copiado ao projeto)</span>
              </label>
              <textarea value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                rows={10} placeholder="Descreva o escopo, premissas, restrições..."
                className={inputCls}
                style={{ ...inputStyle, resize: 'vertical', borderColor: !form.observacoes.trim() ? 'var(--danger-border)' : undefined }} />
              {!form.observacoes.trim() && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>Obrigatório</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            {!form.is_aporte && !form.is_aditivo && visibleTabs.indexOf(activeTab) > 0 && (
              <button onClick={() => { const pi = visibleTabs[visibleTabs.indexOf(activeTab) - 1]; if (pi !== undefined) setActiveTab(pi) }}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                ← Anterior
              </button>
            )}
            {!form.is_aporte && !form.is_aditivo && visibleTabs.indexOf(activeTab) < visibleTabs.length - 1 && (
              <button onClick={() => { const ni = visibleTabs[visibleTabs.indexOf(activeTab) + 1]; if (ni !== undefined && validateCurrentTab()) setActiveTab(ni) }}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                Próximo →
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm transition-colors" style={{ color: 'var(--text-muted)' }}>
              Cancelar
            </button>
            {(form.is_aporte || form.is_aditivo || activeTab === visibleTabs[visibleTabs.length - 1]) && (
              <button onClick={save} disabled={saving || (!form.is_aditivo && codeExists)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: form.is_aporte ? 'var(--success-bg)' : 'var(--primary-soft)',
                  border: `1px solid ${form.is_aporte ? 'var(--success-border)' : 'var(--primary)'}`,
                  color: form.is_aporte ? 'var(--success)' : 'var(--primary)',
                }}>
                {saving
                  ? (form.is_aporte ? 'Criando aporte...' : form.is_aditivo ? 'Aplicando aditivo...' : 'Criando...')
                  : form.is_aporte ? 'Criar aporte' : form.is_aditivo ? 'Aplicar aditivo' : 'Criar Contrato'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
