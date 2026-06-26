'use client'

/**
 * DataTable — tabela canônica do Minutor (Linear/Notion-like)
 *
 * Usa exclusivamente tokens do Design System:
 *  - Container: var(--surface) + var(--border) + var(--shadow-sm) + rounded-xl
 *  - Header:    var(--surface-sunken) + var(--text-muted) (11px uppercase)
 *  - Row hover: var(--surface-hover)
 *  - Divider:   var(--border)
 *
 * Densidade padrão: 12px vertical, 16px horizontal.
 *
 * Exemplo de uso:
 *
 *   <DataTable>
 *     <DataTableHead>
 *       <DataTableHeadRow>
 *         <DataTableHeadCell>Projeto</DataTableHeadCell>
 *         <DataTableHeadCell align="right">Horas</DataTableHeadCell>
 *       </DataTableHeadRow>
 *     </DataTableHead>
 *     <DataTableBody>
 *       {rows.map(r => (
 *         <DataTableRow key={r.id} onClick={...}>
 *           <DataTableCell><strong>{r.name}</strong><br/><small>{r.sub}</small></DataTableCell>
 *           <DataTableCell align="right" numeric>{r.hours}h</DataTableCell>
 *         </DataTableRow>
 *       ))}
 *     </DataTableBody>
 *   </DataTable>
 */

import * as React from 'react'
import { ScrollableX } from './scrollable-x'

// ─── Container ───────────────────────────────────────────────────────────────

interface DataTableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Quando true, omite o wrapper "card" — útil em listas dentro de outro card. */
  inline?: boolean
}

export function DataTable({ inline, className = '', children, ...props }: DataTableProps) {
  const table = (
    <table
      data-slot="data-table"
      className={`w-full text-sm ${className}`}
      {...props}
    >
      {children}
    </table>
  )
  if (inline) return <ScrollableX>{table}</ScrollableX>

  return (
    <div
      data-slot="data-table-container"
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <ScrollableX>{table}</ScrollableX>
    </div>
  )
}

// ─── Head ────────────────────────────────────────────────────────────────────

export function DataTableHead({ className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      data-slot="data-table-head"
      className={`sticky top-0 z-10 ${className}`}
      style={{ background: 'var(--surface-sunken)' }}
      {...props}
    />
  )
}

export function DataTableHeadRow({ className = '', ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-slot="data-table-head-row"
      className={className}
      style={{ borderBottom: '1px solid var(--border)' }}
      {...props}
    />
  )
}

interface DataTableHeadCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right'
}

export function DataTableHeadCell({ align = 'left', className = '', style, ...props }: DataTableHeadCellProps) {
  return (
    <th
      data-slot="data-table-head-cell"
      className={`px-4 py-3 text-[11px] font-medium uppercase tracking-[0.04em] select-none text-${align} ${className}`}
      style={{ color: 'var(--text-muted)', ...style }}
      {...props}
    />
  )
}

// ─── Body ────────────────────────────────────────────────────────────────────

export function DataTableBody({ className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody data-slot="data-table-body" className={className} {...props} />
}

interface DataTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Quando true, aplica fundo soft (primary-soft) e barra lateral. */
  selected?: boolean
  /** Quando definido, a linha vira clicável (cursor pointer + hover) */
  onClick?: React.MouseEventHandler<HTMLTableRowElement>
}

export function DataTableRow({ selected, onClick, className = '', style, onMouseEnter, onMouseLeave, ...props }: DataTableRowProps) {
  const clickable = !!onClick
  const baseStyle: React.CSSProperties = {
    borderBottom: '1px solid var(--border)',
    background: selected ? 'var(--primary-soft)' : 'transparent',
    borderLeft: selected ? '3px solid var(--primary)' : undefined,
    transition: 'background-color .12s ease',
    cursor: clickable ? 'pointer' : undefined,
    ...style,
  }
  return (
    <tr
      data-slot="data-table-row"
      data-selected={selected || undefined}
      className={className}
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--surface-hover)'
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent'
        onMouseLeave?.(e)
      }}
      {...props}
    />
  )
}

interface DataTableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right'
  /** Quando true, aplica tabular-nums (números monoespaçados). */
  numeric?: boolean
  /** Quando true, força quebra de linha (`whitespace-normal`). Default = nowrap. */
  wrap?: boolean
  /** Variante muted — usa text-muted (default) ou text (sólido). */
  muted?: boolean
}

export function DataTableCell({ align = 'left', numeric, wrap, muted, className = '', style, ...props }: DataTableCellProps) {
  return (
    <td
      data-slot="data-table-cell"
      className={`px-4 py-3 text-[13px] text-${align} ${numeric ? 'tabular-nums' : ''} ${wrap ? 'whitespace-normal' : 'whitespace-nowrap'} ${className}`}
      style={{ color: muted === false ? 'var(--text)' : 'var(--text-muted)', ...style }}
      {...props}
    />
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

export function DataTableEmpty({ message = 'Nenhum registro encontrado.', colSpan = 1 }: { message?: string; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm" style={{ color: 'var(--text-light)' }}>
        {message}
      </td>
    </tr>
  )
}
