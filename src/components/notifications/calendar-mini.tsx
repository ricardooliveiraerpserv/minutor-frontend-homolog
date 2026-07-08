'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CalEventoConvidado { nome: string; email?: string; resposta: string } // resposta: accepted|declined|tentativelyAccepted|notResponded|none
export interface CalEvento {
  tipo: 'birthday' | 'contract_expiration' | 'reajuste' | 'outlook' | 'task' | 'holiday'
  data: string; titulo: string; is_today: boolean
  hora?: string | null; hora_fim?: string | null      // Outlook: início / fim
  local?: string; link?: string; organizador?: string // Outlook: local, link (Teams/web), quem convidou
  convidados?: CalEventoConvidado[]                    // Outlook: quem aceitou/recusou
}

export const DOT: Record<CalEvento['tipo'], { color: string; icon: string; label: string }> = {
  birthday:            { color: '#a855f7', icon: '🎂', label: 'Aniversário' },   // roxo
  reajuste:            { color: '#eab308', icon: '💰', label: 'Reajuste' },       // amarelo
  contract_expiration: { color: '#ef4444', icon: '📄', label: 'Vencimento' },     // vermelho
  outlook:             { color: '#06b6d4', icon: '📅', label: 'Outlook' },         // ciano
  task:                { color: '#22c55e', icon: '📝', label: 'Tarefa' },          // verde
  holiday:             { color: '#f97316', icon: '🏖️', label: 'Feriado' },        // laranja
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const pad = (n: number) => String(n).padStart(2, '0')
const MAX_DOTS = 3

interface Tip { x: number; y: number; evs: CalEvento[] }

/** Grid mensal compacto (presentacional). Dots coloridos + "+N", tooltip no hover, destaque do dia. */
export function CalendarMini({ year, month, monthLabel, events, todayIso, selectedIso, onPrev, onNext, onSelect }: {
  year: number; month: number; monthLabel: string
  events: CalEvento[]; todayIso: string; selectedIso: string | null
  onPrev: () => void; onNext: () => void; onSelect: (iso: string) => void
}) {
  const [tip, setTip] = useState<Tip | null>(null)

  const firstWeekday = new Date(year, month - 1, 1).getDay()          // 0=Dom
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const eventsOf = (day: number) => events.filter(e => e.data === `${year}-${pad(month)}-${pad(day)}`)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrev} className="p-1 rounded-md" style={{ color: 'var(--text-muted)' }} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
        <span className="text-[13px] font-semibold capitalize" style={{ color: 'var(--text)' }}>{monthLabel} {year}</span>
        <button onClick={onNext} className="p-1 rounded-md" style={{ color: 'var(--text-muted)' }} aria-label="Próximo mês"><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold py-0.5" style={{ color: i === 0 || i === 6 ? '#f87171' : 'var(--text-light)' }}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const iso = `${year}-${pad(month)}-${pad(day)}`
          const evs = eventsOf(day)
          const isToday = iso === todayIso
          const isSelected = iso === selectedIso
          const tipos = Array.from(new Set(evs.map(e => e.tipo)))      // dot por tipo distinto
          const extra = evs.length - Math.min(evs.length, MAX_DOTS)
          const weekday = i % 7                                         // 0=Dom … 6=Sáb (grade começa no Domingo)
          const isWeekend = weekday === 0 || weekday === 6
          const isHoliday = evs.some(e => e.tipo === 'holiday')
          // Cor do dia: hoje > feriado (laranja) > fim de semana (vermelho suave) > normal.
          const dayColor = isToday ? 'var(--primary-fg)' : isHoliday ? '#f97316' : isWeekend ? '#f87171' : 'var(--text)'

          return (
            <button key={i} onClick={() => onSelect(iso)}
              onMouseEnter={e => { if (evs.length) { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, evs }) } }}
              onMouseLeave={() => setTip(null)}
              className="relative aspect-square flex flex-col items-center justify-center rounded-lg text-[12px]"
              style={{
                background: isToday ? 'var(--primary)' : isSelected ? 'var(--primary-soft)' : isHoliday && !isSelected ? 'color-mix(in srgb, #f97316 12%, transparent)' : 'transparent',
                color: dayColor,
                border: isSelected && !isToday ? '1px solid var(--primary)' : '1px solid transparent',
                cursor: evs.length ? 'pointer' : 'default',
                fontWeight: isToday || isHoliday ? 700 : isWeekend ? 600 : 400,
              }}>
              <span className="leading-none">{day}</span>
              {tipos.length > 0 && (
                <span className="absolute bottom-0.5 flex items-center gap-0.5">
                  {tipos.slice(0, MAX_DOTS).map(t => (
                    <span key={t} style={{ width: 4, height: 4, borderRadius: 999, background: isToday ? 'var(--primary-fg)' : DOT[t].color, display: 'inline-block' }} />
                  ))}
                  {extra > 0 && <span className="text-[8px] font-bold leading-none" style={{ color: isToday ? 'var(--primary-fg)' : 'var(--text-light)' }}>+{extra}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tooltip do dia (hover) — posicionado em fixed p/ não ser cortado */}
      {tip && (
        <div className="fixed z-[70] -translate-x-1/2 -translate-y-full pointer-events-none rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{ left: tip.x, top: tip.y - 6, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 120, maxWidth: 220 }}>
          {tip.evs.map((e, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--text)' }}>
              <span>{DOT[e.tipo].icon}</span>
              <span className="truncate">{e.titulo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
