'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'

export interface NavModuleConfig {
  id: number
  key: string
  label: string
  icon: string
  sort_order: number
  is_system: boolean
  active: boolean
  items: string[]   // keys do catálogo associadas a este módulo
}

interface NavConfigCtx {
  modules: NavModuleConfig[]
  loading: boolean
  reload: () => void
}

const Ctx = createContext<NavConfigCtx>({ modules: [], loading: true, reload: () => {} })

export const useNavConfig = () => useContext(Ctx)

export function NavConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [modules, setModules] = useState<NavModuleConfig[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!user || user.type === 'cliente') { setModules([]); setLoading(false); return }
    api.get<{ data: NavModuleConfig[] }>('/nav-config')
      .then(r => setModules(r.data ?? []))
      .catch(() => setModules([]))
      .finally(() => setLoading(false))
  }, [user])

  useEffect(() => { reload() }, [reload])

  return <Ctx.Provider value={{ modules, loading, reload }}>{children}</Ctx.Provider>
}
