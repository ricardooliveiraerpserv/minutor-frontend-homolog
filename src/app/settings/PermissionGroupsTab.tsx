'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, X, Pencil, Trash2, Users, ChevronDown, ChevronRight, Check } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PermissionGroup {
  id: number
  name: string
  description: string | null
  permissions: string[]
  users_count: number
}

interface GroupUser {
  id: number
  name: string
  email: string
  type: string
  coordinator_type?: string | null
  consultant_type?: string | null
}

interface AvailablePermissionCategory {
  category: string
  permissions: string[]
}

interface UserOption {
  id: number
  name: string
  email: string
  type: string
}

// ─── Permission label helpers ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', dashboards: 'Dashboards', customers: 'Clientes',
  projects: 'Projetos', timesheets: 'Apontamentos', hours: 'Horas',
  expenses: 'Despesas', users: 'Usuários', financial: 'Financeiro',
  reports: 'Relatórios', consultant_groups: 'Grupos de Consultores',
  hora_banco: 'Banco de Horas', settings: 'Configurações',
  partners: 'Parceiros',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'Visualizar', create: 'Criar', update: 'Editar', delete: 'Excluir',
  approve: 'Aprovar', reject: 'Rejeitar', export: 'Exportar', manage: 'Gerenciar',
  view_all: 'Ver Todos', view_own: 'Ver Próprios', view_own_profile: 'Ver Próprio Perfil',
  update_own_profile: 'Editar Próprio Perfil', update_all: 'Editar Todos',
  view_project_full: 'Ver Projeto Completo', view_project_summary: 'Ver Resumo do Projeto',
  view_project_cost: 'Ver Custo do Projeto', view_own_rate: 'Ver Própria Taxa',
  view_partner_rate: 'Ver Taxa do Parceiro', view_team: 'Ver Equipe',
  assign_consultants: 'Atribuir Consultores', change_status: 'Alterar Status',
  reset_password: 'Redefinir Senha', manager: 'Gestor', consultant: 'Consultor',
  'bank_hours_fixed.view': 'Ver Banco de Horas Fixo',
  'bank_hours_monthly.view': 'Ver Banco de Horas Mensal',
  'on_demand.view': 'Ver On Demand',
}

