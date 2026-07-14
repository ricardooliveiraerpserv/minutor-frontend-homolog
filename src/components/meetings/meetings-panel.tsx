'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { AgendarReuniaoModal } from '@/components/help-desk/agendar-reuniao-modal'
import { Video, CalendarClock, Users, ExternalLink, X, Plus } from 'lucide-react'

// Painel de reuniões de UMA origem (projeto/cliente/contrato/chamado). Lista + agendar + cancelar.
// Reusa AgendarReuniaoModal (origin-agnostic) e o endpoint /meetings.

interface Meeting {
  id: number; title: string; provider: string; status: string
  starts_at: string; duration_minutes: number | null; join_url: string | null
  participants: { name: string | null }[]
}
const PROV: Record<string, string> = { teams: 'Teams', meet: 'Meet', zoom: 'Zoom', webex: 'Webex', presencial: 'Presencial' }
const ST: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Agendada', color: 'var(--primary)', bg: 'var(--primary-soft)' },
  live: { label: 'Em andamento', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  ended: { label: 'Realizada', color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
  canceled: { label: 'Cancelada', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function MeetingsPanel({ originType, originId, originTitle, canCreate = true }: {
  originType: string; originId: number; originTitle?: string; canCreate?: boolean
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Meeting[] }>(`/meetings?origin_type=${originType}&origin_id=${originId}`)
      .then(r => setMeetings(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [originType, originId])
  useEffect(() => { load() }, [load])

  const cancelMeeting = async (m: Meeting) => {
    if (!confirm(`Cancelar "${m.title}"?`)) return
    try { await api.post(`/meetings/${m.id}/cancel`, {}); toast.success('Cancelada.'); load() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  const upcoming = meetings.filter(m => m.status === 'scheduled' || m.status === 'live')
  const past = meetings.filter(m => m.status === 'ended' || m.status === 'canceled')

  const row = (m: Meeting) => {
    const st = ST[m.status] ?? ST.scheduled
    const active = m.status === 'scheduled' || m.status === 'live'
    return (
      <div key={m.id} className="flex items-center gap-3 px-3 py-2 border-t ds-row-hover" style={{ borderColor: 'var(--border)' }}>
        <Video size={15} className="shrink-0" style={{ color: active ? 'var(--primary)' : 'var(--text-light)' }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{m.title}</div>
          <div className="text-[11px] inline-flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-flex items-center gap-1"><CalendarClock size={10} /> {fmt(m.starts_at)}</span>
            <span>· {PROV[m.provider] ?? m.provider}</span>
            {m.participants.length > 0 && <span className="inline-flex items-center gap-0.5"><Users size={10} /> {m.participants.length}</span>}
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        {active && (m.join_url
          ? <a href={m.join_url} target="_blank" className="ds-btn-secondary text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1"><ExternalLink size={11} /> Entrar</a>
          : <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>sem link</span>)}
        {m.status === 'scheduled' && <button onClick={() => cancelMeeting(m)} title="Cancelar"><X size={14} style={{ color: 'var(--text-light)' }} /></button>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm" onClick={() => setOpen(true)}>
          <Plus size={15} /> Agendar reunião
        </button>
      )}

      {loading ? <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
        : meetings.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhuma reunião ainda.</p>
        : (
          <>
            {upcoming.length > 0 && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Próximas</div>
              <div className="ds-card overflow-hidden" style={{ padding: 0 }}>{upcoming.map(row)}</div>
            </div>}
            {past.length > 0 && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-1 mt-3" style={{ color: 'var(--text-light)' }}>Histórico</div>
              <div className="ds-card overflow-hidden" style={{ padding: 0 }}>{past.map(row)}</div>
            </div>}
          </>
        )}

      {open && <AgendarReuniaoModal originType={originType} originId={originId}
        defaultTitle={originTitle ? `Reunião — ${originTitle}` : ''}
        onClose={() => setOpen(false)} onCreated={load} />}
    </div>
  )
}
