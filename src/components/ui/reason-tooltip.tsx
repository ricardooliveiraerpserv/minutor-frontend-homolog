'use client'

import * as React from 'react'

/**
 * ReasonTooltip — revela o motivo da rejeição/ajuste ao passar o mouse sobre o
 * badge de status. Usado nas listas de despesas e apontamentos (admin e
 * consultor). Só renderiza o tooltip quando o status é rejected/adjustment_requested
 * e há motivo; caso contrário, devolve o filho intacto.
 */
export function ReasonTooltip({
  status, reason, children,
}: {
  status?: string | null
  reason?: string | null
  children: React.ReactNode
}) {
  const show = !!reason && (status === 'rejected' || status === 'adjustment_requested')
  if (!show) return <>{children}</>

  const isRej = status === 'rejected'
  const accent = isRej ? 'var(--danger-border)' : 'var(--warning-border)'

  return (
    <span className="relative group/reason inline-flex cursor-help">
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/reason:block rounded-lg px-2.5 py-1.5 shadow-lg w-56 whitespace-normal text-[10px] leading-snug"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <span className="block font-semibold uppercase tracking-wide text-[9px] mb-0.5" style={{ color: accent }}>
          {isRej ? 'Motivo da rejeição' : 'Motivo do ajuste'}
        </span>
        {reason}
      </span>
    </span>
  )
}
