'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Clock, ClipboardCheck, Receipt } from 'lucide-react'
import { useApiQuery } from '@/hooks/use-query'
import { useProjectSchedule } from '@/hooks/use-project-schedule'
import { ActivityTimesheets } from '@/components/projects/activity-timesheets'
import { TimesheetHoverTooltip, useTimesheetHover } from '@/components/ui/timesheet-hover-tooltip'

// ─── tipos leves ──────────────────────────────────────────────────────────────
interface TSItem {
  id: number
  user?: { id: number; name: string } | null
  user_id: number
  date: string
  start_time?: string | null
  end_time?: string | null
  effort_minutes?: number | null
  status: string
  status_display?: string | null
  ticket?: string | null
  origin?: string | null
  is_internal_action?: boolean
  is_billable_only?: boolean
  observation?: string | null
  coordinator_label?: string | null
  customer?: { id?: number; name?: string } | null
  project?: { id?: number; name?: string; customer?: { name?: string; executive?: { name?: string } | null } | null } | null
  reviewed_by?: { name?: string } | number | null
  stage_id?: number | null
  stage_delivery_id?: number | null
}

type View = 'apontamentos' | 'aprovacoes' | 'despesas'
const VIEWS: View[] = ['apontamentos', 'aprovacoes', 'despesas']
function normalizeView(v: string | null): View {
  return (VIEWS as string[]).includes(String(v)) ? (v as View) : 'apontamentos'
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const fmtH = (h: number) => (h >= 100 ? `${Math.round(h)}h` : `${(Math.round(h * 10) / 10)}h`)
const fmtDate = (iso?: string | null) => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

// ─── mini KPI (padrão dos indicadores do cronograma) ────────────────────────────
function Kpi({ label, value, sub, tone = 'default' }: { label: string; value: string | number; sub?: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const c = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : tone === 'primary' ? 'var(--primary)' : 'var(--text)'
  return (
    <div style={{ flex: '1 1 0', minWidth: 110, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: c, lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{sub}</div>}
    </div>
  )
}

// ─── SegmentedControl (padrão do cronograma) ────────────────────────────────────
function Seg({ current, onChange }: { current: View; onChange: (v: View) => void }) {
  const items: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'apontamentos', label: 'Apontamentos', icon: <Clock size={13} /> },
    { id: 'aprovacoes', label: 'Aprovações', icon: <ClipboardCheck size={13} /> },
    { id: 'despesas', label: 'Despesas', icon: <Receipt size={13} /> },
  ]
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      {items.map(it => {
        const active = current === it.id
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)}
            className={active ? 'ds-tab-active' : 'ds-tab-inactive'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: active ? 600 : 500, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-muted)', boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}>
            {it.icon} {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── accordion de atividade (cabeçalho executivo + corpo lazy) ──────────────────
function ActivityAccordion({
  title, stageName, responsible, planned, apontadas, count, pending, headerRight, children, defaultOpen = false,
}: {
  title: string; stageName?: string; responsible?: string | null
  planned: number; apontadas: number; count: number; pending: number
  headerRight?: React.ReactNode; children: (open: boolean) => React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const saldo = planned - apontadas
  const pct = planned > 0 ? Math.min(100, (apontadas / planned) * 100) : 0
  const pctColor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={16} style={{ color: 'var(--text-light)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stageName && <span>{stageName}</span>}
            {responsible && <span>👤 {responsible}</span>}
          </div>
        </div>
        {/* resumo executivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: pctColor }}>{fmtH(apontadas)} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>/ {fmtH(planned)}</span></div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>saldo {fmtH(saldo)} · {Math.round(pct)}%</div>
          </div>
          <div style={{ width: 64, height: 6, background: 'var(--surface-hover)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pctColor }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span className="ds-status ds-status-info" style={{ fontSize: 11 }}>{count} apont.</span>
            {pending > 0 && <span className="ds-status ds-status-warning" style={{ fontSize: 11 }}>{pending} pend.</span>}
          </div>
          {headerRight}
        </div>
      </button>
      {open && <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--bg)' }}>{children(open)}</div>}
    </div>
  )
}

// ─── página ─────────────────────────────────────────────────────────────────────
export default function GestaoOperacionalPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = Number(params.id)
  const view = normalizeView(searchParams.get('view'))
  const setView = (v: View) => router.replace(`/projetos/${projectId}/gestao-operacional?view=${v}`)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <Seg current={view} onChange={setView} />
        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Visão contextual deste projeto — reflete nas telas globais.</span>
      </div>
      {view === 'apontamentos' && <ApontamentosView projectId={projectId} />}
      {view === 'aprovacoes' && <AprovacoesView projectId={projectId} />}
      {view === 'despesas' && <DespesasView projectId={projectId} />}
    </div>
  )
}

// ─── helpers de agrupamento + filtro ────────────────────────────────────────────
function useTimesheetsByActivity(projectId: number) {
  const { data, loading, refetch } = useApiQuery<{ items: TSItem[] }>(
    Number.isFinite(projectId) ? `/timesheets?project_id=${projectId}&pageSize=100&order=-date,-created_at` : null
  )
  const items = data?.items ?? []
  return { items, loading, refetch }
}

function withinRange(dateIso: string, range: 'todos' | 'hoje' | 'semana' | 'mes') {
  if (range === 'todos') return true
  const d = new Date(String(dateIso).slice(0, 10) + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  if (range === 'hoje') return d.getTime() === now.getTime()
  if (range === 'semana') { const wk = new Date(now); wk.setDate(now.getDate() - 6); return d >= wk && d <= now }
  const m = new Date(now.getFullYear(), now.getMonth(), 1); return d >= m
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary-soft)' : 'var(--surface)', color: active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
      {children}
    </button>
  )
}

// ─── tabela read-only de apontamentos (mesmo formato da tela global /approvals) ──
const hhmm = (t?: string | null) => t ? String(t).slice(0, 5) : '—'
const decH = (min?: number | null) => (n(min) / 60).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const TS_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Reprovado', adjustment_requested: 'Ajuste',
  conflicted: 'Conflito', internal: 'Ação Interna', released: 'Liberado', late: 'Atrasado',
}
function tsStatusCls(s: string): string {
  if (['approved', 'released'].includes(s)) return 'ds-status-success'
  if (s === 'rejected') return 'ds-status-danger'
  if (['pending', 'adjustment_requested', 'conflicted', 'late'].includes(s)) return 'ds-status-warning'
  return ''
}
function StatusPill({ status, display }: { status: string; display?: string | null }) {
  return <span className={`ds-status ${tsStatusCls(status)}`} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{display ?? TS_STATUS_LABEL[status] ?? status}</span>
}
const ORIGIN_LABEL: Record<string, string> = { manual: 'Manual', webhook: 'Webhook', integration: 'Integração', import: 'Importação' }
function OriginTag({ t }: { t: TSItem }) {
  if (t.is_internal_action) return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ação Interna</span>
  if (t.is_billable_only) return <span style={{ fontSize: 10, color: 'var(--warning)' }}>Apenas Fatura</span>
  return <span style={{ fontSize: 10, color: 'var(--text-light)' }}>{ORIGIN_LABEL[t.origin ?? ''] ?? (t.origin || '—')}</span>
}

const TH: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text)' }

function ApontamentosTable({ rows, hover }: { rows: TSItem[]; hover: ReturnType<typeof useTimesheetHover> }) {
  if (rows.length === 0) return <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>Nenhum apontamento nesta atividade.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Status', 'Colaborador', 'Data', 'Início', 'Fim', 'Tempo', 'Ticket #', 'Origem', 'Cliente'].map(c => (
              <th key={c} style={c === 'Tempo' ? { ...TH, textAlign: 'right' } : TH}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.id} {...hover.bind(t)}
              style={{ borderBottom: '1px solid var(--border)', cursor: 'default' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <td style={TD}><StatusPill status={t.status} display={t.status_display} /></td>
              <td style={{ ...TD, fontWeight: 500 }}>{t.user?.name ?? '—'}</td>
              <td style={TD}>{fmtDate(t.date)}</td>
              <td style={{ ...TD, color: 'var(--text-muted)' }}>{hhmm(t.start_time)}</td>
              <td style={{ ...TD, color: 'var(--text-muted)' }}>{hhmm(t.end_time)}</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{decH(t.effort_minutes)}</td>
              <td style={{ ...TD, color: 'var(--text-muted)' }}>{t.ticket ? `#${t.ticket}` : '—'}</td>
              <td style={TD}><OriginTag t={t} /></td>
              <td style={{ ...TD, color: 'var(--text-muted)' }}>{t.customer?.name ?? t.project?.customer?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── APONTAMENTOS ────────────────────────────────────────────────────────────────
function ApontamentosView({ projectId }: { projectId: number }) {
  const { stages, loading: schedLoading } = useProjectSchedule(projectId)
  const { items, loading: tsLoading } = useTimesheetsByActivity(projectId)

  const hover = useTimesheetHover()
  const [status, setStatus] = useState<'todos' | 'pending' | 'approved' | 'rejected'>('todos')
  const [range, setRange] = useState<'todos' | 'hoje' | 'semana' | 'mes'>('todos')
  const [consultor, setConsultor] = useState<number | 'todos'>('todos')

  const consultores = useMemo(() => {
    const map = new Map<number, string>()
    items.forEach(t => { if (t.user) map.set(t.user.id, t.user.name) })
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filtered = useMemo(() => items.filter(t => {
    if (status === 'pending' && !['pending', 'adjustment_requested'].includes(t.status)) return false
    if (status === 'approved' && !['approved', 'released'].includes(t.status)) return false
    if (status === 'rejected' && t.status !== 'rejected') return false
    if (!withinRange(t.date, range)) return false
    if (consultor !== 'todos' && t.user_id !== consultor) return false
    return true
  }), [items, status, range, consultor])

  // agregados por atividade (stage_delivery_id) + lista de apontamentos
  const byActivity = useMemo(() => {
    const g = new Map<number, { apontadas: number; count: number; pending: number; rows: TSItem[] }>()
    filtered.forEach(t => {
      if (!t.stage_delivery_id) return
      const cur = g.get(t.stage_delivery_id) ?? { apontadas: 0, count: 0, pending: 0, rows: [] }
      cur.apontadas += n(t.effort_minutes) / 60
      cur.count += 1
      if (['pending', 'adjustment_requested'].includes(t.status)) cur.pending += 1
      cur.rows.push(t)
      g.set(t.stage_delivery_id, cur)
    })
    return g
  }, [filtered])

  // indicadores do topo
  const ind = useMemo(() => {
    let apont = 0, aprov = 0, pend = 0, rej = 0
    filtered.forEach(t => {
      const h = n(t.effort_minutes) / 60
      apont += h
      if (['approved', 'released'].includes(t.status)) aprov += h
      else if (['pending', 'adjustment_requested'].includes(t.status)) pend += h
      else if (t.status === 'rejected') rej += h
    })
    return { apont, aprov, pend, rej, qtd: filtered.length }
  }, [filtered])

  const activities = useMemo(() => {
    const rows: { id: number; title: string; stageName: string; responsible?: { id: number; name: string } | null; planned: number; stageId: number }[] = []
    stages.forEach(s => (s.deliveries ?? []).forEach(d => rows.push({
      id: d.id, title: d.title, stageName: s.name, responsible: d.responsible ?? null, planned: n(d.hours_planned), stageId: d.stage_id,
    })))
    // sem apontamentos-órfãos (sem atividade): grupo separado
    return rows
  }, [stages])

  const orfaos = useMemo(() => filtered.filter(t => !t.stage_delivery_id), [filtered])
  const orfaosH = orfaos.reduce((s, t) => s + n(t.effort_minutes) / 60, 0)

  if (schedLoading || tsLoading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div>
      {/* Indicadores */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
        <Kpi label="Apontadas" value={fmtH(ind.apont)} />
        <Kpi label="Aprovadas" value={fmtH(ind.aprov)} tone="success" />
        <Kpi label="Pendentes" value={fmtH(ind.pend)} tone="warning" />
        <Kpi label="Reprovadas" value={fmtH(ind.rej)} tone="danger" />
        <Kpi label="Apontamentos" value={ind.qtd} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {(['todos', 'pending', 'approved', 'rejected'] as const).map(s => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === 'todos' ? 'Todos' : s === 'pending' ? 'Pendentes' : s === 'approved' ? 'Aprovados' : 'Reprovados'}
          </FilterChip>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
        {(['todos', 'hoje', 'semana', 'mes'] as const).map(r => (
          <FilterChip key={r} active={range === r} onClick={() => setRange(r)}>
            {r === 'todos' ? 'Sempre' : r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Semana' : 'Mês'}
          </FilterChip>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
        <select value={String(consultor)} onChange={e => setConsultor(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
          className="ds-input" style={{ fontSize: 12, padding: '4px 8px', maxWidth: 200 }}>
          <option value="todos">Todos os consultores</option>
          {consultores.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Accordions por atividade */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {activities.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Este projeto ainda não tem atividades no cronograma.</div>}
        {activities.map(a => {
          const agg = byActivity.get(a.id) ?? { apontadas: 0, count: 0, pending: 0, rows: [] }
          return (
            <ActivityAccordion key={a.id} title={a.title} stageName={a.stageName} responsible={a.responsible?.name}
              planned={a.planned} apontadas={agg.apontadas} count={agg.count} pending={agg.pending}>
              {() => <ApontamentosTable rows={agg.rows} hover={hover} />}
            </ActivityAccordion>
          )
        })}
        {orfaos.length > 0 && (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--warning)' }}>{orfaos.length}</strong> apontamento(s) sem atividade ({fmtH(orfaosH)}) — lançados antes do cronograma.
            </div>
            <ApontamentosTable rows={orfaos} hover={hover} />
          </div>
        )}
      </div>

      <TimesheetHoverTooltip ts={hover.ts} />
    </div>
  )
}

// ─── APROVAÇÕES (mesma estrutura, foco em pendentes) ────────────────────────────
function AprovacoesView({ projectId }: { projectId: number }) {
  const { stages, loading: schedLoading } = useProjectSchedule(projectId)
  const { items, loading: tsLoading, refetch } = useTimesheetsByActivity(projectId)

  const byActivity = useMemo(() => {
    const g = new Map<number, { pending: number; approved: number; rejected: number; apontadas: number; count: number }>()
    items.forEach(t => {
      if (!t.stage_delivery_id) return
      const cur = g.get(t.stage_delivery_id) ?? { pending: 0, approved: 0, rejected: 0, apontadas: 0, count: 0 }
      cur.count += 1; cur.apontadas += n(t.effort_minutes) / 60
      if (['pending', 'adjustment_requested'].includes(t.status)) cur.pending += 1
      else if (['approved', 'released'].includes(t.status)) cur.approved += 1
      else if (t.status === 'rejected') cur.rejected += 1
      g.set(t.stage_delivery_id, cur)
    })
    return g
  }, [items])

  const totalPend = useMemo(() => items.filter(t => ['pending', 'adjustment_requested'].includes(t.status)).length, [items])

  const activities = useMemo(() => {
    const rows: { id: number; title: string; stageName: string; responsible?: { id: number; name: string } | null; planned: number; stageId: number }[] = []
    stages.forEach(s => (s.deliveries ?? []).forEach(d => rows.push({
      id: d.id, title: d.title, stageName: s.name, responsible: d.responsible ?? null, planned: n(d.hours_planned), stageId: d.stage_id,
    })))
    return rows.filter(a => (byActivity.get(a.id)?.pending ?? 0) > 0)
  }, [stages, byActivity])

  if (schedLoading || tsLoading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Kpi label="Pendentes de aprovação" value={totalPend} tone={totalPend > 0 ? 'warning' : 'success'} />
      </div>
      {activities.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Nenhum apontamento pendente neste projeto. ✅</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activities.map(a => {
            const agg = byActivity.get(a.id)!
            return (
              <ActivityAccordion key={a.id} title={a.title} stageName={a.stageName} responsible={a.responsible?.name}
                planned={a.planned} apontadas={agg.apontadas} count={agg.count} pending={agg.pending} defaultOpen
                headerRight={<span className="ds-status ds-status-success" style={{ fontSize: 11 }}>{agg.approved} aprov.</span>}>
                {() => (
                  <ActivityTimesheets projectId={projectId} stageId={a.stageId} deliveryId={a.id}
                    responsible={a.responsible} previstas={a.planned}
                    showSummary={false} onChanged={refetch} />
                )}
              </ActivityAccordion>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── DESPESAS (projeto — atividade pendente de coluna no BE) ─────────────────────
function DespesasView({ projectId }: { projectId: number }) {
  const { data, loading } = useApiQuery<{ items: any[] }>(
    Number.isFinite(projectId) ? `/expenses?project_id=${projectId}&pageSize=100&order=-expense_date` : null
  )
  const items = data?.items ?? []
  const total = items.reduce((s, e) => s + n(e.amount), 0)
  const pend = items.filter(e => e.status === 'pending' || e.status === 'adjustment_requested')
  const aprov = items.filter(e => e.status === 'approved')
  const rej = items.filter(e => e.status === 'rejected')
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
        <Kpi label="Valor total" value={fmtBRL(total)} />
        <Kpi label="Quantidade" value={items.length} />
        <Kpi label="Pendentes" value={pend.length} tone={pend.length > 0 ? 'warning' : 'default'} />
        <Kpi label="Aprovadas" value={aprov.length} tone="success" />
        <Kpi label="Reprovadas" value={rej.length} tone={rej.length > 0 ? 'danger' : 'default'} />
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sem despesas neste projeto.</div>
        ) : items.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.user?.name ?? '—'} · {fmtDate(e.expense_date)}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(n(e.amount))}</span>
            <span className={`ds-status ${e.status === 'approved' ? 'ds-status-success' : e.status === 'rejected' ? 'ds-status-danger' : 'ds-status-warning'}`} style={{ fontSize: 11 }}>{e.status_display ?? e.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
