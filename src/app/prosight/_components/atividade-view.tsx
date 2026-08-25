'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Atividade & Auditoria (C4.2) — visão TRANSVERSAL do Prosight. Read-model de
// timeline consolidando as famílias (Operações/Fontes/Publicações/Qualidade/
// Inventário) via adapters, SEM fundir storage e SEM virar fonte de verdade.
// Permission-aware: cada família só aparece para quem já tem acesso a ela.
// As telas especializadas (Mudanças, Auditoria, histórico da fonte, GMUD) seguem
// existindo como drill-down — esta é só a camada de consulta cruzada.
// 100% fixture (read-model); nada de backend/live nesta fase.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Boxes, ChevronDown, ChevronRight, Database, FileCode2,
  GitCommitHorizontal, Layers, Link2, RefreshCw, Search, ServerCog, ShieldCheck, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { useAuth } from '@/contexts/auth-context'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { getTimelineDataSource, timelineDataMode } from '@/lib/timeline/datasource'
import {
  AUTHORITY_META, CONFIDENCE_META, FAMILY_META, OUTCOME_META,
  type TimelineEvent, type TimelineFamily,
} from '@/lib/timeline/types'

type Role = 'admin' | 'coordenador' | 'operador'

// Gate por família (não eleva; espelha as permissões dos domínios).
const FAMILY_CAP: Record<TimelineFamily, (has: (p: string) => boolean, isAdmin: boolean) => boolean> = {
  operacoes: (h, a) => a || h('operacoes_protheus.view'),
  inventario: (_h, a) => a, // Inventário Git×RPO é admin-only (igual ao nav)
  fontes: (h, a) => a || h('source_docs.view') || h('source_docs.quality.view'),
  qualidade: (h, a) => a || h('source_docs.quality.view') || h('source_docs.view'),
  publicacoes: (h, a) => a || h('source_docs.gmud_publish'),
}

const FAMILY_ICON: Record<TimelineFamily, typeof Activity> = {
  operacoes: ServerCog, fontes: FileCode2, publicacoes: GitCommitHorizontal, qualidade: ShieldCheck, inventario: Boxes,
}

// Simula permissões no preview (dev-only) sem depender de backend.
function simulate(role: Role): { isAdmin: boolean; has: (p: string) => boolean } {
  if (role === 'admin') return { isAdmin: true, has: () => true }
  if (role === 'coordenador') { const s = new Set(['source_docs.view', 'source_docs.quality.view']); return { isAdmin: false, has: (p) => s.has(p) } }
  const s = new Set(['operacoes_protheus.view']); return { isAdmin: false, has: (p) => s.has(p) }
}

