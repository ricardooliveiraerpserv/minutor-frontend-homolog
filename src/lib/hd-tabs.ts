// Armazenamento das abas de chamados abertos (Help Desk). Usa sessionStorage (escopo da sessão
// do navegador) — não persiste "para sempre" como localStorage. Chave por usuário.
// Util "folha" (sem React) → pode ser importado por qualquer lado sem ciclo de import.

export const HD_TABS_PREFIX = 'hd_open_tickets_'
export const hdTabsKey = (uid?: number | null) => `${HD_TABS_PREFIX}${uid ?? 'anon'}`

/** Limpa as abas de TODOS os usuários, em session E local (purga chaves legadas do localStorage). */
export function clearHdTabs() {
  if (typeof window === 'undefined') return
  try {
    for (const store of [window.sessionStorage, window.localStorage]) {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i)
        if (k && k.startsWith(HD_TABS_PREFIX)) store.removeItem(k)
      }
    }
    window.dispatchEvent(new Event('hd-tabs-changed'))
  } catch { /* noop */ }
}
