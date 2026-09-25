'use client'

// Prosight → "Atividade & Auditoria" (C4.2). Seção transversal (read-model de
// timeline via adapters; sem fundir storage; permission-aware). 100% fixture.
// Suspense p/ o useSearchParams (deep-link opcional ?family=).
import { Suspense } from 'react'
import { AtividadeView } from '../_components/atividade-view'

export default function AtividadePage() {
  return <Suspense fallback={null}><AtividadeView /></Suspense>
}
