import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TOKEN_COOKIE = 'minutor_token'

// Credenciais para upload DIRETO no backend (ex.: api.minutor.com.br), evitando o
// limite de body (~4.5MB) da borda da Vercel no caminho /api/v1 (middleware + rewrite).
// O backend aceita até 20MB (PHP) e o CORS já libera o domínio do app.
//
// A5 (segurança): NÃO devolvemos mais o token de SESSÃO de 24h para o JS. Trocamos,
// server-side, pelo endpoint /upload-token (ability 'file-upload', validade 10 min).
// Assim, mesmo que o token vaze por XSS, expira rápido — a janela cai de 24h para 10min.
export async function GET() {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ message: 'Não autenticado' }, { status: 401 })
  }

  const apiBase = process.env.BACKEND_URL ?? 'http://localhost:8000'

  try {
    const res = await fetch(`${apiBase}/api/v1/upload-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ message: 'Falha ao gerar token de upload' }, { status: 502 })
    }

    const data = await res.json()
    // devolve o token EFÊMERO (não o de sessão)
    return NextResponse.json({ token: data.token, apiBase })
  } catch {
    return NextResponse.json({ message: 'Falha ao gerar token de upload' }, { status: 502 })
  }
}
