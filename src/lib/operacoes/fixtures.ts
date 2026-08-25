// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — FIXTURES determinísticas (F4). Baseadas SÓ nos contratos
// reais (dashboards-service: backend/lib/fixtures.js, routes/*.js, sites/js/*.js).
// Nenhuma chamada externa; nenhuma operação executa nada de verdade.
//
// Estrutura EMPRESA → AMBIENTE: empresa JNG com 3 ambientes Protheus
// (Produção / Homologação / Desenvolvimento). Trocar de ambiente troca TODO o
// conteúdo (appservers, info, fontes, RPO, mudanças, auditoria, config).
//
// Cobertura dos 22 cenários (ver MATRIZ no relatório):
//   Ambiente Produção      → saudável, config preenchida, dados populados.
//   Ambiente Homologação   → 1 serviço parado + 1 degradado + debug ativo.
//   Ambiente Desenvolvimento → modo exclusivo ativo.
//   ?fx=empty|error|loading|unconfigured (dev-only) → estados de tela.
//   Operações (compile/patch/promote/rollback) → variantes ok|partial|fail,
//     que APPENDam entradas em Mudanças/Auditoria (store em memória) p/ dar a
//     sensação fim-a-fim mesmo sem infra.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AuditEntry,
  BuildPatches,
  BuildSources,
  ChangeEntry,
  ChangeType,
  CompileResult,
  ConsoleLog,
  ConsoleSource,
  EnvironmentConfig,
  ExclusiveState,
  FolderStatus,
  OpVariant,
  OperacoesCompany,
  OperacoesEnvironment,
  PatchApplyResult,
  PromoteDestinations,
  PromoteRpoResult,
  RollbackRpoResult,
  ServiceRow,
  SimpleOk,
  SourcesInventory,
  SystemInfo,
} from './types'

// ── Empresa / Ambientes ───────────────────────────────────────────────────────

export const COMPANY_JNG: OperacoesCompany = { id: 'jng', name: 'JNG' }

export const ENV_PROD = 'jng-prod'
export const ENV_HOM = 'jng-hom'
export const ENV_DEV = 'jng-dev'

export const ENVIRONMENTS: OperacoesEnvironment[] = [
  { id: ENV_PROD, companyId: 'jng', label: 'Produção', kind: 'producao' },
  { id: ENV_HOM, companyId: 'jng', label: 'Homologação', kind: 'homologacao' },
  { id: ENV_DEV, companyId: 'jng', label: 'Desenvolvimento', kind: 'desenvolvimento' },
]

export function envMeta(environmentId: string): OperacoesEnvironment {
  return ENVIRONMENTS.find((e) => e.id === environmentId) ?? ENVIRONMENTS[1]
}

// Datas determinísticas p/ reprodutibilidade das capturas.
const BASE = Date.UTC(2026, 7, 23, 12, 0, 0)
const ISO = (offsetMin = 0): string => new Date(BASE - offsetMin * 60000).toISOString()

// ── Config por ambiente (espelha rawConfig()/config() de lib/fixtures.js) ──────

