'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight · Visão Geral EXECUTIVA (C3). Tela EXECUTIVA, não NOC: responde em
// segundos "como estão meus ambientes Protheus, o que exige atenção, o que
// aconteceu recentemente?". 100% FIXTURES — nenhuma chamada live.
//
// Reuso (NÃO duplica regra de saúde/status):
//   • computeHealth / HealthSummary  ← operacoes-protheus/_components/sections
//   • fmtDateTime / CHANGE_TYPE_META / FOLDER_LEVEL_META ← operacoes/shared
//   • getOperacoesDataSource (getEnvironments/getServices/getSystemInfo/
//     getFolderStatus/getExclusiveState/getChanges) — domínio OPERAÇÃO
//   • getProsightDataSource().scanInventory / getLicensingData — domínio FONTES
//
// Permission-aware (C1.1): NÃO busca nem renderiza um domínio sem permissão.
//   • source_docs.view / .quality.view → Fontes / Qualidade
//   • operacoes_protheus.view / admin  → Saúde / Ambientes / Operação / Atividade
//   • admin                            → tudo (+ Licenciamento)
//
// Resiliência por domínio: cada bloco carrega/erra INDEPENDENTE. Se Fontes falha
// e Operação está ok, a página segue utilizável — nada de Promise.all fatal
// derrubando a tela inteira.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, AlertTriangle, Bug, ChevronRight, Clock, FolderGit2, Gauge,
  HelpCircle, LayoutDashboard, Layers, Lock, RefreshCw, ScanSearch, Server, ServerCog,
  ShieldCheck, Sparkles, Users, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { useAuth } from '@/contexts/auth-context'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { COMPANY_JNG } from '@/lib/operacoes/fixtures'
import type {
  ChangeEntry, FolderLevel, OperacoesEnvironment,
} from '@/lib/operacoes/types'
import { getProsightDataSource } from '@/lib/prosight/datasource'
import type { InventoryScanOk, InventoryStatus, LicensingData } from '@/lib/prosight/types'
import {
  computeHealth, type HealthSummary,
} from '@/app/operacoes-protheus/_components/sections'
import {
  CHANGE_TYPE_META, FOLDER_LEVEL_META, fmtDateTime,
} from '@/app/operacoes-protheus/_components/shared'
import { STATUS_META as SRC_STATUS_META, inputToPt, toInputVal, addDays } from './shared'
import { useProsightCompany, isProsightDemoCompany, ProsightNotConnected } from './company-context'
import { fetchRpoCompanyOverview, type RpoCompanyOverview } from '@/lib/prosight/environments'
import { RpoDashboardIndicators } from './rpo-dashboard'

// Rótulos curtos por tipo de ambiente.
const KIND_LABEL: Record<OperacoesEnvironment['kind'], string> = {
  producao: 'Produção', homologacao: 'Homologação', desenvolvimento: 'Desenvolvimento',
}

// ── Modelos internos ──────────────────────────────────────────────────────────
interface EnvSnapshot {
  env: OperacoesEnvironment
  health: HealthSummary
  rpoVersion: string
  rpoUpdatedAt: string | null
  database: string
  exclusive: boolean
  exclusiveBy?: string
  debug: boolean
  folderLevel: FolderLevel
  changes: ChangeEntry[]
}

type Severity = 'danger' | 'warning' | 'info'
const SEV_ORDER: Record<Severity, number> = { danger: 0, warning: 1, info: 2 }
const SEV_BADGE: Record<Severity, string> = { danger: 'danger', warning: 'warning', info: 'primary' }

interface AttentionItem {
  id: string
  domain: 'Operação' | 'Fontes'
  env?: string
  desc: string
  severity: Severity
  cta: { label: string; href: string }
}

type BlockState = 'loading' | 'error' | 'ready'

