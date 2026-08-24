'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — casca do domínio de Fontes dentro do shell "Gestão e
// Governança Técnica Protheus". A sub-navegação por abas foi unificada na
// <ProsightNav> (dois níveis, comum aos 3 domínios): o Acervo e as telas de
// Governança (Campanhas/Aprovações/Publicações/Configurações) são alcançadas de
// lá. A ficha [id] (drill-down antigo) continua SEM navegação, exatamente como
// antes.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { ProsightNav } from '@/components/prosight-shell/prosight-nav'

export default function CentralFontesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isFicha = /^\/central-fontes\/\d+/.test(pathname) // ficha [id]: sem abas

  return (
    <AppLayout>
      {!isFicha && <ProsightNav />}
      {children}
    </AppLayout>
  )
}