function baseConfig(environmentId: string): EnvironmentConfig {
  const m = envMeta(environmentId)
  const suffix = m.kind === 'producao' ? 'PRD' : m.kind === 'homologacao' ? 'HOM' : 'DEV'
  const appEnv = m.kind === 'producao' ? 'PRODUCAO' : m.kind === 'homologacao' ? 'HOMOLOGACAO' : 'DESENVOLVIMENTO'
  const rpoVersion = m.kind === 'producao' ? '12.1.2410' : '12.1.2310'
  const dataRoot = `C:\\TOTVS\\${suffix.toLowerCase()}\\protheus_data`
  const srv = `SRV${suffix}`
  return {
    broker: {
      enabled: true,
      exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_broker\\appserver.exe`,
      iniPath: `C:\\TOTVS\\${suffix}\\bin\\appserver_broker\\appserver.ini`,
      serviceName: `TOTVS_Broker_${suffix}`,
      serviceDisplayName: `TOTVS App Server Broker ${suffix}`,
      port: 1234,
    },
    slaves: [
      {
        exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_slave01\\appserver.exe`,
        uncPath: `\\\\${srv}\\bin\\appserver_slave01`,
        iniPath: `C:\\TOTVS\\${suffix}\\bin\\appserver_slave01\\appserver.ini`,
        valid: true, errors: [],
        appEnvironment: appEnv,
        serviceName: `TOTVS_Slave01_${suffix}`,
        serviceDisplayName: `TOTVS App Server Slave 01 ${suffix}`,
        port: 1235,
        rootPath: dataRoot,
        startPath: '\\system\\',
        sourcePath: `C:\\TOTVS\\${suffix}\\protheus\\apo`,
        rpoCustom: 'TTTP120.rpo',
        rpoVersion,
      },
      {
        exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_slave02\\appserver.exe`,
        uncPath: `\\\\${srv}\\bin\\appserver_slave02`,
        iniPath: `C:\\TOTVS\\${suffix}\\bin\\appserver_slave02\\appserver.ini`,
        valid: true, errors: [],
        appEnvironment: appEnv,
        serviceName: `TOTVS_Slave02_${suffix}`,
        serviceDisplayName: `TOTVS App Server Slave 02 ${suffix}`,
        port: 1236,
        rootPath: dataRoot,
        startPath: '\\system\\',
        sourcePath: `C:\\TOTVS\\${suffix}\\protheus2\\apo`,
        rpoCustom: 'TTTP120.rpo',
        rpoVersion,
      },
    ],
    restServers: [
      {
        exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_rest\\appserver.exe`,
        healthCheckUrl: `http://${srv.toLowerCase()}:2501/rest`,
        healthCheckUser: 'admin',
        healthCheckPassSet: true,
        serviceName: `TOTVS_REST_${suffix}`,
        port: 2501,
        hasSSL: m.kind === 'producao',
      },
    ],
    scheduleServers: [
      { exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_schedule\\appserver.exe`, serviceName: `TOTVS_Schedule_${suffix}`, port: 1240 },
    ],
    compiler: {
      exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_compile\\appserver.exe`,
      serviceName: `TOTVS_Compilador_${suffix}`,
      port: 1250,
      appEnvironment: appEnv,
    },
    exclusive: {
      exePath: `C:\\TOTVS\\${suffix}\\bin\\appserver_exclusive\\appserver.exe`,
      serviceName: `TOTVS_Exclusivo_${suffix}`,
      port: 1260,
      appEnvironment: appEnv,
    },
    extraServices: [
      { exePath: 'C:\\TOTVS\\dbaccess\\dbaccess.exe', name: `DBAccess64_${suffix}`, description: 'TOTVS DBAccess 64' },
    ],
    folders: {
      patches: `C:\\TOTVS\\${suffix}\\patches`,
      sources: `C:\\TOTVS\\${suffix}\\fontes`,
      getapoinfo: `C:\\TOTVS\\${suffix}\\getapoinfo`,
    },
    rpoStrategy: 'sequential',
    maintenanceWindow: { enabled: true, days: ['sat'], time: '22:00', emails: ['ti@jng.com.br'] },
    integrations: { n8nWebhookUrl: m.kind === 'producao' ? 'https://n8n.jng.com.br/webhook/protheus' : '', alertMissingSource: true },
    updatedAt: ISO(600),
    updatedBy: 'ricardo.oliveira',
  }
}

// ── Store em memória (runtime) — dá a sensação fim-a-fim das operações ──────────
// Cada ambiente tem seu estado mutável (exclusivo/debug) + históricos que crescem
// quando o usuário executa uma operação simulada. NUNCA persiste nada real.

interface Runtime {
  exclusive: ExclusiveState
  debug: boolean
  changes: ChangeEntry[]
  audit: AuditEntry[]
}

const runtimeStore = new Map<string, Runtime>()

function seedRuntime(environmentId: string): Runtime {
  const m = envMeta(environmentId)
  return {
    exclusive: m.kind === 'desenvolvimento'
      ? { active: true, activatedBy: 'ricardo.oliveira', activatedAt: ISO(30) }
      : { active: false },
    // Homologação roda com Debug ativo (compilador up); demais desligados.
    debug: m.kind === 'homologacao',
    changes: seedChanges(environmentId),
    audit: seedAudit(environmentId),
  }
}

function rt(environmentId: string): Runtime {
  let r = runtimeStore.get(environmentId)
  if (!r) { r = seedRuntime(environmentId); runtimeStore.set(environmentId, r) }
  return r
}

// ── /services/status ───────────────────────────────────────────────────────────

