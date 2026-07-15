'use client'

import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, Paperclip, DollarSign } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { Button as UIButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Opt { id: number; name: string }
interface Cat { id: number; name: string; parent_id?: number | null }

/**
 * Modal de "Apontar despesa" para o Meu Dia — mesmo fluxo do form da Operação (ExpensesScreen),
 * autocontido: carrega clientes/projetos/categorias/usuários, respeita Projeto Real (investimento
 * comercial) e envia multipart p/ POST /expenses. Abre/fecha na própria tela.
 */
export function ExpenseQuickModal({ open, onClose, onSaved, currentUser }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  currentUser: { id: number; type?: string | null } | null | undefined
}) {
  const isAdmin          = currentUser?.type === 'admin'
  const isCoordenador    = currentUser?.type === 'coordenador'
  const isAdministrativo = currentUser?.type === 'administrativo'
  const canActAsUser     = isAdmin || isCoordenador || isAdministrativo

  const [form, setForm] = useState({
    customer_id: '', project_id: '', real_project_id: '', expense_category_id: '', expense_date: '',
    description: '', amount: '', expense_type: 'reimbursement', payment_method: 'pix', user_id: '',
  })
  const [customers, setCustomers]   = useState<Opt[]>([])
  const [projects, setProjects]     = useState<Array<Opt & { is_investimento_comercial?: boolean; categoria_interna?: string; service_type?: { code?: string } }>>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [modalUsers, setModalUsers] = useState<Opt[]>([])
  const [receipt, setReceipt]       = useState<File | null>(null)
  const [saving, setSaving]         = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Ao abrir: reseta o form e carrega clientes / categorias / usuários.
  useEffect(() => {
    if (!open) return
    setForm({ customer_id: '', project_id: '', real_project_id: '', expense_category_id: '', expense_date: new Date().toISOString().split('T')[0], description: '', amount: '', expense_type: 'reimbursement', payment_method: 'pix', user_id: '' })
    setReceipt(null)
    ;(async () => {
      try {
        const [cust, cat, us] = await Promise.all([
          api.get<{ items?: Opt[]; data?: Opt[] }>(canActAsUser ? '/customers?pageSize=500' : '/customers/user-linked?pageSize=500'),
          api.get<{ items?: Cat[]; data?: Cat[] }>('/expense-categories?pageSize=100'),
          canActAsUser ? api.get<{ items?: Opt[] }>('/users?pageSize=200&exclude_type=cliente') : Promise.resolve(null),
        ])
        setCustomers(Array.isArray(cust?.items) ? cust.items : Array.isArray(cust?.data) ? cust.data : [])
        setCategories(Array.isArray(cat?.items) ? cat.items : Array.isArray(cat?.data) ? cat.data : [])
        if (us) setModalUsers(Array.isArray(us?.items) ? us.items : [])
      } catch { /* silencioso */ }
    })()
  }, [open, canActAsUser])

  // Projetos do cliente selecionado (inclui investimento comercial p/ o Projeto Real).
  useEffect(() => {
    if (!open || !form.customer_id) { setProjects([]); return }
    let cancelled = false
    const qs = new URLSearchParams({ pageSize: '200', customer_id: form.customer_id, status: 'open', include_investimento_comercial: 'true' })
    if (isCoordenador) qs.set('consultant_only', 'true')
    api.get<{ items?: typeof projects }>(`/projects?${qs}`)
      .then(p => { if (!cancelled) setProjects(Array.isArray(p?.items) ? p.items : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, form.customer_id, isCoordenador])

  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id)
  const isErpservCustomer = String(selectedCustomer?.name ?? '').trim().toUpperCase() === 'ERPSERV'
  const selProj = projects.find(p => String(p.id) === form.project_id)
  const showRealProject = !!selProj?.is_investimento_comercial && !isErpservCustomer
  const soSustentacao = selProj?.categoria_interna === 'Suporte'
  const realOpts = projects.filter(p => {
    if (p.is_investimento_comercial || String(p.id) === form.project_id) return false
    if (soSustentacao && p.service_type?.code !== 'sustentacao') return false
    return true
  })

  const save = async () => {
    setSaving(true)
    try {
      const isInvestimento = !!selProj?.is_investimento_comercial && !isErpservCustomer
      if (isInvestimento && !form.real_project_id) { toast.error('Selecione o Projeto Real'); setSaving(false); return }
      const fd = new FormData()
      fd.append('project_id', form.project_id)
      if (isInvestimento && form.real_project_id) fd.append('real_project_id', form.real_project_id)
      fd.append('expense_category_id', form.expense_category_id)
      fd.append('expense_date', form.expense_date)
      fd.append('description', form.description)
      fd.append('amount', form.amount)
      fd.append('expense_type', form.expense_type)
      fd.append('payment_method', form.payment_method)
      if (canActAsUser && form.user_id) fd.append('user_id', form.user_id)
      if (receipt) fd.append('receipt', receipt)
      const res = await fetch('/api/v1/expenses', { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin', body: fd })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(res.status, b.message ?? 'Erro ao salvar') }
      toast.success('Despesa criada ✓')
      onSaved()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg max-h-[88vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><DollarSign size={16} style={{ color: 'var(--primary)' }} /> Nova Despesa</h3>
          <button onClick={onClose} aria-label="Fechar" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="space-y-3">
          {canActAsUser && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Usuário</Label>
                <button type="button" onClick={() => setForm(f => ({ ...f, user_id: String(currentUser?.id ?? '') }))} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>→ Colocar-me como responsável</button>
              </div>
              <SearchSelect value={form.user_id} onChange={v => setForm(f => ({ ...f, user_id: v }))} options={modalUsers} placeholder="Selecione o usuário..." />
            </div>
          )}
          <div>
            <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Cliente</Label>
            <div className="mt-1"><SearchSelect value={form.customer_id} onChange={v => setForm(f => ({ ...f, customer_id: v, project_id: '', real_project_id: '' }))} options={customers} placeholder="Selecione o cliente..." /></div>
          </div>
          <div>
            <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Projeto *</Label>
            <div className="mt-1"><SearchSelect value={form.project_id} onChange={v => setForm(f => ({ ...f, project_id: v, real_project_id: '' }))} options={projects} placeholder="Selecione o projeto..." /></div>
          </div>
          {showRealProject && (
            <div>
              <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Projeto Real *{soSustentacao ? ' (Sustentação)' : ''}</Label>
              <div className="mt-1"><SearchSelect value={form.real_project_id} onChange={v => setForm(f => ({ ...f, real_project_id: v }))} options={realOpts} placeholder="Selecione o projeto real..." /></div>
            </div>
          )}
          <div>
            <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Categoria *</Label>
            <div className="mt-1"><SearchSelect value={form.expense_category_id} onChange={v => setForm(f => ({ ...f, expense_category_id: v }))} options={categories.map(c => ({ id: c.id, name: c.parent_id ? `└ ${c.name}` : c.name }))} placeholder="Selecione a categoria..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Data *</Label>
              <Input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Valor *</Label>
              <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1 h-9 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Descrição *</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs" style={{ color: 'var(--text-muted)' }}>Comprovante</Label>
            <div className="mt-1 flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <Paperclip size={12} /> {receipt ? receipt.name : 'Selecionar arquivo'}
              </button>
              {receipt && <button onClick={() => setReceipt(null)} style={{ color: 'var(--text-light)' }}><X size={12} /></button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setReceipt(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <UIButton variant="outline" onClick={onClose} className="h-8 text-xs">Cancelar</UIButton>
          <UIButton onClick={save} disabled={saving || !form.project_id || !form.expense_category_id || !form.expense_date || !form.amount || !form.description} className="h-8 text-xs">{saving ? 'Salvando...' : 'Salvar'}</UIButton>
        </div>
      </div>
    </div>
  )
}
