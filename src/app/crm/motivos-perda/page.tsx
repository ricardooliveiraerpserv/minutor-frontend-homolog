'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { XCircle, Plus } from 'lucide-react'

interface Reason { id: number; name: string; active: boolean; ordem: number }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function CrmMotivosPerdaPage() {
  const [reasons, setReasons] = useState<Reason[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')

  useEffect(() => {
    api.get<{ data: Reason[] }>('/crm/loss-reasons').then(r => setReasons(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])

  const add = async () => {
    if (!name.trim()) return
    try { const r = await api.post<{ data: Reason }>('/crm/loss-reasons', { name }); setReasons(s => [...s, r.data]); setName(''); toast.success('Motivo criado') }
    catch { toast.error('Motivo já existe ou inválido') }
  }
  const toggle = async (s: Reason) => {
    try { const r = await api.put<{ data: Reason }>(`/crm/loss-reasons/${s.id}`, { active: !s.active }); setReasons(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Erro') }
  }
  const rename = async (s: Reason, novo: string) => {
    if (!novo.trim() || novo === s.name) return
    try { const r = await api.put<{ data: Reason }>(`/crm/loss-reasons/${s.id}`, { name: novo }); setReasons(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Nome já existe ou inválido') }
  }

  return (
    <AppLayout title="Motivos de Perda (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <XCircle size={18} style={{ color: 'var(--danger-border)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Motivos de Perda</h1>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Cadastro configurável exigido ao marcar uma oportunidade como perdida.</p>

      <div className="flex gap-2 mb-4 max-w-md">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Novo motivo…" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-2xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Motivo</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold w-32">Situação</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={2} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : reasons.length === 0 ? <tr><td colSpan={2} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum motivo.</td></tr>
            : reasons.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5"><input defaultValue={s.name} onBlur={e => rename(s, e.target.value)} className="bg-transparent outline-none w-full" style={{ color: 'var(--text)' }} /></td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => toggle(s)} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={s.active ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : { background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{s.active ? 'Ativo' : 'Inativo'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