// ── View ──────────────────────────────────────────────────────────────────────
export function VisaoGeralExecutivaView({
  previewRole = null,
  previewCompanyId = null,
  previewForceError = null,
}: {
  /** DEV-only (harness): força o perfil de permissão sem auth real. */
  previewRole?: 'admin' | 'coordenador' | 'operador' | null
  /** DEV-only (harness): empresa Prosight (Fontes/Licenciamento) sem /my-companies. */
  previewCompanyId?: number | null
  /** DEV-only (harness): força o erro de UM domínio p/ provar a resiliência. */
  previewForceError?: 'fontes' | 'operacao' | null
}) {
  const { user, hasPermission } = useAuth()
  const prosightCtx = useProsightCompany()
  const companyId = previewCompanyId ?? prosightCtx?.companyId ?? null

  // ── Permissões (NÃO elevam; espelham C1.1) ─────────────────────────────────
  const isPreview = previewRole != null
  const canFontes = isPreview
    ? previewRole === 'admin' || previewRole === 'coordenador'
    : hasPermission('source_docs.view') || hasPermission('source_docs.quality.view')
  const canOper = isPreview
    ? previewRole === 'admin' || previewRole === 'operador'
    : user?.type === 'admin' || hasPermission('operacoes_protheus.view')
  const canLicensing = isPreview ? previewRole === 'admin' : user?.type === 'admin'

  // ── Demonstração só na ERPSERV. Fora dela, em modo fixture, NÃO exibimos dados
  //    (nem rodamos os loaders de demo): estado honesto "não conectado". ─────────
  const demoAllowed = isPreview || isProsightDemoCompany(prosightCtx?.companyName ?? null)
  const dataAllowed = operacoesDataMode() !== 'fixture' || demoAllowed

  // ── Domínio OPERAÇÃO (um fetch p/ todos os blocos operacionais) ─────────────
  const op = useOperationalSnapshot(canOper && dataAllowed, previewForceError === 'operacao')
  // ── Domínio FONTES (independente) ───────────────────────────────────────────
  const fontes = useFontesScan(canFontes && dataAllowed, companyId, previewForceError === 'fontes')
  // ── Licenciamento (independente, admin) ─────────────────────────────────────
  const lic = useLicensing(canLicensing && dataAllowed, companyId)

  // Atenção consolida sinais REAIS dos domínios que o usuário pode ver.
  const attention = useMemo(
    () => buildAttention(canOper ? op.snapshots : null, canFontes ? fontes.scan : null),
    [canOper, op.snapshots, canFontes, fontes.scan],
  )

  const anyVisible = canOper || canFontes

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title="Prosight — Visão Geral"
        subtitle={`Gestão e Governança Técnica Protheus${prosightCtx?.companyName ? ` · ${prosightCtx.companyName}` : ''}`}
        actions={
          <Button
            variant="primary" icon={RefreshCw}
            onClick={() => { if (canOper) op.reload(); if (canFontes) fontes.reload() }}
          >
            Atualizar
          </Button>
        }
      />

      {operacoesDataMode() === 'fixture' && demoAllowed && (
        <div className="mb-5 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <ServerCog size={14} />
          Dados de demonstração (fixtures) — Prosight ainda não conectado à infraestrutura real.
        </div>
      )}

      {/* Inventário RPO REAL da empresa (independe do modo fixture — é conexão de verdade). */}
      {companyId != null && <RpoOverviewBlock key={companyId} companyId={companyId} />}

      {!dataAllowed ? (
        <ProsightNotConnected companyName={prosightCtx?.companyName ?? null} />
      ) : !anyVisible ? (
        <Card>
          <EmptyState icon={ShieldCheck} title="Sem indicadores disponíveis"
            description="Seu perfil não tem acesso aos domínios consolidados nesta visão." />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 1 · SAÚDE GERAL (rollup) — só operação */}
          {canOper && <SaudeGeralBlock state={op.state} snapshots={op.snapshots} onRetry={op.reload} companyName={prosightCtx?.companyName ?? null} />}

          {/* 2 · AMBIENTES (compacto) — só operação */}
          {canOper && <AmbientesBlock state={op.state} snapshots={op.snapshots} onRetry={op.reload} />}

          {/* 3–4 · FONTES / QUALIDADE  |  5 · OPERAÇÃO */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {canFontes && <FontesBlock state={fontes.state} scan={fontes.scan} error={fontes.error} onRetry={fontes.reload} />}
            {canFontes && <QualidadeBlock />}
            {canOper && <OperacaoBlock state={op.state} snapshots={op.snapshots} onRetry={op.reload} />}
          </div>

          {/* 6 · ATENÇÃO (consolidação) */}
          {(canOper || canFontes) && (
            <AtencaoBlock
              items={attention}
              opState={canOper ? op.state : 'ready'}
              fontesState={canFontes ? fontes.state : 'ready'}
            />
          )}

          {/* 7 · ATIVIDADE RECENTE — só operação */}
          {canOper && <AtividadeBlock state={op.state} snapshots={op.snapshots} onRetry={op.reload} />}

          {/* 8 · LICENCIAMENTO (compacto) — admin */}
          {canLicensing && <LicenciamentoBlock state={lic.state} data={lic.data} />}
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADERS (um por domínio — resiliência independente)
// ─────────────────────────────────────────────────────────────────────────────

function useOperationalSnapshot(enabled: boolean, forceError: boolean) {
  const ds = getOperacoesDataSource()
  const [snapshots, setSnapshots] = useState<EnvSnapshot[] | null>(null)
  const [state, setState] = useState<BlockState>('loading')

  const reload = useCallback(async () => {
    if (!enabled) return
    if (forceError) { setState('error'); setSnapshots(null); return }
    setState('loading')
    try {
      const envs = await ds.getEnvironments(COMPANY_JNG.id)
      const snaps = await Promise.all(envs.map(async (env): Promise<EnvSnapshot> => {
        const [svc, info, folder, exc, changes] = await Promise.all([
          ds.getServices(env.id),
          ds.getSystemInfo(env.id),
          ds.getFolderStatus(env.id),
          ds.getExclusiveState(env.id),
          ds.getChanges(env.id),
        ])
        const rpoUpdatedAt = info.rpoFiles
          .map((f) => f.mtime).filter((m): m is string => !!m)
          .sort((a, b) => b.localeCompare(a))[0] ?? null
        return {
          env,
          health: computeHealth(svc),
          rpoVersion: info.rpoVersion,
          rpoUpdatedAt,
          database: info.topDatabase,
          exclusive: exc.active,
          exclusiveBy: exc.activatedBy,
          debug: svc.some((s) => s.type === 'compiler' && s.status === 'Running'),
          folderLevel: folder.level,
          changes,
        }
      }))
      setSnapshots(snaps)
      setState('ready')
    } catch {
      setSnapshots(null)
      setState('error')
    }
  }, [ds, enabled, forceError])

  useEffect(() => { void reload() }, [reload])
  return { snapshots, state, reload: () => void reload() }
}

function useFontesScan(enabled: boolean, companyId: number | null, forceError: boolean) {
  const ds = getProsightDataSource()
  const [scan, setScan] = useState<InventoryScanOk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<BlockState>('loading')

  const reload = useCallback(async () => {
    if (!enabled) return
    if (forceError) { setState('error'); setScan(null); setError('Falha ao varrer o disco (simulado).'); return }
    setState('loading'); setError(null)
    try {
      const res = await ds.scanInventory(companyId)
      if ('ok' in res && res.ok === false) { setScan(null); setError(res.error); setState('error'); return }
      setScan(res as InventoryScanOk); setState('ready')
    } catch (e) {
      setScan(null); setError(e instanceof Error ? e.message : 'Falha ao varrer o inventário.'); setState('error')
    }
  }, [ds, enabled, companyId, forceError])

  useEffect(() => { void reload() }, [reload])
  return { scan, error, state, reload: () => void reload() }
}

function useLicensing(enabled: boolean, companyId: number | null) {
  const ds = getProsightDataSource()
  const [data, setData] = useState<LicensingData | null>(null)
  const [state, setState] = useState<BlockState>('loading')

  const reload = useCallback(async () => {
    if (!enabled) return
    setState('loading')
    try {
      const hoje = new Date()
      const res = await ds.getLicensingData(companyId, inputToPt(toInputVal(addDays(hoje, -30))), inputToPt(toInputVal(hoje)))
      if ('data' in res) { setData(res.data); setState('ready') }
      else { setData(null); setState('error') } // vazio ou falha → sem indicador (só navegação)
    } catch {
      setData(null); setState('error')
    }
  }, [ds, enabled, companyId])

  useEffect(() => { void reload() }, [reload])
  return { data, state, reload: () => void reload() }
}

// ─────────────────────────────────────────────────────────────────────────────
// ATENÇÃO — consolida sinais REAIS (nada de IA/recomendação automática)
// ─────────────────────────────────────────────────────────────────────────────
function buildAttention(snapshots: EnvSnapshot[] | null, scan: InventoryScanOk | null): AttentionItem[] {
  const items: AttentionItem[] = []

  for (const s of snapshots ?? []) {
    const appserversHref = `/operacoes-protheus/appservers?env=${s.env.id}`
    // Sinais de saúde JÁ classificados (compilador on-demand não alarma; base derrubada
    // em modo exclusivo não vira "parado"). critical→danger; warning/info preservados.
    s.health.reasons.forEach((r, i) => {
      // O item dedicado de "Modo exclusivo ativo" (abaixo) é mais rico → evita duplicar.
      if (r.severity === 'info' && r.text === 'Modo exclusivo ativo') return
      items.push({ id: `${s.env.id}-svc-${i}`, domain: 'Operação', env: s.env.label, desc: r.text, severity: r.severity === 'critical' ? 'danger' : r.severity, cta: { label: 'Ver AppServers', href: appserversHref } })
    })
    if (s.exclusive) items.push({ id: `${s.env.id}-exclusive`, domain: 'Operação', env: s.env.label, desc: `Modo exclusivo ativo${s.exclusiveBy ? ` (por ${s.exclusiveBy})` : ''}`, severity: 'info', cta: { label: 'Ver AppServers', href: appserversHref } })
    if (s.debug) items.push({ id: `${s.env.id}-debug`, domain: 'Operação', env: s.env.label, desc: 'Modo Debug ativo (compilador em execução)', severity: 'info', cta: { label: 'Ver AppServers', href: appserversHref } })
    if (s.folderLevel === 'red') items.push({ id: `${s.env.id}-folder`, domain: 'Operação', env: s.env.label, desc: 'Pasta System crítica', severity: 'danger', cta: { label: 'Ver AppServers', href: appserversHref } })
    else if (s.folderLevel === 'yellow') items.push({ id: `${s.env.id}-folder`, domain: 'Operação', env: s.env.label, desc: 'Pasta System em atenção', severity: 'warning', cta: { label: 'Ver AppServers', href: appserversHref } })
    // Falha recente (compile/patch/rpo) — pega a mais recente sem sucesso.
    const failed = s.changes.find((c) => !c.success)
    if (failed) items.push({ id: `${s.env.id}-fail`, domain: 'Operação', env: s.env.label, desc: `Falha recente: ${CHANGE_TYPE_META[failed.type].label} por ${failed.username}`, severity: 'warning', cta: { label: 'Ver mudanças', href: '/operacoes-protheus/mudancas' } })
  }

  if (scan) {
    const c = scan.summary.counts
    const inv = '/prosight/inventario'
    const push = (k: InventoryStatus, sev: Severity, tmpl: (n: number) => string) => {
      if (c[k] > 0) items.push({ id: `src-${k}`, domain: 'Fontes', desc: tmpl(c[k]), severity: sev, cta: { label: 'Ver Inventário', href: inv } })
    }
    push('so_rpo', 'danger', (n) => `${n} fonte(s) só no RPO (sem fonte local)`)
    push('recompilar', 'warning', (n) => `${n} fonte(s) aguardando recompilação (disco mais novo)`)
    push('verificar_rpo', 'warning', (n) => `${n} fonte(s) com RPO mais novo que o disco (verificar)`)
    push('nao_compilado', 'info', (n) => `${n} fonte(s) não compilado(s) (só no disco)`)
  }

  return items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS
// ─────────────────────────────────────────────────────────────────────────────

function BlockShell({ icon: Icon, title, subtitle, right, children }: { icon: typeof Server; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--primary-soft)' }}>
            <Icon size={15} color="var(--primary)" />
          </div>
          <div>
            <div className="font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
            {subtitle && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </Card>
  )
}

function BlockError({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <XCircle size={22} style={{ color: 'var(--danger)' }} />
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{message ?? 'Não foi possível carregar este domínio.'}</div>
      {onRetry && <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onRetry}>Tentar novamente</Button>}
    </div>
  )
}

// 1 · SAÚDE GERAL — rollup compacto (nº ambientes · saudáveis · atenção · críticos)
function SaudeGeralBlock({ state, snapshots, onRetry, companyName }: { state: BlockState; snapshots: EnvSnapshot[] | null; onRetry: () => void; companyName: string | null }) {
  const roll = useMemo(() => {
    const s = snapshots ?? []
    // Contagem pela AUTORIDADE (state), não por texto de label.
    const by = (st: string) => s.filter((x) => x.health.state === st).length
    const lastChange = s.flatMap((x) => x.changes).map((c) => c.timestamp).sort((a, b) => b.localeCompare(a))[0] ?? null
    return { total: s.length, saudavel: by('healthy'), atencao: by('warning'), critico: by('critical'), exclusivo: by('exclusive'), indefinido: by('undefined'), lastChange }
  }, [snapshots])

  const overall = roll.critico > 0
    ? { label: 'Atenção crítica', color: 'var(--danger)' }
    : roll.atencao > 0
      ? { label: 'Requer atenção', color: 'var(--warning)' }
      : roll.exclusivo > 0
        ? { label: 'Manutenção em andamento', color: 'var(--info)' }
        : { label: 'Tudo saudável', color: 'var(--success)' }

  return (
    <BlockShell
      icon={Gauge}
      title="Saúde geral"
      subtitle={`${companyName ? `Empresa ${companyName}` : 'Todas as empresas'} · ambientes Protheus`}
      right={state === 'ready' ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: overall.color }} />
          <span className="text-sm font-semibold" style={{ color: overall.color }}>{overall.label}</span>
        </span>
      ) : undefined}
    >
      {state === 'loading' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[70px] rounded-xl" />)}
        </div>
      ) : state === 'error' ? (
        <BlockError onRetry={onRetry} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RollStat label="Ambientes" value={roll.total} color="var(--text)" icon={Layers} />
          <RollStat label="Saudáveis" value={roll.saudavel} color="var(--success)" icon={ShieldCheck} />
          <RollStat label="Em atenção" value={roll.atencao} color={roll.atencao ? 'var(--warning)' : 'var(--text)'} icon={AlertTriangle} />
          <RollStat label="Críticos" value={roll.critico} color={roll.critico ? 'var(--danger)' : 'var(--text)'} icon={XCircle} />
          {roll.exclusivo > 0 && <RollStat label="Modo exclusivo" value={roll.exclusivo} color="var(--info)" icon={Lock} />}
          {roll.indefinido > 0 && <RollStat label="Indefinido" value={roll.indefinido} color="var(--text-light)" icon={HelpCircle} />}
          <div className="col-span-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:col-span-4" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
            <Clock size={13} /> Última atividade registrada: <b style={{ color: 'var(--text)' }}>{fmtDateTime(roll.lastChange)}</b>
          </div>
        </div>
      )}
    </BlockShell>
  )
}

