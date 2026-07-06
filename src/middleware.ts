import { NextResponse, type NextRequest } from 'next/server'

const TOKEN_COOKIE = 'minutor_token'

export function middleware(req: NextRequest) {
  // Sessão POR ABA: se a requisição já traz Authorization (o api.ts injeta do sessionStorage,
  // que é isolado por aba), respeita esse token. O cookie httpOnly compartilhado vira só fallback
  // (aba nova sem sessionStorage segue logada como o último usuário).
  if (req.headers.get('authorization')) return NextResponse.next()

  const token = req.cookies.get(TOKEN_COOKIE)?.value
  if (!token) return NextResponse.next()

  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/api/v1/:path*'],
}