export function AtividadeView({ previewRole }: { previewRole?: Role }) {
  const auth = useAuth()
  const sim = previewRole ? simulate(previewRole) : null
  const isAdmin = sim ? sim.isAdmin : auth.user?.type === 'admin'
  const has = useCallback((p: string) => (sim ? sim.has(p) : auth.hasPermission(p)), [sim, auth])

  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [family, setFamily] = useState<'todos' | TimelineFamily>('todos')
  const [outcome, setOutcome] = useState('')
  const [scope, setScope] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const reload = useCallback(async () => {
    setState('loading')
    try { setEvents(await getTimelineDataSource().getEvents()); setState('ready') }
    catch { setEvents(null); setState('error') }
  }, [])
  useEffect(() => { void reload() }, [reload])

  // Famílias visíveis por permissão (não eleva).
  const visibleFamilies = useMemo(
    () => (Object.keys(FAMILY_META) as TimelineFamily[]).filter((f) => FAMILY_CAP[f](has, isAdmin)),
    [has, isAdmin],
  )

  const allowed = useMemo(() => (events ?? []).filter((e) => visibleFamilies.includes(e.family)), [events, visibleFamilies])
  const scopeOptions = useMemo(() => Array.from(new Set(allowed.map((e) => e.where))).sort(), [allowed])
  const byId = useMemo(() => Object.fromEntries((events ?? []).map((e) => [e.id, e])), [events])

  const filtered = useMemo(() => allowed.filter((e) => {
    if (family !== 'todos' && e.family !== family) return false
    if (outcome && e.outcome !== outcome) return false
    if (scope && e.where !== scope) return false
    if (from && (!e.occurredAt || new Date(e.occurredAt).getTime() < new Date(`${from}T00:00:00`).getTime())) return false
    if (to && (!e.occurredAt || new Date(e.occurredAt).getTime() > new Date(`${to}T23:59:59`).getTime())) return false
    const s = q.trim().toLowerCase()
    if (!s) return true
    return [e.title, e.where, e.actor, e.subtype, ...e.facets.map((f) => f.detail ?? '')].some((x) => (x ?? '').toString().toLowerCase().includes(s))
  }), [allowed, family, outcome, scope, from, to, q])

  return (
    <>
      <PageHeader icon={Activity} title="Atividade & Auditoria"
        subtitle="Linha do tempo transversal — o que aconteceu, onde, quando, resultado, quem, origem e relação entre eventos."
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void reload()} disabled={state === 'loading'}>Atualizar</Button>} />

      {timelineDataMode() === 'fixture' && (
        <div className="mb-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
          <Boxes size={14} /> Dados de demonstração (fixtures) — read-model montado por adapters; ainda não conectado à infraestrutura real.
        </div>
      )}
      <div className="mb-4 flex items-start gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info)' }}>
        <Link2 size={14} className="mt-px shrink-0" />
        <span>Visão de <b>consulta</b>. Não é fonte de verdade: cada evento mantém sua <b>origem e autoridade</b>. Mudanças, Auditoria, histórico da fonte e GMUD seguem como telas especializadas de drill-down.</span>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['todos', ...visibleFamilies] as const).map((f) => {
            const active = family === f
            return (
              <button key={f} onClick={() => setFamily(f)}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition"
                style={active ? { background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 600 } : { color: 'var(--text-muted)', fontWeight: 500, border: '1px solid var(--border)' }}>
                {f === 'todos' ? 'Todos' : FAMILY_META[f].short}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <DateRangePicker from={from} to={to} onChange={(fr, t) => { setFrom(fr); setTo(t) }} />
          {scopeOptions.length > 1 && (
            <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-48">
              <option value="">Todo escopo</option>
              {scopeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-40">
            <option value="">Qualquer resultado</option>
            {Object.entries(OUTCOME_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" icon={Search} className="w-56" />
        </div>
      </div>

      {state === 'loading' ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : state === 'error' ? (
        <Card><EmptyState icon={XCircle} title="Não foi possível carregar a atividade" description="Falha ao montar o read-model." action={<Button variant="primary" icon={RefreshCw} onClick={() => void reload()}>Tentar novamente</Button>} /></Card>
      ) : visibleFamilies.length === 0 ? (
        <Card><EmptyState icon={ShieldCheck} title="Sem acesso a domínios de atividade" description="Seu perfil não tem acesso a nenhuma família de eventos consolidável." /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Activity} title="Nenhum evento" description="Nada encontrado com esses filtros." /></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((e) => (
            <EventRow key={e.id} e={e} byId={byId} expanded={!!open[e.id]} onToggle={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))} />
          ))}
        </div>
      )}
    </>
  )
}

function EventRow({ e, byId, expanded, onToggle }: { e: TimelineEvent; byId: Record<string, TimelineEvent>; expanded: boolean; onToggle: () => void }) {
  const Icon = FAMILY_ICON[e.family]
  const oc = OUTCOME_META[e.outcome]
  const conf = CONFIDENCE_META[e.correlation.confidence]
  const authorities = Array.from(new Set(e.facets.map((f) => f.authority)))
  const related = e.correlation.relatedIds.map((id) => byId[id]).filter(Boolean)
  const hasDetail = e.facets.length > 1 || related.length > 0 || e.correlation.note || e.facets.some((f) => f.detail)

  return (
    <div className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left" disabled={!hasDetail}>
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--primary-soft)' }}>
          <Icon size={15} color="var(--primary)" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--text)' }}>{e.title}</span>
            <Badge variant="default">{FAMILY_META[e.family].short}</Badge>
            <Badge variant={oc.variant}>{oc.label}</Badge>
            {e.facets.length > 1 && <Badge variant={conf.variant}>{conf.label} · {e.facets.length} facetas</Badge>}
            {related.length > 0 && <Badge variant={conf.variant}><span className="inline-flex items-center gap-1"><Link2 size={11} />{related.length} relacionado(s)</span></Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-flex items-center gap-1"><Layers size={12} style={{ color: 'var(--text-light)' }} /> {e.where}</span>
            <span>{fmtDate(e.occurredAt)}</span>
            <span>{e.actor ? e.actor : <span style={{ color: 'var(--text-light)' }}>sem ator</span>}</span>
            {authorities.map((a) => <span key={a} className="inline-flex items-center gap-1"><Database size={11} style={{ color: 'var(--text-light)' }} /> {AUTHORITY_META[a].label}</span>)}
          </div>
        </div>
        {hasDetail && <div className="mt-1 shrink-0" style={{ color: 'var(--text-light)' }}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>}
      </button>

      {expanded && hasDetail && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          {/* Facetas (procedência preservada) */}
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Facetas (origem preservada)</div>
          <div className="flex flex-col gap-1.5">
            {e.facets.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-hover)' }}>
                <Badge variant="default">{f.kind}</Badge>
                <span style={{ color: 'var(--text-muted)' }}>origem: <b style={{ color: 'var(--text)' }}>{f.origin}</b></span>
                <span style={{ color: 'var(--text-muted)' }}>autoridade: <b style={{ color: 'var(--text)' }}>{AUTHORITY_META[f.authority].label}</b></span>
                <span style={{ color: 'var(--text-light)' }}>#{f.nativeId}</span>
                {f.detail && <span className="w-full" style={{ color: 'var(--text-muted)' }}>{f.detail}</span>}
              </div>
            ))}
          </div>

          {/* Correlação */}
          {(e.correlation.confidence !== 'none' || related.length > 0) && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
                Correlação <Badge variant={conf.variant}>{conf.label}</Badge>
              </div>
              {e.correlation.note && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.correlation.note}</p>}
              {related.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {related.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Link2 size={12} style={{ color: 'var(--primary)' }} /> {r.title} <Badge variant="default">{FAMILY_META[r.family].short}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}
