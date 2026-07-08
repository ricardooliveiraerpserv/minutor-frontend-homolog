'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, Button } from '@/components/ds'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { SearchSelect } from '@/components/ui/search-select'
import { MultiSelect } from '@/components/ui/multi-select'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SlidersHorizontal, Plus, Pencil, Trash2 } from 'lucide-react'

type Scope = 'all' | 'specific'

interface Perm {
  user_id: number
  user_name: string
  user_email: string | null
  user_type: string | null
  coordinator_type: string | null
  demand_visible: boolean
  demand_client_scope: Scope
  demand_customer_ids: number[]
  project_visible: boolean
  project_client_scope: Scope
  project_customer_ids: number[]
}
interface UserOpt { id: number; name: string; email?: string; type?: string | null; coordinator_type?: string | null }
interface CustomerOpt { id: number; name: string }

const PROFILE_LABEL: Record<string, string> = {
  admin: 'Admin', administrativo: 'Administrativo', consultor: 'Consultor',
  cliente: 'Cliente', parceiro_admin: 'Parceiro',
}
function profileLabel(u: { type?: string | null; coordinator_type?: string | null }): string {
  const t = u.type ?? ''
  if (t === 'coordenador') return `Coordenador (${u.coordinator_type === 'sustentacao' ? 'Sustentação' : 'Projetos'})`
  return PROFILE_LABEL[t] ?? t ?? '—'
}

const emptyForm: Perm = {
  user_id: 0, user_name: '', user_email: null, user_type: null, coordinator_type: null,
  demand_visible: true, demand_client_scope: 'all', demand_customer_ids: [],
  project_visible: true, project_client_scope: 'all', project_customer_ids: [],
}

