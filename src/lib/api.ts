const API_URL = '/api/v1'

/**
 * Garante que URLs de storage usem HTTPS.
 * Necessário como fallback enquanto APP_URL do backend não estiver configurado com https://.
 */
export function secureUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:\/\//, 'https://')
}

/**
 * Extrai apenas o pathname de uma URL completa.
 * Necessário porque o backend pode retornar URLs com host errado (APP_URL=http://localhost).
 * O proxy Next.js em /api/v1/* encaminha para o backend real.
 */
export function toRelativePath(url: string): string {
  try { return new URL(url).pathname } catch { return url }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Mensagem amigável a partir de um erro desconhecido (ApiError/Error/fallback). */
export function apiMessage(e: unknown, fallback = 'Ocorreu um erro'): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error && e.message) return e.message
  return fallback
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Auth POR ABA: se houver token no sessionStorage (isolado por aba), envia como Authorization —
  // o middleware respeita e NÃO sobrescreve com o cookie. Sem token no sessionStorage, cai no
  // fallback do cookie httpOnly (middleware injeta). Assim cada aba pode ter um login diferente.
  const sessionToken = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_token') : null
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: HeadersInit = {
    // FormData: browser monta Content-Type com boundary correto; não setar manualmente.
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    Accept: 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    // Tela de ORIGEM (pathname+query) → o backend usa p/ o guard de ações por-tela do Configurador
    // (AccessControl::allowsRequest). Resolve telas servidas pelo mesmo controller (ex.: contratos kanban/pipeline).
    ...(typeof window !== 'undefined' ? { 'X-Screen-Path': window.location.pathname + window.location.search } : {}),
    ...options.headers,
  }

  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'same-origin',
    // Nunca servir GET do cache HTTP do browser: num SPA autenticado o refetch
    // pós-mutação precisa SEMPRE bater no servidor (senão a tela fica stale e parece
    // que "nada aconteceu"). Non-GET ignoram esta opção.
    cache: 'no-store',
    ...options,
    headers,
  })

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}))
    const message = body.message ?? 'Não autenticado'

    // Só redireciona se: (1) não estamos no endpoint de login, (2) NÃO estamos numa rota
    // PÚBLICA (acessível deslogado). Um 401 numa rota pública — tipicamente o AuthProvider
    // checando /user numa aba sem sessão — NÃO deve chutar o visitante pro /login: ele veio
    // por um link aberto (formulário de competências/candidato, recuperação de senha). Só
    // limpamos o estado (o caller trata o 401) e seguimos na própria página.
    const isLoginEndpoint = path === '/auth/login'
    const inBrowser = typeof window !== 'undefined'
    const PUBLIC_PATH_PREFIXES = ['/login', '/esqueci-senha', '/skills/', '/candidato/']
    const onPublicPage = inBrowser && PUBLIC_PATH_PREFIXES.some(p => window.location.pathname.startsWith(p))

    if (!isLoginEndpoint && inBrowser && !onPublicPage) {
      // Limpa o token DESTA aba e revoga só ele (Authorization) — não mexe no cookie de outra aba.
      const stoken = window.sessionStorage.getItem('minutor_token')
      try { window.sessionStorage.removeItem('minutor_token') } catch { /* noop */ }
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: stoken ? { Authorization: `Bearer ${stoken}` } : {} })
      } catch { /* segue mesmo se falhar */ }
      window.location.href = '/login'
    }

    throw new ApiError(401, message)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const details = body.details
    const detailsMsg = Array.isArray(details) ? details.join('; ') : (typeof details === 'string' ? details : undefined)
    throw new ApiError(res.status, detailsMsg ?? body.detailMessage ?? body.message ?? `Erro ${res.status}`, body)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

function serialize(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined
  if (typeof FormData !== 'undefined' && body instanceof FormData) return body
  return JSON.stringify(body)
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: serialize(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: serialize(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: serialize(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, body !== undefined
      ? { method: 'DELETE', body: serialize(body) }
      : { method: 'DELETE' }),
}
