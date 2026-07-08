'use client'

import { useEffect, useState } from 'react'
import { fetchAuthedObjectUrl } from '@/lib/authed-image'

// Já carregável por <img> sem auth? (data:, blob:, ou URL externa que não é a nossa API)
function passthrough(url?: string | null): string | undefined {
  if (!url) return undefined
  if (/^(data:|blob:)/.test(url)) return url
  if (/^https?:\/\//.test(url) && !/\/api\/v1\/|minutor/.test(url)) return url
  return undefined // relativa /api/... ou host da API → precisa de fetch autenticado
}

/**
 * Resolve uma URL de imagem (inclusive endpoints autenticados como /api/v1/attachments/...)
 * para um src que o <img> consegue carregar. URLs públicas passam direto; as autenticadas
 * são buscadas com o token e viram object URL.
 */
export function useAuthedImage(rawUrl?: string | null): string | undefined {
  const [src, setSrc] = useState<string | undefined>(() => passthrough(rawUrl))

  useEffect(() => {
    const direct = passthrough(rawUrl)
    if (direct !== undefined || !rawUrl) { setSrc(direct); return }
    let alive = true
    fetchAuthedObjectUrl(rawUrl)
      .then(u => { if (alive) setSrc(u) })
      .catch(() => { if (alive) setSrc(undefined) })
    return () => { alive = false }
  }, [rawUrl])

  return src
}
