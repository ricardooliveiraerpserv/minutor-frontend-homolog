'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Cofre de Senhas — agora É o Cofre de Ambientes (mesmo cofre/cripto zero-knowledge).
// Cada empresa é uma pasta/card com seus ambientes e credenciais; drill-down rico
// (ambientes → Credenciais/Banco/AppServer/VPN). A tela standalone /ambientes segue
// no ar como fallback até validação. O Connector do Prosight fica no Prosight.
// ─────────────────────────────────────────────────────────────────────────────

import { AppLayout } from '@/components/layout/app-layout'
import { CofreAmbientesInner } from '@/app/ambientes/page'

export default function CofrePage() {
  return (
    <AppLayout>
      <CofreAmbientesInner
        title="Cofre de Senhas"
        subtitle="Zero-knowledge: nem o servidor consegue ler suas credenciais"
      />
    </AppLayout>
  )
}