function RollStat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Server }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-hover)' }}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={13} style={{ color: 'var(--text-light)' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  )
}

// 2 · AMBIENTES — compacto (versão resumida do card de Ambientes). Clique → appservers?env=
function AmbientesBlock({ state, snapshots, onRetry }: { state: BlockState; snapshots: EnvSnapshot[] | null; onRetry: () => void }) {
  const router = useRouter()
  const go = (id: string) => router.push(`/operacoes-protheus/appservers?env=${id}`)

  return (
    <BlockShell
      icon={Layers} title="Ambientes"
      subtitle="Selecione um ambiente para operar"
      right={<Link href="/operacoes-protheus/ambientes" className="text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>Ver ambientes <ChevronRight size={14} /></Link>}
    >
      {state === 'loading' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[128px] rounded-xl" />)}
        </div>
      ) : state === 'error' ? (
        <BlockError onRetry={onRetry} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(snapshots ?? []).map((s) => <EnvMiniCard key={s.env.id} s={s} onOpen={() => go(s.env.id)} />)}
        </div>
      )}
    </BlockShell>
  )
}

function EnvMiniCard({ s, onOpen }: { s: EnvSnapshot; onOpen: () => void }) {
  const activeFlags: { icon: typeof Lock; label: string; color: string }[] = []
  if (s.exclusive) activeFlags.push({ icon: Lock, label: 'Exclusivo', color: 'var(--info)' })
  if (s.debug) activeFlags.push({ icon: Bug, label: 'Debug', color: 'var(--warning)' })
  return (
    <button onClick={onOpen}
      className="ds-row-hover flex flex-col gap-3 rounded-xl p-4 text-left transition-all"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold" style={{ color: 'var(--text)' }}>{s.env.label}</div>
          <div className="text-xs" style={{ color: 'var(--text-light)' }}>{KIND_LABEL[s.env.kind]}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.health.color }} />
          <Badge variant={s.health.variant}>{s.health.label}</Badge>
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="inline-flex items-center gap-1"><Server size={12} style={{ color: 'var(--text-light)' }} /> AppServers <b style={{ color: s.health.state === 'critical' ? 'var(--danger)' : s.health.state === 'warning' ? 'var(--warning)' : 'var(--text)' }}>{s.health.running}/{s.health.total}</b></span>
        <span className="inline-flex items-center gap-1 font-mono">RPO {s.rpoVersion || '—'}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>RPO {fmtDateTime(s.rpoUpdatedAt)}</span>
        {activeFlags.length > 0 && (
          <span className="inline-flex items-center gap-2">
            {activeFlags.map((f) => (
              <span key={f.label} className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: f.color }}>
                <f.icon size={11} />{f.label}
              </span>
            ))}
          </span>
        )}
      </div>
    </button>
  )
}

