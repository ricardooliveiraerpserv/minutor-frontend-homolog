'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Button, SkeletonTable, EmptyState, PageHeader,
} from '@/components/ds'
import { CreditCard, Plus, Trash2 } from 'lucide-react'

interface CCUser { id: number; name: string; email: string }
interface UserOption { id: number; name: string }

export default function CartaoCreditoPage() {
  const [list, setList] = useState<CCUser[]>([])
  const [loading, setLoading] = useState(true)
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [addUserId, setAddUserId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<{ data: CCUser[] }>('/expense-credit-card-users'),
      api.get<any>('/users?minimal=true'),
    ])
      .then(([cc, all]) => {
        setList(cc.data ?? [])
        const arr = Array.isArray(all) ? all : (all.items ?? all.data ?? [])
        setAllUsers(arr.map((x: any) => ({ id: x.id, name: x.name })))
      })
      .catch(() => toast.error('Erro ao carregar autorizados'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const addUser = async () => {
    if (!addUserId) { toast.error('Selecione o usuário'); return }
    setSaving(true)
    try {
      await api.post('/expense-credit-card-users', { user_id: Number(addUserId) })
      setAddUserId(''); toast.success('Usuário autorizado'); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
    finally { setSaving(false) }
  }

  const removeUser = async (u: CCUser) => {
    if (!confirm(`Remover a autorização de ${u.name}?`)) return
    try { await api.delete(`/expense-credit-card-users/${u.id}`); toast.success('Autorização removida'); load() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  const availableUsers = allUsers.filter(a => !list.some(u => u.id === a.id))

  return (
    <AppLayout title="Cartão de Crédito">
      <div className="px-4 md:px-6 py-6">
        <div className="mb-4">
          <PageHeader icon={CreditCard} title="Cartão de Crédito (Despesas)"
            subtitle="Usuários autorizados a lançar despesa via cartão de crédito da empresa. Para eles, a despesa marcada como cartão de crédito é aprovada automaticamente e não entra na fila de pagamento." />
        </div>

        <div className="flex items-end gap-2 rounded-lg p-3 mb-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="flex-1">
            <SearchSelect label="Autorizar usuário" value={addUserId} onChange={setAddUserId}
              options={availableUsers.map(u => ({ id: u.id, name: u.name }))} placeholder="Buscar usuário…" fullWidth />
          </div>
          <Button variant="primary" size="sm" icon={Plus} loading={saving} onClick={addUser}>Autorizar</Button>
        </div>

        {loading ? <SkeletonTable rows={4} cols={3} /> :
          list.length === 0 ? <EmptyState icon={CreditCard} title="Nenhum usuário autorizado" description="Autorize o primeiro usuário a usar cartão de crédito nas despesas." /> : (
            <Table>
              <Thead><tr><Th>Usuário</Th><Th>E-mail</Th><Th right>Ações</Th></tr></Thead>
              <Tbody>
                {list.map(u => (
                  <Tr key={u.id}>
                    <Td className="text-sm font-medium">{u.name}</Td>
                    <Td className="text-sm" >{u.email}</Td>
                    <Td right>
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeUser(u)}>Remover</Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
      </div>
    </AppLayout>
  )
}
