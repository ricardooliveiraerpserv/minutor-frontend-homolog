'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight — contexto de EMPRESA (escopo do módulo). Fonte da empresa:
//   • fixture (F2): lista de DEMONSTRAÇÃO (permite validar o escopo sem depender
//     de conta multi-empresa — o seletor global do Minutor só aparece com 2+).
//   • live (F6):    empresas reais do Minutor (/my-companies).
// Padrão = empresa ativa global do Minutor quando existir. O seletor vive na
// casca do Prosight (ao lado das abas) e escopa Inventário + Licenciamento.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { useActiveCompany } from '@/hooks/use-active-company'
import { prosightDataMode } from '@/lib/prosight/datasource'

export interface ProsightCompany { id: number; name: string }

// Empresas de demonstração — SÓ no modo fixture (dados de exemplo, como todo o F2).
const DEMO_COMPANIES: ProsightCompany[] = [
  { id: 1, name: 'Empresa Alfa' },
  { id: 2, name: 'Empresa Beta' },
  { id: 3, name: 'Empresa Gama' },
  { id: 4, name: 'Empresa Delta' },
]

interface Ctx {
  companyId: number | null
  companyName: string | null
  companies: ProsightCompany[]
  setCompanyId: (id: number) => void
}

const ProsightCompanyContext = createContext<Ctx | null>(null)

export function ProsightCompanyProvider({ children }: { children: ReactNode }) {
  const { active } = useActiveCompany()
  const isFixture = prosightDataMode() === 'fixture'

  // No live, a lista real completa vem do backend/BFF no F6; por ora usamos a
  // empresa ativa do Minutor. No fixture, a lista de demonstração.
  const companies: ProsightCompany[] = isFixture
    ? DEMO_COMPANIES
    : active
      ? [{ id: active.id, name: active.name ?? active.slug ?? `Empresa #${active.id}` }]
      : []

  const [companyId, setCompanyId] = useState<number | null>(
    active?.id ?? (isFixture ? DEMO_COMPANIES[0].id : null),
  )

  // Quando a empresa ativa global chega (async) e ainda não escolhemos, adota-a.
  useEffect(() => {
    if (companyId == null && active?.id != null) setCompanyId(active.id)
  }, [active, companyId])

  const companyName = companies.find((c) => c.id === companyId)?.name ?? null

  return (
    <ProsightCompanyContext.Provider value={{ companyId, companyName, companies, setCompanyId }}>
      {children}
    </ProsightCompanyContext.Provider>
  )
}

/** Retorna o contexto de empresa do Prosight, ou null fora do provider (ex.: harness). */
export function useProsightCompany(): Ctx | null {
  return useContext(ProsightCompanyContext)
}

/** Seletor de empresa — vive na casca do Prosight (ao lado das abas). */
export function ProsightCompanySelect() {
  const ctx = useProsightCompany()
  if (!ctx || ctx.companies.length <= 1) return null
  return (
    <label className="flex items-center gap-2">
      <Building2 size={15} style={{ color: 'var(--text-muted)' }} />
      <span className="sr-only">Empresa</span>
      <select
        value={ctx.companyId ?? ''}
        onChange={(e) => ctx.setCompanyId(Number(e.target.value))}
        className="rounded-xl px-3 py-1.5 text-sm outline-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        {ctx.companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  )
}
