'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncStatus = 'idle' | 'running' | 'success' | 'error'

export interface UseAsyncActionOptions<R> {
  /** ms para voltar a 'idle' depois de success/error (0 = permanece no estado). Default 1500. */
  resetAfter?: number
  /** Regra 5 — só mostra 'running' se a ação passar deste tempo (evita flash em ações instantâneas). Default 120ms. */
  spinnerDelay?: number
  /** Regra 5 — uma vez visível, o 'running' fica no mínimo este tempo (evita piscada). Default 320ms. */
  minVisible?: number
  onSuccess?: (result: R) => void
  onError?: (error: unknown) => void
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Fase 2 (Confiança) — encapsula uma ação assíncrona com estado idle/running/success/error
 * e TRAVA DE REENTRADA (impede duplo-clique / dupla execução).
 *
 * Regra 2: NÃO depende de botão — serve para drag&drop, atalhos, toggle, menu, upload, ações
 * automáticas. O <AsyncButton> é só uma casca visual em cima disso.
 * Regra 4: fluxo único idle → running → success | error, sem exceções.
 * Regra 5: anti-flicker — 'running' atrasado por `spinnerDelay`; se aparecer, dura `minVisible`.
 *
 * `run` nunca relança (captura em `error`/status='error') — evita unhandled rejection em onClick.
 * Quem precisa reagir usa `onError`/`onSuccess` ou o retorno.
 */
export function useAsyncAction<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  opts: UseAsyncActionOptions<R> = {},
) {
  const { resetAfter = 1500, spinnerDelay = 120, minVisible = 320, onSuccess, onError } = opts
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [pending, setPending] = useState(false)  // IMEDIATO (do clique ao fim) — p/ disabled/cross-disable
  const [error, setError] = useState<unknown>(null)
  const inFlight = useRef(false)  // trava síncrona — o 2º disparo é ignorado antes de qualquer setState
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  useEffect(() => () => { alive.current = false; if (resetTimer.current) clearTimeout(resetTimer.current) }, [])

  const set = useCallback((s: AsyncStatus) => { if (alive.current) setStatus(s) }, [])

  const reset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    set('idle'); if (alive.current) setError(null)
  }, [set])

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    if (inFlight.current) return undefined   // já executando → não dispara de novo (Regra 3/P4)
    inFlight.current = true
    if (resetTimer.current) clearTimeout(resetTimer.current)
    if (alive.current) { setError(null); setPending(true) }   // pending IMEDIATO (disabled sem esperar o spinner)

    // Regra 5: o 'running' só aparece se a ação demorar mais que spinnerDelay.
    let shownAt: number | null = null
    const spinnerTimer = setTimeout(() => { shownAt = now(); set('running') }, spinnerDelay)

    let result: R | undefined
    let caught: unknown
    let hasError = false
    try {
      result = await fn(...args)
    } catch (e) {
      caught = e; hasError = true
    } finally {
      clearTimeout(spinnerTimer)
    }

    // Regra 5: se o spinner chegou a aparecer, segura o mínimo visível.
    if (shownAt !== null) {
      const elapsed = now() - shownAt
      if (elapsed < minVisible) await sleep(minVisible - elapsed)
    }

    if (alive.current) setPending(false)
    if (hasError) { set('error'); if (alive.current) setError(caught); onError?.(caught) }
    else { set('success'); onSuccess?.(result as R) }

    if (resetAfter > 0) resetTimer.current = setTimeout(() => set('idle'), resetAfter)
    inFlight.current = false
    return hasError ? undefined : result
  }, [fn, resetAfter, spinnerDelay, minVisible, onSuccess, onError, set])

  return { run, status, error, reset, running: status === 'running', pending }
}
