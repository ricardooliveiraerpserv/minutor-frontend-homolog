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
  Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight,
  Search, KeyRound, Check, Copy
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: number
  name: string
  email: string
  enabled: boolean
  hourly_rate?: number
  rate_type?: string
  customer_id?: number | null
  partner_id?: number | null
  roles?: { id: number; name: string }[]
  created_at: string
}

interface RoleOption     { id: number; name: string }
interface CustomerOption { id: number; name: string }
interface PartnerOption  { id: number; name: string }

// ─── Profile type logic ───────────────────────────────────────────────────────

type ProfileType    = 'cliente' | 'consultor' | 'coordenador' | 'parceiro'
type ConsultantType = 'horista' | 'bh_fixo' | 'bh_mensal'

const PROFILE_OPTIONS: { value: ProfileType; label: string }[] = [
  { value: 'cliente',    label: 'Cliente' },
  { value: 'consultor',  label: 'Consultor' },
  { value: 'coordenador',label: 'Coordenador' },
  { value: 'parceiro',   label: 'Parceiro' },
]

const CONSULTANT_OPTIONS: { value: ConsultantType; label: string }[] = [
  { value: 'horista',   label: 'Horista' },
  { value: 'bh_fixo',   label: 'Fixo' },
  { value: 'bh_mensal', label: 'Banco de Horas' },
]

// Map profile → role name to send to backend
function resolveRoleName(
  profile: ProfileType,
  consultantType: ConsultantType | '',
  partnerIsAdmin: boolean,
): string {
  if (profile === 'cliente')    return 'Cliente'
  if (profile === 'coordenador') return 'Coordenador'
  if (profile === 'parceiro')   return partnerIsAdmin ? 'Parceiro ADM' : 'Parceiro'
  // consultor
  if (consultantType === 'bh_fixo')   return 'Consultor BH Fixo'
  if (consultantType === 'bh_mensal') return 'Consultor BH Mensal'
  return 'Consultor Horista'
}