// 3 · FONTES / Git×RPO — resumo do scanInventory. CTA Ver Inventário.
function FontesBlock({ state, scan, error, onRetry }: { state: BlockState; scan: InventoryScanOk | null; error: string | null; onRetry: () => void }) {
  const order: InventoryStatus[] = ['sincronizado', 'recompilar', 'verificar_rpo', 'nao_compilado', 'so_rpo']
  return (
    <BlockShell
      icon={FolderGit2} title="Fontes · Git × RPO"
      subtitle={scan ? `${scan.summary.total} fontes · scan ${fmtDateTime(scan.scannedAt)}` : 'Inventário de código-fonte'}
      right={<Link href="/prosight/inventario" className="text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>Ver Inventário <ChevronRight size={14} /></Link>}
    >
      {state === 'loading' ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 rounded-xl" />
          <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        </div>
      ) : state === 'error' ? (
        <BlockError onRetry={onRetry} message={error ?? undefined} />
      ) : scan && scan.summary.total > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--surface-hover)' }}>
            <ScanSearch size={16} style={{ color: 'var(--primary)' }} />
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{scan.summary.counts.sincronizado} de {scan.summary.total} sincronizados</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Saúde do inventário {scan.summary.healthPct}%</div>
            </div>
            {scan.summary.restApiCount > 0 && <Badge variant="primary">{scan.summary.restApiCount} REST</Badge>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {order.map((k) => (
              <div key={k} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
                <div className="text-lg font-bold" style={{ color: SRC_STATUS_META[k].color }}>{scan.summary.counts[k]}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>{SRC_STATUS_META[k].label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={FolderGit2} title="Sem fontes no inventário" description="Nenhum fonte encontrado para esta empresa." />
      )}
    </BlockShell>
  )
}

// 4 · QUALIDADE / CodeAnalysis — SEM agregação confiável em fixture (dado por-fonte,
// backend real). Card informativo/pendente; a dependência fica registrada p/ live.
function QualidadeBlock() {
  return (
    <BlockShell icon={Sparkles} title="Qualidade · CodeAnalysis" subtitle="Análise estática por fonte">
      <div className="flex flex-col items-start gap-3 rounded-xl px-4 py-4" style={{ background: 'var(--surface-hover)' }}>
        <Badge variant="warning">Disponível na conexão live</Badge>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          A qualidade é avaliada <b style={{ color: 'var(--text)' }}>por fonte</b> (CodeAnalysis, backend real). Não há
          agregação confiável nas fixtures — o consolidado executivo (analisadas · críticas · alertas ·
          desatualizadas · pendentes) aparece quando o Prosight estiver conectado.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
          Enquanto isso, a qualidade individual está no Acervo de cada fonte.
        </p>
      </div>
    </BlockShell>
  )
}

// 5 · OPERAÇÃO — foco no ambiente de Produção (representativo). Sem controles destrutivos.
function OperacaoBlock({ state, snapshots, onRetry }: { state: BlockState; snapshots: EnvSnapshot[] | null; onRetry: () => void }) {
  const focus = useMemo(() => {
    const list = snapshots ?? []
    return list.find((s) => s.env.kind === 'producao') ?? list[0] ?? null
  }, [snapshots])

  return (
    <BlockShell
      icon={ServerCog} title="Operação"
      subtitle={focus ? `Foco · ${focus.env.label}` : 'Ambiente em foco'}
      right={focus && <Link href={`/operacoes-protheus/appservers?env=${focus.env.id}`} className="text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>Ver AppServers <ChevronRight size={14} /></Link>}
    >
      {state === 'loading' ? (
        <div className="grid grid-cols-2 gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : state === 'error' ? (
        <BlockError onRetry={onRetry} />
      ) : focus ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <OpStat label="AppServers online" value={`${focus.health.running}/${focus.health.total}`} color="var(--success)" />
            <OpStat label="Parados" value={String(focus.health.stopped)} color={focus.health.state === 'critical' ? 'var(--danger)' : focus.health.state === 'warning' ? 'var(--warning)' : 'var(--text)'} />
            <OpStat label="Pasta System" value={FOLDER_LEVEL_META[focus.folderLevel].label} color={FOLDER_LEVEL_META[focus.folderLevel].color} />
            <OpStat label="Modos" value={focus.exclusive ? 'Exclusivo' : focus.debug ? 'Debug' : 'Normal'} color={focus.exclusive ? 'var(--info)' : focus.debug ? 'var(--warning)' : 'var(--text)'} />
          </div>
          {(focus.exclusive || focus.debug) && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={focus.exclusive ? { background: 'var(--info-bg)', color: 'var(--info)' } : { background: 'var(--warning-bg)', color: 'var(--warning)' }}>
              {focus.exclusive ? <Lock size={13} /> : <Bug size={13} />}
              {focus.exclusive ? `Modo exclusivo ativo${focus.exclusiveBy ? ` (por ${focus.exclusiveBy})` : ''}` : 'Modo Debug ativo'}
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={ServerCog} title="Sem ambiente" description="Nenhum ambiente para consolidar a operação." />
      )}
    </BlockShell>
  )
}

function OpStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className="mt-0.5 text-sm font-semibold truncate" style={{ color }}>{value}</div>
    </div>
  )
}

// 6 · ATENÇÃO — consolidação de problemas reais (severidade derivada do dado).
function AtencaoBlock({ items, opState, fontesState }: { items: AttentionItem[]; opState: BlockState; fontesState: BlockState }) {
  const loading = opState === 'loading' || fontesState === 'loading'
  const partial = opState === 'error' || fontesState === 'error'
  const shown = items.slice(0, 8)

  return (
    <BlockShell
      icon={AlertTriangle} title="Atenção"
      subtitle="O que exige ação agora"
      right={items.length > 0 ? <Badge variant={items.some((i) => i.severity === 'danger') ? 'danger' : 'warning'}>{items.length} {items.length === 1 ? 'item' : 'itens'}</Badge> : undefined}
    >
      {partial && (
        <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
          <AlertTriangle size={13} /> Um domínio não pôde ser consultado — a lista abaixo é parcial.
        </div>
      )}
      {loading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg px-4 py-4 text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
          <ShieldCheck size={16} /> Nenhum ponto de atenção — ambientes e fontes sem pendências detectadas.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.severity === 'danger' ? 'var(--danger)' : it.severity === 'warning' ? 'var(--warning)' : 'var(--info)' }} />
              <Badge variant="default">{it.domain}</Badge>
              {it.env && <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{it.env}</span>}
              <span className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text)' }}>{it.desc}</span>
              <Badge variant={SEV_BADGE[it.severity]}>{it.severity === 'danger' ? 'Crítico' : it.severity === 'warning' ? 'Atenção' : 'Info'}</Badge>
              <Link href={it.cta.href} className="text-xs font-medium inline-flex items-center gap-0.5 shrink-0" style={{ color: 'var(--primary)' }}>{it.cta.label} <ChevronRight size={13} /></Link>
            </div>
          ))}
          {items.length > shown.length && (
            <div className="pt-1 text-center text-xs" style={{ color: 'var(--text-light)' }}>+{items.length - shown.length} outros pontos de atenção</div>
          )}
        </div>
      )}
    </BlockShell>
  )
}

