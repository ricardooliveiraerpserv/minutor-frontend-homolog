// ─────────────────────────────────────────────────────────────────────────────
// Prosight — FIXTURES determinísticas (F2). Baseadas SÓ nos contratos reais.
// Nenhuma chamada externa. O adapter fixture usa estes dados para exercitar
// todos os estados (populated / empty / error / loading) sem infra real.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  InventoryResultRow,
  InventoryScanOk,
  InventoryStatus,
  HealthLabel,
  LicensingDataOk,
  LicensingCustomsOk,
  ProsightConfig,
} from './types'

// ── Inventário ───────────────────────────────────────────────────────────────

// Dataset determinístico: 26 fontes cobrindo os 5 status + APIs REST + tipos RPO.
// diskDate/rpoDate em ISO; a UI calcula a "Diferença" a partir deles.
const INVENTORY_ROWS: InventoryResultRow[] = [
  { program: 'MATA010',  diskPath: '/src/mata/MATA010.prw', diskDate: '2026-08-20T14:32:00Z', rpoDate: '2026-08-20T14:32:00Z', rpoStatus: 'OK',     rpoType: 'Standard', status: 'sincronizado',  isRestApi: false },
  { program: 'MATA030',  diskPath: '/src/mata/MATA030.prw', diskDate: '2026-08-19T09:10:00Z', rpoDate: '2026-08-19T09:10:00Z', rpoStatus: 'OK',     rpoType: 'Standard', status: 'sincronizado',  isRestApi: false },
  { program: 'FINA050',  diskPath: '/src/fin/FINA050.prw',  diskDate: '2026-08-18T11:00:00Z', rpoDate: '2026-08-18T11:00:00Z', rpoStatus: 'OK',     rpoType: 'Standard', status: 'sincronizado',  isRestApi: false },
  { program: 'U_CTBFOLD', diskPath: '/src/cust/U_CTBFOLD.prw', diskDate: '2026-08-21T16:45:00Z', rpoDate: '2026-08-21T16:45:00Z', rpoStatus: 'OK',   rpoType: 'Custom',   status: 'sincronizado',  isRestApi: false },
  { program: 'APIWSVEND', diskPath: '/src/api/APIWSVEND.prw', diskDate: '2026-08-22T08:20:00Z', rpoDate: '2026-08-22T08:20:00Z', rpoStatus: 'OK',   rpoType: 'Custom',   status: 'sincronizado',  isRestApi: true  },
  { program: 'COMA010',  diskPath: '/src/com/COMA010.prw',  diskDate: '2026-08-17T10:05:00Z', rpoDate: '2026-08-17T10:05:00Z', rpoStatus: 'OK',     rpoType: 'Standard', status: 'sincronizado',  isRestApi: false },
  { program: 'ESTA030',  diskPath: '/src/est/ESTA030.prw',  diskDate: '2026-08-16T13:22:00Z', rpoDate: '2026-08-16T13:22:00Z', rpoStatus: 'OK',     rpoType: 'Standard', status: 'sincronizado',  isRestApi: false },

  { program: 'U_MATREL01', diskPath: '/src/cust/U_MATREL01.prw', diskDate: '2026-08-23T18:40:00Z', rpoDate: '2026-08-15T09:00:00Z', rpoStatus: 'DESATUALIZADO', rpoType: 'Custom', status: 'recompilar', isRestApi: false },
  { program: 'U_FINREL02', diskPath: '/src/cust/U_FINREL02.prw', diskDate: '2026-08-22T20:15:00Z', rpoDate: '2026-08-14T11:30:00Z', rpoStatus: 'DESATUALIZADO', rpoType: 'Custom', status: 'recompilar', isRestApi: false },
  { program: 'APIWSCLI',   diskPath: '/src/api/APIWSCLI.prw',    diskDate: '2026-08-23T07:05:00Z', rpoDate: '2026-08-18T07:05:00Z', rpoStatus: 'DESATUALIZADO', rpoType: 'Custom', status: 'recompilar', isRestApi: true  },
  { program: 'MATA103',    diskPath: '/src/mata/MATA103.prw',    diskDate: '2026-08-23T12:00:00Z', rpoDate: '2026-08-10T12:00:00Z', rpoStatus: 'DESATUALIZADO', rpoType: 'Standard', status: 'recompilar', isRestApi: false },

  { program: 'FATA700',  diskPath: '/src/fat/FATA700.prw',  diskDate: '2026-08-05T09:00:00Z', rpoDate: '2026-08-20T09:00:00Z', rpoStatus: 'RPO_NOVO', rpoType: 'Standard', status: 'verificar_rpo', isRestApi: false },
  { program: 'U_PONTO01', diskPath: '/src/cust/U_PONTO01.prw', diskDate: '2026-08-02T15:00:00Z', rpoDate: '2026-08-19T15:00:00Z', rpoStatus: 'RPO_NOVO', rpoType: 'Custom', status: 'verificar_rpo', isRestApi: false },
  { program: 'GPEA010',  diskPath: '/src/gpe/GPEA010.prw',  diskDate: '2026-08-01T08:00:00Z', rpoDate: '2026-08-18T08:00:00Z', rpoStatus: 'RPO_NOVO', rpoType: 'Standard', status: 'verificar_rpo', isRestApi: false },

  { program: 'U_NOVOREL', diskPath: '/src/cust/U_NOVOREL.prw', diskDate: '2026-08-23T21:10:00Z', rpoDate: null, rpoStatus: null, rpoType: null, status: 'nao_compilado', isRestApi: false },
  { program: 'U_INTEGR9', diskPath: '/src/cust/U_INTEGR9.prw', diskDate: '2026-08-22T19:30:00Z', rpoDate: null, rpoStatus: null, rpoType: null, status: 'nao_compilado', isRestApi: false },
  { program: 'APIWSNEW',  diskPath: '/src/api/APIWSNEW.prw',   diskDate: '2026-08-23T06:00:00Z', rpoDate: null, rpoStatus: null, rpoType: null, status: 'nao_compilado', isRestApi: true  },
  { program: 'U_DASHKPI', diskPath: '/src/cust/U_DASHKPI.prw', diskDate: '2026-08-21T22:00:00Z', rpoDate: null, rpoStatus: null, rpoType: null, status: 'nao_compilado', isRestApi: false },
  { program: 'U_MIGXML',  diskPath: '/src/cust/U_MIGXML.prw',  diskDate: '2026-08-20T17:45:00Z', rpoDate: null, rpoStatus: null, rpoType: null, status: 'nao_compilado', isRestApi: false },

  { program: 'MATA901',  diskPath: null, diskDate: null, rpoDate: '2026-06-11T10:00:00Z', rpoStatus: 'SO_RPO', rpoType: 'Standard', status: 'so_rpo', isRestApi: false },
  { program: 'U_LEGACY1', diskPath: null, diskDate: null, rpoDate: '2026-05-30T14:00:00Z', rpoStatus: 'SO_RPO', rpoType: 'Custom', status: 'so_rpo', isRestApi: false },
  { program: 'U_LEGACY2', diskPath: null, diskDate: null, rpoDate: '2026-04-21T08:00:00Z', rpoStatus: 'SO_RPO', rpoType: 'Custom', status: 'so_rpo', isRestApi: false },
  { program: 'FINA700',  diskPath: null, diskDate: null, rpoDate: '2026-03-15T09:00:00Z', rpoStatus: 'SO_RPO', rpoType: 'Standard', status: 'so_rpo', isRestApi: false },

  { program: 'MATA020',  diskPath: '/src/mata/MATA020.prw', diskDate: '2026-08-15T10:00:00Z', rpoDate: '2026-08-15T10:00:00Z', rpoStatus: 'OK', rpoType: 'Standard', status: 'sincronizado', isRestApi: false },
  { program: 'COMA040',  diskPath: '/src/com/COMA040.prw',  diskDate: '2026-08-14T10:00:00Z', rpoDate: '2026-08-14T10:00:00Z', rpoStatus: 'OK', rpoType: 'Standard', status: 'sincronizado', isRestApi: false },
  { program: 'U_APITOTVS', diskPath: '/src/api/U_APITOTVS.prw', diskDate: '2026-08-13T10:00:00Z', rpoDate: '2026-08-13T10:00:00Z', rpoStatus: 'OK', rpoType: 'Custom', status: 'sincronizado', isRestApi: true },
]

