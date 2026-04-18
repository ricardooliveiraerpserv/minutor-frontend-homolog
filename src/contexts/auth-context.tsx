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
    const token = localStorage.getItem('minutor_token')
    if (!token) { setLoading(false); return }
    try {
      const data = await api.get<{ user: any }>('/user')
      setUser(data.user)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        localStorage.removeItem('minutor_token')
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
    const data = await api.post<any>('/auth/login', {
      email: email.toLowerCase().trim(),
      password,
    })
    localStorage.setItem('minutor_token', data.token ?? data.access_token)
    const user: User = data.user
    setUser(user)
    return { user, requiresPasswordChange: data.requires_password_change === true }
  }

  const logout = async () => {
    try { await api.post('/auth/logout', {}) } catch { /* ignora */ }
    localStorage.removeItem('minutor_token')
    setUser(null)
  }

  const refreshUser = loadUser

  const hasPermission = (permission: string) =>
    user?.type === 'admin' || (user?.extra_permissions ?? []).includes(permission)

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
