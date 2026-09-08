'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ordinal de um mês (p/ comparar/ordenar seleção que cruza anos)
const ord = (m: number, y: number) => y * 12 + (m - 1)

export function MonthYearPicker({ month, year, onChange, placeholder = 'Mês/Ano',
  endMonth = null, endYear = null, onRangeChange }: {
  month: number | null   // 1-12
  year:  number | null
  onChange: (month: number, year: number) => void
  placeholder?: string
  // ── Modo RANGE (opcional): passe onRangeChange p/ permitir selecionar MAIS DE UM mês.
  // A seleção é um intervalo [início, fim] de meses (mapeia p/ um from/to de datas).
  endMonth?: number | null
  endYear?:  number | null
  onRangeChange?: (startM: number, startY: number, endM: number, endY: number) => void
}) {
  const rangeMode = typeof onRangeChange === 'function'
  const [open,      setOpen]      = useState(false)
  const [navYear,   setNavYear]   = useState(() => year ?? new Date().getFullYear())
  const [pos,       setPos]       = useState<{ top: number; left: number } | null>(null)
  // no modo range: guarda o 1º clique (âncora) enquanto espera o 2º
  const [anchor,    setAnchor]    = useState<{ m: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const ref    = useRef<HTMLDivElement>(null)

  const hasValue = month !== null && year !== null
  // fim efetivo do range = endMonth/endYear se houver, senão o próprio início (1 mês)
  const eM = endMonth ?? month
  const eY = endYear ?? year
  const spanLabel = () => {
    if (!hasValue) return placeholder
    const sameStartEnd = eM === month && eY === year
    if (!rangeMode || sameStartEnd) return `${MONTHS_FULL_PT[month! - 1]} ${year}`
    // intervalo: "Jul – Set 2026" (mesmo ano) ou "Jul 2026 – Jan 2027"
    if (year === eY) return `${MONTHS_PT[month! - 1]} – ${MONTHS_PT[eM! - 1]} ${year}`
    return `${MONTHS_PT[month! - 1]} ${year} – ${MONTHS_PT[eM! - 1]} ${eY}`
  }
  const displayText = spanLabel()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false); setAnchor(null)
      }
    }
    const onScroll = () => { setOpen(false); setAnchor(null) }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); setAnchor(null); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const dropW = 224
    const left = Math.min(r.left, window.innerWidth - dropW - 8)
    setPos({ top: r.bottom + 4, left: Math.max(8, left) })
    setNavYear(year ?? new Date().getFullYear())
    setAnchor(null)
    setOpen(true)
  }

  const select = (m: number) => {
    if (!rangeMode) {
      onChange(m, navYear)
      setOpen(false)
      return
    }
    // modo range: 1º clique = âncora (seleção de 1 mês); 2º clique = fecha o intervalo.
    if (!anchor) {
      setAnchor({ m, y: navYear })
      onRangeChange!(m, navYear, m, navYear)   // já vale como "1 mês" até o 2º clique
      return
    }
    const a = ord(anchor.m, anchor.y)
    const b = ord(m, navYear)
    const [s, e] = a <= b ? [anchor, { m, y: navYear }] : [{ m, y: navYear }, anchor]
    onRangeChange!(s.m, s.y, e.m, e.y)
    setAnchor(null)
    setOpen(false)
  }

  const now = new Date()
  const todayM = now.getMonth() + 1
  const todayY = now.getFullYear()

  // um mês (na página navegada) está DENTRO da seleção atual?
  const inSelection = (mNum: number): boolean => {
    if (!hasValue) return false
    if (anchor) return mNum === anchor.m && navYear === anchor.y   // aguardando 2º clique
    const lo = ord(month!, year!)
    const hi = ord(eM!, eY!)
    const cur = ord(mNum, navYear)
    return cur >= lo && cur <= hi
  }
  const isEdge = (mNum: number): boolean =>
    (mNum === month && navYear === year) || (rangeMode && mNum === eM && navYear === eY)

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle}
        className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs outline-none whitespace-nowrap"
        style={{
          background: 'var(--bg)',
          border: `1px solid ${hasValue ? 'var(--primary)' : 'var(--border)'}`,
          color: hasValue ? 'var(--text)' : 'var(--text-light)',
        }}>
        <CalendarDays size={13} style={{ color: hasValue ? 'var(--primary)' : 'var(--text-light)', flexShrink: 0 }} />
        <span>{displayText}</span>
        {hasValue && (
          <span onClick={e => { e.stopPropagation(); onChange(0, 0) }}
            className="ml-1 cursor-pointer" style={{ color: 'var(--text-light)' }}>
            <X size={10} />
          </span>
        )}
      </button>

      {open && pos && (
        <div ref={ref}
          className="rounded-xl shadow-2xl p-3 w-56"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setNavYear(y => y - 1)}
              className="p-1 rounded" style={{ color: 'var(--text-light)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-light)')}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>{navYear}</span>
            <button type="button" onClick={() => setNavYear(y => y + 1)}
              className="p-1 rounded" style={{ color: 'var(--text-light)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-light)')}>
              <ChevronRight size={14} />
            </button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {MONTHS_PT.map((m, i) => {
              const mNum = i + 1
              const sel      = inSelection(mNum)
              const edge     = isEdge(mNum)
              const isToday  = mNum === todayM && navYear === todayY
              return (
                <button key={m} type="button" onClick={() => select(mNum)}
                  className="py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: edge ? 'var(--primary)' : sel ? 'var(--primary-soft)' : isToday ? 'var(--primary-soft)' : undefined,
                    color: edge ? '#0A0A0B' : sel ? 'var(--primary)' : isToday ? 'var(--primary)' : 'var(--text)',
                    border: (isToday || sel) && !edge ? '1px solid var(--primary)' : '1px solid transparent',
                  }}>
                  {m}
                </button>
              )
            })}
          </div>
          {rangeMode && (
            <div className="mt-2 text-[10px] leading-tight" style={{ color: 'var(--text-light)' }}>
              {anchor ? 'Clique no mês final do intervalo.' : 'Clique 1 mês, ou 2 p/ um intervalo.'}
            </div>
          )}
        </div>
      )}
    </>
  )
}