// 7 · ATIVIDADE RECENTE — mudanças (compile/patch/rpo) de todos os ambientes.
function AtividadeBlock({ state, snapshots, onRetry }: { state: BlockState; snapshots: EnvSnapshot[] | null; onRetry: () => void }) {
  const rows = useMemo(() => {
    const flat = (snapshots ?? []).flatMap((s) => s.changes.map((c) => ({ c, env: s.env.label })))
    return flat.sort((a, b) => b.c.timestamp.localeCompare(a.c.timestamp)).slice(0, 6)
  }, [snapshots])

  return (
    <BlockShell
      icon={Activity} title="Atividade recente"
      subtitle="Compilações, patches e promoções de RPO"
      right={<Link href="/operacoes-protheus/mudancas" className="text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>Ver todas as mudanças <ChevronRight size={14} /></Link>}
    >
      {state === 'loading' ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
      ) : state === 'error' ? (
        <BlockError onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Activity} title="Sem atividade recente" description="Nenhuma mudança registrada nos ambientes." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-light)' }}>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider">Quando</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider">Ambiente</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider">Tipo</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider">Usuário</th>
                <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, env }) => (
                <tr key={c.id + env} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(c.timestamp)}</td>
                  <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text)' }}>{env}</td>
                  <td className="px-2 py-2"><Badge variant={CHANGE_TYPE_META[c.type].variant}>{CHANGE_TYPE_META[c.type].label}</Badge></td>
                  <td className="px-2 py-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{c.username}</td>
                  <td className="px-2 py-2 text-right"><Badge variant={c.success ? 'success' : 'danger'}>{c.success ? 'OK' : 'Falhou'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BlockShell>
  )
}