function computeCounts(rows: InventoryResultRow[]): Record<InventoryStatus, number> {
  const counts: Record<InventoryStatus, number> = {
    sincronizado: 0, recompilar: 0, verificar_rpo: 0, nao_compilado: 0, so_rpo: 0,
  }
  for (const r of rows) counts[r.status]++
  return counts
}

function healthFrom(pct: number): HealthLabel {
  if (pct >= 85) return 'Saudavel'
  if (pct >= 60) return 'Regular'
  if (pct >= 35) return 'Alerta'
  return 'Critico'
}

// ── Variação por EMPRESA (multi-empresa) ──────────────────────────────────────
// Determinístico por companyId — 4 perfis de "saúde" que reaproveitam os MESMOS
// fontes reais (cada linha continua internamente consistente; nada inventado, só
// subconjuntos diferentes por empresa). No F6 o companyId vai pro backend/BFF.
const STATUS_LIST: InventoryStatus[] = ['sincronizado', 'recompilar', 'verificar_rpo', 'nao_compilado', 'so_rpo']

const COMPANY_PLANS: Record<InventoryStatus, number>[] = [
  { sincronizado: 10, recompilar: 4, verificar_rpo: 3, nao_compilado: 5, so_rpo: 4 }, // 26 fontes · ~38% (Alerta)
  { sincronizado: 10, recompilar: 1, verificar_rpo: 1, nao_compilado: 1, so_rpo: 0 }, // 13 fontes · ~77% (Regular)
  { sincronizado: 3,  recompilar: 4, verificar_rpo: 3, nao_compilado: 5, so_rpo: 4 }, // 19 fontes · ~16% (Crítico)
  { sincronizado: 8,  recompilar: 2, verificar_rpo: 2, nao_compilado: 2, so_rpo: 1 }, // 15 fontes · ~53% (Regular)
]

