'use client'

import { useState, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { X, ChevronDown, Search, Mail, PenLine } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BotScopesEditor } from './BotScopesEditor'
import { BotVisibilityEditor } from './BotVisibilityEditor'
import { listPermissionProfiles } from '@/lib/bot-config'
import { SignatureEditor, type SignatureData } from '@/components/users/signature-editor'

// ─── Types ────────────────────────────────────────────────────────────────────
// Subset do usuário usado pelo prefill em edição (GET /users/{id}).
interface UserData {
  id: number
  name: string
  email: string
  enabled: boolean
  can_use_bot?: boolean
  bot_allowed_scopes?: string[] | null
  bot_visibility?: 'self' | 'team' | 'all'
  bot_scope_overrides?: Record<string, 'inherit' | 'self' | 'team' | 'all' | 'denied'> | null
  inbox_email_disabled?: boolean
  hourly_rate?: number
  rate_type?: string
  daily_hours?: number
  bank_hours_start_date?: string | null
  consultant_type?: string | null
  contract_type?: 'cooperado' | 'clt' | 'pj' | null
  coordinator_type?: 'projetos' | 'sustentacao' | null
  guaranteed_hours?: number | null
  customer_id?: number | null
  partner_id?: number | null
  partner?: { id: number; name: string } | null
  is_executive?: boolean
  type?: string | null
  extra_permissions?: string[]
  can_timesheet_sustentacao?: boolean
  is_bizify?: boolean
  is_diretor_projetos?: boolean
  is_coordinator?: boolean
  full_name?: string | null
  cpf?: string | null
  matricula?: string | null
  birth_date?: string | null
  signature?: SignatureData | null
  payroll_status?: string | null
}

interface CustomerOption { id: number; name: string }
interface PartnerOption  { id: number; name: string; pricing_type?: 'fixed' | 'variable'; hourly_rate?: string | null }

type ProfileType    = 'cliente' | 'consultor' | 'coordenador' | 'parceiro_adm' | 'administrator' | 'administrativo'
type ConsultantType = 'horista' | 'banco_de_horas' | 'fixo'
type ContractType   = 'cooperado' | 'clt' | 'pj'

const PROFILE_OPTIONS: { value: ProfileType; label: string }[] = [
  { value: 'cliente',        label: 'Cliente' },
  { value: 'consultor',      label: 'Consultor' },
  { value: 'coordenador',    label: 'Coordenador' },
  { value: 'parceiro_adm',   label: 'Parceiro' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'administrator',  label: 'Administrador' },
]

const CONSULTANT_OPTIONS: { value: ConsultantType; label: string; desc: string }[] = [
  { value: 'horista',        label: 'Horista',        desc: 'Pago por hora — possui horas extras' },
  { value: 'banco_de_horas', label: 'Banco de Horas', desc: 'Valor mensal — banco de horas' },
  { value: 'fixo',           label: 'Fixo',           desc: 'Valor fixo mensal — sem banco de horas' },
]

const CONTRACT_OPTIONS: { value: ContractType; label: string }[] = [
  { value: 'cooperado', label: 'Cooperado' },
  { value: 'clt',       label: 'CLT' },
  { value: 'pj',        label: 'PJ' },
]

const contractLabel = (v: string | null | undefined): string =>
  CONTRACT_OPTIONS.find(o => o.value === v)?.label ?? '—'

// Lista FIXA de status — usado para gerar planilha de importação da folha.
const PAYROLL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Contratado',     label: 'Contratado' },
  { value: 'Em Afastamento', label: 'Em Afastamento' },
]
const PAYROLL_STATUS_DEFAULT = 'Contratado'

// Máscara de CPF 000.000.000-00 — sem dependência externa, só agrupa dígitos.
const formatCpf = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

function resolveTypeForBackend(profile: ProfileType): string {
  if (profile === 'administrator') return 'admin'
  if (profile === 'parceiro_adm')  return 'parceiro_admin'
  return profile
}

function resolveProfileFromType(type: string | null | undefined): ProfileType | null {
  if (!type) return null
  if (type === 'admin')          return 'administrator'
  if (type === 'parceiro_admin') return 'parceiro_adm'
  return type as ProfileType
}

