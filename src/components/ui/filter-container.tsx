import * as React from 'react'

/**
 * FilterContainer — painel de filtros (Surface 1).
 * Agrupa a barra de filtros como um "painel de trabalho" distinto do fundo,
 * usando o token de painel (--panel) + borda discreta. Só visual; sem lógica.
 * Uso: envolver o bloco de filtros da tela no lugar do <div> inline atual.
 */
export function FilterContainer({
  className = '',
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