function permLabel(perm: string): string {
  const parts = perm.split('.')
  if (parts.length === 1) return perm
  const action = parts.slice(1).join('.')
  return ACTION_LABELS[action] ?? action
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', description: '', permissions: [] as string[] }

// ─── Main component ───────────────────────────────────────────────────────────

export function PermissionGroupsTab() {
  const [groups, setGroups]               = useState<PermissionGroup[]>([])
  const [loading, setLoading]             = useState(true)
  const [showModal, setShowModal]         = useState(false)
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [saving, setSaving]               = useState(false)
  const [availablePerms, setAvailablePerms] = useState<AvailablePermissionCategory[]>([])
  const [expandedCats, setExpandedCats]   = useState<Set<string>>(new Set())
  const [showUsersFor, setShowUsersFor]   = useState<number | null>(null)
  const [groupUsers, setGroupUsers]       = useState<GroupUser[]>([])
  const [loadingUsers, setLoadingUsers]   = useState(false)
  const [allUsers, setAllUsers]           = useState<UserOption[]>([])
  const [addUserId, setAddUserId]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items: PermissionGroup[] }>('/permission-groups')
      setGroups(r.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get<AvailablePermissionCategory[]>('/permission-groups/available-permissions')
      .then(r => setAvailablePerms(Array.isArray(r) ? r : []))
      .catch(() => {})
    api.get<{ items: UserOption[] }>('/users?pageSize=500')
      .then(r => setAllUsers(r.items ?? []))
      .catch(() => {})
  }, [])

  // ── CRUD ──────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setExpandedCats(new Set())
    setShowModal(true)
  }

  function openEdit(g: PermissionGroup) {
    setEditingId(g.id)
    setForm({ name: g.name, description: g.description ?? '', permissions: [...g.permissions] })
    setExpandedCats(new Set())
    setShowModal(true)
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      if (editingId) {
        await api.put(`/permission-groups/${editingId}`, form)
        toast.success('Grupo atualizado')
      } else {
        await api.post('/permission-groups', form)
        toast.success('Grupo criado')
      }
      setShowModal(false)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function del(g: PermissionGroup) {
    if (!confirm(`Excluir grupo "${g.name}"?`)) return
    try {
      await api.delete(`/permission-groups/${g.id}`)
      toast.success('Grupo excluído')
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao excluir')
    }
  }

  // ── Permission toggles ────────────────────────────────────────────────────

  function togglePerm(perm: string) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }))
  }

  function toggleCatAll(cat: AvailablePermissionCategory) {
    const catPerms = cat.permissions
    const allSelected = catPerms.every(p => form.permissions.includes(p))
    setForm(f => ({
      ...f,
      permissions: allSelected
        ? f.permissions.filter(p => !catPerms.includes(p))
        : [...new Set([...f.permissions, ...catPerms])],
    }))
  }

  function toggleExpand(cat: string) {
    setExpandedCats(s => {
      const n = new Set(s)
      n.has(cat) ? n.delete(cat) : n.add(cat)
      return n
    })
  }

  // ── Users panel ───────────────────────────────────────────────────────────

  async function openUsers(g: PermissionGroup) {
    if (showUsersFor === g.id) { setShowUsersFor(null); return }
    setShowUsersFor(g.id)
    setAddUserId('')
    setLoadingUsers(true)
    try {
      const r = await api.get<{ items: GroupUser[] }>(`/permission-groups/${g.id}/users`)
      setGroupUsers(r.items ?? [])
    } finally {
      setLoadingUsers(false)
    }
  }

  async function addUser(groupId: number) {
    if (!addUserId) return
    try {
      await api.post(`/permission-groups/${groupId}/users`, { user_id: Number(addUserId) })
      toast.success('Usuário adicionado')
      setAddUserId('')
      const r = await api.get<{ items: GroupUser[] }>(`/permission-groups/${groupId}/users`)
      setGroupUsers(r.items ?? [])
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao adicionar')
    }
  }

  async function removeUser(groupId: number, userId: number) {
    try {
      await api.delete(`/permission-groups/${groupId}/users/${userId}`)
      setGroupUsers(u => u.filter(x => x.id !== userId))
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao remover')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-400">
          Crie grupos de permissões e vincule usuários para dar acesso além do perfil base.
        </p>
        <Button size="sm" onClick={openCreate} className="gap-1.5 text-xs h-7 px-2.5">
          <Plus size={12} /> Novo Grupo
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-zinc-800 rounded-lg animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 text-xs">
          Nenhum grupo criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="rounded-lg border border-zinc-800 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{g.name}</p>
                  {g.description && (
                    <p className="text-xs text-zinc-500 truncate">{g.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-zinc-500 mr-2">
                    {g.permissions.length} perm. · {g.users_count} usuário{g.users_count !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => openUsers(g)}
                    title="Gerenciar usuários"
                    className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${showUsersFor === g.id ? 'text-blue-400' : 'text-zinc-400'}`}
                  >
                    <Users size={13} />
                  </button>
                  <button
                    onClick={() => openEdit(g)}
                    title="Editar grupo"
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => del(g)}
                    title="Excluir grupo"
                    className="p-1.5 rounded hover:bg-zinc-700 text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Users panel */}
              {showUsersFor === g.id && (
                <div className="border-t border-zinc-800 bg-zinc-900/60 px-4 py-3">
                  <p className="text-xs font-medium text-zinc-400 mb-2">Usuários vinculados</p>

                  {loadingUsers ? (
                    <p className="text-xs text-zinc-500">Carregando...</p>
                  ) : (
                    <>
                      <div className="space-y-1 mb-3">
                        {groupUsers.length === 0 ? (
                          <p className="text-xs text-zinc-500">Nenhum usuário vinculado.</p>
                        ) : groupUsers.map(u => (
                          <div key={u.id} className="flex items-center justify-between py-1">
                            <div>
                              <span className="text-xs text-white">{u.name}</span>
                              <span className="text-xs text-zinc-500 ml-2">{u.email}</span>
                            </div>
                            <button
                              onClick={() => removeUser(g.id, u.id)}
                              className="p-1 rounded hover:bg-zinc-700 text-red-400"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <select
                          value={addUserId}
                          onChange={e => setAddUserId(e.target.value)}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="">Adicionar usuário...</option>
                          {allUsers
                            .filter(u => !groupUsers.some(gu => gu.id === u.id))
                            .map(u => (
                              <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                            ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!addUserId}
                          onClick={() => addUser(g.id)}
                          className="text-xs h-7 px-2.5"
                        >
                          Adicionar
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: criar / editar grupo ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h3 className="text-sm font-semibold text-white">
                {editingId ? 'Editar Grupo' : 'Novo Grupo de Permissões'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Nome *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Aprovador de Despesas"
                  className="text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Descrição</Label>
                <Input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional"
                  className="text-xs h-8"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-zinc-400">
                    Permissões ({form.permissions.length} selecionadas)
                  </Label>
                  {form.permissions.length > 0 && (
                    <button
                      onClick={() => setForm(f => ({ ...f, permissions: [] }))}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Limpar tudo
                    </button>
                  )}
                </div>

                <div className="space-y-1 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 max-h-64 overflow-y-auto">
                  {availablePerms.map(cat => {
                    const expanded = expandedCats.has(cat.category)
                    const selected = cat.permissions.filter(p => form.permissions.includes(p)).length
                    const allSel   = selected === cat.permissions.length

                    return (
                      <div key={cat.category}>
                        <div
                          className="flex items-center gap-2 py-1 cursor-pointer select-none"
                          onClick={() => toggleExpand(cat.category)}
                        >
                          {expanded ? <ChevronDown size={12} className="text-zinc-500 shrink-0" /> : <ChevronRight size={12} className="text-zinc-500 shrink-0" />}
                          <span className="text-xs font-medium text-zinc-300 flex-1">
                            {CATEGORY_LABELS[cat.category] ?? cat.category}
                          </span>
                          <span className="text-xs text-zinc-500">{selected}/{cat.permissions.length}</span>
                          <button
                            onClick={e => { e.stopPropagation(); toggleCatAll(cat) }}
                            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${allSel ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            {allSel ? 'Remover' : 'Todos'}
                          </button>
                        </div>

                        {expanded && (
                          <div className="pl-5 space-y-0.5 pb-1">
                            {cat.permissions.map(perm => {
                              const active = form.permissions.includes(perm)
                              return (
                                <button
                                  key={perm}
                                  onClick={() => togglePerm(perm)}
                                  className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors text-left ${
                                    active ? 'bg-blue-500/10 text-blue-300' : 'text-zinc-400 hover:bg-zinc-700/50'
                                  }`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                    active ? 'bg-blue-600 border-blue-500' : 'border-zinc-600'
                                  }`}>
                                    {active && <Check size={9} className="text-white" />}
                                  </span>
                                  {permLabel(perm)}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} className="text-xs h-7 px-3">
                Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={saving} className="text-xs h-7 px-3">
                {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Criar Grupo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
