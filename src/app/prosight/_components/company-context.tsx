'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight — contexto GLOBAL de EMPRESA (escopo do módulo). UMA chave só, no topo
// da casca, comum a todos os domínios do Prosight. Fonte da lista = EMPRESAS REAIS
// (/source-docs/tree/customers) — os mesmos clientes da Central de Fontes.
//
// Ao selecionar uma empresa aqui, a Central de Fontes ACATA (abre direto na empresa).
// Os domínios ainda em fixture (Inventário/Licenciamento) recebem o companyId real e
// derivam um perfil de demonstração determinístico (companySeed = id % 4) — sem quebrar.
// Operações mantém o próprio seletor (empresa × ambiente, eixo diferente).
//
// "Todas as empresas" = companyId null (Central de Fontes mostra o catálogo; fixtures
// caem no perfil 0). Seleção PERSISTIDA (localStorage) e compartilhada entre as cascas
// do Prosight e da Central de Fontes (que são árvores de layout distintas).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { api } from '@/lib/api'

export interface ProsightCompany { id: number; name: string }

interface Ctx {
  companyId: number | null
  companyName: string | null
  companies: ProsightCompany[]
  setCompanyId: (id: number | null) => void
}

const ProsightCompanyContext = createContext<Ctx | null>(null)
const LS_KEY = 'prosight_company'

function readPersisted(): number | null {
  if (typeof window === 'undefined') return null
  const v = window.localStorage.getItem(LS_KEY)
  return v ? Number(v) : null
}

export function ProsightCompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<ProsightCompany[]>([])
  // init síncrono da seleção persistida (evita flash antes de escopar/redirecionar).
  const [companyId, setCompanyIdState] = useState<number | null>(readPersisted)

  const setCompanyId = (id: number | null) => {
    setCompanyIdState(id)
    if (typeof window === 'undefined') return
    if (id != null) window.localStorage.setItem(LS_KEY, String(id))
    else window.localStorage.removeItem(LS_KEY)
  }

  // Empresas REAIS (clientes) — a mesma fonte da Central de Fontes.
  useEffect(() => {
    api.get<{ data: { customer_id: number; name: string }[] }>('/source-docs/tree/customers?include_empty=1')
      .then((r) => setCompanies(r.data.map((c) => ({ id: c.customer_id, name: c.name }))))
      .catch(() => setCompanies([]))
  }, [])

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

/** Seletor GLOBAL de empresa — vive na casca do Prosight (ao lado das abas). */
export function ProsightCompanySelect() {
  const ctx = useProsightCompany()
  if (!ctx || ctx.companies.length === 0) return null
  return (
    <label className="flex items-center gap-2">
      <Building2 size={15} style={{ color: 'var(--text-muted)' }} />
      <span className="sr-only">Empresa</span>
      <select
        value={ctx.companyId ?? ''}
        onChange={(e) => ctx.setCompanyId(e.target.value ? Number(e.target.value) : null)}
        className="rounded-xl px-3 py-1.5 text-sm outline-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <option value="">Todas as empresas</option>
        {ctx.companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  )
}