export function servicesFixture(environmentId: string): ServiceRow[] {
  const c = baseConfig(environmentId)
  const r = rt(environmentId)
  const list: ServiceRow[] = []
  const push = (
    name: string, displayName: string, label: string, type: ServiceRow['type'],
    port: number | null, status: ServiceRow['status'], cpu: number, memory: number,
  ) => list.push({ name, displayName, label, type, port, status, found: true, cpu, memory })

  // Modo exclusivo ativo → base parada, exclusivo Running.
  if (r.exclusive.active) {
    push(c.broker.serviceName, c.broker.serviceDisplayName, 'Broker', 'broker', c.broker.port, 'Stopped', 0, 0)
    push(c.slaves[0].serviceName, c.slaves[0].serviceDisplayName, `Slave (${c.slaves[0].port})`, 'slave', c.slaves[0].port, 'Stopped', 0, 0)
    push(c.slaves[1].serviceName, c.slaves[1].serviceDisplayName, `Slave (${c.slaves[1].port})`, 'slave', c.slaves[1].port, 'Stopped', 0, 0)
    push(c.restServers[0].serviceName, `TOTVS App Server REST ${suffixOf(environmentId)}`, `REST (${c.restServers[0].port})`, 'rest', c.restServers[0].port, 'Stopped', 0, 0)
    push(c.scheduleServers[0].serviceName, `TOTVS App Server Schedule ${suffixOf(environmentId)}`, `Schedule (${c.scheduleServers[0].port})`, 'schedule', c.scheduleServers[0].port, 'Stopped', 0, 0)
    push(c.compiler.serviceName, `TOTVS App Server Compilador ${suffixOf(environmentId)}`, 'Compilador', 'compiler', c.compiler.port, 'Stopped', 0, 0)
    push(c.exclusive.serviceName, `TOTVS App Server Exclusivo ${suffixOf(environmentId)}`, 'Exclusivo', 'exclusive', c.exclusive.port, 'Running', 3.1, 148_000_000)
    push(c.extraServices[0].name, 'TOTVS DBAccess 64', c.extraServices[0].description, 'extra', null, 'Running', 1.2, 92_000_000)
    return list
  }

  const m = envMeta(environmentId)
  // Homologação: slave02 parado; REST degradado (cpu alta).
  const slave2Stopped = m.kind === 'homologacao'
  const restDegradedCpu = m.kind === 'homologacao' ? 92.4 : 4.7

  push(c.broker.serviceName, c.broker.serviceDisplayName, 'Broker', 'broker', c.broker.port, 'Running', 1.4, 78_000_000)
  push(c.slaves[0].serviceName, c.slaves[0].serviceDisplayName, `Slave (${c.slaves[0].port})`, 'slave', c.slaves[0].port, 'Running', m.kind === 'producao' ? 12.5 : 8.2, 512_000_000)
  push(c.slaves[1].serviceName, c.slaves[1].serviceDisplayName, `Slave (${c.slaves[1].port})`, 'slave', c.slaves[1].port, slave2Stopped ? 'Stopped' : 'Running', slave2Stopped ? 0 : 9.8, slave2Stopped ? 0 : 486_000_000)
  push(c.restServers[0].serviceName, `TOTVS App Server REST ${suffixOf(environmentId)}`, `REST (${c.restServers[0].port})`, 'rest', c.restServers[0].port, 'Running', restDegradedCpu, m.kind === 'homologacao' ? 1_180_000_000 : 320_000_000)
  push(c.scheduleServers[0].serviceName, `TOTVS App Server Schedule ${suffixOf(environmentId)}`, `Schedule (${c.scheduleServers[0].port})`, 'schedule', c.scheduleServers[0].port, 'Running', 2.1, 140_000_000)
  // Debug = compilador up.
  push(c.compiler.serviceName, `TOTVS App Server Compilador ${suffixOf(environmentId)}`, 'Compilador', 'compiler', c.compiler.port, r.debug ? 'Running' : 'Stopped', r.debug ? 2.6 : 0, r.debug ? 130_000_000 : 0)
  push(c.exclusive.serviceName, `TOTVS App Server Exclusivo ${suffixOf(environmentId)}`, 'Exclusivo', 'exclusive', c.exclusive.port, 'Stopped', 0, 0)
  push(c.extraServices[0].name, 'TOTVS DBAccess 64', c.extraServices[0].description, 'extra', null, 'Running', 1.2, 92_000_000)
  return list
}

function suffixOf(environmentId: string): string {
  const m = envMeta(environmentId)
  return m.kind === 'producao' ? 'PRD' : m.kind === 'homologacao' ? 'HOM' : 'DEV'
}

// ── /system/info ────────────────────────────────────────────────────────────────

export function systemInfoFixture(environmentId: string): SystemInfo {
  const c = baseConfig(environmentId)
  const s = c.slaves[0]
  const r = rt(environmentId)
  const m = envMeta(environmentId)
  return {
    valid: true,
    errors: [],
    appEnvironment: s.appEnvironment,
    rootPath: s.rootPath,
    startPath: s.startPath,
    sourcePath: s.sourcePath,
    rpoCustom: s.rpoCustom,
    rpoVersion: s.rpoVersion,
    inactiveTimeout: '3600',
    trace: r.debug ? '1' : '0',
    specialKey: 'A1B2C3D4E5F6',
    topDatabase: 'MSSQL',
    topAlias: m.kind === 'producao' ? 'PROTHEUS_PRD' : m.kind === 'homologacao' ? 'PROTHEUS_HOM' : 'PROTHEUS_DEV',
    topServer: `SRVDB-${suffixOf(environmentId)}`,
    port: s.port,
    serviceName: s.serviceName,
    serviceDisplayName: s.serviceDisplayName,
    rpoFiles: [
      { path: `${s.sourcePath}\\TTTM120.rpo`, name: 'TTTM120.rpo', mtime: ISO(180) },
      { path: `${s.sourcePath}\\TTTP120.rpo`, name: 'TTTP120.rpo', mtime: ISO(240) },
    ],
    iniPath: s.iniPath,
  }
}

// ── /system/folder-status ────────────────────────────────────────────────────────

