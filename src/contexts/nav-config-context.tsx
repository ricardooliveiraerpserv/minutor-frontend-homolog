'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
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

// Cache por-usuário (sessionStorage). A AppLayout é usada POR PÁGINA e re-monta a cada navegação;
// sem cache, o provider reinicia vazio e a sidebar pisca o NAV legado enquanto refaz o /nav-config.
// Com cache, o re-mount já inicia com o último nav-config → sem flash; o fetch atualiza em background.
const NAV_CACHE_KEY = (uid?: number | null) => `nav_config_v2_${uid ?? 'none'}`
type NavCache = { modules: NavModuleConfig[]; screens: NavScreen[]; screenActions: Record<string, ScreenActionDef[]>; permissions: string[]; deniedPermissions: Record<string, string[]> }
function readNavCache(uid?: number | null): NavCache | null {
  if (typeof window === 'undefined' || !uid) return null
  try { const raw = sessionStorage.getItem(NAV_CACHE_KEY(uid)); return raw ? JSON.parse(raw) : null } catch { return null }
}
function writeNavCache(uid: number | null | undefined, c: NavCache) {
  if (typeof window === 'undefined' || !uid) return
  try { sessionStorage.setItem(NAV_CACHE_KEY(uid), JSON.stringify(c)) } catch { /* noop */ }
}

export function NavConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const cached0 = useMemo(() => readNavCache(user?.id), [user?.id])
  const [modules, setModules] = useState<NavModuleConfig[]>(cached0?.modules ?? [])
  const [screens, setScreens] = useState<NavScreen[]>(cached0?.screens ?? [])
  const [screenActions, setScreenActions] = useState<Record<string, ScreenActionDef[]>>(cached0?.screenActions ?? {})
  const [permissions, setPermissions] = useState<string[]>(cached0?.permissions ?? [])
  const [deniedPermissions, setDeniedPermissions] = useState<Record<string, string[]>>(cached0?.deniedPermissions ?? {})
  const [loading, setLoading] = useState(!cached0)

  const reload = useCallback(() => {
    if (!user || user.type === 'cliente') { setModules([]); setScreens([]); setScreenActions({}); setPermissions([]); setDeniedPermissions({}); setLoading(false); return }
    api.get<{ data: NavModuleConfig[]; screens: NavScreen[]; screen_actions: Record<string, ScreenActionDef[]>; permissions?: string[]; denied_permissions?: Record<string, string[]> }>('/nav-config')
      .then(r => {
        const c: NavCache = { modules: r.data ?? [], screens: r.screens ?? [], screenActions: r.screen_actions ?? {}, permissions: [...new Set(r.permissions ?? [])], deniedPermissions: r.denied_permissions ?? {} }
        setModules(c.modules); setScreens(c.screens); setScreenActions(c.screenActions); setPermissions(c.permissions); setDeniedPermissions(c.deniedPermissions)
        writeNavCache(user?.id, c)
      })
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
