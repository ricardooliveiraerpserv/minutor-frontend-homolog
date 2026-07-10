'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'
const PRIO = ['baixa', 'normal', 'alta', 'urgente']

/** Modal de abertura de chamado do cliente — reusável (portal e faixa "Precisa de ajuda?"). */
export function AbrirChamadoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [saving, setSaving] = useState(false)
  const [canUrgency, setCanUrgency] = useState(true)
  useEffect(() => { api.get<{ data: { inform?: Record<string, boolean> } }>('/help-desk/portal/permissions').then(r => setCanUrgency(r?.data?.inform?.urgency ?? true)).catch(() => {}) }, [])
  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    setSaving(true)
    try { const r = await api.post<{ data: { id: number } }>('/help-desk/portal/tickets', { subject: subject.trim(), description: description.trim() || null, priority }); toast.success('Chamado aberto'); onCreated(r.data.id) }
    catch { toast.error('Erro ao abrir chamado') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-16 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Abrir chamado</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Assunto *</label><input className={`${fieldCls} w-full`} style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} autoFocus /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição</label><textarea className={`${fieldCls} w-full`} style={inputStyle} rows={4} value={description} onChange={e => setDescription(e.target.value)} /></div>
        {canUrgency && <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Prioridade</label><select className={`${fieldCls} w-full capitalize`} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>{PRIO.map(p => <option key={p} value={p}>{p}</option>)}</select></div>}
        <div className="flex justify-end gap-2"><button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button><button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir'}</button></div>
      </div>
    </div>
  )
}
