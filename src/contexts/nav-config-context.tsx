'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'

/** Permissão por AÇÃO da tela: perfis liberados + usuários liberados (override+) + usuários retirados (override−). */
export interface ScreenAbility {
  profiles: string[]
  users: number[]
  deny_users: number[]
  deny_profiles?: string[]   // perfis p/ os quais a AÇÃO está desabilitada (olho fechado) — enforcement universal
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
  users?: number[]       // override de visibilidade: libera este nó só p/ estes usuários
  deny_users?: number[]  // override de visibilidade: esconde este nó (e filhos) p/ estes usuários
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
  permissions: string[]                                 // universo COMPLETO de permissões do sistema (BE)
  deniedPermissions: Record<string, string[]>           // permissões REVOGADAS por perfil { perfil: [perms] }
  loading: boolean
  reload: () => void
  setScreenActionsFor: (screenKey: string, list: ScreenActionDef[]) => void
  setDeniedPermissions: (map: Record<string, string[]>) => void
}

const Ctx = createContext<NavConfigCtx>({ modules: [], screens: [], screenActions: {}, permissions: [], deniedPermissions: {}, loading: true, reload: () => {}, setScreenActionsFor: () => {}, setDeniedPermissions: () => {} })

export const useNavConfig = () => useContext(Ctx)

export function NavConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [modules, setModules] = useState<NavModuleConfig[]>([])
  const [screens, setScreens] = useState<NavScreen[]>([])
  const [screenActions, setScreenActions] = useState<Record<string, ScreenActionDef[]>>({})
  const [permissions, setPermissions] = useState<string[]>([])
  const [deniedPermissions, setDeniedPermissions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!user || user.type === 'cliente') { setModules([]); setScreens([]); setScreenActions({}); setPermissions([]); setDeniedPermissions({}); setLoading(false); return }
    api.get<{ data: NavModuleConfig[]; screens: NavScreen[]; screen_actions: Record<string, ScreenActionDef[]>; permissions?: string[]; denied_permissions?: Record<string, string[]> }>('/nav-config')
      .then(r => { setModules(r.data ?? []); setScreens(r.screens ?? []); setScreenActions(r.screen_actions ?? {}); setPermissions([...new Set(r.permissions ?? [])]); setDeniedPermissions(r.denied_permissions ?? {}) })
      .catch(() => { setModules([]); setScreens([]); setScreenActions({}); setPermissions([]); setDeniedPermissions({}) })
      .finally(() => setLoading(false))
  }, [user])

  useEffect(() => { reload() }, [reload])

  // Atualiza só o catálogo de ações de UMA tela (sem recarregar tudo — preserva edições do menu).
  const setScreenActionsFor = useCallback((screenKey: string, list: ScreenActionDef[]) => {
    setScreenActions(prev => ({ ...prev, [screenKey]: list }))
  }, [])

  return <Ctx.Provider value={{ modules, screens, screenActions, permissions, deniedPermissions, loading, reload, setScreenActionsFor, setDeniedPermissions }}>{children}</Ctx.Provider>
}
