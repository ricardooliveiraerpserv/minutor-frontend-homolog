// ─────────────────────────────────────────────────────────────────────────────
// Atividade & Auditoria (C4.2) — READ-MODEL de timeline transversal do Prosight.
//
// PRINCÍPIO (regra do produto): esta camada é SÓ LEITURA. NÃO é fonte de verdade,
// NÃO funde storages. Cada evento nasce de um datasource nativo (Operações /
// source-docs / GMUD / Qualidade / Inventário), é convertido por um ADAPTER para
// o contrato canônico abaixo, e carrega SEMPRE sua procedência (authority/origin).
//
// Correlação ≠ identidade. Só marcamos `exact` quando existe um identificador
// INEQUÍVOCO (mesmo commit_sha / blob_sha / gmud_id / id nativo). Alinhamento por
// atributos (usuário+tipo+timestamp+ambiente) é `strong`/`heuristic`, NUNCA `exact`.
// Eventos sem correlação permanecem independentes (`none`). Eventos sem ator ficam
// sem ator (nunca inferir usuário).
//
// PENDÊNCIA DO LIVE (documentada): operações que hoje não têm identificador de
// correlação persistente na origem (ex.: build gera ChangeEntry + AuditEntry
// separados, sem operationId comum) deveriam, no live, emitir um
// operationId/jobId/correlationId gerado na ORIGEM da operação. Enquanto isso, a
// consolidação técnica+auditoria fica em `strong`/`heuristic`, explicitada na UI.
// ─────────────────────────────────────────────────────────────────────────────

/** Domínio do evento — eixo dos filtros (Todos | Operações | Fontes | Publicações | Qualidade | Inventário). */
export type TimelineFamily = 'operacoes' | 'fontes' | 'publicacoes' | 'qualidade' | 'inventario'

/** Resultado normalizado (derivado por adapter a partir do success/status nativo). */
export type TimelineOutcome = 'ok' | 'fail' | 'partial' | 'pending' | 'info'

/** Confiança da correlação. `exact` só com identificador inequívoco. */
export type CorrelationConfidence = 'exact' | 'strong' | 'heuristic' | 'none'

/** Autoridade do dado (procedência real — a UI rotula). */
export type TimelineAuthority = 'minutor-db' | 'git' | 'codeanalysis'

/** Eixos de correlação descobertos no discovery + ids nativos disponíveis. */
export interface TimelineCorrelationKeys {
  gmudId?: number | null
  ticketNumber?: string | null
  blobSha?: string | null
  commitSha?: string | null
  environmentId?: string | null
  sourceDocId?: number | null
  companyId?: string | number | null
}

/**
 * Uma FACETA = um registro nativo que compõe o evento. Um build correlacionável
 * tem 2 facetas (técnica = ChangeEntry, auditoria = AuditEntry) no MESMO evento,
 * cada uma mantendo sua origem/autoridade — os storages permanecem separados.
 */
export interface TimelineFacet {
  // C1 (aditivo, não-quebrável): 'source-action' (ações/governança do action_log),
  // 'campaign' (eventos de campanha semântica), 'coverage-scan' (cobertura real por repo).
  kind: 'build' | 'audit' | 'source-version' | 'gmud-commit' | 'gmud-package' | 'quality' | 'inventory-scan'
    | 'source-action' | 'campaign' | 'coverage-scan'
  /** Datasource nativo de origem (não é fundido; é a procedência). */
  source: 'operacoes' | 'source-docs' | 'gmud' | 'quality' | 'inventario'
  authority: TimelineAuthority
  /** Origem física/legível ("Windows/AppServer", "source-docs", "CodeAnalysis", "Git"). */
  origin: string
  /** Id no storage nativo (string; number é serializado). Não é a identidade do evento consolidado. */
  nativeId: string
  detail?: string
  payload?: Record<string, unknown>
}

export interface TimelineCorrelation {
  confidence: CorrelationConfidence
  keys: TimelineCorrelationKeys
  /** Ids de OUTROS TimelineEvent relacionados (ex.: publicação GMUD ↔ versão da fonte). */
  relatedIds: string[]
  /** Explica a base da correlação (qual identificador/heurística) — para a UI ser honesta. */
  note?: string
}

export interface TimelineEvent {
  /** Id do EVENTO consolidado (derivado, estável). NÃO é identidade de storage. */
  id: string
  family: TimelineFamily
  /** "O quê" — título legível. */
  title: string
  /** Subtipo nativo (compile | patch-apply | validate | gmud-publish | quality-analysis | inventory-scan | …). */
  subtype: string
  /** "Onde" — ambiente / empresa / repo / fonte. */
  where: string
  /** "Quando" — ISO normalizado (pode ser null quando a origem não expõe). */
  occurredAt: string | null
  /** "Quem" — null quando desconhecido. NUNCA inferir. */
  actor: string | null
  /** "Resultado". */
  outcome: TimelineOutcome
  /** 1+ facetas nativas (2 = build técnico + auditoria correlacionados). */
  facets: TimelineFacet[]
  /** "Relação com outros eventos". */
  correlation: TimelineCorrelation
}

/** Rótulos de UI (a UI faz o label; a lógica usa os enums). */
export const FAMILY_META: Record<TimelineFamily, { label: string; short: string }> = {
  operacoes: { label: 'Operações', short: 'Operações' },
  fontes: { label: 'Fontes', short: 'Fontes' },
  publicacoes: { label: 'Publicações', short: 'Publicações' },
  qualidade: { label: 'Qualidade', short: 'Qualidade' },
  inventario: { label: 'Inventário', short: 'Inventário' },
}

export const AUTHORITY_META: Record<TimelineAuthority, { label: string }> = {
  'minutor-db': { label: 'Minutor DB' },
  git: { label: 'Git' },
  codeanalysis: { label: 'CodeAnalysis' },
}

export const OUTCOME_META: Record<TimelineOutcome, { label: string; variant: string }> = {
  ok: { label: 'OK', variant: 'success' },
  fail: { label: 'Falha', variant: 'danger' },
  partial: { label: 'Parcial', variant: 'warning' },
  pending: { label: 'Em andamento', variant: 'primary' },
  info: { label: 'Info', variant: 'default' },
}

export const CONFIDENCE_META: Record<CorrelationConfidence, { label: string; variant: string; help: string }> = {
  exact: { label: 'Correlação exata', variant: 'success', help: 'Identificador inequívoco compartilhado (commit/blob/gmud/id nativo).' },
  strong: { label: 'Correlação forte', variant: 'primary', help: 'Múltiplos atributos coincidem, mas sem identificador único (heurística forte).' },
  heuristic: { label: 'Correlação heurística', variant: 'warning', help: 'Alinhamento aproximado por atributos — pode não ser a mesma operação.' },
  none: { label: 'Independente', variant: 'default', help: 'Sem correlação suficiente — mantido como evento independente.' },
}
