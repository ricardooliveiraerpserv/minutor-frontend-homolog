// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — contratos (tipos) do backend REAL (dashboards-service).
// NÃO inventar campos. Fonte de verdade: backend/routes/*.js, backend/lib/*.js e o
// consumo em sites/js/*.js do dashboards-service (branch feat/fixture-dev-mode).
//
// Estes tipos são a fronteira entre a UI e o datasource: a UI só conhece isto,
// nunca sabe se os dados vêm de fixture (F4) ou da conexão live (F6/D-live).
//
// TODA leitura/operação recebe `environmentId` — o módulo modela 2 níveis
// EMPRESA → AMBIENTE Protheus (não assumir 1 empresa = 1 ambiente).
// ─────────────────────────────────────────────────────────────────────────────

// ── Empresa / Ambiente ────────────────────────────────────────────────────────

export interface OperacoesCompany {
  id: string
  name: string
}

export interface OperacoesEnvironment {
  id: string
  companyId: string
  label: string
  /** Rótulo curto do tipo (Produção / Homologação / Desenvolvimento). */
  kind: 'producao' | 'homologacao' | 'desenvolvimento'
}

// ── /services/status ──────────────────────────────────────────────────────────
// Shape EXATO de routes/services.js + lib/fixtures.js servicesStatus():
// { name, displayName, label, type, port, status, found, cpu, memory }
export type ServiceStatus = 'Running' | 'Stopped' | 'Unknown'
export type ServiceType =
  | 'broker' | 'slave' | 'rest' | 'schedule' | 'compiler' | 'exclusive' | 'extra'

export interface ServiceRow {
  name: string
  displayName: string
  label: string
  type: ServiceType
  port: number | null
  status: ServiceStatus
  found: boolean
  /** Percentual de CPU (0–100). 0 quando não coletado. */
  cpu: number
  /** Memória residente em bytes. 0 quando não coletado. */
  memory: number
}

// ── /system/info ──────────────────────────────────────────────────────────────
export interface RpoFile {
  path: string
  name: string
  /** ISO ou null. */
  mtime: string | null
  error?: string
}

export interface SystemInfo {
  valid: boolean
  errors: string[]
  appEnvironment: string
  rootPath: string
  startPath: string
  sourcePath: string
  rpoCustom: string
  rpoVersion: string
  inactiveTimeout: string
  trace: string
  specialKey: string
  topDatabase: string
  topAlias: string
  topServer: string
  port: number
  serviceName: string
  serviceDisplayName: string
  rpoFiles: RpoFile[]
  iniPath: string
}

// ── /system/folder-status ─────────────────────────────────────────────────────
export type FolderLevel = 'green' | 'yellow' | 'red' | 'error'

export interface ExtensionCount {
  ext: string
  count: number
}

export interface FolderStatus {
  systemFolder: string
  spoolFolder: string
  systemTotal: number
  spoolTotal: number
  extensionBreakdown: ExtensionCount[]
  slaveTskCount: number
  level: FolderLevel
}

// ── /system/console-sources + /system/console-log ─────────────────────────────
export interface ConsoleSource {
  id: string
  label: string
  logPath: string
}

export interface ConsoleLog {
  logPath: string
  totalLines: number
  lines: string[]
}

// ── /utilities/exclusive/state ────────────────────────────────────────────────
export interface ExclusiveState {
  active: boolean
  activatedBy?: string
  /** ISO. */
  activatedAt?: string
}

// ── /build/sources-inventory ──────────────────────────────────────────────────
export type SourceInvStatus =
  | 'sincronizado' | 'disco_mais_novo' | 'apenas_disco' | 'apenas_rpo'

export interface SourceInvItem {
  name: string
  /** ISO ou null. */
  diskMtime: string | null
  /** ISO ou null. */
  rpoTimestamp: string | null
  status: SourceInvStatus
}

export interface SourcesInventorySummary {
  sincronizado: number
  disco_mais_novo: number
  apenas_disco: number
  apenas_rpo: number
}

