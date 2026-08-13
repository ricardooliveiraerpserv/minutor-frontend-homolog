'use client'

import { useState, type ReactNode } from 'react'
import { useApiQuery } from '@/hooks/use-query'
import { ClientActivityDrawer } from '@/components/portal-cliente/client-activity-drawer'
import { Lock, ChevronRight, ShieldQuestion, CalendarDays, CheckCircle2, ListChecks, Clock3, AlertTriangle, LayoutGrid } from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts'

/**
 * Cronograma na visão do CLIENTE — em dias, sem horas/valores.
 * 3 modos (espelham o interno, mas em dias): Planejamento (lista), Linha do
 * Tempo (Gantt) e Operação (kanban por status). Mesma fonte:
 * GET /client/projects/{id}/schedule.
 * - Vê a estrutura toda; só ABRE os cards com can_open (envolvido / aprovação /
 *   responsável). O resto fica com cadeado.
 */
interface ClientDelivery {
  id: number
  title: string
  status: string
  planned_start_at: string | null
  due_date: string | null
  completed_at: string | null
  duration_business_days: number | null
  duration_calendar_days: number | null
  non_business_days: number | null
  responsible_name: string | null
  depends_on_title: string | null
  can_open: boolean
  is_responsible: boolean
  awaiting_my_approval: boolean
  approval_status: string | null
}
interface ClientStage {
  id: number
  parent_stage_id: number | null
  name: string
  order_index: number
  start: string | null
  end: string | null
  duration_business_days: number | null
  duration_calendar_days: number | null
  non_business_days: number | null
  progress_pct: number
  deliveries: ClientDelivery[]
}
interface ScheduleResp { is_operational: boolean; stages: ClientStage[] }
type FlatDelivery = ClientDelivery & { stageName: string }
type View = 'planejamento' | 'timeline' | 'operacao' | 'indicadores'

/** Marca de legenda: o período (dias corridos) inclui dias não úteis (fim de semana/feriado). */
function NbMark({ n }: { n: number | null }) {
  if (!n || n <= 0) return null
  return (
    <sup title={`Inclui ${n} dia${n > 1 ? 's' : ''} não útil${n > 1 ? 'eis' : ''} — fim de semana/feriado`}
      style={{ color: 'var(--warning)', fontSize: 9, marginLeft: 1, cursor: 'help', fontWeight: 700 }}>●</sup>
  )
}
/** Dias corridos com fallback (compat). */
function diasLabel(d: { duration_calendar_days: number | null; duration_business_days: number | null }): string | null {
  const v = d.duration_calendar_days ?? d.duration_business_days
  return v != null ? `${v} dias` : null
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'A iniciar',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando você',
  review: 'Homologação',
  done: 'Concluída',
}
const STATUS_TONE: Record<string, string> = {
  backlog: 'var(--text-muted)',
  in_progress: 'var(--primary)',
  waiting_client: 'var(--warning)',
  review: 'var(--info)',
  done: 'var(--success)',
}
const KANBAN_COLS = ['backlog', 'in_progress', 'waiting_client', 'review', 'done']

const isDelLate = (d: { status: string; due_date: string | null }) => {
  if (d.status === 'done' || !d.due_date) return false
  const due = new Date(d.due_date + 'T23:59:59')
  return !isNaN(+due) && due.getTime() < Date.now()
}

function IndBadge({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 130, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-hover)', color, flexShrink: 0 }}>
        <Icon size={17} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  )
}

/* ---------- Indicadores (status-only, SEM horas/valores) — visual, com gráficos ----------
   Avanço por ATIVIDADE e PRAZO (não por horas): Planejado = atividades com prazo
   até a data; Real = atividades concluídas; SPI de prazo = Real% / Planejado%. */
const TOOLTIP_STYLE = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }

