'use client'

import { useEffect } from 'react'

/**
 * Event bus leve pra sincronizar telas que vivem em segmentos de rota diferentes
 * (ex.: o header do projeto no layout vs. a tabela do cronograma na página filha).
 *
 * Caso de uso: editar uma data de atividade recalcula o `expected_end_date` no
 * backend; o header (card "Prazo de entrega") precisa refazer o fetch do projeto.
 * Como cada `useApiQuery` tem estado local (sem cache global), usamos um evento.
 */
const EVENT = 'minutor:project-updated'

export function notifyProjectUpdated(projectId: number) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId } }))
}

/** Dispara `cb` quando QUALQUER tela notificar update do projeto informado. */
export function useProjectUpdated(projectId: number | null | undefined, cb: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ projectId: number }>).detail?.projectId
      if (!projectId || id === projectId) cb()
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [projectId, cb])
}
