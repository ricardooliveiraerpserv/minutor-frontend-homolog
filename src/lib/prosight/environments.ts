// ─────────────────────────────────────────────────────────────────────────────
// Prosight C3 — Ambientes: cliente da projeção SEGURA real (/prosight/environments).
// Espelha o SafeEnvironment do backend (allowlist). O backend é a autoridade do
// escopo/segurança; aqui só consumimos. NUNCA há secret/host/porta/URL no payload.
// Health/RPO ao vivo pertencem ao Conector (Bloco B) → sempre "aguardando_conector".
// ─────────────────────────────────────────────────────────────────────────────

import { api } from '@/lib/api'

export interface SafeEnvironment {
  id: number
  customer_id: number
  name: string
  type: 'prod' | 'homolog' | 'dev' | 'dr'
  status: { code: 'ativo' | 'inativo' | 'manutencao' | 'indefinido'; label: string; note: string }
  components: string[]
  appservers: { name: string; version: string | null; build: string | null; patch: string | null }[]
  databases: { engine: string }[]
  links: { label: string; kind: string }[]
  responsible_name: string | null
  created_at: string | null
  updated_at: string | null
  live: { health: string; rpo: string }
}

/** Ambientes reais (registro do Cofre) da empresa. Empresa é obrigatória no backend. */
export async function fetchProsightEnvironments(customerId: number): Promise<SafeEnvironment[]> {
  const r = await api.get<{ data: { customer_id: number; environments: SafeEnvironment[] } }>(
    `/prosight/environments?customer_id=${customerId}`,
  )
  return r.data.environments
}

// ── C4 — Configuração de Ambiente (detalhe cadastral de UM ambiente) ────────────

export interface SafeEnvironmentConfig {
  environment: {
    id: number
    customer_id: number
    name: string
    type: SafeEnvironment['type']
    status: { code: string; label: string; note: string }
    responsible_name: string | null
    updated_at: string | null
  }
  appservers: { name: string; version: string | null; build: string | null; patch: string | null }[]
  databases: { engine: string; always_on_cadastrado: boolean }[]
  links: { label: string; kind: string }[]
}

/**
 * Configuração cadastral de UM ambiente. Empresa + ambiente obrigatórios; o backend valida
 * environment↔customer (404 se cross-customer/fora de escopo). Health/RPO/operação NÃO vêm daqui
 * (a UI rotula "Aguardando Conector" estaticamente — o Env não conhece estado live).
 */
export async function fetchProsightEnvironmentConfig(customerId: number, environmentId: number): Promise<SafeEnvironmentConfig> {
  const r = await api.get<{ data: SafeEnvironmentConfig }>(
    `/prosight/environments/${environmentId}/configuration?customer_id=${customerId}`,
  )
  return r.data
}

// ── Connector-1 — PRESENÇA (estado OBSERVADO; distinto do cadastral) ────────────

export interface EnvironmentPresence {
  environment_id: number
  has_agent: boolean
  observed: {
    status: 'never_seen' | 'online' | 'stale' | 'offline' | 'degraded'
    since_s: number | null
    last_seen_at: string | null
    clock_offset_s: number | null
    agent_reported_status: string | null
  } | null
}

/** Presença de todos os ambientes da empresa (1 chamada). Observado ≠ cadastral. */
export async function fetchEnvironmentsPresence(customerId: number): Promise<EnvironmentPresence[]> {
  const r = await api.get<{ data: { environments: EnvironmentPresence[] } }>(
    `/prosight/environments/presence?customer_id=${customerId}`,
  )
  return r.data.environments
}

/** Presença de UM ambiente (para o C4). */
export async function fetchEnvironmentPresence(environmentId: number): Promise<EnvironmentPresence> {
  const r = await api.get<{ data: EnvironmentPresence }>(`/prosight/environments/${environmentId}/presence`)
  return r.data
}

/** Rótulo/variante honestos para a presença OBSERVADA (nunca confundir com status cadastral). */
export function presenceLabel(p: EnvironmentPresence | undefined | null): { label: string; variant: string } {
  if (!p || (!p.has_agent && !p.observed)) return { label: 'Sem agente conectado', variant: 'default' }
  switch (p.observed?.status) {
    case 'online': return { label: 'Online', variant: 'success' }
    case 'stale': return { label: 'Atrasado', variant: 'warning' }
    case 'offline': return { label: 'Offline', variant: 'danger' }
    case 'degraded': return { label: 'Degradado', variant: 'warning' }
    case 'never_seen': return { label: 'Aguardando 1º heartbeat', variant: 'default' }
    default: return { label: '—', variant: 'default' }
  }
}
