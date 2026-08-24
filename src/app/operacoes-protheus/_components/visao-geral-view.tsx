'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Visão Geral — tela principal. Hierarquia:
//   EMPRESA/AMBIENTE → SAÚDE → APPSERVERS → INFO → MONITORAMENTO → OPERAÇÕES → CONSOLE.
// Reconstrói as capacidades do Dashboards legado (dashboard.html/js) NATIVO no
// Minutor: nada é escondido — apenas melhor organizado. 100% via datasource.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, Bug, Database, FolderCog,
  Hammer, Lock, Package, PlayCircle, RefreshCw, RotateCcw, Search, Server, ServerCog,
  ShieldAlert, StopCircle, Terminal, Trash2, Upload, XCircle,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type {
  ConsoleLog, ConsoleSource, ExclusiveState, FolderStatus, ServiceRow, SystemInfo,
} from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { useOperations } from './operations'
import {
  CHART_PALETTE, CHART_TOOLTIP_STYLE, FOLDER_LEVEL_META, SERVICE_TYPE_LABELS,
  STATUS_META, fmtBytes, fmtCpu, fmtInt, isDegraded,
} from './shared'

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
  const [filter, setFilter] = useState('')

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

  const nonExclusive = (services ?? []).filter((s) => s.type !== 'exclusive')
  const running = nonExclusive.filter((s) => s.status === 'Running').length
  const stopped = nonExclusive.filter((s) => s.status !== 'Running').length
  const degraded = nonExclusive.filter(isDegraded).length
  const health: { label: string; color: string; variant: string } =
    stopped > 0 ? { label: 'Crítico', color: 'var(--danger)', variant: 'danger' }
    : degraded > 0 ? { label: 'Atenção', color: 'var(--warning)', variant: 'warning' }
    : (services?.length ?? 0) === 0 ? { label: 'Indefinido', color: 'var(--text-light)', variant: 'default' }
    : { label: 'Saudável', color: 'var(--success)', variant: 'success' }

  const canBuild = (exclusive?.active ?? false) || debugActive

  const filteredServices = useMemo(() => {
    const t = filter.trim().toLowerCase()
    return (services ?? []).filter((s) => !t || s.displayName.toLowerCase().includes(t) || s.name.toLowerCase().includes(t))
  }, [services, filter])

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Saúde do ambiente" value={health.label} color={health.color} icon={Activity} />
            <StatCard label="Serviços iniciados" value={String(running)} color="var(--success)" icon={PlayCircle} />
            <StatCard label="Serviços parados" value={String(stopped)} color={stopped ? 'var(--danger)' : 'var(--text)'} icon={StopCircle} />
            <StatCard label="Degradados" value={String(degraded)} color={degraded ? 'var(--warning)' : 'var(--text)'} icon={AlertTriangle} />
          </div>

          {/* ── APPSERVERS ────────────────────────────────────────────────────── */}
          <Card padding="none">
            <SectionHead icon={Server} title="AppServers" subtitle="Serviços do ambiente Protheus">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                  <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filtrar serviço…"
                    className="rounded-xl pl-9 pr-3 py-2 text-sm outline-none w-44" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
                <Button size="sm" variant="secondary" icon={PlayCircle} disabled={!can('services.control')} onClick={() => ops.serviceAll('start')}>Start All</Button>
                <Button size="sm" variant="secondary" icon={StopCircle} disabled={!can('services.control')} onClick={() => ops.serviceAll('stop')}>Stop All</Button>
              </div>
            </SectionHead>
            <Table>
              <Thead>
                <Tr>
                  <Th>Serviço</Th><Th>Tipo</Th><Th>Porta</Th><Th>Status</Th>
                  <Th right>CPU</Th><Th right>Memória</Th><Th right>Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredServices.length === 0 ? (
                  <Tr><Td colSpan={7}><div className="py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum serviço para o filtro.</div></Td></Tr>
                ) : filteredServices.map((s) => (
                  <ServiceRowView key={s.name} s={s} canControl={can('services.control')} onAction={(a) => ops.service(s.name, a, s.displayName)} />
                ))}
              </Tbody>
            </Table>
          </Card>

          {/* ── INFO + MONITORAMENTO ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <Card>
                <SectionHead icon={Database} title="Informações do Ambiente" subtitle={info?.appEnvironment ? `${info.appEnvironment}${info.topDatabase ? ` · DB ${info.topDatabase}` : ''}` : undefined} />
                {info && <InfoGrid info={info} />}
              </Card>
            </div>
            <Card>
              <SectionHead icon={FolderCog} title="Monitoramento · pasta System" />
              {folder && <FolderMonitor folder={folder} />}
            </Card>
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

// ── Subcomponentes ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: { label: string; value: string; color: string; icon: typeof Activity }) {
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} style={{ color: 'var(--text-light)' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  )
}

function SectionHead({ icon: Icon, title, subtitle, children }: { icon: typeof Server; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Icon size={15} color="var(--primary)" />
        </div>
        <div>
          <div className="font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          {subtitle && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function ServiceRowView({ s, canControl, onAction }: { s: ServiceRow; canControl: boolean; onAction: (a: 'start' | 'stop' | 'restart') => void }) {
  const meta = STATUS_META[s.status]
  const degraded = isDegraded(s)
  const running = s.status === 'Running'
  const controllable = canControl && s.type !== 'exclusive' && s.type !== 'compiler'
  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <span className="font-medium" style={{ color: 'var(--text)' }}>{s.displayName}</span>
          {!s.found && <Badge variant="warning">não encontrado</Badge>}
        </div>
      </Td>
      <Td><Badge variant="default">{SERVICE_TYPE_LABELS[s.type]}</Badge></Td>
      <Td muted mono>{s.port ?? '—'}</Td>
      <Td>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: degraded ? 'var(--warning)' : meta.dot }} />
          {degraded ? <Badge variant="warning">Degradado</Badge> : <Badge variant={meta.variant}>{meta.label}</Badge>}
        </span>
      </Td>
      <Td right mono style={{ color: degraded ? 'var(--warning)' : undefined }}>{fmtCpu(s.cpu)}</Td>
      <Td right mono muted>{fmtBytes(s.memory)}</Td>
      <Td right>
        {controllable ? (
          <div className="inline-flex items-center gap-1.5 justify-end">
            <IconBtn title="Iniciar" disabled={running} onClick={() => onAction('start')}><PlayCircle size={15} style={{ color: running ? 'var(--text-light)' : 'var(--success)' }} /></IconBtn>
            <IconBtn title="Parar" disabled={!running} onClick={() => onAction('stop')}><StopCircle size={15} style={{ color: !running ? 'var(--text-light)' : 'var(--danger)' }} /></IconBtn>
            <IconBtn title="Reiniciar" disabled={!running} onClick={() => onAction('restart')}><RefreshCw size={14} style={{ color: !running ? 'var(--text-light)' : 'var(--warning)' }} /></IconBtn>
          </div>
        ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
      </Td>
    </Tr>
  )
}

function IconBtn({ children, title, disabled, onClick }: { children: React.ReactNode; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {children}
    </button>
  )
}

function InfoGrid({ info }: { info: SystemInfo }) {
  const rows: { label: string; value: string; mono?: boolean; warn?: boolean }[] = [
    { label: 'Versão RPO', value: info.rpoVersion || '—', mono: true },
    { label: 'Ambiente', value: info.appEnvironment || '—', mono: true },
    { label: 'Banco de Dados', value: info.topDatabase || '—', mono: true },
    { label: 'Alias BD', value: info.topAlias || '—', mono: true },
    { label: 'Servidor BD', value: info.topServer || '—', mono: true },
    { label: 'Inactive Timeout', value: info.inactiveTimeout ? `${info.inactiveTimeout}s` : '—', mono: true },
    { label: 'Porta TCP', value: String(info.port || '—'), mono: true },
    { label: 'Debug (Trace)', value: info.trace === '1' ? 'Ativado' : 'Desativado', warn: info.trace === '1' },
    { label: 'RPO Custom', value: info.rpoCustom || '—', mono: true },
    { label: 'SpecialKey', value: info.specialKey || '—', mono: true },
    { label: 'Source Path', value: info.sourcePath || '—', mono: true },
    ...info.rpoFiles.map((f) => ({ label: f.name, value: f.mtime ? new Date(f.mtime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : (f.error || '—'), mono: true })),
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{r.label}</div>
          <div className={`text-sm mt-0.5 ${r.mono ? 'font-mono' : ''} truncate`} style={{ color: r.warn ? 'var(--warning)' : 'var(--text)' }}>{r.value}</div>
        </div>
      ))}
    </div>
  )
}

function FolderMonitor({ folder }: { folder: FolderStatus }) {
  const lvl = FOLDER_LEVEL_META[folder.level]
  const donut = folder.extensionBreakdown.map((e, i) => ({ name: e.ext, value: e.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Arquivos" value={folder.systemTotal < 0 ? 'Erro' : fmtInt(folder.systemTotal)} color={lvl.color} />
        <MiniStat label="Spool" value={folder.spoolTotal < 0 ? '—' : fmtInt(folder.spoolTotal)} />
        <MiniStat label="TSK" value={fmtInt(folder.slaveTskCount)} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'var(--text-muted)' }}>Nível</span>
        <Badge variant={folder.level === 'green' ? 'success' : folder.level === 'yellow' ? 'warning' : folder.level === 'red' ? 'danger' : 'default'}>{lvl.label}</Badge>
      </div>
      <div style={{ width: '100%', height: 170 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={donut} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {donut.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{d.name}</span>
            <b style={{ color: 'var(--text)' }}>{fmtInt(d.value)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: 'var(--surface-hover)' }}>
      <div className="text-lg font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</div>
    </div>
  )
}

function OpButton({ icon: Icon, title, desc, disabled, danger, onClick }: { icon: typeof Hammer; title: string; desc: string; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="text-left rounded-xl px-4 py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} style={{ color: danger ? 'var(--danger)' : 'var(--primary)' }} />
        <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{title}</span>
      </div>
      <div className="text-xs" style={{ color: 'var(--text-light)' }}>{desc}</div>
    </button>
  )
}

// ── Console viewer ──────────────────────────────────────────────────────────────

function ConsoleViewer({ environmentId }: { environmentId: string | null }) {
  const ds = getOperacoesDataSource()
  const [sources, setSources] = useState<ConsoleSource[]>([])
  const [source, setSource] = useState('')
  const [filter, setFilter] = useState('')
  const [log, setLog] = useState<ConsoleLog | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!environmentId) return
    void ds.getConsoleSources(environmentId).then((s) => { setSources(s); setSource((cur) => cur || s[0]?.id || '') })
  }, [ds, environmentId])

  const reload = useCallback(async () => {
    if (!environmentId) return
    setLoading(true)
    try {
      setLog(await ds.getConsoleLog(environmentId, { source, filter }))
    } finally { setLoading(false) }
  }, [ds, environmentId, source, filter])

  useEffect(() => { void reload() }, [reload])

  const lineColor = (l: string) => /error|erro/i.test(l) ? 'var(--danger)' : /warn|aviso/i.test(l) ? 'var(--warning)' : /info/i.test(l) ? 'var(--info)' : 'var(--text-muted)'

  return (
    <Card padding="none">
      <SectionHead icon={Terminal} title="Console" subtitle="Log dos appservers">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="!py-2">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filtrar log…"
              className="rounded-xl pl-9 pr-3 py-2 text-sm outline-none w-40" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={loading} onClick={() => void reload()}>Recarregar</Button>
        </div>
      </SectionHead>
      <div className="mx-4 mb-4 rounded-xl overflow-auto max-h-72 p-3 font-mono text-xs" style={{ background: 'var(--surface-sunken, var(--surface-hover))', border: '1px solid var(--border)' }}>
        {(log?.lines ?? []).length === 0 ? (
          <div className="py-6 text-center" style={{ color: 'var(--text-light)' }}>Sem linhas para o filtro.</div>
        ) : log!.lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap leading-relaxed" style={{ color: lineColor(l) }}>{l}</div>
        ))}
      </div>
    </Card>
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
