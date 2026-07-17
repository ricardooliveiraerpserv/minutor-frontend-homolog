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
  Search, KeyRound, Check, Copy, Eye, Mail, Square, CheckSquare2, UserPlus
} from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { RowMenu } from '@/components/ui/row-menu'
import { useAuth } from '@/hooks/use-auth'
import { useDeniedActions } from '@/contexts/denied-actions-context'
import { useRouter } from 'next/navigation'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { UserFormModal } from '@/components/users/user-form-modal'

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
  contract_type?: 'cooperado' | 'clt' | 'pj' | null
  coordinator_type?: 'projetos' | 'sustentacao' | null
  guaranteed_hours?: number | null
  customer_id?: number | null
  customer?: { id: number; name: string } | null
  partner_id?: number | null
  partner?: { id: number; name: string } | null
  is_executive?: boolean
  type?: string | null
  extra_permissions?: string[]
  can_timesheet_sustentacao?: boolean
  // Pré-cadastro cliente pendente de convite (sem senha, desabilitado) — fase 1a/1b
  is_pending_invite?: boolean
  // Folha de pagamento
  full_name?: string | null
  cpf?: string | null
  matricula?: string | null
  payroll_status?: string | null
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
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 text-[var(--text-light)] hover:text-[var(--text)]">
          <X size={16} />
        </button>
        <div className="overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <tr key={i} className="border-b border-[var(--border)]">
          {[...Array(5)].map((_, j) => (
            <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-[var(--text-muted)]">↕</span>
  return <span className="ml-1 text-[var(--primary)]">{dir === 'asc' ? '↑' : '↓'}</span>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: authUser } = useAuth()
  const { isDenied } = useDeniedActions()
  const router = useRouter()

  // Consultor não acessa esta rotina, nem com extra_permissions — redireciona.
  useEffect(() => {
    if (authUser?.type === 'consultor') {
      router.replace('/meu-painel')
    }
  }, [authUser?.type, router])

  const isAdmin      = authUser?.type === 'admin'
  const ep: string[] = (authUser as any)?.permissions ?? authUser?.extra_permissions ?? []
  // FONTE DA VERDADE DO ACESSO = Configurador (nav_screens via /my-denied-actions), por cima da
  // perm-base. `isDenied('/users', <ação>)` esconde o botão quando a política nega o perfil/usuário
  // — exatamente o que o middleware screen.action bloqueia na API. Sem hardcode de perfil.
  const has = (perm: string) => isAdmin || ep.includes(perm)
  const canCreate     = has('users.create')        && !isDenied('/users', 'create')
  const canEdit       = has('users.update')        && !isDenied('/users', 'edit')
  const canDelete     = has('users.delete')        && !isDenied('/users', 'delete')
  const canResetPwd   = has('users.reset_password') && !isDenied('/users', 'reset_password')
  // Reenviar boas-vindas: precisa poder resetar (mesmo grupo de rota na API) E não estar
  // negado pelo Configurador na ação própria de reenviar.
  const canResendWelcome = canResetPwd && !isDenied('/users', 'resend_welcome')
  // Ver a lista: quem tem view_all OU quem pode resetar (precisa enxergar p/ resetar — grupos reset-only).
  const canView       = has('users.view_all') || canResetPwd
  const canViewDetail = has('users.view_all') && !isDenied('/users', 'view')

  const [users,     setUsers]     = useState<UserItem[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [partners,  setPartners]  = useState<PartnerOption[]>([])
  const [loading,   setLoading]   = useState(true)
  const [hasNext, setHasNext] = useState(false)

  const { filters: flt, set: setFilter } = usePersistedFilters(
    'users',
    authUser?.id,
    { search: '', filterEnabled: '', filterRole: '', filterPartner: '', filterCustomer: '', sort: 'name', sortDir: 'asc' as 'asc' | 'desc', page: 1 },
  )
  const { search, filterEnabled, filterRole, filterPartner, filterCustomer, sort, sortDir, page } = flt
  const setSearch         = (v: string) => setFilter('search', v)
  const setFilterEnabled  = (v: string) => setFilter('filterEnabled', v)
  const setFilterRole     = (v: string) => { setFilter({ filterRole: v, filterPartner: '', filterCustomer: '', page: 1 } as any) }
  const setFilterPartner  = (v: string) => setFilter('filterPartner', v)
  const setFilterCustomer = (v: string) => setFilter('filterCustomer', v)
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
  // Modal criar/editar usuário (componente compartilhado). userId null = criar.
  const [modal,      setModal]      = useState<{ open: boolean; userId: number | null }>({ open: false, userId: null })
  const [resetModal, setResetModal] = useState<{
    open: boolean
    userId?: number
    userName?: string
    userEmail?: string
    tempPassword?: string
    emailSent?: boolean
    confirmed: boolean
  }>({ open: false, confirmed: false })
  const [deleting, setDeleting] = useState<number | null>(null)
  const [resetting,setResetting]= useState<number | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [deleteConfirm,  setDeleteConfirm]  = useState<{ open: boolean; id?: number }>({ open: false })
  const [selectedIds,    setSelectedIds]    = useState<Set<number>>(new Set())
  const [resending,      setResending]      = useState<number | null>(null)
  const [bulkResending,  setBulkResending]  = useState(false)
  const [bulkDeleting,   setBulkDeleting]   = useState(false)
  const [bulkSustLoading, setBulkSustLoading] = useState(false)
  const [bulkContractLoading, setBulkContractLoading] = useState(false)
  const [bulkContractType, setBulkContractType] = useState<ContractType | ''>('')
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

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
      if (filterRole)     p.set('role', filterRole)
      if (filterPartner)  p.set('partner_id', filterPartner)
      if (filterCustomer) p.set('customer_id', filterCustomer)
      p.set('order', sortDir === 'desc' ? `-${sort}` : sort)
      const r = await api.get<{ items?: UserItem[]; data?: UserItem[]; hasNext?: boolean; meta?: { last_page: number } }>(`/users?${p}`)
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(list)
      setSelectedIds(new Set())
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar usuários') }
    finally   { setLoading(false) }
  }, [page, search, filterEnabled, filterRole, filterPartner, filterCustomer, sort, sortDir])

  useEffect(() => { load() }, [load])

  const openCreate = () => setModal({ open: true, userId: null })
  const openEdit   = (item: UserItem) => setModal({ open: true, userId: item.id })

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

  const resendWelcome = async (user: UserItem) => {
    setResending(user.id)
    try {
      await api.post(`/users/${user.id}/resend-welcome`, {})
      toast.success(`E-mail de boas-vindas reenviado para ${user.name}`)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao reenviar e-mail') }
    finally { setResending(null) }
  }

  // Convite (fase 1b): ativa um pré-cadastro cliente (senha temp + habilita + e-mail).
  const invite = async (user: UserItem) => {
    setResending(user.id)
    try {
      await api.post(`/users/${user.id}/invite`, {})
      toast.success(`Convite enviado para ${user.name}`)
      await load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao enviar convite') }
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

  const bulkSetSustentacao = async (value: boolean) => {
    if (selectedIds.size === 0) return
    setBulkSustLoading(true)
    try {
      await Promise.all([...selectedIds].map(id => api.put(`/users/${id}`, { can_timesheet_sustentacao: value })))
      toast.success(`Sustentação ${value ? 'liberada' : 'bloqueada'} para ${selectedIds.size} usuário(s)`)
      setSelectedIds(new Set())
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar usuários') }
    finally { setBulkSustLoading(false) }
  }

  const bulkSetContractType = async () => {
    if (selectedIds.size === 0) return
    setBulkContractLoading(true)
    try {
      const r = await api.post<{ applied: number; skipped: number }>(
        '/users/bulk-contract-type',
        { user_ids: [...selectedIds], contract_type: bulkContractType || null },
      )
      const skippedMsg = r.skipped > 0 ? ` ${r.skipped} ignorado(s) (vinculados a parceiro)` : ''
      toast.success(`${r.applied} aplicado(s).${skippedMsg}`)
      setSelectedIds(new Set())
      setBulkContractType('')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aplicar tipo de contrato') }
    finally { setBulkContractLoading(false) }
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

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Usuários">
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nome ou e-mail..."
            className="pl-8 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs" />
        </div>
        <select value={filterEnabled} onChange={e => { setFilterEnabled(e.target.value); setPage(1) }}
          className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-md h-8 px-2">
          <option value="">Todos</option>
          <option value="1">Ativos</option>
          <option value="0">Inativos</option>
        </select>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {([['', 'Todos'], ['cliente', 'Cliente'], ['consultor', 'Consultor'], ['coordenador', 'Coordenador'], ['parceiro_admin', 'Parceiro ADM'], ['admin', 'Admin'], ['administrativo', 'Adm']] as const).map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => setFilterRole(val)}
              className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                filterRole === val
                  ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                  : 'bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {filterRole === 'parceiro_admin' && partners.length > 0 && (
          <select
            value={filterPartner}
            onChange={e => { setFilterPartner(e.target.value); setPage(1) }}
            className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-md h-8 px-2">
            <option value="">Todas as empresas</option>
            {partners.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        )}
        {filterRole === 'cliente' && customers.length > 0 && (
          <select
            value={filterCustomer}
            onChange={e => { setFilterCustomer(e.target.value); setPage(1) }}
            className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-md h-8 px-2">
            <option value="">Todos os clientes</option>
            {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        )}
        {canCreate && (
        <Button onClick={openCreate} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
        )}
      </div>

      {/* Barra de ação em massa */}
      {selectedIds.size > 0 && canResetPwd && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg">
          <span className="text-xs text-[var(--text-muted)]">{selectedIds.size} usuário(s) selecionado(s)</span>
          <button
            type="button"
            onClick={resendWelcomeBulk}
            disabled={bulkResending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary-soft)] hover:bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)] rounded-md text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Mail size={12} />
            {bulkResending ? 'Enviando...' : 'Reenviar boas-vindas'}
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => bulkSetSustentacao(true)}
                disabled={bulkSustLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Check size={12} />
                {bulkSustLoading ? 'Salvando...' : 'Liberar sustentação'}
              </button>
              <button
                type="button"
                onClick={() => bulkSetSustentacao(false)}
                disabled={bulkSustLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] border border-[var(--border-strong)] rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                <X size={12} />
                {bulkSustLoading ? 'Salvando...' : 'Bloquear sustentação'}
              </button>

              {/* ── Tipo de contrato em massa ── */}
              <div className="flex items-center gap-1.5 pl-3 border-l border-[var(--border)]">
                <span className="text-[11px] text-[var(--text-light)]">Tipo de contrato:</span>
                <select
                  value={bulkContractType}
                  onChange={e => setBulkContractType(e.target.value as ContractType | '')}
                  className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-md h-7 px-2"
                >
                  <option value="">—</option>
                  {CONTRACT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={bulkSetContractType}
                  disabled={bulkContractLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary-soft)] hover:bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)] rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Check size={12} />
                  {bulkContractLoading ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            </>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)] rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              {bulkDeleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-[var(--text-light)] hover:text-[var(--text)]">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border border-[var(--border)] overflow-clip">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              {canResetPwd && (
                <th className="px-3 py-2.5 w-8">
                  <button type="button" onClick={toggleSelectAll} className="text-[var(--text-light)] hover:text-[var(--text)] flex items-center">
                    {selectedIds.size === users.length && users.length > 0
                      ? <CheckSquare2 size={13} className="text-[var(--primary)]" />
                      : <Square size={13} />}
                  </button>
                </th>
              )}
              <th className="px-3 py-2.5 w-10"></th>
              <th onClick={() => { setSort('name'); setPage(1) }} className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium cursor-pointer hover:text-[var(--text)] select-none">
                Nome<SortIcon active={sort === 'name'} dir={sortDir as 'asc' | 'desc'} />
              </th>
              <th onClick={() => { setSort('email'); setPage(1) }} className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden md:table-cell cursor-pointer hover:text-[var(--text)] select-none">
                E-mail<SortIcon active={sort === 'email'} dir={sortDir as 'asc' | 'desc'} />
              </th>
              {filterRole === 'parceiro_admin' && (
                <th onClick={() => { setSort('partner_name'); setPage(1) }} className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden sm:table-cell cursor-pointer hover:text-[var(--text)] select-none">
                  Empresa<SortIcon active={sort === 'partner_name'} dir={sortDir as 'asc' | 'desc'} />
                </th>
              )}
              {filterRole === 'cliente' && (
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden sm:table-cell">Cliente</th>
              )}
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden sm:table-cell">Perfil</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Contrato</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Sustentação</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton /> : users.length === 0 ? (
              <tr><td colSpan={(canResetPwd ? 8 : 7) + ((filterRole === 'parceiro_admin' || filterRole === 'cliente') ? 1 : 0)} className="px-3 py-8 text-center text-[var(--text-light)]">Nenhum usuário encontrado</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className={`border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors ${selectedIds.has(user.id) ? 'bg-[var(--primary-soft)]' : ''}`}>
                {canResetPwd && (
                  <td className="px-3 py-2.5 w-8">
                    <button type="button" onClick={() => toggleSelect(user.id)} className="text-[var(--text-light)] hover:text-[var(--text)] flex items-center">
                      {selectedIds.has(user.id)
                        ? <CheckSquare2 size={13} className="text-[var(--primary)]" />
                        : <Square size={13} />}
                    </button>
                  </td>
                )}
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    ...(canViewDetail    ? [{ label: 'Visualizar',           icon: <Eye      size={12} />, onClick: () => setViewUser(user) }] : []),
                    ...(canEdit          ? [{ label: 'Editar',               icon: <Pencil   size={12} />, onClick: () => openEdit(user) }] : []),
                    ...(canResetPwd      ? [{ label: 'Resetar senha',        icon: <KeyRound size={12} />, onClick: () => resetPassword(user), disabled: resetting === user.id }] : []),
                    ...(canResendWelcome && user.is_pending_invite ? [{ label: 'Convidar', icon: <UserPlus size={12} />, onClick: () => invite(user), disabled: resending === user.id }] : []),
                    ...(canResendWelcome && !user.is_pending_invite ? [{ label: 'Reenviar boas-vindas', icon: <Mail     size={12} />, onClick: () => resendWelcome(user), disabled: resending === user.id }] : []),
                    ...(canDelete        ? [{ label: 'Excluir',              icon: <Trash2   size={12} />, onClick: () => remove(user.id), danger: true, disabled: deleting === user.id }] : []),
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-[var(--text)] font-medium">{user.name}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] hidden md:table-cell">{user.email}</td>
                {filterRole === 'parceiro_admin' && (
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {user.partner?.name
                      ? <span className="text-xs font-medium text-[var(--text)]">{user.partner.name}</span>
                      : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                )}
                {filterRole === 'cliente' && (
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {user.customer?.name
                      ? <span className="text-xs font-medium text-[var(--text)]">{user.customer.name}</span>
                      : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                )}
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1 items-center">
                    {user.type && (
                      <Badge variant="outline" className="text-[10px] bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary)]">
                        {PROFILE_OPTIONS.find(o => resolveTypeForBackend(o.value) === user.type)?.label ?? user.type}
                      </Badge>
                    )}
                    {user.type === 'parceiro_admin' && user.is_executive && (
                      <Badge variant="outline" className="text-[10px] bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]">
                        Parceiro ADM
                      </Badge>
                    )}
                    {/* consultant_type só faz sentido pra consultor/parceiro_admin —
                        evita "Banco de Horas" aparecer para cliente/admin/etc por dado stale. */}
                    {user.consultant_type && (user.type === 'consultor' || user.type === 'parceiro_admin') && (
                      <span className="text-[10px] text-[var(--text-light)]">
                        {CONSULTANT_OPTIONS.find(o => o.value === user.consultant_type)?.label ?? user.consultant_type}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  {(user.type === 'consultor' || user.type === 'parceiro_admin') && user.contract_type
                    ? <span className="text-[10px] text-[var(--text)]">{contractLabel(user.contract_type)}</span>
                    : <span className="text-[10px] text-[var(--text-muted)]">—</span>}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  {(user.type === 'consultor' || user.type === 'parceiro_admin') ? (
                    user.can_timesheet_sustentacao
                      ? <span className="inline-flex items-center gap-1 text-[10px] text-[var(--success)]"><Check size={10} />Liberado</span>
                      : <span className="text-[10px] text-[var(--text-muted)]">Bloqueado</span>
                  ) : <span className="text-[10px] text-[var(--text-muted)]">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={`text-[10px] border ${user.enabled
                    ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
                    : 'bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]'}`}>
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
          <span className="text-[11px] text-[var(--text-light)]">Legenda:</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]">Parceiro</span>
            <span className="text-[11px] text-[var(--text-light)]">Consultor vinculado ao parceiro</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">Parceiro ADM</span>
            <span className="text-[11px] text-[var(--text-light)]">Administrador da empresa parceira</span>
          </div>
        </div>
      )}

      {/* Paginação */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(page - 1)} disabled={page === 1}
            className="p-1 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-[var(--text-light)]">Página {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={!hasNext}
            className="p-1 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* ── Modal criar/editar ── */}
      <UserFormModal
        open={modal.open}
        userId={modal.userId}
        onClose={() => setModal({ open: false, userId: null })}
        onSaved={load}
      />

      {/* ── Modal reset senha ── */}
      {resetModal.open && (
        <ModalOverlay onClose={() => setResetModal({ open: false, confirmed: false })}>
          <div className="p-5">
            {!resetModal.confirmed ? (
              // ── Passo 1: confirmação ──
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--warning-bg)] shrink-0">
                    <KeyRound size={15} className="text-[var(--warning)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">Resetar senha</h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-1">
                  Uma nova senha temporária será gerada para:
                </p>
                <p className="text-xs font-semibold text-[var(--text)] mb-0.5">{resetModal.userName}</p>
                <p className="text-xs text-[var(--text-light)] mb-4">{resetModal.userEmail}</p>
                <p className="text-xs text-[var(--text-light)] mb-5 p-3 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
                  A senha será exibida na tela para você copiar <span className="text-[var(--text)] font-medium">e um e-mail será enviado automaticamente</span> ao usuário com as instruções de acesso.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setResetModal({ open: false, confirmed: false })}
                    className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
                  <Button onClick={confirmReset} disabled={resetting === resetModal.userId}
                    className="h-8 text-xs bg-[var(--warning-bg)] hover:bg-[var(--warning-border)] text-[var(--primary-fg)] gap-1.5">
                    <KeyRound size={12} />
                    {resetting === resetModal.userId ? 'Gerando...' : 'Confirmar e Enviar E-mail'}
                  </Button>
                </div>
              </>
            ) : (
              // ── Passo 2: senha gerada ──
              <>
                <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Senha gerada com sucesso</h3>
                <p className="text-xs text-[var(--text-muted)] mb-2">Copie a senha abaixo para repassar ao usuário.</p>
                {resetModal.emailSent ? (
                  <p className="text-xs mb-4 px-2.5 py-1.5 rounded-lg bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success)]">
                    E-mail enviado para <span className="font-medium">{resetModal.userEmail}</span>
                  </p>
                ) : (
                  <p className="text-xs mb-4 px-2.5 py-1.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger)]">
                    Falha ao enviar e-mail — repasse a senha manualmente ao usuário.
                  </p>
                )}
                <div className="flex items-center gap-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm text-[var(--warning)] font-mono tracking-wider">
                    {resetModal.tempPassword}
                  </code>
                  <button onClick={copyPassword} className="text-[var(--text-light)] hover:text-[var(--text)] transition-colors">
                    {copied ? <Check size={14} className="text-[var(--success)]" /> : <Copy size={14} />}
                  </button>
                </div>
                <Button onClick={() => setResetModal({ open: false, confirmed: false })}
                  className="mt-4 w-full h-8 text-xs bg-[var(--surface-hover)] hover:bg-[var(--border-strong)] text-[var(--primary-fg)]">
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
              ? <span className="text-[var(--success)] text-xs font-medium">Ativo</span>
              : <span className="text-[var(--text-muted)] text-xs">Inativo</span> },
        ]
        if ((u.type === 'consultor' || u.type === 'parceiro_admin') && u.contract_type) rows.push({ label: 'Tipo de Contrato', value: contractLabel(u.contract_type) })
        // Folha de pagamento — perfis internos (todos exceto cliente/parceiro_admin)
        const showPayrollView = u.type !== 'cliente'
        if (showPayrollView && u.full_name)      rows.push({ label: 'Nome Completo', value: u.full_name })
        if (showPayrollView && u.cpf)            rows.push({ label: 'CPF', value: u.cpf })
        if (showPayrollView && u.matricula)      rows.push({ label: 'Matrícula', value: u.matricula })
        if (showPayrollView && u.payroll_status) rows.push({ label: 'Status (folha)', value: u.payroll_status })
        if (u.hourly_rate != null) rows.push({ label: 'Remuneração', value: `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(u.hourly_rate))} ${u.rate_type === 'monthly' ? '/ mês' : '/ hora'}` })
        if (u.daily_hours != null) rows.push({ label: 'Horas/dia útil', value: `${u.daily_hours}h` })
        if (u.guaranteed_hours != null && u.consultant_type === 'horista') rows.push({
          label: 'Horas garantidas',
          value: <span className="text-right">{u.guaranteed_hours}h/mês <span className="text-[var(--text-light)]">(piso mínimo de cobrança)</span></span>
        })
        return (
          <ModalOverlay onClose={() => setViewUser(null)}>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  {u.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{u.name}</p>
                  <p className="text-xs text-[var(--text-light)]">{u.email}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {rows.map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                    <span className="text-xs text-[var(--text-light)]">{row.label}</span>
                    <span className="text-xs text-[var(--text)] text-right">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* ── Histórico de alterações ── */}
              {rateHistLoading && (
                <p className="text-[10px] text-[var(--text-light)] mt-4">Carregando histórico...</p>
              )}
              {!rateHistLoading && rateHistory.length > 0 && (
                <div className="mt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-light)] mb-2">Histórico de Alterações</p>
                  <div className="rounded-lg overflow-y-auto max-h-[260px] border border-[var(--border)]">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                        <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                          <th className="text-left px-3 py-2 text-[var(--text-light)] font-medium">Data</th>
                          <th className="text-left px-3 py-2 text-[var(--text-light)] font-medium">Campo</th>
                          <th className="text-left px-3 py-2 text-[var(--text-light)] font-medium">De</th>
                          <th className="text-left px-3 py-2 text-[var(--text-light)] font-medium">Para</th>
                          <th className="text-left px-3 py-2 text-[var(--text-light)] font-medium">Por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateHistory.filter((h: any, i: number, a: any[]) => a.findIndex((x: any) => String(x.created_at ?? '').slice(0, 10) === String(h.created_at ?? '').slice(0, 10)) === i).flatMap((h: any, i: number) => {
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
                          <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                            <td className="px-3 py-2 text-[var(--text-muted)]">{row.date}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{row.campo}</td>
                            <td className="px-3 py-2 text-[var(--text-light)]">{row.de}</td>
                            <td className="px-3 py-2 text-[var(--text)] font-medium">{row.para}</td>
                            <td className="px-3 py-2 text-[var(--text-light)]">{row.by}</td>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <Pencil size={11} /> Editar
                </button>
                )}
                <button onClick={() => setViewUser(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
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
