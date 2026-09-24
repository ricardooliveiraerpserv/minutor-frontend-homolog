import { api } from '@/lib/api'

// GET com cache curto por URL + dedup de requisições em voo. Uso: chamadas de "shell" (notificações,
// badges, etc.) que hoje re-disparam a CADA navegação porque o AppLayout re-monta. Com o cache, uma
// navegação que reabre o shell reusa o dado recente em vez de rebuscar. TTL < intervalo de poll → o
// poll ainda atualiza normalmente; só some a rajada redundante da navegação.

type Entry = { at: number; data: unknown; p?: Promise<unknown> }
const store = new Map<string, Entry>()

export function cachedGet<T>(url: string, maxAgeMs = 40000): Promise<T> {
  const now = Date.now()
  const e = store.get(url)
  if (e && e.data !== undefined && now - e.at < maxAgeMs) return Promise.resolve(e.data as T)
  if (e?.p) return e.p as Promise<T> // já tem uma busca em voo p/ esta URL → reusa (dedup)
  const p = api.get<T>(url)
    .then(d => { store.set(url, { at: Date.now(), data: d }); return d })
    .catch(err => { const cur = store.get(url); if (cur) cur.p = undefined; throw err })
  store.set(url, { at: e?.at ?? 0, data: e?.data, p })
  return p
}

/** Invalida uma URL (ex.: após uma ação que muda badges/notificações) para forçar refetch. */
export function bustCache(url: string) { store.delete(url) }
