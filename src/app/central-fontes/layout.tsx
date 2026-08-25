'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — casca do domínio de Fontes dentro do shell "Gestão e
// Governança Técnica Protheus". A sub-navegação por abas é unificada na
// <ProsightNav> (dois níveis, comum aos 3 domínios).
// C4.3: o ProsightNav passa a aparecer TAMBÉM na ficha [id] (o Prontuário Técnico
// da Fonte é parte do domínio Fontes → Prosight → Fontes → Acervo → Fonte). A
// seção "Fontes" acende automaticamente (isFontes casa /central-fontes/{id}).
// O modo `embedded` do split-view do Acervo NÃO passa por este layout (fica dentro
// de /central-fontes/acervo), então segue intacto.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { ProsightNav } from '@/components/prosight-shell/prosight-nav'
import { FontesCompanyProvider, FontesCompanySelect } from './_components/fontes-company-context'

export default function CentralFontesLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout>
      <FontesCompanyProvider>
        <ProsightNav rightSlot={<FontesCompanySelect />} />
        {children}
      </FontesCompanyProvider>
    </AppLayout>
  )
}
