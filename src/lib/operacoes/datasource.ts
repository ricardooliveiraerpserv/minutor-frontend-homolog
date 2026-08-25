// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus — DATASOURCE desacoplado.
//
//   getOperacoesDataSource() lê NEXT_PUBLIC_OPERACOES_DATA_MODE (default 'fixture').
//   • 'fixture' → adapter local, 100% determinístico, ZERO chamada externa.
//   • 'live'    → adapter que LANÇA erro claro (D-live conecta de verdade em F6).
//
// A UI só conhece a interface OperacoesDataSource — não sabe qual adapter roda.
// D-live troca o adapter aqui, sem tocar nas telas.
//
// Estados de teste (empty/error/loading/unconfigured) são acionados por um
// parâmetro DEV lido INTERNAMENTE pelo fixture (?fx=…). A UI não conhece o `fx`;
// ela apenas recebe vazio, erro, loading ou "não configurado" e renderiza o
// estado genérico. Variantes de operação: ?opfx=partial|fail (dev-only).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AuditEntry, BuildPatches, BuildSources, ChangeEntry, ChangeType, CompileResult,
  ConsoleLog, ConsoleSource, EnvironmentConfig, ExclusiveState, FolderStatus,
  FxState, OpVariant, OperacoesDataSource, OperacoesEnvironment, PatchApplyResult,
  PromoteDestinations, PromoteRpoResult, RollbackRpoResult, ServiceRow, SimpleOk,
  SourcesInventory, SystemInfo,
} from './types'
import {
  ENVIRONMENTS, auditFixture, buildPatchesFixture, buildSourcesFixture, changesFixture,
  cleanSystemFixture, cleanTskFixture, compileFixture, configFixture, consoleLogFixture,
  consoleSourcesFixture, controlAllServicesFixture, controlServiceFixture, renameServiceFixture, exclusiveStateFixture,
  folderStatusFixture, patchApplyFixture, promoteDestinationsFixture, promoteRpoFixture,
  rollbackRpoFixture, servicesFixture, setDebugFixture, setExclusiveFixture, sourcesInventoryFixture,
  systemInfoFixture,
} from './fixtures'

const FX_DELAY = 320
const COMM_ERROR = 'Falha de comunicação com o ambiente Protheus (AppServer não respondeu — timeout).'

function currentFx(): FxState | null {
  if (typeof window === 'undefined') return null
  try {
    const v = new URLSearchParams(window.location.search).get('fx')
    return v === 'empty' || v === 'error' || v === 'loading' || v === 'unconfigured' ? v : null
  } catch {
    return null
  }
}

/** Variante de operação: prioridade p/ a passada pela UI; ?opfx= sobrescreve (dev). */
function resolveOpVariant(passed?: OpVariant): OpVariant {
  if (typeof window !== 'undefined') {
    try {
      const v = new URLSearchParams(window.location.search).get('opfx')
      if (v === 'ok' || v === 'partial' || v === 'fail') return v
    } catch { /* noop */ }
  }
  return passed ?? 'ok'
}

function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
function neverResolves<T>(): Promise<T> { return new Promise<T>(() => {}) }

class CommError extends Error {}

// ── Adapter FIXTURE ─────────────────────────────────────────────────────────────
class FixtureDataSource implements OperacoesDataSource {
  private async gate<T>(fn: () => T, opts?: { emptyValue?: T }): Promise<T> {
    const fx = currentFx()
    if (fx === 'loading') return neverResolves<T>()
    await wait(FX_DELAY)
    if (fx === 'error') throw new CommError(COMM_ERROR)
    if (fx === 'empty' && opts && 'emptyValue' in opts) return opts.emptyValue as T
    return fn()
  }

  async getEnvironments(companyId: string): Promise<OperacoesEnvironment[]> {
    await wait(80)
    return ENVIRONMENTS.filter((e) => e.companyId === companyId)
  }

  getServices(environmentId: string): Promise<ServiceRow[]> {
    return this.gate(() => servicesFixture(environmentId), { emptyValue: [] as ServiceRow[] })
  }

