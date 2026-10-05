'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight C4 — seleção de AMBIENTE (environment_id real) para o detalhe de
// Configuração. Eixo oficial = ProsightCompanyContext.customer_id + environment_id.
// REGRA CRÍTICA (anti-stale): trocar de empresa INVALIDA o environment_id ANTES de
// qualquer fetch/render — nunca mostrar ambiente da AUSTER ao ir para CONCRESERV.
// Não auto-seleciona o primeiro ambiente da nova empresa (seleção é explícita).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useProsightCompany } from './company-context'

interface Ctx {
  environmentId: number | null
  setEnvironmentId: (id: number | null) => void
}

const EnvSelectionContext = createContext<Ctx | null>(null)

export function ProsightEnvSelectionProvider({ children }: { children: ReactNode }) {
  const company = useProsightCompany()
  const companyId = company?.companyId ?? null
  const [environmentId, setEnvironmentId] = useState<number | null>(null)

  // Troca de empresa → invalida o ambiente selecionado (sem stale visual/fetch).
  useEffect(() => { setEnvironmentId(null) }, [companyId])

  return (
    <EnvSelectionContext.Provider value={{ environmentId, setEnvironmentId }}>
      {children}
    </EnvSelectionContext.Provider>
  )
}

export function useProsightEnvSelection(): Ctx | null {
  return useContext(EnvSelectionContext)
}
