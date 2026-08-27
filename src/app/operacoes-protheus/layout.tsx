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
import { ProsightEnvSelectionProvider } from '@/app/prosight/_components/env-selection-context'

export default function OperacoesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''

  // Preview dev-only: sem AppLayout (contorna o gate de auth p/ captura isolada).
  if (pathname.startsWith('/operacoes-protheus/preview')) return <>{children}</>

  // C3/C4 — Ambientes e Configuração escopam pela EMPRESA real (ProsightCompany),
  // não pelo eixo 'jng' das telas operacionais. As demais telas de Operação seguem no
  // seletor de AMBIENTE (Bloco B/fixture) até o Conector. Os providers coexistem
  // (chave 'prosight_company' compartilhada com a casca do Prosight). Trocar de empresa
  // no seletor invalida o environment_id selecionado (env-selection), sem stale.
  const isProsightScoped = pathname.startsWith('/operacoes-protheus/ambientes')
    || pathname.startsWith('/operacoes-protheus/configuracao')

  return (
    <AppLayout>
      <ProsightCompanyProvider>
        <ProsightEnvSelectionProvider>
          <OperacoesProvider>
            <ProsightNav rightSlot={isProsightScoped ? <ProsightCompanySelect /> : <OperacoesEnvSelector />} />
            {children}
          </OperacoesProvider>
        </ProsightEnvSelectionProvider>
      </ProsightCompanyProvider>
    </AppLayout>
  )
}
