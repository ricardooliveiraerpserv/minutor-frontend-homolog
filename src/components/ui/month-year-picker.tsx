'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function MonthYearPicker({ month, year, onChange, placeholder = 'Mês/Ano' }: {
  month: number | null   // 1-12
  year:  number | null
  onChange: (month: number, year: number) => void
  placeholder?: string
}) {
  const [open,      setOpen]      = useState(false)
  const [navYear,   setNavYear]   = useState(() => year ?? new Date().getFullYear())
  const [pos,       setPos]       = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const ref    = useRef<HTMLDivElement>(null)

  const hasValue = month !== null && year !== null
  const displayText = hasValue ? `${MONTHS_FULL_PT[month! - 1]} ${year}` : placeholder

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const dropW = 224
    const left = Math.min(r.left, window.innerWidth - dropW - 8)
    setPos({ top: r.bottom + 4, left: Math.max(8, left) })
    setNavYear(year ?? new Date().getFullYear())
    setOpen(true)
  }

  const select = (m: number) => {
    onChange(m, navYear)
    setOpen(false)
  }

  const now = new Date()
  const todayM = now.getMonth() + 1
  const todayY = now.getFullYear()

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle}
        className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs outline-none whitespace-nowrap"
        style={{
          background: 'var(--brand-bg)',
          border: `1px solid ${hasValue ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
          color: hasValue ? 'var(--brand-text)' : 'var(--brand-subtle)',
        }}>
        <CalendarDays size={13} style={{ color: hasValue ? 'var(--brand-primary)' : 'var(--brand-subtle)', flexShrink: 0 }} />
        <span>{displayText}</span>
        {hasValue && (
          <span onClick={e => { e.stopPropagation(); onChange(0, 0) }}
            className="ml-1 cursor-pointer" style={{ color: 'var(--brand-subtle)' }}>
            <X size={10} />
          </span>
        )}
      </button>

      {open && pos && (
        <div ref={ref}
          className="rounded-xl shadow-2xl p-3 w-56"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setNavYear(y => y - 1)}
              className="p-1 rounded" style={{ color: 'var(--brand-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-subtle)')}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>{navYear}</span>
            <button type="button" onClick={() => setNavYear(y => y + 1)}
              className="p-1 rounded" style={{ color: 'var(--brand-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-subtle)')}>
              <ChevronRight size={14} />
            </button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {MONTHS_PT.map((m, i) => {
              const mNum = i + 1
              const isSelected = mNum === month && navYear === year
              const isToday    = mNum === todayM && navYear === todayY
              return (
                <button key={m} type="button" onClick={() => select(mNum)}
                  className="py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: isSelected ? 'var(--brand-primary)' : isToday ? 'var(--primary-soft)' : undefined,
                    color: isSelected ? '#0A0A0B' : isToday ? 'var(--brand-primary)' : 'var(--brand-text)',
                    border: isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                  }}>
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
