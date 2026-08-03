'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, Package } from 'lucide-react'
import { CustomFieldsSection } from '@/components/crm/custom-fields-section'

interface CrmProduct {
  id: number
  name: string
  categoria: string
  tipo_precificacao: string
  valor: number | null
  descricao_tecnica: string | null
  ativo: boolean
}

const CATEGORIAS = ['Licenciamento', 'Implantação', 'Sustentação', 'Banco de Horas', 'Pacote de Horas', 'Projeto Fechado', 'Treinamento', 'Customização']
const PRECIFICACOES: { v: string; l: string }[] = [
  { v: 'hora', l: 'Por hora' }, { v: 'projeto', l: 'Por projeto' }, { v: 'mensal', l: 'Mensal' }, { v: 'licenca', l: 'Licença' },
]

const fmtBRL = (n: number | null) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const EMPTY = { name: '', categoria: 'Sustentação', tipo_precificacao: 'hora', valor: '', descricao_tecnica: '', ativo: true }

export default function CrmProdutosPage() {
  const [items, setItems] = useState<CrmProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: CrmProduct[] }>('/crm/products')
      .then(r => setItems(r?.data ?? []))
      .catch(() => toast.error('Erro ao carregar produtos'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditId(null); setForm(EMPTY); setModal(true) }
  const openEdit = (p: CrmProduct) => {
    setEditId(p.id)
    setForm({ name: p.name, categoria: p.categoria, tipo_precificacao: p.tipo_precificacao, valor: p.valor != null ? String(p.valor) : '', descricao_tecnica: p.descricao_tecnica ?? '', ativo: p.ativo })
    setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    const payload = { ...form, valor: form.valor === '' ? null : Number(form.valor) }
    try {
      if (editId) await api.put(`/crm/products/${editId}`, payload)
      else await api.post('/crm/products', payload)
      toast.success('Produto salvo')
      setModal(false)
      load()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const remove = async (p: CrmProduct) => {
    if (!confirm(`Excluir "${p.name}"?`)) return
    try { await api.delete(`/crm/products/${p.id}`); setItems(xs => xs.filter(x => x.id !== p.id)); toast.success('Excluído') }
    catch { toast.error('Erro ao excluir') }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <AppLayout title="Produtos e Serviços (CRM)">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Package size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Catálogo de Produtos e Serviços</h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
              <th className="text-left px-4 py-2.5 text-xs font-semibold">Nome</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold">Categoria</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold">Precificação</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold">Valor</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold">Ativo</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum produto cadastrado.</td></tr>
            ) : items.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{p.name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{p.categoria}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{PRECIFICACOES.find(x => x.v === p.tipo_precificacao)?.l ?? p.tipo_precificacao}</td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(p.valor)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={p.ativo ? { background: 'var(--success-bg)', color: 'var(--success-border)' } : { background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-[var(--surface-hover)]" title="Editar" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                  <button onClick={() => remove(p)} className="p-1.5 rounded hover:bg-[var(--surface-hover)] ml-1" title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setModal(false)}>
          <div className="w-full max-w-lg rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{editId ? 'Editar' : 'Novo'} produto/serviço</h2>
              <button onClick={() => setModal(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Categoria</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Precificação</label>
                  <select value={form.tipo_precificacao} onChange={e => setForm(f => ({ ...f, tipo_precificacao: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {PRECIFICACOES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Descrição técnica</label>
                <textarea value={form.descricao_tecnica} onChange={e => setForm(f => ({ ...f, descricao_tecnica: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} style={{ accentColor: 'var(--primary)' }} />
                Ativo
              </label>
              {/* Campos personalizados do produto — só ao editar (precisa do id). Salvam sozinhos. */}
              {editId && <CustomFieldsSection urlContext="products" entityId={editId} title="Campos personalizados do produto" />}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
