'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · AppServers (C2) — decomposição da antiga Visão Geral.
// Concentra a operação de INFRAESTRUTURA do ambiente: saúde → tabela de
// AppServers (start/stop/restart, start-all/stop-all) → Utilidades (Modo
// Exclusivo, Debug, Limpeza System/TSK) → Info do ambiente (INI) →
// Monitoramento (pasta System, donut) → Console. Compilação/Patches/RPO agora
// vivem em páginas próprias. REUSA os blocos de sections.tsx e o runner
// simulado (operations.tsx). 100% fixtures; ações NUNCA executam de verdade.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Bug, Lock, RefreshCw, Server, ServerCog, ShieldAlert, Trash2, Wrench, XCircle } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Skeleton, SkeletonTable } from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type { ExclusiveState, FolderStatus, ServiceRow, SystemInfo } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { useOperations } from './operations'
import {
  AppServersCard, ConsoleViewer, FolderMonitorCard, HealthStatCards, InfoCard,
  OpButton, SectionHead, computeHealth,
} from './sections'

export function AppServersView({ previewEnvironmentId = null, demoAdmin = false }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
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

  const notConfigured = !loading && !error && info != null && info.valid === false
  const health = computeHealth(services)

  return (
    <>
      <PageHeader
        icon={Server}
        title="AppServers"
        subtitle={`Empresa: ${companyName}${environmentLabel ? ` · Ambiente: ${environmentLabel}` : ''} — serviços, utilidades, ambiente, monitoramento e console.`}
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
        <AppServersLoading />
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
          <HealthStatCards health={health} />

          <AppServersCard
            services={services ?? []}
            canControl={can('services.control')}
            onService={(name, action, displayName) => ops.service(name, action, displayName)}
            onServiceAll={(action) => ops.serviceAll(action)}
            onRename={(name, displayName) => ops.rename(name, displayName)}
          />

          {/* ── UTILIDADES ────────────────────────────────────────────────────── */}
          <Card>
            <SectionHead icon={Wrench} title="Utilidades" subtitle="Modo Exclusivo, Debug e limpezas do ambiente" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <OpButton icon={Lock} title={exclusive?.active ? 'Desativar Exclusivo' : 'Ativar Modo Exclusivo'} desc="Manutenção com appserver exclusivo" danger={!exclusive?.active} disabled={!can('exclusive')} onClick={() => ops.exclusive(!exclusive?.active)} />
              <OpButton icon={Bug} title={debugActive ? 'Desativar Debug' : 'Ativar Modo Debug'} desc="Appserver de compilação/depuração" disabled={!can('debug') || (exclusive?.active && !debugActive)} onClick={() => ops.debug(!debugActive)} />
              <OpButton icon={Trash2} title="Limpeza System" desc="Remove temporários e spool" danger disabled={!can('cleanup')} onClick={() => ops.cleanSystem()} />
              <OpButton icon={Trash2} title="Limpeza TSK" desc="Remove arquivos .TSK" disabled={!can('cleanup')} onClick={() => ops.cleanTsk()} />
            </div>
          </Card>

          {/* ── INFO + MONITORAMENTO ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">{info && <InfoCard info={info} />}</div>
            {folder && <FolderMonitorCard folder={folder} />}
          </div>

          {/* ── CONSOLE ───────────────────────────────────────────────────────── */}
          <ConsoleViewer environmentId={environmentId} />
        </div>
      )}

      {ops.modals}
    </>
  )
}

function AppServersLoading() {
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
