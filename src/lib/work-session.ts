// Sessão de Trabalho (Modo Atendimento) — conceito de PLATAFORMA, client-side.
//
// A vivência (fila/posição/timers) vive em localStorage e SOBREVIVE a refresh, fechamento
// acidental da aba e perda de conexão — até o usuário encerrar. Os eventos/métricas são
// gravados no servidor (durável p/ IA). Reutilizável no futuro (comercial/aprovação/financeira).

import { api } from '@/lib/api'

export interface WorkSession {
  serverId: number | null
  scope: string
  source: 'list' | 'kanban'
  filters: Record<string, string | boolean>
  label: string
  ids: number[]
  startedAt: number          // epoch ms
  paused: boolean
  pausedAccumMs: number       // tempo pausado acumulado
  pausedSince: number | null  // epoch ms do início da pausa atual
  atendidos: number           // contador vivo (a verdade é o servidor no final)
  pulados: number
}

const KEY = 'hd_work_session'

export function getWorkSession(): WorkSession | null {
  try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as WorkSession) : null } catch { return null }
}
function save(s: WorkSession): void { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* */ } }
export function clearWorkSession(): void { try { localStorage.removeItem(KEY) } catch { /* */ } }

/** Inicia a sessão (servidor + local) e devolve o primeiro chamado a abrir. */
export async function startWorkSession(p: { scope: string; source: 'list' | 'kanban'; filters: Record<string, string | boolean>; label: string; ids: number[] }): Promise<number | null> {
  let serverId: number | null = null
  try {
    const r = await api.post<{ data: { id: number } }>('/work-sessions', { scope: p.scope, context: { label: p.label, source: p.source, filters: p.filters, total: p.ids.length } })
    serverId = r?.data?.id ?? null
  } catch { /* segue offline; eventos tentam depois */ }
  const s: WorkSession = { serverId, scope: p.scope, source: p.source, filters: p.filters, label: p.label, ids: p.ids, startedAt: Date.now(), paused: false, pausedAccumMs: 0, pausedSince: null, atendidos: 0, pulados: 0 }
  save(s)
  return s.ids[0] ?? null
}

export function wsActive(): boolean { return getWorkSession() !== null }
export function wsContains(id: number): boolean { const s = getWorkSession(); return !!s && s.ids.includes(id) }
export function wsPosition(id: number): { pos: number; total: number } | null { const s = getWorkSession(); if (!s) return null; const i = s.ids.indexOf(id); return i >= 0 ? { pos: i + 1, total: s.ids.length } : { pos: 0, total: s.ids.length } }
export function wsNext(id: number): number | null { const s = getWorkSession(); if (!s) return null; const i = s.ids.indexOf(id); return (i >= 0 && i + 1 < s.ids.length) ? s.ids[i + 1] : null }
export function wsPrev(id: number): number | null { const s = getWorkSession(); if (!s) return null; const i = s.ids.indexOf(id); return i > 0 ? s.ids[i - 1] : null }

/** Tempo decorrido da sessão (descontando pausas), em ms. */
export function wsElapsedMs(s: WorkSession): number {
  const base = (s.paused && s.pausedSince ? s.pausedSince : Date.now()) - s.startedAt - s.pausedAccumMs
  return Math.max(0, base)
}

export function wsTogglePause(): WorkSession | null {
  const s = getWorkSession(); if (!s) return null
  if (s.paused && s.pausedSince) { s.pausedAccumMs += Date.now() - s.pausedSince; s.pausedSince = null; s.paused = false }
  else { s.pausedSince = Date.now(); s.paused = true }
  save(s); logEvent(s.paused ? 'paused' : 'resumed'); return s
}

export function wsIncr(metric: 'atendidos' | 'pulados'): void { const s = getWorkSession(); if (!s) return; s[metric] += 1; save(s) }

/** Substitui a fila por novos chamados (Atualizar fila) sem encerrar a sessão. */
export function wsSetIds(ids: number[]): void { const s = getWorkSession(); if (!s) return; s.ids = ids; save(s) }

/** Registra evento no servidor (best-effort; não bloqueia a navegação). */
export function logEvent(type: string, opts?: { entityId?: number; metadata?: Record<string, unknown> }): void {
  const s = getWorkSession(); if (!s?.serverId) return
  api.post(`/work-sessions/${s.serverId}/events`, { type, entity_type: 'helpdesk_ticket', entity_id: opts?.entityId ?? null, metadata: opts?.metadata ?? null }).catch(() => {})
}

export async function endWorkSession(): Promise<unknown | null> {
  const s = getWorkSession()
  let summary: unknown = null
  if (s?.serverId) { try { const r = await api.post<{ data: unknown }>(`/work-sessions/${s.serverId}/end`, {}); summary = r?.data ?? null } catch { /* */ } }
  clearWorkSession()
  return summary
}

export async function fetchSummary(): Promise<unknown | null> {
  const s = getWorkSession(); if (!s?.serverId) return null
  try { const r = await api.get<{ data: unknown }>(`/work-sessions/${s.serverId}/summary`); return r?.data ?? null } catch { return null }
}
