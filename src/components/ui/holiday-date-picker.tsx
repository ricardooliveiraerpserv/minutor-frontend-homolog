'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from 'lucide-react'

export interface HolidayItem { date: string; name: string }

/** Parse "YYYY-MM-DD…" como meia-noite LOCAL (evita off-by-one de fuso). */
function parseLocal(v: string): Date {
  const [y, m, d] = v.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
/** Date → "YYYY-MM-DD" sem conversão de fuso (usa componentes locais). */
function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtBR(v: string): string {
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/**
 * Date picker do cronograma: marca fins de semana (esmaecidos) e feriados (vermelho
 * + nome no hover), considerando o cadastro de feriados. Emite "YYYY-MM-DD" sem
 * deslocar o dia pelo fuso. Dropdown via portal com flip-up (igual SearchSelect).
 */
export function HolidayDatePicker({
  value, onChange, holidays = [], allowWeekend, allowHoliday,
  placeholder = 'Definir', disabled, compact, width = 248,
}: {
  value: string | null
  onChange: (v: string | null) => void
  holidays?: HolidayItem[]
  allowWeekend?: boolean
  allowHoliday?: boolean
  placeholder?: string
  disabled?: boolean
  compact?: boolean
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>()
    holidays.forEach(h => m.set(h.date.slice(0, 10), h.name))
    return m
  }, [holidays])

  const selected = value ? parseLocal(value) : null
  const [view, setView] = useState(() => selected ?? new Date())
  useEffect(() => { if (open) setView(value ? parseLocal(value) : new Date()) }, [open, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true) }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (open) { setOpen(false); return }
    const r = btnRef.current!.getBoundingClientRect()
    const H = 320
    const left = Math.min(r.left, window.innerWidth - width - 8)
    const below = window.innerHeight - r.bottom
    setPos(below < H && r.top > below
      ? { bottom: window.innerHeight - r.top + 4, left: Math.max(8, left) }
      : { top: r.bottom + 4, left: Math.max(8, left) })
    setOpen(true)
  }

  // Sinaliza quando a data ESCOLHIDA cai em feriado/fim de semana (cor diferente no gatilho).
  const valDate = value ? parseLocal(value) : null
  const valDow = valDate ? valDate.getDay() : -1
  const valIsWeekend = valDow === 0 || valDow === 6
  const valIsHoliday = value ? holidayMap.has(value.slice(0, 10)) : false
  const valNonBusiness = !!value && (valIsWeekend || valIsHoliday)

  const y = view.getFullYear(), mo = view.getMonth()
  const startPad = new Date(y, mo, 1).getDay()
  const daysInMonth = new Date(y, mo + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const todayIso = iso(new Date())
  const pick = (d: Date) => { onChange(iso(d)); setOpen(false) }

  return (
    <>
      <button
        ref={btnRef} type="button" onClick={toggle} disabled={disabled}
        title={valNonBusiness ? (valIsHoliday ? 'Data em feriado' : 'Data em fim de semana') : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          cursor: disabled ? 'default' : 'pointer',
          fontSize: compact ? 12 : 13,
          color: value ? (valNonBusiness ? 'var(--warning)' : 'var(--text)') : (disabled ? 'var(--text-light)' : 'var(--primary)'),
          fontWeight: valNonBusiness ? 600 : undefined,
          fontStyle: value ? 'normal' : 'italic',
          background: 'transparent', border: 'none', padding: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <CalIcon size={11} style={{ flexShrink: 0 }} />
        <span>{value ? fmtBR(value) : placeholder}</span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed', left: pos.left,
            ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
            width, zIndex: 9999, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,.3)', padding: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setView(new Date(y, mo - 1, 1))} style={navBtn}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{MONTHS[mo]} {y}</span>
            <button type="button" onClick={() => setView(new Date(y, mo + 1, 1))} style={navBtn}><ChevronRight size={14} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
            {WD.map((w, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{w}</div>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const di = iso(d)
              const dow = d.getDay()
              const isWeekend = dow === 0 || dow === 6
              const holName = holidayMap.get(di)
              const isHoliday = !!holName
              const isSel = !!value && di === value.slice(0, 10)
              const isToday = di === todayIso
              const nonBiz = (isWeekend && !allowWeekend) || (isHoliday && !allowHoliday)
              const color = isSel ? '#fff' : isHoliday ? 'var(--danger)' : isWeekend ? 'var(--text-light)' : 'var(--text)'
              return (
                <button
                  key={i} type="button"
                  onClick={() => { if (!nonBiz) pick(d) }}
                  disabled={nonBiz && !isSel}
                  title={
                    isHoliday ? `Feriado: ${holName}${nonBiz ? ' — bloqueado (libere nas Configurações)' : ''}`
                    : isWeekend ? `Fim de semana${nonBiz ? ' — bloqueado (libere nas Configurações)' : ''}`
                    : undefined
                  }
                  style={{
                    height: 28, borderRadius: 6, fontSize: 12,
                    cursor: nonBiz && !isSel ? 'not-allowed' : 'pointer',
                    border: isToday && !isSel ? '1px solid var(--primary)' : '1px solid transparent',
                    background: isSel ? 'var(--primary)' : 'transparent',
                    color, fontWeight: isSel || isToday ? 600 : 400,
                    opacity: nonBiz && !isSel ? 0.4 : 1,
                    position: 'relative',
                  }}
                >
                  {d.getDate()}
                  {isHoliday && !isSel && (
                    <span style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: 'var(--danger)' }} />
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={() => { onChange(null); setOpen(false) }} style={linkBtn}>Limpar</button>
            <button type="button" onClick={() => { onChange(iso(new Date())); setOpen(false) }} style={linkBtn}>Hoje</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

const navBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex' }
const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, padding: 0 }
