const CACHE = 'minutor-v3'

// Recursos estáticos para cache offline (PWA mobile)
const STATIC = [
  '/mobile',
  '/mobile/apontamento',
  '/mobile/despesa',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Requisições de API: network-first, sem cache
  if (url.pathname.startsWith('/api/') || url.hostname !== location.hostname) {
    e.respondWith(fetch(request).catch(() => new Response('Offline', { status: 503 })))
    return
  }

  // Navegação (páginas HTML): network-first, fallback para cache
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
        .catch(() => caches.match(request).then(r => r ?? caches.match('/mobile')))
    )
    return
  }

  // Demais assets (JS/CSS/_next): NETWORK-FIRST. Cache-first servia bundle ANTIGO após
  // deploy (chunks ficavam presos no cache 'minutor-vX'), fazendo features novas não
  // aparecerem. Agora busca sempre o fresco; o cache só atende offline (fallback).
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