export default function LiberacaoPipelinePage() {
  const [perms, setPerms]         = useState<Perm[]>([])
  const [users, setUsers]         = useState<UserOpt[]>([])
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState<Perm | null>(null)
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, u, c] = await Promise.all([
        api.get<{ data: Perm[] }>('/pipeline-view-permissions'),
        api.get<any>('/users?pageSize=500'),
        api.get<any>('/customers?pageSize=500'),
      ])
      setPerms(p.data ?? [])
      const uList = (u.items ?? u.data ?? []) as any[]
      setUsers(uList.map(x => ({ id: x.id, name: x.name, email: x.email, type: x.type, coordinator_type: x.coordinator_type })))
      const cList = (c.data ?? c.items ?? []) as any[]
      setCustomers(cList.map(x => ({ id: x.id, name: x.name })))
    } catch { toast.error('Erro ao carregar liberações') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (p: Partial<Perm>) => setForm(prev => prev ? { ...prev, ...p } : prev)

  const save = async () => {
    if (!form || !form.user_id) { toast.error('Selecione um usuário'); return }
    setSaving(true)
    try {
      await api.post('/pipeline-view-permissions', {
        user_id: form.user_id,
        demand_visible: form.demand_visible,
        demand_client_scope: form.demand_client_scope,
        demand_customer_ids: form.demand_customer_ids,
        project_visible: form.project_visible,
        project_client_scope: form.project_client_scope,
        project_customer_ids: form.project_customer_ids,
      })
      toast.success('Liberação salva')
      setForm(null)
      load()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (userId: number) => {
    if (!window.confirm('Remover a liberação deste usuário? Ele volta ao padrão do perfil.')) return
    try { await api.delete(`/pipeline-view-permissions/${userId}`); toast.success('Liberação removida'); load() }
    catch { toast.error('Erro ao remover') }
  }

  const summary = (visible: boolean, scope: Scope, ids: number[]) =>
    !visible ? 'Não vê' : scope === 'all' ? 'Todos os clientes' : `${ids.length} cliente(s)`

  const customerOpts = customers.map(c => ({ id: c.id, name: c.name }))

  return (
    <AppLayout title="Liberação de Visualização">
      <div className="space-y-6">
        <PageHeader
          icon={SlidersHorizontal}
          title="Liberação de Visualização — Demandas e Projetos"
          subtitle="Por usuário: defina quais partes do pipeline (Requisição / Projetos) ele vê e de quais clientes. Sem regra = padrão do perfil (admin vê as duas; coordenador/consultor só Projetos)."
          actions={<Button size="sm" icon={Plus} onClick={() => setForm({ ...emptyForm })}>Nova liberação</Button>}
        />

        {loading ? (
          <p className="text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando…</p>
        ) : perms.length === 0 ? (
          <div className="ds-card p-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>
            Nenhuma liberação personalizada ainda. Clique em “Nova liberação”.
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr><Th>Usuário</Th><Th>Perfil</Th><Th>Requisição</Th><Th>Projetos</Th><Th right>Ações</Th></Tr>
            </Thead>
            <Tbody>
              {perms.map(p => (
                <Tr key={p.user_id}>
                  <Td className="font-medium" style={{ color: 'var(--text)' }}>{p.user_name}</Td>
                  <Td style={{ color: 'var(--text-muted)' }}>{profileLabel(p)}</Td>
                  <Td>{summary(p.demand_visible, p.demand_client_scope, p.demand_customer_ids)}</Td>
                  <Td>{summary(p.project_visible, p.project_client_scope, p.project_customer_ids)}</Td>
                  <Td right>
                    <button onClick={() => setForm({ ...p })} title="Editar" className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                    <button onClick={() => remove(p.user_id)} title="Remover" className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] ml-1" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      {form && (
        <Modal open onClose={() => setForm(null)} size="lg">
          <ModalHeader title="Liberação de Visualização" subtitle="Configure o que este usuário vê no pipeline Demandas e Projetos." />
          <ModalBody>
            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Usuário</label>
                <SearchSelect
                  value={form.user_id || ''}
                  placeholder="Selecione um usuário"
                  fullWidth
                  options={users.map(u => ({ id: u.id, name: `${u.name}${u.type ? ` — ${profileLabel(u)}` : ''}` }))}
                  onChange={v => {
                    const u = users.find(x => String(x.id) === v)
                    patch({ user_id: Number(v), user_name: u?.name ?? '', user_type: u?.type ?? null, coordinator_type: u?.coordinator_type ?? null })
                  }}
                />
              </div>

              {(['demand', 'project'] as const).map(part => {
                const isDemand = part === 'demand'
                const visible  = isDemand ? form.demand_visible : form.project_visible
                const scope    = isDemand ? form.demand_client_scope : form.project_client_scope
                const ids      = isDemand ? form.demand_customer_ids : form.project_customer_ids
                return (
                  <div key={part} className="ds-card p-4 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={visible}
                        onChange={e => patch(isDemand ? { demand_visible: e.target.checked } : { project_visible: e.target.checked })} />
                      <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {isDemand ? 'Vê a parte de Requisição (Demanda + Autorização)' : 'Vê a parte de Projetos em Execução'}
                      </span>
                    </label>
                    {visible && (
                      <div className="pl-6 space-y-2.5">
                        <div className="flex gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" checked={scope === 'all'}
                              onChange={() => patch(isDemand ? { demand_client_scope: 'all' } : { project_client_scope: 'all' })} /> Todos os clientes
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" checked={scope === 'specific'}
                              onChange={() => patch(isDemand ? { demand_client_scope: 'specific' } : { project_client_scope: 'specific' })} /> Clientes específicos
                          </label>
                        </div>
                        {scope === 'specific' && (
                          <MultiSelect
                            value={ids.map(String)}
                            placeholder="Selecione os clientes"
                            fullWidth
                            options={customerOpts}
                            onChange={vs => patch(isDemand ? { demand_customer_ids: vs.map(Number) } : { project_customer_ids: vs.map(Number) })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ModalBody>
          <ModalFooter>
            <button className="ds-btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
            <button className="ds-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </ModalFooter>
        </Modal>
      )}
    </AppLayout>
  )
}
