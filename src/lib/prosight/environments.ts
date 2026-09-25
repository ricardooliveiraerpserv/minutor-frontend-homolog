// ─────────────────────────────────────────────────────────────────────────────
// Prosight C3 — Ambientes: cliente da projeção SEGURA real (/prosight/environments).
// Espelha o SafeEnvironment do backend (allowlist). O backend é a autoridade do
// escopo/segurança; aqui só consumimos. NUNCA há secret/host/porta/URL no payload.
// Health/RPO ao vivo pertencem ao Conector (Bloco B) → sempre "aguardando_conector".
// ─────────────────────────────────────────────────────────────────────────────

import { api, downloadFile } from '@/lib/api'

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

// ── Connector-2 — inventário OBSERVADO (Protheus) + divergência cadastral × observado ───

export interface EnvironmentObserved {
  environment_id: number
  has_inventory: boolean
  stale_s: number | null // frescor do INVENTÁRIO (independente da presença)
  inventory: {
    // C4.0: process_instance_id = incarnação opaca do processo (muda no restart do AppServer; estável se só o Conector reinicia).
    appservers: { ref: string; name: string; up: boolean; version: string | null; build: string | null; patch: string | null; uptime_s: number | null; process_instance_id?: string | null }[]
    rest: { name: string; healthy: boolean; status_code?: number | null; latency_ms?: number | null }[]
    rpo: { appserver_ref: string; hash: string; version: string | null; size: number | null; mtime: number | null }[]
    collect_error: string | null
  } | null
  divergence: { appserver: string; field: string; cadastral: string | null; observed: string | null }[]
  process_instance_capability?: boolean // C-4 exigirá esta capability p/ operar
}

/** Inventário observado + divergência (Cadastral × Observado). Read-only, sem secret. */
export async function fetchEnvironmentObserved(environmentId: number): Promise<EnvironmentObserved> {
  const r = await api.get<{ data: EnvironmentObserved }>(`/prosight/environments/${environmentId}/observed`)
  return r.data
}

// ── Connector-3 — emitir coleta de inventário pela UI (REUSA endpoints existentes; ZERO endpoint novo) ──

export type ConnectorCommandStatus = 'queued' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'expired' | 'canceled'

/** Projeção segura do comando (sem claim_token). succeeded = "solicitação de coleta terminou", NÃO "Protheus saudável". */
export interface ConnectorCommandView {
  id: number
  environment_id: number
  command_type: string
  status: ConnectorCommandStatus
  attempts: number
  result_outcome: 'ok' | 'fail' | null
  result_detail: string | null
  correlated: boolean
  finished_at: string | null
}

/** Solicita uma NOVA coleta de inventário (command_type=collect_inventory_now). Coalesce no backend (1 em-voo/ambiente). */
export async function requestInventoryCollection(environmentId: number): Promise<{ command: ConnectorCommandView; coalesced: boolean }> {
  const r = await api.post<{ data: ConnectorCommandView; coalesced: boolean }>(
    `/prosight/environments/${environmentId}/commands`,
    { command_type: 'collect_inventory_now' },
  )
  return { command: r.data, coalesced: r.coalesced }
}

