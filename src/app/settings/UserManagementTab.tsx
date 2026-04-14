'use client'

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
  Search, KeyRound, Check, Copy, Eye,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: number
  name: string
  email: string
  enabled: boolean
  hourly_rate?: number
  rate_type?: string
  daily_hours?: number
  consultant_type?: string | null
  bank_hours_start_date?: string | null
  guaranteed_hours?: number | null
  customer_id?: number | null
  partner_id?: number | null
  is_executive?: boolean
  roles?: { id: number; name: string }[]
}

interface RoleOption     { id: number; name: string }
interface CustomerOption { id: number; name: string }
interface PartnerOption  { id: number; name: string }

type ProfileType    = 'cliente' | 'consultor' | 'coordenador' | 'parceiro_adm' | 'administrator'
type ConsultantType = 'horista' | 'bh_fixo' | 'bh_mensal' | 'fixo'

const PROFILE_OPTIONS: { value: ProfileType; label: string }[] = [
  { value: 'cliente',       label: 'Cliente' },
  { value: 'consultor',     label: 'Consultor' },
  { value: 'coordenador',   label: 'Coordenador' },
  { value: 'parceiro_adm',  label: 'Parceiro' },
  { value: 'administrator', label: 'Administrador' },
]

const CONSULTANT_OPTIONS: { value: ConsultantType; label: string; desc: string }[] = [
  { value: 'horista',   label: 'Horista',               desc: 'Pago por hora — possui horas extras' },
  { value: 'bh_fixo',   label: 'Banco de Horas Fixo',   desc: 'Valor mensal fixo — banco de horas sem extras' },
  { value: 'bh_mensal', label: 'Banco de Horas Mensal', desc: 'Valor mensal — banco de horas com extras e Total a Receber' },
  { value: 'fixo',      label: 'Fixo',                  desc: 'Valor fixo mensal — sem banco de horas' },
]

function resolveRoleName(profile: ProfileType): string {
  if (profile === 'cliente')       return 'Cliente'
  if (profile === 'coordenador')   return 'Coordenador'
  if (profile === 'parceiro_adm')  return 'Parceiro ADM'
  if (profile === 'administrator') return 'Administrator'
  return 'Consultor'
}

