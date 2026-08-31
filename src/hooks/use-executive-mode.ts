'use client'

/**
 * Modo executivo REMOVIDO (a pedido) — stub neutro: sempre desligado.
 * Mantém a assinatura [enabled, toggle] pra não quebrar consumidores,
 * garantindo que o board sempre mostre o detalhe operacional completo.
 */
export function useExecutiveMode(): [boolean, (next?: boolean) => void] {
  return [false, () => {}]
}
