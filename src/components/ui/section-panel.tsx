import * as React from 'react'

/**
 * SectionPanel — bloco/painel de seção (Surface 1).
 * Agrupa um bloco de dashboard (KPIs, filtros, tabela) num container distinto do
 * fundo, criando a sensação de "blocos" sem alterar conteúdo/posição. Só visual.
 * Uso: envolver o grupo no lugar do <div> inline atual (ou um grupo antes solto).
 */
export function SectionPanel({
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
