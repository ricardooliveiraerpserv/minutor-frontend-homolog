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
