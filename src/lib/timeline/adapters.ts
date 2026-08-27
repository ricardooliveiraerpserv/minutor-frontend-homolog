// ─────────────────────────────────────────────────────────────────────────────
// Adapters (C4.2) — PUROS. Cada função recebe o shape NATIVO de um datasource e
// devolve TimelineEvent(s) já normalizados, SEM tocar no storage de origem.
// A procedência (source/authority/origin) é preservada em cada faceta.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChangeEntry, AuditEntry } from '@/lib/operacoes/types'
import type { InventoryScanOk } from '@/lib/prosight/types'
import type { TimelineEvent, TimelineFacet, TimelineOutcome } from './types'

// Shapes nativos que não são exportados por outros módulos (espelham o discovery).
export interface SourceVersionNative {
  id: number
  source_doc_id: number
  filename: string
  owner: string
  repository: string
  source_commit_sha: string | null
  source_blob_sha: string | null
  gmud_id: number | null
  ticket_number: string | null
  responsavel: string | null
  analysis_status: string | null
  diff_summary: string | null
  created_at: string | null
  customer_id?: number | null
  customer_name?: string | null
}

export interface GmudCommitNative {
  id: number
  source_doc_id: number
  filename: string
  owner: string
  repository: string
  source_commit_sha: string | null
  gmud_id: number | null
  ticket_number: string | null
  responsavel: string | null
  diff_summary: string | null
  created_at: string | null
  customer_id?: number | null
  customer_name?: string | null
  hd_ticket_id?: number | null
  hd_subject?: string | null
}

export interface QualityAnalysisNative {
  id: number
  source_doc_id: number
  filename: string
  owner: string
  repository: string
  source_blob_sha: string | null
  status: string
  score: number | null
  grade: string | null
  risk: string | null
  requested_at: string | null
  completed_at: string | null
  stale?: boolean
  customer_id?: number | null
  customer_name?: string | null
}

const CHANGE_LABEL: Record<string, string> = {
  compile: 'Compilação', 'patch-apply': 'Aplicação de Patch',
  'promote-rpo': 'Promoção de RPO', 'rollback-rpo': 'Rollback de RPO',
}
const boolOutcome = (ok: boolean): TimelineOutcome => (ok ? 'ok' : 'fail')

// ── Operações — build (ChangeEntry) ───────────────────────────────────────────
export function fromChangeEntry(c: ChangeEntry, environmentId: string, envLabel: string): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'build', source: 'operacoes', authority: 'minutor-db', origin: 'Windows/AppServer',
    nativeId: c.id, detail: c.output ?? undefined,
    payload: { files: c.files, results: c.results, logFile: c.logFile },
  }
  return {
    id: `operacoes:build:${c.id}`, family: 'operacoes',
    title: CHANGE_LABEL[c.type] ?? c.type, subtype: c.type, where: envLabel,
    occurredAt: c.timestamp, actor: c.username || null, outcome: boolOutcome(c.success),
    facets: [facet],
    correlation: { confidence: 'none', keys: { environmentId }, relatedIds: [] },
  }
}

// ── Operações — auditoria (AuditEntry) ─────────────────────────────────────────
export function fromAuditEntry(a: AuditEntry, environmentId: string, envLabel: string): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'audit', source: 'operacoes', authority: 'minutor-db', origin: 'source-docs/dashboards (governança)',
    nativeId: a.id, detail: a.detail,
  }
  return {
    id: `operacoes:audit:${a.id}`, family: 'operacoes',
    title: `Auditoria · ${a.action}`, subtype: a.action, where: envLabel,
    occurredAt: a.timestamp, actor: a.username || null, outcome: boolOutcome(a.success),
    facets: [facet],
    correlation: { confidence: 'none', keys: { environmentId }, relatedIds: [] },
  }
}