export interface SourcesInventory {
  dir: string
  items: SourceInvItem[]
  summary: SourcesInventorySummary
}

// ── /build/changes ────────────────────────────────────────────────────────────
export type ChangeType = 'compile' | 'patch-apply' | 'promote-rpo' | 'rollback-rpo'

export interface ChangeEntry {
  id: string
  type: ChangeType
  username: string
  /** ISO. */
  timestamp: string
  files: string[]
  results?: unknown[]
  success: boolean
  logFile?: string
  output?: string
  details?: Record<string, unknown>
}

// ── /audit ────────────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string
  username: string
  action: string
  detail: string
  success: boolean
  /** ISO. */
  timestamp: string
}

// ── /config (ambiente completo) ───────────────────────────────────────────────
// Shape espelha rawConfig()/config() de lib/fixtures.js. Segredos JAMAIS em claro
// (healthCheckPass mascarado; a UI mostra apenas "Configurado").
export interface BrokerConfig {
  enabled: boolean
  exePath: string
  iniPath: string
  serviceName: string
  serviceDisplayName: string
  port: number
}

export interface SlaveConfig {
  exePath: string
  uncPath: string
  iniPath: string
  valid: boolean
  errors: string[]
  appEnvironment: string
  serviceName: string
  serviceDisplayName: string
  port: number
  rootPath: string
  startPath: string
  sourcePath: string
  rpoCustom: string
  rpoVersion: string
}

export interface RestServerConfig {
  exePath: string
  healthCheckUrl: string
  healthCheckUser: string
  /** Sempre mascarado na leitura ('' ou '••••••••'); UI mostra só "Configurado". */
  healthCheckPassSet: boolean
  serviceName: string
  port: number
  hasSSL: boolean
}

export interface ScheduleServerConfig {
  exePath: string
  serviceName: string
  port: number
}

export interface CompilerConfig {
  exePath: string
  serviceName: string
  port: number
  appEnvironment: string
}

export interface ExclusiveConfig {
  exePath: string
  serviceName: string
  port: number
  appEnvironment: string
}

export interface ExtraServiceConfig {
  exePath: string
  name: string
  description: string
}

export interface FoldersConfig {
  patches: string
  sources: string
  getapoinfo: string
}

export interface MaintenanceWindowConfig {
  enabled: boolean
  days: string[]
  time: string
  emails: string[]
}

export interface IntegrationsConfig {
  n8nWebhookUrl: string
  alertMissingSource: boolean
}

export interface EnvironmentConfig {
  broker: BrokerConfig
  slaves: SlaveConfig[]
  restServers: RestServerConfig[]
  scheduleServers: ScheduleServerConfig[]
  compiler: CompilerConfig
  exclusive: ExclusiveConfig
  extraServices: ExtraServiceConfig[]
  folders: FoldersConfig
  rpoStrategy: string
  maintenanceWindow: MaintenanceWindowConfig
  integrations: IntegrationsConfig
  /** ISO. */
  updatedAt: string
  updatedBy: string
}

// ── /build/promote-destinations ───────────────────────────────────────────────
export interface PromoteDestination {
  key: string
  label: string
  sourcePath: string
  rpoCustom: string
  slaveIndices: number[]
}

export interface PromoteDestinations {
  destinations: PromoteDestination[]
  compilerSourcePath: string
}

// ── /build/sources + /build/patches (modais de operação) ──────────────────────
export interface BuildSources {
  dir: string
  files: string[]
  count: number
}

export interface PatchMeta {
  name: string
  version?: string
  build?: string
}

export interface PatchItem {
  file: string
  name: string
  hasSdf: boolean
  orphan: boolean
  meta?: PatchMeta
}

export interface BuildPatches {
  dir: string
  patches: PatchItem[]
  count: number
  extraction: { extracted: string[]; skipped: string[]; errors: string[] }
}

// ── Resultados de OPERAÇÃO (F4: simuladas; NUNCA executam) ─────────────────────
export interface OpItemResult {
  name: string
  success: boolean
  message?: string
  logFile?: string
  timings?: { validate?: number; apply?: number; defrag?: number }
}

