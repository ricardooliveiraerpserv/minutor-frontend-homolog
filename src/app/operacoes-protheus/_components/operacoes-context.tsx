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
import { useProsightCompany, isProsightDemoCompany } from '@/app/prosight/_components/company-context'

interface Ctx {
  companyId: string
  companyName: string
  environmentId: string | null
  environmentLabel: string | null
  environments: OperacoesEnvironment[]
  setEnvironmentId: (id: string) => void
  /** Demonstração (fixtures) só na empresa demo (ERPSERV). Fora dela: 'não conectado'. */
  demoAllowed: boolean
}

const OperacoesContext = createContext<Ctx | null>(null)

/** Lê ?env= da URL (deep-link de outra tela do shell, ex.: Visão Geral do Prosight). */
function urlEnvironmentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('env')
  } catch {
    return null
  }
}

export function OperacoesProvider({ children, forcedEnvironmentId }: { children: ReactNode; forcedEnvironmentId?: string | null }) {
  const ds = getOperacoesDataSource()
  const prosight = useProsightCompany()
  // Empresa do SELETOR GLOBAL (não mais o eixo fixo 'JNG'). No harness (forcedEnvironmentId) mantém demo.
  const companyName = prosight?.companyName ?? (forcedEnvironmentId ? COMPANY_JNG.name : null)
  const demoAllowed = !!forcedEnvironmentId || isProsightDemoCompany(companyName)
  const [environments, setEnvironments] = useState<OperacoesEnvironment[]>([])
  const [environmentId, setEnvironmentId] = useState<string | null>(forcedEnvironmentId ?? null)

  useEffect(() => {
    let cancelled = false
    // Fixtures SÓ na empresa demo (ERPSERV). Fora dela: não busca (os valores expostos ficam vazios).
    if (! demoAllowed) {
      return
    }
    void ds.getEnvironments(COMPANY_JNG.id).then((list) => {
      if (cancelled) return
      setEnvironments(list)
      const linked = urlEnvironmentId()
      const linkedValid = linked && list.some((e) => e.id === linked) ? linked : null
      setEnvironmentId((cur) => cur ?? forcedEnvironmentId ?? linkedValid ?? list[0]?.id ?? null)
    })
    return () => { cancelled = true }
  }, [ds, forcedEnvironmentId, demoAllowed])

  // Fora da empresa demo, expõe vazio (sem fixture) — sem resetar estado no effect (evita cascata).
  const shownEnvironments = demoAllowed ? environments : []
  const shownEnvironmentId = demoAllowed ? environmentId : null

  // Harness dev-only: permite forçar o ambiente por prop (screenshots).
  useEffect(() => {
    if (forcedEnvironmentId) setEnvironmentId(forcedEnvironmentId)
  }, [forcedEnvironmentId])

  const environmentLabel = useMemo(
    () => shownEnvironments.find((e) => e.id === shownEnvironmentId)?.label ?? null,
    [shownEnvironments, shownEnvironmentId],
  )

  return (
    <OperacoesContext.Provider
      value={{
        companyId: prosight?.companyId != null ? String(prosight.companyId) : COMPANY_JNG.id,
        companyName: companyName ?? 'Selecione uma empresa',
        environmentId: shownEnvironmentId,
        environmentLabel,
        environments: shownEnvironments,
        setEnvironmentId,
        demoAllowed,
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
      {ctx.environments.length > 0 && (
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
      )}
    </div>
  )
}
