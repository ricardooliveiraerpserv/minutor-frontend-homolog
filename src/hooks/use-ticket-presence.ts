'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

export type TicketViewer = { id: number; name: string; type: string }

/**
 * Presença de visualização + detecção de mudança de um chamado (Help Desk).
 * Faz heartbeat a cada ~10s SÓ enquanto o chamado está aberto na tela:
 *  - `viewers`: outras pessoas vendo o chamado agora (nome + tipo) → olho.
 *  - `hasUpdate`: true quando o chamado mudou (nova interação/alteração) desde o load → botão Atualizar.
 * `acknowledge()` deve ser chamado depois de recarregar o chamado (zera o aviso e re-baseia).
 */
export function useTicketPresence(
  ticketId: number | null,
  opts?: { portal?: boolean; enabled?: boolean },
) {
  const portal = opts?.portal ?? false
  const enabled = (opts?.enabled ?? true) && !!ticketId
  const [viewers, setViewers] = useState<TicketViewer[]>([])
  const [hasUpdate, setHasUpdate] = useState(false)
  const baseline = useRef<string | null>(null)

  const path = portal
    ? `/help-desk/portal/tickets/${ticketId}/presence`
    : `/help-desk/tickets/${ticketId}/presence`

  const beat = useCallback(async () => {
    if (!ticketId) return
    try {
      const r = await api.post<{ viewers: TicketViewer[]; change_key: string }>(path, {})
      setViewers(Array.isArray(r?.viewers) ? r.viewers : [])
      const ck = r?.change_key ?? null
      if (baseline.current == null) baseline.current = ck
      else if (ck && ck !== baseline.current) setHasUpdate(true)
    } catch {
      /* silencioso — presença não pode atrapalhar a tela */
    }
  }, [ticketId, path])

  /** Após recarregar o chamado: some o aviso e re-baseia no próximo beat. */
  const acknowledge = useCallback(() => {
    setHasUpdate(false)
    baseline.current = null
  }, [])

  useEffect(() => {
    if (!enabled) return
    baseline.current = null
    setHasUpdate(false)
    setViewers([])
    beat()
    const iv = setInterval(beat, 10000)
    const onVis = () => { if (document.visibilityState === 'visible') beat() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [enabled, ticketId, beat])

  return { viewers, hasUpdate, acknowledge, beat }
}
