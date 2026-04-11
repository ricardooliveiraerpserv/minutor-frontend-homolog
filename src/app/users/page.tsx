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
import type { Role } from '@/types'

interface UserItem {
  id: number
  name: string
  email: string
  enabled: boolean
  hourly_rate?: number
  roles?: { id: number; name: string }[]
  created_at: string
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

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEnabled, setFilterEnabled] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; item?: UserItem }>({ open: false })
  const [resetModal, setResetModal] = useState<{ open: boolean; userId?: number; tempPassword?: string }>({ open: false })
  const [form, setForm] = useState({ name: '', email: '', password: '', enabled: true, hourly_rate: '', role_ids: [] as number[] })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [resetting, setResetting] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get<{ data: Role[] }>('/roles').then(r => setRoles(Array.isArray(r?.data) ? r.data : [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), per_page: '15' })
      if (search) p.set('search', search)
      if (filterEnabled) p.set('enabled', filterEnabled)
      if (filterRole) p.set('role', filterRole)
      const r = await api.get<{ items?: UserItem[]; data?: UserItem[]; hasNext?: boolean; meta?: { last_page: number } }>(`/users?${p}`)
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(list)
      setHasNext(!!(r?.hasNext || (r?.meta && page < r.meta.last_page)))
    } catch { toast.error('Erro ao carregar usuários') }
    finally { setLoading(false) }
  }, [page, search, filterEnabled, filterRole])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ name: '', email: '', password: '', enabled: true, hourly_rate: '', role_ids: [] })
    setModal({ open: true })
  }

  const openEdit = (item: UserItem) => {
    setForm({
      name: item.name,
      email: item.email,
      password: '',
      enabled: item.enabled,
      hourly_rate: item.hourly_rate ? String(item.hourly_rate) : '',
      role_ids: item.roles?.map(r => r.id) ?? []
    })
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        enabled: form.enabled,
        roles: form.role_ids,
      }
      if (form.hourly_rate) payload.hourly_rate = parseFloat(form.hourly_rate)
      if (!modal.item && form.password) payload.password = form.password

      if (modal.item) await api.put(`/users/${modal.item.id}`, payload)
      else await api.post('/users', payload)

      toast.success(modal.item ? 'Usuário atualizado' : 'Usuário criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Confirmar exclusão do usuário?')) return
    setDeleting(id)
    try {
      await api.delete(`/users/${id}`)
      toast.success('Usuário excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const resetPassword = async (id: number) => {
    setResetting(id)
    try {
      const r = await api.post<{ temporary_password: string; message: string }>(`/users/${id}/reset-password`, {})
      setResetModal({ open: true, userId: id, tempPassword: r.temporary_password })
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao resetar senha') }
    finally { setResetting(null) }
  }

  const copyPassword = () => {
    if (resetModal.tempPassword) {
      navigator.clipboard.writeText(resetModal.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const toggleRole = (id: number) => {
    setForm(f => ({
      ...f,
      role_ids: f.role_ids.includes(id) ? f.role_ids.filter(x => x !== id) : [...f.role_ids, id]
    }))
  }

  return (
    <AppLayout title="Usuários">
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nome ou e-mail..." className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs" />
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
          {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
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
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext} className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4">
              {modal.item ? 'Editar Usuário' : 'Novo Usuário'}
            </h3>
            <div className="space-y-3">
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
              <div>
                <Label className="text-xs text-zinc-400">Valor/Hora (R$)</Label>
                <Input type="number" min="0" step="0.01" value={form.hourly_rate}
                  onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs w-40" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.enabled ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.enabled ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>
              {roles.length > 0 && (
                <div>
                  <Label className="text-xs text-zinc-400 mb-2 block">Perfis de acesso</Label>
                  <div className="space-y-1 border border-zinc-700 rounded-md p-2">
                    {roles.map(r => (
                      <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                        <div onClick={() => toggleRole(r.id)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${form.role_ids.includes(r.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-600 hover:border-zinc-400'}`}>
                          {form.role_ids.includes(r.id) && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs text-zinc-300">{r.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name || !form.email} className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal reset senha */}
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
            <Button onClick={() => setResetModal({ open: false })} className="mt-4 w-full h-8 text-xs bg-zinc-700 hover:bg-zinc-600 text-white">
              Fechar
            </Button>
          </div>
        </ModalOverlay>
      )}
    </AppLayout>
  )
}
