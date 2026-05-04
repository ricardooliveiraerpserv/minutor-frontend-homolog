'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useCallback, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, ChevronDown,
  Search, KeyRound, Check, Copy, Eye, Mail, Square, CheckSquare2
} from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { RowMenu } from '@/components/ui/row-menu'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: number
  name: string
  email: string
  enabled: boolean
  hourly_rate?: number
  rate_type?: string
  daily_hours?: number
  bank_hours_start_date?: string | null
  consultant_type?: string | null
  coordinator_type?: 'projetos' | 'sustentacao' | null
  guaranteed_hours?: number | null
  customer_id?: number | null
  partner_id?: number | null
  partner?: { id: number; name: string } | null
  is_executive?: boolean
  type?: string | null
  extra_permissions?: string[]
  created_at: string
}

const COORDINATOR_PERMISSIONS: { key: string; label: string; desc: string }[] = [
  { key: 'users.reset_password', label: 'Redefinição de senha',    desc: 'Pode resetar a senha de qualquer usuário' },
  { key: 'users.view_all',       label: 'Visualizar usuários',     desc: 'Pode ver todos os usuários cadastrados' },
  { key: 'users.create',         label: 'Criar usuários',          desc: 'Pode criar novos usuários' },
  { key: 'users.update',         label: 'Editar usuários',         desc: 'Pode editar dados de usuários' },
  { key: 'hora_banco.view',      label: 'Banco de Horas',          desc: 'Acesso à página de banco de horas' },
  { key: 'settings.view',        label: 'Configurações',           desc: 'Acesso às configurações do sistema' },
]

interface CustomerOption { id: number; name: string }
interface PartnerOption  { id: number; name: string; pricing_type?: 'fixed' | 'variable'; hourly_rate?: string | null }

// ─── Profile type logic ───────────────────────────────────────────────────────

