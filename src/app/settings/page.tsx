'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Settings, Shield,
  Plus, Pencil, Trash2, X, Check, Search,
  RefreshCw, CheckCircle, XCircle, TrendingUp, Users,
} from 'lucide-react'
import type { Role, Permission, SystemSettings } from '@/types'
import { UserManagementTab } from './UserManagementTab'

// ─── helpers ────────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant="outline" className={`text-[10px] border ${active
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </Badge>
  )
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-zinc-800">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

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

// ─── TRADUÇÕES DE PERMISSÕES ─────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  'admin.full_access': 'Acesso total ao sistema',
  'roles.view': 'Visualizar perfis de acesso', 'roles.create': 'Criar perfis de acesso',
  'roles.update': 'Editar perfis de acesso', 'roles.delete': 'Excluir perfis de acesso',
  'permissions.view': 'Visualizar permissões', 'permissions.create': 'Criar permissões',
  'permissions.update': 'Editar permissões', 'permissions.delete': 'Excluir permissões',
  'projects.view': 'Visualizar projetos', 'projects.view_sensitive_data': 'Ver dados sensíveis de projetos',
  'projects.view_costs': 'Ver custos de projetos', 'projects.create': 'Criar projetos',
  'projects.update': 'Editar projetos', 'projects.delete': 'Excluir projetos',
  'projects.assign_people': 'Atribuir pessoas a projetos', 'projects.change_status': 'Alterar status de projetos',
  'hours.view': 'Visualizar apontamentos', 'hours.view_own': 'Visualizar próprios apontamentos',
  'hours.view_all': 'Visualizar todos os apontamentos', 'hours.view_sensitive_data': 'Ver dados sensíveis de apontamentos',
  'hours.create': 'Criar apontamentos', 'hours.update_own': 'Editar próprios apontamentos',
  'hours.update_all': 'Editar todos os apontamentos', 'hours.delete_own': 'Excluir próprios apontamentos',
  'hours.delete_all': 'Excluir todos os apontamentos', 'hours.approve': 'Aprovar apontamentos',
  'hours.reject': 'Rejeitar apontamentos',
  'expenses.view': 'Visualizar despesas', 'expenses.view_own': 'Visualizar próprias despesas',
  'expenses.view_all': 'Visualizar todas as despesas', 'expenses.view_sensitive_data': 'Ver dados sensíveis de despesas',
  'expenses.create': 'Criar despesas', 'expenses.update_own': 'Editar próprias despesas',
  'expenses.update_all': 'Editar todas as despesas', 'expenses.delete_own': 'Excluir próprias despesas',
  'expenses.delete_all': 'Excluir todas as despesas', 'expenses.approve': 'Aprovar despesas',
  'expenses.reject': 'Rejeitar despesas',
  'reports.view': 'Visualizar relatórios', 'reports.generate': 'Gerar relatórios',
  'reports.export': 'Exportar relatórios', 'reports.financial': 'Relatórios financeiros',
  'dashboard.view': 'Visualizar dashboard', 'dashboard.admin': 'Dashboard administrativo',
  'dashboard.manager': 'Dashboard gerencial', 'dashboard.consultant': 'Dashboard consultor',
  'dashboards.view': 'Acessar dashboards', 'dashboards.bank_hours_fixed.view': 'Dashboard banco de horas fixo',
  'dashboards.bank_hours_monthly.view': 'Dashboard banco de horas mensais',
  'customers.view': 'Visualizar clientes', 'customers.create': 'Criar clientes',
  'customers.update': 'Editar clientes', 'customers.delete': 'Excluir clientes',
  'users.view': 'Visualizar usuários', 'users.view_all': 'Visualizar todos os usuários',
  'users.create': 'Criar usuários', 'users.update': 'Editar usuários',
  'users.update_own_profile': 'Editar próprio perfil', 'users.delete': 'Excluir usuários',
  'users.manage_roles': 'Gerenciar perfis de usuários', 'users.reset_password': 'Redefinir senhas',
  'consultant_groups.view': 'Visualizar grupos de consultores', 'consultant_groups.create': 'Criar grupos de consultores',
  'consultant_groups.update': 'Editar grupos de consultores', 'consultant_groups.delete': 'Excluir grupos de consultores',
  'system_settings.view': 'Visualizar configurações do sistema', 'system_settings.update': 'Editar configurações do sistema',
  'expense_categories.view': 'Visualizar categorias de despesas', 'expense_categories.create': 'Criar categorias de despesas',
  'expense_categories.update': 'Editar categorias de despesas', 'expense_categories.delete': 'Excluir categorias de despesas',
  'expense_types.view': 'Visualizar tipos de despesas', 'expense_types.create': 'Criar tipos de despesas',
  'expense_types.update': 'Editar tipos de despesas', 'expense_types.delete': 'Excluir tipos de despesas',
  'payment_methods.view': 'Visualizar métodos de pagamento', 'payment_methods.create': 'Criar métodos de pagamento',
  'payment_methods.update': 'Editar métodos de pagamento', 'payment_methods.delete': 'Excluir métodos de pagamento',
  'service_types.view': 'Visualizar tipos de serviço', 'service_types.create': 'Criar tipos de serviço',
  'service_types.update': 'Editar tipos de serviço', 'service_types.delete': 'Excluir tipos de serviço',
  'contract_types.view': 'Visualizar tipos de contrato', 'contract_types.create': 'Criar tipos de contrato',
  'contract_types.update': 'Editar tipos de contrato', 'contract_types.delete': 'Excluir tipos de contrato',
  'project_statuses.view': 'Visualizar status de projetos', 'project_statuses.create': 'Criar status de projetos',
  'project_statuses.update': 'Editar status de projetos', 'project_statuses.delete': 'Excluir status de projetos',
}

