'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Ambientes (C2 — NOVA). Nível EMPRESA → AMBIENTES:
// a empresa JNG tem N ambientes Protheus (Produção / Homologação /
// Desenvolvimento). Lista cada ambiente com SÓ o que já existe nas fixtures/
// contratos: situação/saúde, nº de AppServers (online/parado), RPO (versão +
// última atualização), banco, versão e alertas. NÃO inventa KPI.
// Clicar num ambiente torna-o ATIVO no contexto (OperacoesProvider) e navega
// para AppServers — o novo ambiente reescopa TODAS as áreas operacionais.
// 100% fixtures; nenhuma chamada live.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity, AlertTriangle, ChevronRight, Database, Layers, Lock, Package,
  RefreshCw, Server, ServerCog, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import type { OperacoesEnvironment } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { computeHealth, type HealthSummary } from './sections'
import { fmtDateTime } from './shared'

const KIND_LABEL: Record<OperacoesEnvironment['kind'], string> = {
  producao: 'Produção', homologacao: 'Homologação', desenvolvimento: 'Desenvolvimento',
}

interface EnvCardData {
  env: OperacoesEnvironment
  health: HealthSummary
  rpoVersion: string
  rpoUpdatedAt: string | null
  database: string
  alias: string
  exclusive: boolean
  alerts: string[]
}

export function AmbientesView({ previewEnvironmentId = null }: { previewEnvironmentId?: string | null }) {
  const ds = getOperacoesDataSource()
  const ctx = useOperacoes()
  const router = useRouter()
  const companyId = ctx?.companyId ?? 'jng'
  const companyName = ctx?.companyName ?? 'JNG'
  const activeEnvId = ctx?.environmentId ?? previewEnvironmentId ?? null

  const [cards, setCards] = useState<EnvCardData[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const envs = await ds.getEnvironments(companyId)
      const data = await Promise.all(envs.map(async (env) => {
        const [svc, info, folder, exc] = await Promise.all([
          ds.getServices(env.id),
          ds.getSystemInfo(env.id),
          ds.getFolderStatus(env.id),
          ds.getExclusiveState(env.id),
        ])
        const health = computeHealth(svc)
        const rpoUpdatedAt = info.rpoFiles
          .map((f) => f.mtime)
          .filter((m): m is string => !!m)
          .sort((a, b) => b.localeCompare(a))[0] ?? null
        const alerts: string[] = []
        // Alertas derivam da saúde JÁ classificada (compilador on-demand não alarma;
        // base derrubada em modo exclusivo não vira "parado").
        for (const r of health.reasons) alerts.push(r.text)
        if (exc.active) alerts.push('Modo exclusivo ativo')
        if (folder.level === 'red') alerts.push('Pasta System crítica')
        else if (folder.level === 'yellow') alerts.push('Pasta System em atenção')
        return {
          env, health, rpoVersion: info.rpoVersion, rpoUpdatedAt,
          database: info.topDatabase, alias: info.topAlias, exclusive: exc.active, alerts,
        }
      }))
      setCards(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar os ambientes.'); setCards(null)
    } finally { setLoading(false) }
  }, [ds, companyId])

  useEffect(() => { void load() }, [load])

  const open = (env: OperacoesEnvironment) => {
    ctx?.setEnvironmentId(env.id)
    router.push('/operacoes-protheus/appservers')
  }

  return (
    <>
      <PageHeader
        icon={Layers}
        title="Ambientes"
        subtitle={`Empresa: ${companyName} — ambientes Protheus. Selecione um ambiente para operar.`}
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading}>Atualizar</Button>}
      />

      {operacoesDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <ServerCog size={14} />
          Dados de demonstração (fixtures) — Operações Protheus ainda não conectado à infraestrutura real.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar os ambientes" description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : (cards ?? []).length === 0 ? (
        <Card><EmptyState icon={Layers} title="Nenhum ambiente" description="Esta empresa não possui ambientes Protheus cadastrados." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(cards ?? []).map((c) => (
            <EnvironmentCard key={c.env.id} data={c} active={c.env.id === activeEnvId} onOpen={() => open(c.env)} />
          ))}
        </div>
      )}
    </>
  )
}

function EnvironmentCard({ data, active, onOpen }: { data: EnvCardData; active: boolean; onOpen: () => void }) {
  const { env, health } = data
  return (
    <button onClick={onOpen}
      className="text-left rounded-2xl p-5 transition-all hover:opacity-95 focus:outline-none"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', outline: active ? '2px solid var(--primary)' : 'none' }}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <Server size={17} color="var(--primary)" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{env.label}</div>
            <div className="text-xs" style={{ color: 'var(--text-light)' }}>{KIND_LABEL[env.kind]}{active ? ' · ativo' : ''}</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full" style={{ background: health.color }} />
          <Badge variant={health.variant}>{health.label}</Badge>
        </span>
      </div>

      {/* Métricas (só o que já existe nas fixtures) */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <Metric icon={Activity} label="AppServers online" value={`${health.running}/${health.total}`} color="var(--success)" />
        <Metric icon={Server} label="Parados" value={String(health.stopped)} color={health.stopped ? 'var(--danger)' : 'var(--text)'} />
        <Metric icon={Package} label="RPO" value={data.rpoVersion || '—'} mono />
        <Metric icon={Database} label="Banco" value={data.database ? `${data.database}${data.alias ? ` · ${data.alias}` : ''}` : '—'} mono />
      </div>

      <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ background: 'var(--surface-hover)' }}>
        <span style={{ color: 'var(--text-light)' }}>RPO atualizado: </span>
        <span className="font-mono" style={{ color: 'var(--text)' }}>{fmtDateTime(data.rpoUpdatedAt)}</span>
      </div>

      {/* Alertas */}
      {data.alerts.length > 0 ? (
        <div className="flex flex-col gap-1.5 mb-4">
          {data.alerts.map((a) => (
            <div key={a} className="flex items-center gap-1.5 text-xs" style={{ color: data.exclusive && a.includes('Exclusivo') ? 'var(--danger)' : 'var(--warning)' }}>
              {data.exclusive && a.includes('Exclusivo') ? <Lock size={12} /> : <AlertTriangle size={12} />}
              <span>{a}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--success)' }}>
          <Activity size={12} /> Sem alertas
        </div>
      )}

      <div className="flex items-center justify-end gap-1 text-sm font-medium" style={{ color: 'var(--primary)' }}>
        Operar ambiente <ChevronRight size={15} />
      </div>
    </button>
  )
}

function Metric({ icon: Icon, label, value, color, mono }: { icon: typeof Activity; label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={12} style={{ color: 'var(--text-light)' }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</span>
      </div>
      <div className={`text-sm font-semibold ${mono ? 'font-mono' : ''} truncate`} style={{ color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}