export interface CompileResult {
  success: boolean
  results: OpItemResult[]
  message: string
  logFile: string
  hasSdf: boolean
}

export interface PatchApplyResult {
  success: boolean
  results: OpItemResult[]
  message: string
  logFile: string
  hasSdf: boolean
}

export interface PromoteFileStep {
  label: string
  action: string
  ok: boolean
  hashMatch?: boolean
  error?: string
}

export interface PromoteDestResult {
  key: string
  label: string
  sourcePath: string
  files: PromoteFileStep[]
  errors: string[]
}

export interface PromoteRpoResult {
  success: boolean
  results: OpItemResult[]
  destResults: PromoteDestResult[]
  message: string
}

export interface RollbackSlaveResult {
  index: number
  name: string
  files: { label: string; ok: boolean; hash?: string; error?: string }[]
  errors: string[]
}

export interface RollbackRpoResult {
  success: boolean
  results: OpItemResult[]
  slaveResults: RollbackSlaveResult[]
  message: string
}

export interface SimpleOk {
  success: boolean
  results?: { service?: string; ok: boolean; action?: string; pattern?: string; deleted?: number; dir?: string }[]
  deleted?: number
  serviceName?: string
  message?: string
}

// ── Variantes de operação (F4) ────────────────────────────────────────────────
// Resultado determinístico das operações simuladas. 'ok' é o caminho feliz;
// 'partial'/'fail' exercitam cenários de erro/parcial nas capturas e no fim-a-fim.
export type OpVariant = 'ok' | 'partial' | 'fail'

// ── Estados de teste (dev-only, lidos INTERNAMENTE pelo datasource) ────────────
export type FxState = 'empty' | 'error' | 'loading' | 'unconfigured'

// ── Interface do datasource ───────────────────────────────────────────────────
// F4 = fixture; F6/D-live troca o adapter (live) SEM tocar nas telas.
export interface OperacoesDataSource {
  getEnvironments(companyId: string): Promise<OperacoesEnvironment[]>

  // Leitura
  getServices(environmentId: string): Promise<ServiceRow[]>
  getSystemInfo(environmentId: string): Promise<SystemInfo>
  getFolderStatus(environmentId: string): Promise<FolderStatus>
  getConsoleSources(environmentId: string): Promise<ConsoleSource[]>
  getConsoleLog(environmentId: string, opts?: { source?: string; filter?: string }): Promise<ConsoleLog>
  getExclusiveState(environmentId: string): Promise<ExclusiveState>
  getSourcesInventory(environmentId: string): Promise<SourcesInventory>
  getChanges(environmentId: string, opts?: { type?: ChangeType }): Promise<ChangeEntry[]>
  getAudit(environmentId: string): Promise<AuditEntry[]>
  getConfig(environmentId: string): Promise<EnvironmentConfig | null>
  getPromoteDestinations(environmentId: string): Promise<PromoteDestinations>
  getBuildSources(environmentId: string): Promise<BuildSources>
  getBuildPatches(environmentId: string): Promise<BuildPatches>

  // Operação (F4: SIMULADAS, resultado determinístico, NUNCA executam de verdade)
  compile(environmentId: string, variant?: OpVariant): Promise<CompileResult>
  applyPatch(environmentId: string, variant?: OpVariant): Promise<PatchApplyResult>
  promoteRpo(environmentId: string, selectedKeys: string[], variant?: OpVariant): Promise<PromoteRpoResult>
  rollbackRpo(environmentId: string, variant?: OpVariant): Promise<RollbackRpoResult>
  controlService(environmentId: string, name: string, action: 'start' | 'stop' | 'restart'): Promise<SimpleOk>
  controlAllServices(environmentId: string, action: 'start' | 'stop'): Promise<SimpleOk>
  setExclusive(environmentId: string, active: boolean): Promise<SimpleOk>
  setDebug(environmentId: string, active: boolean): Promise<SimpleOk>
  cleanSystem(environmentId: string): Promise<SimpleOk>
  cleanTsk(environmentId: string): Promise<SimpleOk>
}
