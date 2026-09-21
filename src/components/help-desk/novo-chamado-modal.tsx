'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, FileCode } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { ServiceTreeSelect } from '@/components/help-desk/service-tree-select'
import { useActiveCompany } from '@/hooks/use-active-company'

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
  companies_scope?: { id: number; name: string; slug?: string | null; color?: string | null }[] // multi-empresa: empresas que o agente atende
  is_multi_company?: boolean
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Média', alta: 'Alta', urgente: 'Urgente' }

export function NovoChamadoModal({ meta, customers, onClose, onCreated, variant = 'modal', heading = 'Novo chamado' }: { meta: NovoChamadoMeta | null; customers: NovoChamadoRef[]; onClose: () => void; onCreated: (id: number) => void; variant?: 'modal' | 'drawer'; heading?: string }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [contactId, setContactId] = useState('')
  const [contacts, setContacts] = useState<{ id: number; name: string; email: string | null }[]>([])
  const [saving, setSaving] = useState(false)
  // Chamado "interno" = cliente ERPSERV (resolvido pelo nome, sem hardcode de id).
  const erpserv = customers.find(c => /erpserv/i.test(c.name))

  // Solicitante: contatos do cliente selecionado (interno/ERPSERV não tem solicitante externo).
  useEffect(() => {
    setContactId('')
    setContacts([])
    if (!customerId || customerId === String(erpserv?.id ?? '')) return
    let alive = true
    api.get<{ data: { id: number; name: string; email: string | null }[] }>(`/help-desk/contacts?customer_id=${customerId}`)
      .then(r => { if (alive) setContacts(r.data ?? []) })
      .catch(() => { if (alive) setContacts([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])
  // Multi-empresa: quem atende 2+ empresas escolhe a EMPRESA DO GRUPO onde o chamado é aberto.
  const { active } = useActiveCompany()
  const companyOpts = meta?.companies_scope ?? []
  const showCompanyPicker = !!meta?.is_multi_company && companyOpts.length > 1
  const [companyId, setCompanyId] = useState<string>('')
  // Default = empresa ativa (se estiver no escopo), senão a 1ª do escopo.
  const effectiveCompanyId = companyId || (companyOpts.some(c => c.id === active?.id) ? String(active?.id) : String(companyOpts[0]?.id ?? ''))

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/help-desk/tickets', {
        subject: subject.trim(), description: description.trim() || null, priority,
        category_id: categoryId || null, service_id: serviceId || null,
        customer_id: customerId || erpserv?.id || null, // vazio (interno) → ERPSERV
        customer_contact_id: contactId ? Number(contactId) : null, // solicitante (contato do cliente)
        company_id: showCompanyPicker && effectiveCompanyId ? Number(effectiveCompanyId) : null, // empresa do grupo escolhida
      })
      toast.success('Chamado aberto')
      onCreated(r.data.id)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao abrir chamado') } finally { setSaving(false) }
  }

  const lbl = 'text-[11px] font-semibold block mb-0.5'
  const drawer = variant === 'drawer'
  return (
    <div
      className={`fixed z-50 inset-0 ${drawer ? 'pointer-events-none' : 'flex items-start justify-center pt-16 px-4'}`}
      style={{ background: drawer ? 'transparent' : 'rgba(0,0,0,0.4)' }}
      onClick={drawer ? undefined : onClose}
    >
      <div
        className={`ds-card p-4 space-y-3 ${drawer ? 'pointer-events-auto fixed right-4 bottom-4 w-[min(92vw,420px)] max-h-[82vh] overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200' : 'w-full max-w-lg'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{heading}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <a href="/help-desk/codigo-fonte" onClick={onClose} className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-2" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
          <FileCode size={13} /> Precisa de código-fonte? Abrir o assistente de solicitação →
        </a>
        {showCompanyPicker && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Empresa do chamado *</label>
            <div className="flex gap-1.5 flex-wrap">
              {companyOpts.map(c => {
                const sel = effectiveCompanyId === String(c.id)
                return (
                  <button key={c.id} type="button" onClick={() => setCompanyId(String(c.id))}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: sel ? (c.color || 'var(--primary)') : 'var(--border)', background: sel ? (c.color ? c.color + '22' : 'var(--primary-soft)') : 'var(--surface)', color: sel ? (c.color || 'var(--primary)') : 'var(--text-muted)' }}>
                    {sel ? '✓ ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Você atende mais de uma empresa — escolha em qual o chamado será aberto.</p>
          </div>
        )}
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
        {!!customerId && customerId !== String(erpserv?.id ?? '') && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Solicitante</label>
            <SearchSelect fullWidth disabled={contacts.length === 0}
              placeholder={contacts.length === 0 ? 'Cliente sem contatos cadastrados' : 'Selecionar solicitante…'}
              value={contactId} onChange={setContactId}
              options={[{ id: '', name: 'Sem solicitante definido' }, ...contacts.map(c => ({ id: c.id, name: c.email ? `${c.name} · ${c.email}` : c.name }))]} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir chamado'}</button>
        </div>
      </div>
    </div>
  )
}
