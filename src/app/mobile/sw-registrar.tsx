'use client'

import { useEffect } from 'react'

// PWA descontinuado. Antes este componente REGISTRAVA o service worker; agora ele
// faz o contrário: DESREGISTRA qualquer SW remanescente e limpa os caches, pra parar
// de "forçar" o shell mobile em quem já tinha o SW instalado. O /sw.js virou um
// kill-switch (ver public/sw.js) que cobre também as abas fora do fluxo /mobile.
export function SwRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {})
    }
    if (typeof caches !== 'undefined') {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {})
    }
  }, [])

  return null
}
