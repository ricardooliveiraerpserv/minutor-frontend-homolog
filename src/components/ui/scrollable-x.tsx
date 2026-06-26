'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * ScrollableX — wrapper de overflow horizontal com uma barra de rolagem "fixa"
 * na borda inferior da viewport.
 *
 * Enquanto a tabela transborda na horizontal E seu fim está abaixo da dobra
 * (a barra de rolagem nativa, no rodapé do conteúdo, está fora da tela), mostra
 * uma barra sticky `position: fixed; bottom: 0` alinhada à largura do container e
 * sincronizada com o scroll. Assim dá pra rolar horizontalmente sem precisar
 * descer até o final da tabela. Some quando a tabela cabe ou quando o rodapé
 * dela já está visível.
 */
export function ScrollableX({ children, className = '', clipY = false }: { children: React.ReactNode; className?: string; clipY?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [bar, setBar] = useState<{ left: number; width: number; scrollWidth: number } | null>(null)

  const recompute = useCallback(() => {
    const el = scrollRef.current
    if (!el) { setBar(null); return }
    const overflow = el.scrollWidth - el.clientWidth
    if (overflow <= 1) { setBar(null); return }
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) { setBar(null); return }      // container escondido (display:none)
    const vh = window.innerHeight
    const realScrollbarVisible = rect.bottom <= vh     // rodapé da tabela já na tela
    const inView = rect.top < vh && rect.bottom > 0
    if (realScrollbarVisible || !inView) { setBar(null); return }
    setBar({ left: rect.left, width: rect.width, scrollWidth: el.scrollWidth })
  }, [])

  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; recompute() })
  }, [recompute])

  useEffect(() => {
    recompute()
    const el = scrollRef.current
    // capture:true → pega scroll de qualquer ancestral (a página rola por fora do container)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (el && ro) ro.observe(el)
    return () => {
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [schedule, recompute])

  // container -> barra
  const onContainerScroll = useCallback(() => {
    if (barRef.current && scrollRef.current && barRef.current.scrollLeft !== scrollRef.current.scrollLeft) {
      barRef.current.scrollLeft = scrollRef.current.scrollLeft
    }
  }, [])
  // barra -> container
  const onBarScroll = useCallback(() => {
    if (barRef.current && scrollRef.current && scrollRef.current.scrollLeft !== barRef.current.scrollLeft) {
      scrollRef.current.scrollLeft = barRef.current.scrollLeft
    }
  }, [])

  // ao aparecer, alinha a posição da barra com a do container
  useEffect(() => {
    if (bar && barRef.current && scrollRef.current) barRef.current.scrollLeft = scrollRef.current.scrollLeft
  }, [bar])

  return (
    <>
      <div
        ref={scrollRef}
        className={`overflow-x-auto ${className}`}
        style={clipY ? { overflowY: 'clip' } : undefined}
        onScroll={onContainerScroll}
      >
        {children}
      </div>
      {bar && (
        <div
          ref={barRef}
          onScroll={onBarScroll}
          className="minutor-sticky-hscroll"
          style={{
            position: 'fixed',
            bottom: 0,
            left: bar.left,
            width: bar.width,
            height: 16,
            zIndex: 30,
            overflowX: 'auto',
            overflowY: 'hidden',
            background: 'var(--surface, rgba(20,20,20,0.85))',
            borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
          }}
        >
          <style>{`
            .minutor-sticky-hscroll::-webkit-scrollbar { height: 12px; -webkit-appearance: none; }
            .minutor-sticky-hscroll::-webkit-scrollbar-track { background: var(--surface-sunken, rgba(255,255,255,0.04)); }
            .minutor-sticky-hscroll::-webkit-scrollbar-thumb {
              background: var(--text-light, rgba(255,255,255,0.35));
              border-radius: 6px;
              border: 2px solid transparent;
              background-clip: padding-box;
            }
            .minutor-sticky-hscroll::-webkit-scrollbar-thumb:hover { background: var(--text-muted, rgba(255,255,255,0.5)); background-clip: padding-box; }
            .minutor-sticky-hscroll { scrollbar-width: thin; }
          `}</style>
          <div style={{ width: bar.scrollWidth, height: 1 }} />
        </div>
      )}
    </>
  )
}
