import { NextResponse } from 'next/server'

const TOKEN_COOKIE = 'minutor_token'
const COOKIE_MAX_AGE = 60 * 60 * 24 // 24h, alinhado com SANCTUM_TOKEN_EXPIRATION
const isProd = process.env.NODE_ENV === 'production'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ message: 'Payload inválido' }, { status: 400 })
  }

  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'

  const upstream = await fetch(`${backendUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await upstream.json().catch(() => ({}))

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status })
  }

  const token: string | undefined = data.token ?? data.access_token
  if (!token) {
    return NextResponse.json({ message: 'Resposta inválida do servidor de autenticação' }, { status: 500 })
  }

  // Sessão POR ABA: devolve o token pro client guardar no sessionStorage (isolado por aba),
  // permitindo logins independentes em abas diferentes. O cookie httpOnly continua setado como
  // fallback (aba nova sem sessionStorage segue logada). Trade-off aceito: token legível por JS.
  const { token: _t, access_token: _at, ...safeData } = data
  const res = NextResponse.json({ ...safeData, token }, { status: 200 })
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}
