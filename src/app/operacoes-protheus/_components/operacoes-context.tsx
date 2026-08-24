'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — contexto EMPRESA → AMBIENTE (escopo do módulo).
// Modela 2 níveis (NÃO assumir 1 empresa = 1 ambiente): a empresa tem N ambientes
// Protheus (Produção / Homologação / Desenvolvimento). Trocar o AMBIENTE atualiza
// TODO o conteúdo do módulo (via environmentId repassado ao datasource).
//
// Fonte no F4: fixture (empresa JNG + 3 ambientes). No D-live: empresas/ambientes
// reais do Minutor + mapeamento AppServer. O seletor vive na casca (ao lado das abas).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Building2, Layers } from 'lucide-react'
import { getOperacoesDataSource } from '@/lib/operacoes/datasource'
import { COMPANY_JNG } from '@/lib/operacoes/fixtures'
import type { OperacoesEnvironment } from '@/lib/operacoes/types'

interface Ctx {
  companyId: string
  companyName: string
  environmentId: string | null
  environmentLabel: string | null
  environments: OperacoesEnvironment[]
  setEnvironmentId: (id: string) => void
}

const OperacoesContext = createContext<Ctx | null>(null)

export function OperacoesProvider({ children, forcedEnvironmentId }: { children: ReactNode; forcedEnvironmentId?: string | null }) {
  const ds = getOperacoesDataSource()
  const [environments, setEnvironments] = useState<OperacoesEnvironment[]>([])
  const [environmentId, setEnvironmentId] = useState<string | null>(forcedEnvironmentId ?? null)

  useEffect(() => {
    let cancelled = false
    void ds.getEnvironments(COMPANY_JNG.id).then((list) => {
      if (cancelled) return
      setEnvironments(list)
      setEnvironmentId((cur) => cur ?? forcedEnvironmentId ?? list[0]?.id ?? null)
    })
    return () => { cancelled = true }
  }, [ds, forcedEnvironmentId])

  // Harness dev-only: permite forçar o ambiente por prop (screenshots).
  useEffect(() => {
    if (forcedEnvironmentId) setEnvironmentId(forcedEnvironmentId)
  }, [forcedEnvironmentId])

  const environmentLabel = useMemo(
    () => environments.find((e) => e.id === environmentId)?.label ?? null,
    [environments, environmentId],
  )

  return (
    <OperacoesContext.Provider
      value={{
        companyId: COMPANY_JNG.id,
        companyName: COMPANY_JNG.name,
        environmentId,
        environmentLabel,
        environments,
        setEnvironmentId,
      }}
    >
      {children}
    </OperacoesContext.Provider>
  )
}

/** Contexto do módulo, ou null fora do provider (ex.: harness sem casca). */
export function useOperacoes(): Ctx | null {
  return useContext(OperacoesContext)
}

/** Contexto compacto EMPRESA · AMBIENTE + seletor de ambiente (vive na casca). */
export function OperacoesEnvSelector() {
  const ctx = useOperacoes()
  if (!ctx) return null
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Building2 size={15} style={{ color: 'var(--text-light)' }} />
        <span>Empresa:</span>
        <b style={{ color: 'var(--text)' }}>{ctx.companyName}</b>
      </div>
      <label className="flex items-center gap-2">
        <Layers size={15} style={{ color: 'var(--text-light)' }} />
        <span className="sr-only">Ambiente</span>
        <select
          value={ctx.environmentId ?? ''}
          onChange={(e) => ctx.setEnvironmentId(e.target.value)}
          className="rounded-xl px-3 py-1.5 text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          {ctx.environments.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
