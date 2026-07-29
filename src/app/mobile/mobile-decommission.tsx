'use client'

import { useEffect } from 'react'

// Fluxo mobile/PWA descontinuado. Qualquer /mobile/* renderiza isto: DESREGISTRA o
// service worker antigo + limpa os caches e só então faz um location.replace HARD pro
// app completo (/inicio). Precisa ser client-side (não um redirect() de servidor):
// o redirect de servidor pula o mount e o SW velho continuava vivo, re-empurrando o
// usuário pro /mobile (o "traz a tela certa e volta"). Aqui o SW morre de fato antes
// de sair, então não há mais bounce e o ícone da tela inicial passa a abrir o Minutor.
export function MobileDecommission() {
  useEffect(() => {
    let done = false
    const go = () => { if (!done) { done = true; window.location.replace('/inicio') } }
    ;(async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
        }
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch { /* segue pro redirect mesmo se a limpeza falhar */ }
      go()
    })()
    // Rede de segurança: se algo travar, redireciona em 1.5s de qualquer jeito.
    const t = setTimeout(go, 1500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0b', color: '#8a8a8a', fontSize: 14,
    }}>
      Abrindo o Minutor…
    </div>
  )
}
