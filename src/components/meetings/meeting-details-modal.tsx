'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { X, Video, CalendarClock, Users, ExternalLink, Copy, Clock } from 'lucide-react'

// Detalhes de uma reunião (abre ao clicar na linha da Central). Reusa GET /meetings/{id} + /cancel.

interface Detail {
  id: number; title: string; description: string | null; provider: string; status: string
  starts_at: string | null; ends_at: string | null; duration_minutes: number | null; join_url: string | null
  origin_type: string | null; origin_label: string | null; origin_id: number | null
  organizer: { name: string } | null
  participants: { name: string | null; email: string | null; role: string }[]
}
const PROV: Record<string, string> = { teams: 'Microsoft Teams', meet: 'Google Meet', zoom: 'Zoom', webex: 'Webex', presencial: 'Presencial' }
const ST: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Agendada', color: 'var(--primary)', bg: 'var(--primary-soft)' },
  live: { label: 'Em andamento', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  ended: { label: 'Realizada', color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
  canceled: { label: 'Cancelada', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const ORIGIN_HREF: Record<string, (id: number) => string> = {
  HELPDESK_TICKET: id => `/help-desk/tickets/${id}`,
  PROJECT: id => `/projects?highlight=${id}`,
}
const ROLE: Record<string, string> = { organizer: 'Organizador', solicitante: 'Solicitante', responsavel: 'Responsável', required: 'Participante', optional: 'Opcional' }
const fmt = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function MeetingDetailsModal({ meetingId, onClose, onChanged }: { meetingId: number; onClose: () => void; onChanged?: () => void }) {
  const [m, setM] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<{ data: Detail }>(`/meetings/${meetingId}`).then(r => setM(r?.data ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [meetingId])

  const cancel = async () => {
    if (!m || !confirm(`Cancelar a reunião "${m.title}"?`)) return
    setBusy(true)
    try { await api.post(`/meetings/${m.id}/cancel`, {}); toast.success('Reunião cancelada.'); onChanged?.(); onClose() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setBusy(false) }
  }
  const copyLink = () => { if (m?.join_url) { navigator.clipboard.writeText(m.join_url); toast.success('Link copiado.') } }

  const st = m ? (ST[m.status] ?? ST.scheduled) : ST.scheduled
  const originHref = m?.origin_type && m?.origin_id ? ORIGIN_HREF[m.origin_type]?.(m.origin_id) : null
  const active = m && m.status !== 'canceled' && m.status !== 'ended'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-md overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Video size={15} style={{ color: 'var(--primary)' }} /> Detalhes da reunião
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        {loading ? <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
          : !m ? <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Reunião não encontrada.</p>
          : (
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>{m.title}</div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
              </div>

              <div className="space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                <div className="inline-flex items-center gap-2"><CalendarClock size={14} /> {fmt(m.starts_at)}{m.duration_minutes ? ` · ${m.duration_minutes} min` : ''}</div>
                <div className="inline-flex items-center gap-2"><Video size={14} /> {PROV[m.provider] ?? m.provider}</div>
                {m.organizer?.name && <div className="inline-flex items-center gap-2"><Users size={14} /> Organizador: {m.organizer.name}</div>}
                {m.origin_label && <div>Origem: {originHref
                  ? <Link href={originHref} className="hover:underline" style={{ color: 'var(--primary)' }}>{m.origin_label}</Link>
                  : <span>{m.origin_label}</span>}</div>}
              </div>

              {m.description && <div className="text-sm rounded-lg p-2.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{m.description}</div>}

              {m.participants.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Participantes</div>
                  <div className="rounded-lg divide-y" style={{ border: '1px solid var(--border)' }}>
                    {m.participants.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5" style={{ borderColor: 'var(--border)' }}>
                        <div className="min-w-0 flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{p.name || p.email}</div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{ROLE[p.role] ?? p.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {active && m.join_url && <a href={m.join_url} target="_blank" className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><ExternalLink size={14} /> Entrar</a>}
                {active && m.join_url && <button onClick={copyLink} className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Copy size={14} /> Copiar link</button>}
                {m.status === 'scheduled' && <button onClick={cancel} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ml-auto disabled:opacity-50" style={{ color: 'var(--danger-border)' }}><X size={14} /> Cancelar reunião</button>}
                {m.status === 'ended' && <span className="text-[11px] self-center inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Clock size={11} /> Realizada</span>}
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