export function folderStatusFixture(environmentId: string): FolderStatus {
  const m = envMeta(environmentId)
  const c = baseConfig(environmentId)
  // Homologação com pasta System em nível CRÍTICO (6120 ≥ limiar red 5500); produção normal
  // (3280 < 4000 = green). Severidade da pasta System é domínio à PARTE da saúde de serviços.
  const systemTotal = m.kind === 'homologacao' ? 6120 : m.kind === 'producao' ? 3280 : 1450
  const level: FolderStatus['level'] = systemTotal < 0 ? 'error' : systemTotal < 4000 ? 'green' : systemTotal < 5500 ? 'yellow' : 'red'
  return {
    systemFolder: `${c.slaves[0].rootPath}\\system\\`,
    spoolFolder: `${c.slaves[0].rootPath}\\spool`,
    systemTotal,
    spoolTotal: m.kind === 'homologacao' ? 512 : 142,
    extensionBreakdown: [
      { ext: '.dtc', count: Math.round(systemTotal * 0.3) },
      { ext: '.gdb', count: Math.round(systemTotal * 0.2) },
      { ext: '.tsk', count: Math.round(systemTotal * 0.13) },
      { ext: '.log', count: Math.round(systemTotal * 0.11) },
      { ext: '.dbf', count: Math.round(systemTotal * 0.09) },
      { ext: '.cdx', count: Math.round(systemTotal * 0.06) },
      { ext: '(sem ext)', count: Math.round(systemTotal * 0.05) },
      { ext: '.ind', count: Math.round(systemTotal * 0.04) },
      { ext: '.tmp', count: Math.round(systemTotal * 0.02) },
    ],
    slaveTskCount: m.kind === 'homologacao' ? 38 : 12,
    level,
  }
}

// ── /system/console-sources + console-log ────────────────────────────────────────

export function consoleSourcesFixture(environmentId: string): ConsoleSource[] {
  const c = baseConfig(environmentId)
  return [
    { id: 'slave-0', label: `Slave · ${c.slaves[0].port}`, logPath: `${c.slaves[0].exePath.replace('appserver.exe', 'console.log')}` },
    { id: 'slave-1', label: `Slave · ${c.slaves[1].port}`, logPath: `${c.slaves[1].exePath.replace('appserver.exe', 'console.log')}` },
    { id: 'broker', label: 'Broker', logPath: `${c.broker.exePath.replace('appserver.exe', 'console.log')}` },
    { id: 'compiler', label: 'Compilador', logPath: `${c.compiler.exePath.replace('appserver.exe', 'console.log')}` },
  ]
}

export function consoleLogFixture(environmentId: string, opts?: { source?: string; filter?: string }): ConsoleLog {
  const c = baseConfig(environmentId)
  const env = c.slaves[0].appEnvironment
  const ver = c.slaves[0].rpoVersion
  const alias = systemInfoFixture(environmentId).topAlias
  let lines = [
    '[2026-08-23 08:59:58] [INFO] Server started on port 1235',
    `[2026-08-23 09:00:01] [INFO] Environment ${env} loaded (RPO ${ver})`,
    `[2026-08-23 09:00:02] [INFO] DBAccess connection established: MSSQL/${alias}`,
    '[2026-08-23 09:12:44] [WARN] Slow query detected (2.4s) on table SA1010',
    '[2026-08-23 09:20:10] [INFO] User ricardo.oliveira logged in from 10.0.0.15',
    '[2026-08-23 09:41:03] [ERROR] Timeout calling REST endpoint /api/oauth2/v1/token',
    '[2026-08-23 10:02:55] [INFO] Recompile finished. All files compiled successfully.',
  ]
  const source = opts?.source
  if (source) lines = [`[2026-08-23 09:00:00] [INFO] --- console: ${source} ---`, ...lines]
  const filter = opts?.filter?.trim().toLowerCase()
  if (filter) lines = lines.filter((l) => l.toLowerCase().includes(filter))
  return { logPath: consoleSourcesFixture(environmentId)[0].logPath, totalLines: lines.length, lines }
}

// ── /utilities/exclusive/state ───────────────────────────────────────────────────

export function exclusiveStateFixture(environmentId: string): ExclusiveState {
  return { ...rt(environmentId).exclusive }
}

export function debugStateFixture(environmentId: string): boolean {
  return rt(environmentId).debug
}

// ── /build/sources-inventory ──────────────────────────────────────────────────────

