// Step-up Microsoft do Cofre: abre popup no authorize (prompt=login → MFA
// corporativa fresca). O callback grava o step-up server-side; aqui detectamos a
// conclusão SÓ por POLLING em /vault/ms/status.
//
// IMPORTANTE: NÃO tocar em popup.closed / popup.postMessage — o COOP
// (Cross-Origin-Opener-Policy) do login da Microsoft rompe a referência do popup,
// e ler popup.closed lança/retorna true falsamente. O poll é a única fonte de verdade.

import { api } from '@/lib/api'

const POPUP_W = 480
const POPUP_H = 640
const TIMEOUT_MS = 150_000 // 2,5 min p/ concluir o login + MFA
const POLL_MS = 1500

export class StepUpCancelled extends Error {
  constructor() { super('Verificação Microsoft expirou') }
}

/** Abre o popup Microsoft e resolve quando o step-up é confirmado no servidor. */
export async function requestMicrosoftStepUp(): Promise<void> {
  const { authorize_url } = await api.post<{ authorize_url: string }>('/vault/ms/start', {})

  const left = window.screenX + (window.outerWidth - POPUP_W) / 2
  const top = window.screenY + (window.outerHeight - POPUP_H) / 2
  // Guardamos a referência só para abrir; nunca lemos .closed (COOP bloqueia).
  window.open(authorize_url, 'minutor-vault-ms', `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top}`)

  const started = Date.now()
  return new Promise<void>((resolve, reject) => {
    const timer = window.setInterval(async () => {
      if (Date.now() - started > TIMEOUT_MS) {
        window.clearInterval(timer)
        reject(new StepUpCancelled())
        return
      }
      try {
        const { active } = await api.get<{ active: boolean }>('/vault/ms/status')
        if (active) {
          window.clearInterval(timer)
          resolve()
        }
      } catch {
        /* transiente — próximo tick tenta de novo */
      }
    }, POLL_MS)
  })
}
