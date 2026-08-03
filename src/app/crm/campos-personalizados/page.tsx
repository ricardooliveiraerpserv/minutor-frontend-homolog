'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, SlidersHorizontal } from 'lucide-react'

interface CustomField {
  id: number
  context: string
  label: string
  key: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'select'
  required: boolean
  options: string[] | null
}

// Contextos (BE): Customer cobre Empresas/Clientes/Leads (mesma entidade); Opportunity = pipeline; Contact = contatos.
const CONTEXTS: { v: string; l: string; hint: string }[] = [
  { v: 'Customer', l: 'Empresas / Leads', hint: 'Aparecem no cadastro da empresa (e nos leads — mesma entidade).' },
  { v: 'Opportunity', l: 'Oportunidades', hint: 'Aparecem no card/detalhe da oportunidade no Pipeline.' },
  { v: 'Contact', l: 'Contatos', hint: 'Aparecem no cadastro de contatos do CRM.' },
  { v: 'Product', l: 'Produtos / Serviços', hint: 'Aparecem na edição do produto/serviço do CRM.' },
]
const TYPES: { v: CustomField['type']; l: string }[] = [
  { v: 'text', l: 'Texto' }, { v: 'number', l: 'Número' }, { v: 'boolean', l: 'Sim / Não' },
  { v: 'date', l: 'Data' }, { v: 'select', l: 'Seleção (lista)' },
]
const typeLabel = (t: string) => TYPES.find(x => x.v === t)?.l ?? t

// Chave técnica a partir do rótulo: minúsculo, sem acento, só [a-z0-9_].
const slugKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50)

const EMPTY = { label: '', key: '', type: 'text' as CustomField['type'], required: false, optionsText: '' }

export default function CrmCamposPage() {
  const [context, setContext] = useState('Customer')
  const [items, setItems] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [keyTouched, setKeyTouched] = useState(false)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback((ctx: string) => {
    setLoading(true)
    api.get<{ items: CustomField[] }>(`/custom-fields?context=${ctx}`)
      .then(r => setItems(r?.items ?? []))
      .catch(() => toast.error('Erro ao carregar campos'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load(context) }, [load, context])

  const openNew = () => { setEditId(null); setForm(EMPTY); setKeyTouched(false); setModal(true) }
  const openEdit = (f: CustomField) => {
    setEditId(f.id); setKeyTouched(true)
    setForm({ label: f.label, key: f.key, type: f.type, required: f.required, optionsText: (f.options ?? []).join('\n') })
    setModal(true)
  }

  const onLabel = (label: string) => setForm(f => ({ ...f, label, key: keyTouched ? f.key : slugKey(label) }))

  const save = async () => {
    if (!form.label.trim()) { toast.error('Informe o rótulo do campo'); return }
    const key = (form.key || slugKey(form.label)).trim()
    if (!key) { toast.error('Chave inválida'); return }
    const options = form.type === 'select'
      ? form.optionsText.split('\n').map(s => s.trim()).filter(Boolean)
      : null
    if (form.type === 'select' && (!options || options.length === 0)) { toast.error('Informe ao menos uma opção da lista'); return }
    setSaving(true)
    const payload = { context, label: form.label.trim(), key, type: form.type, required: form.required, options }
    try {
      if (editId) await api.put(`/custom-fields/${editId}`, payload)
      else await api.post('/custom-fields', payload)
      toast.success('Campo salvo')
      setModal(false)
      load(context)
    } catch (e) { toast.error(e instanceof ApiError && e.message ? e.message : 'Erro ao salvar campo') }
    finally { setSaving(false) }
  }

  const remove = async (f: CustomField) => {
    if (!confirm(`Excluir o campo "${f.label}"? Os valores já preenchidos deste campo serão perdidos.`)) return
    try { await api.delete(`/custom-fields/${f.id}`); setItems(xs => xs.filter(x => x.id !== f.id)); toast.success('Campo excluído') }
    catch (e) { toast.error(e instanceof ApiError && e.message ? e.message : 'Erro ao excluir') }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const ctxHint = CONTEXTS.find(c => c.v === context)?.hint

  return (
    <AppLayout title="Campos Personalizados (CRM)">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Campos Personalizados</h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Plus size={15} /> Novo campo
        </button>
      </div>

      {/* Tabs de contexto */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {CONTEXTS.map(c => (
          <button key={c.v} onClick={() => setContext(c.v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={context === c.v
              ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
              : { background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {c.l}
          </button>
        ))}
      </div>
      {ctxHint && <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>{ctxHint}</p>}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
              <th className="text-left px-4 py-2.5 text-xs font-semibold">Rótulo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold">Chave</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold">Tipo</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold">Obrigatório</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum campo personalizado neste contexto.</td></tr>
            ) : items.map(f => (
              <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>
                  {f.label}
                  {f.type === 'select' && f.options?.length ? (
                    <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{f.options.join(' · ')}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{f.key}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{typeLabel(f.type)}</td>
                <td className="px-4 py-3 text-center">
                  {f.required
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>Sim</span>
                    : <span style={{ color: 'var(--text-light)' }}>—</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-[var(--surface-hover)]" title="Editar" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                  <button onClick={() => remove(f)} className="p-1.5 rounded hover:bg-[var(--surface-hover)] ml-1" title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
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
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
                {editId ? 'Editar' : 'Novo'} campo — {CONTEXTS.find(c => c.v === context)?.l}
              </h2>
              <button onClick={() => setModal(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Rótulo (nome exibido) *</label>
                <input value={form.label} onChange={e => onLabel(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} placeholder="Ex.: Segmento de atuação" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Chave técnica</label>
                  <input value={form.key} onChange={e => { setKeyTouched(true); setForm(f => ({ ...f, key: slugKey(e.target.value) })) }}
                    disabled={!!editId} className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono" style={{ ...inputStyle, opacity: editId ? 0.6 : 1 }} placeholder="segmento_de_atuacao" />
                  {editId && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>A chave não muda após criada.</span>}
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as CustomField['type'] }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </div>
              </div>
              {form.type === 'select' && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Opções da lista (uma por linha) *</label>
                  <textarea value={form.optionsText} onChange={e => setForm(f => ({ ...f, optionsText: e.target.value }))} rows={4}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, resize: 'vertical' }} placeholder={'Opção A\nOpção B\nOpção C'} />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} style={{ accentColor: 'var(--primary)' }} />
                Preenchimento obrigatório
              </label>
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
