'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { presenceHeartbeat } from '@/lib/inbox'

/**
 * Presença GLOBAL do usuário logado.
 *
 * Montado uma única vez nos Providers (dentro do AuthProvider), portanto roda em
 * TODA tela autenticada — inclusive as que não usam o AppLayout (mobile/*, projetos/[id]/*).
 * Enquanto houver usuário logado e a aba estiver aberta, envia "online" a cada 2 min
 * (e imediatamente ao voltar o foco da aba).
 *
 * Janelas no backend (PresenceService): <5min = online, 5–15min = ausente, ≥15min = offline.
 */
export function PresenceHeartbeat() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    const beat = () => { presenceHeartbeat('online').catch(() => {}) }
    beat()
    const t = setInterval(beat, 120_000)
    const onVis = () => { if (document.visibilityState === 'visible') beat() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [userId])

  return null
}
