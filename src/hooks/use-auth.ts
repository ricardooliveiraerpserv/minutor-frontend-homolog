'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import type { User, AuthResponse } from '@/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('minutor_token')
    if (!token) { setLoading(false); return }
    try {
      const data = await api.get<{ user: any }>('/user')
      const raw = data.user
      // Backend now returns roles as string[] directly
      const roles: string[] = Array.isArray(raw.roles)
        ? raw.roles.filter((r: any) => typeof r === 'string')
        : []
      setUser({ ...raw, roles })
    } catch (e) {
      // Só remove o token se for 401 (não autorizado de verdade)
      // Erros de rede/timeout no cold start do Render não devem deslogar o usuário
      if (e instanceof ApiError && e.status === 401) {
        localStorage.removeItem('minutor_token')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  const login = async (email: string, password: string) => {
    const data = await api.post<any>('/auth/login', {
      email: email.toLowerCase().trim(),
      password,
    })
    localStorage.setItem('minutor_token', data.token ?? data.access_token)
    const raw = data.user
    // Backend returns roles as string[] directly
    const roles: string[] = Array.isArray(raw?.roles)
      ? raw.roles.filter((r: any) => typeof r === 'string')
      : []
    const user: User = { ...raw, roles }
    setUser(user)
    return { user, requiresPasswordChange: data.requires_password_change === true }
  }

  const logout = async () => {
    try { await api.post('/auth/logout', {}) } catch { /* ignora */ }
    localStorage.removeItem('minutor_token')
    setUser(null)
  }

  const hasPermission = (permission: string) =>
    user?.roles?.includes('Administrator') ||
    user?.permissions?.includes(permission) ||
    false

  return { user, loading, login, logout, hasPermission }
}
