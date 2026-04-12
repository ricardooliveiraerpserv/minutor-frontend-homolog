const API_URL = '/api/v1'

/**
 * Garante que URLs de storage usem HTTPS.
 * Necessário como fallback enquanto APP_URL do backend não estiver configurado com https://.
 */
export function secureUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:\/\//, 'https://')
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
    throw new ApiError(res.status, body.details ?? body.message ?? `Erro ${res.status}`)
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
