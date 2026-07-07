import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TOKEN_COOKIE = 'minutor_token'
const ADMIN_COOKIE = 'minutor_admin_token'
const INFO_COOKIE = 'minutor_impersonating'
const MAX_AGE = 60 * 60 * 24
const isProd = process.env.NODE_ENV === 'production'

/**
 * Inicia impersonation: troca o cookie minutor_token pelo token do usuário-alvo
 * (guardando o token do admin em minutor_admin_token p/ voltar depois).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.user_id) return NextResponse.json({ message: 'user_id obrigatório' }, { status: 400 })

  const store = await cookies()
  // Per-aba: o token real DESTA aba vem no Authorization (sessionStorage via api.ts). Cookie é fallback.
  const currentToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || store.get(TOKEN_COOKIE)?.value
  if (!currentToken) return NextResponse.json({ message: 'Não autenticado' }, { status: 401 })

  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'
  const upstream = await fetch(`${backendUrl}/api/v1/impersonate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${currentToken}` },
    body: JSON.stringify({ user_id: body.user_id }),
  })
  const data = await upstream.json().catch(() => ({}))
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status })

  const token: string | undefined = data.token
  if (!token) return NextResponse.json({ message: 'Resposta inválida do servidor' }, { status: 500 })

  // Preserva o token do ADMIN ORIGINAL (não sobrescreve se já estiver impersonando).
  const adminToken = store.get(ADMIN_COOKIE)?.value ?? currentToken
  // Per-aba: devolve os tokens pro client guardar no sessionStorage (impersonation isolada por aba).
  const res = NextResponse.json({ user: data.user, token, adminToken }, { status: 200 })
  res.cookies.set({ name: ADMIN_COOKIE, value: adminToken, httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
  res.cookies.set({ name: TOKEN_COOKIE, value: token, httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
  // Cookie legível pelo banner (não é o token — só nome/tipo/vínculo).
  // Sem encodeURIComponent manual: o próprio Next já URL-encoda o valor (senão fica 2x).
  res.cookies.set({ name: INFO_COOKIE, value: JSON.stringify(data.user ?? {}), httpOnly: false, secure: isProd, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
  return res
}
