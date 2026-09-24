'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { X, Copy } from 'lucide-react'

// "Clonar chamado" — abre um NOVO chamado com a mesma classificação (cliente, contrato, categoria,
// serviço, prioridade, fila). Sem histórico/interações/SLA da origem. Solicitante/descrição/tags opcionais.

function Check({ on, onToggle, label, hint }: { on: boolean; onToggle: () => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-start gap-2.5 w-full text-left px-3 py-2 rounded-lg transition-colors ds-row-hover">
      <span className="mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center" style={{ background: on ? 'var(--primary)' : 'var(--surface-sunken)', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}` }}>
        {on && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="var(--primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span>
        <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{label}</span>
        {hint && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{hint}</span>}
      </span>
    </button>
  )
}

export function CloneTicketModal({ ticketId, sourceSubject, onClose }: { ticketId: number; sourceSubject: string; onClose: () => void }) {
  const router = useRouter()
  const [subject, setSubject] = useState(sourceSubject)
  const [copyDescription, setCopyDescription] = useState(true)
  const [copyRequester, setCopyRequester] = useState(true)
  const [copyTags, setCopyTags] = useState(true)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number; ticket_number: string } }>(`/help-desk/tickets/${ticketId}/clone`, {
        subject: subject.trim() || sourceSubject,
        copy_description: copyDescription, copy_requester: copyRequester, copy_tags: copyTags,
      })
      const nt = r?.data
      toast.success(`Chamado clonado: ${nt?.ticket_number ?? ''}`)
      if (nt?.id) router.push(`/help-desk/tickets/${nt.id}`)
      onClose()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao clonar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-md overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Copy size={15} style={{ color: 'var(--primary)' }} /> Clonar chamado
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Assunto do novo chamado</label>
            <input className="ds-input w-full" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Assunto" />
          </div>
          <div className="space-y-0.5">
            <Check on={copyDescription} onToggle={() => setCopyDescription(v => !v)} label="Copiar descrição" hint="Traz o texto de abertura da origem." />
            <Check on={copyRequester} onToggle={() => setCopyRequester(v => !v)} label="Copiar solicitante e cópias" hint="Contato, solicitante, e-mails em CC." />
            <Check on={copyTags} onToggle={() => setCopyTags(v => !v)} label="Copiar TAGs" />
          </div>
          <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            O clone herda cliente, contrato, categoria, serviço, prioridade e fila. Nasce em <b>Novo</b>, sem responsável e sem o histórico/interações da origem.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="ds-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5" onClick={submit} disabled={saving}>
            <Copy size={14} /> {saving ? 'Clonando…' : 'Clonar chamado'}
          </button>
        </div>
      </div>
    </div>
  )
}
