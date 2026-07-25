// Step-up Microsoft do Cofre: abre popup no authorize (prompt=login → MFA
// corporativa fresca) e espera o token efêmero chegar via postMessage do callback.
// O token vale 5 min e só serve junto do Sanctum + master password.

import { api } from '@/lib/api'

const POPUP_W = 480
const POPUP_H = 640
const TIMEOUT_MS = 3 * 60_000

export class StepUpCancelled extends Error {
  constructor() { super('Verificação Microsoft cancelada') }
}

/** Abre o popup Microsoft e resolve com o stepup_token. Rejeita se fechar/expirar. */
export async function requestMicrosoftStepUp(): Promise<string> {
  const { authorize_url } = await api.post<{ authorize_url: string }>('/vault/ms/start', {})

  const left = window.screenX + (window.outerWidth - POPUP_W) / 2
  const top = window.screenY + (window.outerHeight - POPUP_H) / 2
  const popup = window.open(authorize_url, 'minutor-vault-ms', `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top}`)
  if (!popup) throw new Error('Popup bloqueado — libere popups para o Minutor.')

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      window.clearInterval(closedPoll)
      window.clearTimeout(timeout)
      fn()
    }

    const onMessage = (e: MessageEvent) => {
      // o callback roda no domínio da API — validamos o formato, não a origem exata
      const data = e.data as { type?: string; token?: string | null }
      if (data?.type !== 'vault-ms-stepup') return
      if (data.token) finish(() => resolve(data.token as string))
      else finish(() => reject(new Error('Conta Microsoft não autorizada para este cofre.')))
    }
    window.addEventListener('message', onMessage)

    const closedPoll = window.setInterval(() => {
      if (popup.closed) finish(() => reject(new StepUpCancelled()))
    }, 500)

    const timeout = window.setTimeout(() => {
      try { popup.close() } catch { /* noop */ }
      finish(() => reject(new StepUpCancelled()))
    }, TIMEOUT_MS)
  })
}
