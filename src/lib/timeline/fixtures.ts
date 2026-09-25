// ─────────────────────────────────────────────────────────────────────────────
// Fixtures NATIVAS da timeline (C4.2) — cada família no seu shape de origem.
// A datasource roda estes registros pelos ADAPTERS + correlate(), provando o
// read-model sem fundir storage. Desenhadas p/ exercitar os 4 cenários do gate:
//  (1) timeline normal multi-domínio; (2) build técnico+auditoria correlacionados;
//  (3) GMUD↔versão↔qualidade por identificador inequívoco; (4) eventos que ficam
//  INDEPENDENTES quando a correlação é apenas insuficiente (sem forçar união).
// ─────────────────────────────────────────────────────────────────────────────

import type { ChangeEntry, AuditEntry } from '@/lib/operacoes/types'
import type { InventoryScanOk } from '@/lib/prosight/types'
import type { GmudCommitNative, QualityAnalysisNative, SourceVersionNative } from './adapters'

const COMMIT_MATA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const BLOB_MATA = 'bbbb1111cccc2222dddd3333eeee4444ffff5555'

// ── Operações (por ambiente) ───────────────────────────────────────────────────
export const OPERACOES_ENVS: { id: string; label: string }[] = [
  { id: 'prod', label: 'Produção' },
  { id: 'hom', label: 'Homologação' },
]

// Cenário 2: compile em Produção → tem ChangeEntry E AuditEntry (mesma operação).
// Cenário 4: patch em Homologação → só ChangeEntry (sem auditoria correspondente).
export const CHANGES_BY_ENV: Record<string, ChangeEntry[]> = {
  prod: [
    { id: 'chg-1', type: 'compile', username: 'ricardo.oliveira', timestamp: '2026-08-23T08:30:00', files: ['MATA010.PRW', 'FINA050.PRW'], success: true, results: [{ name: 'MATA010.PRW', success: true }], output: 'Compilação concluída (2 fontes).' } as ChangeEntry,
  ],
  hom: [
    { id: 'chg-2', type: 'patch-apply', username: 'joao.tecnico', timestamp: '2026-08-23T07:00:00', files: ['patch_2408.ptm'], success: true, output: 'Patch aplicado.' } as ChangeEntry,
  ],
}

// Cenário 2: aud-1 casa com chg-1 (mesmo ambiente/tipo/horário). Cenário 4: aud-2
// (parada de serviço) não tem build correspondente → fica independente.
export const AUDIT_BY_ENV: Record<string, AuditEntry[]> = {
  prod: [
    { id: 'aud-1', username: 'ricardo.oliveira', action: 'compile', detail: 'Compilação disparada pela Central', success: true, timestamp: '2026-08-23T08:30:00' },
    { id: 'aud-2', username: 'maria.dev', action: 'service-stop', detail: 'Parada do AppServer slave02 para manutenção', success: true, timestamp: '2026-08-22T18:00:00' },
  ],
  hom: [],
}

// ── Fontes — versões do SourceDoc ──────────────────────────────────────────────
// v-1 casa com a publicação GMUD (mesmo commit) e com a qualidade (mesmo blob).
// v-2 (FINA050) é independente (sem GMUD/qualidade correspondentes).
export const SOURCE_VERSIONS: SourceVersionNative[] = [
  { id: 9101, source_doc_id: 5001, filename: 'MATA010.PRW', owner: 'jng', repository: 'protheus-custom', source_commit_sha: COMMIT_MATA, source_blob_sha: BLOB_MATA, gmud_id: 318, ticket_number: '4821', responsavel: 'Carla Menezes', analysis_status: 'ATUALIZADA', diff_summary: '+18 −4 linhas', created_at: '2026-08-23T09:16:00', customer_id: 1, customer_name: 'JNG Indústria' },
  { id: 9102, source_doc_id: 5002, filename: 'FINA050.PRW', owner: 'jng', repository: 'protheus-custom', source_commit_sha: 'deadbeef00112233445566778899aabbccddeeff', source_blob_sha: 'aaaa9999', gmud_id: null, ticket_number: null, responsavel: 'Bruno Alves', analysis_status: 'DESATUALIZADA', diff_summary: '+3 −1 linhas', created_at: '2026-08-22T14:45:00', customer_id: 1, customer_name: 'JNG Indústria' },
]

// ── Publicações — commits de GMUD ──────────────────────────────────────────────
// g-1 casa com v-1 por commit_sha (correlação EXATA).
export const GMUD_COMMITS: GmudCommitNative[] = [
  { id: 7201, source_doc_id: 5001, filename: 'MATA010.PRW', owner: 'jng', repository: 'protheus-custom', source_commit_sha: COMMIT_MATA, gmud_id: 318, ticket_number: '4821', responsavel: 'Carla Menezes', diff_summary: 'Ajuste na validação de estoque', created_at: '2026-08-23T09:15:00', customer_id: 1, customer_name: 'JNG Indústria', hd_ticket_id: 4821, hd_subject: 'Ajuste MATA010' },
]

// ── Qualidade — análises (CodeAnalysis) ────────────────────────────────────────
// q-1 casa com v-1 por blob_sha (EXATA). q-2 (ESTQ200) é independente (blob sem versão).
export const QUALITY_ANALYSES: QualityAnalysisNative[] = [
  { id: 8301, source_doc_id: 5001, filename: 'MATA010.PRW', owner: 'jng', repository: 'protheus-custom', source_blob_sha: BLOB_MATA, status: 'completed', score: 82, grade: 'B', risk: 'baixo', requested_at: '2026-08-23T09:19:00', completed_at: '2026-08-23T09:20:00', stale: false, customer_id: 1, customer_name: 'JNG Indústria' },
  { id: 8302, source_doc_id: 5099, filename: 'ESTQ200.PRW', owner: 'jng', repository: 'protheus-custom', source_blob_sha: 'cccc2222', status: 'completed', score: 61, grade: 'D', risk: 'médio', requested_at: '2026-08-23T05:10:00', completed_at: '2026-08-23T05:12:00', stale: true, customer_id: 1, customer_name: 'JNG Indústria' },
]

// ── Inventário — scan Git×RPO (snapshot por empresa) ──────────────────────────
export const INVENTORY_SCANS: { companyId: number; companyLabel: string; scan: InventoryScanOk }[] = [
  {
    companyId: 1, companyLabel: 'JNG Indústria',
    scan: {
      scannedAt: '2026-08-23T06:00:00', gitUrl: 'https://github.com/jng/protheus-custom',
      rpoSource: { type: 'advpl_api', url: 'https://rpo.jng.local/api' },
      summary: { counts: { sincronizado: 10, recompilar: 1, verificar_rpo: 1, nao_compilado: 1, so_rpo: 0 }, total: 13, healthPct: 77, healthLabel: 'Alerta', restApiCount: 2 },
      results: [],
    },
  },
]