/** Índice de perfil (0..3) determinístico a partir do companyId. */
export function companySeed(companyId: number | null): number {
  return ((((companyId ?? 0) % COMPANY_PLANS.length) + COMPANY_PLANS.length) % COMPANY_PLANS.length)
}

function groupByStatus(rows: InventoryResultRow[]): Record<InventoryStatus, InventoryResultRow[]> {
  const g: Record<InventoryStatus, InventoryResultRow[]> = {
    sincronizado: [], recompilar: [], verificar_rpo: [], nao_compilado: [], so_rpo: [],
  }
  for (const r of rows) g[r.status].push(r)
  return g
}

function gitUrlForCompany(companyId: number | null): string {
  return `https://git.example.local/protheus/empresa-${companyId ?? 0}.git`
}

export function inventoryScanFixture(companyId: number | null = null): InventoryScanOk {
  const plan = COMPANY_PLANS[companySeed(companyId)]
  const groups = groupByStatus(INVENTORY_ROWS)
  const results: InventoryResultRow[] = []
  for (const st of STATUS_LIST) results.push(...groups[st].slice(0, plan[st]))
  const counts = computeCounts(results)
  const total = results.length
  const healthPct = total > 0 ? Math.round((counts.sincronizado / total) * 100) : 0
  return {
    scannedAt: '2026-08-23T22:15:00Z',
    gitUrl: gitUrlForCompany(companyId),
    rpoSource: { type: 'advpl_api', url: 'https://rpo.example.local/advpl' },
    summary: {
      counts,
      total,
      healthPct,
      healthLabel: healthFrom(healthPct),
      restApiCount: results.filter((r) => r.isRestApi).length,
    },
    results,
  }
}

/** Cenário vazio: scan sem nenhum fonte no disco nem no RPO. */
export function inventoryScanEmptyFixture(): InventoryScanOk {
  return {
    scannedAt: '2026-08-23T22:15:00Z',
    gitUrl: 'https://git.example.local/protheus/customizacoes.git',
    rpoSource: { type: 'advpl_api', url: 'https://rpo.example.local/advpl' },
    summary: {
      counts: { sincronizado: 0, recompilar: 0, verificar_rpo: 0, nao_compilado: 0, so_rpo: 0 },
      total: 0,
      healthPct: 0,
      healthLabel: 'Critico',
      restApiCount: 0,
    },
    results: [],
  }
}

// ── Licenciamento ────────────────────────────────────────────────────────────

const LICENSING_MODULES = [
  { sigla: 'FAT', nome: 'Faturamento',    eventos: 18420, usuariosUnicos: 42, pico15min: 19 },
  { sigla: 'FIN', nome: 'Financeiro',     eventos: 15230, usuariosUnicos: 38, pico15min: 17 },
  { sigla: 'EST', nome: 'Estoque/Custos', eventos: 12880, usuariosUnicos: 33, pico15min: 15 },
  { sigla: 'COM', nome: 'Compras',        eventos: 10440, usuariosUnicos: 27, pico15min: 12 },
  { sigla: 'GPE', nome: 'Gestão Pessoal', eventos: 8110,  usuariosUnicos: 21, pico15min: 9  },
  { sigla: 'CTB', nome: 'Contabilidade',  eventos: 6320,  usuariosUnicos: 14, pico15min: 7  },
  { sigla: 'FIS', nome: 'Fiscal',         eventos: 4980,  usuariosUnicos: 11, pico15min: 6  },
  { sigla: 'PCP', nome: 'Produção',       eventos: 3450,  usuariosUnicos: 9,  pico15min: 5  },
  { sigla: 'CFG', nome: 'Configurador',   eventos: 1210,  usuariosUnicos: 4,  pico15min: 2  },
]

