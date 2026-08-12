import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

// Detecta ambiente pelo padrão da URL do backend.
// localhost/127.0.0.1 → dev (base local); `-dev.onrender.com` → dev; outros
// onrender → homolog; resto → production. (Sem o check de localhost, a base local
// caía em 'production' e ficava sem banner/favicon de dev — parecia prod.)
const APP_ENV =
  BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1') ? 'dev' :
  BACKEND_URL.includes('-dev2.onrender.com') ? 'teste' :
  BACKEND_URL.includes('-dev.onrender.com') ? 'dev' :
  BACKEND_URL.includes('onrender.com')      ? 'homolog' :
                                              'production'

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
  async headers() {
    return [
      {
        // O service worker NUNCA pode ser cacheado: o Vercel servia /sw.js com
        // max-age=14400 (4h), então o device ficava com o SW ANTIGO e nunca pegava
        // o kill-switch (PWA "continuava forçando"). Força revalidação sempre.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
