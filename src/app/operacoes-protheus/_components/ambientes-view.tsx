'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight C3 · Ambientes — REGISTRO real do Cofre (Env*) por empresa.
// Autoridade = ProsightCompanyContext.customer_id (não mais o hardcode 'jng').
// Mostra SOMENTE o que existe no cadastro: nome, tipo, status CADASTRAL (manual,
// não health), componentes, AppServers (version/build/patch), engine do banco,
// links seguros. Health ao vivo / RPO pertencem ao Conector (Bloco B) → exibidos
// explicitamente como "aguardando conexão", NUNCA inventados/inferidos.
// Sem secrets/host/porta/URL (o backend já projeta allowlist). Empresa obrigatória.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Boxes, Building2, ChevronRight, Database, Layers, Link2, RefreshCw, Server, ServerCog, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { apiMessage } from '@/lib/api'
import { fetchProsightEnvironments, type SafeEnvironment } from '@/lib/prosight/environments'
import { useProsightCompany } from '@/app/prosight/_components/company-context'
import { useProsightEnvSelection } from '@/app/prosight/_components/env-selection-context'

const TYPE_LABEL: Record<SafeEnvironment['type'], string> = {
  prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'Disaster Recovery',
}
const COMPONENT_LABEL: Record<string, string> = {
  protheus: 'Protheus', appserver: 'AppServer', dbaccess: 'DBAccess',
  tss: 'TSS', fluig: 'Fluig', portal: 'Portal', powerbi: 'Power BI',
}
const ENGINE_LABEL: Record<string, string> = {
  sqlserver: 'SQL Server', postgres: 'PostgreSQL', oracle: 'Oracle', mysql: 'MySQL',
}
// status é CADASTRAL — nunca verde "Online" (não há heartbeat). Neutro para ativo/indefinido.
const STATUS_VARIANT: Record<SafeEnvironment['status']['code'], string> = {
  ativo: 'default', inativo: 'danger', manutencao: 'warning', indefinido: 'default',
}

export function AmbientesView() {
  const company = useProsightCompany()
  const sel = useProsightEnvSelection()
  const router = useRouter()
  const companyId = company?.companyId ?? null
  const companyName = company?.companyName ?? null

  const openConfig = (id: number) => {
    sel?.setEnvironmentId(id) // C4 — eixo customer_id + environment_id
    router.push('/operacoes-protheus/configuracao')
  }

  const [envs, setEnvs] = useState<SafeEnvironment[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (companyId == null) { setEnvs(null); return }
    setLoading(true); setError(null)
    try { setEnvs(await fetchProsightEnvironments(companyId)) }
    catch (e) { setError(apiMessage(e, 'Falha ao carregar os ambientes.')); setEnvs(null) }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  return (
    <>
      <PageHeader
        icon={Layers}
        title="Ambientes"
        subtitle="Registro técnico dos ambientes Protheus da empresa (Cofre). Operação e health ao vivo entram com o Conector."
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || companyId == null}>Atualizar</Button>}
      />

      {/* Empresa obrigatória — ambiente é contexto operacional; "Todas" não lista. */}
      {companyId == null ? (
        <Card><EmptyState icon={Building2} title="Selecione uma empresa"
          description="A aba Ambientes exige uma empresa específica. Escolha a empresa no seletor acima para ver seus ambientes cadastrados." /></Card>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : error ? (
        <Card><EmptyState icon={XCircle} title="Não foi possível carregar os ambientes" description={error}
          action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} /></Card>
      ) : (envs ?? []).length === 0 ? (
        <Card><EmptyState icon={Layers} title="Nenhum ambiente cadastrado"
          description={`${companyName ?? 'Esta empresa'} ainda não possui ambientes no Cofre. Cadastre pelo Cofre de Ambientes.`} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(envs ?? []).map((e) => <EnvironmentCard key={e.id} env={e} onConfig={() => openConfig(e.id)} />)}
        </div>
      )}
    </>
  )
}

function EnvironmentCard({ env, onConfig }: { env: SafeEnvironment; onConfig: () => void }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <Server size={17} color="var(--primary)" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{env.name}</div>
            <div className="text-xs" style={{ color: 'var(--text-light)' }}>{TYPE_LABEL[env.type] ?? env.type}</div>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[env.status.code] ?? 'default'}>{env.status.label}</Badge>
      </div>

      {/* Componentes cadastrados */}
      {env.components.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {env.components.map((c) => (
            <span key={c} className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
              {COMPONENT_LABEL[c] ?? c}
            </span>
          ))}
        </div>
      )}

      {/* AppServers cadastrados (version/build/patch) — sem "online" */}
      <div className="rounded-lg px-3 py-2.5 mb-3" style={{ background: 'var(--surface-hover)' }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <ServerCog size={12} style={{ color: 'var(--text-light)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
            {env.appservers.length} AppServer{env.appservers.length === 1 ? '' : 's'} cadastrado{env.appservers.length === 1 ? '' : 's'}
          </span>
        </div>
        {env.appservers.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--text-light)' }}>—</div>
        ) : (
          <div className="flex flex-col gap-1">
            {env.appservers.map((a, i) => (
              <div key={i} className="text-xs font-mono truncate" style={{ color: 'var(--text)' }}>
                {a.name}{a.version ? ` · ${a.version}` : ''}{a.build ? ` · build ${a.build}` : ''}{a.patch ? ` · patch ${a.patch}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Banco (só engine) + links seguros */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
          <div className="flex items-center gap-1.5 mb-0.5"><Database size={12} style={{ color: 'var(--text-light)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Banco</span></div>
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {env.databases.length ? env.databases.map((d) => ENGINE_LABEL[d.engine] ?? d.engine).join(', ') : '—'}
          </div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
          <div className="flex items-center gap-1.5 mb-0.5"><Link2 size={12} style={{ color: 'var(--text-light)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Links</span></div>
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {env.links.length ? env.links.map((l) => l.label).join(', ') : '—'}
          </div>
        </div>
      </div>

      {/* Bloco B / Conector — health e RPO ao vivo NÃO existem em C3 (nunca inventados) */}
      <div className="rounded-lg px-3 py-2 text-[11px] flex items-start gap-1.5 mb-3" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
        <Boxes size={12} className="mt-px shrink-0" />
        <span>Health ao vivo e RPO: <b>aguardando conexão (Conector)</b>. Status é cadastral, não tempo real.</span>
      </div>

      {/* C4 — abre o detalhe cadastral (Configuração) deste ambiente */}
      <button onClick={onConfig} className="flex w-full items-center justify-end gap-1 text-sm font-medium" style={{ color: 'var(--primary)' }}>
        Ver configuração <ChevronRight size={15} />
      </button>
    </div>
  )
}
