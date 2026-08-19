'use client'

import { useMemo, type ReactNode } from 'react'
import {
  CalendarClock, Clock, Users, ListChecks, Activity, TrendingUp, History, AlertTriangle,
  ShieldCheck, Lock, UserCheck,
} from 'lucide-react'
import type { ExecutiveSummary, ScheduleStage, TeamLoadItem } from '@/hooks/use-project-schedule'
import type { StageDelivery } from '@/lib/types/project-stage'

type ProjectInfo = {
  name: string
  sold_hours: number
  start_date: string | null
  expected_end_date: string | null
} | null

type Tone = 'success' | 'warning' | 'danger' | 'neutral'
const toneColor = (t: Tone) => t === 'success' ? 'var(--success)' : t === 'warning' ? 'var(--warning)' : t === 'danger' ? 'var(--danger)' : 'var(--text-light)'
const toneDot = (t: Tone) => t === 'success' ? '🟢' : t === 'warning' ? '🟡' : t === 'danger' ? '🔴' : '⚪'

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const fmtH = (n: number) => { const v = num(n); return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h` }
const pctText = (n: number) => `${Math.round(num(n))}%`
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const parseDay = (s?: string | null) => { if (!s) return null; const d = new Date(s); if (isNaN(+d)) return null; d.setHours(0, 0, 0, 0); return d }
const parseDT = (s?: string | null) => { if (!s) return null; const d = new Date(s); return isNaN(+d) ? null : d }
const fmtDDMM = (s?: string | null) => { const d = parseDay(s); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '—' }
function fmtEvent(s: string): string {
  const d = parseDT(s); if (!d) return ''
  const t0 = today0(); const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  const diff = Math.round((+t0 - +dd) / 86400000)
  const hasTime = /\d{2}:\d{2}/.test(s)
  const hm = hasTime ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  if (diff === 0) return `Hoje${hm}`
  if (diff === 1) return `Ontem${hm}`
  return `${fmtDDMM(s)}${hm}`
}
const timeElapsedPct = (start?: string | null, end?: string | null) => {
  const s = parseDay(start), e = parseDay(end)
  if (s && e && e > s) return clamp(((+today0() - +s) / (+e - +s)) * 100)
  if (s && e && +e <= +today0()) return 100
  return 0
}

/** Dashboard executivo do projeto — operacional (sem financeiro), variedade analítica de gráficos. */
export function IndicadoresView({ project, stages, executive, teamLoad = [] }: {
  project: ProjectInfo
  stages: ScheduleStage[]
  executive?: ExecutiveSummary | null
  teamLoad?: TeamLoadItem[]
}) {
  const ex = executive
  const allDeliveries = useMemo<StageDelivery[]>(() => stages.flatMap(s => s.deliveries ?? []), [stages])

  const horas = useMemo(() => {
    const consumidas = num(ex?.hours_consumed ?? ex?.hours_actual)
    const planejadas = num(ex?.hours_planned)
    // Horas APONTÁVEIS (pool liberado à gestão) — nunca a base comercial "Vendidas".
    const coord = num((project as any)?.coordination_hours)
    const contratadas = coord > 0 ? coord : num(project?.sold_hours)
    const base = contratadas > 0 ? contratadas : planejadas
    const saldo = num(ex?.hours_balance ?? (base - consumidas))
    const pct = base > 0 ? (consumidas / base) * 100 : 0
    const expectedSaldo = base - consumidas
    const saldoDiverge = Math.abs(saldo - expectedSaldo) > 0.5
    return { consumidas, planejadas, contratadas, saldo, pct, base, saldoDiverge }
  }, [ex, project])

  const pendCliente = useMemo(
    () => allDeliveries.filter(d => d.approval_status === 'pending' || d.approval_status === 'changes_requested').length,
    [allDeliveries],
  )
  const overloaded = useMemo(() => teamLoad.filter(t => t.overloaded).length, [teamLoad])

  // ── Saúde (matriz semafórica) ──
  const dims = useMemo(() => {
    const delta = num(ex?.end_date_delta_days)
    const overdue = ex?.overdue_count ?? 0
    const blocked = ex?.blocked_count ?? 0
    return [
      { key: 'Cronograma', tone: (delta > 0 ? 'danger' : overdue > 0 ? 'warning' : 'success') as Tone, text: delta > 0 ? `${delta}d atrasado` : overdue > 0 ? `${overdue} atrasada${overdue === 1 ? '' : 's'}` : delta < 0 ? `${Math.abs(delta)}d adiantado` : 'No prazo' },
      { key: 'Horas', tone: (horas.pct > 100 ? 'danger' : horas.pct >= 85 ? 'warning' : 'success') as Tone, text: `${pctText(horas.pct)} consumidas` },
      { key: 'Atividades', tone: (blocked > 0 ? 'warning' : 'success') as Tone, text: blocked > 0 ? `${blocked} bloqueada${blocked === 1 ? '' : 's'}` : 'Sem bloqueios' },
      { key: 'Equipe', tone: (overloaded > 0 ? 'warning' : 'success') as Tone, text: overloaded > 0 ? `${overloaded} sobrecarregado${overloaded === 1 ? '' : 's'}` : 'Equilibrada' },
      { key: 'Cliente', tone: (pendCliente > 0 ? 'warning' : 'success') as Tone, text: pendCliente > 0 ? `${pendCliente} pendência${pendCliente === 1 ? '' : 's'}` : 'Sem pendências' },
    ]
  }, [ex, horas, overloaded, pendCliente])
  const geral: Tone = useMemo(() => {
    if (!ex) return 'neutral'
    if (dims.some(d => d.tone === 'danger')) return 'danger'
    if (dims.some(d => d.tone === 'warning')) return 'warning'
    return 'success'
  }, [ex, dims])
  const statusLabel = geral === 'success' ? 'Saudável' : geral === 'warning' ? 'Atenção' : geral === 'danger' ? 'Crítico' : '—'

  // ── Atividades (rosca) ──
  const acts = useMemo(() => {
    const total = ex?.total_deliveries ?? 0
    const done = ex?.done_deliveries ?? 0
    const andamento = (ex?.in_progress_count ?? 0) + (ex?.review_count ?? 0) + (ex?.waiting_client_count ?? 0)
    const blocked = ex?.blocked_count ?? 0
    const naoIniciada = Math.max(0, total - done - andamento - blocked)
    return { total, done, andamento, blocked, naoIniciada, atrasadas: ex?.overdue_count ?? 0 }
  }, [ex])

  // ── Cronograma (bullet) ──
  const crono = useMemo(() => {
    const plan = timeElapsedPct(project?.start_date, project?.expected_end_date ?? ex?.planned_end_date ?? null)
    const exec = num(ex?.progress_pct)
    return { plan, exec, delta: exec - plan }
  }, [project, ex])

  // ── Evolução por etapa (barra + marcador planejado) ──
  const etapas = useMemo(() => {
    const childrenOf = new Map<number, ScheduleStage[]>()
    for (const s of stages) { const p = s.parent_stage_id ?? 0; if (!childrenOf.has(p)) childrenOf.set(p, []); childrenOf.get(p)!.push(s) }
    const subtree = (root: ScheduleStage): ScheduleStage[] => {
      const out = [root]; for (const k of childrenOf.get(root.id) ?? []) out.push(...subtree(k)); return out
    }
    return stages.filter(s => s.parent_stage_id == null).map(s => {
      const nodes = subtree(s)
      let planned = 0, consumed = 0; const dates: string[] = []
      for (const n of nodes) for (const d of n.deliveries ?? []) {
        planned += num(d.hours_planned); consumed += num(d.effort_minutes_sum) / 60
        if (d.planned_start_at) dates.push(d.planned_start_at); if (d.due_date) dates.push(d.due_date)
      }
      const sorted = dates.filter(Boolean).sort()
      const planMarker = timeElapsedPct(sorted[0], sorted[sorted.length - 1])
      const pct = num(s.progress_pct)
      const tone: Tone = pct >= 100 ? 'success' : pct >= planMarker - 5 ? 'warning' : 'danger'
      return { id: s.id, name: s.name, resp: s.responsible?.name ?? '—', planned, consumed, pct, planMarker, tone, dueDate: sorted[sorted.length - 1] ?? null }
    })
  }, [stages])

  // ── Atividade recente (timeline) ──
  const recent = useMemo(() => {
    type Ev = { at: string; icon: 'done' | 'approve'; text: string }
    const evs: Ev[] = []
    for (const d of allDeliveries) {
      if (d.status === 'done' && d.completed_at) evs.push({ at: d.completed_at, icon: 'done', text: `${d.responsible?.name ? d.responsible.name + ' concluiu' : 'Concluída'} “${d.title}”` })
      if (d.approval_status === 'approved' && d.approval_decided_at) evs.push({ at: d.approval_decided_at, icon: 'approve', text: `Cliente aprovou “${d.title}”` })
    }
    return evs.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5)
  }, [allDeliveries])
  const lastUpdate = recent[0]?.at ?? allDeliveries.map(d => d.updated_at).filter(Boolean).sort().slice(-1)[0] ?? null

  // ── Alertas (mini-cards por severidade) ──
  const alertas = useMemo(() => {
    const t = today0(); const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1)
    const list: { cat: string; icon: ReactNode; msg: string; tone: Tone }[] = []
    if (horas.pct >= 90) list.push({ cat: 'Horas', icon: <Clock size={13} />, msg: `${pctText(horas.pct)} das horas consumidas`, tone: horas.pct > 100 ? 'danger' : 'warning' })
    const venceAmanha = allDeliveries.filter(d => d.status !== 'done' && parseDay(d.due_date)?.getTime() === +tomorrow).length
    if (venceAmanha > 0) list.push({ cat: 'Prazo', icon: <CalendarClock size={13} />, msg: `${venceAmanha} atividade${venceAmanha === 1 ? '' : 's'} vence${venceAmanha === 1 ? '' : 'm'} amanhã`, tone: 'warning' })
    if ((ex?.overdue_count ?? 0) > 0) list.push({ cat: 'Prazo', icon: <AlertTriangle size={13} />, msg: `${ex!.overdue_count} atividade${ex!.overdue_count === 1 ? '' : 's'} atrasada${ex!.overdue_count === 1 ? '' : 's'}`, tone: 'danger' })
    if ((ex?.blocked_count ?? 0) > 0) list.push({ cat: 'Bloqueio', icon: <Lock size={13} />, msg: `${ex!.blocked_count} atividade${ex!.blocked_count === 1 ? '' : 's'} bloqueada${ex!.blocked_count === 1 ? '' : 's'}`, tone: 'danger' })
    if (pendCliente > 0) list.push({ cat: 'Cliente', icon: <UserCheck size={13} />, msg: `${pendCliente} aprovaç${pendCliente === 1 ? 'ão' : 'ões'} pendente${pendCliente === 1 ? '' : 's'}`, tone: 'warning' })
    if (overloaded > 0) list.push({ cat: 'Equipe', icon: <Users size={13} />, msg: `${overloaded} consultor${overloaded === 1 ? '' : 'es'} acima da capacidade`, tone: 'warning' })
    return list
  }, [horas, allDeliveries, ex, pendCliente, overloaded])

  if (!ex) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 24 }}>Sem dados de indicadores para este projeto.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── FAIXA EXECUTIVA (barra fina) ── */}
      <div className="ds-card" style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-muted)' }}>
          <strong style={{ fontSize: 14, color: 'var(--text)' }}>{project?.name ?? 'Projeto'}</strong>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: toneColor(geral) }}>{toneDot(geral)} {statusLabel}</span>
          <Sep /> {dims[0].text}
          <Sep /> {fmtH(horas.consumidas)}/{fmtH(horas.contratadas || horas.planejadas)} · saldo {fmtH(horas.saldo)}
          <Sep /> {alertas.length > 0 ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠ {alertas.length}</span> : 'sem alertas'}
          {lastUpdate && <><Sep /> atualizado {fmtEvent(lastUpdate)}</>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-hover)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${clamp(num(ex.progress_pct))}%`, background: toneColor(geral === 'neutral' ? 'success' : geral), borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{pctText(ex.progress_pct)}</span>
        </div>
      </div>

      {/* ── LINHA 1 ── */}
      <Row min={280}>
        {/* Saúde — matriz semafórica */}
        <Card title="Saúde do Projeto" icon={<Activity size={14} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 8 }}>
            {dims.map(d => (
              <div key={d.key} title={d.text} style={{ padding: '8px 6px', borderRadius: 8, border: `1px solid ${toneColor(d.tone)}`, background: d.tone === 'neutral' ? 'var(--surface-hover)' : `var(--${d.tone}-bg)`, textAlign: 'center' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: toneColor(d.tone), margin: '0 auto 5px' }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{d.key}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.2 }}>{d.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12 }}>{toneDot(geral)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Risco geral</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: toneColor(geral) }}>{statusLabel}</span>
          </div>
        </Card>

        {/* Atividades — rosca */}
        <Card title="Atividades" icon={<ListChecks size={14} />}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Donut total={acts.total} segments={[
              { v: acts.done, c: 'var(--success)' },
              { v: acts.andamento, c: 'var(--primary)' },
              { v: acts.blocked, c: 'var(--danger)' },
              { v: acts.naoIniciada, c: 'var(--text-light)' },
            ]} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, flex: 1, minWidth: 130 }}>
              <LegendRow c="var(--success)" label="Concluídas" n={acts.done} total={acts.total} />
              <LegendRow c="var(--primary)" label="Em andamento" n={acts.andamento} total={acts.total} />
              <LegendRow c="var(--danger)" label="Bloqueadas" n={acts.blocked} total={acts.total} />
              <LegendRow c="var(--text-light)" label="Não iniciadas" n={acts.naoIniciada} total={acts.total} />
            </div>
          </div>
          {acts.atrasadas > 0 && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '6px 10px' }}>
              <AlertTriangle size={13} /> {acts.atrasadas} atrasada{acts.atrasadas === 1 ? '' : 's'}
            </div>
          )}
        </Card>

        {/* Carga da equipe — barras empilhadas (realizado/saldo/excedente), % individual */}
        <Card title="Carga da equipe" icon={<Users size={14} />}>
          {teamLoad.length === 0 ? <Empty>Nenhum consultor com atividade.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Legend items={[['Realizado', 'var(--success)'], ['Saldo', 'var(--text-light)'], ['Excedente', 'var(--danger)']]} />
              {teamLoad.map(t => {
                const planned = num(t.planned_hours); const actual = num(t.actual_hours)
                const pct = planned > 0 ? (actual / planned) * 100 : 0            // consumo INDIVIDUAL
                const saldo = Math.max(0, planned - actual)
                const exced = Math.max(0, actual - planned)
                const scaleBase = Math.max(planned, actual, 1)
                const done = Math.min(actual, planned)
                const tone: Tone = exced > 0 ? 'danger' : pct >= 85 ? 'warning' : 'success'
                return (
                  <div key={t.user.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t.user.name}</span>
                      <span style={{ color: toneColor(tone), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pctText(pct)}</span>
                    </div>
                    <div style={{ display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', background: 'var(--surface-hover)' }}>
                      <span style={{ width: `${(done / scaleBase) * 100}%`, background: 'var(--success)' }} />
                      <span style={{ width: `${(saldo / scaleBase) * 100}%`, background: 'var(--text-light)' }} />
                      <span style={{ width: `${(exced / scaleBase) * 100}%`, background: 'var(--danger)' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtH(actual)} de {fmtH(planned)}{saldo > 0 ? ` · saldo ${fmtH(saldo)}` : exced > 0 ? ` · excedente ${fmtH(exced)}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </Row>

      {/* ── LINHA 2 ── */}
      <Row min={320}>
        {/* Cronograma — bullet chart */}
        <Card title="Cronograma" icon={<CalendarClock size={14} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative', height: 26 }}>
              {/* trilho */}
              <div style={{ position: 'absolute', inset: '9px 0', borderRadius: 4, background: 'var(--surface-hover)' }} />
              {/* faixa até o planejado (contexto) */}
              <div style={{ position: 'absolute', top: 9, bottom: 9, left: 0, width: `${clamp(crono.plan)}%`, borderRadius: '4px 0 0 4px', background: 'var(--surface-sunken)' }} />
              {/* barra do executado */}
              <div style={{ position: 'absolute', top: 6, bottom: 6, left: 0, width: `${clamp(crono.exec)}%`, borderRadius: 4, background: crono.delta >= 0 ? 'var(--success)' : 'var(--warning)' }} />
              {/* marcador do planejado */}
              <div title={`Planejado (tempo): ${pctText(crono.plan)}`} style={{ position: 'absolute', top: 1, bottom: 1, left: `calc(${clamp(crono.plan)}% - 1px)`, width: 3, background: 'var(--text)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Executado <b style={{ color: 'var(--text)' }}>{pctText(crono.exec)}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>Planejado <b style={{ color: 'var(--text)' }}>{pctText(crono.plan)}</b> <span style={{ color: 'var(--text-light)' }}>(marcador ▏)</span></span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: crono.delta >= 1 ? 'var(--success)' : crono.delta <= -1 ? 'var(--warning)' : 'var(--text-muted)' }}>
              {Math.abs(Math.round(crono.delta))} p.p. · {crono.delta > 1 ? 'ADIANTADO' : crono.delta < -1 ? 'ATRASADO' : 'NO PRAZO'}
            </div>
          </div>
        </Card>

        {/* Horas — gauge semicircular */}
        <Card title="Horas" icon={<Clock size={14} />}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Gauge pct={horas.pct} centerTop={pctText(horas.pct)} centerBottom={`${fmtH(horas.consumidas)}/${fmtH(horas.contratadas || horas.planejadas)}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 }}>
              <KV label="Apontáveis" value={fmtH(horas.contratadas)} />
              <KV label="Planejadas" value={fmtH(horas.planejadas)} />
              <KV label="Consumidas" value={fmtH(horas.consumidas)} />
              <KV label="Saldo" value={fmtH(horas.saldo)} strong tone={horas.saldo < 0 ? 'danger' : 'success'} />
            </div>
          </div>
          {horas.saldoDiverge && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-hover)', borderRadius: 6, padding: '5px 8px' }}>
              ℹ️ O saldo difere de “apontáveis − consumidas” — inclui aportes/ajustes lançados no projeto.
            </div>
          )}
        </Card>
      </Row>

      {/* ── LINHA 3: Evolução por etapa (barra + marcador planejado) ── */}
      <Card title="Evolução por etapa" icon={<TrendingUp size={14} />}>
        {etapas.length === 0 ? <Empty>Sem etapas cadastradas.</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-light)' }}>▏ = onde a etapa deveria estar pelo tempo (planejado)</div>
            {etapas.map(e => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 46px', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{e.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.resp} · {fmtDDMM(e.dueDate)} · {fmtH(e.consumed)}/{fmtH(e.planned)}</span>
                  </div>
                  <div style={{ position: 'relative', height: 9, borderRadius: 5, background: 'var(--surface-hover)', overflow: 'visible' }}>
                    <span style={{ display: 'block', height: '100%', width: `${clamp(e.pct)}%`, background: toneColor(e.tone), borderRadius: 5 }} />
                    <span title={`Planejado: ${pctText(e.planMarker)}`} style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${clamp(e.planMarker)}% - 1px)`, width: 2, background: 'var(--text)', borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {toneDot(e.tone)} {pctText(e.pct)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── LINHA 4 ── */}
      <Row min={320}>
        {/* Atividade recente — timeline vertical */}
        <Card title="Atividade recente" icon={<History size={14} />}>
          {recent.length === 0 ? <Empty>Nenhuma movimentação recente identificada.</Empty> : (
            <div style={{ position: 'relative', paddingLeft: 4 }}>
              <div style={{ position: 'absolute', left: 10, top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recent.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: 'var(--surface)', border: `2px solid ${e.icon === 'approve' ? 'var(--success)' : 'var(--primary)'}`, zIndex: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-light)' }}>{fmtEvent(e.at)}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{e.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Alertas — mini-cards por severidade */}
        <Card title="Alertas" icon={<AlertTriangle size={14} />}>
          {alertas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 7 }}><ShieldCheck size={14} /> Nenhum alerta no momento.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ borderLeft: `3px solid ${toneColor(a.tone)}`, background: `var(--${a.tone}-bg)`, borderRadius: '4px 8px 8px 4px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: toneColor(a.tone) }}>
                    {a.icon} {a.cat}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 3 }}>{a.msg}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Row>
    </div>
  )
}

// ── Gráficos / auxiliares ────────────────────────────────────────────────────
function Row({ children, min }: { children: ReactNode; min: number }) {
  return <div style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, alignItems: 'start' }}>{children}</div>
}
function Sep() { return <span style={{ color: 'var(--border)' }}>·</span> }

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--primary)' }}>
        {icon}<strong style={{ fontSize: 12.5, color: 'var(--text)' }}>{title}</strong>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  )
}

/** Rosca (donut) SVG multi-segmento. Circunferência ≈ 100 (r=15.915). */
function Donut({ total, segments }: { total: number; segments: { v: number; c: string }[] }) {
  const t = Math.max(total, 1)
  let offset = 25 // começa no topo
  return (
    <div style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-0deg)' }}>
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--surface-hover)" strokeWidth="4" />
        {segments.map((s, i) => {
          const pct = (s.v / t) * 100
          if (pct <= 0) return null
          const el = <circle key={i} cx="18" cy="18" r="15.915" fill="none" stroke={s.c} strokeWidth="4"
            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} strokeLinecap="butt" />
          offset -= pct
          return el
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>atividades</div>
        </div>
      </div>
    </div>
  )
}

/** Gauge semicircular SVG (0–100%). */
function Gauge({ pct, centerTop, centerBottom }: { pct: number; centerTop: string; centerBottom: string }) {
  const p = clamp(num(pct))
  const R = 25, LEN = Math.PI * R // comprimento do semicírculo
  const color = p > 100 ? 'var(--danger)' : p >= 85 ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ position: 'relative', width: 132, height: 82, flexShrink: 0 }}>
      <svg viewBox="0 0 60 34" style={{ width: '100%' }}>
        <path d="M 5 30 A 25 25 0 0 1 55 30" fill="none" stroke="var(--surface-hover)" strokeWidth="6" strokeLinecap="round" />
        <path d="M 5 30 A 25 25 0 0 1 55 30" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(clamp(p, 0, 100) / 100) * LEN} ${LEN}`} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{centerTop}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{centerBottom}</div>
      </div>
    </div>
  )
}

function LegendRow({ c, label, n, total }: { c: string; label: string; n: number; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ color: 'var(--text-light)', width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
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

function KV({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: Tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, color: tone ? toneColor(tone) : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ color: 'var(--text-muted)', fontSize: 12.5, padding: '6px 2px' }}>{children}</div>
}