const BASE_ATIVIDADE = [
  1, 0, 0, 0, 1, 2, 6, 18, 44, 58, 61, 55,
  49, 52, 63, 60, 51, 38, 22, 12, 7, 4, 2, 1,
]

// Fator de volume por empresa (mesmo perfil determinístico do inventário).
const COMPANY_FACTOR = [1, 0.62, 1.35, 0.85]
const companyFactor = (companyId: number | null) => COMPANY_FACTOR[companySeed(companyId)]

export function licensingDataFixture(companyId: number | null, dtIni: string, dtFim: string): LicensingDataOk {
  const f = companyFactor(companyId)
  const sc = (n: number) => Math.max(0, Math.round(n * f))
  const modulos = LICENSING_MODULES.map((m) => ({
    ...m, eventos: sc(m.eventos), usuariosUnicos: sc(m.usuariosUnicos), pico15min: sc(m.pico15min),
  }))
  return {
    data: {
      periodo: { inicio: '2026-07-24T00:00:00Z', fim: '2026-08-23T23:59:59Z', dias: 30 },
      totalEventos: modulos.reduce((s, m) => s + m.eventos, 0),
      totalUsuarios: sc(87),
      picoGlobal: { valor: sc(63), horario: '2026-08-12T14:15:00Z' },
      mediaDia: sc(71),
      horaPico: 14,
      modulos,
      perfis: { full: sc(41), light: sc(32), cfgOnly: sc(14) },
      atividadePorHora: BASE_ATIVIDADE.map(sc),
    },
  }
}

// ── Customizações (licensing/customs) ────────────────────────────────────────

const CUSTOM_ROWS = [
  { programa: 'U_CTBFOLD',  tipo: 'USER'    as const, execucoes: 1284, usuariosUnicos: 22, ultimaExecucao: '20260823' },
  { programa: 'U_MATREL01', tipo: 'USER'    as const, execucoes: 842,  usuariosUnicos: 15, ultimaExecucao: '20260822' },
  { programa: 'U_FINREL02', tipo: 'USER'    as const, execucoes: 511,  usuariosUnicos: 12, ultimaExecucao: '20260821' },
  { programa: 'U_PONTO01',  tipo: 'PARTNER' as const, execucoes: 388,  usuariosUnicos: 9,  ultimaExecucao: '20260820' },
  { programa: 'U_APITOTVS', tipo: 'USER'    as const, execucoes: 297,  usuariosUnicos: 7,  ultimaExecucao: '20260819' },
  { programa: 'U_INTEGR9',  tipo: 'PARTNER' as const, execucoes: 142,  usuariosUnicos: 5,  ultimaExecucao: '20260818' },
  { programa: 'U_DASHKPI',  tipo: 'USER'    as const, execucoes: 63,   usuariosUnicos: 3,  ultimaExecucao: '20260815' },
  { programa: 'U_MIGXML',   tipo: 'PARTNER' as const, execucoes: 9,    usuariosUnicos: 2,  ultimaExecucao: '20260805' },
  { programa: 'U_NOVOREL',  tipo: 'USER'    as const, execucoes: 0,    usuariosUnicos: 0,  ultimaExecucao: '' },
  { programa: 'U_LEGACY1',  tipo: 'PARTNER' as const, execucoes: 0,    usuariosUnicos: 0,  ultimaExecucao: '' },
  { programa: 'U_LEGACY2',  tipo: 'USER'    as const, execucoes: 0,    usuariosUnicos: 0,  ultimaExecucao: '' },
]

export function licensingCustomsFixture(companyId: number | null, dtIni: string, dtFim: string): LicensingCustomsOk {
  const f = companyFactor(companyId)
  const itens = CUSTOM_ROWS.map((r) => ({
    ...r,
    execucoes: Math.round(r.execucoes * f),
    usuariosUnicos: r.usuariosUnicos > 0 ? Math.max(1, Math.round(r.usuariosUnicos * f)) : 0,
  }))
  const comUso = itens.filter((r) => r.execucoes > 0).length
  return {
    total: itens.length,
    comUso,
    semUso: itens.length - comUso,
    itens,
  }
}

// ── Configuração ─────────────────────────────────────────────────────────────

export function configFixture(): ProsightConfig {
  return {
    gitUrl: 'https://git.example.local/protheus/customizacoes.git',
    gitBranch: 'main',
    rpoApiUrl: 'https://rpo.example.local/advpl',
    rpoApiUser: 'prosight_svc',
    rpoExclusionPatterns: 'TEST*, TMP*, *_BKP, U_SANDBOX*',
    rpoApiPasswordSet: true,
    gitTokenSet: true,
    updatedAt: '2026-08-20T13:40:00Z',
    updatedBy: 'admin@minutor',
  }
}
