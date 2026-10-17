'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight — casca única do shell "Gestão e Governança Técnica Protheus".
// A sub-navegação por abas foi unificada na <ProsightNav> (dois níveis, comum
// aos 3 domínios). O seletor de empresa continua ao lado da navegação.
// A rota dev-only /prosight/preview renderiza as VIEWs isoladas (sem AppLayout)
// para captura de screenshots — nunca aparece na navegação.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { ProsightNav } from '@/components/prosight-shell/prosight-nav'
import { ProsightCompanyProvider, ProsightCompanySelect } from './_components/company-context'

export default function ProsightLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''

  // Preview dev-only: sem AppLayout (contorna o gate de auth p/ captura isolada).
  if (pathname.startsWith('/prosight/preview')) return <>{children}</>

  return (
    <AppLayout>
      <ProsightCompanyProvider>
        <ProsightNav rightSlot={<ProsightCompanySelect />} />
        {children}
      </ProsightCompanyProvider>
    </AppLayout>
  )
}