  async getSystemInfo(environmentId: string): Promise<SystemInfo> {
    const fx = currentFx()
    if (fx === 'unconfigured') { await wait(FX_DELAY); return unconfiguredSystemInfo() }
    return this.gate(() => systemInfoFixture(environmentId))
  }

  getFolderStatus(environmentId: string): Promise<FolderStatus> {
    return this.gate(() => folderStatusFixture(environmentId))
  }

  getConsoleSources(environmentId: string): Promise<ConsoleSource[]> {
    return this.gate(() => consoleSourcesFixture(environmentId), { emptyValue: [] as ConsoleSource[] })
  }

  getConsoleLog(environmentId: string, opts?: { source?: string; filter?: string }): Promise<ConsoleLog> {
    return this.gate(() => consoleLogFixture(environmentId, opts))
  }

  getExclusiveState(environmentId: string): Promise<ExclusiveState> {
    return this.gate(() => exclusiveStateFixture(environmentId))
  }

  getSourcesInventory(environmentId: string): Promise<SourcesInventory> {
    return this.gate(() => sourcesInventoryFixture(environmentId), {
      emptyValue: { dir: '', items: [], summary: { sincronizado: 0, disco_mais_novo: 0, apenas_disco: 0, apenas_rpo: 0 } },
    })
  }

  getChanges(environmentId: string, opts?: { type?: ChangeType }): Promise<ChangeEntry[]> {
    return this.gate(() => changesFixture(environmentId, opts), { emptyValue: [] as ChangeEntry[] })
  }

  getAudit(environmentId: string): Promise<AuditEntry[]> {
    return this.gate(() => auditFixture(environmentId), { emptyValue: [] as AuditEntry[] })
  }

  async getConfig(environmentId: string): Promise<EnvironmentConfig | null> {
    const fx = currentFx()
    if (fx === 'unconfigured') { await wait(FX_DELAY); return null }
    return this.gate(() => configFixture(environmentId))
  }

  getPromoteDestinations(environmentId: string): Promise<PromoteDestinations> {
    return this.gate(() => promoteDestinationsFixture(environmentId))
  }

  getBuildSources(environmentId: string): Promise<BuildSources> {
    return this.gate(() => buildSourcesFixture(environmentId))
  }

  getBuildPatches(environmentId: string): Promise<BuildPatches> {
    return this.gate(() => buildPatchesFixture(environmentId))
  }

  // ── Operações (SIMULADAS — nunca executam nada real) ────────────────────────
  async compile(environmentId: string, variant?: OpVariant): Promise<CompileResult> {
    await wait(500)
    return compileFixture(environmentId, resolveOpVariant(variant))
  }

  async applyPatch(environmentId: string, variant?: OpVariant): Promise<PatchApplyResult> {
    await wait(500)
    return patchApplyFixture(environmentId, resolveOpVariant(variant))
  }

  async promoteRpo(environmentId: string, selectedKeys: string[], variant?: OpVariant): Promise<PromoteRpoResult> {
    await wait(500)
    return promoteRpoFixture(environmentId, selectedKeys, resolveOpVariant(variant))
  }

  async rollbackRpo(environmentId: string, variant?: OpVariant): Promise<RollbackRpoResult> {
    await wait(500)
    return rollbackRpoFixture(environmentId, resolveOpVariant(variant))
  }

  async controlService(environmentId: string, name: string, action: 'start' | 'stop' | 'restart'): Promise<SimpleOk> {
    await wait(400)
    return controlServiceFixture(environmentId, name, action)
  }

  async controlAllServices(environmentId: string, action: 'start' | 'stop'): Promise<SimpleOk> {
    await wait(600)
    return controlAllServicesFixture(environmentId, action)
  }

  async renameService(environmentId: string, name: string, newDisplayName: string): Promise<SimpleOk> {
    await wait(400)
    return renameServiceFixture(environmentId, name, newDisplayName)
  }

  async setExclusive(environmentId: string, active: boolean): Promise<SimpleOk> {
    await wait(600)
    return setExclusiveFixture(environmentId, active)
  }

