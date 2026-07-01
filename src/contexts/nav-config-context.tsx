'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'

/** Permissão por AÇÃO da tela: perfis liberados + usuários liberados (override+) + usuários retirados (override−). */
export interface ScreenAbility {
  profiles: string[]
  users: number[]
  deny_users: number[]
}

/** TELA — entidade única (key = href). As PERMISSÕES vivem aqui; alterar afeta todas as ocorrências. */
export interface NavScreen {
  key: string
  label: string | null
  route: string | null
  active: boolean
  profiles: string[]                                  // visibilidade no menu (perfis)
  users: number[]                                     // usuários esporádicos (acesso direto)
  abilities?: Record<string, ScreenAbility>           // permissões por ação (editar/excluir/...)
}

/** Nó da ÁRVORE de menu — apenas estrutura/referência. `screen` = folha (ref a NavScreen.key); `children` = subnível. */
export interface NavTreeNode {
  id: string
  screen?: string
  label?: string
  icon?: string          // ícone lucide da pasta (nome). Telas usam ícone próprio.
  hidden?: boolean       // oculto no menu deste perfil (cópia é independente)
  children?: NavTreeNode[]
}

export interface NavModuleConfig {
  id: number
  key: string
  label: string
  icon: string
  sort_order: number
  is_system: boolean
  active: boolean
  profiles: string[]     // perfis que veem o módulo (admin = bypass)
  items: NavTreeNode[]   // árvore de referências
}

/** Catálogo central de ações por tela (screen_actions) — define QUAIS ações cada rotina tem. */
export interface ScreenActionDef {
  action_key: string
  label: string
  description: string | null
}

interface NavConfigCtx {
  modules: NavModuleConfig[]
  screens: NavScreen[]
  screenActions: Record<string, ScreenActionDef[]>
  loading: boolean
  reload: () => void
  setScreenActionsFor: (screenKey: string, list: ScreenActionDef[]) => void
}

const Ctx = createContext<NavConfigCtx>({ modules: [], screens: [], screenActions: {}, loading: true, reload: () => {}, setScreenActionsFor: () => {} })

export const useNavConfig = () => useContext(Ctx)

export function NavConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [modules, setModules] = useState<NavModuleConfig[]>([])
  const [screens, setScreens] = useState<NavScreen[]>([])
  const [screenActions, setScreenActions] = useState<Record<string, ScreenActionDef[]>>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!user || user.type === 'cliente') { setModules([]); setScreens([]); setScreenActions({}); setLoading(false); return }
    api.get<{ data: NavModuleConfig[]; screens: NavScreen[]; screen_actions: Record<string, ScreenActionDef[]> }>('/nav-config')
      .then(r => { setModules(r.data ?? []); setScreens(r.screens ?? []); setScreenActions(r.screen_actions ?? {}) })
      .catch(() => { setModules([]); setScreens([]); setScreenActions({}) })
      .finally(() => setLoading(false))
  }, [user])

  useEffect(() => { reload() }, [reload])

  // Atualiza só o catálogo de ações de UMA tela (sem recarregar tudo — preserva edições do menu).
  const setScreenActionsFor = useCallback((screenKey: string, list: ScreenActionDef[]) => {
    setScreenActions(prev => ({ ...prev, [screenKey]: list }))
  }, [])

  return <Ctx.Provider value={{ modules, screens, screenActions, loading, reload, setScreenActionsFor }}>{children}</Ctx.Provider>
}