export function sourcesInventoryFixture(environmentId: string): SourcesInventory {
  const dir = baseConfig(environmentId).folders.sources
  const m = envMeta(environmentId)
  // Produção sincronizada; Homologação com pendências; Desenvolvimento com muitos "apenas_disco".
  let items: SourcesInventory['items']
  if (m.kind === 'producao') {
    items = [
      { name: 'MATA010.PRW', diskMtime: ISO(400), rpoTimestamp: ISO(400), status: 'sincronizado' },
      { name: 'FINA050.PRW', diskMtime: ISO(410), rpoTimestamp: ISO(410), status: 'sincronizado' },
      { name: 'TTTP120.TLPP', diskMtime: ISO(420), rpoTimestamp: ISO(420), status: 'sincronizado' },
      { name: 'U_CTBFOLD.PRW', diskMtime: ISO(430), rpoTimestamp: ISO(430), status: 'sincronizado' },
    ]
  } else if (m.kind === 'homologacao') {
    items = [
      { name: 'ZZZTELA.PRW', diskMtime: null, rpoTimestamp: ISO(120), status: 'apenas_rpo' },
      { name: 'FINA050.PRW', diskMtime: ISO(5), rpoTimestamp: ISO(300), status: 'disco_mais_novo' },
      { name: 'MATA010.PRW', diskMtime: ISO(400), rpoTimestamp: ISO(300), status: 'sincronizado' },
      { name: 'TTTP120.TLPP', diskMtime: ISO(410), rpoTimestamp: ISO(305), status: 'sincronizado' },
      { name: 'COMP001.PRX', diskMtime: ISO(20), rpoTimestamp: null, status: 'apenas_disco' },
      { name: 'RHMENU.PRW', diskMtime: ISO(30), rpoTimestamp: null, status: 'apenas_disco' },
      { name: 'U_MATREL01.PRW', diskMtime: ISO(15), rpoTimestamp: ISO(800), status: 'disco_mais_novo' },
    ]
  } else {
    items = [
      { name: 'U_NOVOREL.PRW', diskMtime: ISO(10), rpoTimestamp: null, status: 'apenas_disco' },
      { name: 'U_INTEGR9.PRW', diskMtime: ISO(25), rpoTimestamp: null, status: 'apenas_disco' },
      { name: 'U_WIP001.TLPP', diskMtime: ISO(40), rpoTimestamp: null, status: 'apenas_disco' },
      { name: 'MATA010.PRW', diskMtime: ISO(500), rpoTimestamp: ISO(500), status: 'sincronizado' },
    ]
  }
  const summary = {
    sincronizado: items.filter((i) => i.status === 'sincronizado').length,
    disco_mais_novo: items.filter((i) => i.status === 'disco_mais_novo').length,
    apenas_disco: items.filter((i) => i.status === 'apenas_disco').length,
    apenas_rpo: items.filter((i) => i.status === 'apenas_rpo').length,
  }
  return { dir, items, summary }
}

// ── /build/changes (seed + runtime) ────────────────────────────────────────────

function seedChanges(environmentId: string): ChangeEntry[] {
  const c = baseConfig(environmentId)
  return [
    {
      id: 'chg-1', type: 'compile', username: 'ricardo.oliveira', timestamp: ISO(30),
      files: ['MATA010.PRW', 'FINA050.PRW', 'TTTP120.TLPP'],
      results: [
        { name: 'MATA010.PRW', success: true },
        { name: 'FINA050.PRW', success: true },
        { name: 'TTTP120.TLPP', success: true },
      ],
      success: true, logFile: `${c.folders.sources}\\compile-2026-08-23_11-30-00.txt`,
      details: { sourcesDir: c.folders.sources, fileCount: 3 },
    },
    {
      id: 'chg-2', type: 'patch-apply', username: 'joao.tecnico', timestamp: ISO(120),
      files: ['SIGAFIN_HF001.ptm'],
      results: [{ name: 'SIGAFIN_HF001.ptm', success: true }],
      success: true, logFile: `${c.folders.patches}\\ptm-2026-08-23_10-00-00-SIGAFIN_HF001.txt`,
      details: { patchesDir: c.folders.patches, hasSdf: false },
    },
    {
      id: 'chg-3', type: 'promote-rpo', username: 'ricardo.oliveira', timestamp: ISO(200),
      files: ['TTTM120.rpo', 'TTTP120.rpo'],
      results: [{ name: c.slaves[0].serviceDisplayName, success: true }, { name: c.slaves[1].serviceDisplayName, success: true }],
      success: true,
      output: 'Promoção concluída.\n[Slave 01] TTTM120.rpo backup OK, promote hashMatch OK\n[Slave 02] TTTM120.rpo backup OK, promote hashMatch OK',
      details: {},
    },
    {
      id: 'chg-4', type: 'compile', username: 'maria.dev', timestamp: ISO(280),
      files: ['RHMENU.PRW'],
      results: [{ name: 'RHMENU.PRW', success: false }],
      success: false, logFile: `${c.folders.sources}\\compile-2026-08-23_07-20-00.txt`,
      details: { sourcesDir: c.folders.sources, fileCount: 1 },
    },
    {
      id: 'chg-5', type: 'rollback-rpo', username: 'ricardo.oliveira', timestamp: ISO(360),
      files: ['TTTM120.rpo.bak → TTTM120.rpo'],
      results: [{ name: 'slave-0', success: true }, { name: 'slave-1', success: true }],
      success: true,
      output: 'Rollback concluído em todos os slaves.\n[slave-0] TTTM120.rpo restaurado (hash 9F3A...)\n[slave-1] TTTM120.rpo restaurado (hash 9F3A...)',
      details: {},
    },
  ]
}

export function changesFixture(environmentId: string, opts?: { type?: ChangeType }): ChangeEntry[] {
  let list = [...rt(environmentId).changes].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  if (opts?.type) list = list.filter((e) => e.type === opts.type)
  return list
}