// Reverse-map user roles → profile form state
function resolveProfileFromRoles(roleNames: string[]): {
  profile: ProfileType | ''
  consultantType: ConsultantType | ''
  partnerIsAdmin: boolean
} {
  if (roleNames.includes('Cliente'))            return { profile: 'cliente',    consultantType: '',         partnerIsAdmin: false }
  if (roleNames.includes('Consultor Horista'))  return { profile: 'consultor',  consultantType: 'horista',  partnerIsAdmin: false }
  if (roleNames.includes('Consultor BH Fixo'))  return { profile: 'consultor',  consultantType: 'bh_fixo',  partnerIsAdmin: false }
  if (roleNames.includes('Consultor BH Mensal'))return { profile: 'consultor',  consultantType: 'bh_mensal',partnerIsAdmin: false }
  if (roleNames.includes('Coordenador'))        return { profile: 'coordenador',consultantType: '',         partnerIsAdmin: false }
  if (roleNames.includes('Parceiro ADM'))       return { profile: 'parceiro',   consultantType: '',         partnerIsAdmin: true  }
  if (roleNames.includes('Parceiro'))           return { profile: 'parceiro',   consultantType: '',         partnerIsAdmin: false }
  return { profile: '', consultantType: '', partnerIsAdmin: false }
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

// ─── Initial form state ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  enabled: true,
  hourly_rate: '',
  rate_type: 'hourly' as 'hourly' | 'monthly',
  profile: '' as ProfileType | '',
  consultant_type: '' as ConsultantType | '',
  partner_is_admin: false,
  customer_id: '' as number | '',
  partner_id: '' as number | '',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
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
  const [modal,      setModal]      = useState<{ open: boolean; item?: UserItem }>({ open: false })
  const [resetModal, setResetModal] = useState<{ open: boolean; userId?: number; tempPassword?: string }>({ open: false })
  const [form,     setForm]     = useState({ ...EMPTY_FORM })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [resetting,setResetting]= useState<number | null>(null)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    api.get<any>('/roles?pageSize=100').then(r =>
      setRoles(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
    ).catch(() => {})
    api.get<any>('/customers?pageSize=1000').then(r =>
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
      if (search)       p.set('search', search)
      if (filterEnabled)p.set('enabled', filterEnabled)
      if (filterRole)   p.set('role', filterRole)
      const r = await api.get<{ items?: UserItem[]; data?: UserItem[]; hasNext?: boolean; meta?: { last_page: number } }>(`/users?${p}`)
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(list)
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar usuários') }
    finally   { setLoading(false) }
  }, [page, search, filterEnabled, filterRole])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setModal({ open: true })
  }

  const openEdit = (item: UserItem) => {
    const roleNames = item.roles?.map(r => r.name) ?? []
    const { profile, consultantType, partnerIsAdmin } = resolveProfileFromRoles(roleNames)
    setForm({
      name:            item.name,
      email:           item.email,
      password:        '',
      enabled:         item.enabled,
      hourly_rate:     item.hourly_rate ? String(item.hourly_rate) : '',
      rate_type:       (item.rate_type as 'hourly' | 'monthly') ?? 'hourly',
      profile,
      consultant_type: consultantType,
      partner_is_admin: partnerIsAdmin,
      customer_id:     item.customer_id ?? '',
      partner_id:      item.partner_id  ?? '',
    })
    setModal({ open: true, item })
  }

  const save = async () => {
    if (!form.profile) { toast.error('Selecione um perfil de acesso'); return }

    // Resolve role ID from profile selection
    const roleName = resolveRoleName(form.profile, form.consultant_type, form.partner_is_admin)
    const role = roles.find(r => r.name === roleName)
    if (!role) { toast.error(`Perfil "${roleName}" não encontrado. Execute o seeder de roles.`); return }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:       form.name,
        email:      form.email,
        enabled:    form.enabled,
        roles:      [role.id],
        customer_id: form.profile === 'cliente'   && form.customer_id ? form.customer_id : null,
        partner_id:  form.profile === 'parceiro'  && form.partner_id  ? form.partner_id  : null,
      }
      if (form.hourly_rate) {
        payload.hourly_rate = parseFloat(form.hourly_rate)
        payload.rate_type   = form.rate_type
      }
      if (!modal.item && form.password) payload.password = form.password

      if (modal.item) await api.put(`/users/${modal.item.id}`, payload)
      else            await api.post('/users', payload)

      toast.success(modal.item ? 'Usuário atualizado' : 'Usuário criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally     { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Confirmar exclusão do usuário?')) return
    setDeleting(id)
    try {
      await api.delete(`/users/${id}`)
      toast.success('Usuário excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally     { setDeleting(null) }
  }

  const resetPassword = async (id: number) => {
    setResetting(id)
    try {
      const r = await api.post<{ temporary_password: string; message: string }>(`/users/${id}/reset-password`, {})
      setResetModal({ open: true, userId: id, tempPassword: r.temporary_password })
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao resetar senha') }
    finally     { setResetting(null) }
  }

  const copyPassword = () => {
    if (resetModal.tempPassword) {
      navigator.clipboard.writeText(resetModal.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Derived booleans for conditional form fields
  const isCliente    = form.profile === 'cliente'
  const isConsultor  = form.profile === 'consultor'
  const isCoordenador= form.profile === 'coordenador'
  const isParceiro   = form.profile === 'parceiro'
  const hasRate      = isConsultor || isCoordenador || isParceiro

  const canSave = !!form.name && !!form.email && !!form.profile
    && (!isCliente   || !!form.customer_id)
    && (!isConsultor || !!form.consultant_type)
    && (!isParceiro  || !!form.partner_id)

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
        <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2">
          <option value="">Todos os perfis</option>
          {PROFILE_OPTIONS.map(p => <option key={p.value} value={p.label}>{p.label}</option>)}
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
                  <div className="flex flex-wrap gap-1">
                    {user.roles?.map(r => (
                      <Badge key={r.id} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                        {r.name}
                      </Badge>
                    ))}
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
                    <button onClick={() => resetPassword(user.id)} disabled={resetting === user.id}
                      title="Resetar senha" className="p-1 text-zinc-500 hover:text-yellow-400 transition-colors">
                      <KeyRound size={12} />
                    </button>
                    <button onClick={() => openEdit(user)} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => remove(user.id)} disabled={deleting === user.id}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
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
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext}
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

            {/* ── Perfil de acesso (seleção única) ── */}
            <div>
              <Label className="text-xs text-zinc-400 mb-2 block">Perfil de acesso *</Label>
              <div className="grid grid-cols-2 gap-2">
                {PROFILE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      profile: opt.value,
                      consultant_type: '',
                      partner_is_admin: false,
                      customer_id: '',
                      partner_id: '',
                    }))}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                      form.profile === opt.value
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {form.profile === opt.value && <span className="mr-1.5">●</span>}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Campos comuns ── */}
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

                {/* ── Valor hora (Consultor / Coordenador / Parceiro) ── */}
                {hasRate && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Remuneração</Label>
                    <div className="flex gap-2 items-center">
                      {/* Tipo: Hora / Fixo */}
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
                      <Input type="number" min="0" step="0.01" value={form.hourly_rate}
                        onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                        placeholder="0,00"
                        className="flex-1 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
                      <span className="text-xs text-zinc-500">R$</span>
                    </div>
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

                {/* ── Consultor: tipo de consultor ── */}
                {isConsultor && (
                  <div>
                    <Label className="text-xs text-zinc-400 mb-2 block">Tipo de Consultor *</Label>
                    <div className="space-y-1.5">
                      {CONSULTANT_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setForm(f => ({ ...f, consultant_type: opt.value }))}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                            form.consultant_type === opt.value
                              ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                          }`}>
                          {form.consultant_type === opt.value && <span className="mr-1.5">●</span>}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Parceiro: seleciona parceiro + é admin? ── */}
                {isParceiro && (
                  <>
                    <FieldSelect
                      label="Parceiro *"
                      value={form.partner_id}
                      onChange={v => setForm(f => ({ ...f, partner_id: v === '' ? '' : Number(v) }))}
                      options={partners.map(p => ({ value: p.id, label: p.name }))}
                      placeholder="Selecione o parceiro..."
                    />
                    <Toggle
                      value={form.partner_is_admin}
                      onChange={() => setForm(f => ({ ...f, partner_is_admin: !f.partner_is_admin }))}
                      label="Administrador do parceiro"
                    />
                  </>
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
        <ModalOverlay onClose={() => setResetModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Senha Temporária Gerada</h3>
            <p className="text-xs text-zinc-400 mb-4">Anote a senha abaixo — ela não será exibida novamente.</p>
            <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2">
              <code className="flex-1 text-sm text-yellow-400 font-mono">{resetModal.tempPassword}</code>
              <button onClick={copyPassword} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
            <Button onClick={() => setResetModal({ open: false })}
              className="mt-4 w-full h-8 text-xs bg-zinc-700 hover:bg-zinc-600 text-white">
              Fechar
            </Button>
          </div>
        </ModalOverlay>
      )}
    </AppLayout>
  )
}