/** Status atual de um comando (para acompanhar o ciclo Na fila → Coletando → Concluído/Falha/Expirado). */
export async function fetchCommandStatus(commandId: number): Promise<ConnectorCommandView> {
  const r = await api.get<{ data: ConnectorCommandView }>(`/prosight/commands/${commandId}`)
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

// ─────────────────────────────────────────────────────────────────────────────
// Conexão do Connector (Camada A) — enrollment/status/revogação. O TOKEN é exibido
// UMA vez (só hash é guardado). O agente on-prem faz o enroll fora do Minutor.
// ─────────────────────────────────────────────────────────────────────────────
export interface AgentStatus {
  agent_id: string
  fingerprint: string | null
  agent_version: string | null
  enrolled_at: string | null
  revoked_at: string | null
}
export interface EnrollmentToken {
  enrollment_token: string
  environment_id: number
  customer_id: number
  expires_at: string
}

export async function fetchAgentStatus(environmentId: number): Promise<AgentStatus | null> {
  const r = await api.get<{ data: AgentStatus | null }>(`/prosight/environments/${environmentId}/connector/agent`)
  return r.data
}
export async function issueEnrollmentToken(environmentId: number): Promise<EnrollmentToken> {
  const r = await api.post<{ data: EnrollmentToken }>(`/prosight/environments/${environmentId}/connector/enrollment-token`, {})
  return r.data
}
export async function revokeAgent(agentId: string): Promise<{ agent_id: string; revoked_at: string | null }> {
  const r = await api.delete<{ data: { agent_id: string; revoked_at: string | null } }>(`/prosight/connector/agents/${agentId}`)
  return r.data
}

// ── Download do agente Connector (o cliente baixa direto do Minutor) ──
export interface ConnectorReleaseAsset {
  name: string
  size: number
  platform: 'windows' | 'linux' | 'source' | 'other'
}
export interface ConnectorReleases {
  available: boolean
  version?: string | null
  published_at?: string | null
  html_url?: string | null
  assets?: ConnectorReleaseAsset[]
}
export async function fetchConnectorReleases(): Promise<ConnectorReleases> {
  const r = await api.get<{ data: ConnectorReleases }>(`/prosight/connector/agent/releases`)
  return r.data
}
export async function downloadConnectorPackage(): Promise<void> {
  await downloadFile(`/prosight/connector/agent/package`, 'prosight-connector-agent.zip')
}
export async function downloadConnectorAsset(name: string): Promise<void> {
  await downloadFile(`/prosight/connector/agent/download?asset=${encodeURIComponent(name)}`, name)
}

// ── Config REST AdvPL (RPO) por ambiente — paridade com o configurador do ProSight enviado ──
export interface RpoConfig {
  environment_id: number
  rpo_api_url: string | null
  rpo_api_user: string | null
  rpo_api_password_set: boolean
  rpo_exclusion_patterns: string
  allow_insecure_tls: boolean
}
export interface RpoConfigInput {
  rpo_api_url?: string
  rpo_api_user?: string
  rpo_api_password?: string   // vazio = manter a senha atual
  rpo_exclusion_patterns?: string
  allow_insecure_tls?: boolean
}
export async function fetchRpoConfig(environmentId: number): Promise<RpoConfig> {
  const r = await api.get<{ data: RpoConfig }>(`/prosight/environments/${environmentId}/rpo-config`)
  return r.data
}
export async function saveRpoConfig(environmentId: number, input: RpoConfigInput): Promise<{ saved: boolean; rpo_api_password_set: boolean }> {
  const r = await api.put<{ data: { saved: boolean; rpo_api_password_set: boolean } }>(`/prosight/environments/${environmentId}/rpo-config`, input)
  return r.data
}
export async function testRpoConfig(environmentId: number, input: RpoConfigInput): Promise<{ ok: boolean; message: string; status?: number; sample_count?: number }> {
  const r = await api.post<{ data: { ok: boolean; message: string; status?: number; sample_count?: number } }>(`/prosight/environments/${environmentId}/rpo-config/test`, input)
  return r.data
}

// ── Inventário Git × RPO ──
export type RpoInvStatus = 'sincronizado' | 'recompilar' | 'verificar_rpo' | 'nao_compilado' | 'so_rpo'
export interface RpoInvRow {
  program: string
  disk_date: string | null
  rpo_date: string | null
  rpo_status: string | null
  rpo_type: string | null
  status: RpoInvStatus
  is_rest_api: boolean
}
export interface RpoInvResult {
  ok: boolean
  error?: string
  scanned_at?: string
  git?: { owner: string; repository: string; branch: string; files: number }[]
  rpo?: { url: string; count: number }
  summary?: { counts: Record<RpoInvStatus, number>; total: number; health_pct: number; health_label: string; rest_api_count: number }
  results?: RpoInvRow[]
}
export async function scanRpoInventory(environmentId: number): Promise<RpoInvResult> {
  const r = await api.post<{ data: RpoInvResult }>(`/prosight/environments/${environmentId}/rpo-inventory/scan`, {})
  return r.data
}

export interface RpoCompanyOverview {
  customer_id: number
  environments: { environment_id: number; name: string; type: string; rpo_configured: boolean; last_scan_at: string | null; summary: { counts: Record<RpoInvStatus, number>; total: number; health_pct: number; health_label: string; rest_api_count: number } | null }[]
  configured_count: number
  scanned_count: number
  rollup: { counts: Record<RpoInvStatus, number>; total: number; health_pct: number; health_label: string; rest_api_count: number } | null
}
export async function fetchRpoCompanyOverview(customerId: number): Promise<RpoCompanyOverview> {
  const r = await api.get<{ data: RpoCompanyOverview }>(`/prosight/companies/${customerId}/rpo-overview`)
  return r.data
}
export async function fetchRpoCompanyResults(customerId: number): Promise<RpoInvRow[]> {
  const r = await api.get<{ data: { results: RpoInvRow[] } }>(`/prosight/companies/${customerId}/rpo-inventory/results`)
  return r.data.results
}