// ── /audit (seed + runtime) ─────────────────────────────────────────────────────

function seedAudit(environmentId: string): AuditEntry[] {
  const c = baseConfig(environmentId)
  return [
    { id: 'a1', username: 'ricardo.oliveira', action: 'promote-rpo', detail: '2 destinos', success: true, timestamp: ISO(200) },
    { id: 'a2', username: 'joao.tecnico', action: 'patch-apply', detail: 'SIGAFIN_HF001.ptm', success: true, timestamp: ISO(120) },
    { id: 'a3', username: 'ricardo.oliveira', action: 'compile', detail: '3 fontes compilados', success: true, timestamp: ISO(30) },
    { id: 'a4', username: 'maria.dev', action: 'compile', detail: '1 fontes compilados', success: false, timestamp: ISO(280) },
    { id: 'a5', username: 'ricardo.oliveira', action: 'exclusive-activate', detail: `Parou 6 serviços · ${c.exclusive.serviceName} iniciado`, success: true, timestamp: ISO(500) },
    { id: 'a6', username: 'ricardo.oliveira', action: 'clean-system', detail: '80 arquivos *.tmp removidos', success: true, timestamp: ISO(620) },
  ]
}

export function auditFixture(environmentId: string): AuditEntry[] {
  return [...rt(environmentId).audit].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// ── /config ──────────────────────────────────────────────────────────────────────

export function configFixture(environmentId: string): EnvironmentConfig {
  return baseConfig(environmentId)
}

// ── /build/promote-destinations ────────────────────────────────────────────────

export function promoteDestinationsFixture(environmentId: string): PromoteDestinations {
  const c = baseConfig(environmentId)
  return {
    destinations: [
      { key: `${c.slaves[0].sourcePath}|TTTP120.rpo`, label: c.slaves[0].serviceDisplayName, sourcePath: c.slaves[0].sourcePath, rpoCustom: `${c.slaves[0].sourcePath}\\TTTP120.rpo`, slaveIndices: [0] },
      { key: `${c.slaves[1].sourcePath}|TTTP120.rpo`, label: c.slaves[1].serviceDisplayName, sourcePath: c.slaves[1].sourcePath, rpoCustom: `${c.slaves[1].sourcePath}\\TTTP120.rpo`, slaveIndices: [1] },
    ],
    compilerSourcePath: `C:\\TOTVS\\${suffixOf(environmentId)}\\protheus_compile\\apo`,
  }
}

// ── /build/sources + /build/patches (modais) ───────────────────────────────────

export function buildSourcesFixture(environmentId: string): BuildSources {
  const dir = baseConfig(environmentId).folders.sources
  const files = [`${dir}\\MATA010.PRW`, `${dir}\\FINA050.PRW`, `${dir}\\TTTP120.TLPP`]
  return { dir, files, count: files.length }
}

export function buildPatchesFixture(environmentId: string): BuildPatches {
  const dir = baseConfig(environmentId).folders.patches
  return {
    dir,
    patches: [
      {
        file: `${dir}\\SIGAFIN_HF001\\SIGAFIN_HF001.ptm`, name: 'SIGAFIN_HF001.ptm',
        hasSdf: false, orphan: false, meta: { name: 'SIGAFIN Hotfix 001', version: '12.1.2310', build: '20260820' },
      },
    ],
    count: 1,
    extraction: { extracted: [], skipped: [], errors: [] },
  }
}

// ── OPERAÇÕES simuladas (NUNCA executam) — resultado determinístico por variante ──
// Após concluir, cada operação APPENDa entradas no store de Mudanças e Auditoria
// do ambiente, dando a sensação fim-a-fim (a próxima visita às telas mostra o
// registro recém-criado).

let _seq = 1000
function nextId(prefix: string): string { return `${prefix}-${_seq++}` }
const NOW_ISO = () => new Date().toISOString()

function pushChange(environmentId: string, entry: ChangeEntry): void { rt(environmentId).changes.unshift(entry) }
function pushAudit(environmentId: string, entry: AuditEntry): void { rt(environmentId).audit.unshift(entry) }

export function compileFixture(environmentId: string, variant: OpVariant = 'ok'): CompileResult {
  const c = baseConfig(environmentId)
  const logFile = `${c.folders.sources}\\compile-2026-08-23_12-00-00.txt`
  const files = ['MATA010.PRW', 'FINA050.PRW', 'TTTP120.TLPP']
  let results: CompileResult['results']
  let success: boolean
  let message: string
  if (variant === 'fail') {
    results = [
      { name: 'MATA010.PRW', success: true },
      { name: 'FINA050.PRW', success: false, message: 'Erro de sintaxe na linha 142' },
      { name: 'TTTP120.TLPP', success: false, message: 'Função U_XYZ não encontrada' },
    ]
    success = false
    message = 'Compilação falhou. Verifique o log: compile-2026-08-23_12-00-00.txt'
  } else if (variant === 'partial') {
    results = [
      { name: 'MATA010.PRW', success: true },
      { name: 'FINA050.PRW', success: true },
      { name: 'TTTP120.TLPP', success: false, message: 'Warning tratado como erro' },
    ]
    success = false
    message = '2 de 3 fontes compilados. 1 com falha — verifique o log.'
  } else {
    results = files.map((name) => ({ name, success: true }))
    success = true
    message = '3 fontes compilados. Promova o RPO para aplicar em produção.'
  }
  const okCount = results.filter((r) => r.success).length
  pushChange(environmentId, {
    id: nextId('chg'), type: 'compile', username: 'ricardo.oliveira', timestamp: NOW_ISO(),
    files, results, success, logFile, details: { sourcesDir: c.folders.sources, fileCount: files.length },
  })
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: 'compile',
    detail: `${okCount} de ${files.length} fontes compilados`, success, timestamp: NOW_ISO(),
  })
  return { success, results, message, logFile, hasSdf: false }
}

