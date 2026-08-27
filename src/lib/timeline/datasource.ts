// ─────────────────────────────────────────────────────────────────────────────
// Datasource da timeline (C4.2 + C1 live). Modo lido de NEXT_PUBLIC_TIMELINE_DATA_MODE.
// LIVE (C1): busca linhas NATIVAS reais de GET /source-docs/activity (escopado no
// servidor), converte pelos ADAPTERS existentes e roda correlate() — o contrato
// homologado permanece autoridade; nada de adapter/correlate migra para o backend.
// A família 'operacoes' NÃO vem do live (Bloco B/Conector) → pending_families.
// FIXTURE é modo EXPLÍCITO de desenvolvimento/teste. O live NUNCA cai em fixture:
// erro do live é erro real (a UI mostra indisponibilidade), sem fallback silencioso.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from '@/lib/api'
import {
  fromAuditEntry, fromCampaignEvent, fromChangeEntry, fromCoverageScan, fromGmudCommit,
  fromInventoryScan, fromQualityAnalysis, fromSourceAction, fromSourceVersion,
  type CampaignEventNative, type CoverageScanNative, type GmudCommitNative,
  type QualityAnalysisNative, type SourceActionNative, type SourceVersionNative,
} from './adapters'
import { correlate } from './correlate'
import {
  AUDIT_BY_ENV, CHANGES_BY_ENV, GMUD_COMMITS, INVENTORY_SCANS, OPERACOES_ENVS,
  QUALITY_ANALYSES, SOURCE_VERSIONS,
} from './fixtures'
import type { TimelineEvent, TimelineFamily } from './types'

export type TimelineDataMode = 'fixture' | 'live'

export function timelineDataMode(): TimelineDataMode {
  return (process.env.NEXT_PUBLIC_TIMELINE_DATA_MODE as TimelineDataMode) || 'fixture'
}

/** Filtros aplicados SEMPRE no servidor (escopo/anti-IDOR incluídos). */
export interface ActivityQuery {
  customerId?: number | null
  from?: string
  to?: string
  families?: TimelineFamily[]
  actorId?: number | null
  outcome?: string
  cursor?: string | null
  limit?: number
}

/** Página do read-model consolidado. Nunca é fonte de verdade. */
export interface TimelinePage {
  events: TimelineEvent[]
  nextCursor: string | null
  pendingFamilies: TimelineFamily[]
}

export interface TimelineDataSource {
  getEvents(query?: ActivityQuery): Promise<TimelinePage>
}

// ── Live (C1) ──────────────────────────────────────────────────────────────────

interface ActivityItem { family: TimelineFamily; kind: string; native: unknown }
interface ActivityResponse { data: { items: ActivityItem[]; next_cursor: string | null; pending_families: TimelineFamily[]; mode: string } }

function adaptItem(it: ActivityItem): TimelineEvent | null {
  switch (it.kind) {
    case 'source-version': return fromSourceVersion(it.native as SourceVersionNative)
    case 'gmud-commit': return fromGmudCommit(it.native as GmudCommitNative)
    case 'quality': return fromQualityAnalysis(it.native as QualityAnalysisNative)
    case 'source-action': return fromSourceAction(it.native as SourceActionNative)
    case 'campaign': return fromCampaignEvent(it.native as CampaignEventNative)
    case 'coverage-scan': return fromCoverageScan(it.native as CoverageScanNative)
    default: return null // kind desconhecido → ignora (nunca inventa)
  }
}

function buildQuery(q?: ActivityQuery): string {
  const p = new URLSearchParams()
  if (q?.customerId != null) p.set('customer_id', String(q.customerId))
  if (q?.from) p.set('from', q.from)
  if (q?.to) p.set('to', q.to)
  if (q?.families?.length) p.set('family', q.families.join(','))
  if (q?.actorId != null) p.set('actor_id', String(q.actorId))
  if (q?.outcome) p.set('outcome', q.outcome)
  if (q?.cursor) p.set('cursor', q.cursor)
  if (q?.limit) p.set('limit', String(q.limit))
  const s = p.toString()
  return s ? `?${s}` : ''
}

const liveSource: TimelineDataSource = {
  async getEvents(query?: ActivityQuery): Promise<TimelinePage> {
    // Erro aqui é indisponibilidade REAL do read-model — o caller trata como erro (sem fixture).
    const res = await api.get<ActivityResponse>(`/source-docs/activity${buildQuery(query)}`)
    const raw = res.data.items.map(adaptItem).filter((e): e is TimelineEvent => e !== null)
    return {
      events: correlate(raw), // correlação intra-janela (contrato C4.2 inalterado)
      nextCursor: res.data.next_cursor ?? null,
      pendingFamilies: res.data.pending_families ?? ['operacoes'],
    }
  },
}

// ── Fixture (dev/test explícito) ────────────────────────────────────────────────

const fixtureSource: TimelineDataSource = {
  async getEvents(): Promise<TimelinePage> {
    const raw: TimelineEvent[] = []
    for (const env of OPERACOES_ENVS) {
      for (const c of CHANGES_BY_ENV[env.id] ?? []) raw.push(fromChangeEntry(c, env.id, env.label))
      for (const a of AUDIT_BY_ENV[env.id] ?? []) raw.push(fromAuditEntry(a, env.id, env.label))
    }
    for (const v of SOURCE_VERSIONS) raw.push(fromSourceVersion(v))
    for (const g of GMUD_COMMITS) raw.push(fromGmudCommit(g))
    for (const q of QUALITY_ANALYSES) raw.push(fromQualityAnalysis(q))
    for (const s of INVENTORY_SCANS) raw.push(fromInventoryScan(s.scan, s.companyId, s.companyLabel))
    // Fixture inclui Operações (demo Bloco B) → nada pendente neste modo.
    return { events: correlate(raw), nextCursor: null, pendingFamilies: [] }
  },
}

export function getTimelineDataSource(): TimelineDataSource {
  return timelineDataMode() === 'live' ? liveSource : fixtureSource
}
