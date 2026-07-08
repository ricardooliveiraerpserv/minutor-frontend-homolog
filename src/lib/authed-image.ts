import { toRelativePath } from '@/lib/api'

// Endpoints de imagem (ex.: /api/v1/attachments/{id}/download) exigem token Bearer, que a tag
// <img> não envia — daí "imagem quebrada" (401). Aqui buscamos a imagem COM o token (igual às
// chamadas de API, via proxy do Next) e devolvemos um object URL carregável por qualquer <img>.
//
// Cache por path: a mesma foto (mesmo usuário em várias listas) só é buscada uma vez, e o object
// URL é COMPARTILHADO — por isso NÃO revogamos (o cache mantém vivo de propósito).
const cache = new Map<string, Promise<string>>()

export function fetchAuthedObjectUrl(rawUrl: string): Promise<string> {
  const path = toRelativePath(rawUrl)
  const hit = cache.get(path)
  if (hit) return hit

  const p = (async () => {
    const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_token') : null
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`img ${res.status}`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  })()

  cache.set(path, p)
  p.catch(() => cache.delete(path)) // não cacheia falha — permite retry
  return p
}
