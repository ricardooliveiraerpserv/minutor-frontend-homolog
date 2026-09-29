'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { X, CalendarClock } from 'lucide-react'

// "Reabertura agendada" — agenda um chamado RESOLVIDO/ENCERRADO para reabrir automaticamente
// (→ Em atendimento) numa data/hora futura. Um job reabre quando a hora chega.

// data/hora local mínima (agora + 5min) no formato dos inputs.
function nowLocalParts() {
  const d = new Date(Date.now() + 5 * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

export function ScheduleReopenModal({ ticketId, onClose, onDone }: { ticketId: number; onClose: () => void; onDone: () => void }) {
  const init = nowLocalParts()
  const [date, setDate] = useState(init.date)
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!date || !time) { toast.error('Informe data e hora.'); return }
    setSaving(true)
    try {
      await api.post(`/help-desk/tickets/${ticketId}/schedule-reopen`, { date, time, note: note.trim() || undefined })
      toast.success('Reabertura agendada.')
      onDone(); onClose()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao agendar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-md overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <CalendarClock size={15} style={{ color: 'var(--primary)' }} /> Agendar reabertura
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Data</label>
              <input type="date" className="ds-input w-full" value={date} min={init.date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Hora</label>
              <input type="time" className="ds-input w-full" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Motivo (opcional)</label>
            <textarea className="ds-input w-full" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: acompanhamento pós-solução" />
          </div>
          <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            Na data/hora escolhida, o chamado volta automaticamente para <b>Em atendimento</b>. Você pode cancelar o agendamento a qualquer momento antes disso.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="ds-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5" onClick={submit} disabled={saving}>
            <CalendarClock size={14} /> {saving ? 'Agendando…' : 'Agendar reabertura'}
          </button>
        </div>
      </div>
    </div>
  )
}
