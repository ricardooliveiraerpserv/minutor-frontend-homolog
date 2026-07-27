import { NextResponse, type NextRequest } from 'next/server'

const TOKEN_COOKIE = 'minutor_token'

/**
 * Next 16 renomeou o convention `middleware` → `proxy`. Este arquivo acumula duas funções:
 *
 * 1) Proxy da API (/api/v1/*): injeta Authorization do cookie httpOnly quando a aba não
 *    trouxe o Bearer do sessionStorage (sessão por aba). Comportamento herdado do antigo
 *    middleware.ts — inalterado.
 *
 * 2) CSP com NONCE nas páginas (auditoria do Cofre, item 1 — ALTA): remove 'unsafe-inline'
 *    do script-src e passa a exigir nonce por requisição + 'strict-dynamic'. Assim, script
 *    injetado (XSS) não roda — a garantia zero-knowledge do cofre depende do navegador limpo.
 *    Mantém 'wasm-unsafe-eval' (Argon2id via hash-wasm no cofre) e 'style-src unsafe-inline'
 *    (React aplica estilos inline por ATRIBUTO style=, que nonce não cobre).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── 1) Proxy da API — injeta Authorization ────────────────────────────────
  if (pathname.startsWith('/api/v1/')) {
    if (req.headers.get('authorization')) return NextResponse.next()
    const token = req.cookies.get(TOKEN_COOKIE)?.value
    if (!token) return NextResponse.next()
    const headers = new Headers(req.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return NextResponse.next({ request: { headers } })
  }

  // ── 2) CSP com nonce para páginas ─────────────────────────────────────────
  const isDev = process.env.NODE_ENV !== 'production'
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Mesmas diretivas de antes (next.config.ts), com script-src migrado para nonce.
  const csp = [
    "default-src 'self'",
    // 'sha256-…' libera o script inline do next-themes (previne flash de tema; conteúdo
    //  determinístico pela config do ThemeProvider). Recomputar se next-themes/config mudar.
    `script-src 'self' 'nonce-${nonce}' 'sha256-zjP2BXYgSCCnXNMXI2IL1yRydoQdsGR/uCCr6kyKsD0=' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${isDev ? ' http:' : ''}`,
    "font-src 'self' data:",
    isDev
      ? "connect-src 'self' http://localhost:* ws://localhost:* https:"
      : "connect-src 'self' https://api.minutor.com.br",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    // Proxy da API (injeção de Authorization)
    '/api/v1/:path*',
    // CSP nas páginas: tudo, menos api, assets estáticos e prefetches do next/link
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
