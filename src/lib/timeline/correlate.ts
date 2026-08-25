// ─────────────────────────────────────────────────────────────────────────────
// Correlação (C4.2) — PURA. Recebe eventos já adaptados e:
//  1) CONSOLIDA build (ChangeEntry) + auditoria (AuditEntry) da MESMA operação num
//     único evento com 2 facetas — confiança `strong`/`heuristic`, NUNCA `exact`
//     (não há id de operação compartilhado; ver PENDÊNCIA DO LIVE em types.ts).
//  2) RELACIONA (sem fundir) eventos cross-domínio por identificador INEQUÍVOCO:
//     GMUD↔versão por commit_sha/gmud_id; Qualidade↔versão por blob_sha → `exact`.
//  3) Deixa INDEPENDENTES (`none`) os eventos sem correlação suficiente — é
//     preferível duplicidade explicável a dedupe incorreto.
// Nada aqui altera storages: opera só sobre o read-model.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimelineEvent } from './types'

const TOLERANCE_MS = 120_000 // 2min: janela p/ heurística build↔auditoria

function deltaMs(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = new Date(a).getTime(), tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.abs(ta - tb)
}

/** Consolida build+auditoria e cria as relações cross-domínio. Retorna a lista final. */
export function correlate(events: TimelineEvent[]): TimelineEvent[] {
  const consumed = new Set<string>()
  const builds = events.filter((e) => e.family === 'operacoes' && e.facets[0]?.kind === 'build')
  const audits = events.filter((e) => e.family === 'operacoes' && e.facets[0]?.kind === 'audit')

  // 1) build + auditoria (mesmo ambiente + mesmo subtipo + timestamp coincidente/próximo)
  for (const b of builds) {
    const env = b.correlation.keys.environmentId
    const match = audits.find((a) =>
      !consumed.has(a.id) &&
      a.correlation.keys.environmentId === env &&
      a.subtype === b.subtype)
    if (!match) continue
    const dt = deltaMs(b.occurredAt, match.occurredAt)
    if (dt == null || dt > TOLERANCE_MS) continue
    const confidence = dt === 0 ? 'strong' : 'heuristic'
    consumed.add(match.id)
    b.facets.push(match.facets[0])
    b.correlation = {
      ...b.correlation,
      confidence,
      relatedIds: [],
      note: dt === 0
        ? 'Técnica + auditoria alinhadas por ambiente, tipo e horário idêntico (heurística forte; sem operationId persistente — ver pendência do live).'
        : `Técnica + auditoria alinhadas por ambiente e tipo, horários próximos (Δ ${Math.round(dt / 1000)}s). Heurística — não é identidade.`,
    }
    // preserva o ator conhecido (build costuma ter username; se faltar, usa o da auditoria)
    if (!b.actor && match.actor) b.actor = match.actor
  }

  // Base restante = builds (agora possivelmente com 2 facetas) + auditorias não consumidas + demais famílias
  const rest = events.filter((e) => !consumed.has(e.id))

  // 2) relações cross-domínio por identificador inequívoco (link, sem fundir)
  const link = (a: TimelineEvent, b: TimelineEvent, note: string) => {
    if (!a.correlation.relatedIds.includes(b.id)) a.correlation.relatedIds.push(b.id)
    if (!b.correlation.relatedIds.includes(a.id)) b.correlation.relatedIds.push(a.id)
    for (const e of [a, b]) {
      if (e.correlation.confidence === 'none') { e.correlation.confidence = 'exact'; e.correlation.note = note }
    }
  }
  const versions = rest.filter((e) => e.family === 'fontes')
  const gmuds = rest.filter((e) => e.family === 'publicacoes')
  const qualities = rest.filter((e) => e.family === 'qualidade')

  for (const g of gmuds) {
    for (const v of versions) {
      const sameCommit = !!g.correlation.keys.commitSha && g.correlation.keys.commitSha === v.correlation.keys.commitSha
      const sameGmud = g.correlation.keys.gmudId != null && g.correlation.keys.gmudId === v.correlation.keys.gmudId
      if (sameCommit) link(g, v, `Mesmo commit ${String(g.correlation.keys.commitSha).slice(0, 8)} — publicação GMUD ↔ versão da fonte (id inequívoco).`)
      else if (sameGmud) link(g, v, `Mesma GMUD #${g.correlation.keys.gmudId} — publicação ↔ versão (id inequívoco).`)
    }
  }
  for (const q of qualities) {
    for (const v of versions) {
      const sameBlob = !!q.correlation.keys.blobSha && q.correlation.keys.blobSha === v.correlation.keys.blobSha
      if (sameBlob) link(q, v, `Mesmo blob ${String(q.correlation.keys.blobSha).slice(0, 8)} — análise de qualidade ↔ versão da fonte (id inequívoco).`)
    }
  }

  // 3) ordena por data desc (nulls por último), estável
  return rest.slice().sort((a, b) => {
    const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : -Infinity
    const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : -Infinity
    return tb - ta
  })
}
