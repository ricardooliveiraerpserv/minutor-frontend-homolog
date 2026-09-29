'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { X, Video, CalendarClock, Users, Trash2, Plus } from 'lucide-react'

// "Agendar reunião" — cria uma reunião (entidade do Minutor) a partir de uma ORIGEM (aqui, o chamado).
// Fase 0: o provider é no-op (Presencial); Teams entra na Fase 1 sem mudar este modal.

interface Part { user_id?: number; customer_contact_id?: number; email?: string | null; name?: string | null; role: string; is_external?: boolean }

// Só Microsoft Teams — a reunião é criada no calendário do organizador (conta do Meu Dia) e o link
// do Teams é gerado automaticamente.
const PROVIDERS = [
  { v: 'teams', label: 'Microsoft Teams' },
]
const ROLE_LABEL: Record<string, string> = { organizer: 'Organizador', solicitante: 'Solicitante', responsavel: 'Responsável', consultor: 'Consultor', coordenador: 'Coordenador', required: 'Participante', optional: 'Opcional' }

// Próximo horário disponível (só SUGESTÃO do default): agora + 15min de folga, arredondado p/ o
// próximo :00 ou :30. A data acompanha (vira o dia seguinte se passar da meia-noite). Combina com a
// guarda de não-agendar-no-passado — o default nunca cai no passado.
function nextSlot() {
  const d = new Date(Date.now() + 15 * 60_000)
  d.setSeconds(0, 0)
  const m = d.getMinutes()
  if (m > 30) { d.setMinutes(0); d.setHours(d.getHours() + 1) }
  else if (m > 0) { d.setMinutes(30) }
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

export function AgendarReuniaoModal({ originType, originId, defaultTitle, meeting, onClose, onCreated }: {
  originType?: string; originId?: number; defaultTitle?: string
  meeting?: { id: number; title: string; starts_at: string; duration_minutes: number } | null
  onClose: () => void; onCreated: () => void
}) {
  const editing = !!meeting
  const init = nextSlot()
  // Hoje (local) — usado como min do input de data: não dá pra escolher um DIA passado.
  const todayStr = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
  // Modo edição: pré-preenche data/hora/duração da reunião existente (reagendar).
  const initEdit = meeting ? (() => {
    const d = new Date(meeting.starts_at); const p = (n: number) => String(n).padStart(2, '0')
    return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
  })() : null
  const [title, setTitle] = useState(meeting?.title ?? defaultTitle ?? '')
  const [date, setDate] = useState(initEdit?.date ?? init.date)
  const [time, setTime] = useState(initEdit?.time ?? init.time)
  const [duration, setDuration] = useState(meeting?.duration_minutes ?? 30)
  const [provider, setProvider] = useState('teams')
  const [description, setDescription] = useState('')
  const [sendInvites, setSendInvites] = useState(true)
  const [parts, setParts] = useState<Part[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)

  // Prefill dos participantes sugeridos da origem (solicitante/responsável/CC). Reunião avulsa (sem
  // origem, criada pela Central) começa sem sugeridos.
  useEffect(() => {
    if (editing || !originType || !originId) return  // edição = reagendar; não recarrega sugeridos
    api.get<{ data: Part[] }>(`/meetings/suggested-participants?origin_type=${originType}&origin_id=${originId}`)
      .then(r => setParts(r?.data ?? [])).catch(() => {})
  }, [editing, originType, originId])

  const removePart = (i: number) => setParts(ps => ps.filter((_, j) => j !== i))
  const addEmail = () => {
    const e = newEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error('E-mail inválido.'); return }
    setParts(ps => [...ps, { email: e, role: 'optional', is_external: true }]); setNewEmail('')
  }

  const submit = async () => {
    if (!title.trim()) { toast.error('Informe o título.'); return }
    if (!date || !time) { toast.error('Informe data e hora.'); return }
    // Não permite agendar/reagendar no passado (data + hora combinadas). Tolerância de 1 min p/ evitar
    // recusar o "agora exato" por diferença de relógio.
    const startsAt = new Date(`${date}T${time}:00`)
    if (isNaN(startsAt.getTime())) { toast.error('Data/hora inválida.'); return }
    if (startsAt.getTime() < Date.now() - 60_000) { toast.error('Não é possível agendar reunião em data/horário passado.'); return }
    setSaving(true)
    try {
      if (editing && meeting) {
        // Reagendar: o backend (PUT /meetings/{id}) altera data/hora/duração da reunião.
        await api.put(`/meetings/${meeting.id}`, { starts_at: `${date}T${time}:00`, duration_minutes: duration })
        toast.success('Reunião reagendada.')
      } else {
        await api.post('/meetings', {
          title: title.trim(), description: description.trim() || null, provider,
          starts_at: `${date}T${time}:00`, duration_minutes: duration,
          origin_type: originType ?? 'AGENDA', origin_id: originId ?? null,
          participants: parts, send_invites: sendInvites,
        })
        toast.success('Reunião agendada.')
      }
      onCreated(); onClose()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao agendar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Video size={15} style={{ color: 'var(--primary)' }} /> {editing ? 'Editar reunião' : 'Agendar reunião'}
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="p-4 space-y-3 max-h-[68vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Título</label>
            <input className="ds-input w-full" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Alinhamento sobre o chamado" autoFocus={!editing} disabled={editing} style={editing ? { opacity: 0.6 } : undefined} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Data</label>
              <input type="date" className="ds-input w-full" value={date} min={todayStr} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Hora</label>
              <input type="time" className="ds-input w-full" value={time} onChange={e => setTime(e.target.value)} /></div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Duração</label>
              <select className="ds-input w-full" value={duration} onChange={e => setDuration(Number(e.target.value))}>
                {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
              </select></div>
          </div>
          {editing && (
            <div className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
              Ao salvar, apenas <b>data, hora e duração</b> são alterados. Título e participantes seguem os da reunião original.
            </div>
          )}
          {!editing && (<>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map(p => (
                <button key={p.v} type="button" onClick={() => setProvider(p.v)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: provider === p.v ? 'var(--primary)' : 'var(--border)', background: provider === p.v ? 'var(--primary-soft)' : 'transparent', color: provider === p.v ? 'var(--primary)' : 'var(--text-muted)', fontWeight: provider === p.v ? 600 : 400 }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1 inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Users size={11} /> Participantes</label>
            <div className="rounded-lg divide-y" style={{ border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
              {parts.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum — adicione abaixo.</div>}
              {parts.map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5" style={{ borderColor: 'var(--border)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{p.name || p.email}</div>
                    {p.name && p.email && <div className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>{p.email}</div>}
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{ROLE_LABEL[p.role] ?? p.role}</span>
                  <button onClick={() => removePart(i)}><Trash2 size={13} style={{ color: 'var(--text-light)' }} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-1.5">
              <input className="ds-input flex-1" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="adicionar e-mail…" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())} />
              <button className="ds-btn-secondary inline-flex items-center gap-1 text-sm" onClick={addEmail}><Plus size={14} /> Add</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-light)' }}>Descrição</label>
            <textarea className="ds-input w-full" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Pauta / contexto (opcional)" />
          </div>
          <button type="button" onClick={() => setSendInvites(v => !v)} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
            <span className="w-4 h-4 rounded shrink-0 flex items-center justify-center" style={{ background: sendInvites ? 'var(--primary)' : 'var(--surface-sunken)', border: `1px solid ${sendInvites ? 'var(--primary)' : 'var(--border)'}` }}>
              {sendInvites && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="var(--primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            Enviar convites aos participantes
          </button>
          </>)}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="ds-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5" onClick={submit} disabled={saving}>
            <CalendarClock size={14} /> {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar reunião'}
          </button>
        </div>
      </div>
    </div>
  )
}
