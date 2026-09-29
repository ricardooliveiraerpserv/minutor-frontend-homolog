'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { X, Clock, User, CalendarDays, ExternalLink, CheckCircle2 } from 'lucide-react'

// "Ver apontamentos" — listagem COMPLETA de horas apontadas no chamado (uma linha por interação
// com tempo): data, intervalo, duração, consultor, cobrável, vínculo com a tela de Apontamentos.

interface Item {
  id: number; date: string | null; start: string | null; end: string | null
  minutes: number; duration: string; consultant: string; consultant_id: number | null
  no_charge: boolean; solution: boolean; visibility: string; timesheet_id: number | null
}
interface Data {
  items: Item[]; total_minutes: number; total_duration: string
  billable_minutes: number; billable_duration: string; count: number
  by_consultant: { name: string; minutes: number; duration: string }[]
  scope?: 'all' | 'own'
}

const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export function ApontamentosModal({ ticketId, ticketNumber, onClose }: { ticketId: number; ticketNumber?: string | null; onClose: () => void }) {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ data: Data }>(`/help-desk/tickets/${ticketId}/apontamentos`).then(r => setD(r?.data ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [ticketId])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[7vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-2xl overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2 flex-wrap" style={{ color: 'var(--text)' }}>
            <Clock size={15} style={{ color: 'var(--primary)' }} /> Apontamentos do chamado <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{ticketNumber ?? `#${ticketId}`}</span>
            {d?.scope === 'own' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Somente os seus</span>}
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        {loading ? <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
          : !d ? <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Não foi possível carregar.</p>
          : (
            <>
              {/* Totais */}
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <Stat label="Total apontado" value={d.total_duration} accent />
                <Stat label="Cobrável" value={d.billable_duration} />
                <Stat label="Interações" value={String(d.count)} />
              </div>

              {/* Por consultor */}
              {d.by_consultant.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  {d.by_consultant.map((c, i) => (
                    <span key={i} className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                      <User size={11} /> {c.name} · <b style={{ color: 'var(--text)' }}>{c.duration}</b>
                    </span>
                  ))}
                </div>
              )}

              {/* Lista */}
              <div className="max-h-[52vh] overflow-y-auto">
                {d.items.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>Nenhuma hora apontada nas interações.</p>
                ) : d.items.map(it => (
                  <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 border-b ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                    <div className="w-16 shrink-0">
                      <div className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--text)' }}><CalendarDays size={11} style={{ color: 'var(--text-light)' }} /> {fmtDate(it.date)}</div>
                      {(it.start || it.end) && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)', fontVariantNumeric: 'tabular-nums' }}>{it.start ?? '—'}–{it.end ?? '—'}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                        <User size={12} style={{ color: 'var(--text-light)' }} /> {it.consultant}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {it.solution && <Tag color="var(--success-border)" bg="var(--success-bg)"><CheckCircle2 size={9} /> Solução</Tag>}
                        {it.visibility === 'internal' && <Tag color="var(--text-muted)" bg="var(--surface-sunken)">Interno</Tag>}
                        {it.no_charge && <Tag color="var(--warning-border)" bg="var(--warning-bg)">Não cobrável</Tag>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold" style={{ color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{it.duration}</div>
                      {it.timesheet_id
                        ? <Link href={`/timesheets/${it.timesheet_id}`} className="text-[10px] inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--text-light)' }}>Apontamento <ExternalLink size={9} /></Link>
                        : <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>na interação</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        <div className="px-4 py-2 text-[11px] border-t inline-flex items-center gap-1.5" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
          <Clock size={11} /> Uma linha por interação com tempo apontado.
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: accent ? 'var(--primary-soft)' : 'var(--surface-sunken)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: accent ? 'var(--primary)' : 'var(--text-light)' }}>{label}</div>
      <div className="text-lg font-bold leading-tight" style={{ color: accent ? 'var(--primary)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function Tag({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ color, background: bg }}>{children}</span>
}
