'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { ServiceTreeSelect } from '@/components/help-desk/service-tree-select'

// Modal de abertura de chamado — compartilhado entre a lista de Chamados e a Fila (Kanban),
// para o botão "Novo chamado" abrir o formulário INLINE (sem navegar para outra tela).

export interface NovoChamadoRef { id: number; name: string }
export interface NovoChamadoServiceOpt { id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }
export interface NovoChamadoMeta {
  priorities?: string[]
  categories?: { id: number; name: string; color?: string | null }[]
  services?: NovoChamadoServiceOpt[]
  my_inform?: Record<string, boolean>
  my_perms?: Record<string, boolean>
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Média', alta: 'Alta', urgente: 'Urgente' }

export function NovoChamadoModal({ meta, customers, onClose, onCreated }: { meta: NovoChamadoMeta | null; customers: NovoChamadoRef[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [saving, setSaving] = useState(false)
  // Chamado "interno" = cliente ERPSERV (resolvido pelo nome, sem hardcode de id).
  const erpserv = customers.find(c => /erpserv/i.test(c.name))

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/help-desk/tickets', {
        subject: subject.trim(), description: description.trim() || null, priority,
        category_id: categoryId || null, service_id: serviceId || null,
        customer_id: customerId || erpserv?.id || null, // vazio (interno) → ERPSERV
      })
      toast.success('Chamado aberto')
      onCreated(r.data.id)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao abrir chamado') } finally { setSaving(false) }
  }

  const lbl = 'text-[11px] font-semibold block mb-0.5'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Novo chamado</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="space-y-2">
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Assunto *</label>
            <input className={`${fieldCls} w-full`} style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} autoFocus />
          </div>
        </div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição</label>
          <textarea className={`${fieldCls} w-full`} style={inputStyle} rows={4} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(meta?.my_inform?.urgency ?? true) && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Urgência</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                {(meta?.priorities ?? ['baixa', 'normal', 'alta', 'urgente']).map(p => <option key={p} value={p}>{PRIO_LABEL[p] ?? p}</option>)}
              </select>
            </div>
          )}
          {(meta?.my_inform?.category ?? true) && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Categoria</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {(meta?.categories ?? []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {(meta?.my_inform?.service ?? true) && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Serviço</label>
            <ServiceTreeSelect services={meta?.services ?? []} value={serviceId ? Number(serviceId) : null} onChange={id => setServiceId(id ? String(id) : '')} />
          </div>
        )}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Cliente</label>
          <SearchSelect fullWidth placeholder="Buscar cliente…" value={customerId} onChange={setCustomerId}
            options={[{ id: '', name: 'ERPSERV (interno)' }, ...customers.filter(c => c.id !== erpserv?.id).map(c => ({ id: c.id, name: c.name }))]} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir chamado'}</button>
        </div>
      </div>
    </div>
  )
}