export function patchApplyFixture(environmentId: string, variant: OpVariant = 'ok'): PatchApplyResult {
  const c = baseConfig(environmentId)
  const logFile = `${c.folders.patches}\\ptm-2026-08-23_12-00-00-SIGAFIN_HF001.txt`
  let results: PatchApplyResult['results']
  let success: boolean
  let message: string
  if (variant === 'fail' || variant === 'partial') {
    results = [{ name: 'SIGAFIN_HF001.ptm', success: false, logFile, timings: { validate: 1.1 }, message: 'Validação do pacote falhou' }]
    success = false
    message = 'Aplicação falhou em: SIGAFIN_HF001.ptm. Verifique o log.'
  } else {
    results = [{ name: 'SIGAFIN_HF001.ptm', success: true, logFile, timings: { validate: 1.2, apply: 4.8, defrag: 2.1 } }]
    success = true
    message = '1 patch(es) aplicado(s). Promova o RPO para as alterações terem efeito.'
  }
  pushChange(environmentId, {
    id: nextId('chg'), type: 'patch-apply', username: 'ricardo.oliveira', timestamp: NOW_ISO(),
    files: ['SIGAFIN_HF001.ptm'], results, success, logFile, details: { patchesDir: c.folders.patches, hasSdf: false },
  })
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: 'patch-apply',
    detail: 'SIGAFIN_HF001.ptm', success, timestamp: NOW_ISO(),
  })
  return { success, results, message, logFile, hasSdf: false }
}

export function promoteRpoFixture(environmentId: string, selectedKeys: string[], variant: OpVariant = 'ok'): PromoteRpoResult {
  const all = promoteDestinationsFixture(environmentId).destinations
  const dests = selectedKeys.length ? all.filter((d) => selectedKeys.includes(d.key)) : all
  const destResults = dests.map((d, i) => {
    const failThis = (variant === 'fail' && i === dests.length - 1) || (variant === 'partial' && i === dests.length - 1)
    return {
      key: d.key, label: d.label, sourcePath: d.sourcePath,
      files: [
        { label: 'TTTM120.rpo', action: 'backup', ok: true },
        { label: 'TTTM120.rpo', action: 'promote', hashMatch: !failThis, ok: !failThis, ...(failThis ? { error: 'hash mismatch' } : {}) },
      ],
      errors: failThis ? ['Hash mismatch em TTTM120.rpo'] : [],
    }
  })
  const results = destResults.map((d) => ({ name: d.label || d.sourcePath, success: d.errors.length === 0 }))
  const success = destResults.every((d) => d.errors.length === 0)
  pushChange(environmentId, {
    id: nextId('chg'), type: 'promote-rpo', username: 'ricardo.oliveira', timestamp: NOW_ISO(),
    files: ['TTTM120.rpo', 'TTTP120.rpo'], results, success,
    output: destResults.map((d) => `[${d.label}] ${d.errors.length ? d.errors.join('; ') : 'promote OK'}`).join('\n'),
    details: {},
  })
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: 'promote-rpo',
    detail: `${dests.length} destino(s)`, success, timestamp: NOW_ISO(),
  })
  return { success, results, destResults, message: success ? 'RPO promovido com sucesso.' : 'Promoção concluída com erros. Verifique os detalhes.' }
}

export function rollbackRpoFixture(environmentId: string, variant: OpVariant = 'ok'): RollbackRpoResult {
  const c = baseConfig(environmentId)
  const slaveResults = c.slaves.map((s, i) => {
    const failThis = (variant === 'fail' || variant === 'partial') && i === c.slaves.length - 1
    return {
      index: i, name: s.serviceDisplayName,
      files: failThis
        ? [{ label: 'TTTM120.rpo', ok: false, error: 'Backup não encontrado' }]
        : [{ label: 'TTTM120.rpo', ok: true, hash: '9F3A1C2E4B5D6789AABBCCDDEEFF0011' }],
      errors: failThis ? [`Backup não encontrado: ${s.sourcePath}\\TTTM120.rpo.bak`] : [],
    }
  })
  const results = slaveResults.map((r) => ({ name: r.name, success: r.errors.length === 0 }))
  const success = slaveResults.every((r) => r.errors.length === 0)
  pushChange(environmentId, {
    id: nextId('chg'), type: 'rollback-rpo', username: 'ricardo.oliveira', timestamp: NOW_ISO(),
    files: ['TTTM120.rpo.bak → TTTM120.rpo'], results, success,
    output: slaveResults.map((r) => `[${r.name}] ${r.errors.length ? r.errors.join('; ') : 'restaurado'}`).join('\n'),
    details: {},
  })
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: 'rollback-rpo',
    detail: `${c.slaves.length} slave(s)`, success, timestamp: NOW_ISO(),
  })
  return { success, results, slaveResults, message: success ? 'Rollback concluído em todos os slaves.' : 'Rollback concluído com erros. Verifique os detalhes.' }
}

