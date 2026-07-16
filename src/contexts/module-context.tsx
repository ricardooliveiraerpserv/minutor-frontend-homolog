'use client'

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useNavConfig, type NavModuleConfig, type NavTreeNode } from '@/contexts/nav-config-context'
import { readStoredModule, writeStoredModule } from '@/lib/modules'

// Resolvido a partir da TELA (nav_screens). `modules` = todos os módulos onde a tela aparece (reuso).
export interface ItemConf { module: string; modules: string[]; active: boolean; profiles: string[]; users: number[]; label?: string }

interface ModuleCtx {
  allowedModules: string[]              // keys dos módulos que o usuário pode ver
  modules: NavModuleConfig[]            // definições (label/icon/items) visíveis ao usuário
  selectedModule: string | null
  setModule: (key: string) => void
  itemModule: Record<string, string>   // href → moduleKey
  itemConfig: Record<string, ItemConf> // href → { módulo, ativo, perfis, usuários }
}

const ModuleContext = createContext<ModuleCtx>({ allowedModules: [], modules: [], selectedModule: null, setModule: () => {}, itemModule: {}, itemConfig: {} })

export const useModules = () => useContext(ModuleContext)

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { modules: navModules, screens } = useNavConfig()
  const router = useRouter()

  // Módulos visíveis: admin vê TODOS os ativos; demais perfis só os do seu cadastro (user.modules).
  // Ordenados por sort_order (a ordem definida no Configurador) — usado pela sidebar e pelo launcher.
  const modules = useMemo(() => {
    if (!user || user.type === 'cliente') return []
    // Menus independentes por perfil: cada usuário vê os módulos do SEU perfil (user.modules,
    // vindo de NavModule::keysForProfile). Admin tem os módulos dele (não vê mais por bypass —
    // senão veria as cópias de todos os perfis, duplicadas).
    // CONSULTOR/PARCEIRO entram aqui: o menu deles obedece a árvore do Configurador (a aba do
    // perfil era editável mas ignorada — o módulo era descartado justamente neste filtro).
    // CLIENTE segue de fora (sidebar própria no código): o menu dele é calculado por cliente
    // (dashboards filtrados por clienteContractCodes, Indicadores só p/ customer_id 220) e a
    // árvore, sendo estática, ainda não sabe expressar "só se tiver contrato X".
    const active = navModules.filter(m => m.active && m.key !== 'cliente').slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const mine = new Set((user as { modules?: string[] }).modules ?? [])
    return active.filter(m => mine.has(m.key))
  }, [user, navModules])

  const allowedModules = useMemo(() => modules.map(m => m.key), [modules])

  // Registro de telas (key → tela). Permissões/ativo vivem aqui (fonte única).
  const screenMap = useMemo(() => Object.fromEntries(screens.map(s => [s.key, s])), [screens])

  // href → config resolvida. Percorre a ÁRVORE de cada módulo visível, coletando em quais
  // módulos cada tela aparece (reuso), e cruza com o registro de telas p/ ativo/permissões.
  const itemConfig = useMemo(() => {
    const modulesByScreen: Record<string, string[]> = {}
    const walk = (nodes: NavTreeNode[], modKey: string) => nodes.forEach(n => {
      if (n.screen) { (modulesByScreen[n.screen] ??= []).includes(modKey) || modulesByScreen[n.screen].push(modKey) }
      if (n.children) walk(n.children, modKey)
    })
    modules.forEach(m => walk(m.items ?? [], m.key))

    const map: Record<string, ItemConf> = {}
    Object.entries(modulesByScreen).forEach(([key, mods]) => {
      const s = screenMap[key]
      map[key] = {
        module: mods[0],
        modules: mods,
        active: s ? s.active !== false : true,
        profiles: s?.profiles ?? [],
        users: s?.users ?? [],
        label: s?.label ?? undefined,
      }
    })
    return map
  }, [modules, screenMap])
  const itemModule = useMemo(() => Object.fromEntries(Object.entries(itemConfig).map(([k, v]) => [k, v.module])), [itemConfig])

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
    <ModuleContext.Provider value={{ allowedModules, modules, selectedModule, setModule, itemModule, itemConfig }}>
      {children}
    </ModuleContext.Provider>
  )
}
