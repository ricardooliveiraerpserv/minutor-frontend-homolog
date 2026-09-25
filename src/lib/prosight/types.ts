// ─────────────────────────────────────────────────────────────────────────────
// Prosight — contratos (tipos) do backend REAL. NÃO inventar campos.
// Fonte: prosight-service (Inventário Git × RPO, Licenciamento, Configuração).
// Estes tipos são a fronteira entre a UI e o datasource: a UI só conhece isto,
// nunca sabe se os dados vêm de fixture (F2) ou da conexão live (F6).
// ─────────────────────────────────────────────────────────────────────────────

// ── Inventário ──────────────────────────────────────────────────────────────

/** Os 5 status possíveis de um fonte (disco × RPO). */
export type InventoryStatus =
  | 'sincronizado'
  | 'recompilar'
  | 'verificar_rpo'
  | 'nao_compilado'
  | 'so_rpo'

/** Rótulo de saúde global do inventário. */
export type HealthLabel = 'Critico' | 'Alerta' | 'Regular' | 'Saudavel'

export type RpoType = 'Custom' | 'Standard'

export interface InventoryResultRow {
  program: string
  diskPath: string | null
  diskDate: string | null
  rpoDate: string | null
  rpoStatus: string | null
  rpoType: RpoType | null
  status: InventoryStatus
  isRestApi: boolean
}

export interface InventorySummary {
  counts: Record<InventoryStatus, number>
  total: number
  healthPct: number
  healthLabel: HealthLabel
  restApiCount: number
}

export interface InventoryScanOk {
  scannedAt: string
  gitUrl: string
  rpoSource: { type: 'advpl_api'; url: string }
  summary: InventorySummary
  results: InventoryResultRow[]
}

export interface ApiFailure {
  ok: false
  error: string
}

export type InventoryScanResult = InventoryScanOk | ApiFailure

// ── Licenciamento ────────────────────────────────────────────────────────────

export interface LicensingModule {
  sigla: string
  nome: string
  eventos: number
  usuariosUnicos: number
  pico15min: number
}

export interface LicensingProfiles {
  full: number
  light: number
  cfgOnly: number
}

export interface LicensingData {
  periodo: { inicio: string; fim: string; dias: number }
  totalEventos: number
  totalUsuarios: number
  picoGlobal: { valor: number; horario: string }
  mediaDia: number
  horaPico: number
  modulos: LicensingModule[]
  perfis: LicensingProfiles
  /** 24 números — atividade (usuários únicos) por hora do dia. */
  atividadePorHora: number[]
}

export interface LicensingDataOk {
  data: LicensingData
}
export interface LicensingEmpty {
  vazio: true
}
export type LicensingDataResult = LicensingDataOk | LicensingEmpty | ApiFailure

export type CustomType = 'USER' | 'PARTNER'

export interface CustomRow {
  programa: string
  tipo: CustomType
  execucoes: number
  usuariosUnicos: number
  /** 'YYYYMMDD' ou vazio. */
  ultimaExecucao: string
}

export interface LicensingCustomsOk {
  total: number
  comUso: number
  semUso: number
  itens: CustomRow[]
}
export type LicensingCustomsResult = LicensingCustomsOk | ApiFailure

// ── Configuração ─────────────────────────────────────────────────────────────

export interface ProsightConfig {
  gitUrl: string
  gitBranch: string
  rpoApiUrl: string
  rpoApiUser: string
  rpoExclusionPatterns: string
  rpoApiPasswordSet: boolean
  gitTokenSet: boolean
  updatedAt: string
  updatedBy: string
}

export interface SaveConfigPayload {
  gitUrl: string
  gitBranch: string
  rpoApiUrl: string
  rpoApiUser: string
  rpoApiPassword?: string
  rpoExclusionPatterns: string
  gitToken?: string
}

export interface SaveConfigResult {
  success: boolean
  saved: Partial<ProsightConfig>
}

export interface CheckApiPayload {
  rpoApiUrl: string
  rpoApiUser: string
  rpoApiPassword: string
}

export interface CheckApiResult {
  configured: boolean
  online: boolean
  compiled: boolean
  responseMs: number
  message: string
}

// ── Interface do datasource ──────────────────────────────────────────────────
// F2 = fixture; F6 troca o adapter (live) SEM tocar nas telas.
// companyId = empresa ativa do Minutor (multi-empresa). No F2 seleciona o dataset
// fixture por empresa; no F6 é repassado ao backend/BFF (que mapeará empresa→config).
export interface ProsightDataSource {
  scanInventory(companyId: number | null): Promise<InventoryScanResult>
  getLicensingData(companyId: number | null, dtIni: string, dtFim: string): Promise<LicensingDataResult>
  getLicensingCustoms(companyId: number | null, dtIni: string, dtFim: string): Promise<LicensingCustomsResult>
  getConfig(): Promise<ProsightConfig>
  saveConfig(payload: SaveConfigPayload): Promise<SaveConfigResult>
  checkApi(payload: CheckApiPayload): Promise<CheckApiResult>
}
