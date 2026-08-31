'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Visão Geral (OPERACIONAL) — tela consolidada legada do F4.
// PRESERVADA no C2 para zero quebra: reúne, numa página só, tudo que também passa
// a existir decomposto em Ambientes/AppServers/Compilação/Patches/RPO. Agora
// consome os MESMOS blocos compartilhados (sections.tsx) + o MESMO runner de
// operações (operations.tsx) — nada duplicado. 100% via datasource (fixture no F4).
// A "Visão Geral EXECUTIVA" (consolidando métricas destes componentes) é a C3.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, Bug, Hammer, Lock, Package, RefreshCw, RotateCcw,
  ServerCog, ShieldAlert, Trash2, Upload, XCircle,
} from 'lucide-react'
import {
  Button, Card, EmptyState, PageHeader, Skeleton, SkeletonTable,
} from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type { ExclusiveState, FolderStatus, ServiceRow, SystemInfo } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { ProsightNotConnected } from '@/app/prosight/_components/company-context'
import { useOperations } from './operations'
import {
  AppServersCard, ConsoleViewer, FolderMonitorCard, HealthStatCards, InfoCard,
  OpButton, SectionHead, computeHealth,
} from './sections'

export function VisaoGeralView({ previewEnvironmentId = null, demoAdmin = false, autoOp = null }: { previewEnvironmentId?: string | null; demoAdmin?: boolean; autoOp?: string | null }) {
  const ds = getOperacoesDataSource()
  const { user } = useAuth()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? null
  const companyName = ctx?.companyName ?? 'JNG'

  const can = useCallback((p: Parameters<typeof canOperacoes>[0]) => demoAdmin || canOperacoes(p, user), [user, demoAdmin])

  const [services, setServices] = useState<ServiceRow[] | null>(null)
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [folder, setFolder] = useState<FolderStatus | null>(null)
  const [exclusive, setExclusive] = useState<ExclusiveState | null>(null)
  const [debugActive, setDebugActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true)
    setError(null)
    try {
      const [svc, sysInfo, fld, exc] = await Promise.all([
        ds.getServices(environmentId),
        ds.getSystemInfo(environmentId),
        ds.getFolderStatus(environmentId),
        ds.getExclusiveState(environmentId),
      ])
      setServices(svc)
      setInfo(sysInfo)
      setFolder(fld)
      setExclusive(exc)
      setDebugActive(svc.some((s) => s.type === 'compiler' && s.status === 'Running'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o ambiente.')
      setServices(null); setInfo(null); setFolder(null)
    } finally {
      setLoading(false)
    }
  }, [ds, environmentId])

  useEffect(() => { void load() }, [load])

  const ops = useOperations(environmentId, () => { void load() })

  // Harness dev-only (/preview?op=): dispara uma operação p/ capturar os modais
  // (confirmação / progresso / resultado). Nunca ativo fora do preview.
  const autoFiredRef = useRef(false)
  useEffect(() => {
    if (!autoOp || autoFiredRef.current || loading || !environmentId) return
    autoFiredRef.current = true
    const clickWhenReady = (labels: string[]) => {
      const t = setInterval(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => labels.includes(b.textContent?.trim() ?? ''))
        if (btn) { (btn as HTMLButtonElement).click(); clearInterval(t) }
      }, 120)
      setTimeout(() => clearInterval(t), 4000)
    }
    if (autoOp === 'compile' || autoOp === 'compile-run') {
      void ops.compile()
      if (autoOp === 'compile-run') clickWhenReady(['Iniciar compilação'])
    } else if (autoOp === 'exclusive') { ops.exclusive(true) }
    else if (autoOp === 'promote') { void ops.promote() }
  }, [autoOp, loading, environmentId, ops])

  const notConfigured = !loading && !error && info != null && info.valid === false
  const health = computeHealth(services)
  const canBuild = (exclusive?.active ?? false) || debugActive

  if (ctx && !ctx.demoAllowed) {
    return <ProsightNotConnected companyName={ctx.companyName} />
  }

  return (
    <>
      <PageHeader
        icon={Activity}
        title="Visão Geral"
        subtitle={`Empresa: ${companyName}${environmentLabel ? ` · Ambiente: ${environmentLabel}` : ''} — appservers, ambiente, monitoramento e operações.`}
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {operacoesDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <ServerCog size={14} />
          Dados de demonstração (fixtures) — Operações Protheus ainda não conectado à infraestrutura real.
        </div>
      )}

      {exclusive?.active && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
          <Lock size={16} />
          <b>Modo Exclusivo ativo</b>
          <span style={{ color: 'var(--text-muted)' }}>— ambiente em manutenção, ativado por {exclusive.activatedBy ?? '—'}.</span>
        </div>
      )}

      {loading ? (
        <VisaoGeralLoading />
      ) : error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar o ambiente" description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : notConfigured ? (
        <Card>
          <EmptyState icon={ShieldAlert} title="Ambiente não configurado"
            description="Este ambiente Protheus ainda não foi configurado. Defina broker, slaves, compilador e pastas na aba Configuração." />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {/* ── SAÚDE ─────────────────────────────────────────────────────────── */}
          <HealthStatCards health={health} />

          {/* ── APPSERVERS ────────────────────────────────────────────────────── */}
          <AppServersCard
            services={services ?? []}
            canControl={can('services.control')}
            onService={(name, action, displayName) => ops.service(name, action, displayName)}
            onServiceAll={(action) => ops.serviceAll(action)}
          />

          {/* ── INFO + MONITORAMENTO ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">{info && <InfoCard info={info} />}</div>
            {folder && <FolderMonitorCard folder={folder} />}
          </div>

          {/* ── OPERAÇÕES ─────────────────────────────────────────────────────── */}
          <Card>
            <SectionHead icon={Hammer} title="Operações" subtitle="Compilação, patches e promoção de RPO" />
            {!canBuild && (
              <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                <AlertTriangle size={13} /> Compilar/Patch exigem Modo Debug ou Modo Exclusivo ativo.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <OpButton icon={Hammer} title="Compilar" desc="Compila os fontes do ambiente" disabled={!canBuild || !can('compile')} onClick={() => void ops.compile()} />
              <OpButton icon={Package} title="Aplicar Patch" desc="Aplica pacotes .ptm" disabled={!canBuild || !can('patch')} onClick={() => void ops.patch()} />
              <OpButton icon={Upload} title="Promover RPO" desc="Publica o RPO nos slaves" disabled={!can('rpo.promote')} onClick={() => void ops.promote()} />
              <OpButton icon={RotateCcw} title="Rollback RPO" desc="Restaura o RPO anterior" danger disabled={!can('rpo.rollback')} onClick={() => ops.rollback()} />
            </div>

            <div className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Utilidades</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <OpButton icon={Lock} title={exclusive?.active ? 'Desativar Exclusivo' : 'Ativar Modo Exclusivo'} desc="Manutenção com appserver exclusivo" danger={!exclusive?.active} disabled={!can('exclusive')} onClick={() => ops.exclusive(!exclusive?.active)} />
              <OpButton icon={Bug} title={debugActive ? 'Desativar Debug' : 'Ativar Modo Debug'} desc="Appserver de compilação/depuração" disabled={!can('debug') || (exclusive?.active && !debugActive)} onClick={() => ops.debug(!debugActive)} />
              <OpButton icon={Trash2} title="Limpeza System" desc="Remove temporários e spool" danger disabled={!can('cleanup')} onClick={() => ops.cleanSystem()} />
              <OpButton icon={Trash2} title="Limpeza TSK" desc="Remove arquivos .TSK" disabled={!can('cleanup')} onClick={() => ops.cleanTsk()} />
            </div>
          </Card>

          {/* ── CONSOLE ───────────────────────────────────────────────────────── */}
          <ConsoleViewer environmentId={environmentId} />
        </div>
      )}

      {ops.modals}
    </>
  )
}

function VisaoGeralLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
      </div>
      <SkeletonTable rows={6} cols={7} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  )
}