// ── Fontes — versão do SourceDoc ───────────────────────────────────────────────
export function fromSourceVersion(v: SourceVersionNative): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'source-version', source: 'source-docs', authority: 'minutor-db', origin: 'source-docs',
    nativeId: String(v.id), detail: v.diff_summary ?? undefined,
    payload: { analysis_status: v.analysis_status },
  }
  return {
    id: `fontes:version:${v.id}`, family: 'fontes',
    title: `Nova versão · ${v.filename}`, subtype: 'source-version',
    where: `${v.owner}/${v.repository} · ${v.filename}`,
    occurredAt: v.created_at, actor: v.responsavel || null, outcome: 'info',
    facets: [facet],
    correlation: {
      confidence: 'none',
      keys: { sourceDocId: v.source_doc_id, gmudId: v.gmud_id, ticketNumber: v.ticket_number, commitSha: v.source_commit_sha, blobSha: v.source_blob_sha, companyId: v.customer_id ?? null },
      relatedIds: [],
    },
  }
}

// ── Publicações — commit de GMUD ───────────────────────────────────────────────
export function fromGmudCommit(g: GmudCommitNative): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'gmud-commit', source: 'gmud', authority: 'git', origin: 'Git (commit atômico)',
    nativeId: String(g.id), detail: g.diff_summary ?? undefined,
    payload: { commit_sha: g.source_commit_sha, hd_ticket_id: g.hd_ticket_id, hd_subject: g.hd_subject },
  }
  return {
    id: `publicacoes:gmud:${g.id}`, family: 'publicacoes',
    title: `Publicação GMUD · ${g.filename}`, subtype: 'gmud-publish',
    where: `${g.owner}/${g.repository} · ${g.filename}`,
    occurredAt: g.created_at, actor: g.responsavel || null, outcome: 'ok',
    facets: [facet],
    correlation: {
      confidence: 'none',
      keys: { sourceDocId: g.source_doc_id, gmudId: g.gmud_id, ticketNumber: g.ticket_number, commitSha: g.source_commit_sha, companyId: g.customer_id ?? null },
      relatedIds: [],
    },
  }
}

// ── Qualidade — análise (CodeAnalysis) ─────────────────────────────────────────
const QUALITY_OUTCOME: Record<string, TimelineOutcome> = {
  completed: 'ok', failed: 'fail', queued: 'pending', running: 'pending', outdated: 'info', never_analyzed: 'info',
}
export function fromQualityAnalysis(q: QualityAnalysisNative): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'quality', source: 'quality', authority: 'codeanalysis', origin: 'CodeAnalysis (via backend)',
    nativeId: String(q.id),
    detail: q.score != null ? `Score ${q.score}${q.grade ? ` · ${q.grade}` : ''}${q.risk ? ` · risco ${q.risk}` : ''}` : undefined,
    payload: { status: q.status, score: q.score, grade: q.grade, risk: q.risk, stale: q.stale },
  }
  return {
    id: `qualidade:analysis:${q.id}`, family: 'qualidade',
    title: `Análise de qualidade · ${q.filename}`, subtype: 'quality-analysis',
    where: `${q.owner}/${q.repository} · ${q.filename}`,
    occurredAt: q.completed_at ?? q.requested_at, actor: null, // CodeAnalysis não expõe ator — não inferir
    outcome: QUALITY_OUTCOME[q.status] ?? 'info',
    facets: [facet],
    correlation: {
      confidence: 'none',
      keys: { sourceDocId: q.source_doc_id, blobSha: q.source_blob_sha, companyId: q.customer_id ?? null },
      relatedIds: [],
    },
  }
}

