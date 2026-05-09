import { NextResponse, type NextRequest } from 'next/server'

const TOKEN_COOKIE = 'minutor_token'

export function middleware(req: NextRequest) {
  const token = req.cookies.get(TOKEN_COOKIE)?.value
  if (!token) return NextResponse.next()

  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/api/v1/:path*'],
}
