'use client'

import { useMemo, type ReactNode } from 'react'
import { Activity, CalendarClock, ListChecks, AlertTriangle, TrendingUp, Clock, Gauge } from 'lucide-react'
import type { ExecutiveSummary, ScheduleStage, TeamLoadItem } from '@/hooks/use-project-schedule'

type ProjectInfo = {
  name: string
  sold_hours: number
  coordination_hours?: number | string | null
  start_date: string | null
  expected_end_date: string | null
} | null

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const fmtH = (n: number) => { const v = num(n); return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h` }
const pctText = (n: number) => `${Math.round(num(n))}%`
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const parseDay = (s?: string | null) => { if (!s) return null; const d = new Date(s); if (isNaN(+d)) return null; d.setHours(0, 0, 0, 0); return d }

/** Painel de indicadores (saúde) do projeto — visão de coordenação, tudo em horas. */
export function IndicadoresView({ project, stages, executive, teamLoad = [] }: {
  project: ProjectInfo
  stages: ScheduleStage[]
  executive?: ExecutiveSummary | null
  teamLoad?: TeamLoadItem[]
}) {
  const ex = executive

  // ── Atividades: buckets p/ a rosca ──
  const acts = useMemo(() => {
    const total = ex?.total_deliveries ?? 0
    const done = ex?.done_deliveries ?? 0
    const andamento = (ex?.in_progress_count ?? 0) + (ex?.review_count ?? 0) + (ex?.blocked_count ?? 0) + (ex?.waiting_client_count ?? 0)
    const naoIniciada = Math.max(0, total - done - andamento)
    return { total, done, andamento, naoIniciada }
  }, [ex])

  // ── Horas atrasadas por consultor (atividade vencida e não concluída) ──
  const overdueByUser = useMemo(() => {
    const t = today0()
    const map = new Map<number, number>()
    for (const s of stages) {
      for (const d of s.deliveries ?? []) {
        if (!d.responsible_user_id || d.status === 'done') continue
        const due = parseDay(d.due_date)
        if (due && due < t) map.set(d.responsible_user_id, (map.get(d.responsible_user_id) ?? 0) + num(d.hours_planned))
      }
    }
    return map
  }, [stages])

  // ── Prazo: % planejado (tempo decorrido) × % real (progresso) ──
  const prazo = useMemo(() => {
    const start = parseDay(project?.start_date)
    const end = parseDay(project?.expected_end_date ?? ex?.planned_end_date ?? null)
    let plan = 0
    if (start && end && end > start) {
      const total = +end - +start
      const elapsed = +today0() - +start
      plan = Math.max(0, Math.min(100, (elapsed / total) * 100))
    } else if (start && end && +end === +start) {
      plan = 100
    }
    const real = num(ex?.progress_pct)
    return { plan, real, delta: real - plan }
  }, [project, ex])

  // ── Custo em HORAS: consumidas × planejadas × contratadas ──
  const horas = useMemo(() => {
    const consumidas = num(ex?.hours_consumed ?? ex?.hours_actual)
    const planejadas = num(ex?.hours_planned)
    const contratadas = num(project?.sold_hours)
    return { consumidas, planejadas, contratadas, max: Math.max(consumidas, planejadas, contratadas, 1) }
  }, [ex, project])

  // ── Progresso por etapa (topo) ──
  const etapas = useMemo(
    () => stages.filter(s => s.parent_stage_id == null).map(s => ({ id: s.id, name: s.name, pct: num(s.progress_pct) })),
    [stages],
  )

  if (!ex) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 24 }}>Sem dados de indicadores para este projeto.</div>
  }

  const aConcluir = Math.max(0, (ex.total_deliveries ?? 0) - (ex.done_deliveries ?? 0))
  const riscoLabel = ex.overall_risk === 'high' ? 'Alto' : ex.overall_risk === 'medium' ? 'Médio' : 'Baixo'
  const riscoTone = ex.overall_risk === 'high' ? 'danger' : ex.overall_risk === 'medium' ? 'warning' : 'success'
  const prazoTxt = (ex.end_date_delta_days ?? 0) < 0
    ? `${Math.abs(ex.end_date_delta_days!)}d adiantado`
    : (ex.end_date_delta_days ?? 0) > 0 ? `${ex.end_date_delta_days}d atrasado` : 'No prazo'
  const prazoTone = (ex.end_date_delta_days ?? 0) > 0 ? 'danger' : (ex.end_date_delta_days ?? 0) < 0 ? 'success' : 'text'

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>

      {/* 1. Indicadores de saúde */}
      <Card title="Indicadores de saúde" icon={<Gauge size={14} />}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <HealthRow icon={<CalendarClock size={13} />} label="Prazo" value={prazoTxt} tone={prazoTone} />
          <HealthRow icon={<ListChecks size={13} />} label="Atividades" value={`${aConcluir} a concluir`} />
          <HealthRow icon={<AlertTriangle size={13} />} label="Atrasadas" value={`${ex.overdue_count ?? 0} atividade${(ex.overdue_count ?? 0) === 1 ? '' : 's'}`} tone={(ex.overdue_count ?? 0) > 0 ? 'danger' : 'success'} />
          <HealthRow icon={<TrendingUp size={13} />} label="Progresso" value={`${pctText(ex.progress_pct)} concluído`} />
          <HealthRow icon={<Clock size={13} />} label="Horas" value={`${fmtH(horas.consumidas)} de ${fmtH(horas.planejadas)}`} />
          <HealthRow icon={<Activity size={13} />} label="Risco" value={riscoLabel} tone={riscoTone} last />
        </div>
      </Card>

      {/* 2. Atividades (rosca) */}
      <Card title="Atividades" icon={<Activity size={14} />}>
        <ActivitiesDonut done={acts.done} andamento={acts.andamento} naoIniciada={acts.naoIniciada} total={acts.total} />
      </Card>

      {/* 3. Volume de trabalho por pessoa */}
      <Card title="Volume por consultor" icon={<ListChecks size={14} />}>
        {teamLoad.length === 0
          ? <Empty>Nenhum consultor com atividade.</Empty>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Legend items={[['Concluído', 'var(--success)'], ['Restante', 'var(--text-light)'], ['Atrasado', 'var(--danger)']]} />
              {teamLoad.map(t => {
                const overdue = overdueByUser.get(t.user.id) ?? 0
                const done = num(t.actual_hours)
                const remaining = Math.max(0, num(t.remaining_hours))
                const totalH = Math.max(done + remaining, 1)
                return (
                  <div key={t.user.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t.user.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtH(done)} / {fmtH(done + remaining)}{overdue > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {fmtH(overdue)} atrasadas</span>}
                      </span>
                    </div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-hover)' }}>
                      <span style={{ width: `${(done / totalH) * 100}%`, background: 'var(--success)' }} />
                      <span style={{ width: `${(remaining / totalH) * 100}%`, background: 'var(--text-light)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </Card>

      {/* 4. Prazo (planejado × real) */}
      <Card title="Prazo" icon={<CalendarClock size={14} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricBar label="Planejado (tempo)" pct={prazo.plan} color="var(--text-light)" />
          <MetricBar label="Real (progresso)" pct={prazo.real} color={prazo.delta >= 0 ? 'var(--success)' : 'var(--warning)'} />
          <div style={{ fontSize: 12, color: prazo.delta >= 0 ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
            {prazo.delta >= 0
              ? `Adiantado ${Math.round(prazo.delta)} p.p. em relação ao planejado`
              : `Atrasado ${Math.round(Math.abs(prazo.delta))} p.p. em relação ao planejado`}
          </div>
        </div>
      </Card>

      {/* 5. Horas (consumidas × planejadas × contratadas) */}
      <Card title="Horas" icon={<Clock size={14} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricBar label="Consumidas" pct={(horas.consumidas / horas.max) * 100} valueText={fmtH(horas.consumidas)} color="var(--primary)" />
          <MetricBar label="Planejadas" pct={(horas.planejadas / horas.max) * 100} valueText={fmtH(horas.planejadas)} color="var(--warning)" />
          <MetricBar label="Contratadas" pct={(horas.contratadas / horas.max) * 100} valueText={fmtH(horas.contratadas)} color="var(--success)" />
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {horas.planejadas > 0 && `${pctText((horas.consumidas / horas.planejadas) * 100)} das horas planejadas já consumidas.`}
          </div>
        </div>
      </Card>

      {/* 6. Progresso por etapa */}
      <Card title="Progresso por etapa" icon={<TrendingUp size={14} />}>
        {etapas.length === 0
          ? <Empty>Sem etapas cadastradas.</Empty>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {etapas.map(e => (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 44px', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, e.pct)}%`, background: e.pct >= 100 ? 'var(--success)' : 'var(--primary)', borderRadius: 4 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{pctText(e.pct)}</span>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}

