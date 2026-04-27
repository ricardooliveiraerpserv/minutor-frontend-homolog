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
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('minutor_token')
    : null

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}))
    const message = body.message ?? 'Não autenticado'

    // No endpoint de login o 401 é credencial errada — não redireciona nem limpa token
    const isLoginEndpoint = path === '/auth/login'
    if (!isLoginEndpoint && typeof window !== 'undefined') {
      localStorage.removeItem('minutor_token')
      window.location.href = '/login'
    }

    throw new ApiError(401, message)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const details = body.details
    const detailsMsg = Array.isArray(details) ? details.join('; ') : (typeof details === 'string' ? details : undefined)
    throw new ApiError(res.status, detailsMsg ?? body.detailMessage ?? body.message ?? `Erro ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
