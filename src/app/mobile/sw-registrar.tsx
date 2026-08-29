'use client'

import { useEffect } from 'react'

// PWA/mobile DESCONTINUADO: em vez de registrar o SW, DESREGISTRA qualquer service worker antigo e limpa os
// caches. Isso impede que um SW cache-first legado sirva bundle velho no desktop (via clients.claim). Mantido
// montado no /mobile/layout para capturar quem ainda abrir rotas /mobile. Ver public/sw.js (kill-switch).
export function SwRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => { void r.unregister() }))
      .catch(() => {})
    if ('caches' in window) {
      caches.keys().then((ks) => ks.forEach((k) => { void caches.delete(k) })).catch(() => {})
    }
  }, [])

  return null
}