function ChartCard({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

function Indicadores({ stages }: { stages: ClientStage[] }) {
  const withDel = stages.filter(s => (s.deliveries?.length ?? 0) > 0)
  const flat = withDel.flatMap(s => s.deliveries)
  const total = flat.length
  const done = flat.filter(d => d.status === 'done').length
  const late = flat.filter(isDelLate).length
  const doing = flat.filter(d => d.status !== 'done' && !isDelLate(d) && d.status !== 'backlog').length
  const notStarted = flat.filter(d => d.status === 'backlog' && !isDelLate(d)).length
  const realPct = total ? Math.round((done / total) * 100) : 0
  const shouldBeDone = flat.filter(d => d.due_date && new Date(d.due_date + 'T23:59:59').getTime() <= Date.now()).length
  const plannedPct = total ? Math.round((shouldBeDone / total) * 100) : 0
  const spi = plannedPct > 0 ? (realPct / plannedPct) : (realPct > 0 ? 1 : null)
  const spiColor = spi == null ? 'var(--text-muted)' : spi >= 0.98 ? 'var(--success)' : spi >= 0.85 ? 'var(--warning)' : 'var(--danger)'
  const ritmo = spi == null ? '—' : spi >= 0.98 ? 'no ritmo esperado' : spi >= 0.85 ? 'levemente atrás' : 'atrasado'

  if (total === 0) {
    return <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13 }}>Sem atividades para calcular indicadores.</div>
  }

  const statusData = [
    { name: 'Concluídas', value: done, color: 'var(--success)' },
    { name: 'Em andamento', value: doing, color: 'var(--primary)' },
    { name: 'Atrasadas', value: late, color: 'var(--danger)' },
    { name: 'A iniciar', value: notStarted, color: 'var(--text-light)' },
  ].filter(d => d.value > 0)

  // Curva de avanço (planejado vs real acumulado), por mês, em % de atividades — sem horas.
  const times: number[] = []
  flat.forEach(d => { [d.planned_start_at, d.due_date, d.completed_at].forEach(x => { if (x) times.push(new Date(x + 'T00:00:00').getTime()) }) })
  const dues = flat.filter(d => d.due_date).map(d => new Date(d.due_date + 'T23:59:59').getTime())
  const dones = flat.filter(d => d.status === 'done').map(d => d.completed_at ? new Date(d.completed_at + 'T23:59:59').getTime() : Date.now())
  const curve: { label: string; planejado: number; real: number | null }[] = []
  if (times.length) {
    const cur = new Date(Math.min(...times)); cur.setDate(1); cur.setHours(0, 0, 0, 0)
    const end = new Date(Math.max(...times)); end.setDate(1); end.setHours(0, 0, 0, 0)
    let guard = 0
    while (cur.getTime() <= end.getTime() && guard++ < 240) {
      const meT = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59).getTime()
      curve.push({
        label: cur.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(cur.getFullYear()).slice(2),
        planejado: Math.round(dues.filter(t => t <= meT).length / total * 100),
        real: meT > Date.now() ? null : Math.round(dones.filter(t => t <= meT).length / total * 100),
      })
      cur.setMonth(cur.getMonth() + 1)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs compactos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <IndBadge icon={CheckCircle2}  label="Concluídas"   value={`${done}/${total}`} color="var(--success)" />
        <IndBadge icon={ListChecks}    label="Conclusão"    value={`${realPct}%`}      color="var(--primary)" />
        <IndBadge icon={CalendarDays}  label="SPI · Prazo"  value={spi == null ? '—' : spi.toFixed(2)} color={spiColor} />
        <IndBadge icon={Clock3}        label="Em andamento" value={String(doing)}      color="var(--primary)" />
        <IndBadge icon={AlertTriangle} label="Atrasadas"    value={String(late)}       color={late > 0 ? 'var(--danger)' : 'var(--text-muted)'} />
        <IndBadge icon={LayoutGrid}    label="Etapas"       value={String(withDel.length)} color="var(--text-muted)" />
      </div>

      {/* Donut de status + Curva de avanço */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <ChartCard title="Status das atividades">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={80} paddingAngle={2} stroke="none">
                    {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{realPct}%</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>concluído</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 120 }}>
              {statusData.map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ fontWeight: 600 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Avanço — Planejado vs Real" right={<span style={{ fontSize: 12, fontWeight: 600, color: spiColor }}>{ritmo}</span>}>
          <div style={{ height: 200, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="cli-real" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(125,125,125,0.16)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-light)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-light)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={40} />
                <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => [v == null ? '—' : `${v}%`, n === 'planejado' ? 'Planejado' : 'Real']} />
                <Area type="monotone" dataKey="planejado" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="4 3" fill="none" />
                <Area type="monotone" dataKey="real" stroke="var(--primary)" strokeWidth={2.5} fill="url(#cli-real)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed var(--text-muted)' }} />Planejado</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--primary)' }} />Real</span>
          </div>
        </ChartCard>
      </div>

      {/* Conclusão por etapa */}
      <ChartCard title="Conclusão por etapa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {withDel.map(s => {
            const c = stageColor(s.name)
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: '0 0 40%', maxWidth: 260, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <div style={{ flex: 1, height: 10, background: 'var(--surface-hover)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, s.progress_pct)}%`, background: c, transition: 'width .3s ease' }} />
                </div>
                <span style={{ flex: '0 0 42px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.progress_pct}%</span>
              </div>
            )
          })}
        </div>
      </ChartCard>
    </div>
  )
}

