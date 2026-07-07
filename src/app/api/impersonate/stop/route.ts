import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TOKEN_COOKIE = 'minutor_token'
const ADMIN_COOKIE = 'minutor_admin_token'
const INFO_COOKIE = 'minutor_impersonating'
const MAX_AGE = 60 * 60 * 24
const isProd = process.env.NODE_ENV === 'production'

/** Encerra impersonation: restaura o token do admin e limpa os cookies auxiliares. */
export async function POST() {
  const store = await cookies()
  const adminToken = store.get(ADMIN_COOKIE)?.value
  const res = NextResponse.json({ ok: true })
  if (adminToken) {
    res.cookies.set({ name: TOKEN_COOKIE, value: adminToken, httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
  }
  res.cookies.set({ name: ADMIN_COOKIE, value: '', path: '/', maxAge: 0 })
  res.cookies.set({ name: INFO_COOKIE, value: '', path: '/', maxAge: 0 })
  return res
}