// 8 · LICENCIAMENTO — no máximo 1 indicador compacto útil. Senão só navegação.
function LicenciamentoBlock({ state, data }: { state: BlockState; data: LicensingData | null }) {
  return (
    <BlockShell
      icon={Users} title="Licenciamento"
      subtitle={data ? `Últimos ${data.periodo.dias} dias` : 'Uso e usuários'}
      right={<Link href="/prosight/licenciamento" className="text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>Ver Licenciamento <ChevronRight size={14} /></Link>}
    >
      {state === 'loading' ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : data ? (
        <div className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: 'var(--surface-hover)' }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--primary-soft)' }}>
            <Users size={18} color="var(--primary)" />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{data.picoGlobal.valor}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Pico de usuários simultâneos · {data.totalUsuarios} usuários únicos no período</div>
          </div>
        </div>
      ) : (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Sem dados de uso no período. Consulte o detalhe em Licenciamento.</div>
      )}
    </BlockShell>
  )
}

// ── Inventário RPO REAL da empresa (conexão de verdade; independe do modo fixture) ──
function RpoOverviewBlock({ companyId }: { companyId: number }) {
  // Remonta por empresa (key={companyId}) → loading nasce true; o effect só busca (setState async).
  const [ov, setOv] = useState<RpoCompanyOverview | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    fetchRpoCompanyOverview(companyId).then((d) => { if (alive) { setOv(d); setLoading(false) } }).catch(() => { if (alive) { setOv(null); setLoading(false) } })
    return () => { alive = false }
  }, [companyId])

  if (loading) return <Skeleton className="h-24 rounded-2xl mb-5" />
  if (!ov || ov.configured_count === 0) return null   // empresa sem RPO → não altera nada

  const roll = ov.rollup
  return (
    <Card className="mb-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
            <Server size={16} style={{ color: 'var(--primary)' }} /> Inventário RPO (REST AdvPL)
            <Badge variant="success">Conectado</Badge>
          </div>
          <Link href="/prosight/configuracao"><Button size="sm" variant="ghost" icon={ScanSearch}>Abrir / gerar inventário</Button></Link>
        </div>

        {roll ? (
          <RpoDashboardIndicators summary={roll} />
        ) : (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            RPO configurado em {ov.configured_count} ambiente(s). Gere o inventário na Configuração para ver a saúde.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {ov.environments.filter((e) => e.rpo_configured).map((e) => (
            <span key={e.environment_id} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <b style={{ color: 'var(--text)' }}>{e.name}</b>
              {e.summary ? <span style={{ color: 'var(--text-muted)' }}>· saúde {e.summary.health_pct}%</span> : <span style={{ color: 'var(--text-light)' }}>· sem scan</span>}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}
