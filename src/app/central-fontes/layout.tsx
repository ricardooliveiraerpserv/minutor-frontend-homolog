'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — casca única com abas. A Visão Geral é a ENTRADA do acervo
// (Empresa → Repositório → Diretório → Fonte), com navegação progressiva por clique.
// Não há mais aba "Acervo" separada: /central-fontes e /central-fontes/acervo são a
// mesma experiência, então a aba "Visão Geral" fica ativa em ambas. A ficha [id]
// (drill-down antigo) continua sem abas.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'

const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/central-fontes', label: 'Visão Geral', match: (p) => p === '/central-fontes' || p.startsWith('/central-fontes/acervo') },
  { href: '/central-fontes/busca', label: 'Busca', match: (p) => p === '/central-fontes/busca' || p.startsWith('/central-fontes/busca/') },
  { href: '/central-fontes/impacto', label: 'Impacto', match: (p) => p === '/central-fontes/impacto' || p.startsWith('/central-fontes/impacto/') },
  { href: '/central-fontes/campanha', label: 'Campanhas', match: (p) => p === '/central-fontes/campanha' || p.startsWith('/central-fontes/campanha/') },
  { href: '/central-fontes/aprovacoes', label: 'Aprovações', match: (p) => p === '/central-fontes/aprovacoes' || p.startsWith('/central-fontes/aprovacoes/') },
  { href: '/central-fontes/configuracoes', label: 'Configurações', match: (p) => p === '/central-fontes/configuracoes' || p.startsWith('/central-fontes/configuracoes/') },
]

export default function CentralFontesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isFicha = /^\/central-fontes\/\d+/.test(pathname) // ficha [id]: sem abas

  return (
    <AppLayout>
      {!isFicha && (
        <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border,#e2e8f0)]">
          {TABS.map((t) => {
            const active = t.match(pathname)
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
                  active
                    ? 'border-[var(--primary,#157582)] font-semibold text-[var(--primary,#157582)]'
                    : 'border-transparent font-medium text-[var(--muted-foreground,#64748b)] hover:text-[var(--foreground,#0f172a)]'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      )}
      {children}
    </AppLayout>
  )
}
