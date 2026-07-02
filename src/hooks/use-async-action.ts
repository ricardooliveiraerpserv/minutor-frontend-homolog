'use client'

import { useCallback, useRef, useState } from 'react'

export type AsyncStatus = 'idle' | 'running' | 'success' | 'error'

export interface UseAsyncActionOptions<R> {
  /** ms para voltar a 'idle' depois de success/error (0 = permanece no estado). Default 1500. */
  resetAfter?: number
  onSuccess?: (result: R) => void
  onError?: (error: unknown) => void
}

/**
 * Fase 2 (Confiança) — encapsula uma ação assíncrona com estado idle/running/success/error
 * e TRAVA DE REENTRADA (impede duplo-clique / dupla execução da mesma ação).
 * Base do <AsyncButton> e de qualquer handler que precise de feedback + guarda.
 *
 * `run` nunca relança: captura o erro em `error`/status='error' (evita unhandled rejection
 * em onClick). Quem precisa reagir usa `onError`/`onSuccess` ou o retorno.
 */
export function useAsyncAction<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  opts: UseAsyncActionOptions<R> = {},
) {
  const { resetAfter = 1500, onSuccess, onError } = opts
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<unknown>(null)
  const inFlight = useRef(false)  // trava síncrona — o 2º clique é ignorado antes de qualquer setState
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setStatus('idle'); setError(null)
  }, [])

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    if (inFlight.current) return undefined   // já executando → não dispara de novo
    inFlight.current = true
    if (timer.current) clearTimeout(timer.current)
    setStatus('running'); setError(null)
    try {
      const result = await fn(...args)
      setStatus('success'); onSuccess?.(result)
      if (resetAfter > 0) timer.current = setTimeout(() => setStatus('idle'), resetAfter)
      return result
    } catch (e) {
      setStatus('error'); setError(e); onError?.(e)
      if (resetAfter > 0) timer.current = setTimeout(() => setStatus('idle'), resetAfter)
      return undefined
    } finally {
      inFlight.current = false
    }
  }, [fn, resetAfter, onSuccess, onError])

  return { run, status, error, reset, running: status === 'running' }
}
