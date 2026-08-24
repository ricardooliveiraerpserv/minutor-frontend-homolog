'use client'

// Dashboards — front REAL hospedado DENTRO do Minutor (public/apps/dashboards/), mesma origem.
// Rota /dashboards-protheus (NÃO /dashboards, que já é dos dashboards de cliente).
// Abre na própria página (mantém a sidebar), sem depender do serviço externo estar no ar.
// Hoje mostra a tela de login do app (interface real, sem dados); as telas internas
// carregam quando o backend do Dashboards estiver no ar (D5) — wiring de /api (URL/CORS) é o D5.

import { AppLayout } from '@/components/layout/app-layout'
import { ExternalLink } from 'lucide-react'

const APP_SRC = '/apps/dashboards/index.html'

export default function DashboardsProtheusPage() {
  return (
    <AppLayout
      title="Dashboards"
      fullBleed
      actions={
        <a
          href={APP_SRC}
          target="_blank"
          rel="noopener noreferrer"
          className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm"
        >
          <ExternalLink size={15} /> Abrir em tela cheia
        </a>
      }
    >
      <iframe
        src={APP_SRC}
        title="Dashboards — Operações Protheus"
        className="w-full h-full border-0"
      />
    </AppLayout>
  )
}
