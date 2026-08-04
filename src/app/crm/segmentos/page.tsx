'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Tag, Plus, Trash2 } from 'lucide-react'

interface Segment { id: number; name: string; active: boolean; ordem: number }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function CrmSegmentosPage() {
  const [items, setItems] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')

  useEffect(() => {
    api.get<{ data: Segment[] }>('/crm/segments').then(r => setItems(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])

  const add = async () => {
    if (!name.trim()) return
    try { const r = await api.post<{ data: Segment }>('/crm/segments', { name }); setItems(s => [...s, r.data]); setName(''); toast.success('Segmento criado') }
    catch { toast.error('Segmento já existe ou inválido') }
  }
  const toggle = async (s: Segment) => {
    try { const r = await api.put<{ data: Segment }>(`/crm/segments/${s.id}`, { active: !s.active }); setItems(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Erro') }
  }
  const rename = async (s: Segment, novo: string) => {
    if (!novo.trim() || novo === s.name) return
    try { const r = await api.put<{ data: Segment }>(`/crm/segments/${s.id}`, { name: novo }); setItems(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Nome já existe ou inválido') }
  }
  const remove = async (s: Segment) => {
    if (!confirm(`Excluir o segmento "${s.name}"? As empresas já classificadas mantêm o texto.`)) return
    try { await api.delete(`/crm/segments/${s.id}`); setItems(xs => xs.filter(x => x.id !== s.id)); toast.success('Segmento excluído') }
    catch { toast.error('Erro ao excluir') }
  }

  return (
    <AppLayout title="Segmentos (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <Tag size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Segmentos de Mercado</h1>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Cadastro configurável usado no perfil da empresa (segmento).</p>

      <div className="flex gap-2 mb-4 max-w-md">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Novo segmento…" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-2xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Segmento</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold w-28">Situação</th>
            <th className="px-4 py-2.5 w-12"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : items.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum segmento.</td></tr>
            : items.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5"><input defaultValue={s.name} onBlur={e => rename(s, e.target.value)} className="bg-transparent outline-none w-full" style={{ color: 'var(--text)' }} /></td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => toggle(s)} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={s.active ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : { background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{s.active ? 'Ativo' : 'Inativo'}</button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(s)} className="p-1.5 rounded hover:bg-[var(--surface-hover)]" title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
