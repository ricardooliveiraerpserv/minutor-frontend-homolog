'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { X, Clock, RefreshCw, User, Users, CalendarDays } from 'lucide-react'

// "Detalhes do ticket" — datas, tempo de vida (corrido/útil) e histórico com o TEMPO DE PERMANÊNCIA
// em cada etapa (status, responsável, equipe). Só leitura — agrega dos eventos no backend.

interface Seg { label: string; from: string | null; to: string | null; seconds: number; human: string; business_days: number; current: boolean; meta?: { color?: string | null } | null }
interface Details {
  dates: { opened_at: string | null; due_at: string | null; first_due_at: string | null; resolved_at: string | null; closed_at: string | null }
  life: { open: boolean; seconds: number; human: string; business_days: number }
  status_history: Seg[]; assignee_history: Seg[]; team_history: Seg[]; reopen_count: number
}

const fmt = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

function DateCell({ label, value, icon: Icon }: { label: string; value: string | null; icon: typeof Clock }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Icon size={11} /> {label}</div>
      <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{fmt(value)}</div>
    </div>
  )
}

function Timeline({ segs, color }: { segs: Seg[]; color?: boolean }) {
  if (!segs.length) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sem histórico.</p>
  const ordered = [...segs].reverse() // mais recente no topo
  return (
    <div>
      {ordered.map((s, i) => {
        const dot = (color && s.meta?.color) ? s.meta.color : (s.current ? 'var(--primary)' : 'var(--text-light)')
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: dot, boxShadow: s.current ? `0 0 0 3px ${dot}33` : 'none' }} />
              {i < ordered.length - 1 && <span className="w-px flex-1 my-1" style={{ background: 'var(--border)' }} />}
            </div>
            <div className="pb-4 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{s.label}{s.current && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>ATUAL</span>}</span>
                <span className="text-sm font-bold shrink-0" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{s.human}</span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                {fmt(s.from)} {s.to ? `→ ${fmt(s.to)}` : '→ agora'}{s.business_days > 0 ? ` · ${s.business_days} dia${s.business_days === 1 ? '' : 's'} útil${s.business_days === 1 ? '' : 'eis'}` : ''}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TicketDetailsModal({ ticketId, ticketNumber, onClose }: { ticketId: number; ticketNumber?: string | null; onClose: () => void }) {
  const [d, setD] = useState<Details | null>(null)
  const [tab, setTab] = useState<'resumo' | 'status' | 'responsavel' | 'equipe'>('resumo')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ data: Details }>(`/help-desk/tickets/${ticketId}/details`).then(r => setD(r?.data ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [ticketId])

  const tabs = [['resumo', 'Resumo'], ['status', 'Status'], ['responsavel', 'Responsável'], ['equipe', 'Equipe']] as const

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Clock size={15} style={{ color: 'var(--primary)' }} /> Detalhes do chamado <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{ticketNumber ?? `#${ticketId}`}</span>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {tabs.map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} className="text-xs font-semibold px-4 py-2.5 transition-colors"
              style={{ color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === k ? 'var(--primary)' : 'transparent'}`, marginBottom: -1 }}>{lbl}</button>
          ))}
        </div>
        <div className="p-4 max-h-[62vh] overflow-y-auto">
          {loading ? <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
            : !d ? <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Não foi possível carregar.</p>
            : tab === 'resumo' ? (
              <div className="space-y-3">
                <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: 'var(--primary-soft)' }}>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--primary)' }}>Tempo de vida {d.life.open ? '(em aberto)' : ''}</div>
                    <div className="text-2xl font-bold leading-tight" style={{ color: 'var(--primary)' }}>{d.life.human}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Dias úteis</div>
                    <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{d.life.business_days}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <DateCell label="Aberto em" value={d.dates.opened_at} icon={CalendarDays} />
                  <DateCell label="Vencimento (SLA)" value={d.dates.due_at} icon={Clock} />
                  <DateCell label="Resolvido em" value={d.dates.resolved_at} icon={CalendarDays} />
                  <DateCell label="Fechado em" value={d.dates.closed_at} icon={CalendarDays} />
                </div>
                {d.reopen_count > 0 && (
                  <div className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--warning-border)' }}><RefreshCw size={12} /> Reaberto {d.reopen_count}× ao longo do atendimento</div>
                )}
              </div>
            ) : tab === 'status' ? <Timeline segs={d.status_history} color />
            : tab === 'responsavel' ? <Timeline segs={d.assignee_history} />
            : <Timeline segs={d.team_history} />}
        </div>
        <div className="px-4 py-2 text-[11px] border-t inline-flex items-center gap-1.5" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
          {tab === 'responsavel' ? <User size={11} /> : tab === 'equipe' ? <Users size={11} /> : <Clock size={11} />}
          {tab === 'resumo' ? 'Corrido e em dias úteis (calendário da equipe).' : 'Tempo de permanência em cada etapa.'}
        </div>
      </div>
    </div>
  )
}
