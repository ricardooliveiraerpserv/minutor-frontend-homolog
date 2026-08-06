'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, Mail, Phone, User, Search } from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'

interface CustomerContact {
  id: number
  customer_id: number
  name: string
  cargo: string | null
  email: string | null
  phone: string | null
}

interface CustomerContactsSectionProps {
  customerId: number | null | undefined
  customerName?: string
  /** Título da seção. Default: "Contatos do Cliente" */
  title?: string
}

const emptyForm = { name: '', cargo: '', email: '', phone: '' }

export function CustomerContactsSection({ customerId, customerName, title = 'Contatos do Cliente' }: CustomerContactsSectionProps) {
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; item?: CustomerContact }>({ open: false })
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; item?: CustomerContact }>({ open: false })
  const [deleting, setDeleting] = useState(false)
  const [busca, setBusca] = useState('')
  // Busca por texto no contato (nome/cargo/e-mail/telefone).
  const filteredContacts = contacts.filter(c => {
    const q = busca.trim().toLowerCase()
    if (!q) return true
    return [c.name, c.cargo, c.email, c.phone].some(v => (v ?? '').toLowerCase().includes(q))
  })

  const load = useCallback(async (cid: number) => {
    setLoading(true)
    try {
      const r = await api.get<CustomerContact[]>(`/customer-contacts?customer_id=${cid}`)
      setContacts(Array.isArray(r) ? r : [])
    } catch {
      toast.error('Erro ao carregar contatos do cliente')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (customerId == null) { setContacts([]); return }
    load(customerId)
  }, [customerId, load])

  const openCreate = () => { setForm(emptyForm); setModal({ open: true }) }
  const openEdit = (item: CustomerContact) => {
    setForm({ name: item.name, cargo: item.cargo ?? '', email: item.email ?? '', phone: item.phone ?? '' })
    setModal({ open: true, item })
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    if (!form.email.trim()) { toast.error('E-mail obrigatório'); return }
    if (customerId == null) { toast.error('Selecione um cliente'); return }
    setSaving(true)
    try {
      if (modal.item) {
        await api.put(`/customer-contacts/${modal.item.id}`, form)
        toast.success('Contato atualizado')
      } else {
        await api.post('/customer-contacts', { ...form, customer_id: customerId })
        toast.success('Contato criado')
      }
      setModal({ open: false })
      load(customerId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar contato')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.item || customerId == null) return
    setDeleting(true)
    try {
      await api.delete(`/customer-contacts/${deleteConfirm.item.id}`)
      toast.success('Contato excluído')
      setDeleteConfirm({ open: false })
      load(customerId)
    } catch {
      toast.error('Erro ao excluir contato')
    } finally {
      setDeleting(false)
    }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-xs bg-transparent outline-none transition-colors focus:border-[var(--primary)]'
  const inputStyle = { border: '1px solid var(--border)', color: 'var(--text)' }
  const labelCls = 'block text-[10px] font-medium mb-1'
  const labelStyle = { color: 'var(--text-muted)' }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
          {title}
        </p>
        {customerId != null && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}
          >
            <Plus size={11} /> Adicionar contato
          </button>
        )}
      </div>

      {customerId != null && contacts.length > 0 && (
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar contato…"
            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-[11px] bg-transparent outline-none"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {customerId == null ? (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-light)' }}>Selecione um cliente</p>
        ) : loading ? (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-light)' }}>Carregando...</p>
        ) : contacts.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-light)' }}>Nenhum contato cadastrado</p>
        ) : filteredContacts.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-light)' }}>Nenhum contato encontrado</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filteredContacts.map(c => (
              <div key={c.id} className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                    <User size={11} style={{ color: 'var(--text-light)' }} className="shrink-0" />
                    <span className="truncate">{c.name}</span>
                    {c.cargo && <span className="font-normal" style={{ color: 'var(--text-light)' }}>— {c.cargo}</span>}
                  </p>
                  {(c.email || c.phone) && (
                    <div className="mt-1 flex flex-col gap-0.5 pl-[18px]">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-[11px] flex items-center gap-1.5 hover:underline" style={{ color: 'var(--text-muted)' }}>
                          <Mail size={10} className="shrink-0" /> <span className="truncate">{c.email}</span>
                        </a>
                      )}
                      {c.phone && (
                        <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <Phone size={10} className="shrink-0" /> {c.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(c)} title="Editar"
                    className="p-1 rounded transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ color: 'var(--text-light)' }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => setDeleteConfirm({ open: true, item: c })} title="Excluir"
                    className="p-1 rounded transition-colors hover:bg-[var(--danger-bg)]"
                    style={{ color: 'var(--danger-border)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal add/edit — em portal pra escapar de modais ancestrais */}
      {modal.open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="relative w-full max-w-md rounded-2xl shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <button onClick={() => setModal({ open: false })} className="absolute top-3 right-3 p-1 rounded-lg transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
            <div className="p-5">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                {modal.item ? 'Editar Contato' : 'Novo Contato'}
              </h3>
              {customerName && <p className="text-[11px] mb-4" style={{ color: 'var(--text-light)' }}>{customerName}</p>}
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="col-span-2">
                  <label className={labelCls} style={labelStyle}>Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls} style={inputStyle} placeholder="Nome completo" />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Cargo</label>
                  <input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                    className={inputCls} style={inputStyle} placeholder="Cargo / Função" />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Telefone</label>
                  <input type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                    className={inputCls} style={inputStyle} placeholder="11999999999" maxLength={15} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls} style={labelStyle}>E-mail *</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className={inputCls} style={inputStyle} placeholder="email@empresa.com"
                    pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setModal({ open: false })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Cancelar
                </button>
                <button onClick={save} disabled={saving || !form.name.trim() || !form.email.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        loading={deleting}
        message={`Deseja excluir o contato "${deleteConfirm.item?.name ?? ''}"? Esta ação não pode ser desfeita.`}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
