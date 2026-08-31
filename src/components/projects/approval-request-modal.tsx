'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, Paperclip, ShieldQuestion } from 'lucide-react'
import type { StageDelivery } from '@/lib/types/project-stage'

/**
 * Modal de "Solicitar aprovação do cliente" — obrigatório ao mover um card para
 * "Aguardando cliente". Mensagem obrigatória + anexo/print opcional. A mensagem
 * vai pra conversa visível ao cliente (audience cliente; consultor opcional).
 */
export function ApprovalRequestModal({ deliveryId, title, onClose, onDone }: {
  deliveryId: number
  title: string
  onClose: () => void
  onDone: (updated: StageDelivery) => void
}) {
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [toConsultor, setToConsultor] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!message.trim()) { toast.error('Escreva uma mensagem para o cliente.'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('message', message.trim())
      if (file) form.append('attachment', file)
      if (toConsultor) form.append('audiences[]', 'consultor')
      const updated = await api.post<StageDelivery>(`/deliveries/${deliveryId}/request-approval`, form)
      toast.success('Enviado para aprovação do cliente')
      onDone(updated)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao solicitar aprovação')
    } finally { setBusy(false) }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 10001,
        width: 'min(520px, 94vw)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,.3)', padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            <ShieldQuestion size={18} style={{ color: 'var(--warning)' }} /> Solicitar aprovação do cliente
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          “{title}” vai para <strong>Aguardando cliente</strong>. Descreva o que ele deve validar — esta mensagem aparece na conversa do cliente.
        </p>

        <textarea
          autoFocus value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Ex.: Segue o relatório fiscal para validação. Confira o anexo e aprove se estiver correto."
          rows={4} className="ds-input"
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: 10, fontSize: 13 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
            <Paperclip size={13} /> {file ? file.name : 'Anexar arquivo / print'}
            <input type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && <button onClick={() => setFile(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>remover</button>}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 4 }}>Quem vê esta mensagem:</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
              <input type="checkbox" checked readOnly /> Cliente <span style={{ color: 'var(--text-light)' }}>(obrigatório)</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={toConsultor} onChange={e => setToConsultor(e.target.checked)} /> Consultor
            </label>
            <span style={{ color: 'var(--text-light)' }}>· Admin e Coordenador sempre veem</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} className="ds-btn-ghost" style={{ fontSize: 13, padding: '8px 14px' }}>Cancelar</button>
          <button onClick={submit} disabled={busy || !message.trim()} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
            {busy ? 'Enviando…' : 'Enviar para o cliente'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