const GROUP_LABELS: Record<string, string> = {
  admin: 'Administração', roles: 'Perfis de Acesso', permissions: 'Permissões',
  projects: 'Projetos', hours: 'Apontamentos', expenses: 'Despesas',
  reports: 'Relatórios', dashboard: 'Dashboard', dashboards: 'Dashboards',
  customers: 'Clientes', users: 'Usuários', consultant_groups: 'Grupos de Consultores',
  system_settings: 'Configurações do Sistema', expense_categories: 'Categorias de Despesas',
  expense_types: 'Tipos de Despesa', payment_methods: 'Métodos de Pagamento',
  service_types: 'Tipos de Serviço', contract_types: 'Tipos de Contrato',
  project_statuses: 'Status de Projetos',
}

// ─── TABS ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'Geral',            icon: Settings },
  { id: 'users',   label: 'Usuários',         icon: Users },
  { id: 'roles',   label: 'Perfis de Acesso', icon: Shield },
]

// ─── TAB: GENERAL SETTINGS ───────────────────────────────────────────────────

interface MovideskStatus {
  last_sync: string | null
  last_sync_human: string | null
  total_imported: number
  today_imported: number
  token_configured: boolean
}

function GeneralTab() {
  const [settings, setSettings] = useState<SystemSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([])
  const [movideskStatus, setMovideskStatus] = useState<MovideskStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncOutput, setSyncOutput] = useState<string | null>(null)

  const loadMovideskStatus = useCallback(async () => {
    try {
      const r = await api.get<MovideskStatus>('/movidesk/status')
      setMovideskStatus(r)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    Promise.all([
      api.get<{ data: SystemSettings }>('/system-settings'),
      api.get<{ data: { id: number; name: string }[] }>('/customers?pageSize=500'),
    ]).then(([s, c]) => {
      setSettings(s.data ?? s as unknown as SystemSettings)
      const cArr = Array.isArray((c as any)?.items) ? (c as any).items : Array.isArray((c as any)?.data) ? (c as any).data : []
      setCustomers(cArr)
    }).catch((e) => toast.error('Erro ao carregar configurações: ' + (e instanceof ApiError ? e.message : String(e))))
      .finally(() => setLoading(false))
    loadMovideskStatus()
  }, [loadMovideskStatus])

  useEffect(() => {
    if (!settings.movidesk_default_customer_id) { setProjects([]); return }
    api.get<{ data: { id: number; name: string }[] }>(
      `/projects?customer_id=${settings.movidesk_default_customer_id}&per_page=200`
    ).then(r => {
      const arr = Array.isArray((r as any)?.items) ? (r as any).items : Array.isArray((r as any)?.data) ? (r as any).data : []
      setProjects(arr)
    }).catch(() => setProjects([]))
  }, [settings.movidesk_default_customer_id])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/system-settings', settings)
      toast.success('Configurações salvas')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const syncMovidesk = async () => {
    setSyncing(true)
    setSyncOutput(null)
    try {
      const r = await api.post<{ success: boolean; message: string; output?: string; last_sync_human?: string; today_imported?: number; total_imported?: number }>('/movidesk/sync', {})
      setSyncOutput(r.output ?? r.message)
      setMovideskStatus(prev => prev ? {
        ...prev,
        last_sync_human: r.last_sync_human ?? prev.last_sync_human,
        today_imported:  r.today_imported  ?? prev.today_imported,
        total_imported:  r.total_imported  ?? prev.total_imported,
      } : null)
      toast.success('Sync concluído')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>

  return (
    <div className="space-y-8 max-w-lg">
      <section>
        <h3 className="text-sm font-medium text-zinc-300 mb-4 pb-2 border-b border-zinc-800">Apontamento de Horas</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Limite de dias para lançamento retroativo</Label>
            <Input
              type="number" min={0} max={365}
              value={settings.timesheet_retroactive_limit_days ?? ''}
              onChange={e => setSettings(s => ({ ...s, timesheet_retroactive_limit_days: Number(e.target.value) }))}
              className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 w-40"
            />
            <p className="text-[11px] text-zinc-500 mt-1">0 = sem limite. Máximo 365 dias.</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-300 mb-4 pb-2 border-b border-zinc-800">Integração Movidesk</h3>

        {/* Status panel */}
        {movideskStatus && (
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Status da integração</span>
              {movideskStatus.token_configured
                ? <span className="inline-flex items-center gap-1 text-[11px] text-green-400"><CheckCircle size={11} /> Token configurado</span>
                : <span className="inline-flex items-center gap-1 text-[11px] text-red-400"><XCircle size={11} /> Token não configurado</span>
              }
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-[10px] text-zinc-500 mb-0.5">Último sync</p>
                <p className="text-xs font-semibold text-zinc-200">{movideskStatus.last_sync_human ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-[10px] text-zinc-500 mb-0.5">Importados hoje</p>
                <p className="text-xs font-semibold text-zinc-200">{movideskStatus.today_imported}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-[10px] text-zinc-500 mb-0.5">Total importado</p>
                <p className="text-xs font-semibold text-zinc-200">{movideskStatus.total_imported}</p>
              </div>
            </div>
            <Button
              onClick={syncMovidesk}
              disabled={syncing || !movideskStatus.token_configured}
              className="w-full h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </Button>
            {syncOutput && (
              <pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-[10px] text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {syncOutput}
              </pre>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Cliente padrão (fallback)</Label>
            <select
              value={settings.movidesk_default_customer_id ?? ''}
              onChange={e => setSettings(s => ({ ...s, movidesk_default_customer_id: Number(e.target.value) || undefined, movidesk_default_project_id: undefined }))}
              className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-3"
            >
              <option value="">Nenhum</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Projeto padrão (fallback)</Label>
            <select
              value={settings.movidesk_default_project_id ?? ''}
              onChange={e => setSettings(s => ({ ...s, movidesk_default_project_id: Number(e.target.value) || undefined }))}
              disabled={!settings.movidesk_default_customer_id}
              className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-3 disabled:opacity-40"
            >
              <option value="">Nenhum</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white h-9 text-xs">
        {saving ? 'Salvando...' : 'Salvar configurações'}
      </Button>
    </div>
  )
}


// ─── TAB: ROLES ──────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; item?: Role }>({ open: false })
  const [permModal, setPermModal] = useState<Role | null>(null)
  const [allPerms, setAllPerms] = useState<{ group: string; permissions: Permission[] }[]>([])
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<{ id: number; name: string; email: string }[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [form, setForm] = useState({ name: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items?: Role[]; data?: Role[] }>('/roles?with_permissions=true')
      setRoles(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? (r as unknown as Role[]) : [])
    } catch { toast.error('Erro ao carregar perfis') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadUsers = useCallback(async (roleFilter: string) => {
    setLoadingUsers(true)
    try {
      const params = new URLSearchParams({ pageSize: '500' })
      if (roleFilter) params.set('role', roleFilter)
      const r = await api.get<{ items: { id: number; name: string; email: string }[] }>(`/users?${params}`)
      setAllUsers(Array.isArray(r?.items) ? r.items : [])
    } catch { /* silencioso */ }
    finally { setLoadingUsers(false) }
  }, [])

  const openPerms = async (role: Role) => {
    setPermModal(role)
    setSelectedPerms(role.permissions?.map(p => p.name) ?? [])
    setUserSearch('')
    setUserRoleFilter('')
    // Carrega permissões disponíveis (só uma vez)
    if (allPerms.length === 0) {
      try {
        const r = await api.get<{ data: { group: string; permissions: Permission[] }[] }>('/permissions/grouped')
        setAllPerms(Array.isArray(r?.data) ? r.data : Array.isArray(r) ? (r as unknown as { group: string; permissions: Permission[] }[]) : [])
      } catch { toast.error('Erro ao carregar permissões') }
    }
    // Carrega usuários e pré-seleciona os já vinculados ao role
    try {
      const [usersRes, roleUsersRes] = await Promise.all([
        api.get<{ items: { id: number; name: string; email: string }[] }>('/users?pageSize=500'),
        api.get<{ items: { id: number; name: string; email: string }[] }>(`/roles/${role.id}/users`),
      ])
      setAllUsers(Array.isArray(usersRes?.items) ? usersRes.items : [])
      setSelectedUserIds((roleUsersRes?.items ?? []).map((u: { id: number }) => u.id))
    } catch { toast.error('Erro ao carregar usuários') }
  }

  const savePerms = async () => {
    if (!permModal) return
    setSaving(true)
    try {
      await Promise.all([
        api.post(`/roles/${permModal.id}/permissions`, { permissions: selectedPerms }),
        api.post(`/roles/${permModal.id}/sync-users`, { user_ids: selectedUserIds }),
      ])
      toast.success('Permissões e consultores atualizados')
      setPermModal(null)
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const save = async () => {
    setSaving(true)
    try {
      if (modal.item) await api.put(`/roles/${modal.item.id}`, form)
      else await api.post('/roles', form)
      toast.success(modal.item ? 'Perfil atualizado' : 'Perfil criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Confirmar exclusão?')) return
    setDeleting(id)
    try {
      await api.delete(`/roles/${id}`)
      toast.success('Perfil excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setForm({ name: '' }); setModal({ open: true }) }} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo Perfil
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Permissões</th>
              <th className="px-3 py-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TableSkeleton cols={3} /> : roles.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-zinc-500">Nenhum perfil</td></tr>
            ) : roles.map(role => (
              <tr key={role.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-200">{role.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden sm:table-cell">{role.permissions?.length ?? 0} permissões</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openPerms(role)} className="p-1 text-zinc-500 hover:text-blue-400 transition-colors" title="Gerenciar permissões"><Shield size={12} /></button>
                    <button onClick={() => { setForm({ name: role.name }); setModal({ open: true, item: role }) }} className="p-1 text-zinc-500 hover:text-zinc-200"><Pencil size={12} /></button>
                    <button onClick={() => remove(role.id)} disabled={deleting === role.id} className="p-1 text-zinc-500 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Perfil' : 'Novo Perfil'}</h3>
            <div>
              <Label className="text-xs text-zinc-400">Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ name: e.target.value })}
                className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {permModal && (
        <ModalOverlay onClose={() => setPermModal(null)}>
          <div className="p-5 max-h-[80vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4">Permissões — {permModal.name}</h3>
            <div className="space-y-4">
              {allPerms.map(group => (
                <div key={(group as any).category ?? (group as any).group}>
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2 border-b border-zinc-800 pb-1">{GROUP_LABELS[(group as any).category ?? (group as any).group] ?? (group as any).category ?? (group as any).group}</p>
                  <div className="space-y-1">
                    {(group.permissions ?? []).map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                        <div
                          onClick={() => setSelectedPerms(s => s.includes(p.name) ? s.filter(x => x !== p.name) : [...s, p.name])}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${selectedPerms.includes(p.name) ? 'bg-blue-600 border-blue-600' : 'border-zinc-600 hover:border-zinc-400'}`}
                        >
                          {selectedPerms.includes(p.name) && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">{PERMISSION_LABELS[p.name] ?? p.description ?? p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Seção: Consultores vinculados */}
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2 border-b border-zinc-800 pb-1">Consultores vinculados</p>
              <div className="flex gap-2 mb-2">
                <select
                  value={userRoleFilter}
                  onChange={e => { setUserRoleFilter(e.target.value); loadUsers(e.target.value) }}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2 outline-none focus:border-zinc-500 flex-1"
                >
                  <option value="">Todos os perfis</option>
                  <option value="Consultor">Consultor</option>
                  <option value="Coordenador">Coordenador</option>
                  <option value="Parceiro ADM">Parceiro ADM</option>
                </select>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md h-8 px-2.5 outline-none focus:border-zinc-500 flex-1"
                />
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {loadingUsers ? (
                  <p className="text-xs text-zinc-500 italic">Carregando...</p>
                ) : allUsers
                  .filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                  .map(u => {
                    const checked = selectedUserIds.includes(u.id)
                    return (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer group">
                        <div
                          onClick={() => setSelectedUserIds(ids => checked ? ids.filter(id => id !== u.id) : [...ids, u.id])}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-zinc-600 hover:border-zinc-400'}`}
                        >
                          {checked && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs text-zinc-300 group-hover:text-white transition-colors leading-tight">
                          {u.name} <span className="text-zinc-500">{u.email}</span>
                        </span>
                      </label>
                    )
                  })}
                {!loadingUsers && allUsers.length === 0 && <p className="text-xs text-zinc-500 italic">Nenhum usuário encontrado.</p>}
              </div>
            </div>

            <div className="flex gap-2 mt-5 justify-end sticky bottom-0 bg-zinc-900 pt-3 border-t border-zinc-800">
              <Button variant="outline" onClick={() => setPermModal(null)} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={savePerms} disabled={saving} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar permissões'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}



// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const active = TABS.find(t => t.id === activeTab)!

  return (
    <AppLayout title="Configurações">
      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 hidden md:block">
          <ul className="space-y-0.5">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Mobile tabs */}
        <div className="flex gap-1 mb-4 md:hidden flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                  activeTab === tab.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800/60'
                }`}>
                <Icon size={12} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
            <active.icon size={14} className="text-zinc-400" />
            {active.label}
          </h2>

          {activeTab === 'general'    && <GeneralTab />}
          {activeTab === 'users'      && <UserManagementTab />}
          {activeTab === 'roles'      && <RolesTab />}
        </div>
      </div>
    </AppLayout>
  )
}