  async setDebug(environmentId: string, active: boolean): Promise<SimpleOk> {
    await wait(500)
    return setDebugFixture(environmentId, active)
  }

  async cleanSystem(environmentId: string): Promise<SimpleOk> {
    await wait(600)
    return cleanSystemFixture(environmentId)
  }

  async cleanTsk(environmentId: string): Promise<SimpleOk> {
    await wait(500)
    return cleanTskFixture(environmentId)
  }
}

function unconfiguredSystemInfo(): SystemInfo {
  return {
    valid: false, errors: ['Ambiente não configurado.'], appEnvironment: '', rootPath: '', startPath: '',
    sourcePath: '', rpoCustom: '', rpoVersion: '', inactiveTimeout: '', trace: '0', specialKey: '',
    topDatabase: '', topAlias: '', topServer: '', port: 0, serviceName: '', serviceDisplayName: '',
    rpoFiles: [], iniPath: '',
  }
}

// ── Adapter LIVE (D-live / F6) ────────────────────────────────────────────────────
// Sem fallback silencioso: apontar para 'live' antes do D-live falha claro.
const LIVE_NOT_READY = 'Operações Protheus ainda não conectado ao AppServer real (D-live). Configure NEXT_PUBLIC_OPERACOES_DATA_MODE=fixture.'

class LiveDataSource implements OperacoesDataSource {
  getEnvironments(): Promise<OperacoesEnvironment[]> { throw new Error(LIVE_NOT_READY) }
  getServices(): Promise<ServiceRow[]> { throw new Error(LIVE_NOT_READY) }
  getSystemInfo(): Promise<SystemInfo> { throw new Error(LIVE_NOT_READY) }
  getFolderStatus(): Promise<FolderStatus> { throw new Error(LIVE_NOT_READY) }
  getConsoleSources(): Promise<ConsoleSource[]> { throw new Error(LIVE_NOT_READY) }
  getConsoleLog(): Promise<ConsoleLog> { throw new Error(LIVE_NOT_READY) }
  getExclusiveState(): Promise<ExclusiveState> { throw new Error(LIVE_NOT_READY) }
  getSourcesInventory(): Promise<SourcesInventory> { throw new Error(LIVE_NOT_READY) }
  getChanges(): Promise<ChangeEntry[]> { throw new Error(LIVE_NOT_READY) }
  getAudit(): Promise<AuditEntry[]> { throw new Error(LIVE_NOT_READY) }
  getConfig(): Promise<EnvironmentConfig | null> { throw new Error(LIVE_NOT_READY) }
  getPromoteDestinations(): Promise<PromoteDestinations> { throw new Error(LIVE_NOT_READY) }
  getBuildSources(): Promise<BuildSources> { throw new Error(LIVE_NOT_READY) }
  getBuildPatches(): Promise<BuildPatches> { throw new Error(LIVE_NOT_READY) }
  compile(): Promise<CompileResult> { throw new Error(LIVE_NOT_READY) }
  applyPatch(): Promise<PatchApplyResult> { throw new Error(LIVE_NOT_READY) }
  promoteRpo(): Promise<PromoteRpoResult> { throw new Error(LIVE_NOT_READY) }
  rollbackRpo(): Promise<RollbackRpoResult> { throw new Error(LIVE_NOT_READY) }
  controlService(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
  controlAllServices(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
  renameService(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
  setExclusive(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
  setDebug(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
  cleanSystem(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
  cleanTsk(): Promise<SimpleOk> { throw new Error(LIVE_NOT_READY) }
}

let _instance: OperacoesDataSource | null = null

export function getOperacoesDataSource(): OperacoesDataSource {
  if (_instance) return _instance
  const mode = process.env.NEXT_PUBLIC_OPERACOES_DATA_MODE ?? 'fixture'
  _instance = mode === 'live' ? new LiveDataSource() : new FixtureDataSource()
  return _instance
}

export function operacoesDataMode(): 'fixture' | 'live' {
  return (process.env.NEXT_PUBLIC_OPERACOES_DATA_MODE ?? 'fixture') === 'live' ? 'live' : 'fixture'
}
