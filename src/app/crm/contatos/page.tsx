'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { CustomFieldsSection } from '@/components/crm/custom-fields-section'
import { toast } from 'sonner'
import { Contact, Plus, Pencil, Trash2, X, Search, Building2 } from 'lucide-react'

interface Customer { id: number; name: string }
interface CrmContact {
  id: number; customer_id: number; name: string; cargo: string | null; departamento: string | null
  email: string | null; phone: string | null; whatsapp: string | null; linkedin: string | null
  influencia_decisao: string | null; canal_preferido: string | null
  customer?: { id: number; name: string } | null
}

const INFLU = [{ v: '', l: '—' }, { v: 'alta', l: 'Alta' }, { v: 'media', l: 'Média' }, { v: 'baixa', l: 'Baixa' }]
const CANAL = [{ v: '', l: '—' }, { v: 'email', l: 'E-mail' }, { v: 'whatsapp', l: 'WhatsApp' }, { v: 'telefone', l: 'Telefone' }, { v: 'linkedin', l: 'LinkedIn' }]
const EMPTY = { customer_id: '', name: '', cargo: '', departamento: '', email: '', phone: '', whatsapp: '', linkedin: '', influencia_decisao: '', canal_preferido: '' }

export default function CrmContatosPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('')  // filtro opcional (vazio = todas)
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')

  // Filtro por texto (nome/cargo/depto/e-mail/telefone/whatsapp/empresa) + empresa opcional. Tudo local, instantâneo.
  const filtered = contacts.filter(c => {
    if (filtroEmpresa && String(c.customer_id) !== filtroEmpresa) return false
    const q = busca.trim().toLowerCase()
    if (!q) return true
    return [c.name, c.cargo, c.departamento, c.email, c.phone, c.whatsapp, c.customer?.name].some(v => (v ?? '').toLowerCase().includes(q))
  })

  useEffect(() => {
    api.get<any>('/customers?pageSize=500')
      .then(r => setCustomers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name })).sort((a: Customer, b: Customer) => a.name.localeCompare(b.name))))
      .catch(() => {})
  }, [])

  // Catálogo GLOBAL de contatos (todas as empresas) — não exige selecionar empresa.
  const load = useCallback(() => {
    setLoading(true)
    api.get<any>('/customer-contacts?per_page=1000')
      .then(r => setContacts(Array.isArray(r) ? r : r?.data ?? r?.items ?? []))
      .catch(() => toast.error('Erro ao carregar contatos'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditId(null); setForm({ ...EMPTY, customer_id: filtroEmpresa || '' }); setModal(true) }
  const openEdit = (c: CrmContact) => {
    setEditId(c.id)
    setForm({ customer_id: String(c.customer_id), name: c.name, cargo: c.cargo ?? '', departamento: c.departamento ?? '', email: c.email ?? '', phone: c.phone ?? '', whatsapp: c.whatsapp ?? '', linkedin: c.linkedin ?? '', influencia_decisao: c.influencia_decisao ?? '', canal_preferido: c.canal_preferido ?? '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.customer_id) { toast.error('Selecione a empresa do contato'); return }
    if (!form.name.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    const payload: any = { ...form, customer_id: Number(form.customer_id) }
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null })
    payload.customer_id = Number(form.customer_id); payload.name = form.name
    try {
      if (editId) await api.put(`/customer-contacts/${editId}`, payload)
      else await api.post('/customer-contacts', payload)
      toast.success('Contato salvo'); setModal(false); load()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const remove = async (c: CrmContact) => {
    if (!confirm(`Excluir "${c.name}"?`)) return
    try { await api.delete(`/customer-contacts/${c.id}`); setContacts(xs => xs.filter(x => x.id !== c.id)); toast.success('Excluído') }
    catch { toast.error('Erro ao excluir') }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const setF = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <AppLayout title="Contatos (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <Contact size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Contatos</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— todas as empresas ({filtered.length})</span>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Catálogo completo de contatos. Use a busca ou o filtro por empresa (opcional).</p>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, cargo, e-mail, empresa…" className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-72" style={inputStyle} />
        </div>
        <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none w-64" style={inputStyle}>
          <option value="">Todas as empresas</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Plus size={15} /> Novo contato
        </button>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Nome</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Empresa</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Cargo / Depto</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Contato</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Influência</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Canal</th>
            <th className="px-4 py-2.5"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum contato.</td></tr>
            : filtered.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{c.name}{c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="ml-2 text-[11px]" style={{ color: 'var(--primary)' }}>in</a>}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}><span className="inline-flex items-center gap-1"><Building2 size={12} style={{ color: 'var(--text-light)' }} />{c.customer?.name ?? '—'}</span></td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{c.cargo ?? '—'}{c.departamento && <span className="block text-[11px]" style={{ color: 'var(--text-light)' }}>{c.departamento}</span>}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{c.email ?? c.phone ?? '—'}{c.whatsapp && <span className="block text-[11px]" style={{ color: 'var(--text-light)' }}>wpp {c.whatsapp}</span>}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{INFLU.find(i => i.v === (c.influencia_decisao ?? ''))?.l ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{CANAL.find(i => i.v === (c.canal_preferido ?? ''))?.l ?? '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-[var(--surface-hover)]" title="Editar" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                  <button onClick={() => remove(c)} className="p-1.5 rounded hover:bg-[var(--surface-hover)] ml-1" title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setModal(false)}>
          <div className="w-full max-w-lg rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{editId ? 'Editar' : 'Novo'} contato</h2>
              <button onClick={() => setModal(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Empresa *</label>
                <select value={form.customer_id} onChange={e => setF('customer_id', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">Selecione a empresa…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome *</label><input value={form.name} onChange={e => setF('name', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Cargo</label><input value={form.cargo} onChange={e => setF('cargo', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Departamento</label><input value={form.departamento} onChange={e => setF('departamento', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>E-mail</label><input type="email" value={form.email} onChange={e => setF('email', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Telefone</label><input value={form.phone} onChange={e => setF('phone', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>WhatsApp</label><input value={form.whatsapp} onChange={e => setF('whatsapp', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>LinkedIn (URL)</label><input value={form.linkedin} onChange={e => setF('linkedin', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Influência na decisão</label><select value={form.influencia_decisao} onChange={e => setF('influencia_decisao', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>{INFLU.map(i => <option key={i.v} value={i.v}>{i.l}</option>)}</select></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Canal preferido</label><select value={form.canal_preferido} onChange={e => setF('canal_preferido', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>{CANAL.map(i => <option key={i.v} value={i.v}>{i.l}</option>)}</select></div>
            </div>
            {editId && (
              <div className="mt-3">
                <CustomFieldsSection urlContext="contacts" entityId={editId} title="Campos personalizados do contato" />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
