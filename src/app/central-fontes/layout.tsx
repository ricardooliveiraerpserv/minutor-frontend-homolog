'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — F0 · Casca única com abas. O Acervo (Empresa → Repositório →
// Diretório Git → Fonte) é o eixo; Busca/Impacto/Campanhas/Aprovações/Config passam
// a operar sobre o mesmo acervo. As abas reaproveitam as páginas existentes (sem
// reescrever). A ficha [id] (drill-down) não mostra as abas.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/central-fontes', label: 'Visão Geral', exact: true },
  { href: '/central-fontes/acervo', label: 'Acervo' },
  { href: '/central-fontes/busca', label: 'Busca' },
  { href: '/central-fontes/impacto', label: 'Impacto' },
  { href: '/central-fontes/campanha', label: 'Campanhas' },
  { href: '/central-fontes/aprovacoes', label: 'Aprovações' },
  { href: '/central-fontes/configuracoes', label: 'Configurações' },
]

export default function CentralFontesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isFicha = /^\/central-fontes\/\d+/.test(pathname) // ficha [id]: sem abas

  return (
    <AppLayout>
      {!isFicha && (
        <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border,#e2e8f0)]">
          {TABS.map((t) => {
            const active = t.exact
              ? pathname === t.href
              : pathname === t.href || pathname.startsWith(t.href + '/')
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'border-[var(--accent,#2563eb)] text-[var(--accent,#2563eb)]'
                    : 'border-transparent text-[var(--muted-fg,#64748b)] hover:text-[var(--fg,#0f172a)]'
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
