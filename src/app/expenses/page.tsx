'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api, ApiError, secureUrl } from '@/lib/api'
import { Expense, PaginatedResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Receipt, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  X, Check, XCircle, Paperclip, ExternalLink
} from 'lucide-react'

const STATUS_CLASS: Record<string, string> = {
  pending:              'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved:             'bg-green-500/20 text-green-400 border-green-500/30',
  rejected:             'bg-red-500/20 text-red-400 border-red-500/30',
  adjustment_requested: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

const STATUS_LABEL: Record<string, string> = {
  pending:              'Pendente',
  approved:             'Aprovado',
  rejected:             'Rejeitado',
  adjustment_requested: 'Ajuste Solicitado',
}

interface Category { id: number; name: string; parent_id?: number | null }
interface SelectOption { id: number; name: string }

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 z-10"><X size={16} /></button>
        {children}
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [data, setData] = useState<PaginatedResponse<Expense> | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; item?: Expense }>({ open: false })
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id?: number }>({ open: false })
  const [rejectReason, setRejectReason] = useState('')
  const [form, setForm] = useState({
    project_id: '', expense_category_id: '', expense_date: '',
    description: '', amount: '', expense_type: 'reimbursement',
    payment_method: 'pix', charge_client: false,
  })
  const [receipt, setReceipt] = useState<File | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [projects, setProjects] = useState<SelectOption[]>([])
  const [saving, setSaving] = useState(false)
  const [actioning, setActioning] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status) p.set('status', status)
    return p.toString()
  }, [page, status])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<PaginatedResponse<Expense>>(`/expenses?${params}`)
      setData(r)
    } catch { toast.error('Erro ao carregar despesas') }
    finally { setLoading(false) }
  }, [params])

  useEffect(() => { load() }, [load])

  const loadOptions = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api.get<{ data: Category[] }>('/expense-categories?per_page=200'),
        api.get<PaginatedResponse<SelectOption>>('/projects?per_page=200&status=started'),
      ])
      setCategories(c.data ?? [])
      setProjects(p.items ?? [])
    } catch { /* silencioso */ }
  }, [])

  const openCreate = () => {
    setForm({ project_id: '', expense_category_id: '', expense_date: new Date().toISOString().split('T')[0], description: '', amount: '', expense_type: 'reimbursement', payment_method: 'pix', charge_client: false })
    setReceipt(null)
    loadOptions()
    setModal({ open: true })
  }

  const openEdit = (item: Expense) => {
    setForm({
      project_id: String(item.project_id),
      expense_category_id: String(item.expense_category_id),
      expense_date: item.expense_date,
      description: item.description,
      amount: String(item.amount),
      expense_type: item.expense_type,
      payment_method: item.payment_method,
      charge_client: item.charge_client,
    })
    setReceipt(null)
    loadOptions()
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('project_id', form.project_id)
      fd.append('expense_category_id', form.expense_category_id)
      fd.append('expense_date', form.expense_date)
      fd.append('description', form.description)
      fd.append('amount', form.amount)
      fd.append('expense_type', form.expense_type)
      fd.append('payment_method', form.payment_method)
      fd.append('charge_client', form.charge_client ? '1' : '0')
      if (receipt) fd.append('receipt', receipt)
      if (modal.item) fd.append('_method', 'PUT')

      const token = localStorage.getItem('minutor_token')
      const url = modal.item ? `/api/v1/expenses/${modal.item.id}` : '/api/v1/expenses'
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: fd })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(res.status, b.message ?? 'Erro ao salvar') }

      toast.success(modal.item ? 'Despesa atualizada' : 'Despesa criada')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const approve = async (id: number) => {
    setActioning(id)
    try {
      await api.post(`/expenses/${id}/approve`, { charge_client: false })
      toast.success('Despesa aprovada')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
    finally { setActioning(null) }
  }

  const reject = async () => {
    if (!rejectModal.id) return
    setActioning(rejectModal.id)
    try {
      await api.post(`/expenses/${rejectModal.id}/reject`, { reason: rejectReason })
      toast.success('Despesa rejeitada')
      setRejectModal({ open: false })
      setRejectReason('')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao rejeitar') }
    finally { setActioning(null) }
  }

  const remove = async (id: number) => {
    if (!confirm('Confirmar exclusão?')) return
    setDeleting(id)
    try {
      await api.delete(`/expenses/${id}`)
      toast.success('Despesa excluída')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const canEdit = (exp: Expense) => ['pending', 'rejected', 'adjustment_requested'].includes(exp.status)

  return (
    <AppLayout title="Despesas">
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          {[
            { value: '', label: 'Todas' },
            { value: 'pending', label: 'Pendentes' },
            { value: 'approved', label: 'Aprovadas' },
            { value: 'rejected', label: 'Rejeitadas' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => { setStatus(value); setPage(1) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${status === value ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5 ml-auto">
          <Plus size={13} /> Nova
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Data</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Descrição</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Projeto</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Categoria</th>
              <th className="text-right px-3 py-2.5 text-zinc-500 font-medium">Valor</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
              <th className="px-3 py-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800">
                {[...Array(7)].map((_, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3 w-full" /></td>)}
              </tr>
            ))}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-zinc-500">
                <Receipt size={24} className="mx-auto mb-2 opacity-30" />Nenhuma despesa encontrada
              </td></tr>
            )}
            {!loading && data?.items.map(exp => (
              <tr key={exp.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{formatDate(exp.expense_date)}</td>
                <td className="px-3 py-2.5 max-w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-200 truncate block">{exp.description}</span>
                    {exp.receipt_url && (
                      <a href={secureUrl(exp.receipt_url)} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-400 shrink-0">
                        <Paperclip size={11} />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate max-w-[140px]">{exp.project?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell">{exp.category?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-right text-zinc-300 whitespace-nowrap font-mono">{formatCurrency(exp.amount)}</td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={`text-[10px] border ${STATUS_CLASS[exp.status] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}>
                    {STATUS_LABEL[exp.status] ?? exp.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    {exp.status === 'pending' && (
                      <>
                        <button onClick={() => approve(exp.id)} disabled={actioning === exp.id} title="Aprovar" className="p-1 text-zinc-500 hover:text-green-400 transition-colors"><Check size={12} /></button>
                        <button onClick={() => { setRejectModal({ open: true, id: exp.id }); setRejectReason('') }} title="Rejeitar" className="p-1 text-zinc-500 hover:text-red-400 transition-colors"><XCircle size={12} /></button>
                      </>
                    )}
                    {canEdit(exp) && (
                      <button onClick={() => openEdit(exp)} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"><Pencil size={12} /></button>
                    )}
                    {canEdit(exp) && (
                      <button onClick={() => remove(exp.id)} disabled={deleting === exp.id} className="p-1 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                    )}
                    {exp.receipt_url && (
                      <a href={secureUrl(exp.receipt_url)} target="_blank" rel="noreferrer" className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"><ExternalLink size={12} /></a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {(data?.items.length ?? 0) > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-zinc-500">Página {page}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
            <button onClick={() => setPage(p => p + 1)} disabled={!data?.hasNext} className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Despesa' : 'Nova Despesa'}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Projeto *</Label>
                <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                  <option value="">Selecione...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Categoria *</Label>
                <select value={form.expense_category_id} onChange={e => setForm(f => ({ ...f, expense_category_id: e.target.value }))}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                  <option value="">Selecione...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.parent_id ? `  └ ${c.name}` : c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400">Data *</Label>
                  <Input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Valor *</Label>
                  <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Descrição *</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400">Tipo</Label>
                  <select value={form.expense_type} onChange={e => setForm(f => ({ ...f, expense_type: e.target.value }))}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                    <option value="reimbursement">Reembolso</option>
                    <option value="advance">Adiantamento</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Pagamento</Label>
                  <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-md h-9 px-2">
                    <option value="pix">PIX</option>
                    <option value="credit_card">Cartão Crédito</option>
                    <option value="debit_card">Cartão Débito</option>
                    <option value="cash">Dinheiro</option>
                    <option value="bank_transfer">Transferência</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, charge_client: !f.charge_client }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.charge_client ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.charge_client ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Cobrar do cliente</Label>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Comprovante</Label>
                <div className="mt-1 flex items-center gap-2">
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
                    <Paperclip size={12} /> {receipt ? receipt.name : 'Selecionar arquivo'}
                  </button>
                  {receipt && <button onClick={() => setReceipt(null)} className="text-zinc-500 hover:text-zinc-200"><X size={12} /></button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setReceipt(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.project_id || !form.expense_category_id || !form.expense_date || !form.amount || !form.description}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal rejeitar */}
      {rejectModal.open && (
        <ModalOverlay onClose={() => setRejectModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Rejeitar Despesa</h3>
            <Label className="text-xs text-zinc-400">Motivo</Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Informe o motivo..."
              className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => setRejectModal({ open: false })} className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={reject} disabled={!!actioning} className="h-8 text-xs bg-red-600 hover:bg-red-500 text-white">Rejeitar</Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </AppLayout>
  )
}