// Cor estável por etapa — evidencia a qual etapa cada card pertence no kanban único.
const STAGE_COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899', '#22c55e', '#6366f1', '#ef4444', '#06b6d4', '#84cc16']
function stageColor(name: string | null | undefined): string {
  const n = name ?? ''
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return STAGE_COLORS[h % STAGE_COLORS.length]
}

// Gantt (espelha o interno): px por dia + cor da barra por status.
type Zoom = 'day' | 'week' | 'biweek' | 'month'
const ZOOM_PX: Record<Zoom, number> = { day: 42, week: 22, biweek: 12, month: 6 }
const BAR_COLOR: Record<string, string> = {
  backlog: 'var(--text-muted)',
  in_progress: 'var(--primary)',
  waiting_client: 'var(--danger)',
  review: 'var(--warning)',
  done: 'var(--success)',
}
const ROW_H = 28
const HEADER_H = 40
const LABEL_W = 240

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}
function toDays(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z')
  return Number.isNaN(t) ? null : Math.floor(t / 86400000)
}

export function ClientSchedule({ projectId }: { projectId: number }) {
  const [view, setView] = useState<View>('planejamento')
  const [openActId, setOpenActId] = useState<number | null>(null)
  const { data, loading, error, refetch } = useApiQuery<ScheduleResp>(`/client/projects/${projectId}/schedule`)

  if (loading && !data) return <div style={{ color: 'var(--text-muted)' }}>Carregando cronograma…</div>
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!data || data.is_operational === false) {
    return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Este projeto não tem cronograma operacional.</div>
  }

  const stages = data.stages ?? []
  // Abre a conversa da atividade DENTRO do cronograma (drawer), sem navegar pra outra tela.
  const openCard = (d: ClientDelivery) => { if (d.can_open) setOpenActId(d.id) }
  const flat: FlatDelivery[] = stages.flatMap(s => s.deliveries.map(d => ({ ...d, stageName: s.name })))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <Segmented view={view} onChange={setView} />
      </div>

      {view !== 'indicadores' && (
        <div style={{
          marginBottom: 14, padding: '8px 12px', background: 'var(--primary-soft)', borderRadius: 6,
          fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <CalendarDays size={12} />
          <span>Cronograma do projeto em dias. Você abre as atividades em que está envolvido ou que aguardam a sua aprovação; as demais aparecem bloqueadas.</span>
        </div>
      )}

      <div key={view} className="cronograma-view-fade">
        {view === 'planejamento' && <Planejamento stages={stages} openCard={openCard} />}
        {view === 'timeline' && <Timeline stages={stages} openCard={openCard} />}
        {view === 'operacao' && <Operacao items={flat} openCard={openCard} />}
        {view === 'indicadores' && <Indicadores stages={stages} />}
      </div>
      <style jsx>{`
        .cronograma-view-fade { animation: cli-fade .14s ease-out; }
        @keyframes cli-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
      `}</style>

      <ClientActivityDrawer activityId={openActId} onClose={() => setOpenActId(null)} onChanged={refetch} />
    </div>
  )
}

