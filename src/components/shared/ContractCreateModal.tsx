'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '@/lib/api'
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
  horas_consultor: string
  expectativa_inicio: string
  condicao_pagamento: string
  executivo_conta_id: string
  vendedor_id: string
  observacoes: string
}

const CURRENT_YEAR_2D = new Date().getFullYear().toString().slice(-2)

const EMPTY_FORM: FormState = {
  customer_id: '', project_name: '', is_subproject: false, sub_seq: '', parent_project_id: '',
  code_seq: '', code_year: CURRENT_YEAR_2D,
  categoria: 'projeto', service_type_id: '', contract_type_id: '',
  cobra_despesa_cliente: false, limite_despesa: '',
  architect_id: '', tipo_alocacao: 'remoto',
  horas_contratadas: '', valor_projeto: '', valor_hora: '',
  hora_adicional: '', pct_horas_coordenador: '', horas_consultor: '',
  expectativa_inicio: '', condicao_pagamento: '',
  executivo_conta_id: '', vendedor_id: '', observacoes: '',
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

  const [customers, setCustomers]         = useState<SelectOption[]>([])
  const [users, setUsers]                 = useState<SelectOption[]>([])
  const [serviceTypes, setServiceTypes]   = useState<SelectOption[]>([])
  const [contractTypes, setContractTypes] = useState<SelectOption[]>([])
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([])
  const [parentProjects, setParentProjects]     = useState<SelectOption[]>([])

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

  useEffect(() => {
    if (!form.parent_project_id) { setParentBalance(null); return }
    setParentBalanceLoading(true)
    api.get<any>(`/projects/${form.parent_project_id}`)
      .then(r => {
        const balance = r.general_hours_balance ?? ((r.sold_hours ?? 0) - (r.consumed_hours ?? 0))
        setParentBalance({ balance, allow_negative: r.allow_negative_balance ?? false })
      })
      .catch(() => setParentBalance(null))
      .finally(() => setParentBalanceLoading(false))
  }, [form.parent_project_id])

  useEffect(() => {
    if (!form.customer_id) { setCustomerContacts([]); setParentProjects([]); return }
    api.get<CustomerContact[]>(`/customer-contacts?customer_id=${form.customer_id}`)
      .then(r => setCustomerContacts(Array.isArray(r) ? r : []))
      .catch(() => setCustomerContacts([]))
    api.get<any>(`/projects?customer_id=${form.customer_id}&parent_projects_only=true&pageSize=100`)
      .then(r => setParentProjects((r?.items ?? []).map((p: any) => ({ id: p.id, name: `${p.code} — ${p.name}` }))))
      .catch(() => setParentProjects([]))
  }, [form.customer_id])

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedContractType = useMemo(
    () => contractTypes.find(t => String(t.id) === String(form.contract_type_id)),
    [contractTypes, form.contract_type_id]
  )
  const isOnDemand = selectedContractType?.name.toLowerCase().trim() === 'on demand'
  const isBankHours = selectedContractType?.name.toLowerCase().includes('banco de horas') ?? false
  const isFechado = !!selectedContractType && !isOnDemand && !isBankHours

  const saveErpserv = useMemo(() => {
    if (!isFechado) return null
    const sold = Number(form.horas_contratadas) || 0
    const consult = Number(form.horas_consultor) || 0
    const coord = Number(form.pct_horas_coordenador) || 0
    return sold - consult - Math.round((coord / 100) * consult)
  }, [isFechado, form.horas_contratadas, form.horas_consultor, form.pct_horas_coordenador])

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
        return true

      case 1: // Classificação
        if (!form.service_type_id) { toast.error('Selecione o Tipo de Serviço'); return false }
        return true

      case 2: // Faturamento
        if (!form.contract_type_id) { toast.error('Selecione o Tipo de Contrato'); return false }
        return true

      case 4: // Operacional
        if (!isOnDemand && !form.horas_contratadas) { toast.error('Informe as Horas Contratadas'); return false }
        if (!form.expectativa_inicio)               { toast.error('Informe a Expectativa de Início'); return false }
        if (!form.valor_hora)                       { toast.error('Informe o Valor da Hora'); return false }
        if (form.parent_project_id && parentBalance && !parentBalance.allow_negative) {
          const childHours = Number(form.horas_contratadas) || 0
          if (childHours > parentBalance.balance) {
            toast.error(`Horas (${childHours.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h) excedem o saldo do projeto pai (${parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}h)`)
            return false
          }
        }
        return true

      case 8: // Observações
        if (form.observacoes.trim().length < 50) {
          toast.error(`Observações obrigatórias — mínimo 50 caracteres (${form.observacoes.trim().length}/50)`)
          return false
        }
        return true

      default:
        return true
    }
  }

  // ── Number mask helpers ────────────────────────────────────────────────────

  const fmtBRInput = (v: string, field: string): string => {
    if (focusedField === field || !v) return v
    const n = parseFloat(v)
    if (isNaN(n)) return v
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const parseBRInput = (v: string): string => {
    const hasBoth = v.includes('.') && v.includes(',')
    const s = hasBoth ? v.replace(/\./g, '').replace(',', '.') : v.includes(',') ? v.replace(',', '.') : v
    const n = parseFloat(s)
    return isNaN(n) ? '' : String(n)
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
    // Revalidate all required tabs before saving
    const checks: [number, () => boolean][] = [
      [0, () => !!form.customer_id && !!form.project_name.trim()],
      [1, () => !!form.service_type_id],
      [2, () => !!form.contract_type_id],
      [4, () => !isOnDemand ? !!form.horas_contratadas && !!form.expectativa_inicio && !!form.valor_hora : !!form.expectativa_inicio && !!form.valor_hora],
      [8, () => form.observacoes.trim().length >= 50],
    ]
    for (const [tab, check] of checks) {
      if (!check()) {
        setActiveTab(tab)
        validateCurrentTab()
        return
      }
    }

    if (form.parent_project_id && parentBalance && !parentBalance.allow_negative) {
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
        horas_contratadas:     isOnDemand ? 0 : Number(form.horas_contratadas),
        valor_projeto:         form.valor_projeto ? Number(form.valor_projeto) : null,
        valor_hora:            form.valor_hora ? Number(form.valor_hora) : null,
        hora_adicional:        form.hora_adicional ? Number(form.hora_adicional) : null,
        pct_horas_coordenador: form.pct_horas_coordenador ? Number(form.pct_horas_coordenador) : null,
        horas_consultor:       form.horas_consultor ? Number(form.horas_consultor) : null,
        expectativa_inicio:    form.expectativa_inicio || null,
        condicao_pagamento:    form.condicao_pagamento || null,
        executivo_conta_id:    form.executivo_conta_id ? Number(form.executivo_conta_id) : null,
        vendedor_id:           form.vendedor_id ? Number(form.vendedor_id) : null,
        observacoes:           form.observacoes || null,
        contacts,
      }

      const contract = await api.post<{ id: number }>('/contracts', payload)
      toast.success('Contrato criado com sucesso')
      onSuccess(contract.id)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar contrato')
    } finally {
      setSaving(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls  = 'w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none focus:ring-1 focus:ring-cyan-500/40'
  const inputStyle = { border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }
  const labelCls  = 'block text-xs text-zinc-400 mb-1'

  const tabsToShow = customerReadOnly ? TABS.slice(1) : TABS
  const tabOffset  = customerReadOnly ? 1 : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {(selectedContractType || form.service_type_id) && (
              <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                {selectedContractType && <span style={{ color: '#00F5FF' }}>{selectedContractType.name}</span>}
                {selectedContractType && form.service_type_id && <span className="text-zinc-600">·</span>}
                {form.service_type_id && <span>{serviceTypes.find(s => String(s.id) === String(form.service_type_id))?.name}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b overflow-x-auto shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          {tabsToShow.map((t, i) => {
            const realIdx = i + tabOffset
            return (
              <button key={t} onClick={() => setActiveTab(realIdx)}
                className="px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0"
                style={{ color: activeTab === realIdx ? '#00F5FF' : '#71717a', borderBottom: activeTab === realIdx ? '2px solid #00F5FF' : '2px solid transparent' }}>
                {t}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Tab 0: Cliente */}
          {activeTab === 0 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls} style={{ marginBottom: 0 }}>Cliente *</label>
                  {!customerReadOnly && (
                    <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors">
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Código do Projeto</p>
                {codePrefix ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center select-none"
                        style={{ ...inputStyle, opacity: 0.5, minWidth: '4.5rem' }}>{codePrefix}</div>
                      <input type="text" maxLength={3} placeholder="001"
                        value={form.code_seq}
                        onChange={e => { setForm(f => ({ ...f, code_seq: e.target.value.replace(/\D/g, '').slice(0, 3) })); setCodeExists(false) }}
                        onBlur={checkCodeExists}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={{ ...inputStyle, width: '5rem' }} />
                      <span className="text-zinc-500 text-sm font-mono">-</span>
                      <input type="text" maxLength={2} placeholder="26"
                        value={form.code_year}
                        onChange={e => setForm(f => ({ ...f, code_year: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                        onBlur={checkCodeExists}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-cyan-500/40"
                        style={{ ...inputStyle, width: '4rem' }} />
                      {form.is_subproject && (
                        <>
                          <span className="text-zinc-500 text-sm font-mono">-</span>
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
                    </div>
                    {codeChecking && <p className="text-[11px] text-zinc-500">Verificando código...</p>}
                    {codeExists && !codeChecking && (
                      <p className="text-[11px] text-red-400">⚠ Código <span className="font-mono font-semibold">{codePreview}</span> já existe.</p>
                    )}
                  </div>
                ) : form.customer_id ? (
                  <p className="text-xs text-amber-400 italic">Cliente sem prefixo configurado — código gerado automaticamente</p>
                ) : (
                  <p className="text-xs text-zinc-600 italic">Selecione um cliente para ver o código</p>
                )}
              </div>

              {/* Toggle subprojeto */}
              {form.customer_id && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_subproject: !f.is_subproject, sub_seq: '', parent_project_id: '' }))}
                    className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                    style={{ background: form.is_subproject ? 'var(--brand-primary)' : 'rgba(255,255,255,0.12)' }}
                  >
                    <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                      style={{ transform: form.is_subproject ? 'translateX(16px)' : 'translateX(0)' }} />
                  </button>
                  <label className="text-sm cursor-pointer select-none"
                    style={{ color: form.is_subproject ? 'var(--brand-primary)' : 'var(--brand-subtle)' }}
                    onClick={() => setForm(f => ({ ...f, is_subproject: !f.is_subproject, sub_seq: '', parent_project_id: '' }))}>
                    É subprojeto
                  </label>
                </div>
              )}

              <div>
                <label className={labelCls}>Nome do Projeto <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" placeholder="Nome do projeto"
                  value={form.project_name}
                  onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
                  style={{ ...inputStyle, ...(!form.project_name.trim() ? { borderColor: 'rgba(239,68,68,0.5)' } : {}) }} />
              </div>

              {form.customer_id && form.is_subproject && (
                <div>
                  <label className={labelCls}>Projeto Pai <span style={{ color: '#ef4444' }}>*</span></label>
                  {parentProjects.length === 0
                    ? <p className="text-xs text-amber-400 italic px-3 py-2 rounded-lg" style={inputStyle}>Nenhum projeto pai disponível para este cliente</p>
                    : <SearchSelect
                        value={form.parent_project_id}
                        onChange={v => setForm(f => ({ ...f, parent_project_id: v }))}
                        options={parentProjects}
                        placeholder="Selecionar projeto pai..."
                      />
                  }
                </div>
              )}
            </div>
          )}

          {/* Tab 1: Classificação */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>
                  Tipo de Serviço <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <SearchSelect
                  value={form.service_type_id}
                  onChange={v => setForm(f => ({ ...f, service_type_id: v }))}
                  options={excludeSustentacao ? serviceTypes.filter(s => !isSustentacaoName(String(s.name))) : serviceTypes}
                  placeholder="Selecionar tipo de serviço..."
                />
                {!form.service_type_id && (
                  <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>Obrigatório</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Faturamento */}
          {activeTab === 2 && (
            <div>
              <label className={labelCls}>
                Tipo de Contrato <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div className="space-y-2">
                {(excludeSustentacao ? contractTypes.filter(ct => !isSustentacaoName(String(ct.name))) : contractTypes).map(ct => (
                  <label key={ct.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="contract_type_id" value={ct.id}
                      checked={String(form.contract_type_id) === String(ct.id)}
                      onChange={() => setForm(f => ({ ...f, contract_type_id: String(ct.id) }))} />
                    <span className="text-sm text-zinc-300">{ct.name}</span>
                  </label>
                ))}
                {contractTypes.length === 0 && <p className="text-xs text-zinc-500">Carregando...</p>}
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
              {/* Legenda do saldo do projeto pai */}
              {form.parent_project_id && (
                <div className="rounded-xl p-3" style={{
                  background: parentBalance
                    ? parentBalance.balance > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${parentBalance
                    ? parentBalance.balance > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.35)'
                    : 'var(--brand-border)'}`,
                }}>
                  {parentBalanceLoading ? (
                    <p className="text-xs animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Verificando saldo do projeto pai...</p>
                  ) : parentBalance ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                          style={{ color: parentBalance.balance > 0 ? '#86efac' : '#fca5a5' }}>
                          Saldo do Projeto Pai
                        </p>
                        <p className="text-lg font-bold tabular-nums"
                          style={{ color: parentBalance.balance > 0 ? '#22c55e' : '#ef4444' }}>
                          {parentBalance.balance.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                        </p>
                      </div>
                      {parentBalance.balance <= 0 && (
                        <div className="text-right">
                          <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Saldo negativo</p>
                          <p className="text-xs font-semibold"
                            style={{ color: parentBalance.allow_negative ? '#f59e0b' : '#ef4444' }}>
                            {parentBalance.allow_negative ? 'Permitido' : 'Bloqueado'}
                          </p>
                        </div>
                      )}
                      {parentBalance.balance > 0 && Number(form.horas_contratadas) > 0 && (
                        <div className="text-right">
                          <p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Este subprojeto</p>
                          <p className="text-xs font-semibold"
                            style={{ color: Number(form.horas_contratadas) <= parentBalance.balance ? '#22c55e' : '#ef4444' }}>
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
                {!isOnDemand && (
                  <div>
                    <label className={labelCls}>Horas Contratadas *</label>
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
                  <label className={labelCls}>
                    Expectativa de Início <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input type="date" value={form.expectativa_inicio}
                    onChange={e => setForm(f => ({ ...f, expectativa_inicio: e.target.value }))}
                    className={inputCls} style={{ ...inputStyle, borderColor: !form.expectativa_inicio ? 'rgba(239,68,68,0.5)' : undefined }} />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">Valores</p>
                <div className="grid grid-cols-3 gap-3">
                  {!isOnDemand && (
                    <div>
                      <label className={labelCls}>Valor do Projeto (R$)</label>
                      <input {...numInput('valor_projeto', vp =>
                        setForm(f => {
                          const h = Number(f.horas_contratadas)
                          const vh = vp && h > 0 ? String((Number(vp) / h).toFixed(2)) : f.valor_hora
                          return { ...f, valor_projeto: vp, valor_hora: vh }
                        })
                      )} placeholder="0,00" />
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>
                      Valor da Hora (R$) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input {...numInput('valor_hora', vh =>
                      setForm(f => {
                        const h = Number(f.horas_contratadas)
                        const vp = vh && h > 0 ? String((Number(vh) * h).toFixed(2)) : f.valor_projeto
                        return { ...f, valor_hora: vh, valor_projeto: isOnDemand ? f.valor_projeto : vp }
                      })
                    )} placeholder="0,00" />
                  </div>
                  {!isOnDemand && (
                    <div>
                      <label className={labelCls}>Hora Adicional (R$)</label>
                      <input {...numInput('hora_adicional')} placeholder="0,00" />
                    </div>
                  )}
                  {!isOnDemand && (
                    <div>
                      <label className={labelCls}>% Horas Coordenador</label>
                      <input {...numInput('pct_horas_coordenador')} placeholder="0,00" />
                    </div>
                  )}
                  {isFechado && (
                    <>
                      <div>
                        <label className={labelCls}>Horas Consultor</label>
                        <input {...numInput('horas_consultor')} placeholder="0,00" />
                      </div>
                      <div>
                        <label className={labelCls}>Save ERPSERV</label>
                        <input readOnly
                          value={saveErpserv != null ? saveErpserv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
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
              {customerContacts.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Do cadastro do cliente</p>
                  <div className="space-y-1.5">
                    {customerContacts.map(cc => {
                      const already = contacts.some(c => c.name === cc.name && c.email === cc.email)
                      return (
                        <div key={cc.id}
                          className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors"
                          style={{ borderColor: already ? 'rgba(0,245,255,0.4)' : 'var(--brand-border)', background: already ? 'rgba(0,245,255,0.06)' : 'transparent' }}
                          onClick={() => already
                            ? setContacts(cs => cs.filter(c => !(c.name === cc.name && c.email === cc.email)))
                            : setContacts(cs => [...cs, { name: cc.name, cargo: cc.cargo ?? '', email: cc.email ?? '', phone: cc.phone ?? '' }])}>
                          <div>
                            <p className="text-xs font-medium text-zinc-200">{cc.name}</p>
                            <p className="text-[10px] text-zinc-500">{[cc.cargo, cc.email].filter(Boolean).join(' · ')}</p>
                          </div>
                          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                            style={{ background: already ? '#00F5FF' : 'transparent', border: already ? 'none' : '1px solid #52525b' }}>
                            {already && <CheckCircle size={12} style={{ color: '#000' }} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Contatos selecionados ({contacts.length})</p>
                  <button onClick={addContact}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium"
                    style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: '#00F5FF' }}>
                    <Plus size={10} /> Adicionar manual
                  </button>
                </div>
                {contacts.map((ct, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2 mb-2" style={{ borderColor: 'var(--brand-border)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">Contato {i + 1}</span>
                      <button onClick={() => removeContact(i)} className="text-zinc-600 hover:text-red-400 transition-colors"><X size={12} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={labelCls}>Nome *</label>
                        <input value={ct.name} onChange={e => updateContact(i, 'name', e.target.value)} className={inputCls} style={inputStyle} placeholder="Nome completo" /></div>
                      <div><label className={labelCls}>Cargo</label>
                        <input value={ct.cargo} onChange={e => updateContact(i, 'cargo', e.target.value)} className={inputCls} style={inputStyle} placeholder="Cargo / Função" /></div>
                      <div><label className={labelCls}>Email</label>
                        <input type="email" value={ct.email} onChange={e => updateContact(i, 'email', e.target.value)} className={inputCls} style={inputStyle} placeholder="email@empresa.com" /></div>
                      <div><label className={labelCls}>Telefone</label>
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
              <label className={labelCls}>Condição de Pagamento</label>
              <textarea value={form.condicao_pagamento}
                onChange={e => setForm(f => ({ ...f, condicao_pagamento: e.target.value }))}
                rows={5} placeholder="Ex: 30 dias após entrega da NF..."
                className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          )}

          {/* Tab 7: Comercial */}
          {activeTab === 7 && (
            <div>
              <label className={labelCls}>Vendedor</label>
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
              <label className={labelCls}>
                Observações <span style={{ color: '#ef4444' }}>*</span>
                <span className="ml-1 text-yellow-500 text-[10px]">(será copiado ao projeto)</span>
              </label>
              <textarea value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                rows={10} placeholder="Descreva o escopo, premissas, restrições..."
                className={inputCls}
                style={{ ...inputStyle, resize: 'vertical', borderColor: form.observacoes.trim().length < 50 ? 'rgba(239,68,68,0.5)' : undefined }} />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px]" style={{ color: form.observacoes.trim().length >= 50 ? '#71717a' : '#f87171' }}>
                  {form.observacoes.trim().length < 50
                    ? `Mínimo 50 caracteres — faltam ${50 - form.observacoes.trim().length}`
                    : `${form.observacoes.trim().length} caracteres`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            {activeTab > tabOffset && (
              <button onClick={() => setActiveTab(t => t - 1)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
                style={{ border: '1px solid var(--brand-border)' }}>
                ← Anterior
              </button>
            )}
            {activeTab < TABS.length - 1 && (
              <button onClick={() => { if (validateCurrentTab()) setActiveTab(t => t + 1) }}
                className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
                style={{ border: '1px solid var(--brand-border)' }}>
                Próximo →
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
              Cancelar
            </button>
            {activeTab === TABS.length - 1 && (
              <button onClick={save} disabled={saving || codeExists}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.3)', color: '#00F5FF' }}>
                {saving ? 'Criando...' : 'Criar Contrato'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
