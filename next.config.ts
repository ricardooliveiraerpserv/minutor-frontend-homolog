import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

// Ambiente: respeita NEXT_PUBLIC_APP_ENV explícito (.env.local define 'local'
// nas bases locais desenv/replica). Sem ele, detecta pela URL do backend:
// `-dev.onrender.com` → dev; outros onrender → homolog; resto → production.
const APP_ENV =
  process.env.NEXT_PUBLIC_APP_ENV ??
  (BACKEND_URL.includes('-dev.onrender.com') ? 'dev' :
   BACKEND_URL.includes('onrender.com')      ? 'homolog' :
                                               'production')

const isProd = process.env.NODE_ENV === 'production'

// CSP: dev precisa 'unsafe-eval' para hot reload do React/Turbopack; prod usa política restritiva.
const cspProd = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.minutor.com.br",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspDev = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* ws://localhost:* https:",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: isProd ? cspProd : cspDev },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
]

const nextConfig: NextConfig = {
  // Build standalone só no caminho Docker/VPS (Dockerfile seta
  // NEXT_OUTPUT_STANDALONE=true): o Next traça só as deps de runtime para
  // `.next/standalone` (~73MB) em vez de copiar `node_modules` inteiro (~1,7GB)
  // na imagem — encolhe push/pull da imagem no deploy de produção.
  // Render (homolog/dev) roda `next start`, que NÃO suporta standalone, então
  // lá a env não é setada e o output fica padrão.
  output: process.env.NEXT_OUTPUT_STANDALONE === 'true' ? 'standalone' : undefined,
  // Permite build em DEV mesmo com erros TS — corrigir tipos não é prioridade do ambiente de teste
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: __dirname,
  },
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_APP_ENV: APP_ENV,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ]
  },
  async redirects() {
    return [
      // Rotas antigas do Cronograma — consolidadas em /cronograma (ADR 0009)
      { source: '/projetos/:id/etapas',           destination: '/projetos/:id/cronograma?view=operacao',      permanent: true },
      { source: '/projetos/:id/etapas/:stageId',  destination: '/projetos/:id/cronograma/:stageId',           permanent: true },
      { source: '/projetos/:id/planejamento',     destination: '/projetos/:id/cronograma?view=planejamento',  permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
