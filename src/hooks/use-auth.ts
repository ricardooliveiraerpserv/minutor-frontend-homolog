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
      setUser(data.user)
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

  // Atualiza dados do usuário quando a janela volta ao foco (ex: admin alterou permissões em outra aba)
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

  const hasPermission = (permission: string) =>
    user?.type === 'admin' || false

  return { user, loading, login, logout, hasPermission }
}
