'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Video, CalendarClock, ExternalLink } from 'lucide-react'

// Portal do cliente — reuniões dele (só visualizar + entrar). Escopo/segurança no backend.

interface Meeting {
  id: number; title: string; provider: string; status: string
  starts_at: string; ends_at: string | null; duration_minutes: number | null; join_url: string | null
}
const PROV: Record<string, string> = { teams: 'Teams', meet: 'Meet', zoom: 'Zoom', webex: 'Webex', presencial: 'Presencial' }
const ST: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Agendada', color: 'var(--primary)', bg: 'var(--primary-soft)' },
  live: { label: 'Em andamento', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  ended: { label: 'Realizada', color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
  canceled: { label: 'Cancelada', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function PortalReunioes() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ data: Meeting[] }>('/help-desk/portal/meetings').then(r => setMeetings(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const now = Date.now()
  const upcoming = meetings.filter(m => (m.status === 'scheduled' || m.status === 'live') && (!m.ends_at || new Date(m.ends_at).getTime() > now))
  const past = meetings.filter(m => !upcoming.includes(m))

  const row = (m: Meeting) => {
    const st = ST[m.status] ?? ST.scheduled
    const startMs = new Date(m.starts_at).getTime()
    const endMs = m.ends_at ? new Date(m.ends_at).getTime() : startMs + (m.duration_minutes ?? 30) * 60_000
    const joinable = m.status !== 'ended' && m.status !== 'canceled' && now >= startMs - 10 * 60_000 && now <= endMs
    return (
      <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <Video size={15} className="shrink-0" style={{ color: 'var(--primary)' }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{m.title}</div>
          <div className="text-[11px] inline-flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-flex items-center gap-1"><CalendarClock size={10} /> {fmt(m.starts_at)}</span>
            <span>· {PROV[m.provider] ?? m.provider}</span>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        {m.status !== 'ended' && m.status !== 'canceled' && (m.join_url
          ? <a href={m.join_url} target="_blank" className={joinable ? 'ds-btn-primary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1' : 'ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1'}><ExternalLink size={11} /> {joinable ? 'Entrar agora' : 'Entrar'}</a>
          : <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>sem link</span>)}
      </div>
    )
  }

  if (loading) return <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
  if (meetings.length === 0) return <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Você não tem reuniões.</p>

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>Próximas</div>
        <div className="ds-card overflow-hidden" style={{ padding: 0 }}>{upcoming.map(row)}</div>
      </div>}
      {past.length > 0 && <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>Histórico</div>
        <div className="ds-card overflow-hidden" style={{ padding: 0 }}>{past.map(row)}</div>
      </div>}
    </div>
  )
}
