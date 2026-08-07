'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Megaphone, Plus, Trash2 } from 'lucide-react'

interface Campaign { id: number; name: string; starts_at: string | null; ends_at: string | null; active: boolean }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export default function CrmCampanhasPage() {
  const [rows, setRows] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState({ name: '', starts_at: '', ends_at: '' })

  const load = () => api.get<{ data: Campaign[] }>('/crm/campaigns').then(r => setRows(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!novo.name.trim()) { toast.error('Informe o nome da campanha'); return }
    try {
      const r = await api.post<{ data: Campaign }>('/crm/campaigns', { name: novo.name.trim(), starts_at: novo.starts_at || null, ends_at: novo.ends_at || null })
      setRows(s => [r.data, ...s]); setNovo({ name: '', starts_at: '', ends_at: '' }); toast.success('Campanha criada')
    } catch { toast.error('Erro ao criar (verifique as datas)') }
  }
  const patch = async (c: Campaign, body: Partial<Campaign>) => {
    try { const r = await api.put<{ data: Campaign }>(`/crm/campaigns/${c.id}`, body); setRows(xs => xs.map(x => x.id === c.id ? r.data : x)) }
    catch { toast.error('Erro ao salvar'); load() }
  }
  const del = async (c: Campaign) => {
    if (!confirm(`Excluir a campanha "${c.name}"? As oportunidades vinculadas perdem só o vínculo.`)) return
    try { await api.delete(`/crm/campaigns/${c.id}`); setRows(xs => xs.filter(x => x.id !== c.id)); toast.success('Campanha excluída') }
    catch { toast.error('Erro ao excluir') }
  }

  return (
    <AppLayout title="Campanhas (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Campanhas</h1>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Campanhas comerciais para vincular às oportunidades e medir origem/retorno.</p>

      <div className="flex gap-2 mb-4 flex-wrap items-end p-3 rounded-xl max-w-3xl" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
        <div className="flex-1 min-w-48">
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Nome</label>
          <input value={novo.name} onChange={e => setNovo(f => ({ ...f, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Ex.: Black Friday 2026" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Início</label>
          <input type="date" value={novo.starts_at} onChange={e => setNovo(f => ({ ...f, starts_at: e.target.value }))} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Fim</label>
          <input type="date" value={novo.ends_at} onChange={e => setNovo(f => ({ ...f, ends_at: e.target.value }))} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-3xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Campanha</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold w-32">Início</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold w-32">Fim</th>
            <th className="text-center px-3 py-2.5 text-xs font-semibold w-24">Ativa</th>
            <th className="px-3 py-2.5 w-12"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma campanha.</td></tr>
            : rows.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)', opacity: c.active ? 1 : 0.55 }}>
                <td className="px-4 py-2">
                  <input defaultValue={c.name} onBlur={e => { if (e.target.value.trim() && e.target.value !== c.name) patch(c, { name: e.target.value.trim() }) }} className="w-full px-2 py-1 rounded text-sm outline-none bg-transparent" style={{ color: 'var(--text)' }} />
                </td>
                <td className="px-3 py-2">
                  <input type="date" defaultValue={c.starts_at ?? ''} onBlur={e => { if ((e.target.value || null) !== c.starts_at) patch(c, { starts_at: e.target.value || null }) }} className="px-1.5 py-1 rounded text-xs outline-none" style={inputStyle} />
                </td>
                <td className="px-3 py-2">
                  <input type="date" defaultValue={c.ends_at ?? ''} onBlur={e => { if ((e.target.value || null) !== c.ends_at) patch(c, { ends_at: e.target.value || null }) }} className="px-1.5 py-1 rounded text-xs outline-none" style={inputStyle} />
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => patch(c, { active: !c.active })} className="text-xs px-2 py-1 rounded-full font-semibold" style={c.active ? { background: 'var(--success-bg)', color: 'var(--success-border)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{c.active ? 'Ativa' : 'Inativa'}</button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => del(c)} title="Excluir" className="p-1.5 rounded" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
