'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Tag, Plus } from 'lucide-react'

interface Source { id: number; name: string; active: boolean; ordem: number }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function CrmOrigensPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')

  useEffect(() => {
    api.get<{ data: Source[] }>('/crm/lead-sources').then(r => setSources(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])

  const add = async () => {
    if (!name.trim()) return
    try { const r = await api.post<{ data: Source }>('/crm/lead-sources', { name }); setSources(s => [...s, r.data]); setName(''); toast.success('Origem criada') }
    catch { toast.error('Origem já existe ou inválida') }
  }
  const toggle = async (s: Source) => {
    try { const r = await api.put<{ data: Source }>(`/crm/lead-sources/${s.id}`, { active: !s.active }); setSources(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Erro') }
  }
  const rename = async (s: Source, novo: string) => {
    if (!novo.trim() || novo === s.name) return
    try { const r = await api.put<{ data: Source }>(`/crm/lead-sources/${s.id}`, { name: novo }); setSources(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Nome já existe ou inválido') }
  }

  return (
    <AppLayout title="Origens (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <Tag size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Origens de Lead / Oportunidade</h1>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Cadastro configurável usado em Leads e Oportunidades (sem texto livre).</p>

      <div className="flex gap-2 mb-4 max-w-md">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Nova origem…" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-2xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Origem</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold w-32">Situação</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={2} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : sources.length === 0 ? <tr><td colSpan={2} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma origem.</td></tr>
            : sources.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5">
                  <input defaultValue={s.name} onBlur={e => rename(s, e.target.value)} className="bg-transparent outline-none w-full" style={{ color: 'var(--text)' }} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => toggle(s)} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={s.active ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : { background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{s.active ? 'Ativa' : 'Inativa'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
