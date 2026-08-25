// ─────────────────────────────────────────────────────────────────────────────
// Saúde do ambiente Protheus — REGRA DE PRODUTO (pura, sem React → testável).
//
// A saúde NÃO é derivada de texto: `state` é a autoridade; a UI faz o label via
// HEALTH_META. Regras aprovadas 2026-08-24 (ver project_minutor_modules_migration;
// NÃO maquiar fixtures):
//   • compiler parado = estado NORMAL (on-demand) → NÃO impacta a saúde (só informativo).
//   • modo exclusivo ativo = estado próprio 'exclusive' (base derrubada de propósito).
//   • broker parado / DBAccess (banco) parado / TODOS os slaves parados → critical.
//   • slave parcial / schedule parado / REST parado / CPU alta / Unknown → warning.
//   • sem serviços → undefined. Unknown NUNCA vira stopped/critical automaticamente.
// Precedência determinística: exclusive → critical → warning → undefined → healthy.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceRow } from './types'

/** Serviço "degradado": Running porém com CPU alta. */
export const DEGRADED_CPU = 80
export function isDegraded(s: ServiceRow): boolean {
  return s.status === 'Running' && s.cpu >= DEGRADED_CPU
}

export type HealthState = 'healthy' | 'warning' | 'critical' | 'exclusive' | 'undefined'
export type HealthSeverity = 'critical' | 'warning' | 'info'
export interface HealthReason { severity: HealthSeverity; text: string }

export interface HealthSummary {
  state: HealthState
  running: number
  stopped: number
  degraded: number
  total: number
  /** Compilador em execução (informativo — não afeta a saúde). */
  compilerRunning: boolean
  /** Sinais de saúde já classificados = fonte dos alertas nas telas. Vazio quando healthy/exclusive. */
  reasons: HealthReason[]
  // Conveniência de UI (derivada de `state`) — mantém compat com consumidores atuais.
  label: string
  color: string
  variant: string
}

export const HEALTH_META: Record<HealthState, { label: string; color: string; variant: string }> = {
  healthy:   { label: 'Saudável',       color: 'var(--success)',    variant: 'success' },
  warning:   { label: 'Atenção',        color: 'var(--warning)',    variant: 'warning' },
  critical:  { label: 'Crítico',        color: 'var(--danger)',     variant: 'danger'  },
  exclusive: { label: 'Modo exclusivo', color: 'var(--info)',       variant: 'primary' },
  undefined: { label: 'Indefinido',     color: 'var(--text-light)', variant: 'default' },
}

/** DBAccess = serviço essencial de banco (extra identificado pelo tipo/nome). Só ESTE extra é crítico. */
function isDbAccess(s: ServiceRow): boolean {
  return s.type === 'extra' && /dbaccess/i.test(`${s.name} ${s.displayName} ${s.label}`)
}

/**
 * Deriva a saúde do ambiente a partir dos serviços.
 * Estados explícitos + precedência determinística (correção de semântica pré-C4).
 */
export function computeHealth(services: ServiceRow[] | null): HealthSummary {
  const all = services ?? []
  // O AppServer Exclusivo não entra no rollup; sua EXECUÇÃO sinaliza o modo exclusivo.
  const exclusiveActive = all.some((s) => s.type === 'exclusive' && s.status === 'Running')
  // Base de SAÚDE: exclui o Exclusivo (sinaliza modo) e o Compilador (on-demand, não impacta saúde).
  const healthBase = all.filter((s) => s.type !== 'exclusive' && s.type !== 'compiler')

  const isRunning = (s: ServiceRow) => s.status === 'Running'
  const isStopped = (s: ServiceRow) => s.status === 'Stopped'
  const nameOf = (s: ServiceRow) => s.label || s.displayName || s.name

  const running = healthBase.filter(isRunning).length
  const stopped = healthBase.filter((s) => !isRunning(s)).length
  const degraded = healthBase.filter(isDegraded).length
  const compilerRunning = all.some((s) => s.type === 'compiler' && isRunning(s))

  const reasons: HealthReason[] = []
  if (exclusiveActive) {
    // Manutenção: base derrubada de propósito NÃO é falha. Só falhas INDEPENDENTES
    // (banco/DBAccess essencial, fora da base) são registradas — sem decidir silenciosamente.
    // (Nenhuma fixture exercita este caso hoje; escalonamento de estado = decisão explícita.)
    for (const s of healthBase) {
      if (isDbAccess(s) && isStopped(s)) reasons.push({ severity: 'critical', text: `${nameOf(s)} (banco) parado` })
    }
  } else {
    // Slaves: agregado (parcial = warning, todos = critical).
    const slaves = healthBase.filter((s) => s.type === 'slave')
    const slavesStopped = slaves.filter(isStopped).length
    if (slaves.length > 0 && slavesStopped === slaves.length) reasons.push({ severity: 'critical', text: 'Todos os slaves parados' })
    else if (slavesStopped > 0) reasons.push({ severity: 'warning', text: `${slavesStopped} de ${slaves.length} slaves parados` })
    // Demais serviços parados (slave já tratado acima; compiler nem entra na base).
    for (const s of healthBase) {
      if (s.type === 'slave' || isRunning(s)) continue
      if (s.status === 'Unknown') { reasons.push({ severity: 'warning', text: `${nameOf(s)} em estado desconhecido` }); continue }
      if (s.type === 'broker') reasons.push({ severity: 'critical', text: 'Broker parado' })
      else if (isDbAccess(s)) reasons.push({ severity: 'critical', text: `${nameOf(s)} (banco) parado` })
      else if (s.type === 'rest') reasons.push({ severity: 'warning', text: 'REST parado' })
      else if (s.type === 'schedule') reasons.push({ severity: 'warning', text: 'Schedule parado' })
      else reasons.push({ severity: 'warning', text: `${nameOf(s)} parado` })
    }
    // CPU alta em serviço rodando → warning.
    if (degraded > 0) reasons.push({ severity: 'warning', text: `${degraded} serviço(s) em CPU alta` })
  }

  let state: HealthState
  if (exclusiveActive) state = 'exclusive'
  else if (reasons.some((r) => r.severity === 'critical')) state = 'critical'
  else if (reasons.some((r) => r.severity === 'warning')) state = 'warning'
  else if (healthBase.length === 0) state = 'undefined'
  else state = 'healthy'

  return { state, running, stopped, degraded, total: healthBase.length, compilerRunning, reasons, ...HEALTH_META[state] }
}
