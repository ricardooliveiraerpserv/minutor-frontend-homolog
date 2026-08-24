'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Configuração — cara administrativa do Minutor (NÃO o
// wizard 10-passos nem file browser do Dashboards legado). Seções:
//   Ambiente · Compilador · AppServers/Slaves · RPO · Pastas · REST · Parâmetros.
// Preserva TODOS os parâmetros relevantes do configurador original. Paths
// Windows/UNC como TEXTO (validação física é do backend no live). Segredos JAMAIS
// em claro — só "Configurado". Somente admin (config.manage).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import {
  Boxes, Database, FolderCog, Hammer, Lock, Server, Settings2, ShieldAlert, Sliders, XCircle,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, PageHeader, Skeleton,
} from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type { EnvironmentConfig } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { fmtDateTime } from './shared'

export function ConfiguracaoView({ previewEnvironmentId = null, demoAdmin = false }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
  const ds = getOperacoesDataSource()
  const { user } = useAuth()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? null
  const canManage = demoAdmin || canOperacoes('config.manage', user)

  const [cfg, setCfg] = useState<EnvironmentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null); setNotConfigured(false)
    try {
      const c = await ds.getConfig(environmentId)
      if (!c) { setNotConfigured(true); setCfg(null) } else setCfg(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a configuração.'); setCfg(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { if (canManage) void load() }, [canManage, load])

  if (!canManage) {
    return (
      <>
        <PageHeader icon={Settings2} title="Configuração" subtitle="Parâmetros do ambiente Protheus." />
        <Card><EmptyState icon={ShieldAlert} title="Acesso restrito" description="A configuração de Operações Protheus é exclusiva de administradores do Minutor." /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        icon={Settings2}
        title="Configuração"
        subtitle={`Parâmetros do ambiente${environmentLabel ? ` · ${environmentLabel}` : ''}. Edição efetiva no D-live (validação física no backend).`}
        actions={<Button variant="secondary" disabled title="A edição será habilitada na conexão real (D-live).">Editar (D-live)</Button>}
      />

      {loading ? (
        <div className="flex flex-col gap-4">
          <Card><Skeleton className="h-32 w-full" /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
          <Card><Skeleton className="h-32 w-full" /></Card>
        </div>
      ) : error ? (
        <Card><EmptyState icon={XCircle} title="Não foi possível carregar" description={error}
          action={<Button variant="primary" onClick={() => void load()}>Tentar novamente</Button>} /></Card>
      ) : notConfigured ? (
        <Card><EmptyState icon={ShieldAlert} title="Ambiente não configurado" description="Este ambiente ainda não possui configuração. No D-live, use o assistente para definir broker, slaves, compilador, RPO e pastas." /></Card>
      ) : cfg ? (
        <div className="flex flex-col gap-4">
          {/* Ambiente */}
          <Section icon={Database} title="Ambiente" description="Broker e identificação do ambiente.">
            <FieldGrid rows={[
              { label: 'Broker habilitado', value: cfg.broker.enabled ? 'Sim' : 'Não' },
              { label: 'Serviço do Broker', value: cfg.broker.serviceName, mono: true },
              { label: 'Broker · exibição', value: cfg.broker.serviceDisplayName },
              { label: 'Broker · porta', value: String(cfg.broker.port), mono: true },
              { label: 'Broker · exe', value: cfg.broker.exePath, mono: true },
              { label: 'Broker · ini', value: cfg.broker.iniPath, mono: true },
              { label: 'Estratégia de RPO', value: cfg.rpoStrategy, mono: true },
            ]} />
          </Section>

          {/* Compilador */}
          <Section icon={Hammer} title="Compilador" description="Appserver dedicado à compilação/depuração.">
            <FieldGrid rows={[
              { label: 'Serviço', value: cfg.compiler.serviceName, mono: true },
              { label: 'Ambiente AdvPL', value: cfg.compiler.appEnvironment, mono: true },
              { label: 'Porta', value: String(cfg.compiler.port), mono: true },
              { label: 'Exe', value: cfg.compiler.exePath, mono: true },
            ]} />
          </Section>

          {/* AppServers / Slaves */}
          <Section icon={Boxes} title="AppServers / Slaves" description="Instâncias de execução do ambiente.">
            <div className="flex flex-col gap-3">
              {cfg.slaves.map((s, i) => (
                <div key={i} className="rounded-xl p-4" style={{ background: 'var(--surface-hover)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{s.serviceDisplayName}</span>
                    <Badge variant={s.valid ? 'success' : 'danger'}>{s.valid ? 'Válido' : 'Com erros'}</Badge>
                  </div>
                  <FieldGrid dense rows={[
                    { label: 'Serviço', value: s.serviceName, mono: true },
                    { label: 'Porta', value: String(s.port), mono: true },
                    { label: 'Ambiente', value: s.appEnvironment, mono: true },
                    { label: 'RPO Custom', value: s.rpoCustom, mono: true },
                    { label: 'Versão RPO', value: s.rpoVersion, mono: true },
                    { label: 'Root Path', value: s.rootPath, mono: true },
                    { label: 'Source Path', value: s.sourcePath, mono: true },
                    { label: 'UNC', value: s.uncPath, mono: true },
                    { label: 'INI', value: s.iniPath, mono: true },
                  ]} />
                </div>
              ))}
            </div>
          </Section>

          {/* RPO */}
          <Section icon={Server} title="RPO" description="Repositório de objetos compilados.">
            <FieldGrid rows={[
              { label: 'Estratégia', value: cfg.rpoStrategy, mono: true },
              { label: 'RPO Custom (slave 01)', value: cfg.slaves[0]?.rpoCustom ?? '—', mono: true },
              { label: 'Versão (slave 01)', value: cfg.slaves[0]?.rpoVersion ?? '—', mono: true },
              { label: 'Compilador · source', value: cfg.slaves[0]?.sourcePath ?? '—', mono: true },
            ]} />
          </Section>

          {/* Pastas */}
          <Section icon={FolderCog} title="Pastas" description="Diretórios de trabalho (Windows/UNC).">
            <FieldGrid rows={[
              { label: 'Fontes', value: cfg.folders.sources, mono: true },
              { label: 'Patches', value: cfg.folders.patches, mono: true },
              { label: 'GetApoInfo', value: cfg.folders.getapoinfo, mono: true },
            ]} />
          </Section>

          {/* REST */}
          <Section icon={Server} title="REST" description="Servidores REST e health check.">
            <div className="flex flex-col gap-3">
              {cfg.restServers.map((r, i) => (
                <div key={i} className="rounded-xl p-4" style={{ background: 'var(--surface-hover)' }}>
                  <div className="font-semibold text-sm mb-2" style={{ color: 'var(--text)' }}>{r.serviceName}</div>
                  <FieldGrid dense rows={[
                    { label: 'Porta', value: String(r.port), mono: true },
                    { label: 'SSL', value: r.hasSSL ? 'Sim' : 'Não' },
                    { label: 'Health check URL', value: r.healthCheckUrl, mono: true },
                    { label: 'Health check usuário', value: r.healthCheckUser, mono: true },
                    { label: 'Health check senha', value: r.healthCheckPassSet ? 'Configurado' : 'Não configurado', secret: r.healthCheckPassSet },
                  ]} />
                </div>
              ))}
              {cfg.scheduleServers.map((s, i) => (
                <div key={`sch-${i}`} className="rounded-xl p-4" style={{ background: 'var(--surface-hover)' }}>
                  <div className="font-semibold text-sm mb-2" style={{ color: 'var(--text)' }}>Schedule · {s.serviceName}</div>
                  <FieldGrid dense rows={[
                    { label: 'Porta', value: String(s.port), mono: true },
                    { label: 'Exe', value: s.exePath, mono: true },
                  ]} />
                </div>
              ))}
            </div>
          </Section>

          {/* Parâmetros Operacionais */}
          <Section icon={Sliders} title="Parâmetros Operacionais" description="Janela de manutenção, integrações e serviços extras.">
            <FieldGrid rows={[
              { label: 'Janela de manutenção', value: cfg.maintenanceWindow.enabled ? 'Ativa' : 'Inativa' },
              { label: 'Dias', value: cfg.maintenanceWindow.days.join(', ') || '—' },
              { label: 'Horário', value: cfg.maintenanceWindow.time, mono: true },
              { label: 'E-mails de alerta', value: cfg.maintenanceWindow.emails.join(', ') || '—' },
              { label: 'Exclusivo · serviço', value: cfg.exclusive.serviceName, mono: true },
              { label: 'Exclusivo · porta', value: String(cfg.exclusive.port), mono: true },
              { label: 'Webhook n8n', value: cfg.integrations.n8nWebhookUrl ? 'Configurado' : 'Não configurado', secret: !!cfg.integrations.n8nWebhookUrl },
              { label: 'Alertar fonte ausente', value: cfg.integrations.alertMissingSource ? 'Sim' : 'Não' },
              ...cfg.extraServices.map((x) => ({ label: `Extra · ${x.name}`, value: x.exePath, mono: true })),
            ]} />
          </Section>

          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-light)' }}>
            <Lock size={12} /> Última atualização por <b style={{ color: 'var(--text-muted)' }}>{cfg.updatedBy}</b> em {fmtDateTime(cfg.updatedAt)}.
          </div>
        </div>
      ) : null}
    </>
  )
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Settings2; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Icon size={15} color="var(--primary)" />
        </div>
        <div>
          <div className="font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</div>
        </div>
      </div>
      {children}
    </Card>
  )
}

interface FieldRow { label: string; value: string; mono?: boolean; secret?: boolean }

function FieldGrid({ rows, dense }: { rows: FieldRow[]; dense?: boolean }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${dense ? 'lg:grid-cols-3' : ''} gap-2.5`}>
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg px-3 py-2" style={{ background: dense ? 'var(--surface)' : 'var(--surface-hover)', border: dense ? '1px solid var(--border)' : 'none' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{r.label}</div>
          {r.secret !== undefined ? (
            <div className="mt-0.5"><Badge variant={r.secret ? 'success' : 'default'}>{r.value}</Badge></div>
          ) : (
            <div className={`text-sm mt-0.5 ${r.mono ? 'font-mono break-all' : ''}`} style={{ color: 'var(--text)' }}>{r.value}</div>
          )}
        </div>
      ))}
    </div>
  )
}
