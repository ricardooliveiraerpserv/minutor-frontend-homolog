'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, ApiError } from '@/lib/api'
import type { User, AuthResponse } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ user: User; requiresPasswordChange: boolean }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    // Sem checagem prévia de token: o cookie httpOnly não é legível por JS.
    // Pedimos /user; se não houver sessão, backend devolve 401 e api.ts limpa o cookie.
    try {
      const data = await api.get<{ user: any }>('/user')
      setUser(data.user)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega na montagem
  useEffect(() => { loadUser() }, [loadUser])

  // Recarrega quando a aba volta ao foco (ex: admin alterou permissões em outra aba)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadUser() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadUser])

  const login = async (email: string, password: string) => {
    // Rota interna do Next: chama backend, recebe token e seta cookie httpOnly.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ApiError(res.status, data.message ?? 'Erro ao autenticar', data)
    }
    const user: User = data.user
    setUser(user)
    return { user, requiresPasswordChange: data.requires_password_change === true }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch (e) {
      console.error('[auth] Falha ao limpar sessão:', e)
    }
    setUser(null)
  }

  const refreshUser = loadUser

  const hasPermission = (permission: string) => {
    if (user?.type === 'admin') return true
    const perms: string[] = (user as any)?.permissions ?? user?.extra_permissions ?? []
    return perms.includes('*') || perms.includes(permission)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
