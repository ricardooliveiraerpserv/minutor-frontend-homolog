import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { tenantSlugFromHost } from '@/lib/tenant'

const TOKEN_COOKIE = 'minutor_token'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  // Per-aba: revoga o token DESTA aba (Authorization vindo do sessionStorage) se presente; senão o cookie.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || cookieStore.get(TOKEN_COOKIE)?.value
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'
  const tenant = (req.headers.get('x-tenant') ?? '').trim() || tenantSlugFromHost(req.headers.get('host'))

  // Tenta revogar o token no backend; se falhar, ainda limpa o cookie local.
  if (token) {
    try {
      await fetch(`${backendUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
        body: '{}',
      })
    } catch (e) {
      console.error('[auth/logout] falha ao revogar token no backend:', e)
    }
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
