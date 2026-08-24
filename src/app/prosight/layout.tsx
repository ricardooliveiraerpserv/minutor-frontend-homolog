'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight — casca única com sub-navegação por abas (mesmo padrão da Central de
// Fontes). AppLayout + tabs "hand-rolled" (não há componente Tabs no DS).
// A rota dev-only /prosight/preview renderiza as VIEWs isoladas (sem AppLayout)
// para captura de screenshots — nunca aparece na navegação (não está na sidebar).
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'

const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/prosight/inventario', label: 'Inventário', match: (p) => p === '/prosight' || p.startsWith('/prosight/inventario') },
  { href: '/prosight/licenciamento', label: 'Licenciamento', match: (p) => p.startsWith('/prosight/licenciamento') },
  { href: '/prosight/configuracao', label: 'Configuração', match: (p) => p.startsWith('/prosight/configuracao') },
]

export default function ProsightLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''

  // Preview dev-only: sem AppLayout (contorna o gate de auth p/ captura isolada).
  if (pathname.startsWith('/prosight/preview')) return <>{children}</>

  return (
    <AppLayout>
      <nav className="mb-6 flex flex-wrap gap-x-1 gap-y-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map((t) => {
          const active = t.match(pathname)
          return (
            <Link
              key={t.href}
              href={t.href}
              className="-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition"
              style={
                active
                  ? { borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }
                  : { borderColor: 'transparent', color: 'var(--text-muted)', fontWeight: 500 }
              }
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </AppLayout>
  )
}
