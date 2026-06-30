'use client'

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { modulesForUser, readStoredModule, writeStoredModule, type ModuleId } from '@/lib/modules'

// Página inicial de cada módulo (ao trocar, vai pra cá — limpa a página do módulo anterior).
// Administrativo cai no Meu Dia (universal); Serviços vai direto pra Apontamentos.
export const MODULE_HOME: Record<ModuleId, string> = {
  administrativo: '/inicio',
  servicos: '/timesheets',
  crm: '/inicio',        // inativo por enquanto
  help_desk: '/inicio',  // inativo por enquanto
}

interface ModuleCtx {
  allowedModules: ModuleId[]
  selectedModule: ModuleId | null
  setModule: (m: ModuleId) => void
}

const ModuleContext = createContext<ModuleCtx>({ allowedModules: [], selectedModule: null, setModule: () => {} })

export const useModules = () => useContext(ModuleContext)

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  const allowedModules = useMemo(() => modulesForUser(user), [user])
  const [selectedModule, setSelectedModule] = useState<ModuleId | null>(null)

  useEffect(() => {
    if (allowedModules.length === 0) { setSelectedModule(null); return }
    setSelectedModule(prev => (prev && allowedModules.includes(prev)) ? prev : (readStoredModule(allowedModules) ?? allowedModules[0]))
  }, [allowedModules])

  // Troca de módulo: persiste E navega pra home do módulo (limpa a página do módulo anterior).
  const setModule = useCallback((m: ModuleId) => {
    setSelectedModule(m)
    writeStoredModule(m)
    router.push(MODULE_HOME[m])
  }, [router])

  return (
    <ModuleContext.Provider value={{ allowedModules, selectedModule, setModule }}>
      {children}
    </ModuleContext.Provider>
  )
}
