'use client'

// Dashboards — app externo (Operações Protheus) embutido DENTRO do Minutor.
// Rota /dashboards-protheus (NÃO /dashboards, que já é dos dashboards de cliente).
// Abre na própria página (mantém a sidebar), não em nova aba. URL por env
// (NEXT_PUBLIC_DASHBOARDS_URL); auth própria. Escape hatch "Abrir em nova aba".
// Requer que o Dashboards permita ser enquadrado (CSP frame-ancestors do Minutor).

import { AppLayout } from '@/components/layout/app-layout'
import { ExternalLink } from 'lucide-react'

const DASHBOARDS_URL = process.env.NEXT_PUBLIC_DASHBOARDS_URL || ''

export default function DashboardsProtheusPage() {
  return (
    <AppLayout
      title="Dashboards"
      fullBleed
      actions={DASHBOARDS_URL ? (
        <a
          href={DASHBOARDS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm"
        >
          <ExternalLink size={15} /> Abrir em nova aba
        </a>
      ) : undefined}
    >
      {DASHBOARDS_URL ? (
        <iframe
          src={DASHBOARDS_URL}
          title="Dashboards — Operações Protheus"
          className="w-full h-full border-0"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Dashboards não configurado
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-light)' }}>
            Defina <code>NEXT_PUBLIC_DASHBOARDS_URL</code> para carregar o app.
          </p>
        </div>
      )}
    </AppLayout>
  )
}
