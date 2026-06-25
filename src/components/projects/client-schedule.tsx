'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApiQuery } from '@/hooks/use-query'
import { Lock, ChevronRight, ShieldQuestion, CalendarDays } from 'lucide-react'

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
type View = 'planejamento' | 'timeline' | 'operacao'

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
  const router = useRouter()
  const [view, setView] = useState<View>('planejamento')
  const { data, loading, error } = useApiQuery<ScheduleResp>(`/client/projects/${projectId}/schedule`)

  if (loading && !data) return <div style={{ color: 'var(--text-muted)' }}>Carregando cronograma…</div>
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>
  if (!data || data.is_operational === false) {
    return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Este projeto não tem cronograma operacional.</div>
  }

  const stages = data.stages ?? []
  const openCard = (d: ClientDelivery) => { if (d.can_open) router.push(`/portal-cliente/atividades/${d.id}`) }
  const flat: FlatDelivery[] = stages.flatMap(s => s.deliveries.map(d => ({ ...d, stageName: s.name })))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <Segmented view={view} onChange={setView} />
      </div>

      <div style={{
        marginBottom: 14, padding: '8px 12px', background: 'var(--primary-soft)', borderRadius: 6,
        fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <CalendarDays size={12} />
        <span>Cronograma do projeto em dias. Você abre as atividades em que está envolvido ou que aguardam a sua aprovação; as demais aparecem bloqueadas.</span>
      </div>

      <div key={view} className="cronograma-view-fade">
        {view === 'planejamento' && <Planejamento stages={stages} openCard={openCard} />}
        {view === 'timeline' && <Timeline stages={stages} openCard={openCard} />}
        {view === 'operacao' && <Operacao items={flat} openCard={openCard} />}
      </div>
      <style jsx>{`
        .cronograma-view-fade { animation: cli-fade .14s ease-out; }
        @keyframes cli-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  )
}

function Segmented({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { value: View; label: string }[] = [
    { value: 'planejamento', label: 'Planejamento' },
    { value: 'timeline', label: 'Linha do Tempo' },
    { value: 'operacao', label: 'Operação' },
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
