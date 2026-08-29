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
  Boxes, Building2, ChevronRight, Database, KeyRound, Layers, Link2, Loader2, Plus, RefreshCw, Server, ServerCog, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { ApiError, api, apiMessage } from '@/lib/api'
import {
  fetchEnvironmentsPresence, fetchProsightEnvironments, presenceLabel,
  type EnvironmentPresence, type SafeEnvironment,
} from '@/lib/prosight/environments'
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
function fmtSince(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
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
  const [presence, setPresence] = useState<Record<number, EnvironmentPresence>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Atalho: cadastrar ambiente aqui mesmo (reusa o endpoint do Cofre). Exige o cliente ter vault + o usuário
  // ser membro (zero-knowledge). Se faltar, cai para o Cofre de Ambientes (onde a chave RSA é distribuída).
  const [createOpen, setCreateOpen] = useState(false)
  const [nName, setNName] = useState(''); const [nType, setNType] = useState('prod')
  const [creating, setCreating] = useState(false)
  const [needVault, setNeedVault] = useState(false)

  const openCreate = () => { setNName(''); setNType('prod'); setNeedVault(false); setCreateOpen(true) }
  const goCofre = () => router.push(companyId != null ? `/ambientes/${companyId}` : '/ambientes')

  const createEnv = async () => {
    if (companyId == null || !nName.trim()) return
    setCreating(true); setNeedVault(false)
    try {
      await api.post(`/environments/clients/${companyId}/environments`, { name: nName.trim(), type: nType })
      toast.success('Ambiente cadastrado.'); setCreateOpen(false); await load()
    } catch (e) {
      // 404/403 = cliente sem vault OU usuário sem membership → direcionar ao Cofre (setup com chave RSA).
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) { setNeedVault(true) }
      else { toast.error(e instanceof ApiError ? e.message : 'Falha ao cadastrar ambiente.') }
    } finally { setCreating(false) }
  }

  const load = useCallback(async () => {
    if (companyId == null) { setEnvs(null); return }
    setLoading(true); setError(null)
    try {
      // Cadastro (obrigatório) + presença observada (best-effort; não bloqueia o cadastro).
      const [list, pres] = await Promise.all([
        fetchProsightEnvironments(companyId),
        fetchEnvironmentsPresence(companyId).catch(() => [] as EnvironmentPresence[]),
      ])
      setEnvs(list)
      setPresence(Object.fromEntries(pres.map((p) => [p.environment_id, p])))
    } catch (e) { setError(apiMessage(e, 'Falha ao carregar os ambientes.')); setEnvs(null) }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  return (
    <>
      <PageHeader
        icon={Layers}
        title="Ambientes"
        subtitle="Registro técnico dos ambientes Protheus da empresa (Cofre). Operação e health ao vivo entram com o Conector."
        actions={<div className="flex gap-2">
          {companyId != null && <Button variant="primary" icon={Plus} onClick={openCreate}>Cadastrar ambiente</Button>}
          <Button variant={companyId != null ? 'secondary' : 'primary'} icon={RefreshCw} onClick={() => void load()} disabled={loading || companyId == null}>Atualizar</Button>
        </div>}
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
          description={`${companyName ?? 'Esta empresa'} ainda não possui ambientes no Cofre. Cadastre um agora.`}
          action={<Button icon={Plus} onClick={openCreate}>Cadastrar ambiente</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(envs ?? []).map((e) => <EnvironmentCard key={e.id} env={e} presence={presence[e.id]} onConfig={() => openConfig(e.id)} />)}
        </div>
      )}

      {/* Atalho: cadastrar ambiente (reusa o Cofre). Fallback ao Cofre se faltar vault/membership. */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Cadastrar ambiente">
        {needVault ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-2">
              <KeyRound size={16} style={{ color: 'var(--warning)' }} />
              <span>Este cliente ainda não está no <b>Cofre de Ambientes</b> (ou você não é membro do vault). O ambiente exige um vault com chave distribuída (zero-knowledge) — isso é feito no Cofre.</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button icon={KeyRound} onClick={goCofre}>Abrir Cofre de Ambientes</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <TextInput label="Nome do ambiente" value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Produção" />
            <Select label="Tipo" value={nType} onChange={(e) => setNType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cadastro técnico do ambiente Protheus (Cofre). AppServers, banco e conexão do Connector entram depois, na configuração do ambiente.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button icon={creating ? Loader2 : Plus} disabled={creating || nName.trim().length < 2} onClick={createEnv}>Cadastrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function EnvironmentCard({ env, presence, onConfig }: { env: SafeEnvironment; presence?: EnvironmentPresence; onConfig: () => void }) {
  const pres = presenceLabel(presence)
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-3">
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

      {/* Cadastral × Observado — conceitos DISTINTOS (nunca misturar) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-[11px]" style={{ color: 'var(--text-light)' }}>
        <span>Cadastral: <b style={{ color: 'var(--text-muted)' }}>{env.status.label}</b></span>
        <span className="inline-flex items-center gap-1">Presença (Conector): <Badge variant={pres.variant}>{pres.label}</Badge>
          {presence?.observed?.since_s != null && <span>· visto há {fmtSince(presence.observed.since_s)}</span>}
        </span>
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
