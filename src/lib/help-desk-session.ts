// Sessão de Atendimento (P2 — Modo Atendimento, Fase 1).
//
// Snapshot client-side (sessionStorage, por aba) do contexto de trabalho do consultor:
// origem da fila (lista/kanban), filtros aplicados, e a LISTA ORDENADA de IDs exatamente
// como ele a via. "Próximo chamado" caminha por essa ordem cacheada — sem recalcular a
// fila, sem consulta desnecessária, navegação instantânea.
//
// Preparado para o P5 (Modo Atendimento contínuo): o avanço automático apenas percorre
// `ids` e, quando esgotar, poderá recarregar a fila com os mesmos `filters`.

export interface HelpDeskSession {
  source: 'list' | 'kanban'
  filters: Record<string, string | boolean>
  ids: number[]
  label: string
}

const KEY = 'hd_session'

export function startSession(s: HelpDeskSession): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* */ }
}

export function getSession(): HelpDeskSession | null {
  try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as HelpDeskSession) : null } catch { return null }
}

export function clearSession(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* */ }
}

/** Próximo chamado na ordenação atual (ou null no fim da fila / sem sessão). */
export function nextTicketId(currentId: number): number | null {
  const s = getSession()
  if (!s) return null
  const i = s.ids.indexOf(currentId)
  return (i >= 0 && i + 1 < s.ids.length) ? s.ids[i + 1] : null
}

/** Posição atual na fila (1-based) e total — para feedback "3 / 20". */
export function queuePosition(currentId: number): { pos: number; total: number } | null {
  const s = getSession()
  if (!s) return null
  const i = s.ids.indexOf(currentId)
  return i >= 0 ? { pos: i + 1, total: s.ids.length } : null
}

/** Rota da fila de origem (filtros são restaurados pela própria página ao montar). */
export function queueHref(source: 'list' | 'kanban' | undefined): string {
  return source === 'kanban' ? '/help-desk/fila' : '/help-desk/tickets'
}
