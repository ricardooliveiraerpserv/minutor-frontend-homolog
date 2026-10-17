'use client'

import { useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { BarChart3, CheckCircle2, Lock, Pencil } from 'lucide-react'

export interface PollOption { id: number; label: string; order: number; votes: number; percent: number; mine: boolean }
export interface Poll {
  poll_id: number; notification_id: number; question: string
  multiple_choice: boolean; allow_change_vote: boolean; show_results: boolean; expires_at: string | null; closed: boolean
  options: PollOption[]; total_votes: number; has_voted: boolean; my_option_ids: number[]
}

const PRIO: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Crítico', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
  high:     { label: 'Alta',    color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  medium:   { label: 'Média',   color: 'var(--primary)', bg: 'var(--primary-soft)' },
  low:      { label: 'Baixa',   color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
}

/** Card de enquete: antes do voto mostra opções (radio/checkbox); depois, resultados em %. */
export function PollCard({ title, priority, poll: initial }: { title: string; priority: string; poll: Poll }) {
  const [poll, setPoll] = useState<Poll>(initial)
  const [sel, setSel] = useState<number[]>(initial.my_option_ids ?? [])
  const [editing, setEditing] = useState<boolean>(!initial.has_voted)
  const [saving, setSaving] = useState(false)
  const p = PRIO[priority] ?? PRIO.medium

  // Resultados só aparecem se a enquete permitir acompanhar (show_results).
  const showResults = useMemo(() => (poll.has_voted || poll.closed) && poll.show_results, [poll])
  // Votou numa enquete SEM acompanhamento → só confirmação, sem ver a enquete/resultado.
  const votedNoResults = poll.has_voted && !poll.show_results && !editing
  const votingDisabled = poll.closed

  const toggle = (id: number) => {
    if (poll.multiple_choice) setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    else setSel([id])
  }

  const vote = async () => {
    if (sel.length === 0) return toast.error('Selecione uma opção.')
    setSaving(true)
    try {
      const body = poll.multiple_choice ? { option_ids: sel } : { option_id: sel[0] }
      const r = await api.post<{ data: Poll }>(`/polls/${poll.poll_id}/vote`, body)
      setPoll(r.data); setEditing(false); toast.success('Voto registrado')
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao votar') } finally { setSaving(false) }
  }

  // Enquete sem acompanhamento e já votada: só confirmação, some o resto.
  if (votedNoResults) {
    return (
      <div className="ds-card p-2.5 flex items-center gap-2.5" style={{ borderLeft: `3px solid ${p.color}` }}>
        <CheckCircle2 size={18} style={{ color: 'var(--success-border)' }} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Voto registrado. Obrigado por participar! 🎉</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ds-card p-2.5" style={{ borderLeft: `3px solid ${p.color}`, maxHeight: 180 }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <BarChart3 size={14} style={{ color: 'var(--primary)' }} />
        <span className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{title}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: p.bg, color: p.color }}>{p.label}</span>
        {!poll.has_voted && !poll.closed && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Nova</span>}
        {poll.closed && <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: 'var(--text-light)' }}><Lock size={10} /> Encerrada</span>}
        {poll.show_results && <span className="text-[11px] ml-auto" style={{ color: 'var(--text-light)' }}>{poll.total_votes} voto{poll.total_votes === 1 ? '' : 's'}</span>}
      </div>

      <p className="text-[13px] mt-0.5 font-medium truncate" style={{ color: 'var(--text)' }}>{poll.question}</p>

      <div className="mt-1.5 space-y-1 overflow-auto" style={{ maxHeight: 96 }}>
        {poll.options.map(o => {
          if (showResults && !editing) {
            // RESULTADO — barra com % e destaque da escolha
            return (
              <div key={o.id} className="relative rounded-lg overflow-hidden" style={{ border: `1px solid ${o.mine ? 'var(--primary)' : 'var(--border)'}`, background: 'var(--surface)' }}>
                <div className="absolute inset-y-0 left-0" style={{ width: `${o.percent}%`, background: o.mine ? 'var(--primary-soft)' : 'var(--surface-sunken)' }} />
                <div className="relative flex items-center gap-2 px-2 py-1">
                  {o.mine && <CheckCircle2 size={12} style={{ color: 'var(--primary)' }} />}
                  <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--text)', fontWeight: o.mine ? 600 : 400 }}>{o.label}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.percent}%</span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-light)' }}>({o.votes})</span>
                </div>
              </div>
            )
          }
          // VOTAÇÃO — radio/checkbox
          const on = sel.includes(o.id)
          return (
            <button key={o.id} type="button" disabled={votingDisabled} onClick={() => toggle(o.id)}
              className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[12px]"
              style={{ border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'var(--surface)', color: 'var(--text)' }}>
              <span className="inline-flex items-center justify-center shrink-0" style={{ width: 14, height: 14, borderRadius: poll.multiple_choice ? 4 : 999, border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary)' : 'transparent' }}>
                {on && <CheckCircle2 size={10} style={{ color: 'var(--primary-fg)' }} />}
              </span>
              <span className="truncate">{o.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        {(!showResults || editing) && !poll.closed && (
          <button onClick={vote} disabled={saving} className="inline-flex items-center justify-center h-8 px-4 rounded-lg text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Votar</button>
        )}
        {showResults && !editing && poll.allow_change_vote && !poll.closed && (
          <button onClick={() => { setSel(poll.my_option_ids); setEditing(true) }} className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-lg text-xs" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Pencil size={12} /> Alterar voto</button>
        )}
        {editing && poll.has_voted && (
          <button onClick={() => setEditing(false)} className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
        )}
        {poll.expires_at && <span className="text-[10px] ml-auto" style={{ color: 'var(--text-light)' }}>até {new Date(poll.expires_at).toLocaleDateString('pt-BR')}</span>}
      </div>
    </div>
  )
}