// ── Fontes/Publicações/Governança — ação do action_log (C1) ────────────────────
export interface SourceActionNative {
  id: number
  source_doc_id: number
  version_id: number | null
  action: string            // validate|reprocess|download|view_git|compare|publish_git|cost_approval_*
  layer: string | null
  status: string            // queued|running|ok|failed|skipped|denied
  denied: boolean
  reason: string | null
  cost_usd: number | null
  duration_ms: number | null
  actor_user_id: number | null
  actor_name: string | null
  created_at: string | null
  filename: string
  owner: string
  repository: string
  customer_id: number | null
  customer_name?: string | null
  approval?: Record<string, unknown> | null // enriquecimento (cost_approval_*), quando houver
}
const ACTION_LABEL: Record<string, string> = {
  validate: 'Validação', reprocess: 'Reprocessamento', download: 'Download',
  view_git: 'Consulta ao Git', compare: 'Comparação', publish_git: 'Publicação no Git',
}
const ACTION_OUTCOME: Record<string, TimelineOutcome> = {
  ok: 'ok', failed: 'fail', denied: 'fail', skipped: 'partial', queued: 'pending', running: 'pending',
}
export function fromSourceAction(a: SourceActionNative): TimelineEvent {
  const isCost = a.action.startsWith('cost_approval_')
  const isPublish = a.action === 'publish_git'
  const title = isCost
    ? `Aprovação de custo · ${a.action.replace('cost_approval_', '').replace(/_/g, ' ')}`
    : (ACTION_LABEL[a.action] ?? a.action)
  // Ajuste #2: negativa por AUTORIZAÇÃO é distinta de falha técnica de processamento.
  const detail = a.denied
    ? `Acesso negado (autorização)${a.reason ? ` — ${a.reason}` : ''}`
    : (a.reason ?? undefined)
  const facet: TimelineFacet = {
    kind: 'source-action', source: 'source-docs', authority: 'minutor-db',
    origin: isCost ? 'source-docs (governança de custo)' : 'source-docs',
    nativeId: String(a.id), detail,
    payload: { action: a.action, status: a.status, denied: a.denied, layer: a.layer, cost_usd: a.cost_usd, approval: a.approval ?? null },
  }
  return {
    id: `${isPublish ? 'publicacoes' : 'fontes'}:action:${a.id}`,
    family: isPublish ? 'publicacoes' : 'fontes',
    title, subtype: a.action, where: `${a.owner}/${a.repository} · ${a.filename}`,
    occurredAt: a.created_at, actor: a.actor_name || null,
    outcome: ACTION_OUTCOME[a.status] ?? 'info',
    facets: [facet],
    correlation: { confidence: 'none', keys: { sourceDocId: a.source_doc_id, companyId: a.customer_id ?? null }, relatedIds: [] },
  }
}

// ── Qualidade — evento de campanha semântica (C1; GLOBAL, sem empresa) ──────────
export interface CampaignEventNative {
  id: number
  campaign_id: number
  campaign_name: string | null
  event: string // created|started|paused|resumed|cancelled|budget_changed|auto_paused|completed
  actor_user_id: number | null
  actor_name: string | null
  created_at: string | null
}
const CAMPAIGN_LABEL: Record<string, string> = {
  created: 'criada', started: 'iniciada', paused: 'pausada', resumed: 'retomada',
  cancelled: 'cancelada', budget_changed: 'orçamento alterado', auto_paused: 'pausa automática', completed: 'concluída',
}
export function fromCampaignEvent(c: CampaignEventNative): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'campaign', source: 'source-docs', authority: 'minutor-db', origin: 'source-docs (campanha semântica global)',
    nativeId: String(c.id), detail: c.campaign_name ?? undefined, payload: { event: c.event },
  }
  return {
    id: `qualidade:campaign:${c.id}`, family: 'qualidade',
    title: `Campanha · ${CAMPAIGN_LABEL[c.event] ?? c.event}`, subtype: `campaign-${c.event}`,
    where: c.campaign_name ?? 'Campanha semântica',
    occurredAt: c.created_at, actor: c.actor_name || null,
    outcome: c.event === 'completed' ? 'ok' : 'info',
    facets: [facet],
    correlation: { confidence: 'none', keys: {}, relatedIds: [] }, // campanha global — sem empresa
  }
}

