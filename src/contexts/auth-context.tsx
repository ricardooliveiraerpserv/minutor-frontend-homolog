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
    // Sessão POR ABA: device_name ÚNICO por aba. O BE revoga tokens do mesmo device_name no login;
    // com nome único por aba, logar numa aba NÃO derruba o token das outras (antes todos usavam
    // 'api-token' e um login apagava o token do outro → "ambas deslogam").
    let device = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_device') : null
    if (!device && typeof window !== 'undefined') {
      device = 'tab-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      try { window.sessionStorage.setItem('minutor_device', device) } catch { /* noop */ }
    }
    // Rota interna do Next: chama backend, recebe token (guardado no sessionStorage) e seta cookie fallback.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email.toLowerCase().trim(), password, device_name: device ?? undefined }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ApiError(res.status, data.message ?? 'Erro ao autenticar', data)
    }
    const user: User = data.user
    // Sessão POR ABA: guarda o token no sessionStorage (isolado por aba). Assim logar nesta aba
    // NÃO afeta o login das outras abas — cada uma usa seu próprio token via api.ts.
    if (data.token && typeof window !== 'undefined') {
      try { window.sessionStorage.setItem('minutor_token', data.token) } catch { /* noop */ }
    }
    setUser(user)
    return { user, requiresPasswordChange: data.requires_password_change === true }
  }

  const logout = async () => {
    // Sessão POR ABA: revoga no BE o token DESTA aba (via Authorization), não o cookie compartilhado
    // — assim deslogar aqui NÃO derruba as outras abas.
    const stoken = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_token') : null
    try { window.sessionStorage.removeItem('minutor_token') } catch { /* noop */ }
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: stoken ? { Authorization: `Bearer ${stoken}` } : {},
      })
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
