'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'

/**
 * Ações NEGADAS ao usuário logado, por tela — vindas do Configurador (AccessControl::deniedActionsFor).
 * Qualquer tela chama `isDenied(screenKey, actionKey)` p/ esconder/desabilitar botões. Fonte única de
 * verdade do "o que este perfil/usuário PODE fazer nesta tela". Admin → vazio (vê tudo).
 */
interface DeniedActionsCtx {
  denied: Record<string, string[]>
  isDenied: (screenKey: string, actionKey: string) => boolean
  reload: () => void
}

const Ctx = createContext<DeniedActionsCtx>({ denied: {}, isDenied: () => false, reload: () => {} })
export const useDeniedActions = () => useContext(Ctx)

export function DeniedActionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [denied, setDenied] = useState<Record<string, string[]>>({})

  const reload = useCallback(() => {
    if (!user) { setDenied({}); return }
    api.get<{ data: Record<string, string[]> }>('/my-denied-actions')
      .then(r => setDenied(r.data ?? {}))
      .catch(() => setDenied({}))
  }, [user])

  useEffect(() => { reload() }, [reload])

  const isDenied = useCallback((screenKey: string, actionKey: string) => (denied[screenKey] ?? []).includes(actionKey), [denied])

  return <Ctx.Provider value={{ denied, isDenied, reload }}>{children}</Ctx.Provider>
}
