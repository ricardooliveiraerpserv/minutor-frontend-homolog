'use client'

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useNavConfig, type NavModuleConfig } from '@/contexts/nav-config-context'
import { readStoredModule, writeStoredModule } from '@/lib/modules'

interface ModuleCtx {
  allowedModules: string[]              // keys dos módulos que o usuário pode ver
  modules: NavModuleConfig[]            // definições (label/icon/items) visíveis ao usuário
  selectedModule: string | null
  setModule: (key: string) => void
  itemModule: Record<string, string>   // catalogKey → moduleKey (assignments do Configurador)
}

const ModuleContext = createContext<ModuleCtx>({ allowedModules: [], modules: [], selectedModule: null, setModule: () => {}, itemModule: {} })

export const useModules = () => useContext(ModuleContext)

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { modules: navModules } = useNavConfig()
  const router = useRouter()

  // Módulos visíveis: admin vê TODOS os ativos; demais perfis só os do seu cadastro (user.modules).
  const modules = useMemo(() => {
    if (!user || user.type === 'cliente') return []
    const active = navModules.filter(m => m.active)
    if (user.type === 'admin') return active
    const mine = new Set((user as { modules?: string[] }).modules ?? [])
    return active.filter(m => mine.has(m.key))
  }, [user, navModules])

  const allowedModules = useMemo(() => modules.map(m => m.key), [modules])

  // catalogKey → moduleKey (para a sidebar filtrar os grupos por módulo)
  const itemModule = useMemo(() => {
    const map: Record<string, string> = {}
    modules.forEach(m => (m.items ?? []).forEach(k => { map[k] = m.key }))
    return map
  }, [modules])

  const [selectedModule, setSelectedModule] = useState<string | null>(null)
  useEffect(() => {
    if (allowedModules.length === 0) { setSelectedModule(null); return }
    setSelectedModule(prev => (prev && allowedModules.includes(prev)) ? prev : (readStoredModule(allowedModules) ?? allowedModules[0]))
  }, [allowedModules])

  // Troca de módulo: persiste e vai pro Meu Dia (limpa a tela do módulo anterior).
  const setModule = useCallback((m: string) => {
    setSelectedModule(m)
    writeStoredModule(m)
    router.push('/inicio')
  }, [router])

  return (
    <ModuleContext.Provider value={{ allowedModules, modules, selectedModule, setModule, itemModule }}>
      {children}
    </ModuleContext.Provider>
  )
}
