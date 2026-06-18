'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { SearchSelect } from '@/components/ui/search-select'
import {
  Building2, Briefcase, Clock, Headphones, TrendingUp, ChevronDown,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts'

// Cor primária escolhida em runtime conforme o tema: o ciano #00F5FF é
// quase invisível em fundo claro, então no light mode usamos o ciano-escuro
// (Tailwind cyan-700) que combina com --brand-primary do globals.css.
function useThemePrimary() {
  const [primary, setPrimary] = useState('#00F5FF')
  useEffect(() => {
    if (typeof document === 'undefined') return
    const update = () => {
      const isDark = document.documentElement.classList.contains('dark')
      setPrimary(isDark ? '#00F5FF' : '#0E7490')
    }
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return primary
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Health = 'ok' | 'warning' | 'critical' | 'unknown' | 'closed'

interface ProjectHealth {
  id: number
  code: string
  name: string
  contract_type: string | null
  is_closed: boolean
  sold_hours: number | null
  consumed_hours: number | null
  balance_hours: number | null
  percentage: number | null
  status: Health
  children?: ProjectHealth[]
}

interface MonthlyPoint {
  month: string
  label: string
  tickets: number
  consumed_hours: number
}

interface Summary {
  customer:                      { id: number; name: string }
  open_tickets:                  number
  open_tickets_current_month:    number
  current_month_label:           string
  total_projects:                number
  total_sold_hours:              number
  projects_health:               ProjectHealth[]
  monthly_series:                MonthlyPoint[]
}

interface CustomerOpt { id: number; name: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtH(h: number | null | undefined) {
  if (h === null || h === undefined) return '—'
  return h.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'h'
}

const HEALTH_META: Record<Health, { label: string; color: string; bg: string }> = {
  ok:       { label: 'Saudável', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  warning:  { label: 'Atenção',  color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  critical: { label: 'Crítico',  color: '#EF4444', bg: 'rgba(239,68,68,0.14)' },
  unknown:  { label: '—',        color: '#A1A1AA', bg: 'rgba(161,161,170,0.10)' },
  closed:   { label: 'Fechado',  color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/**
 * Card "hero" do portal cliente — layout horizontal (ícone grande à esquerda + label/valor à direita).
 * Diferente do KpiCard genérico do design system (que é vertical). Renomeado pra evitar colisão.
 */
function PortalHeroCard({
  icon: Icon, label, value, accent,
}: {
  icon: React.ElementType
  label: string
  value: string
  accent: 'primary' | 'purple' | 'amber'
}) {
  const color = accent === 'primary' ? 'var(--primary)' : accent === 'purple' ? '#A78BFA' : 'var(--warning-border)'
  const bg    = accent === 'primary' ? 'var(--primary-soft)' : accent === 'purple' ? 'rgba(167,139,250,0.12)' : 'var(--warning-bg)'
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-4"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg, color }}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium uppercase tracking-[0.04em]" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-[24px] font-semibold tracking-tight leading-none mt-1" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
    </div>
  )
}

function EvolutionTooltip({ active, payload, label, primary }: any) {
  if (!active || !payload?.length) return null
  const tickets = payload.find((p: any) => p.dataKey === 'tickets')?.value ?? 0
  const horas   = payload.find((p: any) => p.dataKey === 'consumed_hours')?.value ?? 0
  return (
    <div className="px-3 py-2 rounded-lg shadow-xl text-[11px]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--brand-text)' }}>{label}</p>
      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: primary }} /><span style={{ color: 'var(--brand-muted)' }}>{tickets} ticket{tickets === 1 ? '' : 's'}</span></div>
      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#A78BFA' }} /><span style={{ color: 'var(--brand-muted)' }}>{Number(horas).toFixed(1)}h consumidas</span></div>
    </div>
  )
}

function MonthlyEvolution({ series }: { series: MonthlyPoint[] }) {
  const hasAny = series.some(p => p.tickets > 0 || p.consumed_hours > 0)
  const primary = useThemePrimary()
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="mb-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-muted)' }}>
          Evolução Mensal — Tickets e Consumo de Horas
        </h2>
      </div>
      <p className="text-[10px] mb-4" style={{ color: 'var(--brand-subtle)' }}>
        Horas referem-se apenas a apontamentos de <strong style={{ color: 'var(--brand-muted)' }}>Sustentação</strong>.
        Histórico apurado a partir de <strong style={{ color: 'var(--brand-muted)' }}>maio/2025</strong> (início do Minutor).
      </p>
      {!hasAny ? (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>Sem movimentação nos últimos 12 meses.</p>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 16, right: 24, left: 8, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(125,125,125,0.18)" vertical />
                <XAxis dataKey="label" tick={{ fill: 'var(--brand-subtle)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left"  orientation="left"  tick={{ fill: primary, fontSize: 11 }} tickLine={false} axisLine={false} label={{ value: 'Tickets', angle: -90, position: 'insideLeft', fill: primary, fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#A78BFA', fontSize: 11 }} tickLine={false} axisLine={false} label={{ value: 'Horas',   angle: 90,  position: 'insideRight', fill: '#A78BFA', fontSize: 11 }} tickFormatter={(v: number) => `${v}h`} />
                <RTooltip content={<EvolutionTooltip primary={primary} />} cursor={{ stroke: 'rgba(125,125,125,0.25)' }} />
                <Line yAxisId="right" type="monotone" dataKey="consumed_hours" stroke="#A78BFA" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--brand-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line yAxisId="left"  type="monotone" dataKey="tickets"        stroke={primary}  strokeWidth={2.5} dot={{ r: 4, fill: 'var(--brand-surface)', strokeWidth: 2, stroke: primary }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 text-[11px]">
            <span className="flex items-center gap-1.5" style={{ color: '#A78BFA' }}>
              <span className="w-3 h-0.5 rounded-full" style={{ background: '#A78BFA' }} />Horas consumidas
            </span>
            <span className="flex items-center gap-1.5" style={{ color: primary }}>
              <span className="w-3 h-0.5 rounded-full" style={{ background: primary }} />Tickets
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function HealthBar({ pct }: { pct: number | null }) {
  const p = pct ?? 0
  const color = pct === null ? 'var(--text-light)' : pct >= 90 ? 'var(--danger-border)' : pct >= 70 ? 'var(--warning-border)' : 'var(--success-border)'
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, p)}%`, background: color }} />
    </div>
  )
}

// Linha de projeto na árvore. Pai pode expandir/colapsar filhos; filho é
// indentado com prefixo └. Fechados não mostram saldo nem barra — só
// horas vendidas.
function ProjectTreeNode({
  project: p, isChild, isExpanded, onToggle, childExpanded, onToggleChild,
}: {
  project: ProjectHealth
  isChild: boolean
  isExpanded: boolean
  onToggle: () => void
  childExpanded: (id: number) => boolean
  onToggleChild: (id: number) => void
}) {
  const hasChildren = !isChild && (p.children?.length ?? 0) > 0
  // On Demand: sem banco/saldo — não mostra HealthBar, saldo nem chip de saúde.
  const isOnDemand = (p.contract_type ?? '').toLowerCase().includes('on demand')
  // Fechado: cliente NÃO vê horas (sem controle de saldo/consumo).
  const isClosed = p.is_closed || (p.contract_type ?? '').toLowerCase().includes('fechad')
  const meta = isClosed ? (HEALTH_META.closed ?? HEALTH_META[p.status]) : HEALTH_META[p.status]

  return (
    <>
      <li className={isChild ? 'px-5 py-3 flex items-center gap-3' : 'px-5 py-4 flex items-center gap-3'}>
        {isChild && <span className="ml-4 select-none" style={{ color: 'var(--text-light)' }}>└</span>}
        {!isChild && hasChildren && (
          <button onClick={onToggle} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }} aria-label={isExpanded ? 'Recolher' : 'Expandir'}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ display: 'inline-block', transition: 'transform 120ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
          </button>
        )}
        {!isChild && !hasChildren && <span className="w-7" />}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{p.code}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>{p.name}</span>
            {p.contract_type && (
              <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>· {p.contract_type}</span>
            )}
            {hasChildren && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" style={{ background: 'var(--primary-soft)', color: 'var(--brand-primary)' }}>
                {p.children!.length} {p.children!.length === 1 ? 'sub' : 'subs'}
              </span>
            )}
          </div>
          {!isClosed && !isOnDemand && <HealthBar pct={p.percentage} />}
        </div>

        <div className="text-right shrink-0">
          {isClosed ? (
            /* Cliente não vê horas em contrato Fechado — só o selo de status. */
            null
          ) : isOnDemand ? (
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--brand-text)' }}>
              {fmtH(p.consumed_hours)} consumido
            </p>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
                {fmtH(p.consumed_hours)} / {fmtH(p.sold_hours)}
              </p>
              {p.balance_hours !== null && (
                <p className="text-[11px] font-semibold mt-0.5" style={{
                  color: p.balance_hours < 0 ? '#EF4444' : p.balance_hours <= 0.1 * (p.sold_hours ?? 0) ? '#F59E0B' : '#10B981',
                }}>
                  Saldo: {fmtH(p.balance_hours)}
                </p>
              )}
            </>
          )}
          {isOnDemand ? (
            <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }}>
              On Demand
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{ background: meta.bg, color: meta.color }}>
              {meta.label}{!isClosed && p.percentage !== null && ` · ${p.percentage.toFixed(0)}%`}
            </span>
          )}
        </div>
      </li>
      {hasChildren && isExpanded && p.children!.map(c => (
        <ProjectTreeNode
          key={c.id}
          project={c}
          isChild
          isExpanded={childExpanded(c.id)}
          onToggle={() => onToggleChild(c.id)}
          childExpanded={childExpanded}
          onToggleChild={onToggleChild}
        />
      ))}
    </>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PortalClientePage() {
  const { user } = useAuth()
  const router = useRouter()

  const [summary, setSummary]     = useState<Summary | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const isCliente = user?.type === 'cliente'
  const isAdmin   = user?.type === 'admin'
  const isCoord   = user?.type === 'coordenador'
  const canPickCustomer = isAdmin || isCoord

  useEffect(() => {
    if (!user) return
    if (user.type === 'consultor' || (user.type === 'parceiro_admin' && !(user as any).is_executive)) {
      router.replace('/dashboard')
    }
  }, [user, router])

  // Carregar lista de clientes (admin/coord)
  useEffect(() => {
    if (!canPickCustomer) return
    api.get<CustomerOpt[]>('/client/portal/customers')
      .then(rows => {
        setCustomers(rows)
        if (rows.length && customerId === '') setCustomerId(rows[0].id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPickCustomer])

  // Carregar resumo
  useEffect(() => {
    if (!user) return
    const cid = isCliente ? user.customer_id : (customerId || null)
    if (!cid) { setSummary(null); setLoading(false); return }
    setLoading(true)
    setError(null)
    api.get<Summary>(`/client/portal/summary?customer_id=${cid}`)
      .then(d => setSummary(d))
      .catch((e: any) => setError(e?.message ?? 'Erro ao carregar resumo'))
      .finally(() => setLoading(false))
  }, [user, isCliente, customerId])

  const projetos = summary?.projects_health ?? []
  const projetosOrdenados = useMemo(() => {
    const order: Record<Health, number> = { critical: 0, warning: 1, ok: 2, unknown: 3, closed: 4 }
    return [...projetos].sort((a, b) => {
      const d = order[a.status] - order[b.status]
      if (d !== 0) return d
      return (b.percentage ?? -1) - (a.percentage ?? -1)
    })
  }, [projetos])

  return (
    <AppLayout title="Home">
      <div className="space-y-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--brand-primary)' }}>
              <Building2 size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>
                {summary?.customer.name ?? 'Home'}
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--brand-muted)' }}>
                Resumo executivo do cliente
              </p>
            </div>
          </div>

          {canPickCustomer && customers.length > 0 && (
            <div className="w-72">
              <SearchSelect
                value={customerId === '' ? '' : String(customerId)}
                onChange={v => setCustomerId(v === '' ? '' : Number(v))}
                options={customers}
                placeholder="Buscar cliente..."
              />
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl p-10 text-center text-sm" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
            Carregando…
          </div>
        )}

        {/* Erro */}
        {!loading && error && (
          <div className="rounded-2xl p-6 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {/* Sem cliente */}
        {!loading && !error && !summary && (
          <div className="rounded-2xl p-10 text-center text-sm" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
            Selecione um cliente para visualizar o resumo.
          </div>
        )}

        {/* Conteúdo */}
        {!loading && !error && summary && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PortalHeroCard
                icon={Headphones}
                label={`Tickets Abertos em ${summary.current_month_label}`}
                value={String(summary.open_tickets_current_month)}
                accent="amber"
              />
              <PortalHeroCard   icon={Briefcase}  label="Projetos"          value={String(summary.total_projects)} accent="primary" />
              <PortalHeroCard   icon={Clock}      label="Horas Contratadas" value={fmtH(summary.total_sold_hours)} accent="purple" />
            </div>

            {/* Evolução até mai/26 — meses anteriores aparecem zerados (real começa em mai/26) */}
            <MonthlyEvolution
              series={summary.monthly_series
                .filter(p => (p.month ?? '') <= '2026-05')
                .map(p => (p.month ?? '') < '2026-05' ? { ...p, tickets: 0, consumed_hours: 0 } : p)
              }
            />


            {/* Saúde dos projetos (não-Fechados) */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                <TrendingUp size={14} style={{ color: 'var(--brand-primary)' }} />
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-muted)' }}>Projetos</h2>
              </div>

              {projetosOrdenados.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                  Nenhum projeto cadastrado.
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
                  {projetosOrdenados.map(p => (
                    <ProjectTreeNode
                      key={p.id}
                      project={p}
                      isChild={false}
                      isExpanded={expanded.has(p.id)}
                      onToggle={() => toggle(p.id)}
                      childExpanded={(cid) => expanded.has(cid)}
                      onToggleChild={(cid) => toggle(cid)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