// ── Inventário — cobertura REAL por repo (C1; sem RPO — RPO é Bloco B) ──────────
export interface CoverageScanNative {
  source_repo_id: number
  owner: string
  repository: string
  branch: string | null
  customer_id: number | null
  customer_name?: string | null
  scan_status: string // pending|running|completed|partial|failed|rate_limited
  scan_started_at: string | null
  scan_finished_at: string | null
  last_synced_at: string | null
  occurred_at: string | null
  github_files: number
  eligible: number
  cataloged: number
  deterministic: number
  semantic: number
  indexed: number
  changed: number
}
const COVERAGE_OUTCOME: Record<string, TimelineOutcome> = {
  completed: 'ok', partial: 'partial', failed: 'fail', running: 'pending', pending: 'pending', rate_limited: 'info',
}
export function fromCoverageScan(s: CoverageScanNative): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'coverage-scan', source: 'inventario', authority: 'minutor-db', origin: 'source-docs (cobertura por repo)',
    nativeId: String(s.source_repo_id),
    detail: `${s.cataloged}/${s.eligible} catalogados · ${s.changed} desatualizados · ${s.semantic} c/ semântica`,
    payload: { scan_status: s.scan_status, github_files: s.github_files, indexed: s.indexed, deterministic: s.deterministic },
  }
  return {
    id: `inventario:coverage:${s.source_repo_id}:${s.occurred_at ?? 'na'}`, family: 'inventario',
    title: `Cobertura · ${s.owner}/${s.repository}`, subtype: 'coverage-scan',
    where: `${s.owner}/${s.repository}`, occurredAt: s.occurred_at, actor: null, // scan não tem ator
    outcome: COVERAGE_OUTCOME[s.scan_status] ?? 'info', facets: [facet],
    correlation: { confidence: 'none', keys: { companyId: s.customer_id ?? null }, relatedIds: [] },
  }
}

// ── Operações — transição observada pelo Conector (Connector-2) ────────────────
export interface ConnectorEventNative {
  id: number
  environment_id: number
  environment_name: string | null
  customer_id: number | null
  customer_name?: string | null
  appserver_ref: string | null
  event_type: string // appserver_up|appserver_down|process_changed|version_changed|rpo_changed|rest_health_changed
  outcome: 'ok' | 'fail' | 'info'
  detail: string | null
  meta: Record<string, unknown> | null
  occurred_at: string | null
}
const CONNECTOR_LABEL: Record<string, string> = {
  appserver_up: 'AppServer detectado', appserver_down: 'AppServer sumiu', process_changed: 'Processo alterado',
  version_changed: 'Versão alterada', rpo_changed: 'RPO alterado', rest_health_changed: 'REST health',
}
const CONNECTOR_OUTCOME: Record<string, TimelineOutcome> = { ok: 'ok', fail: 'fail', info: 'info' }
export function fromConnectorEvent(c: ConnectorEventNative): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'connector-event', source: 'operacoes', authority: 'minutor-db', origin: 'Conector (agente on-prem, observado)',
    nativeId: String(c.id), detail: c.detail ?? undefined, payload: { event_type: c.event_type, meta: c.meta ?? null },
  }
  return {
    id: `operacoes:connector:${c.id}`, family: 'operacoes',
    title: CONNECTOR_LABEL[c.event_type] ?? c.event_type, subtype: c.event_type,
    where: c.environment_name ?? 'Ambiente', occurredAt: c.occurred_at, actor: null, // observado, sem ator
    outcome: CONNECTOR_OUTCOME[c.outcome] ?? 'info', facets: [facet],
    correlation: { confidence: 'none', keys: { environmentId: String(c.environment_id), companyId: c.customer_id ?? null }, relatedIds: [] },
  }
}

// ── Inventário — scan Git×RPO (snapshot por empresa) ───────────────────────────
export function fromInventoryScan(s: InventoryScanOk, companyId: string | number, companyLabel: string): TimelineEvent {
  const facet: TimelineFacet = {
    kind: 'inventory-scan', source: 'inventario', authority: 'git', origin: 'Git × RPO (advpl_api)',
    nativeId: `${companyId}:${s.scannedAt}`,
    detail: `${s.summary.healthLabel} · ${s.summary.total ?? s.results.length} fontes`,
    payload: { gitUrl: s.gitUrl, rpoSource: s.rpoSource, summary: s.summary },
  }
  return {
    id: `inventario:scan:${companyId}:${s.scannedAt}`, family: 'inventario',
    title: `Scan de inventário · ${companyLabel}`, subtype: 'inventory-scan',
    where: companyLabel, occurredAt: s.scannedAt, actor: null, // scan não tem ator
    outcome: 'info', facets: [facet],
    correlation: { confidence: 'none', keys: { companyId, commitSha: null }, relatedIds: [] },
  }
}