// ── Blocos auxiliares ──────────────────────────────────────────────────────
function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--primary)' }}>
        {icon}
        <strong style={{ fontSize: 13, color: 'var(--text)' }}>{title}</strong>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  )
}

function HealthRow({ icon, label, value, tone = 'text', last }: { icon: ReactNode; label: string; value: string; tone?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-light)', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', width: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: `var(--${tone})`, marginLeft: 'auto' }}>{value}</span>
    </div>
  )
}

function ActivitiesDonut({ done, andamento, naoIniciada, total }: { done: number; andamento: number; naoIniciada: number; total: number }) {
  const t = Math.max(total, 1)
  const dDone = (done / t) * 360
  const dAnd = (andamento / t) * 360
  const gradient = `conic-gradient(var(--success) 0 ${dDone}deg, var(--primary) ${dDone}deg ${dDone + dAnd}deg, var(--text-light) ${dDone + dAnd}deg 360deg)`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 120, height: 120, borderRadius: '50%', background: gradient, flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 18, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>atividades</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5 }}>
        <DonutLegend color="var(--success)" label="Concluídas" n={done} />
        <DonutLegend color="var(--primary)" label="Em andamento" n={andamento} />
        <DonutLegend color="var(--text-light)" label="Não iniciadas" n={naoIniciada} />
      </div>
    </div>
  )
}

function DonutLegend({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <strong style={{ marginLeft: 'auto', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{n}</strong>
    </div>
  )
}

function MetricBar({ label, pct, valueText, color }: { label: string; pct: number; valueText?: string; color: string }) {
  const p = Math.max(0, Math.min(100, num(pct)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{valueText ?? pctText(pct)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${p}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />{label}
        </span>
      ))}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ color: 'var(--text-muted)', fontSize: 12.5, padding: '6px 2px' }}>{children}</div>
}
