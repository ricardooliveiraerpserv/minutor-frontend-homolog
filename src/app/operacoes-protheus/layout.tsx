'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — casca única do shell "Gestão e Governança Técnica
// Protheus". A sub-navegação por abas foi unificada na <ProsightNav> (dois
// níveis, comum aos 3 domínios). O seletor de AMBIENTE (empresa JNG · N
// ambientes) segue ao lado da navegação e escopa TODAS as telas.
// A rota dev-only /operacoes-protheus/preview renderiza as VIEWs isoladas (sem
// AppLayout) para captura de screenshots — nunca aparece na navegação.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { ProsightNav } from '@/components/prosight-shell/prosight-nav'
import { OperacoesProvider, OperacoesEnvSelector } from './_components/operacoes-context'
import { ProsightCompanyProvider, ProsightCompanySelect } from '@/app/prosight/_components/company-context'

export default function OperacoesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''

  // Preview dev-only: sem AppLayout (contorna o gate de auth p/ captura isolada).
  if (pathname.startsWith('/operacoes-protheus/preview')) return <>{children}</>

  // C3 — a aba Ambientes escopa pela EMPRESA real (ProsightCompany), não pelo eixo
  // 'jng' das telas operacionais. As demais telas de Operação seguem no seletor de
  // AMBIENTE (Bloco B/fixture) até o Conector. Os dois providers coexistem (chave
  // 'prosight_company' compartilhada com a casca do Prosight).
  const isAmbientes = pathname.startsWith('/operacoes-protheus/ambientes')

  return (
    <AppLayout>
      <ProsightCompanyProvider>
        <OperacoesProvider>
          <ProsightNav rightSlot={isAmbientes ? <ProsightCompanySelect /> : <OperacoesEnvSelector />} />
          {children}
        </OperacoesProvider>
      </ProsightCompanyProvider>
    </AppLayout>
  )
}