function Segmented({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { value: View; label: string }[] = [
    { value: 'planejamento', label: 'Planejamento' },
    { value: 'timeline', label: 'Linha do Tempo' },
    { value: 'operacao', label: 'Operação' },
    { value: 'indicadores', label: 'Indicadores' },
  ]
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
      {opts.map((o, i) => {
        const active = view === o.value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: active ? 600 : 500,
              background: active ? 'var(--primary-soft)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              border: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function ApproveBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--warning)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 10, border: '1px solid var(--warning)' }}>
      <ShieldQuestion size={11} /> Aprovar
    </span>
  )
}
function LockOrChevron({ canOpen }: { canOpen: boolean }) {
  return canOpen
    ? <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    : <span title="Você não tem acesso a esta atividade" style={{ display: 'inline-flex', flexShrink: 0 }}><Lock size={13} style={{ color: 'var(--text-light)' }} /></span>
}

/* ---------- Planejamento (tabela read-only, mesmas colunas do interno, sem horas) ---------- */
type Row =
  | { kind: 'stage'; code: string; depth: number; stage: ClientStage }
  | { kind: 'activity'; code: string; depth: number; d: ClientDelivery }

/** Lista plana ordenada (etapa → atividades → sub-etapas) com numeração 1 / 1.1. */
function buildRows(stages: ClientStage[]): Row[] {
  const top = stages.filter(s => s.parent_stage_id == null).sort((a, b) => a.order_index - b.order_index)
  const childrenByParent = new Map<number, ClientStage[]>()
  for (const s of stages) if (s.parent_stage_id != null) {
    const a = childrenByParent.get(s.parent_stage_id) ?? []; a.push(s); childrenByParent.set(s.parent_stage_id, a)
  }
  const rows: Row[] = []
  const walk = (stage: ClientStage, code: string, depth: number) => {
    rows.push({ kind: 'stage', code, depth, stage })
    const acts = stage.deliveries
    acts.forEach((d, i) => rows.push({ kind: 'activity', code: `${code}.${i + 1}`, depth: depth + 1, d }))
    const subs = (childrenByParent.get(stage.id) ?? []).sort((a, b) => a.order_index - b.order_index)
    subs.forEach((sub, j) => walk(sub, `${code}.${acts.length + j + 1}`, depth + 1))
  }
  top.forEach((s, i) => walk(s, `${i + 1}`, 0))
  return rows
}

function Planejamento({ stages, openCard }: { stages: ClientStage[]; openCard: (d: ClientDelivery) => void }) {
  if (stages.length === 0) return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Cronograma ainda não montado.</div>

  const rows = buildRows(stages)

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '8px 10px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 12, color: 'var(--text)', padding: '8px 10px', verticalAlign: 'middle', borderTop: '1px solid var(--border)' }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr style={{ background: 'var(--surface)' }}>
            <th style={{ ...th, width: '34%' }}>Item</th>
            <th style={th}>Responsável</th>
            <th style={th}>Início</th>
            <th style={th}>Fim</th>
            <th style={{ ...th, textAlign: 'right' }}>Dias</th>
            <th style={th}>Depende de</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            if (r.kind === 'stage') {
              const s = r.stage
              return (
                <tr key={`s${s.id}`} style={{ background: 'var(--surface)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <span style={{ paddingLeft: r.depth * 18 }}>{r.code}. {s.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' }}>· {s.progress_pct}% concluído</span>
                  </td>
                  <td style={td}>—</td>
                  <td style={td}>{fmtDate(s.start)}</td>
                  <td style={td}>{fmtDate(s.end)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{diasLabel(s) ? <>{diasLabel(s)}<NbMark n={s.non_business_days} /></> : '—'}</td>
                  <td style={td}>—</td>
                </tr>
              )
            }
            const d = r.d
            const tone = STATUS_TONE[d.status] ?? 'var(--text-muted)'
            return (
              <tr key={`a${d.id}`} onClick={() => openCard(d)} className={d.can_open ? 'ds-row-hover' : undefined}
                style={{ cursor: d.can_open ? 'pointer' : 'default', background: d.awaiting_my_approval ? 'var(--warning-bg)' : undefined }}>
                <td style={{ ...td, opacity: d.can_open ? 1 : 0.6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: r.depth * 18 }}>
                    <LockOrChevron canOpen={d.can_open} />
                    <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.code}</span>
                    <span>{d.title}</span>
                    {d.awaiting_my_approval && <ApproveBadge />}
                    <span style={{ fontSize: 10, fontWeight: 600, color: tone }}>· {STATUS_LABEL[d.status] ?? d.status}</span>
                  </span>
                </td>
                <td style={{ ...td, color: d.responsible_name ? 'var(--text)' : 'var(--text-muted)' }}>{d.responsible_name ?? 'sem responsável'}</td>
                <td style={td}>{fmtDate(d.planned_start_at)}</td>
                <td style={td}>{fmtDate(d.due_date)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{diasLabel(d) ? <>{diasLabel(d)}<NbMark n={d.non_business_days} /></> : '—'}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{d.depends_on_title ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--warning)', fontWeight: 700 }}>●</span>
        Dias são corridos; a marca indica que o período cai em fim de semana/feriado.
      </div>
    </div>
  )
}

/* ---------- Operação (kanban por status, read-only) ---------- */
function Operacao({ items, openCard }: { items: FlatDelivery[]; openCard: (d: ClientDelivery) => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
      {KANBAN_COLS.map(col => {
        const cards = items.filter(d => d.status === col)
        const tone = STATUS_TONE[col] ?? 'var(--text-muted)'
        return (
          <div key={col} style={{ minWidth: 240, flex: '1 1 240px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: tone }}>{STATUS_LABEL[col]}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cards.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cards.map(d => {
                const sc = stageColor(d.stageName)
                return (
                <div key={d.id} onClick={() => openCard(d)} role={d.can_open ? 'button' : undefined}
                  className={d.can_open ? 'ds-row-hover' : undefined}
                  style={{
                    padding: '8px 10px 8px 10px', borderRadius: 6,
                    border: '1px solid var(--border)', borderLeft: `4px solid ${sc}`,
                    background: d.awaiting_my_approval ? 'var(--warning-bg)' : 'var(--bg)',
                    cursor: d.can_open ? 'pointer' : 'default', opacity: d.can_open ? 1 : 0.62,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LockOrChevron canOpen={d.can_open} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    {d.awaiting_my_approval && <ApproveBadge />}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: sc, marginTop: 4 }}>{d.stageName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{fmtDate(d.planned_start_at)} – {fmtDate(d.due_date)}</div>
                </div>
                )
              })}
              {cards.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center', padding: 8 }}>—</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Linha do Tempo (Gantt read-only, espelha o interno, em dias) ---------- */
function Timeline({ stages, openCard }: { stages: ClientStage[]; openCard: (d: ClientDelivery) => void }) {
  const [zoom, setZoom] = useState<Zoom>('biweek')
  const rows = buildRows(stages)

  const dated = rows.flatMap(r => r.kind === 'activity' && r.d.planned_start_at && r.d.due_date ? [r.d] : [])
  if (dated.length === 0) return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Sem datas para montar a linha do tempo.</div>

  const minStart = Math.min(...dated.map(d => toDays(d.planned_start_at)!))
  const maxEnd = Math.max(...dated.map(d => toDays(d.due_date)!))
  const winStart = minStart - 7
  const winEnd = maxEnd + 7
  const totalDays = Math.max(1, winEnd - winStart + 1)
  const dayWidth = ZOOM_PX[zoom]
  const widthPx = totalDays * dayWidth

  // marcadores de mês
  const months: { offsetPx: number; label: string }[] = []
  const d0 = new Date(winStart * 86400000)
  const cur = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1))
  while (Math.floor(cur.getTime() / 86400000) <= winEnd) {
    const dd = Math.floor(cur.getTime() / 86400000)
    if (dd >= winStart) months.push({ offsetPx: (dd - winStart) * dayWidth, label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }) })
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }

  // hoje
  const today = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 86400000)
  const todayOffset = (today - winStart) * dayWidth
  const todayVisible = today >= winStart && today <= winEnd

  // fim de semana (epoch day 0 = quinta = 4)
  const w = (((winStart % 7) + 4) % 7 + 7) % 7 // 0=Dom..6=Sáb
  const daysToSat = (6 - w + 7) % 7
  const weekendOffsetPx = (daysToSat - 5) * dayWidth

  const ZOOMS: { v: Zoom; label: string }[] = [
    { v: 'day', label: 'Dia' }, { v: 'week', label: 'Semana' }, { v: 'biweek', label: '2 sem' }, { v: 'month', label: 'Mês' },
  ]

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* toolbar zoom */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Linha do tempo · {totalDays} dias</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {ZOOMS.map((z, i) => (
            <button key={z.v} type="button" onClick={() => setZoom(z.v)}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: zoom === z.v ? 600 : 500, background: zoom === z.v ? 'var(--primary-soft)' : 'transparent', color: zoom === z.v ? 'var(--primary)' : 'var(--text-muted)', border: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* sidebar de itens */}
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ height: HEADER_H, borderBottom: '1px solid var(--border)' }} />
          {rows.map(r => {
            if (r.kind === 'stage') {
              return (
                <div key={`s${r.stage.id}`} style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, fontWeight: 700, color: 'var(--text)', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ paddingLeft: r.depth * 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.code}. {r.stage.name}</span>
                </div>
              )
            }
            const d = r.d
            return (
              <div key={`a${d.id}`} onClick={() => openCard(d)} className={d.can_open ? 'ds-row-hover' : undefined}
                style={{ height: ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--border)', cursor: d.can_open ? 'pointer' : 'default', opacity: d.can_open ? 1 : 0.6, paddingLeft: r.depth * 12 + 10 }}>
                <LockOrChevron canOpen={d.can_open} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
              </div>
            )
          })}
        </div>

        {/* timeline scrollável */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <div style={{ position: 'relative', width: widthPx, minWidth: '100%' }}>
            {/* header de meses */}
            <div style={{ position: 'relative', height: HEADER_H, borderBottom: '1px solid var(--border)' }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: 'absolute', left: m.offsetPx, top: 0, height: HEADER_H, borderLeft: '1px solid var(--border)', paddingLeft: 4, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.label}</div>
              ))}
              {todayVisible && (
                <div style={{ position: 'absolute', left: todayOffset - 16, bottom: 2, fontSize: 9, fontWeight: 700, color: 'var(--primary)' }}>hoje</div>
              )}
            </div>

            {/* corpo: sombreado de fim de semana + gridlines de mês + hoje + barras */}
            <div style={{
              position: 'relative', minHeight: rows.length * ROW_H,
              backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${5 * dayWidth}px, var(--surface-hover) ${5 * dayWidth}px, var(--surface-hover) ${7 * dayWidth}px)`,
              backgroundSize: `${7 * dayWidth}px 100%`,
              backgroundPositionX: `${weekendOffsetPx}px`,
            }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: 'absolute', left: m.offsetPx, top: 0, bottom: 0, borderLeft: '1px solid var(--border)', opacity: 0.5 }} />
              ))}
              {todayVisible && (
                <div style={{ position: 'absolute', left: todayOffset, top: 0, bottom: 0, borderLeft: '2px solid var(--primary)', opacity: 0.7 }} />
              )}

              {rows.map((r, idx) => {
                const top = idx * ROW_H
                if (r.kind === 'stage') {
                  const s = r.stage
                  const ss = toDays(s.start), se = toDays(s.end)
                  return (
                    <div key={`sr${s.id}`} style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H, borderBottom: '1px solid var(--border)' }}>
                      {ss != null && se != null && (
                        <div style={{ position: 'absolute', left: (ss - winStart) * dayWidth, width: Math.max(2, (se - ss + 1) * dayWidth), top: ROW_H / 2 - 2, height: 4, background: 'var(--text-muted)', opacity: 0.35, borderRadius: 2 }} />
                      )}
                    </div>
                  )
                }
                const d = r.d
                const s = toDays(d.planned_start_at)!, e = toDays(d.due_date)!
                const left = (s - winStart) * dayWidth
                const width = Math.max(dayWidth * 0.8, (e - s + 1) * dayWidth)
                const color = d.awaiting_my_approval ? 'var(--warning)' : (BAR_COLOR[d.status] ?? 'var(--text-muted)')
                return (
                  <div key={`ar${d.id}`} style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H, borderBottom: '1px solid var(--border)' }}>
                    <div title={`${fmtDate(d.planned_start_at)} – ${fmtDate(d.due_date)} · ${(d.duration_calendar_days ?? d.duration_business_days) ?? '—'} dia(s) corridos${d.non_business_days ? ` (inclui ${d.non_business_days} não útil)` : ''}`}
                      onClick={() => openCard(d)}
                      style={{
                        position: 'absolute', left, width, top: ROW_H / 2 - 8, height: 16, borderRadius: 4,
                        background: color, opacity: d.status === 'done' ? 0.5 : 0.9,
                        cursor: d.can_open ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden',
                        border: d.awaiting_my_approval ? '1px solid var(--warning)' : 'none',
                      }}>
                      <span style={{ fontSize: 10, color: '#fff', whiteSpace: 'nowrap' }}>{(d.duration_calendar_days ?? d.duration_business_days) != null ? `${d.duration_calendar_days ?? d.duration_business_days}d` : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
