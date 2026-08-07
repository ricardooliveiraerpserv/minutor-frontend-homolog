'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { XCircle, Plus, Trash2, RotateCcw } from 'lucide-react'

interface Reason { id: number; name: string; active: boolean; ordem: number; dias_repescagem: number | null }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function CrmMotivosDescartePage() {
  const [rows, setRows] = useState<Reason[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState({ name: '', dias: '' })

  const load = () => api.get<{ data: Reason[] }>('/crm/discard-reasons').then(r => setRows(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!novo.name.trim()) { toast.error('Informe o motivo'); return }
    try {
      const r = await api.post<{ data: Reason }>('/crm/discard-reasons', { name: novo.name.trim(), dias_repescagem: novo.dias ? Number(novo.dias) : null })
      setRows(s => [...s, r.data]); setNovo({ name: '', dias: '' }); toast.success('Motivo criado')
    } catch { toast.error('Erro ao criar motivo') }
  }
  const patch = async (s: Reason, body: Partial<Reason>) => {
    try { const r = await api.put<{ data: Reason }>(`/crm/discard-reasons/${s.id}`, body); setRows(xs => xs.map(x => x.id === s.id ? r.data : x)) }
    catch { toast.error('Erro ao salvar'); load() }
  }
  const del = async (s: Reason) => {
    if (!confirm(`Excluir o motivo "${s.name}"?`)) return
    try { await api.delete(`/crm/discard-reasons/${s.id}`); setRows(xs => xs.filter(x => x.id !== s.id)); toast.success('Motivo excluído') }
    catch { toast.error('Erro ao excluir') }
  }

  return (
    <AppLayout title="Motivos de Descarte (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <XCircle size={18} style={{ color: 'var(--warning-border)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Motivos de Descarte</h1>
      </div>
      <p className="text-xs mb-4 max-w-2xl" style={{ color: 'var(--text-light)' }}>
        Usados ao descartar um lead no funil de prospecção. Quando um motivo tem <b>dias para repescagem</b>, o lead descartado
        volta automaticamente ao funil após esse prazo — e uma atividade de retomada é criada para o responsável. Em branco = nunca repesca.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap items-end p-3 rounded-xl max-w-2xl" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
        <div className="flex-1 min-w-48">
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Motivo</label>
          <input value={novo.name} onChange={e => setNovo(f => ({ ...f, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Ex.: Sem budget" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-[10px] mb-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><RotateCcw size={11} /> Dias p/ repescagem</label>
          <input type="number" min={1} value={novo.dias} onChange={e => setNovo(f => ({ ...f, dias: e.target.value }))} placeholder="nunca" className="w-28 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-2xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Motivo</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold w-40">Repescagem</th>
            <th className="text-center px-3 py-2.5 text-xs font-semibold w-24">Ativo</th>
            <th className="px-3 py-2.5 w-12"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum motivo.</td></tr>
            : rows.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)', opacity: s.active ? 1 : 0.55 }}>
                <td className="px-4 py-2">
                  <input defaultValue={s.name} onBlur={e => { if (e.target.value.trim() && e.target.value !== s.name) patch(s, { name: e.target.value.trim() }) }} className="w-full px-2 py-1 rounded text-sm outline-none bg-transparent" style={{ color: 'var(--text)' }} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <input type="number" min={1} defaultValue={s.dias_repescagem ?? ''} placeholder="nunca" onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== s.dias_repescagem) patch(s, { dias_repescagem: v }) }} className="w-20 px-1.5 py-1 rounded text-xs outline-none" style={inputStyle} />
                    <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{s.dias_repescagem ? 'dias' : ''}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => patch(s, { active: !s.active })} className="text-xs px-2 py-1 rounded-full font-semibold" style={s.active ? { background: 'var(--success-bg)', color: 'var(--success-border)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{s.active ? 'Ativo' : 'Inativo'}</button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => del(s)} title="Excluir" className="p-1.5 rounded" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
