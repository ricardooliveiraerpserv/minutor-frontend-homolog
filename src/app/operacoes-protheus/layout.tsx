'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — casca única com sub-navegação por abas (padrão Prosight/
// Central de Fontes). AppLayout + tabs. O seletor de AMBIENTE (empresa JNG · N
// ambientes) vive ao lado das abas e escopa TODAS as telas.
// A rota dev-only /operacoes-protheus/preview renderiza as VIEWs isoladas (sem
// AppLayout) para captura de screenshots — nunca aparece na navegação.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { OperacoesProvider, OperacoesEnvSelector } from './_components/operacoes-context'

const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/operacoes-protheus/visao-geral', label: 'Visão Geral', match: (p) => p === '/operacoes-protheus' || p.startsWith('/operacoes-protheus/visao-geral') },
  { href: '/operacoes-protheus/fontes', label: 'Controle de Fontes', match: (p) => p.startsWith('/operacoes-protheus/fontes') },
  { href: '/operacoes-protheus/mudancas', label: 'Mudanças', match: (p) => p.startsWith('/operacoes-protheus/mudancas') },
  { href: '/operacoes-protheus/auditoria', label: 'Auditoria', match: (p) => p.startsWith('/operacoes-protheus/auditoria') },
  { href: '/operacoes-protheus/configuracao', label: 'Configuração', match: (p) => p.startsWith('/operacoes-protheus/configuracao') },
]

export default function OperacoesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''

  // Preview dev-only: sem AppLayout (contorna o gate de auth p/ captura isolada).
  if (pathname.startsWith('/operacoes-protheus/preview')) return <>{children}</>

  return (
    <AppLayout>
      <OperacoesProvider>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <nav className="flex flex-wrap gap-x-1 gap-y-0">
            {TABS.map((t) => {
              const active = t.match(pathname)
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition"
                  style={active
                    ? { borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }
                    : { borderColor: 'transparent', color: 'var(--text-muted)', fontWeight: 500 }}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
          <div className="pb-1.5">
            <OperacoesEnvSelector />
          </div>
        </div>
        {children}
      </OperacoesProvider>
    </AppLayout>
  )
}
