'use client'

import { useMemo, type ReactNode } from 'react'
import {
  CalendarClock, Clock, Users, ListChecks, Activity, TrendingUp, History, AlertTriangle, ShieldCheck,
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

/** Dashboard executivo do projeto — visão de coordenação, operacional (sem financeiro). */
export function IndicadoresView({ project, stages, executive, teamLoad = [] }: {
  project: ProjectInfo
  stages: ScheduleStage[]
  executive?: ExecutiveSummary | null
  teamLoad?: TeamLoadItem[]
}) {
  const ex = executive
  const allDeliveries = useMemo<StageDelivery[]>(() => stages.flatMap(s => s.deliveries ?? []), [stages])

  // ── Horas ──
  const horas = useMemo(() => {
    const consumidas = num(ex?.hours_consumed ?? ex?.hours_actual)
    const planejadas = num(ex?.hours_planned)
    const contratadas = num(project?.sold_hours)
    const base = contratadas > 0 ? contratadas : planejadas
    const saldo = num(ex?.hours_balance ?? (base - consumidas))
    const pct = base > 0 ? (consumidas / base) * 100 : 0
    return { consumidas, planejadas, contratadas, saldo, pct, max: Math.max(consumidas, planejadas, contratadas, 1) }
  }, [ex, project])

  // ── Aprovações pendentes do cliente ──
  const pendCliente = useMemo(
    () => allDeliveries.filter(d => d.approval_status === 'pending' || d.approval_status === 'changes_requested').length,
    [allDeliveries],
  )
  const overloaded = useMemo(() => teamLoad.filter(t => t.overloaded).length, [teamLoad])

  // ── Dimensões da Saúde (só com dado confiável) ──
  const dims = useMemo(() => {
    const delta = num(ex?.end_date_delta_days)
    const overdue = ex?.overdue_count ?? 0
    const blocked = ex?.blocked_count ?? 0
    const list: { label: string; tone: Tone; text: string }[] = [
      {
        label: 'Cronograma',
        tone: delta > 0 ? 'danger' : overdue > 0 ? 'warning' : 'success',
        text: delta > 0 ? `${delta}d atrasado` : overdue > 0 ? `${overdue} atrasada${overdue === 1 ? '' : 's'}` : delta < 0 ? `${Math.abs(delta)}d adiantado` : 'No prazo',
      },
      {
        label: 'Horas',
        tone: horas.pct > 100 ? 'danger' : horas.pct >= 85 ? 'warning' : 'success',
        text: `${pctText(horas.pct)} consumidas`,
      },
      {
        label: 'Atividades',
        tone: blocked > 0 ? 'warning' : 'success',
        text: blocked > 0 ? `${blocked} bloqueada${blocked === 1 ? '' : 's'}` : 'Sem bloqueios',
      },
      {
        label: 'Equipe',
        tone: overloaded > 0 ? 'warning' : 'success',
        text: overloaded > 0 ? `${overloaded} sobrecarregado${overloaded === 1 ? '' : 's'}` : 'Carga equilibrada',
      },
      {
        label: 'Cliente',
        tone: pendCliente > 0 ? 'warning' : 'success',
        text: pendCliente > 0 ? `${pendCliente} pendência${pendCliente === 1 ? '' : 's'}` : 'Sem pendências',
      },
    ]
    return list
  }, [ex, horas, overloaded, pendCliente])

  // ── Risco geral derivado das dimensões ──
  const geral: Tone = useMemo(() => {
    if (!ex) return 'neutral'
    if (dims.some(d => d.tone === 'danger')) return 'danger'
    if (dims.some(d => d.tone === 'warning')) return 'warning'
    return 'success'
  }, [ex, dims])
  const statusLabel = geral === 'success' ? 'Saudável' : geral === 'warning' ? 'Atenção' : geral === 'danger' ? 'Crítico' : '—'

  // ── Atividades (5 estados) ──
  const acts = useMemo(() => {
    const total = ex?.total_deliveries ?? 0
    const done = ex?.done_deliveries ?? 0
    const andamento = (ex?.in_progress_count ?? 0) + (ex?.review_count ?? 0) + (ex?.waiting_client_count ?? 0)
    const blocked = ex?.blocked_count ?? 0
    const naoIniciada = Math.max(0, total - done - andamento - blocked)
    return { total: Math.max(total, 1), rawTotal: total, done, andamento, blocked, naoIniciada, atrasadas: ex?.overdue_count ?? 0 }
  }, [ex])

  // ── Cronograma planejado (tempo) × executado (progresso) ──
  const crono = useMemo(() => {
    const start = parseDay(project?.start_date)
    const end = parseDay(project?.expected_end_date ?? ex?.planned_end_date ?? null)
    let plan = 0
    if (start && end && end > start) plan = Math.max(0, Math.min(100, ((+today0() - +start) / (+end - +start)) * 100))
    else if (start && end && +end <= +today0()) plan = 100
    const exec = num(ex?.progress_pct)
    return { plan, exec, delta: exec - plan }
  }, [project, ex])

  // ── Evolução por etapa (subtree p/ horas planejadas/consumidas) ──
  const etapas = useMemo(() => {
    const childrenOf = new Map<number, ScheduleStage[]>()
    for (const s of stages) { const p = s.parent_stage_id ?? 0; (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(s) }
    const subtree = (root: ScheduleStage): ScheduleStage[] => {
      const out = [root]; const kids = childrenOf.get(root.id) ?? []
      for (const k of kids) out.push(...subtree(k))
      return out
    }
    return stages.filter(s => s.parent_stage_id == null).map(s => {
      const nodes = subtree(s)
      let planned = 0, consumed = 0
      for (const n of nodes) for (const d of n.deliveries ?? []) { planned += num(d.hours_planned); consumed += num(d.effort_minutes_sum) / 60 }
      const pct = num(s.progress_pct)
      const tone: Tone = pct >= 100 ? 'success' : pct >= 60 ? 'warning' : pct > 0 ? 'danger' : 'neutral'
      return { id: s.id, name: s.name, resp: s.responsible?.name ?? '—', due: s.deliveries?.length ? null : null, planned, consumed, pct, tone,
        dueDate: nodes.flatMap(n => (n.deliveries ?? []).map(d => d.due_date)).filter(Boolean).sort().slice(-1)[0] ?? null }
    })
  }, [stages])

  // ── Atividade recente (só eventos com data + tipo reais) ──
  const recent = useMemo(() => {
    type Ev = { at: string; icon: 'done' | 'approve'; text: string }
    const evs: Ev[] = []
    for (const d of allDeliveries) {
      if (d.status === 'done' && d.completed_at) {
        evs.push({ at: d.completed_at, icon: 'done', text: `${d.responsible?.name ? d.responsible.name + ' concluiu' : 'Concluída'} “${d.title}”` })
      }
      if (d.approval_status === 'approved' && d.approval_decided_at) {
        evs.push({ at: d.approval_decided_at, icon: 'approve', text: `Cliente aprovou “${d.title}”` })
      }
    }
    return evs.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5)
  }, [allDeliveries])
  const lastUpdate = recent[0]?.at ?? allDeliveries.map(d => d.updated_at).filter(Boolean).sort().slice(-1)[0] ?? null

  // ── Alertas derivados (só o que exige ação) ──
  const alertas = useMemo(() => {
    const t = today0(); const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1)
    const list: string[] = []
    if (horas.pct >= 90) list.push(`${pctText(horas.pct)} das horas contratadas já consumidas`)
    const venceAmanha = allDeliveries.filter(d => d.status !== 'done' && parseDay(d.due_date)?.getTime() === +tomorrow).length
    if (venceAmanha > 0) list.push(`${venceAmanha} atividade${venceAmanha === 1 ? '' : 's'} vence${venceAmanha === 1 ? '' : 'm'} amanhã`)
    if ((ex?.overdue_count ?? 0) > 0) list.push(`${ex!.overdue_count} atividade${ex!.overdue_count === 1 ? '' : 's'} atrasada${ex!.overdue_count === 1 ? '' : 's'}`)
    if ((ex?.blocked_count ?? 0) > 0) list.push(`${ex!.blocked_count} atividade${ex!.blocked_count === 1 ? '' : 's'} bloqueada${ex!.blocked_count === 1 ? '' : 's'}`)
    if (pendCliente > 0) list.push(`${pendCliente} aprovaç${pendCliente === 1 ? 'ão' : 'ões'} pendente${pendCliente === 1 ? '' : 's'} do cliente`)
    if (overloaded > 0) list.push(`${overloaded} consultor${overloaded === 1 ? '' : 'es'} acima da capacidade`)
    return list
  }, [horas, allDeliveries, ex, pendCliente, overloaded])

  if (!ex) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 24 }}>Sem dados de indicadores para este projeto.</div>
  }

  const aConcluir = Math.max(0, acts.rawTotal - acts.done)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── FAIXA EXECUTIVA (2 camadas) ── */}
      <div className="ds-card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16, color: 'var(--text)', letterSpacing: '-.01em' }}>{project?.name ?? 'Projeto'}</strong>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: toneColor(geral), padding: '3px 10px', borderRadius: 999, background: geral === 'neutral' ? 'var(--surface-hover)' : `var(--${geral}-bg)`, border: `1px solid ${toneColor(geral)}` }}>
            <ShieldCheck size={13} /> {statusLabel.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 10, borderRadius: 6, background: 'var(--surface-hover)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.min(100, num(ex.progress_pct))}%`, background: toneColor(geral === 'neutral' ? 'success' : geral), borderRadius: 6, transition: 'width .3s ease' }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' }}>{pctText(ex.progress_pct)}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ color: 'var(--text)', fontWeight: 600 }}>{dims[0].text}</b>
          <Sep /> {fmtH(horas.consumidas)} de {fmtH(horas.contratadas || horas.planejadas)} <Sep /> Saldo {fmtH(horas.saldo)}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-light)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {alertas.length > 0
            ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠ {alertas.length} alerta{alertas.length === 1 ? '' : 's'}</span>
            : <span>Sem alertas</span>}
          {lastUpdate && <><Sep /> Atualizado {fmtEvent(lastUpdate)}</>}
        </div>
      </div>

      {/* ── LINHA 1: Saúde · Atividades · Equipe ── */}
      <Row min={280}>
        <Card title="Saúde do Projeto" icon={<Activity size={14} />}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {dims.map(d => <SaudeRow key={d.label} label={d.label} tone={d.tone} text={d.text} />)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 2px', marginTop: 4, borderTop: '2px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{toneDot(geral)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Risco geral</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: toneColor(geral) }}>{statusLabel}</span>
            </div>
          </div>
        </Card>

        <Card title="Atividades" icon={<ListChecks size={14} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <ActBar label="Concluídas" n={acts.done} total={acts.total} color="var(--success)" />
            <ActBar label="Em andamento" n={acts.andamento} total={acts.total} color="var(--primary)" />
            <ActBar label="Bloqueadas" n={acts.blocked} total={acts.total} color="var(--danger)" />
            <ActBar label="Não iniciadas" n={acts.naoIniciada} total={acts.total} color="var(--text-light)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 6, marginTop: 2, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Atrasadas</span>
              <span style={{ fontWeight: 700, color: acts.atrasadas > 0 ? 'var(--danger)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{acts.atrasadas}</span>
            </div>
          </div>
        </Card>

        <Card title="Carga da equipe" icon={<Users size={14} />}>
          {teamLoad.length === 0 ? <Empty>Nenhum consultor com atividade.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {teamLoad.map(t => {
                const planned = num(t.planned_hours); const done = num(t.actual_hours)
                const saldo = num(t.remaining_hours); const pct = num(t.usage_pct)
                const tone: Tone = t.overloaded || pct > 100 ? 'danger' : pct >= 85 ? 'warning' : 'success'
                const sit = tone === 'danger' ? 'excedido' : tone === 'warning' ? 'atenção' : 'normal'
                return (
                  <div key={t.user.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t.user.name}</span>
                      <span style={{ color: toneColor(tone), fontWeight: 600 }}>{sit}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: toneColor(tone), borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pctText(pct)}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtH(done)} de {fmtH(planned)} · saldo {fmtH(saldo)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </Row>

      {/* ── LINHA 2: Cronograma · Horas ── */}
      <Row min={320}>
        <Card title="Cronograma" icon={<CalendarClock size={14} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <MetricBar label="Planejado (tempo)" pct={crono.plan} color="var(--text-light)" />
            <MetricBar label="Executado (progresso)" pct={crono.exec} color={crono.delta >= 0 ? 'var(--success)' : 'var(--warning)'} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: crono.delta >= 0 ? 'var(--success)' : 'var(--warning)' }}>
              {Math.abs(Math.round(crono.delta))} p.p. · {crono.delta > 1 ? 'ADIANTADO' : crono.delta < -1 ? 'ATRASADO' : 'NO PRAZO'}
            </div>
          </div>
        </Card>

        <Card title="Horas" icon={<Clock size={14} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <KV label="Contratadas" value={fmtH(horas.contratadas)} />
            <KV label="Planejadas" value={fmtH(horas.planejadas)} />
            <KV label="Consumidas" value={fmtH(horas.consumidas)} />
            <KV label="Saldo" value={fmtH(horas.saldo)} strong tone={horas.saldo < 0 ? 'danger' : 'success'} />
            <MetricBar label="Consumo" pct={horas.pct} color={horas.pct > 100 ? 'var(--danger)' : horas.pct >= 85 ? 'var(--warning)' : 'var(--success)'} />
          </div>
        </Card>
      </Row>

      {/* ── LINHA 3: Evolução por etapa ── */}
      <Card title="Evolução por etapa" icon={<TrendingUp size={14} />}>
        {etapas.length === 0 ? <Empty>Sem etapas cadastradas.</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {etapas.map(e => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 52px', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{e.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.resp} · {fmtDDMM(e.dueDate)} · {fmtH(e.consumed)}/{fmtH(e.planned)}</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, e.pct)}%`, background: toneColor(e.tone === 'neutral' ? 'success' : e.tone), borderRadius: 4 }} />
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {pctText(e.pct)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── LINHA 4: Atividade recente · Alertas ── */}
      <Row min={320}>
        <Card title="Atividade recente" icon={<History size={14} />}>
          {recent.length === 0 ? <Empty>Nenhuma movimentação recente identificada.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recent.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ marginTop: 1, color: e.icon === 'approve' ? 'var(--success)' : 'var(--primary)', flexShrink: 0 }}>
                    {e.icon === 'approve' ? <ShieldCheck size={13} /> : <ListChecks size={13} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-light)' }}>{fmtEvent(e.at)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{e.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Alertas" icon={<AlertTriangle size={14} />}>
          {alertas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 7 }}><ShieldCheck size={14} /> Nenhum alerta no momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text)' }}>
                  <AlertTriangle size={13} style={{ color: 'var(--warning)', marginTop: 1, flexShrink: 0 }} />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Row>
    </div>
  )
}

// ── Auxiliares ──────────────────────────────────────────────────────────────
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

function SaudeRow({ label, tone, text }: { label: string; tone: Tone; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12 }}>{toneDot(tone)}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', width: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: toneColor(tone) }}>{text}</span>
    </div>
  )
}

function ActBar({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  const pct = total > 0 ? (n / total) * 100 : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 62px', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        <b>{n}</b> <span style={{ color: 'var(--text-light)' }}>{pctText(pct)}</span>
      </span>
    </div>
  )
}

function MetricBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const p = Math.max(0, Math.min(100, num(pct)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{pctText(pct)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${p}%`, background: color, borderRadius: 4 }} />
      </div>
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