// ── Serviços / utilidades — sucesso determinístico + registro na auditoria ──────

export function controlServiceFixture(environmentId: string, name: string, action: 'start' | 'stop' | 'restart'): SimpleOk {
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: `service-${action}`,
    detail: name, success: true, timestamp: NOW_ISO(),
  })
  return { success: true }
}

export function controlAllServicesFixture(environmentId: string, action: 'start' | 'stop'): SimpleOk {
  const c = baseConfig(environmentId)
  const targets = [c.broker.serviceName, c.slaves[0].serviceName, c.slaves[1].serviceName, c.restServers[0].serviceName, c.scheduleServers[0].serviceName, c.compiler.serviceName]
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: `${action}-all`,
    detail: `${targets.length} serviços`, success: true, timestamp: NOW_ISO(),
  })
  return { success: true, results: targets.map((service) => ({ service, ok: true })) }
}

export function setExclusiveFixture(environmentId: string, active: boolean): SimpleOk {
  const c = baseConfig(environmentId)
  const r = rt(environmentId)
  r.exclusive = active ? { active: true, activatedBy: 'ricardo.oliveira', activatedAt: NOW_ISO() } : { active: false }
  if (active) r.debug = false
  const results = active
    ? [
        { action: 'stop', service: c.broker.serviceName, ok: true },
        { action: 'stop', service: c.slaves[0].serviceName, ok: true },
        { action: 'stop', service: c.slaves[1].serviceName, ok: true },
        { action: 'stop', service: c.restServers[0].serviceName, ok: true },
        { action: 'stop', service: c.scheduleServers[0].serviceName, ok: true },
        { action: 'stop', service: c.compiler.serviceName, ok: true },
        { action: 'start-exclusive', service: c.exclusive.serviceName, ok: true },
      ]
    : [
        { action: 'stop-exclusive', service: c.exclusive.serviceName, ok: true },
        { action: 'start', service: c.broker.serviceName, ok: true },
        { action: 'start', service: c.slaves[0].serviceName, ok: true },
        { action: 'start', service: c.slaves[1].serviceName, ok: true },
        { action: 'start', service: c.restServers[0].serviceName, ok: true },
        { action: 'start', service: c.scheduleServers[0].serviceName, ok: true },
      ]
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: active ? 'exclusive-activate' : 'exclusive-deactivate',
    detail: active ? `Parou 6 serviços · ${c.exclusive.serviceName} iniciado` : 'Exclusivo encerrado · slaves reativados',
    success: true, timestamp: NOW_ISO(),
  })
  return { success: true, results }
}

export function setDebugFixture(environmentId: string, active: boolean): SimpleOk {
  const c = baseConfig(environmentId)
  rt(environmentId).debug = active
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: active ? 'debug-activate' : 'debug-deactivate',
    detail: c.compiler.serviceName, success: true, timestamp: NOW_ISO(),
  })
  return { success: true, serviceName: c.compiler.serviceName }
}

export function cleanSystemFixture(environmentId: string): SimpleOk {
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: 'clean-system',
    detail: '252 arquivos removidos', success: true, timestamp: NOW_ISO(),
  })
  return {
    success: true,
    results: [
      { pattern: '*.tmp', deleted: 80, ok: true },
      { pattern: 'sc*.log', deleted: 24, ok: true },
      { pattern: 'sc*.cdx', deleted: 6, ok: true },
      { pattern: 'spool\\*.*', deleted: 142, ok: true },
    ],
  }
}

export function cleanTskFixture(environmentId: string): SimpleOk {
  const c = baseConfig(environmentId)
  pushAudit(environmentId, {
    id: nextId('a'), username: 'ricardo.oliveira', action: 'clean-tsk',
    detail: '12 arquivos TSK removidos', success: true, timestamp: NOW_ISO(),
  })
  return {
    success: true, deleted: 12,
    results: [
      { dir: `${c.slaves[0].exePath.replace('\\appserver.exe', '')}`, deleted: 7, ok: true },
      { dir: `${c.slaves[1].exePath.replace('\\appserver.exe', '')}`, deleted: 5, ok: true },
    ],
  }
}

// Reset dev-only (harness): limpa o store para reproduzir capturas do zero.
export function __resetRuntime(): void { runtimeStore.clear() }
