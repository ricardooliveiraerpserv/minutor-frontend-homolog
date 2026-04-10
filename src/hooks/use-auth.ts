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
      const data = await api.get<{ user: User }>('/user')
      setUser(data.user)
    } catch {
      localStorage.removeItem('minutor_token')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  const login = async (email: string, password: string) => {
    const data = await api.post<AuthResponse>('/auth/login', { email, password })
    localStorage.setItem('minutor_token', data.token ?? data.access_token)
    setUser(data.user)
    return data.user
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
