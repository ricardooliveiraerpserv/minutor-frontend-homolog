// ─────────────────────────────────────────────────────────────────────────────
// Datasource da timeline (C4.2) — fixture | live. Igual ao padrão Prosight/Operações:
// modo lido de NEXT_PUBLIC_TIMELINE_DATA_MODE (default 'fixture'); o adapter LIVE
// LANÇA erro (nunca cai silenciosamente em fixture). No modo fixture, monta o
// read-model rodando as fixtures NATIVAS pelos ADAPTERS e depois correlate().
// Os storages nativos permanecem separados — aqui só há leitura/agregação.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fromAuditEntry, fromChangeEntry, fromGmudCommit, fromInventoryScan, fromQualityAnalysis,
  fromSourceVersion,
} from './adapters'
import { correlate } from './correlate'
import {
  AUDIT_BY_ENV, CHANGES_BY_ENV, GMUD_COMMITS, INVENTORY_SCANS, OPERACOES_ENVS,
  QUALITY_ANALYSES, SOURCE_VERSIONS,
} from './fixtures'
import type { TimelineEvent } from './types'

export type TimelineDataMode = 'fixture' | 'live'

export function timelineDataMode(): TimelineDataMode {
  return (process.env.NEXT_PUBLIC_TIMELINE_DATA_MODE as TimelineDataMode) || 'fixture'
}

export interface TimelineDataSource {
  /** Read-model consolidado (adapters + correlação). Nunca é fonte de verdade. */
  getEvents(): Promise<TimelineEvent[]>
}

const fixtureSource: TimelineDataSource = {
  async getEvents() {
    const raw: TimelineEvent[] = []
    for (const env of OPERACOES_ENVS) {
      for (const c of CHANGES_BY_ENV[env.id] ?? []) raw.push(fromChangeEntry(c, env.id, env.label))
      for (const a of AUDIT_BY_ENV[env.id] ?? []) raw.push(fromAuditEntry(a, env.id, env.label))
    }
    for (const v of SOURCE_VERSIONS) raw.push(fromSourceVersion(v))
    for (const g of GMUD_COMMITS) raw.push(fromGmudCommit(g))
    for (const q of QUALITY_ANALYSES) raw.push(fromQualityAnalysis(q))
    for (const s of INVENTORY_SCANS) raw.push(fromInventoryScan(s.scan, s.companyId, s.companyLabel))
    return correlate(raw)
  },
}

const liveSource: TimelineDataSource = {
  async getEvents() {
    // No live, cada família virá do SEU backend (Operações /audit+/changes, source-docs
    // /versions, /gmud-commits, /quality, inventário) e será adaptada aqui — os
    // storages seguem separados. Enquanto a infra não está conectada, LANÇAR.
    throw new Error('Timeline live ainda não conectada (L1–L3). Configure os backends por família antes de habilitar o modo live.')
  },
}

export function getTimelineDataSource(): TimelineDataSource {
  return timelineDataMode() === 'live' ? liveSource : fixtureSource
}
