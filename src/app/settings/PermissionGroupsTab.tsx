'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
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
  dashboard: 'Dashboard',
  dashboards: 'Dashboards',
  customers: 'Clientes',
  contracts: 'Contratos',
  projects: 'Projetos',
  gestao_projetos: 'Gestão de Projetos',
  fechamento: 'Fechamento',
  timesheets: 'Apontamentos',
  hours: 'Horas',
  expenses: 'Despesas',
  approvals: 'Aprovações',
  users: 'Usuários',
  financial: 'Financeiro',
  reports: 'Relatórios',
  consultant_groups: 'Grupos de Consultores',
  hora_banco: 'Banco de Horas',
  settings: 'Configurações',
  partners: 'Parceiros',
  services: 'Tipos de Serviço',
  executives: 'Executivos',
  groups: 'Grupos de Consultor',
  holidays: 'Feriados',
  expense_categories: 'Categorias de Despesa',
  expense_types: 'Tipos de Despesa',
  payment_methods: 'Formas de Pagamento',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'Visualizar', create: 'Criar', update: 'Editar', delete: 'Excluir',
  approve: 'Aprovar', reject: 'Rejeitar', export: 'Exportar', manage: 'Gerenciar',
  pay: 'Pagar', fechar: 'Fechar', reabrir: 'Reabrir',
  view_all: 'Ver Todos', view_own: 'Ver Próprios', view_own_profile: 'Ver Próprio Perfil',
  update_own_profile: 'Editar Próprio Perfil', update_all: 'Editar Todos',
  view_project_full: 'Ver Projeto Completo', view_project_summary: 'Ver Resumo do Projeto',
  view_project_cost: 'Ver Custo do Projeto', view_project_financial: 'Ver Financeiro do Projeto',
  view_financial: 'Ver Financeiro', view_own_rate: 'Ver Própria Taxa',
  view_partner_rate: 'Ver Taxa do Parceiro', view_team: 'Ver Equipe',
  assign_consultants: 'Atribuir Consultores', change_status: 'Alterar Status',
  reset_password: 'Redefinir Senha', manager: 'Gestor', consultant: 'Consultor',
  'bank_hours_fixed.view': 'Ver Banco de Horas Fixo',
  'bank_hours_monthly.view': 'Ver Banco de Horas Mensal',
  'on_demand.view': 'Ver On Demand',
  'fechado.view': 'Ver Fechado',
}

