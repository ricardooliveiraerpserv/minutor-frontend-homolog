'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, TextInput, SkeletonTable, EmptyState, Modal, PageHeader,
} from '@/components/ds'
import { Building2, Plus, Pencil, Users, Trash2, X, Save } from 'lucide-react'

type CompanyType = 'internal' | 'external'
type CompanyStatus = 'active' | 'inactive'
const ROLES = ['admin', 'administrativo', 'coordenador', 'consultor', 'cliente', 'parceiro_admin'] as const
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', administrativo: 'Administrativo', coordenador: 'Coordenador',
  consultor: 'Consultor', cliente: 'Cliente', parceiro_admin: 'Parceiro',
}

interface Company {
  id: number; name: string; slug: string; cnpj: string | null
  type: CompanyType; status: CompanyStatus; users_count: number
}
interface CompanyUser { id: number; name: string; email: string; role: string }
interface UserOption { id: number; name: string }

export default function EmpresasPage() {
  const [list, setList] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  // Modal cadastro/edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [type, setType] = useState<CompanyType>('internal')
  const [status, setStatus] = useState<CompanyStatus>('active')
  const [saving, setSaving] = useState(false)

  // Modal usuários
  const [usersOpen, setUsersOpen] = useState(false)
  const [current, setCurrent] = useState<Company | null>(null)
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<string>('consultor')

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Company[] }>('/companies')
      .then(r => setList(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar empresas'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditing(null); setName(''); setCnpj(''); setType('internal'); setStatus('active'); setModalOpen(true)
  }
  const openEdit = (c: Company) => {
    setEditing(c); setName(c.name); setCnpj(c.cnpj ?? ''); setType(c.type); setStatus(c.status); setModalOpen(true)
  }

  const save = async () => {
    if (!name.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), cnpj: cnpj.trim() || null, type, status }
      if (editing) await api.put(`/companies/${editing.id}`, payload)
      else await api.post('/companies', payload)
      toast.success(editing ? 'Empresa atualizada' : 'Empresa criada')
      setModalOpen(false); load()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const openUsers = async (c: Company) => {
    setCurrent(c); setUsersOpen(true); setAddUserId(''); setAddRole('consultor')
    try {
      const [u, all] = await Promise.all([
        api.get<{ data: CompanyUser[] }>(`/companies/${c.id}/users`),
        api.get<any>('/users?minimal=true'),
      ])
      setUsers(u.data ?? [])
      const arr = Array.isArray(all) ? all : (all.items ?? all.data ?? [])
      setAllUsers(arr.map((x: any) => ({ id: x.id, name: x.name })))
    } catch { toast.error('Erro ao carregar usuários') }
  }
  const reloadUsers = async (cid: number) => {
    const u = await api.get<{ data: CompanyUser[] }>(`/companies/${cid}/users`)
    setUsers(u.data ?? [])
    setList(prev => prev.map(c => c.id === cid ? { ...c, users_count: (u.data ?? []).length } : c))
  }

  const addUser = async () => {
    if (!current || !addUserId) { toast.error('Selecione o usuário'); return }
    try {
      await api.post(`/companies/${current.id}/users`, { user_id: Number(addUserId), role: addRole })
      setAddUserId(''); await reloadUsers(current.id); toast.success('Usuário vinculado')
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  const changeRole = async (u: CompanyUser, role: string) => {
    if (!current) return
    try { await api.put(`/companies/${current.id}/users/${u.id}`, { role }); await reloadUsers(current.id) }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro'); await reloadUsers(current.id) }
  }
  const removeUser = async (u: CompanyUser) => {
    if (!current || !confirm(`Remover ${u.name} de ${current.name}?`)) return
    try { await api.delete(`/companies/${current.id}/users/${u.id}`); await reloadUsers(current.id); toast.success('Removido') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  const availableUsers = allUsers.filter(a => !users.some(u => u.id === a.id))

  return (
    <AppLayout title="Empresas">
      <div className="px-4 md:px-6 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <PageHeader icon={Building2} title="Empresas" subtitle="Empresas do grupo — cadastro, status e vínculo de usuários por papel." />
          <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>Nova empresa</Button>
        </div>

        {loading ? <SkeletonTable rows={4} cols={5} /> :
          list.length === 0 ? <EmptyState icon={Building2} title="Nenhuma empresa" description="Cadastre a primeira empresa do grupo." /> : (
            <Table>
              <Thead><tr><Th>Empresa</Th><Th>Tipo</Th><Th>Status</Th><Th>Usuários</Th><Th right>Ações</Th></tr></Thead>
              <Tbody>
                {list.map(c => (
                  <Tr key={c.id}>
                    <Td className="text-sm font-medium">{c.name}{c.cnpj ? <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{c.cnpj}</span> : null}</Td>
                    <Td><Badge variant={c.type === 'internal' ? 'primary' : 'purple'}>{c.type === 'internal' ? 'Interna' : 'Externa'}</Badge></Td>
                    <Td><Badge variant={c.status === 'active' ? 'success' : 'danger'}>{c.status === 'active' ? 'Ativa' : 'Inativa'}</Badge></Td>
                    <Td className="text-sm tabular-nums">{c.users_count}</Td>
                    <Td right>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Users} onClick={() => openUsers(c)}>Usuários</Button>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(c)}>Editar</Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
      </div>

      {/* Cadastro / edição */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar empresa' : 'Nova empresa'} width="max-w-lg">
        <div className="flex flex-col gap-4">
          <TextInput label="Nome" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: ERPSERV" />
          <TextInput label="CNPJ (opcional)" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as CompanyType)} className="ds-input">
                <option value="internal">Interna (grupo)</option>
                <option value="external">Externa (SaaS futuro)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as CompanyStatus)} className="ds-input">
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" icon={X} onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" icon={Save} loading={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Gestão de usuários */}
      <Modal open={usersOpen} onClose={() => setUsersOpen(false)} title={`Usuários — ${current?.name ?? ''}`} width="max-w-2xl">
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-2 rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex-1">
              <SearchSelect label="Adicionar usuário" value={addUserId} onChange={setAddUserId}
                options={availableUsers.map(u => ({ id: u.id, name: u.name }))} placeholder="Buscar usuário…" fullWidth />
            </div>
            <div className="w-40">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Papel</label>
              <select value={addRole} onChange={e => setAddRole(e.target.value)} className="ds-input w-full mt-1.5">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={addUser}>Vincular</Button>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {users.length === 0 ? (
              <p className="py-6 text-center text-xs" style={{ color: 'var(--text-light)' }}>Nenhum usuário vinculado.</p>
            ) : users.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{u.name}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>{u.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={u.role} onChange={e => changeRole(u, e.target.value)} className="ds-input text-xs h-8">
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeUser(u)}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>A empresa precisa de ao menos 1 admin — o sistema bloqueia rebaixar/remover o último.</p>
        </div>
      </Modal>
    </AppLayout>
  )
}
