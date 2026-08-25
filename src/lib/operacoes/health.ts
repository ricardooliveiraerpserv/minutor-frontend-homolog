// ─────────────────────────────────────────────────────────────────────────────
// Saúde do ambiente Protheus — REGRA DE PRODUTO (pura, sem React → testável).
//
// A saúde NÃO é derivada de texto: `state` é a autoridade; a UI faz o label via
// HEALTH_META. Regras aprovadas 2026-08-24 (ver project_minutor_modules_migration;
// NÃO maquiar fixtures):
//   • compiler parado = estado NORMAL (on-demand) → NÃO impacta a saúde (só informativo).
//   • modo exclusivo ativo = estado próprio 'exclusive' (base derrubada de propósito).
//     PORÉM uma falha crítica INDEPENDENTE (não causada pela manutenção — ex.: DBAccess/banco
//     parado) SUPERA o exclusive → critical, sem esconder o problema atrás da manutenção.
//     Broker + slaves parados durante exclusivo = consequência esperada → IGNORADOS.
//   • broker parado / DBAccess (banco) parado / TODOS os slaves parados → critical.
//   • slave parcial / schedule parado / REST parado / CPU alta / Unknown → warning.
//   • sem serviços → undefined. Unknown NUNCA vira stopped/critical automaticamente.
// Precedência determinística: critical (independente) → exclusive → warning → undefined → healthy.
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
  /** Manutenção (modo exclusivo) ativa — preserva a informação mesmo quando `state` escala p/ critical. */
  underMaintenance: boolean
  /** Sinais de saúde já classificados = fonte dos alertas nas telas. Vazio quando healthy. */
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
    // Manutenção: broker + slaves parados = consequência ESPERADA do exclusivo → ignorados
    // (e o compilador nem entra na base). Os demais serviços são avaliados normalmente:
    // uma falha crítica INDEPENDENTE (DBAccess/banco) escala p/ critical; REST/Schedule/CPU/
    // Unknown continuam como warning SEM escalar. Assim manutenção não mascara indisponibilidade.
    for (const s of healthBase) {
      if (s.type === 'broker' || s.type === 'slave' || isRunning(s)) continue
      if (s.status === 'Unknown') { reasons.push({ severity: 'warning', text: `${nameOf(s)} em estado desconhecido` }); continue }
      if (isDbAccess(s)) reasons.push({ severity: 'critical', text: `${nameOf(s)} (banco) parado` })
      else if (s.type === 'rest') reasons.push({ severity: 'warning', text: 'REST parado' })
      else if (s.type === 'schedule') reasons.push({ severity: 'warning', text: 'Schedule parado' })
      else reasons.push({ severity: 'warning', text: `${nameOf(s)} parado` })
    }
    if (degraded > 0) reasons.push({ severity: 'warning', text: `${degraded} serviço(s) em CPU alta` })
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

  const hasIndependentCritical = reasons.some((r) => r.severity === 'critical')
  // Precedência: critical INDEPENDENTE supera exclusive (não esconder falha real na manutenção).
  let state: HealthState
  if (hasIndependentCritical) state = 'critical'
  else if (exclusiveActive) state = 'exclusive'
  else if (reasons.some((r) => r.severity === 'warning')) state = 'warning'
  else if (healthBase.length === 0) state = 'undefined'
  else state = 'healthy'

  // Preserva a informação de manutenção mesmo quando escalou p/ critical (motivo adicional).
  if (exclusiveActive && state === 'critical') reasons.push({ severity: 'info', text: 'Modo exclusivo ativo' })

  return { state, running, stopped, degraded, total: healthBase.length, compilerRunning, underMaintenance: exclusiveActive, reasons, ...HEALTH_META[state] }
}
