'use client'

// Prosight — front REAL hospedado DENTRO do Minutor (public/apps/prosight/), mesma origem.
// Abre na própria página (mantém a sidebar), sem depender do serviço externo estar no ar.
// Hoje mostra a tela de login do app (interface real, sem dados); as telas internas
// carregam quando o backend do Prosight estiver no ar (P5) — a chamada /api do app ainda
// aponta pra mesma origem; o wiring do backend (URL/CORS) é o passo do P5.

import { AppLayout } from '@/components/layout/app-layout'
import { ExternalLink } from 'lucide-react'

const APP_SRC = '/apps/prosight/index.html'

export default function ProsightPage() {
  return (
    <AppLayout
      title="Prosight"
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
        title="Prosight — Controle de Fontes"
        className="w-full h-full border-0"
      />
    </AppLayout>
  )
}
