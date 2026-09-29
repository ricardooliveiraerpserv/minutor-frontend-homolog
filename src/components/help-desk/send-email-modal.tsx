'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { X, Send } from 'lucide-react'

// "Enviar e-mail avulso" — destinatários/assunto/corpo livres, enviado COMO a conta do Help Desk.
// Fica registrado no chamado como nota interna + evento.

const parseEmails = (s: string) => s.split(/[,;\n]/).map(e => e.trim()).filter(Boolean)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SendEmailModal({ ticketId, defaultTo, defaultSubject, onClose, onSent }: {
  ticketId: number; defaultTo?: string | null; defaultSubject: string; onClose: () => void; onSent: () => void
}) {
  const [to, setTo] = useState(defaultTo ?? '')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const toList = parseEmails(to), ccList = parseEmails(cc)
    if (!toList.length) { toast.error('Informe ao menos um destinatário.'); return }
    const bad = [...toList, ...ccList].find(e => !EMAIL_RE.test(e))
    if (bad) { toast.error(`E-mail inválido: ${bad}`); return }
    if (!subject.trim()) { toast.error('Informe o assunto.'); return }
    if (!body.trim()) { toast.error('Escreva a mensagem.'); return }

    setSending(true)
    try {
      await api.post(`/help-desk/tickets/${ticketId}/send-email`, {
        to: toList, cc: ccList, subject: subject.trim(),
        body: body.replace(/\n/g, '<br>'),
      })
      toast.success('E-mail enviado.')
      onSent(); onClose()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao enviar e-mail') }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Send size={15} style={{ color: 'var(--primary)' }} /> Enviar e-mail
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Para</label>
            <input className="ds-input w-full" value={to} onChange={e => setTo(e.target.value)} placeholder="email@empresa.com, outro@empresa.com" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>CC (opcional)</label>
            <input className="ds-input w-full" value={cc} onChange={e => setCc(e.target.value)} placeholder="separe por vírgula" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Assunto</label>
            <input className="ds-input w-full" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Mensagem</label>
            <textarea className="ds-input w-full" rows={6} value={body} onChange={e => setBody(e.target.value)} placeholder="Escreva a mensagem…" />
          </div>
          <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            Enviado pela conta do Help Desk. Fica registrado no chamado como nota interna.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="ds-btn-secondary" onClick={onClose} disabled={sending}>Cancelar</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5" onClick={submit} disabled={sending}>
            <Send size={14} /> {sending ? 'Enviando…' : 'Enviar e-mail'}
          </button>
        </div>
      </div>
    </div>
  )
}