// Dropdown com busca por texto — substitui <select> nativo quando a lista
// é grande (200+ users). Mostra só o nome (sem email).
function UserSearchSelect({ users, value, onChange }: {
  users: UserOption[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = users.find(u => String(u.id) === value)
  const filtered = users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()))

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
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs text-left outline-none"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: selected ? 'var(--text)' : 'var(--text-light)',
          height: 28,
        }}
      >
        <span className="truncate">{selected ? selected.name : 'Adicionar usuário...'}</span>
        <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-[300] w-full min-w-72 rounded-lg overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--brand-card-shadow-md)',
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar usuário..."
              className="w-full bg-transparent text-xs outline-none px-1 py-0.5"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum usuário</p>
              : filtered.map(u => {
                  const isSelected = String(u.id) === value
                  return (
                    <button key={u.id} type="button"
                      onClick={() => { onChange(String(u.id)); setOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                      style={{
                        color: isSelected ? 'var(--primary)' : 'var(--text)',
                        background: isSelected ? 'var(--primary-soft)' : 'transparent',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      {u.name}
                    </button>
                  )
                })
            }
          </div>
        </div>
      )}
    </div>
  )
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
  const { refreshUser } = useAuth()
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
      // Reload do user logado pra refletir mudanças no próprio grupo se for o caso
      refreshUser().catch(() => {})
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
      refreshUser().catch(() => {})
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
      refreshUser().catch(() => {})
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao adicionar')
    }
  }

  async function removeUser(groupId: number, userId: number) {
    try {
      await api.delete(`/permission-groups/${groupId}/users/${userId}`)
      setGroupUsers(u => u.filter(x => x.id !== userId))
      load()
      refreshUser().catch(() => {})
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao remover')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[var(--text-muted)]">
          Crie grupos de permissões e vincule usuários para dar acesso além do perfil base.
        </p>
        <Button size="sm" onClick={openCreate} className="gap-1.5 text-xs h-7 px-2.5">
          <Plus size={12} /> Novo Grupo
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[var(--surface-hover)] rounded-lg animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-light)] text-xs">
          Nenhum grupo criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{g.name}</p>
                  {g.description && (
                    <p className="text-xs text-[var(--text-light)] truncate">{g.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-[var(--text-light)] mr-2">
                    {g.permissions.length} perm. · {g.users_count} usuário{g.users_count !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => openUsers(g)}
                    title="Gerenciar usuários"
                    className={`p-1.5 rounded hover:bg-[var(--surface-hover)] transition-colors ${showUsersFor === g.id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
                  >
                    <Users size={13} />
                  </button>
                  <button
                    onClick={() => openEdit(g)}
                    title="Editar grupo"
                    className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-muted)] transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => del(g)}
                    title="Excluir grupo"
                    className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--danger)] transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Users panel */}
              {showUsersFor === g.id && (
                <div className="border-t border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
                  <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Usuários vinculados</p>

                  {loadingUsers ? (
                    <p className="text-xs text-[var(--text-light)]">Carregando...</p>
                  ) : (
                    <>
                      <div className="space-y-1 mb-3">
                        {groupUsers.length === 0 ? (
                          <p className="text-xs text-[var(--text-light)]">Nenhum usuário vinculado.</p>
                        ) : groupUsers.map(u => (
                          <div key={u.id} className="flex items-center justify-between py-1">
                            <div>
                              <span className="text-xs text-[var(--text)]">{u.name}</span>
                              <span className="text-xs text-[var(--text-light)] ml-2">{u.email}</span>
                            </div>
                            <button
                              onClick={() => removeUser(g.id, u.id)}
                              className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--danger)]"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <UserSearchSelect
                          users={allUsers.filter(u => !groupUsers.some(gu => gu.id === u.id))}
                          value={addUserId}
                          onChange={setAddUserId}
                        />
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
          <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {editingId ? 'Editar Grupo' : 'Novo Grupo de Permissões'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-light)] hover:text-[var(--text)]">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1 block">Nome *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Aprovador de Despesas"
                  className="text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1 block">Descrição</Label>
                <Input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional"
                  className="text-xs h-8"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-[var(--text-muted)]">
                    Permissões ({form.permissions.length} selecionadas)
                  </Label>
                  {form.permissions.length > 0 && (
                    <button
                      onClick={() => setForm(f => ({ ...f, permissions: [] }))}
                      className="text-xs text-[var(--text-light)] hover:text-[var(--text)]"
                    >
                      Limpar tudo
                    </button>
                  )}
                </div>

                <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] p-3 max-h-64 overflow-y-auto">
                  {availablePerms.map(cat => {
                    const expanded = expandedCats.has(cat.category)
                    const selected = cat.permissions.filter(p => form.permissions.includes(p)).length
                    const allSel   = selected === cat.permissions.length
                    const hasAny   = selected > 0

                    return (
                      <div key={cat.category}>
                        <div
                          className="flex items-center gap-2 py-1 cursor-pointer select-none rounded transition-colors"
                          style={hasAny ? { background: 'var(--primary-soft)', paddingLeft: 6, paddingRight: 6 } : undefined}
                          onClick={() => toggleExpand(cat.category)}
                        >
                          {expanded
                            ? <ChevronDown size={12} className="shrink-0" style={{ color: hasAny ? 'var(--primary)' : 'var(--text-light)' }} />
                            : <ChevronRight size={12} className="shrink-0" style={{ color: hasAny ? 'var(--primary)' : 'var(--text-light)' }} />}
                          <span className="text-xs flex-1" style={{ color: hasAny ? 'var(--primary)' : 'var(--text-muted)', fontWeight: hasAny ? 600 : 500 }}>
                            {CATEGORY_LABELS[cat.category] ?? cat.category}
                          </span>
                          <span className="text-xs" style={{ color: hasAny ? 'var(--primary)' : 'var(--text-light)', fontWeight: hasAny ? 600 : 400 }}>{selected}/{cat.permissions.length}</span>
                          <button
                            onClick={e => { e.stopPropagation(); toggleCatAll(cat) }}
                            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${allSel ? 'text-[var(--primary)] hover:text-[var(--primary)]' : 'text-[var(--text-light)] hover:text-[var(--text)]'}`}
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
                                    active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                                  }`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                    active ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border-strong)]'
                                  }`}>
                                    {active && <Check size={9} className="text-[var(--primary-fg)]" />}
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

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border)] shrink-0">
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
