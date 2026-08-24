'use client'

// Prosight — app externo (Inventário Git × RPO) embutido DENTRO do Minutor.
// Abre na própria página (mantém a sidebar), não em nova aba. A URL vem por env
// (NEXT_PUBLIC_PROSIGHT_URL); o app tem auth própria. Escape hatch "Abrir em nova aba".
// Requer que o Prosight permita ser enquadrado (CSP frame-ancestors do Minutor).

import { AppLayout } from '@/components/layout/app-layout'
import { ExternalLink } from 'lucide-react'

const PROSIGHT_URL = process.env.NEXT_PUBLIC_PROSIGHT_URL || ''

export default function ProsightPage() {
  return (
    <AppLayout
      title="Prosight"
      fullBleed
      actions={PROSIGHT_URL ? (
        <a
          href={PROSIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm"
        >
          <ExternalLink size={15} /> Abrir em nova aba
        </a>
      ) : undefined}
    >
      {PROSIGHT_URL ? (
        <iframe
          src={PROSIGHT_URL}
          title="Prosight — Controle de Fontes"
          className="w-full h-full border-0"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Prosight não configurado
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-light)' }}>
            Defina <code>NEXT_PUBLIC_PROSIGHT_URL</code> para carregar o app.
          </p>
        </div>
      )}
    </AppLayout>
  )
}