function resolveProfileFromRoles(roleNames: string[]): { profile: ProfileType | ''; consultantType: ConsultantType | '' } {
  if (roleNames.includes('Administrator')) return { profile: 'administrator', consultantType: '' }
  if (roleNames.includes('Cliente'))       return { profile: 'cliente',       consultantType: '' }
  if (roleNames.includes('Coordenador'))   return { profile: 'coordenador',   consultantType: '' }
  if (roleNames.includes('Parceiro ADM'))  return { profile: 'parceiro_adm',  consultantType: '' }
  if (roleNames.includes('Consultor'))     return { profile: 'consultor',     consultantType: 'horista' }
  return { profile: '', consultantType: '' }
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
  label: string; value: string | number; onChange: (v: string) => void
  options: { value: string | number; label: string }[]; placeholder?: string
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

function ConsultantTypeCard({ value, onChange }: { value: ConsultantType | ''; onChange: (v: ConsultantType) => void }) {
  const [open, setOpen] = useState(false)
  const selected = CONSULTANT_OPTIONS.find(o => o.value === value)
  return (
    <div>
      <Label className="text-xs text-zinc-400 mb-1 block">Tipo de Consultor *</Label>
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-zinc-700/40 transition-colors">
          <span className={selected ? 'text-zinc-300 font-medium' : 'text-zinc-500'}>
            {selected ? selected.label : 'Selecione o tipo...'}
          </span>
          <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
        {selected && !open && (
          <div className="px-3 pb-2 text-[10px] text-zinc-500">{selected.desc}</div>
        )}
        {open && (
          <div className="border-t border-zinc-700/60 px-2 pb-2 pt-1.5 space-y-1">
            {CONSULTANT_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full flex flex-col items-start px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                  value === opt.value ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200'
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

function CurrencyInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const [focused, setFocused] = useState(false)
  const numVal = parseFloat(value)
  const displayValue = !focused && value && !isNaN(numVal)
    ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numVal)
    : value
  return (
    <Input
      value={displayValue}
      onFocus={() => setFocused(true)}
      onBlur={e => {
        setFocused(false)
        const raw = e.target.value.replace(/\./g, '').replace(',', '.')
        const parsed = parseFloat(raw)
        if (!isNaN(parsed)) onChange(String(parsed))
        else if (e.target.value === '') onChange('')
      }}
      onChange={e => { if (focused) onChange(e.target.value) }}
      placeholder={placeholder}
      className={className}
    />
  )
}

function GroupsSelector({ roles, selected, onChange }: {
  roles: RoleOption[]; selected: number[]; onChange: (ids: number[]) => void
}) {
  const groups = roles.filter(r => !PRIMARY_ROLE_NAMES.includes(r.name))
  if (groups.length === 0) return (
    <p className="text-[10px] text-zinc-500 italic">Nenhum grupo de permissão cadastrado.</p>
  )
  return (
    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
      {groups.map(g => {
        const checked = selected.includes(g.id)
        return (
          <button key={g.id} type="button"
            onClick={() => onChange(checked ? selected.filter(id => id !== g.id) : [...selected, g.id])}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
              checked ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200'
            }`}>
            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${checked ? 'bg-blue-600 border-blue-500' : 'border-zinc-600'}`}>
              {checked && <Check size={9} className="text-white" />}
            </span>
            {g.name}
          </button>
        )
      })}
    </div>
  )
}

function TableSkeleton() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-zinc-800">
          {[...Array(5)].map((_, j) => (
            <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Form state ───────────────────────────────────────────────────────────────

// Roles que representam o perfil primário — não aparecem como "grupos extras"
const PRIMARY_ROLE_NAMES = ['Administrador', 'Administrator', 'Consultor', 'Coordenador', 'Parceiro ADM', 'Cliente']

const EMPTY_FORM = {
  name: '', email: '', password: '', enabled: true,
  hourly_rate: '', rate_type: 'hourly' as 'hourly' | 'monthly',
  daily_hours: '8', profile: '' as ProfileType | '',
  consultant_type: '' as ConsultantType | '',
  bank_hours_start_date: '',
  guaranteed_hours: '',
  is_partner_adm: false,
  customer_id: '' as number | '',
  partner_id:  '' as number | '',
  extra_role_ids: [] as number[],
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UserManagementTab() {
  const [users,     setUsers]     = useState<UserItem[]>([])
  const [roles,     setRoles]     = useState<RoleOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [partners,  setPartners]  = useState<PartnerOption[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,        setSearch]        = useState('')
  const [filterEnabled, setFilterEnabled] = useState('')
  const [filterRole,    setFilterRole]    = useState('')
  const [page,    setPage]    = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [viewUser,   setViewUser]   = useState<UserItem | null>(null)
  const [modal,      setModal]      = useState<{ open: boolean; item?: UserItem }>({ open: false })
  const [resetModal, setResetModal] = useState<{
    open: boolean; userId?: number; userName?: string; userEmail?: string
    tempPassword?: string; emailSent?: boolean; confirmed: boolean
  }>({ open: false, confirmed: false })
  const [form,      setForm]      = useState({ ...EMPTY_FORM })
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState<number | null>(null)
  const [resetting, setResetting] = useState<number | null>(null)
  const [copied,    setCopied]    = useState(false)

  useEffect(() => {
    api.get<any>('/roles?pageSize=100').then(r =>
      setRoles(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
    ).catch(() => {})
    api.get<any>('/customers?pageSize=100').then(r =>
      setCustomers(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})
    api.get<any>('/partners?pageSize=-1').then(r =>
      setPartners(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), per_page: '15' })
      if (search)        p.set('search', search)
      if (filterEnabled) p.set('enabled', filterEnabled)
      if (filterRole)    p.set('role', filterRole)
      const r = await api.get<{ items?: UserItem[]; data?: UserItem[]; hasNext?: boolean; meta?: { last_page: number } }>(`/users?${p}`)
      setUsers(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar usuários') }
    finally { setLoading(false) }
  }, [page, search, filterEnabled, filterRole])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setModal({ open: true }) }

  const openEdit = (item: UserItem) => {
    const roleNames = item.roles?.map(r => r.name) ?? []
    const { profile } = resolveProfileFromRoles(roleNames)
    const consultant_type = (item.consultant_type as ConsultantType | undefined)
      ?? (item.rate_type === 'hourly' ? 'horista' : item.rate_type === 'monthly' ? 'bh_fixo' : '')
    // Grupos extras = roles que não são perfis primários
    const extraRoleIds = (item.roles ?? [])
      .filter(r => !PRIMARY_ROLE_NAMES.includes(r.name))
      .map(r => r.id)
    setForm({
      name: item.name, email: item.email, password: '',
      enabled: item.enabled,
      hourly_rate: item.hourly_rate ? String(item.hourly_rate) : '',
      rate_type: (item.rate_type as 'hourly' | 'monthly') ?? 'hourly',
      daily_hours: item.daily_hours != null ? String(item.daily_hours) : '8',
      profile, consultant_type: consultant_type as ConsultantType | '',
      bank_hours_start_date: item.bank_hours_start_date ?? '',
      guaranteed_hours: item.guaranteed_hours != null ? String(item.guaranteed_hours) : '',
      is_partner_adm: item.is_executive ?? false,
      customer_id: item.customer_id ?? '',
      partner_id:  item.partner_id  ?? '',
      extra_role_ids: extraRoleIds,
    })
    setModal({ open: true, item })
  }

  const save = async () => {
    if (!form.profile) { toast.error('Selecione um perfil de acesso'); return }
    const roleName = resolveRoleName(form.profile)
    const role = roles.find(r => r.name === roleName)
    if (!role) { toast.error(`Perfil "${roleName}" não encontrado.`); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name, email: form.email, enabled: form.enabled,
        roles: [role.id, ...form.extra_role_ids],
        customer_id: form.profile === 'cliente' && form.customer_id ? form.customer_id : null,
        partner_id:  form.profile === 'parceiro_adm' && form.partner_id ? form.partner_id : null,
        is_executive: form.profile === 'parceiro_adm' ? form.is_partner_adm : false,
        rate_type: form.rate_type,
      }
      if (form.hourly_rate) payload.hourly_rate = parseFloat(form.hourly_rate)
      if (form.daily_hours) payload.daily_hours = parseFloat(form.daily_hours)
      if (form.profile === 'consultor' && form.consultant_type) payload.consultant_type = form.consultant_type
      payload.bank_hours_start_date = (form.profile === 'consultor' || form.profile === 'parceiro_adm') && form.bank_hours_start_date
        ? form.bank_hours_start_date
        : null
      payload.guaranteed_hours = form.profile === 'consultor' && form.consultant_type === 'horista' && form.guaranteed_hours
        ? parseFloat(form.guaranteed_hours)
        : null
      if (!modal.item && form.password) payload.password = form.password
      if (modal.item) await api.put(`/users/${modal.item.id}`, payload)
      else            await api.post('/users', payload)
      toast.success(modal.item ? 'Usuário atualizado' : 'Usuário criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Confirmar exclusão do usuário?')) return
    setDeleting(id)
    try { await api.delete(`/users/${id}`); toast.success('Usuário excluído'); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const resetPassword = (user: UserItem) =>
    setResetModal({ open: true, userId: user.id, userName: user.name, userEmail: user.email, confirmed: false })

  const confirmReset = async () => {
    if (!resetModal.userId) return
    setResetting(resetModal.userId)
    try {
      const r = await api.post<{ temporary_password: string; email_sent?: boolean }>(`/users/${resetModal.userId}/reset-password`, {})
      setResetModal(prev => ({ ...prev, tempPassword: r.temporary_password, emailSent: r.email_sent ?? false, confirmed: true }))
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao resetar senha') }
    finally { setResetting(null) }
  }

  const copyPassword = () => {
    if (resetModal.tempPassword) {
      navigator.clipboard.writeText(resetModal.tempPassword)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  const isCliente     = form.profile === 'cliente'
  const isConsultor   = form.profile === 'consultor'
  const isParceiroAdm = form.profile === 'parceiro_adm'
  const hasRate       = isConsultor || form.profile === 'coordenador' || isParceiroAdm
  const canSave = !!form.name && !!form.email && !!form.profile
    && (!isCliente     || !!form.customer_id)
    && (!isConsultor   || !!form.consultant_type)
    && (!isParceiroAdm || !!form.partner_id)

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-40">
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
        <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2">
          <option value="">Todos os perfis</option>
          <option value="Cliente">Cliente</option>
          <option value="Consultor">Consultor</option>
          <option value="Coordenador">Coordenador</option>
          <option value="Parceiro ADM">Parceiro ADM</option>
          <option value="Administrator">Administrator</option>
        </select>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">E-mail</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Perfil</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
              <th className="px-3 py-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton /> : users.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">Nenhum usuário encontrado</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{user.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell">{user.email}</td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1 items-center">
                    {user.roles?.map(r => (
                      <Badge key={r.id} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">{r.name}</Badge>
                    ))}
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
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => setViewUser(user)} title="Visualizar" className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"><Eye size={12} /></button>
                    <button onClick={() => openEdit(user)} title="Editar" className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"><Pencil size={12} /></button>
                    <button onClick={() => resetPassword(user)} disabled={resetting === user.id} title="Resetar senha" className="p-1 text-zinc-500 hover:text-yellow-400 transition-colors"><KeyRound size={12} /></button>
                    <button onClick={() => remove(user.id)} disabled={deleting === user.id} title="Excluir" className="p-1 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5 max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-sm font-semibold text-white">{modal.item ? 'Editar Usuário' : 'Novo Usuário'}</h3>

            <div>
              <Label className="text-xs text-zinc-400 mb-2 block">Perfil de acesso *</Label>
              <div className="grid grid-cols-3 gap-2">
                {PROFILE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setForm(f => ({ ...f, profile: opt.value, consultant_type: '', is_partner_adm: false, customer_id: '', partner_id: '' }))}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                      form.profile === opt.value
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}>
                    {form.profile === opt.value && <span className="mr-1.5">●</span>}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.profile && (
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
                    <Label className="text-xs text-zinc-400">Senha</Label>
                    <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Deixe vazio para gerar automaticamente"
                      className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                  </div>
                )}
                {hasRate && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Remuneração</Label>
                    <div className="flex gap-2 items-center">
                      {isConsultor ? (
                        <span className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-xs text-zinc-400 font-medium whitespace-nowrap">
                          {form.rate_type === 'hourly' ? 'Por Hora' : 'Fixo'}
                        </span>
                      ) : (
                        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
                          {(['hourly', 'monthly'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setForm(f => ({ ...f, rate_type: t }))}
                              className={`px-3 py-1.5 font-medium transition-colors ${form.rate_type === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                              {t === 'hourly' ? 'Por Hora' : 'Fixo'}
                            </button>
                          ))}
                        </div>
                      )}
                      <CurrencyInput value={form.hourly_rate}
                        onChange={v => setForm(f => ({ ...f, hourly_rate: v }))}
                        placeholder="0,00" className="flex-1 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
                      <span className="text-xs text-zinc-500">R$</span>
                    </div>
                  </div>
                )}
                {isConsultor && form.consultant_type !== 'horista' && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Horas por dia útil (Banco de Horas)</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="1" max="24" step="0.5" value={form.daily_hours}
                        onChange={e => setForm(f => ({ ...f, daily_hours: e.target.value }))}
                        placeholder="8" className="w-24 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
                      <span className="text-xs text-zinc-500">h/dia (padrão: 8h)</span>
                    </div>
                  </div>
                )}
                {(isConsultor || isParceiroAdm) && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Data de início do banco de horas</Label>
                    <Input
                      type="date"
                      value={form.bank_hours_start_date}
                      onChange={e => setForm(f => ({ ...f, bank_hours_start_date: e.target.value }))}
                      className="w-48 bg-zinc-800 border-zinc-700 text-white h-8 text-xs"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Movimentações anteriores a esta data são ignoradas no cálculo.
                    </p>
                  </div>
                )}
                {isCliente && (
                  <FieldSelect label="Empresa *" value={form.customer_id}
                    onChange={v => setForm(f => ({ ...f, customer_id: v === '' ? '' : Number(v) }))}
                    options={customers.map(c => ({ value: c.id, label: c.name }))} placeholder="Selecione a empresa..." />
                )}
                {isConsultor && (
                  <ConsultantTypeCard value={form.consultant_type}
                    onChange={opt => setForm(f => ({ ...f, consultant_type: opt, rate_type: opt === 'horista' ? 'hourly' : 'monthly' }))} />
                )}
                {isConsultor && form.consultant_type === 'horista' && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Horas Garantidas / mês</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min="0" max="744" step="1"
                        value={form.guaranteed_hours}
                        onChange={e => setForm(f => ({ ...f, guaranteed_hours: e.target.value }))}
                        placeholder="Ex: 160"
                        className="w-28 bg-zinc-800 border-zinc-700 text-white h-8 text-xs"
                      />
                      <span className="text-xs text-zinc-500">h/mês (piso mínimo de cobrança)</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Se fizer menos horas, paga como se tivesse feito este mínimo.
                    </p>
                  </div>
                )}
                {isParceiroAdm && (
                  <div className="space-y-3">
                    <FieldSelect label="Empresa parceira *" value={form.partner_id}
                      onChange={v => setForm(f => ({ ...f, partner_id: v === '' ? '' : Number(v) }))}
                      options={partners.map(p => ({ value: p.id, label: p.name }))} placeholder="Selecione o parceiro..." />
                    <Toggle value={form.is_partner_adm}
                      onChange={() => setForm(f => ({ ...f, is_partner_adm: !f.is_partner_adm }))}
                      label="É administrador do parceiro" />
                  </div>
                )}
                {/* Grupos de permissão extras — disponível para todos os perfis exceto Administrador */}
                {form.profile && form.profile !== 'cliente' && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1.5 block">Grupos de Permissão</Label>
                    <GroupsSelector
                      roles={roles}
                      selected={form.extra_role_ids}
                      onChange={ids => setForm(f => ({ ...f, extra_role_ids: ids }))}
                    />
                  </div>
                )}
                <Toggle value={form.enabled} onChange={() => setForm(f => ({ ...f, enabled: !f.enabled }))} label="Ativo" />
              </>
            )}

            <div className="flex gap-2 pt-1 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !canSave} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal reset senha */}
      {resetModal.open && (
        <ModalOverlay onClose={() => setResetModal({ open: false, confirmed: false })}>
          <div className="p-5">
            {!resetModal.confirmed ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-yellow-500/15 shrink-0">
                    <KeyRound size={15} className="text-yellow-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Resetar senha</h3>
                </div>
                <p className="text-xs text-zinc-400 mb-1">Uma nova senha temporária será gerada para:</p>
                <p className="text-xs font-semibold text-white mb-0.5">{resetModal.userName}</p>
                <p className="text-xs text-zinc-500 mb-4">{resetModal.userEmail}</p>
                <p className="text-xs text-zinc-500 mb-5 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                  A senha será exibida na tela e um <span className="text-zinc-300 font-medium">e-mail será enviado automaticamente</span> ao usuário.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setResetModal({ open: false, confirmed: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
                  <Button onClick={confirmReset} disabled={resetting === resetModal.userId} className="h-8 text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white gap-1.5">
                    <KeyRound size={12} />
                    {resetting === resetModal.userId ? 'Gerando...' : 'Confirmar e Enviar E-mail'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-white mb-1">Senha gerada com sucesso</h3>
                <p className="text-xs text-zinc-400 mb-2">Copie a senha abaixo para repassar ao usuário.</p>
                {resetModal.emailSent
                  ? <p className="text-xs mb-4 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">E-mail enviado para <span className="font-medium">{resetModal.userEmail}</span></p>
                  : <p className="text-xs mb-4 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">Falha ao enviar e-mail — repasse a senha manualmente.</p>
                }
                <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm text-yellow-300 font-mono tracking-wider">{resetModal.tempPassword}</code>
                  <button onClick={copyPassword} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <Button onClick={() => setResetModal({ open: false, confirmed: false })} className="mt-4 w-full h-8 text-xs bg-zinc-700 hover:bg-zinc-600 text-white">Fechar</Button>
              </>
            )}
          </div>
        </ModalOverlay>
      )}

      {/* Modal visualizar */}
      {viewUser && (() => {
        const u = viewUser
        const roleNames = u.roles?.map(r => r.name) ?? []
        const { profile } = resolveProfileFromRoles(roleNames)
        const profileLabel = PROFILE_OPTIONS.find(p => p.value === profile)?.label ?? (roleNames[0] ?? '—')
        const rows: { label: string; value: React.ReactNode }[] = [
          { label: 'Nome',   value: u.name },
          { label: 'E-mail', value: u.email },
          { label: 'Perfil', value: profileLabel },
          { label: 'Status', value: u.enabled
              ? <span className="text-green-400 text-xs font-medium">Ativo</span>
              : <span className="text-zinc-400 text-xs">Inativo</span> },
        ]
        if (u.hourly_rate != null) rows.push({ label: 'Remuneração', value: `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(u.hourly_rate))} ${u.rate_type === 'monthly' ? '/ mês' : '/ hora'}` })
        if (u.daily_hours != null) rows.push({ label: 'Horas/dia útil', value: `${u.daily_hours}h` })
        if (u.bank_hours_start_date) rows.push({ label: 'Início banco de horas', value: new Date(u.bank_hours_start_date + 'T12:00:00').toLocaleDateString('pt-BR') })
        if (u.guaranteed_hours != null) rows.push({ label: 'Horas garantidas', value: `${u.guaranteed_hours}h/mês` })
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
                  <div key={String(row.label)} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                    <span className="text-xs text-zinc-500">{row.label}</span>
                    <span className="text-xs text-zinc-200 text-right">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-5 justify-end">
                <button onClick={() => { setViewUser(null); openEdit(u) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5 border border-zinc-700 text-zinc-400">
                  <Pencil size={11} /> Editar
                </button>
                <button onClick={() => setViewUser(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white">
                  Fechar
                </button>
              </div>
            </div>
          </ModalOverlay>
        )
      })()}
    </div>
  )
}
