'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight C4 · Configuração de Ambiente — detalhe CADASTRAL real de UM ambiente.
// Eixo oficial: ProsightCompanyContext.customer_id + environment_id (selecionado em
// C3). Mostra SOMENTE o que o Env* sabe hoje: ambiente, AppServers (version/build/
// patch), engine do banco (+ AlwaysOn CADASTRADO), links. Broker/compilação/RPO/
// REST/health/folders/janela/n8n/operação = Conector → seção estática "aguardando".
// Nada de secret/host/porta/URL. Sem fallback fixture no live: erro = indisponível.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import {
  Boxes, Building2, Database, Layers, Link2, RefreshCw, Server, ServerCog, Settings, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { ApiError, apiMessage } from '@/lib/api'
import { fetchProsightEnvironmentConfig, type SafeEnvironmentConfig } from '@/lib/prosight/environments'
import { useProsightCompany } from '@/app/prosight/_components/company-context'
import { useProsightEnvSelection } from '@/app/prosight/_components/env-selection-context'

const TYPE_LABEL: Record<SafeEnvironmentConfig['environment']['type'], string> = {
  prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'Disaster Recovery',
}
const ENGINE_LABEL: Record<string, string> = {
  sqlserver: 'SQL Server', postgres: 'PostgreSQL', oracle: 'Oracle', mysql: 'MySQL',
}
const STATUS_VARIANT: Record<string, string> = {
  ativo: 'default', inativo: 'danger', manutencao: 'warning', indefinido: 'default',
}
// Capacidades que dependem do Conector — lista ESTÁTICA de UI (o Env NÃO conhece o estado delas).
const PENDING = [
  'Health ao vivo', 'RPO', 'Compilação', 'REST health', 'Broker / serviços',
  'Pastas / janela de manutenção / n8n', 'Modo exclusivo / operação',
]

// previewEnvironmentId/demoAdmin: aceitos p/ compatibilidade do harness de preview; o C4 usa o contexto real.
export function ConfiguracaoView(_props: { previewEnvironmentId?: string | null; demoAdmin?: boolean } = {}) {
  const company = useProsightCompany()
  const sel = useProsightEnvSelection()
  const companyId = company?.companyId ?? null
  const companyName = company?.companyName ?? null
  const environmentId = sel?.environmentId ?? null

  const [config, setConfig] = useState<SafeEnvironmentConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (companyId == null || environmentId == null) { setConfig(null); return }
    setLoading(true); setError(null)
    try { setConfig(await fetchProsightEnvironmentConfig(companyId, environmentId)) }
    catch (e) {
      setConfig(null)
      // 404 = ambiente não pertence a esta empresa / fora de escopo → limpa a seleção (sem stale).
      if (e instanceof ApiError && e.status === 404) { sel?.setEnvironmentId(null); setError(null) }
      else { setError(apiMessage(e, 'Falha ao carregar a configuração do ambiente.')) }
    }
    finally { setLoading(false) }
  }, [companyId, environmentId, sel])

  useEffect(() => { void load() }, [load])

  const needSelection = companyId == null || environmentId == null

  return (
    <>
      <PageHeader
        icon={Settings}
        title="Configuração de Ambiente"
        subtitle="Configuração cadastral do ambiente selecionado (Cofre). Operação, health e RPO ao vivo entram com o Conector."
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || needSelection}>Atualizar</Button>}
      />

      {needSelection ? (
        <Card><EmptyState icon={Building2} title="Selecione empresa e ambiente"
          description="A Configuração exige uma empresa (seletor acima) e um ambiente específico. Abra em Ambientes e use “Ver configuração”." /></Card>
      ) : loading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : error ? (
        <Card><EmptyState icon={XCircle} title="Configuração indisponível" description={error}
          action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} /></Card>
      ) : !config ? (
        <Card><EmptyState icon={Layers} title="Ambiente não disponível"
          description="O ambiente selecionado não está disponível para esta empresa. Selecione um ambiente em Ambientes." /></Card>
      ) : (
        <ConfigDetail config={config} companyName={companyName} />
      )}
    </>
  )
}

function ConfigDetail({ config, companyName }: { config: SafeEnvironmentConfig; companyName: string | null }) {
  const env = config.environment
  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho do ambiente */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <Server size={17} color="var(--primary)" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                {companyName ? `${companyName} · ` : ''}{env.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-light)' }}>{TYPE_LABEL[env.type] ?? env.type}</div>
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[env.status.code] ?? 'default'}>{env.status.label}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {env.responsible_name && <span>Responsável: <b style={{ color: 'var(--text)' }}>{env.responsible_name}</b></span>}
          {env.updated_at && <span>Atualizado: {new Date(env.updated_at).toLocaleString('pt-BR')}</span>}
          <span style={{ color: 'var(--text-light)' }}>{env.status.note}</span>
        </div>
      </div>

      {/* AppServers cadastrados */}
      <Section icon={ServerCog} title={`${config.appservers.length} AppServer${config.appservers.length === 1 ? '' : 's'} cadastrado${config.appservers.length === 1 ? '' : 's'}`}>
        {config.appservers.length === 0 ? <Empty /> : (
          <div className="flex flex-col gap-1">
            {config.appservers.map((a, i) => (
              <div key={i} className="text-sm font-mono truncate" style={{ color: 'var(--text)' }}>
                {a.name}{a.version ? ` · ${a.version}` : ''}{a.build ? ` · build ${a.build}` : ''}{a.patch ? ` · patch ${a.patch}` : ''}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Banco (engine + AlwaysOn cadastrado) */}
      <Section icon={Database} title="Banco de dados">
        {config.databases.length === 0 ? <Empty /> : (
          <div className="flex flex-col gap-1">
            {config.databases.map((d, i) => (
              <div key={i} className="text-sm" style={{ color: 'var(--text)' }}>
                {ENGINE_LABEL[d.engine] ?? d.engine}
                <span style={{ color: 'var(--text-light)' }}> · AlwaysOn (cadastrado): {d.always_on_cadastrado ? 'sim' : 'não'}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Links / integrações cadastradas */}
      <Section icon={Link2} title="Integrações cadastradas">
        {config.links.length === 0 ? <Empty /> : (
          <div className="flex flex-wrap gap-1.5">
            {config.links.map((l, i) => (
              <span key={i} className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                {l.label} · {l.kind}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Capacidades ainda sem conexão (Conector) — estático, sem estado observado */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Boxes size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Capacidades ainda sem conexão (Conector)</span>
        </div>
        <div className="flex flex-col gap-1">
          {PENDING.map((p) => (
            <div key={p} className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{p}</span>
              <span style={{ color: 'var(--text-light)' }}>Aguardando Conector</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Server; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} style={{ color: 'var(--text-light)' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Empty() {
  return <div className="text-sm" style={{ color: 'var(--text-light)' }}>—</div>
}
