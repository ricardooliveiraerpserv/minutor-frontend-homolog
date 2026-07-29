// ⚠️ PWA DESCONTINUADO — este arquivo virou um KILL-SWITCH.
// O service worker anterior tinha escopo "/" e dava clients.claim(), controlando a
// origem inteira e servindo o shell "/mobile" cacheado — o que "forçava o PWA" mesmo
// fora do fluxo mobile. Este SW não intercepta mais nada: ao ativar, limpa os caches,
// se desregistra e recarrega as abas controladas, removendo o SW de quem já o tinha.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    } catch {}
    try { await self.registration.unregister() } catch {}
    const clients = await self.clients.matchAll({ type: 'window' })
    for (const client of clients) {
      try { client.navigate(client.url) } catch {}
    }
  })())
})
// Sem listener de 'fetch': o SW deixa de interceptar navegação/assets.
