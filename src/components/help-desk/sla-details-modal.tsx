'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { X, Gauge, CalendarClock, Timer, PauseCircle, CalendarDays, Bell, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'

// "Detalhes do SLA" — política aplicada, calendário/prioridade, prazos EFETIVOS (descontando
// pausas/agendamentos) com barra de consumo verde/amarelo/vermelho + situação, e alertas
// automáticos configurados. Só leitura — agrega no backend (HelpDeskSlaService::summary).

interface Meta {
  key: string; label: string; applies: boolean
  target_minutes: number | null; due_at: string | null
  done: boolean; done_at: string | null; breached: boolean
  minutes_left: number | null
  situacao: string; severity: 'ok' | 'warning' | 'danger' | 'none'; progress: number | null
}
interface Sla {
  policy: { name: string; description: string | null; source: string | null; timezone: string; calendar_mode: 'util' | 'corrido'; hours_label: string; national_holidays: boolean; holidays_count: number } | null
  target: { name: string | null; priority: string; first_response_minutes: number | null; resolution_minutes: number | null } | null
  priority: string
  metas: Meta[]
  paused: boolean; scheduled: boolean; scheduled_until: string | null; scheduled_all_day: boolean
  alerts: { name: string; event: string }[]
}

const PRIO: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// "4h", "48h", "2d 4h" a partir de minutos absolutos.
function fmtMins(m: number): string {
  m = Math.abs(Math.round(m))
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60), mm = m % 60
  if (h < 24) return `${h}h${mm ? ` ${mm}min` : ''}`
  const d = Math.floor(h / 24), hh = h % 24
  return `${d}d${hh ? ` ${hh}h` : ''}`
}

const SEV = {
  ok: { color: 'var(--success-border)', bg: 'var(--success-bg)', Icon: ShieldCheck },
  warning: { color: 'var(--warning-border)', bg: 'var(--warning-bg)', Icon: ShieldAlert },
  danger: { color: 'var(--danger-border)', bg: 'var(--danger-bg)', Icon: ShieldX },
  none: { color: 'var(--text-light)', bg: 'var(--surface-sunken)', Icon: ShieldCheck },
} as const

function MetaCard({ m }: { m: Meta }) {
  const sev = SEV[m.severity]
  const Ico = sev.Icon
  const pct = Math.round((m.progress ?? 0) * 100)
  const left = m.minutes_left
  const remainLabel = m.done ? 'Cumprido'
    : left == null ? '—'
    : left < 0 ? `Vencido há ${fmtMins(left)}`
    : `Faltam ${fmtMins(left)}`

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
          {m.key === 'first' ? <Timer size={13} style={{ color: 'var(--text-light)' }} /> : <Gauge size={13} style={{ color: 'var(--text-light)' }} />}
          {m.label}
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: sev.bg, color: sev.color }}>
          <Ico size={11} /> {m.situacao}
        </span>
      </div>

      {m.applies ? (
        <>
          <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: sev.color }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              Prazo: <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{fmtDate(m.due_at)}</span>
              {m.target_minutes != null && <span> · meta {fmtMins(m.target_minutes)}</span>}
            </span>
            <span className="text-[11px] font-bold" style={{ color: sev.color, fontVariantNumeric: 'tabular-nums' }}>{remainLabel}</span>
          </div>
        </>
      ) : (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-light)' }}>Sem SLA de {m.label.toLowerCase()} para esta prioridade/canal.</p>
      )}
    </div>
  )
}

export function SlaDetailsModal({ ticketId, ticketNumber, onClose }: { ticketId: number; ticketNumber?: string | null; onClose: () => void }) {
  const [d, setD] = useState<Sla | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ data: Sla }>(`/help-desk/tickets/${ticketId}/sla`).then(r => setD(r?.data ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [ticketId])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Gauge size={15} style={{ color: 'var(--primary)' }} /> Detalhes do SLA <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{ticketNumber ?? `#${ticketId}`}</span>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="p-4 max-h-[68vh] overflow-y-auto space-y-3">
          {loading ? <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
            : !d ? <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Não foi possível carregar.</p>
            : !d.policy ? <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhuma política de SLA aplicada a este chamado.</p>
            : (
              <>
                {/* Pausa / agendamento */}
                {(d.paused || d.scheduled) && (
                  <div className="rounded-lg px-3 py-2 text-xs inline-flex items-center gap-1.5 w-full" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>
                    <PauseCircle size={13} />
                    {d.paused ? 'SLA pausado — o relógio está congelado neste status.'
                      : `Agendado até ${d.scheduled_all_day ? new Date(d.scheduled_until!).toLocaleDateString('pt-BR') : fmtDate(d.scheduled_until)} — prazo empurrado.`}
                  </div>
                )}

                {/* Política aplicada */}
                <div className="rounded-lg p-3" style={{ background: 'var(--primary-soft)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{d.policy.name}</span>
                    {d.policy.source && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{d.policy.source}</span>}
                  </div>
                  {d.policy.description && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{d.policy.description}</p>}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5">
                    <Info icon={CalendarClock} label="Expediente" value={d.policy.hours_label} />
                    <Info icon={Gauge} label="Prioridade" value={PRIO[d.priority] ?? d.priority} />
                    <Info icon={CalendarDays} label="Fuso" value={d.policy.timezone.replace('America/', '')} />
                    <Info icon={CalendarDays} label="Feriados" value={d.policy.national_holidays ? `Nacionais (${d.policy.holidays_count})` : 'Não considera'} />
                  </div>
                </div>

                {/* Metas de SLA */}
                <div className="space-y-2">
                  {d.metas.map(m => <MetaCard key={m.key} m={m} />)}
                </div>

                {/* Alertas automáticos */}
                {d.alerts.length > 0 && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide inline-flex items-center gap-1 mb-1.5" style={{ color: 'var(--text-light)' }}><Bell size={11} /> Alertas automáticos</div>
                    {d.alerts.map((a, i) => (
                      <div key={i} className="text-xs py-0.5" style={{ color: 'var(--text-muted)' }}>• {a.name}</div>
                    ))}
                  </div>
                )}
              </>
            )}
        </div>

        <div className="px-4 py-2 text-[11px] border-t inline-flex items-center gap-1.5" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
          <CalendarClock size={11} /> Prazos efetivos, já descontando pausas e agendamentos.
        </div>
      </div>
    </div>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Icon size={10} /> {label}</div>
      <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
