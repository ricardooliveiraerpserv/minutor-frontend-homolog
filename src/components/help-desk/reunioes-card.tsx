'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Video, CalendarClock, Copy, X, CheckCircle2, Users, ExternalLink, Clock, FileText, MessageSquarePlus, Save, Sparkles } from 'lucide-react'

// Card de reunião no chamado: mostra a PRÓXIMA reunião (entrar/copiar/cancelar; "Entrar agora" no
// horário) ou, se não houver futura, a última REALIZADA. Fase 0 — provider ainda no-op.
// Reunião realizada: registrar no chamado (reusa interação do HD) + Resumo/Ata (Fase 4).

interface Meeting {
  id: number; title: string; provider: string; status: string
  starts_at: string; ends_at: string | null; duration_minutes: number | null
  join_url: string | null; participants: { name: string | null; email: string | null }[]
  summary?: string | null; ata?: string | null; transcript?: string | null; ai_enabled?: boolean
}
const PROV: Record<string, string> = { teams: 'Microsoft Teams', meet: 'Google Meet', zoom: 'Zoom', webex: 'Webex', presencial: 'Presencial' }
const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function ReunioesCard({ ticketId, refreshKey, onTicketChange, onSchedule }: { ticketId: number; refreshKey: number; onTicketChange?: () => void; onSchedule?: () => void }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [tick, setTick] = useState(0) // re-render por minuto p/ "Entrar agora"
  const [notesOpen, setNotesOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [ata, setAta] = useState('')
  const [transcript, setTranscript] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    api.get<{ data: Meeting[] }>(`/meetings?origin_type=HELPDESK_TICKET&origin_id=${ticketId}`)
      .then(r => setMeetings(r?.data ?? [])).catch(() => {})
  }, [ticketId])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60_000); return () => clearInterval(t) }, [])

  const now = Date.now(); void tick
  const upcoming = meetings
    .filter(m => m.status === 'scheduled' || m.status === 'live')
    .filter(m => !m.ends_at || new Date(m.ends_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]
  const done = meetings.filter(m => m.status === 'ended').sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0]
  const m = upcoming ?? done

  // Sem reunião ainda: mostra um call-to-action pra agendar (senão o botão só existe no menu Opções).
  if (!m) {
    if (!onSchedule) return null
    return (
      <button onClick={onSchedule} className="ds-card p-3 w-full flex items-center gap-2.5 ds-row-hover text-left" style={{ borderStyle: 'dashed' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-sunken)' }}>
          <Video size={16} style={{ color: 'var(--primary)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Agendar reunião</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Teams, Meet ou presencial — vinculada a este chamado</div>
        </div>
        <span className="ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1 shrink-0"><CalendarClock size={12} /> Agendar</span>
      </button>
    )
  }

  const isDone = !upcoming && !!done
  const startMs = new Date(m.starts_at).getTime()
  const endMs = m.ends_at ? new Date(m.ends_at).getTime() : startMs + (m.duration_minutes ?? 30) * 60_000
  const joinable = !isDone && now >= startMs - 10 * 60_000 && now <= endMs // janela: 10min antes até o fim

  const copyLink = () => { if (m.join_url) { navigator.clipboard.writeText(m.join_url); toast.success('Link copiado.') } else toast.message('Sem link do Teams — conecte sua conta Microsoft no Meu Dia para gerar automaticamente.') }
  const cancelMeeting = async () => {
    if (!confirm(`Cancelar a reunião "${m.title}"?`)) return
    try { await api.post(`/meetings/${m.id}/cancel`, {}); toast.success('Reunião cancelada.'); load(); onTicketChange?.() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  const logHours = async () => {
    const mins = m.duration_minutes ?? 30
    if (!confirm(`Apontar ${mins} min desta reunião como horas trabalhadas?`)) return
    try { await api.post(`/meetings/${m.id}/log-hours`, {}); toast.success('Horas apontadas.') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao apontar horas') }
  }
  const noteToTicket = async () => {
    try { await api.post(`/meetings/${m.id}/note-to-ticket`, {}); toast.success('Reunião registrada no chamado.'); onTicketChange?.() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao registrar') }
  }
  const openNotes = () => { setSummary(m.summary ?? ''); setAta(m.ata ?? ''); setTranscript(m.transcript ?? ''); setNotesOpen(o => !o) }
  const saveNotes = async () => {
    setSaving(true)
    try {
      if (summary.trim()) await api.post(`/meetings/${m.id}/summary`, { summary: summary.trim() })
      if (ata.trim()) await api.post(`/meetings/${m.id}/ata`, { ata: ata.trim() })
      toast.success('Resumo/Ata salvos.'); setNotesOpen(false); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') }
    finally { setSaving(false) }
  }
  const generateWithAi = async () => {
    if (!transcript.trim()) { toast.message('Cole a transcrição da reunião primeiro.'); return }
    setGenerating(true)
    try {
      const r = await api.post<{ data: { summary: string; ata: string } }>(`/meetings/${m.id}/generate-notes`, { transcript: transcript.trim() })
      setSummary(r?.data?.summary ?? ''); setAta(r?.data?.ata ?? '')
      toast.success('Resumo e ata gerados. Revise e salve se quiser ajustar.'); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao gerar com IA') }
    finally { setGenerating(false) }
  }

  return (
    <div className="ds-card p-3" style={{ borderColor: isDone ? 'var(--border)' : 'var(--primary)', background: isDone ? 'var(--surface)' : 'var(--primary-soft)' }}>
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isDone ? 'var(--surface-sunken)' : 'var(--primary)' }}>
          {isDone ? <CheckCircle2 size={16} style={{ color: 'var(--success-border)' }} /> : <Video size={16} style={{ color: 'var(--primary-fg)' }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: isDone ? 'var(--text-light)' : 'var(--primary)' }}>
            {isDone ? 'Reunião realizada' : (m.status === 'live' ? 'Reunião em andamento' : 'Próxima reunião')}
          </div>
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{m.title}</div>
          <div className="text-[11px] mt-0.5 inline-flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> {fmt(m.starts_at)}</span>
            <span>· {PROV[m.provider] ?? m.provider}</span>
            {isDone && m.duration_minutes && <span>· {m.duration_minutes} min</span>}
            {m.participants.length > 0 && <span className="inline-flex items-center gap-1"><Users size={11} /> {m.participants.length}</span>}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {!isDone && (joinable
              ? <a href={m.join_url || '#'} target="_blank" className="ds-btn-primary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1"><ExternalLink size={12} /> Entrar agora</a>
              : m.join_url
                ? <a href={m.join_url} target="_blank" className="ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1"><ExternalLink size={12} /> Entrar</a>
                : <span className="text-[11px] px-2 py-1" style={{ color: 'var(--text-light)' }}>sem link — conecte o Teams no Meu Dia</span>)}
            {!isDone && <button onClick={copyLink} className="ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1"><Copy size={12} /> Copiar link</button>}
            {!isDone && <button onClick={cancelMeeting} className="text-xs px-3 py-1 rounded-md inline-flex items-center gap-1" style={{ color: 'var(--danger-border)' }}><X size={12} /> Cancelar</button>}
            {isDone && <button onClick={logHours} className="ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1"><Clock size={12} /> Apontar horas</button>}
            {isDone && <button onClick={noteToTicket} className="ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1"><MessageSquarePlus size={12} /> Registrar no chamado</button>}
            {isDone && <button onClick={openNotes} className="ds-btn-secondary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1"><FileText size={12} /> Resumo / Ata</button>}
          </div>

          {isDone && notesOpen && (
            <div className="mt-2.5 space-y-2 rounded-lg p-2.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
              {m.ai_enabled && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Transcrição</label>
                    <button onClick={generateWithAi} disabled={generating || !transcript.trim()} className="ds-btn-secondary text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-1 disabled:opacity-50">
                      <Sparkles size={11} style={{ color: 'var(--primary)' }} /> {generating ? 'Gerando…' : 'Gerar resumo e ata com IA'}
                    </button>
                  </div>
                  <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={3} placeholder="Cole a transcrição do Teams aqui (a IA gera o resumo e a ata a partir dela)…" className="ds-input w-full text-sm mt-0.5" />
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Resumo</label>
                <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="Principais pontos da reunião…" className="ds-input w-full text-sm mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Ata / decisões</label>
                <textarea value={ata} onChange={e => setAta(e.target.value)} rows={4} placeholder="Decisões, responsáveis, próximos passos…" className="ds-input w-full text-sm mt-0.5" />
              </div>
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setNotesOpen(false)} className="text-xs px-3 py-1 rounded-md" style={{ color: 'var(--text-muted)' }}>Fechar</button>
                <button onClick={saveNotes} disabled={saving || (!summary.trim() && !ata.trim())} className="ds-btn-primary text-xs px-3 py-1 rounded-md inline-flex items-center gap-1 disabled:opacity-50"><Save size={12} /> {saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
