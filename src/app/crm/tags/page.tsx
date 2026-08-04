'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Tags as TagsIcon, Plus, Trash2, Pencil, X } from 'lucide-react'

interface Tag { id: number; name: string; color: string | null; active: boolean }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const DEFAULT_COLOR = '#3b82f6'

export default function CrmTagsPage() {
  const [items, setItems] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<Tag | null>(null)
  const [ef, setEf] = useState({ name: '', color: DEFAULT_COLOR, active: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ data: Tag[] }>('/crm/tags').then(r => setItems(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])

  const add = async () => {
    if (!name.trim()) return
    try { const r = await api.post<{ data: Tag }>('/crm/tags', { name, color: DEFAULT_COLOR }); setItems(s => [...s, r.data]); setName(''); toast.success('Tag criada') }
    catch { toast.error('Tag já existe ou inválida') }
  }
  const openEdit = (t: Tag) => { setEdit(t); setEf({ name: t.name, color: t.color || DEFAULT_COLOR, active: t.active }) }
  const saveEdit = async () => {
    if (!edit) return
    if (!ef.name.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    try {
      const r = await api.put<{ data: Tag }>(`/crm/tags/${edit.id}`, { name: ef.name, color: ef.color, active: ef.active })
      setItems(xs => xs.map(x => x.id === edit.id ? r.data : x))
      setEdit(null); toast.success('Tag atualizada')
    } catch { toast.error('Nome já existe ou inválido') } finally { setSaving(false) }
  }
  const remove = async (t: Tag) => {
    if (!confirm(`Excluir a tag "${t.name}"? Ela será removida das empresas que a usam.`)) return
    try { await api.delete(`/crm/tags/${t.id}`); setItems(xs => xs.filter(x => x.id !== t.id)); toast.success('Tag excluída') }
    catch { toast.error('Erro ao excluir') }
  }

  return (
    <AppLayout title="Tags (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <TagsIcon size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Tags</h1>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Rótulos reutilizáveis aplicados às empresas. Também podem ser criados direto no cadastro da empresa.</p>

      <div className="flex gap-2 mb-4 max-w-md">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Nova tag…" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-2xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Tag</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold w-28">Situação</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold w-24">Ações</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : items.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma tag.</td></tr>
            : items.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color || DEFAULT_COLOR }} />
                    {t.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={t.active ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : { background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{t.active ? 'Ativo' : 'Inativo'}</span>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-[var(--surface-hover)]" title="Editar" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                  <button onClick={() => remove(t)} className="p-1.5 rounded hover:bg-[var(--surface-hover)] ml-1" title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setEdit(null)}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar tag</h2>
              <button onClick={() => setEdit(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome *</label>
                <input value={ef.name} onChange={e => setEf(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Cor</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={ef.color} onChange={e => setEf(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 rounded cursor-pointer" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} />
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{ef.color}</span>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={ef.active} onChange={e => setEf(f => ({ ...f, active: e.target.checked }))} style={{ accentColor: 'var(--primary)' }} />
                Ativo <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>(desmarque para inativar)</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEdit(null)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