// ─── Sub-components (idênticos à página de Usuários) ─────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-[var(--text-light)] hover:text-[var(--text)]">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onChange}
        className={`w-8 h-4 rounded-full transition-colors relative ${value ? 'bg-[var(--primary)]' : 'bg-[var(--surface-hover)]'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-[var(--surface)] transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
      <Label className="text-xs text-[var(--text-muted)]">{label}</Label>
    </div>
  )
}

function FieldSelect({ label, value, onChange, options, placeholder }: {
  label: string
  value: string | number
  onChange: (v: string) => void
  options: { value: string | number; label: string }[]
  placeholder?: string
}) {
  return (
    <div>
      <Label className="text-xs text-[var(--text-muted)]">{label}</Label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-md h-9 px-2 appearance-none outline-none">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// FieldSearchSelect — versão com busca por texto. Usar quando a lista
// tem 20+ opções (ex: empresas). Lista nativa fica impraticável.
function FieldSearchSelect({ label, value, onChange, options, placeholder }: {
  label: string
  value: string | number
  onChange: (v: string) => void
  options: { value: string | number; label: string }[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => String(o.value) === String(value))
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  return (
    <div>
      <Label className="text-xs text-[var(--text-muted)]">{label}</Label>
      <div ref={ref} className="relative mt-1">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 h-9 rounded-md text-xs outline-none text-left"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: selected ? 'var(--text)' : 'var(--text-light)',
          }}
        >
          <span className="truncate">{selected ? selected.label : (placeholder ?? 'Selecione...')}</span>
          <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
        {open && (
          <div
            className="absolute top-full mt-1 left-0 z-[200] w-full min-w-56 rounded-xl overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--brand-card-shadow-md)',
            }}
          >
            <div className="p-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: 'var(--text)' }}
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0
                ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>
                : filtered.map(o => {
                    const isSelected = String(o.value) === String(value)
                    return (
                      <button key={o.value} type="button"
                        onClick={() => { onChange(String(o.value)); setOpen(false) }}
                        className="w-full text-left px-3 py-2 text-xs transition-colors"
                        style={{
                          color: isSelected ? 'var(--primary)' : 'var(--text)',
                          background: isSelected ? 'var(--primary-soft)' : 'transparent',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                      >
                        {o.label}
                      </button>
                    )
                  })
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConsultantTypeCard({
  value,
  onChange,
}: {
  value: ConsultantType | ''
  onChange: (v: ConsultantType) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = CONSULTANT_OPTIONS.find(o => o.value === value)

  return (
    <div>
      <Label className="text-xs text-[var(--text-muted)] mb-1 block">Tipo de Consultor *</Label>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] overflow-hidden">
        {/* Cabeçalho: mostra selecionado + toggle */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-[var(--surface-hover)] transition-colors"
        >
          <span className={selected ? 'text-[var(--text)] font-medium' : 'text-[var(--text-light)]'}>
            {selected ? selected.label : 'Selecione o tipo...'}
          </span>
          <ChevronDown size={12} className={`text-[var(--text-light)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Legenda do tipo selecionado */}
        {selected && !open && (
          <div className="px-3 pb-2 text-[10px] text-[var(--text-light)]">{selected.desc}</div>
        )}

        {/* Opções dentro do mesmo card */}
        {open && (
          <div className="border-t border-[var(--border)] px-2 pb-2 pt-1.5 space-y-1">
            {CONSULTANT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full flex flex-col items-start px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                  value === opt.value
                    ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${value === opt.value ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'}`} />
                  <span className="font-medium">{opt.label}</span>
                </div>
                <span className="text-[10px] text-[var(--text-light)] pl-3.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Initial form state ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  smtp_app_password: '',
  enabled: true,
  can_use_bot: false,
  bot_allowed_scopes: null as string[] | null,
  bot_visibility: 'self' as 'self' | 'team' | 'all',
  bot_scope_overrides: null as Record<string, 'inherit' | 'self' | 'team' | 'all' | 'denied'> | null,
  inbox_email_disabled: false,
  hourly_rate: '',
  rate_type: 'hourly' as 'hourly' | 'monthly',
  daily_hours: '8',
  bank_hours_start_date: '',
  guaranteed_hours: '',
  profiles: [] as ProfileType[],
  consultant_type: 'horista' as ConsultantType | '',
  contract_type: '' as ContractType | '',
  coordinator_type: '' as 'projetos' | 'sustentacao' | '',
  is_partner_consultor: false,
  is_partner_adm: false,
  customer_id: '' as number | '',
  partner_id: '' as number | '',
  extra_permissions: [] as string[],
  can_timesheet_sustentacao: false,
  is_bizify: false,
  is_diretor_projetos: false,
  is_coordinator: false,
  // Folha de pagamento
  full_name: '',
  cpf: '',
  matricula: '',
  birth_date: '',
  // Assinatura padrão (estruturada)
  signature: {} as SignatureData,
  payroll_status: PAYROLL_STATUS_DEFAULT,
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface UserFormModalProps {
  open: boolean
  /** null = modo criação; número = edita esse usuário. */
  userId: number | null
  onClose: () => void
  /** Chamado após criar/atualizar com sucesso. */
  onSaved: () => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function UserFormModal({ open, userId, onClose, onSaved }: UserFormModalProps) {
  const { user: authUser } = useAuth()
  const isAdmin      = authUser?.type === 'admin'
  const ep: string[] = (authUser as any)?.permissions ?? authUser?.extra_permissions ?? []
  const canResetPwd  = isAdmin || ep.includes('users.reset_password')

  const isEdit = userId != null

  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [partners,  setPartners]  = useState<PartnerOption[]>([])
  const [form,    setForm]    = useState({ ...EMPTY_FORM })
  // Usuário em edição (prefill) — equivale a `modal.item` da página de Usuários.
  const [editItem, setEditItem] = useState<UserData | null>(null)
  const [loadingItem, setLoadingItem] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [resendPwd,      setResendPwd]      = useState('')
  const [resendingModal, setResendingModal] = useState(false)
  // Vigência do novo valor-hora: quando o hourly_rate muda, perguntamos a partir de qual mês passa a valer.
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [rateEffectiveMonth, setRateEffectiveMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))

  // Histórico de valores-hora (somente leitura) — GET /users/{id}/hourly-rate-history
  const [rateHistoryOpen, setRateHistoryOpen] = useState(false)
  const [rateHistory, setRateHistory] = useState<any[]>([])
  const [rateHistoryLoading, setRateHistoryLoading] = useState(false)
  const openRateHistory = async () => {
    if (userId == null) return
    setRateHistoryOpen(true)
    setRateHistoryLoading(true)
    try {
      const res = await api.get<{ hasNext: boolean; items: any[] }>(`/users/${userId}/hourly-rate-history?pageSize=100`)
      setRateHistory(Array.isArray(res?.items) ? res.items : [])
    } catch {
      setRateHistory([])
      toast.error('Erro ao carregar histórico de valores')
    } finally {
      setRateHistoryLoading(false)
    }
  }

  // Carrega clientes + parceiros uma vez ao abrir.
  useEffect(() => {
    if (!open) return
    api.get<any>('/customers?pageSize=500').then(r =>
      setCustomers(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})
    api.get<any>('/partners?pageSize=-1').then(r =>
      setPartners(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})
  }, [open])

  // Prefill: cria (EMPTY_FORM) ou edita (GET /users/{id}). Replica openEdit.
  useEffect(() => {
    if (!open) return
    setResendPwd('')
    if (userId == null) {
      setEditItem(null)
      setForm({ ...EMPTY_FORM })
      return
    }
    let cancelled = false
    setLoadingItem(true)
    api.get<UserData>(`/users/${userId}`)
      .then(item => {
        if (cancelled) return
        setEditItem(item)
        const profile  = resolveProfileFromType(item.type)
        const profiles = profile ? [profile] : []
        // Prefer stored consultant_type; fall back only for horista (hourly)
        const consultant_type = (item.consultant_type as ConsultantType | undefined)
          ?? (item.rate_type === 'hourly' ? 'horista' : '')
        setForm({
          name:                item.name,
          email:               item.email,
          password:            '',
          smtp_app_password:   '', // write-only no BE — nunca retorna; mantém em branco
          enabled:             item.enabled,
          can_use_bot:         item.can_use_bot ?? false,
          bot_allowed_scopes:  item.bot_allowed_scopes ?? null,
          bot_visibility:      (item.bot_visibility ?? 'self') as 'self' | 'team' | 'all',
          bot_scope_overrides: (item.bot_scope_overrides ?? null) as Record<string, 'inherit' | 'self' | 'team' | 'all' | 'denied'> | null,
          inbox_email_disabled: item.inbox_email_disabled ?? false,
          hourly_rate:         item.hourly_rate ? String(item.hourly_rate) : '',
          rate_type:           (item.rate_type as 'hourly' | 'monthly') ?? 'hourly',
          daily_hours:            item.daily_hours != null ? String(item.daily_hours) : '8',
          bank_hours_start_date:  item.bank_hours_start_date ?? '',
          guaranteed_hours:       item.guaranteed_hours != null ? String(item.guaranteed_hours) : '',
          profiles,
          consultant_type:      consultant_type as ConsultantType | '',
          contract_type:        (item.contract_type as ContractType | undefined) ?? '',
          coordinator_type:     (item.coordinator_type as 'projetos' | 'sustentacao' | undefined) ?? '',
          is_partner_consultor: false,
          is_partner_adm:       item.is_executive ?? false,
          customer_id:          item.customer_id ?? '',
          partner_id:           item.partner_id  ?? '',
          extra_permissions:          item.extra_permissions ?? [],
          can_timesheet_sustentacao:  item.can_timesheet_sustentacao ?? false,
          is_bizify:                  item.is_bizify ?? false,
          is_diretor_projetos:        item.is_diretor_projetos ?? false,
          is_coordinator:             item.is_coordinator ?? false,
          full_name:                  item.full_name ?? '',
          cpf:                        item.cpf ?? '',
          matricula:                  item.matricula ?? '',
          birth_date:                 (item.birth_date ?? '').slice(0, 10),
          signature:                  (item.signature as SignatureData | undefined) ?? {},
          payroll_status:             item.payroll_status ?? PAYROLL_STATUS_DEFAULT,
        })
      })
      .catch(e => {
        if (cancelled) return
        toast.error(e instanceof ApiError ? e.message : 'Erro ao carregar usuário')
        onClose()
      })
      .finally(() => { if (!cancelled) setLoadingItem(false) })
    return () => { cancelled = true }
  }, [open, userId])

  const save = async (hourlyRateEffectiveFrom?: string) => {
    if (form.profiles.length === 0) { toast.error('Selecione ao menos um perfil de acesso'); return }

    const needsPartnerField = form.profiles.includes('parceiro_adm')

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:        form.name,
        email:       form.email,
        enabled:     form.enabled,
        can_use_bot: form.can_use_bot,
        bot_allowed_scopes: form.bot_allowed_scopes,
        bot_visibility: form.bot_visibility,
        bot_scope_overrides: form.bot_scope_overrides,
        inbox_email_disabled: form.inbox_email_disabled,
        type:        resolveTypeForBackend(form.profiles[0]),
        customer_id:  form.profiles.includes('cliente') && form.customer_id ? form.customer_id : null,
        partner_id:   needsPartnerField && form.partner_id ? form.partner_id : null,
        is_executive: form.profiles.includes('parceiro_adm') ? form.is_partner_adm : false,
        rate_type:    form.rate_type,
      }
      if (form.hourly_rate) payload.hourly_rate = parseFloat(form.hourly_rate)
      if (form.daily_hours) payload.daily_hours = parseFloat(form.daily_hours)
      payload.is_bizify = form.is_bizify
      payload.is_diretor_projetos = form.is_diretor_projetos
      payload.is_coordinator = form.is_coordinator
      if (form.profiles.includes('consultor') && form.consultant_type) {
        payload.consultant_type       = form.consultant_type
        payload.bank_hours_start_date = form.bank_hours_start_date || null
        if (form.consultant_type === 'horista') {
          payload.guaranteed_hours = form.guaranteed_hours ? parseFloat(form.guaranteed_hours) : null
        }
      }
      // Tipo de contrato: consultor envia só quando NÃO vinculado a parceiro
      // (vinculado herda do parceiro — BE ignora); parceiro sempre define.
      const consultorBound = form.profiles.includes('consultor') && !!form.partner_id
      if (!form.profiles.includes('cliente') && !consultorBound) {
        payload.contract_type = form.contract_type || null
      }
      if (form.profiles.includes('coordenador')) {
        payload.coordinator_type  = form.coordinator_type || null
        // extra_permissions agora é gerenciado via Grupos de Permissões — sempre limpa aqui
        payload.extra_permissions = []
      }
      if (form.profiles.includes('consultor') || form.profiles.includes('parceiro_adm')) {
        payload.can_timesheet_sustentacao = form.can_timesheet_sustentacao
      }
      // Folha de pagamento — vale para todos os perfis exceto Cliente (inclui Parceiro/Coordenador).
      const payrollProfile = !form.profiles.includes('cliente')
      if (payrollProfile) {
        payload.full_name      = form.full_name || null
        payload.cpf            = form.cpf || null
        payload.matricula      = form.matricula || null
        payload.birth_date     = form.birth_date || null
        payload.payroll_status = form.payroll_status || PAYROLL_STATUS_DEFAULT
        // Assinatura padrão (estruturada) — perfis internos (não-cliente).
        payload.signature = form.signature ?? {}
      }
      if (!isEdit && form.password) payload.password = form.password
      // App Password (envio de fechamentos via O365 do próprio usuário): write-only.
      // Só envia quando preenchido — em branco mantém a senha já armazenada no BE.
      if (showAppPassword && form.smtp_app_password.trim()) {
        payload.smtp_app_password = form.smtp_app_password
      }

      if (isEdit && editItem) {
        // Mudou o valor-hora OU o tipo do consultor (rate_type/consultant_type)? Abre o modal de
        // vigência antes de enviar — a alteração vale a partir do mês escolhido (passado não muda).
        const isConsultorEdit = form.profiles.includes('consultor')
        const rateChanged = form.hourly_rate !== '' && Number(form.hourly_rate) !== Number(editItem.hourly_rate ?? 0)
        const typeChanged = isConsultorEdit && (
          form.consultant_type !== ((editItem.consultant_type as string | undefined) ?? (editItem.rate_type === 'hourly' ? 'horista' : ''))
          || form.rate_type !== ((editItem.rate_type as string | undefined) ?? 'hourly')
        )
        const vigenciaChanged = rateChanged || typeChanged
        if (vigenciaChanged && !hourlyRateEffectiveFrom) { setSaving(false); setRateModalOpen(true); return }
        if (vigenciaChanged && hourlyRateEffectiveFrom) { payload.hourly_rate_effective_from = hourlyRateEffectiveFrom }
        await api.put(`/users/${editItem.id}`, payload)
        toast.success('Usuário atualizado')
      } else {
        await api.post('/users', payload)
        toast.success('Usuário criado — e-mail de boas-vindas enviado com a senha de acesso')
      }
      onSaved()
      onClose()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally     { setSaving(false) }
  }

  const resendWelcomeFromModal = async () => {
    if (!editItem) return
    setResendingModal(true)
    try {
      const body: Record<string, string> = {}
      if (resendPwd.trim()) body.password = resendPwd.trim()
      await api.post(`/users/${editItem.id}/resend-welcome`, body)
      toast.success('E-mail de boas-vindas reenviado com sucesso')
      setResendPwd('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao reenviar e-mail') }
    finally { setResendingModal(false) }
  }

  // ── Derived booleans for conditional form fields
  const isCliente     = form.profiles.includes('cliente')
  const isConsultor   = form.profiles.includes('consultor')
  const isCoordenador = form.profiles.includes('coordenador')
  const isParceiroAdm = form.profiles.includes('parceiro_adm')
  // App Password de envio: só admin/administrativo enviam fechamentos a partir do próprio e-mail.
  const showAppPassword = form.profiles.includes('administrator') || form.profiles.includes('administrativo')
  const hasRate       = isConsultor || isCoordenador || isParceiroAdm
  const needsPartner  = isParceiroAdm
  const selectedPartner = partners.find(p => p.id === Number(form.partner_id))
  const partnerIsFixed  = selectedPartner?.pricing_type === 'fixed'

  // Trava: consultor vinculado a parceiro herda o contract_type do parceiro (read-only).
  // O form não gerencia o partner_id de consultor, então usamos o vínculo do user em edição.
  const consultorPartnerBound = isConsultor && !!(editItem?.partner_id ?? editItem?.partner?.id)
  // GET /users/{id} não eager-load a relação partner; resolve o nome pela lista carregada.
  const inheritedPartnerName  = editItem?.partner?.name
    ?? partners.find(p => p.id === Number(editItem?.partner_id))?.name
    ?? null
  // Tipo de contrato (cooperado/clt/pj): Consultor, Coordenador e Parceiro (e demais internos).
  const showContract = form.profiles.length > 0 && !isCliente

  // Folha de pagamento: todos os perfis exceto Cliente (inclui Parceiro e Coordenador).
  const showPayroll = form.profiles.length > 0 && !isCliente

  const canSave = !!form.name && !!form.email && form.profiles.length > 0
    && (!isCliente     || !!form.customer_id)
    && (!isConsultor   || !!form.consultant_type)
    && (!isCoordenador || !!form.coordinator_type)
    && (!needsPartner  || !!form.partner_id)

  // Toggle de perfil — adiciona se não tem, remove se já tem
  const toggleProfile = (p: ProfileType) => {
    setForm(f => {
      const profiles = f.profiles[0] === p ? [] : [p]
      return {
        ...f,
        profiles,
        consultant_type:  profiles.includes('consultor')    ? f.consultant_type  : '',
        contract_type:    (profiles.length && !profiles.includes('cliente')) ? f.contract_type : '',
        coordinator_type: profiles.includes('coordenador')  ? f.coordinator_type : '',
        customer_id:      profiles.includes('cliente')      ? f.customer_id : '',
        partner_id:       profiles.includes('parceiro_adm') ? f.partner_id  : '',
      }
    })
  }

  if (!open) return null

  return (
    <ModalOverlay onClose={onClose}>
      <div className="p-5 max-h-[90vh] overflow-y-auto space-y-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">
          {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
        </h3>

        {loadingItem ? (
          <p className="text-xs text-[var(--text-light)] py-6 text-center">Carregando…</p>
        ) : (
        <>
        {/* ── Perfil de acesso (multi-seleção aditiva) ── */}
        <div>
          <Label className="text-xs text-[var(--text-muted)] mb-1 block">Perfil de acesso *</Label>
          <p className="text-[10px] text-[var(--text-light)] mb-2">Selecione um ou mais perfis — os acessos se somam.</p>
          <div className="grid grid-cols-3 gap-2">
            {PROFILE_OPTIONS.map(opt => {
              const active        = form.profiles.includes(opt.value)
              const isAdminOption = opt.value === 'administrator'
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleProfile(opt.value)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                    active
                      ? isAdminOption
                        ? 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)]'
                        : 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)]'
                      : isAdminOption
                        ? 'bg-[var(--surface-hover)] border-[var(--warning-border)] text-[var(--warning)] hover:border-[var(--warning-border)]'
                        : 'bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span className={`mr-1.5 inline-block w-3 h-3 rounded border text-center leading-[10px] ${
                    active
                      ? isAdminOption ? 'border-[var(--warning-border)] bg-[var(--warning-border)] text-[var(--primary-fg)]' : 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]'
                      : 'border-[var(--border-strong)]'
                  }`}>{active ? '✓' : ''}</span>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Campos comuns ── */}
        {form.profiles.length > 0 && (
          <>
            <div>
              <Label className="text-xs text-[var(--text-muted)]">Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
            </div>
            <div>
              <Label className="text-xs text-[var(--text-muted)]">E-mail *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
            </div>
            {showAppPassword && (
              <div>
                <Label className="text-xs text-[var(--text-muted)]">App Password (envio de e-mail)</Label>
                <Input type="password" value={form.smtp_app_password}
                  onChange={e => setForm(f => ({ ...f, smtp_app_password: e.target.value }))}
                  placeholder={isEdit ? 'Deixe em branco para manter a atual' : ''}
                  autoComplete="off"
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                <p className="mt-1 text-[10px] text-[var(--text-light)]">
                  Senha de aplicativo do Office 365 para enviar os fechamentos a partir do e-mail deste usuário. Deixe em branco para manter a atual.
                </p>
              </div>
            )}

            {!isEdit && (
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Senha inicial</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Deixe vazio para gerar automaticamente"
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                <p className="mt-1 text-[10px] text-[var(--text-light)]">
                  {form.password
                    ? 'O usuário receberá esta senha por e-mail de boas-vindas.'
                    : 'Uma senha aleatória será gerada e enviada por e-mail ao usuário.'}
                </p>
              </div>
            )}

            {/* ── Reenviar boas-vindas (apenas edição) ── */}
            {isEdit && canResetPwd && (
              <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface-hover)] space-y-2">
                <p className="text-xs font-medium text-[var(--text)] flex items-center gap-1.5">
                  <Mail size={12} className="text-[var(--primary)]" />
                  Reenviar e-mail de boas-vindas
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={resendPwd}
                    onChange={e => setResendPwd(e.target.value)}
                    placeholder="Senha predefinida (deixe vazio para gerar nova)"
                    className="flex-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={resendWelcomeFromModal}
                    disabled={resendingModal}
                    className="flex items-center gap-1.5 px-3 h-8 bg-[var(--primary-soft)] hover:bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)] rounded-md text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <Mail size={11} />
                    {resendingModal ? 'Enviando...' : 'Reenviar'}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-light)]">
                  {resendPwd.trim()
                    ? 'O usuário receberá esta senha no e-mail de boas-vindas.'
                    : 'Uma nova senha temporária será gerada e enviada automaticamente.'}
                </p>
              </div>
            )}

            {/* ── Remuneração (Consultor / Coordenador / Parceiro) ── */}
            {hasRate && isParceiroAdm && partnerIsFixed ? (
              <div className="text-[10px] text-[var(--text-light)] bg-[var(--surface-hover)] rounded-md px-3 py-2 border border-[var(--border)]">
                Valor hora definido pelo parceiro:{' '}
                <span className="text-[var(--primary)] font-medium">
                  R$ {selectedPartner?.hourly_rate ? Number(selectedPartner.hourly_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}/h
                </span>
              </div>
            ) : hasRate && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-[var(--text-muted)]">Remuneração</Label>
                  {isEdit && (
                    <button type="button" onClick={openRateHistory}
                      className="text-[10px] font-medium text-[var(--primary)] hover:underline">
                      Histórico de valores
                    </button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {/* Consultor: tipo fixado pelo tipo de consultor; outros: toggle manual */}
                  {isConsultor ? (
                    <span className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-xs text-[var(--text-muted)] font-medium whitespace-nowrap">
                      {form.rate_type === 'hourly' ? 'Por Hora' : 'Fixo'}
                    </span>
                  ) : (
                    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                      {(['hourly', 'monthly'] as const).map(t => (
                        <button key={t} type="button"
                          onClick={() => setForm(f => ({ ...f, rate_type: t }))}
                          className={`px-3 py-1.5 font-medium transition-colors ${
                            form.rate_type === t
                              ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                              : 'bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)]'
                          }`}>
                          {t === 'hourly' ? 'Por Hora' : 'Fixo'}
                        </button>
                      ))}
                    </div>
                  )}
                  <Input type="number" min="0" step="0.01" value={form.hourly_rate}
                    onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    placeholder="0,00"
                    className="flex-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs" />
                  <span className="text-xs text-[var(--text-light)]">R$</span>
                </div>
              </div>
            )}

            {/* ── Horas/dia útil (Banco de Horas apenas) ── */}
            {isConsultor && form.consultant_type === 'banco_de_horas' && (
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1 block">Horas por dia útil (Banco de Horas)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min="1" max="24" step="0.5" value={form.daily_hours}
                    onChange={e => setForm(f => ({ ...f, daily_hours: e.target.value }))}
                    placeholder="8"
                    className="w-24 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs" />
                  <span className="text-xs text-[var(--text-light)]">h/dia (padrão: 8h)</span>
                </div>
              </div>
            )}

            {/* ── Data de Início (proporcional) ── */}
            {isConsultor && !!form.consultant_type && (
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1 block">Data de Início</Label>
                <Input
                  type="date"
                  value={form.bank_hours_start_date}
                  onChange={e => setForm(f => ({ ...f, bank_hours_start_date: e.target.value }))}
                  className="w-44 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs"
                />
                <p className="text-xs text-[var(--text-light)] mt-1">
                  {form.consultant_type === 'banco_de_horas'
                    ? 'Meses anteriores não entram no banco; mês de entrada calculado proporcionalmente'
                    : form.consultant_type === 'horista' && form.guaranteed_hours
                      ? `Se entrou no meio do mês, o pagamento e as ${form.guaranteed_hours}h garantidas serão calculados proporcionalmente aos dias úteis do mês de entrada.`
                      : 'Se entrou no meio do mês, o pagamento será calculado proporcionalmente aos dias úteis'}
                </p>
              </div>
            )}

            {/* ── Cliente: seleciona empresa (com busca por texto) ── */}
            {isCliente && (
              <FieldSearchSelect
                label="Empresa *"
                value={form.customer_id}
                onChange={v => setForm(f => ({ ...f, customer_id: v === '' ? '' : Number(v) }))}
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Selecione a empresa..."
              />
            )}

            {/* ── Consultor: tipo de consultor (colapsável) ── */}
            {isConsultor && (
              <ConsultantTypeCard
                value={form.consultant_type}
                onChange={(opt) => setForm(f => ({
                  ...f,
                  consultant_type: opt,
                  rate_type: opt === 'horista' ? 'hourly' : 'monthly',
                }))}
              />
            )}


            {/* ── Horas garantidas (Horista apenas) ── */}
            {isConsultor && form.consultant_type === 'horista' && (
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1 block">Horas garantidas / mês</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" max="744" step="1"
                    value={form.guaranteed_hours}
                    onChange={e => setForm(f => ({ ...f, guaranteed_hours: e.target.value }))}
                    placeholder="Ex: 160"
                    className="w-28 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs" />
                  <span className="text-xs text-[var(--text-light)]">h/mês (piso mínimo de cobrança)</span>
                </div>
                <p className="text-[10px] text-[var(--text-light)] mt-1">
                  Se fizer menos horas, paga como se tivesse feito este mínimo.
                </p>
              </div>
            )}

            {/* ── Coordenador: tipo (Projetos ou Sustentação) ── */}
            {isCoordenador && (
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1 block">Área do Coordenador *</Label>
                <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                  {([['projetos', 'Projetos'], ['sustentacao', 'Sustentação']] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setForm(f => ({ ...f, coordinator_type: val }))}
                      className={`flex-1 px-3 py-2 font-medium transition-colors ${
                        form.coordinator_type === val
                          ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                          : 'bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Permissões adicionais agora vivem em Grupos de Permissões (Settings → Grupos).
                Removida a seção inline pra evitar conflito com permissões herdadas de grupo. */}

            {/* ── Parceiro: seleciona empresa + define se é ADM ── */}
            {isParceiroAdm && (
              <div className="space-y-3">
                <FieldSelect
                  label="Empresa parceira *"
                  value={form.partner_id}
                  onChange={v => setForm(f => ({ ...f, partner_id: v === '' ? '' : Number(v) }))}
                  options={partners.map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Selecione o parceiro..."
                />
                <Toggle
                  value={form.is_partner_adm}
                  onChange={() => setForm(f => ({ ...f, is_partner_adm: !f.is_partner_adm }))}
                  label="É administrador do parceiro"
                />
              </div>
            )}

            {/* ── Tipo de Contrato (Consultor ou Parceiro) ── */}
            {showContract && (
              consultorPartnerBound ? (
                // Consultor vinculado a parceiro: herdado, somente leitura.
                <div>
                  <Label className="text-xs text-[var(--text-muted)] mb-1 block">Tipo de Contrato</Label>
                  <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-hover)] h-9 px-3">
                    <span className="text-xs text-[var(--text-muted)]">
                      {contractLabel(editItem?.contract_type)}
                    </span>
                    <span className="text-[10px] text-[var(--text-light)]">
                      Herdado do parceiro{inheritedPartnerName ? ` (${inheritedPartnerName})` : ''}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <FieldSelect
                    label="Tipo de Contrato"
                    value={form.contract_type}
                    onChange={v => setForm(f => ({ ...f, contract_type: v === '' ? '' : (v as ContractType) }))}
                    options={CONTRACT_OPTIONS}
                    placeholder="—"
                  />
                  {isParceiroAdm && (
                    <p className="text-[10px] text-[var(--text-light)] mt-1">
                      Define o tipo de contrato de todos os consultores deste parceiro.
                    </p>
                  )}
                </div>
              )
            )}

            {/* ── Folha de pagamento (perfis internos: exceto Cliente/Parceiro) ── */}
            {showPayroll && (
              <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface-hover)] space-y-3">
                <p className="text-xs font-semibold text-[var(--text)]">Folha de pagamento</p>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Nome Completo</Label>
                  <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Nome completo conforme documento"
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-[var(--text-muted)]">CPF</Label>
                    <Input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: formatCpf(e.target.value) }))}
                      placeholder="000.000.000-00" inputMode="numeric"
                      className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs text-[var(--text-muted)]">Matrícula</Label>
                    <Input value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))}
                      placeholder="Ex: 26434"
                      className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                  </div>
                  <div className="w-40">
                    <Label className="text-xs text-[var(--text-muted)]">Data de nascimento</Label>
                    <Input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                      title="Usada na campanha de aniversário"
                      className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                  </div>
                </div>
                <FieldSelect
                  label="Status"
                  value={form.payroll_status}
                  onChange={v => setForm(f => ({ ...f, payroll_status: v }))}
                  options={PAYROLL_STATUS_OPTIONS}
                />
              </div>
            )}

            {/* ── Sustentação: apontamento manual ── */}
            {(isConsultor || isParceiroAdm) && (
              <Toggle
                value={form.can_timesheet_sustentacao}
                onChange={() => setForm(f => ({ ...f, can_timesheet_sustentacao: !f.can_timesheet_sustentacao }))}
                label="Pode apontar manualmente em sustentação"
              />
            )}

            {/* ── Funcionário Bizify (separa do resultado ERPSERV no fechamento) ── */}
            {isConsultor && (
              <Toggle
                value={form.is_bizify}
                onChange={() => setForm(f => ({ ...f, is_bizify: !f.is_bizify }))}
                label="Funcionário Bizify (sai dos cards ERPSERV e vai pra aba Bizify no fechamento)"
              />
            )}

            {/* ── Diretor de Projetos (recebe e-mails das fases do contrato — Triagem) ── */}
            {!form.profiles.includes('cliente') && (
              <Toggle
                value={form.is_diretor_projetos}
                onChange={() => setForm(f => ({ ...f, is_diretor_projetos: !f.is_diretor_projetos }))}
                label="Diretor de Projetos (recebe os e-mails das fases do contrato)"
              />
            )}

            {/* ── É coordenador? — só p/ perfis NÃO-coordenador-nativos (admin/administrativo);
                   coordenador nativo já é coordenador por definição. Marca o usuário para
                   aparecer nas colunas do Kanban de Contratos e no filtro de coordenadores. ── */}
            {form.profiles[0] && !['coordenador', 'cliente', 'parceiro_admin'].includes(resolveTypeForBackend(form.profiles[0])) && (
              <Toggle
                value={form.is_coordinator}
                onChange={() => setForm(f => ({ ...f, is_coordinator: !f.is_coordinator }))}
                label="É coordenador (aparece no Kanban de Contratos e no filtro de coordenadores)"
              />
            )}
            {/* ── Permissão para chamar @bot no chat ── */}
            <Toggle
              value={form.can_use_bot}
              onChange={() => setForm(f => ({ ...f, can_use_bot: !f.can_use_bot }))}
              label="Pode usar @bot no chat (IA do Minutor)"
            />

            {/* ── Áreas que este user pode consultar via @bot ── */}
            {form.can_use_bot && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
                    Permissões deste user no BOT
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const profileType = form.profiles[0] ? resolveTypeForBackend(form.profiles[0]) : null
                      if (!profileType) { toast.error('Selecione um perfil de acesso primeiro'); return }
                      try {
                        const r = await listPermissionProfiles()
                        const p = r.data.find(x => x.profile_type === profileType)
                        if (!p) { toast.error(`Sem política para perfil ${profileType}`); return }
                        setForm(f => ({
                          ...f,
                          can_use_bot:         p.can_use_bot,
                          bot_allowed_scopes:  p.allowed_scopes,
                          bot_visibility:      p.visibility,
                          bot_scope_overrides: p.scope_overrides,
                        }))
                        toast.success(`Aplicado padrão de "${p.label}"`)
                      } catch (e) {
                        toast.error((e as Error).message)
                      }
                    }}
                    className="text-[11px] text-emerald-300 hover:underline"
                  >
                    Resetar para padrão do perfil
                  </button>
                </div>
                <BotScopesEditor
                  value={form.bot_allowed_scopes}
                  onChange={scopes => setForm(f => ({ ...f, bot_allowed_scopes: scopes }))}
                />
                <BotVisibilityEditor
                  visibility={form.bot_visibility}
                  overrides={form.bot_scope_overrides}
                  onChangeVisibility={v => setForm(f => ({ ...f, bot_visibility: v }))}
                  onChangeOverrides={o => setForm(f => ({ ...f, bot_scope_overrides: o }))}
                />
              </>
            )}

            {/* ── Desligar notificações de chat por email ── */}
            <Toggle
              value={!form.inbox_email_disabled}
              onChange={() => setForm(f => ({ ...f, inbox_email_disabled: !f.inbox_email_disabled }))}
              label="Receber digest de mensagens não lidas por email"
            />

            {/* ── Assinatura padrão (perfis internos) ── */}
            {!form.profiles.includes('cliente') && (
              <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
                <div className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                  <PenLine size={14} /> Assinatura
                </div>
                <SignatureEditor value={form.signature} onChange={s => setForm(f => ({ ...f, signature: { ...f.signature, ...s } }))} name={form.name} email={form.email} userId={userId ?? 0} />
              </div>
            )}

            {/* ── Ativo ── */}
            <Toggle
              value={form.enabled}
              onChange={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              label="Ativo"
            />
          </>
        )}

        <div className="flex gap-2 pt-1 justify-end">
          <Button variant="outline" onClick={onClose}
            className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
          <Button onClick={() => save()} disabled={saving || !canSave}
            className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
        </>
        )}
      </div>

      {/* Vigência do novo valor-hora */}
      {rateModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <p className="text-sm font-semibold text-[var(--text)] mb-3">Vigência da alteração</p>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)] mb-4">
              A partir de qual mês essa alteração (valor hora / tipo) passa a valer? Meses anteriores (fechamentos já feitos) não mudam.
            </p>
            <div className="mb-5">
              <Label className="text-xs text-[var(--text-muted)] mb-1 block">Mês de vigência</Label>
              <Input
                type="month"
                value={rateEffectiveMonth}
                min={new Date().toISOString().slice(0, 7)}
                onChange={e => setRateEffectiveMonth(e.target.value)}
                className="bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setRateModalOpen(false)}
                className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
              <Button
                onClick={() => { setRateModalOpen(false); save(`${rateEffectiveMonth}-01`) }}
                disabled={!rateEffectiveMonth}
                className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico de valores-hora (somente leitura) */}
      {rateHistoryOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[var(--text)]">Histórico de valores</p>
              <button onClick={() => setRateHistoryOpen(false)} className="text-[var(--text-light)] hover:text-[var(--text)]">
                <X size={16} />
              </button>
            </div>
            {rateHistoryLoading ? (
              <p className="text-xs text-[var(--text-light)] py-6 text-center">Carregando…</p>
            ) : rateHistory.length === 0 ? (
              <p className="text-xs text-[var(--text-light)] py-6 text-center">Nenhuma alteração registrada.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-hover)] text-[var(--text-muted)]">
                      <th className="text-left font-semibold px-3 py-2">Vigência</th>
                      <th className="text-left font-semibold px-3 py-2">Valor</th>
                      <th className="text-left font-semibold px-3 py-2">Alterado por</th>
                      <th className="text-left font-semibold px-3 py-2">Em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateHistory.filter((h: any, i: number, a: any[]) => a.findIndex((x: any) => String(x.created_at ?? '').slice(0, 10) === String(h.created_at ?? '').slice(0, 10)) === i).map((h, i) => (
                      <tr key={h.id ?? i} className="border-t border-[var(--border)] text-[var(--text)]">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {h.effective_from
                            ? (() => { const [y, m] = String(h.effective_from).slice(0, 7).split('-'); return `${m}/${y}` })()
                            : <span title="vigência não informada (legado)" className="text-[var(--text-light)]">—</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {h.old_hourly_rate != null ? Number(h.old_hourly_rate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                          <span className="text-[var(--text-light)]"> → </span>
                          {h.new_hourly_rate != null ? Number(h.new_hourly_rate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </td>
                        <td className="px-3 py-2">{h.changed_by_user?.name ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">
                          {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-end mt-5">
              <Button variant="outline" onClick={() => setRateHistoryOpen(false)}
                className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </ModalOverlay>
  )
}
