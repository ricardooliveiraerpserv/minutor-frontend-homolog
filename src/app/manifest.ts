import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Minutor',
    short_name: 'Minutor',
    description: 'Lançamento rápido de horas e despesas',
    start_url: '/mobile',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0b',
    theme_color: '#0a0a0b',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcuts: [
      {
        name: 'Apontamento',
        short_name: 'Apontar',
        description: 'Lançar horas rapidamente',
        url: '/mobile/apontamento',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Despesa',
        short_name: 'Despesa',
        description: 'Registrar despesa',
        url: '/mobile/despesa',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}
