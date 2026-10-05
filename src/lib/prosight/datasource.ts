// ─────────────────────────────────────────────────────────────────────────────
// Prosight — DATASOURCE desacoplado.
//
//   getProsightDataSource() lê NEXT_PUBLIC_PROSIGHT_DATA_MODE (default 'fixture').
//   • 'fixture' → adapter local, 100% determinístico, ZERO chamada externa.
//   • 'live'    → adapter que LANÇA erro claro (F6 conecta de verdade).
//
// A UI só conhece a interface ProsightDataSource — não sabe qual adapter roda.
// F6 troca o adapter aqui, sem tocar nas telas.
//
// Estados de teste (empty/error/loading) são acionados por um parâmetro DEV lido
// INTERNAMENTE pelo fixture (?fx=empty|error|loading). A UI não conhece o `fx`;
// ela apenas recebe vazio, erro ou fica em loading e renderiza o estado genérico.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ProsightDataSource,
  InventoryScanResult,
  LicensingDataResult,
  LicensingCustomsResult,
  ProsightConfig,
  SaveConfigPayload,
  SaveConfigResult,
  CheckApiPayload,
  CheckApiResult,
} from './types'
import {
  inventoryScanFixture,
  inventoryScanEmptyFixture,
  licensingDataFixture,
  licensingCustomsFixture,
  configFixture,
} from './fixtures'

// Delay curto p/ o skeleton de loading aparecer de forma realista (sem infra).
const FX_DELAY = 350

function currentFx(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('fx')
  } catch {
    return null
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** fx=loading → promessa que nunca resolve (mantém o skeleton para captura/teste). */
function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

// ── Adapter FIXTURE ───────────────────────────────────────────────────────────
class FixtureDataSource implements ProsightDataSource {
  async scanInventory(companyId: number | null): Promise<InventoryScanResult> {
    const fx = currentFx()
    if (fx === 'loading') return neverResolves<InventoryScanResult>()
    await wait(FX_DELAY)
    if (fx === 'error') return { ok: false, error: 'Falha ao varrer o disco: API AdvPL indisponível (timeout).' }
    if (fx === 'empty') return inventoryScanEmptyFixture()
    return inventoryScanFixture(companyId)
  }

  async getLicensingData(companyId: number | null, dtIni: string, dtFim: string): Promise<LicensingDataResult> {
    const fx = currentFx()
    if (fx === 'loading') return neverResolves<LicensingDataResult>()
    await wait(FX_DELAY)
    if (fx === 'error') return { ok: false, error: 'Erro ao consultar o licenciamento no período informado.' }
    if (fx === 'empty') return { vazio: true }
    return licensingDataFixture(companyId, dtIni, dtFim)
  }

  async getLicensingCustoms(companyId: number | null, dtIni: string, dtFim: string): Promise<LicensingCustomsResult> {
    const fx = currentFx()
    if (fx === 'loading') return neverResolves<LicensingCustomsResult>()
    await wait(FX_DELAY)
    if (fx === 'error') return { ok: false, error: 'Erro ao cruzar customizações U_ com as execuções do período.' }
    return licensingCustomsFixture(companyId, dtIni, dtFim)
  }

  async getConfig(): Promise<ProsightConfig> {
    const fx = currentFx()
    if (fx === 'loading') return neverResolves<ProsightConfig>()
    await wait(FX_DELAY)
    return configFixture()
  }

  async saveConfig(payload: SaveConfigPayload): Promise<SaveConfigResult> {
    // FIXTURE: NUNCA executa nada real — apenas simula o salvamento e ecoa os campos.
    await wait(600)
    return {
      success: true,
      saved: {
        gitUrl: payload.gitUrl,
        gitBranch: payload.gitBranch,
        rpoApiUrl: payload.rpoApiUrl,
        rpoApiUser: payload.rpoApiUser,
        rpoExclusionPatterns: payload.rpoExclusionPatterns,
        rpoApiPasswordSet: payload.rpoApiPassword ? true : configFixture().rpoApiPasswordSet,
        gitTokenSet: payload.gitToken ? true : configFixture().gitTokenSet,
      },
    }
  }

  async checkApi(payload: CheckApiPayload): Promise<CheckApiResult> {
    // FIXTURE: sem comunicação externa — resultado simulado a partir do input.
    await wait(700)
    if (!payload.rpoApiUrl) {
      return { configured: false, online: false, compiled: false, responseMs: 0, message: 'Informe a URL da API RPO.' }
    }
    return { configured: true, online: true, compiled: true, responseMs: 214, message: 'API OK' }
  }
}

// ── Adapter LIVE (F6) ──────────────────────────────────────────────────────────
// Sem fallback silencioso: se alguém apontar para 'live' antes do F6, falha claro.
const LIVE_NOT_READY = 'Prosight ainda não conectado (F6). Configure NEXT_PUBLIC_PROSIGHT_DATA_MODE=fixture.'

class LiveDataSource implements ProsightDataSource {
  scanInventory(): Promise<InventoryScanResult> { throw new Error(LIVE_NOT_READY) }
  getLicensingData(): Promise<LicensingDataResult> { throw new Error(LIVE_NOT_READY) }
  getLicensingCustoms(): Promise<LicensingCustomsResult> { throw new Error(LIVE_NOT_READY) }
  getConfig(): Promise<ProsightConfig> { throw new Error(LIVE_NOT_READY) }
  saveConfig(): Promise<SaveConfigResult> { throw new Error(LIVE_NOT_READY) }
  checkApi(): Promise<CheckApiResult> { throw new Error(LIVE_NOT_READY) }
}

let _instance: ProsightDataSource | null = null

export function getProsightDataSource(): ProsightDataSource {
  if (_instance) return _instance
  const mode = process.env.NEXT_PUBLIC_PROSIGHT_DATA_MODE ?? 'fixture'
  _instance = mode === 'live' ? new LiveDataSource() : new FixtureDataSource()
  return _instance
}

/** Modo atual — só p/ exibir avisos DEV na UI (ex.: banner "dados fictícios"). */
export function prosightDataMode(): 'fixture' | 'live' {
  return (process.env.NEXT_PUBLIC_PROSIGHT_DATA_MODE ?? 'fixture') === 'live' ? 'live' : 'fixture'
}
