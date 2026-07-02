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
import { Users, Plus, Pencil, Trash2, X, Search, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { RowMenu } from '@/components/ui/row-menu'
import { useAuth } from '@/hooks/use-auth'
import type { CustomerFull, Executive } from '@/types'

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant="outline" className={`text-[10px] border ${active
      ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
      : 'bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </Badge>
  )
}

function TableSkeleton() {
  return <>{Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="border-b border-[var(--border)]">
      {Array.from({ length: 7 }).map((_, j) => (
        <td key={j} className="px-3 py-2.5"><Skeleton className="h-3 w-full bg-[var(--surface-hover)]" /></td>
      ))}
    </tr>
  ))}</>
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="relative w-full max-w-lg rounded-xl shadow-2xl bg-[var(--surface)] border border-[var(--border)] max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 text-[var(--text-light)] hover:text-[var(--text)] transition-colors"><X size={14} /></button>
        {children}
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const { user, hasPermission } = useAuth()
  // Admin tem tudo; senão exige permissão explícita
  const isAdmin = user?.type === 'admin'
  const canCreate = isAdmin || hasPermission('customers.create') || hasPermission('customers.manage')
  const canUpdate = isAdmin || hasPermission('customers.update') || hasPermission('customers.manage')
  const canDelete = isAdmin || hasPermission('customers.delete') || hasPermission('customers.manage')

  const [items, setItems] = useState<CustomerFull[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterExecutive, setFilterExecutive] = useState('')
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'inativo'>('todos')
  const [executives, setExecutives] = useState<Executive[]>([])
  const [modal, setModal] = useState<{ open: boolean; item?: CustomerFull }>({ open: false })
  const [form, setForm] = useState({ name: '', company_name: '', cgc: '', code_prefix: '', active: true, executive_id: '', emails_administrativos: [] as string[], secondary_cgcs: [] as string[] })
  const [novoCgcCli, setNovoCgcCli] = useState('')
  const addCgcCli = () => {
    const c = novoCgcCli.replace(/\D/g, '')
    if (!c) return
    if (![11, 14].includes(c.length)) { toast.error('CNPJ/CPF deve ter 14 ou 11 dígitos'); return }
    setForm(f => (f.secondary_cgcs.includes(c) || c === f.cgc.replace(/\D/g, '')) ? f : { ...f, secondary_cgcs: [...f.secondary_cgcs, c] })
    setNovoCgcCli('')
  }
  const removeCgcCli = (c: string) => setForm(f => ({ ...f, secondary_cgcs: f.secondary_cgcs.filter(x => x !== c) }))
  const fmtCnpjBR = (c: string) => c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c.length === 11 ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : c
  const [novoEmailCli, setNovoEmailCli] = useState('')
  const addEmailCli = () => {
    const e = novoEmailCli.trim().toLowerCase()
    if (!e) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    setForm(f => f.emails_administrativos.includes(e) ? f : { ...f, emails_administrativos: [...f.emails_administrativos, e] })
    setNovoEmailCli('')
  }
  const removeEmailCli = (e: string) => setForm(f => ({ ...f, emails_administrativos: f.emails_administrativos.filter(x => x !== e) }))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

  useEffect(() => {
    api.get<any>('/executives?pageSize=100').then(r => {
      const arr = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setExecutives(arr)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items?: CustomerFull[]; data?: CustomerFull[] }>('/customers?pageSize=500')
      setItems(Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [])
    } catch { toast.error('Erro ao carregar clientes') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.company_name ?? '').toLowerCase().includes(q) || (c.cgc ?? '').includes(q)
    const matchExec = !filterExecutive || String(c.executive_id) === filterExecutive
    const matchStatus = filterStatus === 'todos' || (filterStatus === 'ativo' ? c.active : !c.active)
    return matchSearch && matchExec && matchStatus
  })

  // Validação do formulário do modal: nome, CPF/CNPJ e prefixo são obrigatórios.
  // Prefixo precisa ter 3 letras e não pode colidir com o de outro cliente.
  const prefixoEmUsoPor = form.code_prefix.length === 3
    ? items.find(c => c.id !== modal.item?.id && (c.code_prefix ?? '').toUpperCase() === form.code_prefix)
    : undefined
  const prefixoDuplicado = !!prefixoEmUsoPor
  const cgcDigits = form.cgc.replace(/\D/g, '')
  const formValido = form.name.trim().length >= 2
    && [11, 14].includes(cgcDigits.length)
    && form.code_prefix.length === 3
    && !prefixoDuplicado

  const exportExcel = () => {
    const rows = filtered.map(c => ({
      Nome:           c.name,
      'Razão Social': c.company_name ?? '',
      'CPF/CNPJ':     c.cgc ?? '',
      Prefixo:        c.code_prefix ?? '',
      Executivo:      c.executive?.name ?? '',
      Status:         c.active ? 'Ativo' : 'Inativo',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, 'clientes.xlsx')
  }

  const openCreate = () => {
    setForm({ name: '', company_name: '', cgc: '', code_prefix: '', active: true, executive_id: '', emails_administrativos: [], secondary_cgcs: [] })
    setNovoEmailCli('')
    setModal({ open: true })
  }

  const openEdit = (item: CustomerFull) => {
    setForm({
      name: item.name,
      company_name: item.company_name ?? '',
      cgc: item.cgc ?? '',
      code_prefix: item.code_prefix ?? '',
      active: item.active,
      executive_id: item.executive_id ? String(item.executive_id) : '',
      emails_administrativos: (item as CustomerFull & { emails_administrativos?: string[] }).emails_administrativos ?? [],
      secondary_cgcs: item.secondary_cgcs ?? [],
    })
    setNovoEmailCli('')
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        executive_id: form.executive_id ? Number(form.executive_id) : null,
        code_prefix: form.code_prefix || null,
      }
      if (modal.item) await api.put(`/customers/${modal.item.id}`, payload)
      else await api.post('/customers', payload)
      toast.success(modal.item ? 'Cliente atualizado' : 'Cliente criado')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/customers/${deleteConfirm.id}`)
      toast.success('Cliente excluído')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto w-full">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-5 flex items-center gap-2">
          <Users size={14} className="text-[var(--text-muted)]" />
          Clientes
        </h2>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, razão social ou CPF/CNPJ..."
              className="pl-8 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs"
            />
          </div>
          <select
            value={filterExecutive}
            onChange={e => setFilterExecutive(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs outline-none appearance-none bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] min-w-36"
          >
            <option value="">Todos os executivos</option>
            {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'todos' | 'ativo' | 'inativo')}
            className="px-3 py-1.5 rounded-lg text-xs outline-none appearance-none bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)]"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <Button onClick={exportExcel} disabled={filtered.length === 0} variant="outline" className="border-[var(--border)] text-[var(--text)] h-8 text-xs gap-1.5">
            <Download size={13} /> Exportar
          </Button>
          {canCreate && (
            <Button onClick={openCreate} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] h-8 text-xs gap-1.5">
              <Plus size={13} /> Novo
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] overflow-clip">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--surface)]">
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="px-3 py-2.5 w-10"></th>
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium">Nome</th>
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden md:table-cell">Razão Social</th>
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden sm:table-cell">CPF/CNPJ</th>
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden xl:table-cell">Prefixo</th>
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Executivo</th>
                <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <TableSkeleton /> : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--text-light)]">Nenhum cliente encontrado</td></tr>
              ) : filtered.map(item => (
                <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-2 py-2.5 w-10">
                    {(canUpdate || canDelete) && (
                      <RowMenu items={[
                        ...(canUpdate ? [{ label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) }] : []),
                        ...(canDelete ? [{ label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => setDeleteConfirm({ open: true, id: item.id }), danger: true, disabled: deleting === item.id }] : []),
                      ]} />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]">{item.name}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)] hidden md:table-cell">{item.company_name || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)] font-mono hidden sm:table-cell">{item.cgc || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)] font-mono hidden xl:table-cell">{item.code_prefix || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)] hidden lg:table-cell">{item.executive?.name || '—'}</td>
                  <td className="px-3 py-2.5"><ActiveBadge active={item.active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {modal.open && (
          <ModalOverlay onClose={() => setModal({ open: false })}>
            <div className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-4">{modal.item ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Nome *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Razão Social</Label>
                  <Input
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">CPF/CNPJ *</Label>
                  <Input
                    value={form.cgc}
                    inputMode="numeric"
                    placeholder="só números"
                    // SEM maxLength: ele cortaria a string mascarada (ex: 21.160.979/0001-08, 18 chars)
                    // antes do onChange rodar. O .slice(0,14) abaixo limita os DÍGITOS depois de tirar a máscara.
                    onChange={e => setForm(f => ({ ...f, cgc: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">CNPJ(s) secundário(s) de faturamento</Label>
                  {form.secondary_cgcs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {form.secondary_cgcs.map(c => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium font-mono"
                          style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                          {fmtCnpjBR(c)}
                          <button onClick={() => removeCgcCli(c)} className="leading-none" style={{ color: 'var(--primary)' }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1.5">
                    <Input value={novoCgcCli}
                      onChange={e => setNovoCgcCli(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCgcCli() } }}
                      placeholder="adicionar CNPJ…"
                      className="bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs font-mono" />
                    <Button variant="outline" onClick={addCgcCli} className="h-9 text-xs border-[var(--border)] text-[var(--text)] shrink-0">Adicionar</Button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-light)]">Une os recebimentos do Keruak (Rentabilidade › Clientes) destes CNPJs sob este cliente.</p>
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Prefixo de Código (3 letras) *</Label>
                  <Input
                    value={form.code_prefix}
                    onChange={e => setForm(f => ({ ...f, code_prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))}
                    placeholder="ex: ABC"
                    maxLength={3}
                    aria-invalid={prefixoDuplicado}
                    className={`mt-1 bg-[var(--surface-hover)] text-[var(--text)] h-9 text-xs font-mono uppercase tracking-widest ${prefixoDuplicado ? 'border-[var(--danger-border)]' : 'border-[var(--border)]'}`}
                  />
                  {prefixoDuplicado ? (
                    <p className="mt-1 text-[11px] text-[var(--danger)]">Prefixo já usado por <strong>{prefixoEmUsoPor?.name}</strong>. Escolha outro.</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-[var(--text-light)]">Usado para gerar códigos automáticos dos projetos (ex: ABC001-26)</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Executivo</Label>
                  <select
                    value={form.executive_id}
                    onChange={e => setForm(f => ({ ...f, executive_id: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-xs outline-none appearance-none bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)]"
                  >
                    <option value="">Sem executivo</option>
                    {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">E-mails administrativos</Label>
                  {form.emails_administrativos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {form.emails_administrativos.map(e => (
                        <span key={e} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                          style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                          {e}
                          <button onClick={() => removeEmailCli(e)} className="leading-none" style={{ color: 'var(--success)' }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1.5">
                    <Input value={novoEmailCli} type="email"
                      onChange={e => setNovoEmailCli(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmailCli() } }}
                      placeholder="adicionar e-mail…"
                      className="bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                    <Button variant="outline" onClick={addEmailCli} className="h-9 text-xs border-[var(--border)] text-[var(--text)] shrink-0">Adicionar</Button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-light)]">Mesma lista usada no fechamento e nos comunicados (reajuste) do cliente.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                    className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-[var(--primary)]' : 'bg-[var(--surface-hover)]'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-[var(--surface)] transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <Label className="text-xs text-[var(--text-muted)]">Ativo</Label>
                </div>
              </div>
              <div className="flex gap-2 mt-5 justify-end">
                <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-[var(--border)] text-[var(--text)]">
                  Cancelar
                </Button>
                <Button onClick={save} disabled={saving || !formValido} className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </ModalOverlay>
        )}

        <ConfirmDeleteModal
          open={deleteConfirm.open}
          message="Deseja excluir este cliente? Esta ação não pode ser desfeita."
          onClose={() => setDeleteConfirm({ open: false })}
          onConfirm={confirmDelete}
        />
      </div>
    </AppLayout>
  )
}