type ProfileType    = 'cliente' | 'consultor' | 'coordenador' | 'parceiro_adm' | 'administrator' | 'administrativo'
type ConsultantType = 'horista' | 'banco_de_horas' | 'fixo'

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300">
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
        className={`w-8 h-4 rounded-full transition-colors relative ${value ? 'bg-blue-600' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
      <Label className="text-xs text-zinc-400">{label}</Label>
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
      <Label className="text-xs text-zinc-400">{label}</Label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md h-9 px-2 appearance-none outline-none">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
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
      <Label className="text-xs text-zinc-400 mb-1 block">Tipo de Consultor *</Label>
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
        {/* Cabeçalho: mostra selecionado + toggle */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-zinc-700/40 transition-colors"
        >
          <span className={selected ? 'text-zinc-300 font-medium' : 'text-zinc-500'}>
            {selected ? selected.label : 'Selecione o tipo...'}
          </span>
          <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Legenda do tipo selecionado */}
        {selected && !open && (
          <div className="px-3 pb-2 text-[10px] text-zinc-500">{selected.desc}</div>
        )}

        {/* Opções dentro do mesmo card */}
        {open && (
          <div className="border-t border-zinc-700/60 px-2 pb-2 pt-1.5 space-y-1">
            {CONSULTANT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full flex flex-col items-start px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                  value === opt.value
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200'
                }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${value === opt.value ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                  <span className="font-medium">{opt.label}</span>
                </div>
                <span className="text-[10px] text-zinc-500 pl-3.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <tr key={i} className="border-b border-zinc-800">
          {[...Array(5)].map((_, j) => (
            <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-zinc-700">↕</span>
  return <span className="ml-1 text-blue-400">{dir === 'asc' ? '↑' : '↓'}</span>
}

// ─── Initial form state ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  enabled: true,
  hourly_rate: '',
  rate_type: 'hourly' as 'hourly' | 'monthly',
  daily_hours: '8',
  bank_hours_start_date: '',
  guaranteed_hours: '',
  profiles: [] as ProfileType[],
  consultant_type: 'horista' as ConsultantType | '',
  coordinator_type: '' as 'projetos' | 'sustentacao' | '',
  is_partner_consultor: false,
  is_partner_adm: false,
  customer_id: '' as number | '',
  partner_id: '' as number | '',
  extra_permissions: [] as string[],
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: authUser } = useAuth()
  const isAdmin      = authUser?.type === 'admin'
  const ep: string[] = (authUser as any)?.permissions ?? authUser?.extra_permissions ?? []
  const canCreate    = isAdmin || ep.includes('users.create')
  const canView      = isAdmin || ep.includes('users.view_all')
  const canEdit      = isAdmin || ep.includes('users.update')
  const canDelete    = isAdmin
  const canResetPwd  = isAdmin || ep.includes('users.reset_password')

  const [users,     setUsers]     = useState<UserItem[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [partners,  setPartners]  = useState<PartnerOption[]>([])
  const [loading,   setLoading]   = useState(true)
  const [hasNext, setHasNext] = useState(false)

  const { filters: flt, set: setFilter } = usePersistedFilters(
    'users',
    authUser?.id,
    { search: '', filterEnabled: '', filterRole: '', filterPartner: '', sort: 'name', sortDir: 'asc' as 'asc' | 'desc', page: 1 },
  )
  const { search, filterEnabled, filterRole, filterPartner, sort, sortDir, page } = flt
  const setSearch        = (v: string) => setFilter('search', v)
  const setFilterEnabled = (v: string) => setFilter('filterEnabled', v)
  const setFilterRole    = (v: string) => { setFilter({ filterRole: v, filterPartner: '', page: 1 } as any) }
  const setFilterPartner = (v: string) => setFilter('filterPartner', v)
  const setSort = (field: string) => {
    if (sort === field) {
      setFilter('sortDir', (sortDir === 'asc' ? 'desc' : 'asc') as any)
    } else {
      setFilter({ sort: field, sortDir: 'asc' } as any)
    }
  }
  const setPage          = (v: number) => setFilter('page', v)
  const [viewUser,        setViewUser]        = useState<UserItem | null>(null)
  const [rateHistory,     setRateHistory]     = useState<any[]>([])
  const [rateHistLoading, setRateHistLoading] = useState(false)
  const [modal,      setModal]      = useState<{ open: boolean; item?: UserItem }>({ open: false })
  const [resetModal, setResetModal] = useState<{
    open: boolean
    userId?: number
    userName?: string
    userEmail?: string
    tempPassword?: string
    emailSent?: boolean
    confirmed: boolean
  }>({ open: false, confirmed: false })
  const [form,     setForm]     = useState({ ...EMPTY_FORM })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [resetting,setResetting]= useState<number | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [deleteConfirm,  setDeleteConfirm]  = useState<{ open: boolean; id?: number }>({ open: false })
  const [selectedIds,    setSelectedIds]    = useState<Set<number>>(new Set())
  const [resending,      setResending]      = useState<number | null>(null)
  const [bulkResending,  setBulkResending]  = useState(false)
  const [bulkDeleting,   setBulkDeleting]   = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [resendPwd,      setResendPwd]      = useState('')
  const [resendingModal, setResendingModal] = useState(false)

  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r =>
      setCustomers(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})
    api.get<any>('/partners?pageSize=-1').then(r =>
      setPartners(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '100' })
      if (search)        p.set('search', search)
      if (filterEnabled) p.set('enabled', filterEnabled)
      if (filterRole)    p.set('role', filterRole)
      if (filterPartner) p.set('partner_id', filterPartner)
      p.set('order', sortDir === 'desc' ? `-${sort}` : sort)
      const r = await api.get<{ items?: UserItem[]; data?: UserItem[]; hasNext?: boolean; meta?: { last_page: number } }>(`/users?${p}`)
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(list)
      setSelectedIds(new Set())
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar usuários') }
    finally   { setLoading(false) }
  }, [page, search, filterEnabled, filterRole, filterPartner, sort, sortDir])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setResendPwd('')
    setModal({ open: true })
  }

  const openEdit = (item: UserItem) => {
    setResendPwd('')
    const profile = resolveProfileFromType(item.type)
    const profiles = profile ? [profile] : []
    // Prefer stored consultant_type; fall back only for horista (hourly)
    const consultant_type = (item.consultant_type as ConsultantType | undefined)
      ?? (item.rate_type === 'hourly' ? 'horista' : '')
    setForm({
      name:                item.name,
      email:               item.email,
      password:            '',
      enabled:             item.enabled,
      hourly_rate:         item.hourly_rate ? String(item.hourly_rate) : '',
      rate_type:           (item.rate_type as 'hourly' | 'monthly') ?? 'hourly',
      daily_hours:            item.daily_hours != null ? String(item.daily_hours) : '8',
      bank_hours_start_date:  item.bank_hours_start_date ?? '',
      guaranteed_hours:       item.guaranteed_hours != null ? String(item.guaranteed_hours) : '',
      profiles,
      consultant_type:      consultant_type as ConsultantType | '',
      coordinator_type:     (item.coordinator_type as 'projetos' | 'sustentacao' | undefined) ?? '',
      is_partner_consultor: false,
      is_partner_adm:       item.is_executive ?? false,
      customer_id:          item.customer_id ?? '',
      partner_id:           item.partner_id  ?? '',
      extra_permissions:    item.extra_permissions ?? [],
    })
    setModal({ open: true, item })
  }

  const save = async () => {
    if (form.profiles.length === 0) { toast.error('Selecione ao menos um perfil de acesso'); return }

    const needsPartner = form.profiles.includes('parceiro_adm')

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:        form.name,
        email:       form.email,
        enabled:     form.enabled,
        type:        resolveTypeForBackend(form.profiles[0]),
        customer_id:  form.profiles.includes('cliente') && form.customer_id ? form.customer_id : null,
        partner_id:   needsPartner && form.partner_id ? form.partner_id : null,
        is_executive: form.profiles.includes('parceiro_adm') ? form.is_partner_adm : false,
        rate_type:    form.rate_type,
      }
      if (form.hourly_rate) payload.hourly_rate = parseFloat(form.hourly_rate)
      if (form.daily_hours) payload.daily_hours = parseFloat(form.daily_hours)
      if (form.profiles.includes('consultor') && form.consultant_type) {
        payload.consultant_type       = form.consultant_type
        payload.bank_hours_start_date = form.bank_hours_start_date || null
        if (form.consultant_type === 'horista') {
          payload.guaranteed_hours = form.guaranteed_hours ? parseFloat(form.guaranteed_hours) : null
        }
      }
      if (form.profiles.includes('coordenador')) {
        payload.coordinator_type  = form.coordinator_type || null
        payload.extra_permissions = form.extra_permissions
      }
      if (!modal.item && form.password) payload.password = form.password

      if (modal.item) {
        await api.put(`/users/${modal.item.id}`, payload)
        toast.success('Usuário atualizado')
      } else {
        await api.post('/users', payload)
        toast.success('Usuário criado — e-mail de boas-vindas enviado com a senha de acesso')
      }
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally     { setSaving(false) }
  }

  // Carrega histórico ao abrir viewUser
  useEffect(() => {
    if (!viewUser) { setRateHistory([]); return }
    setRateHistLoading(true)
    api.get<any>(`/users/${viewUser.id}/hourly-rate-history`)
      .then(r => setRateHistory(r?.data ?? r?.items ?? []))
      .catch(() => setRateHistory([]))
      .finally(() => setRateHistLoading(false))
  }, [viewUser?.id])

  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/users/${deleteConfirm.id}`)
      toast.success('Usuário excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally     { setDeleting(null) }
  }

  // Abre o modal de confirmação — não chama a API ainda
  const resetPassword = (user: UserItem) => {
    setResetModal({ open: true, userId: user.id, userName: user.name, userEmail: user.email, confirmed: false })
  }

  // Confirmação: chama a API, gera a senha e envia e-mail
  const confirmReset = async () => {
    if (!resetModal.userId) return
    setResetting(resetModal.userId)
    try {
      const r = await api.post<{ temporary_password: string; email_sent?: boolean }>(`/users/${resetModal.userId}/reset-password`, {})
      setResetModal(prev => ({ ...prev, tempPassword: r.temporary_password, emailSent: r.email_sent ?? false, confirmed: true }))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao resetar senha')
    } finally {
      setResetting(null)
    }
  }

  const copyPassword = () => {
    if (resetModal.tempPassword) {
      navigator.clipboard.writeText(resetModal.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const resendWelcomeFromModal = async () => {
    if (!modal.item) return
    setResendingModal(true)
    try {
      const body: Record<string, string> = {}
      if (resendPwd.trim()) body.password = resendPwd.trim()
      await api.post(`/users/${modal.item.id}/resend-welcome`, body)
      toast.success('E-mail de boas-vindas reenviado com sucesso')
      setResendPwd('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao reenviar e-mail') }
    finally { setResendingModal(false) }
  }

  const resendWelcome = async (user: UserItem) => {
    setResending(user.id)
    try {
      await api.post(`/users/${user.id}/resend-welcome`, {})
      toast.success(`E-mail de boas-vindas reenviado para ${user.name}`)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao reenviar e-mail') }
    finally { setResending(null) }
  }

  const resendWelcomeBulk = async () => {
    if (selectedIds.size === 0) return
    setBulkResending(true)
    try {
      const r = await api.post<{ message: string; sent: number; failed: number }>(
        '/users/resend-welcome-bulk', { user_ids: [...selectedIds] }
      )
      toast.success(r.message)
      setSelectedIds(new Set())
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao reenviar e-mails') }
    finally { setBulkResending(false) }
  }

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    try {
      const r = await api.delete<{ message: string }>('/users', { ids: [...selectedIds] })
      toast.success(r.message)
      setSelectedIds(new Set())
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir usuários') }
    finally { setBulkDeleting(false); setBulkDeleteConfirm(false) }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === users.length ? new Set() : new Set(users.map(u => u.id)))
  }

  // ── Derived booleans for conditional form fields
  const isCliente     = form.profiles.includes('cliente')
  const isConsultor   = form.profiles.includes('consultor')
  const isCoordenador = form.profiles.includes('coordenador')
  const isParceiroAdm = form.profiles.includes('parceiro_adm')
  const hasRate       = isConsultor || isCoordenador || isParceiroAdm
  const needsPartner  = isParceiroAdm
  const selectedPartner = partners.find(p => p.id === Number(form.partner_id))
  const partnerIsFixed  = selectedPartner?.pricing_type === 'fixed'

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
        coordinator_type: profiles.includes('coordenador')  ? f.coordinator_type : '',
        customer_id:      profiles.includes('cliente')      ? f.customer_id : '',
        partner_id:       profiles.includes('parceiro_adm') ? f.partner_id  : '',
      }
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Usuários">
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nome ou e-mail..."
            className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
        </div>
        <select value={filterEnabled} onChange={e => { setFilterEnabled(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2">
          <option value="">Todos</option>
          <option value="1">Ativos</option>
          <option value="0">Inativos</option>
        </select>
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {([['', 'Todos'], ['cliente', 'Cliente'], ['consultor', 'Consultor'], ['coordenador', 'Coordenador'], ['parceiro_admin', 'Parceiro ADM'], ['admin', 'Admin'], ['administrativo', 'Adm']] as const).map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => setFilterRole(val)}
              className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                filterRole === val
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {filterRole === 'parceiro_admin' && partners.length > 0 && (
          <select
            value={filterPartner}
            onChange={e => { setFilterPartner(e.target.value); setPage(1) }}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2">
            <option value="">Todas as empresas</option>
            {partners.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        )}
        {canCreate && (
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
        )}
      </div>

      {/* Barra de ação em massa */}
      {selectedIds.size > 0 && canResetPwd && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg">
          <span className="text-xs text-zinc-400">{selectedIds.size} usuário(s) selecionado(s)</span>
          <button
            type="button"
            onClick={resendWelcomeBulk}
            disabled={bulkResending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Mail size={12} />
            {bulkResending ? 'Enviando...' : 'Reenviar boas-vindas'}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              {bulkDeleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-zinc-500 hover:text-zinc-300">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border border-zinc-800 overflow-clip">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            <tr className="border-b border-zinc-800 bg-zinc-900">
              {canResetPwd && (
                <th className="px-3 py-2.5 w-8">
                  <button type="button" onClick={toggleSelectAll} className="text-zinc-500 hover:text-zinc-300 flex items-center">
                    {selectedIds.size === users.length && users.length > 0
                      ? <CheckSquare2 size={13} className="text-cyan-400" />
                      : <Square size={13} />}
                  </button>
                </th>
              )}
              <th className="px-3 py-2.5 w-10"></th>
              <th onClick={() => { setSort('name'); setPage(1) }} className="text-left px-3 py-2.5 text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none">
                Nome<SortIcon active={sort === 'name'} dir={sortDir as 'asc' | 'desc'} />
              </th>
              <th onClick={() => { setSort('email'); setPage(1) }} className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell cursor-pointer hover:text-zinc-300 select-none">
                E-mail<SortIcon active={sort === 'email'} dir={sortDir as 'asc' | 'desc'} />
              </th>
              {filterRole === 'parceiro_admin' && (
                <th onClick={() => { setSort('partner_name'); setPage(1) }} className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell cursor-pointer hover:text-zinc-300 select-none">
                  Empresa<SortIcon active={sort === 'partner_name'} dir={sortDir as 'asc' | 'desc'} />
                </th>
              )}
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Perfil</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton /> : users.length === 0 ? (
              <tr><td colSpan={canResetPwd ? 6 : 5} className="px-3 py-8 text-center text-zinc-500">Nenhum usuário encontrado</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className={`border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors ${selectedIds.has(user.id) ? 'bg-cyan-500/5' : ''}`}>
                {canResetPwd && (
                  <td className="px-3 py-2.5 w-8">
                    <button type="button" onClick={() => toggleSelect(user.id)} className="text-zinc-500 hover:text-zinc-300 flex items-center">
                      {selectedIds.has(user.id)
                        ? <CheckSquare2 size={13} className="text-cyan-400" />
                        : <Square size={13} />}
                    </button>
                  </td>
                )}
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    ...(canView     ? [{ label: 'Visualizar',           icon: <Eye      size={12} />, onClick: () => setViewUser(user) }] : []),
                    ...(canEdit     ? [{ label: 'Editar',               icon: <Pencil   size={12} />, onClick: () => openEdit(user) }] : []),
                    ...(canResetPwd ? [{ label: 'Resetar senha',        icon: <KeyRound size={12} />, onClick: () => resetPassword(user), disabled: resetting === user.id }] : []),
                    ...(canResetPwd ? [{ label: 'Reenviar boas-vindas', icon: <Mail     size={12} />, onClick: () => resendWelcome(user), disabled: resending === user.id }] : []),
                    ...(canDelete   ? [{ label: 'Excluir',              icon: <Trash2   size={12} />, onClick: () => remove(user.id), danger: true, disabled: deleting === user.id }] : []),
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{user.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell">{user.email}</td>
                {filterRole === 'parceiro_admin' && (
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {user.partner?.name
                      ? <span className="text-xs font-medium text-zinc-200">{user.partner.name}</span>
                      : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                )}
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1 items-center">
                    {user.type && (
                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                        {PROFILE_OPTIONS.find(o => resolveTypeForBackend(o.value) === user.type)?.label ?? user.type}
                      </Badge>
                    )}
                    {user.type === 'parceiro_admin' && user.is_executive && (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                        Parceiro ADM
                      </Badge>
                    )}
                    {user.consultant_type && (
                      <span className="text-[10px] text-zinc-500">
                        {CONSULTANT_OPTIONS.find(o => o.value === user.consultant_type)?.label ?? user.consultant_type}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={`text-[10px] border ${user.enabled
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}>
                    {user.enabled ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda parceiro */}
      {filterRole === 'parceiro_admin' && !loading && users.length > 0 && (
        <div className="flex items-center gap-4 mt-3 px-1">
          <span className="text-[11px] text-zinc-500">Legenda:</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Parceiro</span>
            <span className="text-[11px] text-zinc-500">Consultor vinculado ao parceiro</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Parceiro ADM</span>
            <span className="text-[11px] text-zinc-500">Administrador da empresa parceira</span>
          </div>
        </div>
      )}

      {/* Paginação */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(page - 1)} disabled={page === 1}
            className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={!hasNext}
            className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* ── Modal criar/editar ── */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5 max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-sm font-semibold text-white">
              {modal.item ? 'Editar Usuário' : 'Novo Usuário'}
            </h3>

            {/* ── Perfil de acesso (multi-seleção aditiva) ── */}
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Perfil de acesso *</Label>
              <p className="text-[10px] text-zinc-500 mb-2">Selecione um ou mais perfis — os acessos se somam.</p>
              <div className="grid grid-cols-3 gap-2">
                {PROFILE_OPTIONS.map(opt => {
                  const active   = form.profiles.includes(opt.value)
                  const isAdmin  = opt.value === 'administrator'
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleProfile(opt.value)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                        active
                          ? isAdmin
                            ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                            : 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : isAdmin
                            ? 'bg-zinc-800 border-amber-800/60 text-amber-500/80 hover:border-amber-600'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <span className={`mr-1.5 inline-block w-3 h-3 rounded border text-center leading-[10px] ${
                        active
                          ? isAdmin ? 'border-amber-400 bg-amber-500 text-white' : 'border-blue-400 bg-blue-500 text-white'
                          : 'border-zinc-600'
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
                  <Label className="text-xs text-zinc-400">Nome *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">E-mail *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                {!modal.item && (
                  <div>
                    <Label className="text-xs text-zinc-400">Senha inicial</Label>
                    <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Deixe vazio para gerar automaticamente"
                      className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {form.password
                        ? 'O usuário receberá esta senha por e-mail de boas-vindas.'
                        : 'Uma senha aleatória será gerada e enviada por e-mail ao usuário.'}
                    </p>
                  </div>
                )}

                {/* ── Reenviar boas-vindas (apenas edição) ── */}
                {modal.item && canResetPwd && (
                  <div className="border border-zinc-700/50 rounded-lg p-3 bg-zinc-800/40 space-y-2">
                    <p className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                      <Mail size={12} className="text-cyan-400" />
                      Reenviar e-mail de boas-vindas
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={resendPwd}
                        onChange={e => setResendPwd(e.target.value)}
                        placeholder="Senha predefinida (deixe vazio para gerar nova)"
                        className="flex-1 bg-zinc-800 border-zinc-700 text-white h-8 text-xs"
                      />
                      <button
                        type="button"
                        onClick={resendWelcomeFromModal}
                        disabled={resendingModal}
                        className="flex items-center gap-1.5 px-3 h-8 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-md text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <Mail size={11} />
                        {resendingModal ? 'Enviando...' : 'Reenviar'}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {resendPwd.trim()
                        ? 'O usuário receberá esta senha no e-mail de boas-vindas.'
                        : 'Uma nova senha temporária será gerada e enviada automaticamente.'}
                    </p>
                  </div>
                )}

                {/* ── Remuneração (Consultor / Coordenador / Parceiro) ── */}
                {hasRate && isParceiroAdm && partnerIsFixed ? (
                  <div className="text-[10px] text-zinc-500 bg-zinc-800/50 rounded-md px-3 py-2 border border-zinc-700/50">
                    Valor hora definido pelo parceiro:{' '}
                    <span className="text-cyan-400 font-medium">
                      R$ {selectedPartner?.hourly_rate ? Number(selectedPartner.hourly_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}/h
                    </span>
                  </div>
                ) : hasRate && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Remuneração</Label>
                    <div className="flex gap-2 items-center">
                      {/* Consultor: tipo fixado pelo tipo de consultor; outros: toggle manual */}
                      {isConsultor ? (
                        <span className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-xs text-zinc-400 font-medium whitespace-nowrap">
                          {form.rate_type === 'hourly' ? 'Por Hora' : 'Fixo'}
                        </span>
                      ) : (
                        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
                          {(['hourly', 'monthly'] as const).map(t => (
                            <button key={t} type="button"
                              onClick={() => setForm(f => ({ ...f, rate_type: t }))}
                              className={`px-3 py-1.5 font-medium transition-colors ${
                                form.rate_type === t
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}>
                              {t === 'hourly' ? 'Por Hora' : 'Fixo'}
                            </button>
                          ))}
                        </div>
                      )}
                      <Input type="number" min="0" step="0.01" value={form.hourly_rate}
                        onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                        placeholder="0,00"
                        className="flex-1 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
                      <span className="text-xs text-zinc-500">R$</span>
                    </div>
                  </div>
                )}

                {/* ── Horas/dia útil (Banco de Horas apenas) ── */}
                {isConsultor && form.consultant_type === 'banco_de_horas' && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Horas por dia útil (Banco de Horas)</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="1" max="24" step="0.5" value={form.daily_hours}
                        onChange={e => setForm(f => ({ ...f, daily_hours: e.target.value }))}
                        placeholder="8"
                        className="w-24 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
                      <span className="text-xs text-zinc-500">h/dia (padrão: 8h)</span>
                    </div>
                  </div>
                )}

                {/* ── Data de Início (proporcional) ── */}
                {isConsultor && !!form.consultant_type && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Data de Início</Label>
                    <Input
                      type="date"
                      value={form.bank_hours_start_date}
                      onChange={e => setForm(f => ({ ...f, bank_hours_start_date: e.target.value }))}
                      className="w-44 bg-zinc-800 border-zinc-700 text-white h-8 text-xs"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      {form.consultant_type === 'banco_de_horas'
                        ? 'Meses anteriores não entram no banco; mês de entrada calculado proporcionalmente'
                        : form.consultant_type === 'horista' && form.guaranteed_hours
                          ? `Se entrou no meio do mês, o pagamento e as ${form.guaranteed_hours}h garantidas serão calculados proporcionalmente aos dias úteis do mês de entrada.`
                          : 'Se entrou no meio do mês, o pagamento será calculado proporcionalmente aos dias úteis'}
                    </p>
                  </div>
                )}

                {/* ── Cliente: seleciona empresa ── */}
                {isCliente && (
                  <FieldSelect
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
                    <Label className="text-xs text-zinc-400 mb-1 block">Horas garantidas / mês</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="0" max="744" step="1"
                        value={form.guaranteed_hours}
                        onChange={e => setForm(f => ({ ...f, guaranteed_hours: e.target.value }))}
                        placeholder="Ex: 160"
                        className="w-28 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
                      <span className="text-xs text-zinc-500">h/mês (piso mínimo de cobrança)</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Se fizer menos horas, paga como se tivesse feito este mínimo.
                    </p>
                  </div>
                )}

                {/* ── Coordenador: tipo (Projetos ou Sustentação) ── */}
                {isCoordenador && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Área do Coordenador *</Label>
                    <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
                      {([['projetos', 'Projetos'], ['sustentacao', 'Sustentação']] as const).map(([val, label]) => (
                        <button key={val} type="button"
                          onClick={() => setForm(f => ({ ...f, coordinator_type: val }))}
                          className={`flex-1 px-3 py-2 font-medium transition-colors ${
                            form.coordinator_type === val
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Coordenador: permissões adicionais ── */}
                {isCoordenador && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Permissões Adicionais</Label>
                    <div className="space-y-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                      {COORDINATOR_PERMISSIONS.map(perm => {
                        const active = form.extra_permissions.includes(perm.key)
                        return (
                          <button
                            key={perm.key}
                            type="button"
                            onClick={() => setForm(f => ({
                              ...f,
                              extra_permissions: active
                                ? f.extra_permissions.filter(p => p !== perm.key)
                                : [...f.extra_permissions, perm.key],
                            }))}
                            className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md text-xs text-left transition-colors ${
                              active
                                ? 'bg-blue-600/15 border border-blue-500/30'
                                : 'hover:bg-zinc-700/50 border border-transparent'
                            }`}
                          >
                            <span className={`mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                              active ? 'border-blue-400 bg-blue-500 text-white' : 'border-zinc-600'
                            }`}>
                              {active && <Check size={9} />}
                            </span>
                            <div>
                              <p className={`font-medium leading-tight ${active ? 'text-blue-300' : 'text-zinc-300'}`}>{perm.label}</p>
                              <p className="text-[10px] text-zinc-500 mt-0.5">{perm.desc}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

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

                {/* ── Ativo ── */}
                <Toggle
                  value={form.enabled}
                  onChange={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                  label="Ativo"
                />
              </>
            )}

            <div className="flex gap-2 pt-1 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !canSave}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal reset senha ── */}
      {resetModal.open && (
        <ModalOverlay onClose={() => setResetModal({ open: false, confirmed: false })}>
          <div className="p-5">
            {!resetModal.confirmed ? (
              // ── Passo 1: confirmação ──
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-yellow-500/15 shrink-0">
                    <KeyRound size={15} className="text-yellow-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Resetar senha</h3>
                </div>
                <p className="text-xs text-zinc-400 mb-1">
                  Uma nova senha temporária será gerada para:
                </p>
                <p className="text-xs font-semibold text-white mb-0.5">{resetModal.userName}</p>
                <p className="text-xs text-zinc-500 mb-4">{resetModal.userEmail}</p>
                <p className="text-xs text-zinc-500 mb-5 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                  A senha será exibida na tela para você copiar <span className="text-zinc-300 font-medium">e um e-mail será enviado automaticamente</span> ao usuário com as instruções de acesso.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setResetModal({ open: false, confirmed: false })}
                    className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
                  <Button onClick={confirmReset} disabled={resetting === resetModal.userId}
                    className="h-8 text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white gap-1.5">
                    <KeyRound size={12} />
                    {resetting === resetModal.userId ? 'Gerando...' : 'Confirmar e Enviar E-mail'}
                  </Button>
                </div>
              </>
            ) : (
              // ── Passo 2: senha gerada ──
              <>
                <h3 className="text-sm font-semibold text-white mb-1">Senha gerada com sucesso</h3>
                <p className="text-xs text-zinc-400 mb-2">Copie a senha abaixo para repassar ao usuário.</p>
                {resetModal.emailSent ? (
                  <p className="text-xs mb-4 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                    E-mail enviado para <span className="font-medium">{resetModal.userEmail}</span>
                  </p>
                ) : (
                  <p className="text-xs mb-4 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                    Falha ao enviar e-mail — repasse a senha manualmente ao usuário.
                  </p>
                )}
                <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm text-yellow-300 font-mono tracking-wider">
                    {resetModal.tempPassword}
                  </code>
                  <button onClick={copyPassword} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <Button onClick={() => setResetModal({ open: false, confirmed: false })}
                  className="mt-4 w-full h-8 text-xs bg-zinc-700 hover:bg-zinc-600 text-white">
                  Fechar
                </Button>
              </>
            )}
          </div>
        </ModalOverlay>
      )}
      {/* ── Modal de Visualização ── */}
      {viewUser && (() => {
        const u = viewUser
        const profile = resolveProfileFromType(u.type)
        const profileLabel = profile
          ? (PROFILE_OPTIONS.find(o => o.value === profile)?.label ?? profile)
          : (u.type ?? '—')
        const rows: { label: string; value: string | React.ReactNode }[] = [
          { label: 'Nome',   value: u.name },
          { label: 'E-mail', value: u.email },
          { label: 'Perfil', value: profileLabel },
          { label: 'Status', value: u.enabled
              ? <span className="text-green-400 text-xs font-medium">Ativo</span>
              : <span className="text-zinc-400 text-xs">Inativo</span> },
        ]
        if (u.hourly_rate != null) rows.push({ label: 'Remuneração', value: `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(u.hourly_rate))} ${u.rate_type === 'monthly' ? '/ mês' : '/ hora'}` })
        if (u.daily_hours != null) rows.push({ label: 'Horas/dia útil', value: `${u.daily_hours}h` })
        if (u.guaranteed_hours != null && u.consultant_type === 'horista') rows.push({
          label: 'Horas garantidas',
          value: <span className="text-right">{u.guaranteed_hours}h/mês <span className="text-zinc-500">(piso mínimo de cobrança)</span></span>
        })
        return (
          <ModalOverlay onClose={() => setViewUser(null)}>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{ background: 'rgba(0,245,255,0.12)', color: 'var(--brand-primary)' }}>
                  {u.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{u.name}</p>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {rows.map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                    <span className="text-xs text-zinc-500">{row.label}</span>
                    <span className="text-xs text-zinc-200 text-right">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* ── Histórico de alterações ── */}
              {rateHistLoading && (
                <p className="text-[10px] text-zinc-500 mt-4">Carregando histórico...</p>
              )}
              {!rateHistLoading && rateHistory.length > 0 && (
                <div className="mt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Histórico de Alterações</p>
                  <div className="rounded-lg overflow-clip border border-zinc-800">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 z-10 bg-zinc-900">
                        <tr className="border-b border-zinc-800 bg-zinc-900">
                          <th className="text-left px-3 py-2 text-zinc-500 font-medium">Data</th>
                          <th className="text-left px-3 py-2 text-zinc-500 font-medium">Campo</th>
                          <th className="text-left px-3 py-2 text-zinc-500 font-medium">De</th>
                          <th className="text-left px-3 py-2 text-zinc-500 font-medium">Para</th>
                          <th className="text-left px-3 py-2 text-zinc-500 font-medium">Por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateHistory.flatMap((h: any, i: number) => {
                          const date = h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'
                          const by   = h.changed_by_user?.name ?? h.changed_by_name ?? '—'
                          const rows = []
                          const fmtRate = (v: any, t: any) => v != null ? `${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v))}${t === 'monthly' ? '/mês' : '/h'}` : '—'
                          const fmtType = (v: any) => v === 'horista' ? 'Horista' : v === 'banco_de_horas' ? 'Banco de Horas' : v === 'fixo' ? 'Fixo' : v ?? '—'
                          if (h.old_hourly_rate != null || h.new_hourly_rate != null) {
                            rows.push({ key: `${i}-rate`, date, campo: 'Valor hora', de: fmtRate(h.old_hourly_rate, h.old_rate_type), para: fmtRate(h.new_hourly_rate, h.new_rate_type), by })
                          }
                          if (h.old_consultant_type || h.new_consultant_type) {
                            rows.push({ key: `${i}-type`, date, campo: 'Tipo contrato', de: fmtType(h.old_consultant_type), para: fmtType(h.new_consultant_type), by })
                          }
                          return rows
                        }).map(row => (
                          <tr key={row.key} className="border-b border-zinc-800/50 last:border-0">
                            <td className="px-3 py-2 text-zinc-400">{row.date}</td>
                            <td className="px-3 py-2 text-zinc-400">{row.campo}</td>
                            <td className="px-3 py-2 text-zinc-500">{row.de}</td>
                            <td className="px-3 py-2 text-zinc-200 font-medium">{row.para}</td>
                            <td className="px-3 py-2 text-zinc-500">{row.by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-5 justify-end">
                {canEdit && (
                <button onClick={() => { setViewUser(null); openEdit(u) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
                  <Pencil size={11} /> Editar
                </button>
                )}
                <button onClick={() => setViewUser(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                  Fechar
                </button>
              </div>
            </div>
          </ModalOverlay>
        )
      })()}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir este usuário? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />

      <ConfirmDeleteModal
        open={bulkDeleteConfirm}
        message={`Deseja excluir ${selectedIds.size} usuário(s) selecionado(s)? Esta ação não pode ser desfeita.`}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={bulkDelete}
      />
    </AppLayout>
  )
}
