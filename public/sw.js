// KILL-SWITCH — PWA/mobile descontinuado no homolog.
// Este service worker NÃO intercepta nada (sem listener de fetch): ele se AUTODESTRÓI ao ativar —
// limpa todos os caches, desregistra a si mesmo e recarrega as abas abertas. Assim o navegador volta a
// buscar SEMPRE o bundle fresco do servidor (fim do "asset velho servido do cache" no desktop).
// Servido com Cache-Control: no-store (next.config) para que instalações antigas peguem este kill-switch.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch (_) { /* ignore */ }
    try { await self.registration.unregister() } catch (_) { /* ignore */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach((c) => { try { c.navigate(c.url) } catch (_) { /* ignore */ } })
    } catch (_) { /* ignore */ }
  })())
})
