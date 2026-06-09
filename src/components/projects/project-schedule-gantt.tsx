'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { ScheduleStage, ProjectWindow } from '@/hooks/use-project-schedule'
import type { StageDelivery, DeliveryStatus } from '@/lib/types/project-stage'
import { buildCronogramaCodes } from '@/lib/cronograma-numbering'

interface Props {
  stages: ScheduleStage[]
  projectWindow: ProjectWindow | null
  canEdit?: boolean
  onChanged?: () => void
  /** Quando setado, atividades desse consultor ganham border destacada */
  highlightUserId?: number | null
}

type DragMode = 'move' | 'resize-start' | 'resize-end'

interface DragState {
  kind: 'stage' | 'activity'
  id: number
  mode: DragMode
  startX: number
  startDate: Date
  endDate: Date
  deltaDays: number // current delta during drag (snapped to days)
}

type Zoom = 'day' | 'week' | 'biweek' | 'month'

const ZOOM_PX: Record<Zoom, number> = {
  day: 42,     // 1 day = 42px (dia útil legível, 1 atividade curta cabe nome)
  week: 22,    // 1 day = 22px
  biweek: 12,  // 1 day = 12px
  month: 6,    // 1 day = 6px
}

const STATUS_COLOR: Record<DeliveryStatus, string> = {
  backlog:        'var(--text-muted)',
  in_progress:    'var(--primary)',
  waiting_client: 'var(--danger)',
  review:         'var(--warning)',
  done:           'var(--success)',
}

const ROW_HEIGHT = 28
const HEADER_HEIGHT = 40

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function toIso(d: Date): string {
  // YYYY-MM-DD em UTC pra evitar shift por timezone
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ProjectScheduleGantt({ stages, projectWindow, canEdit = true, onChanged, highlightUserId = null }: Props) {
  const [zoom, setZoom] = useState<Zoom>('biweek')
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  // Janela do Gantt: usa projectWindow + padding de 7 dias antes/depois pra dar respiro
  const timeWindow = useMemo(() => {
    const start = parseDate(projectWindow?.start ?? null) ?? new Date()
    const end   = parseDate(projectWindow?.end ?? null) ?? addDays(start, 30)
    return {
      start: addDays(start, -7),
      end:   addDays(end, 7),
    }
  }, [projectWindow?.start, projectWindow?.end])

  const dayWidth = ZOOM_PX[zoom]
  const totalDays = Math.max(1, daysBetween(timeWindow.start, timeWindow.end) + 1)
  const widthPx = totalDays * dayWidth

  // Collapse/expand por etapa (persistido em sessionStorage por projeto)
  const codes = useMemo(() => buildCronogramaCodes(stages), [stages])
  const collapseKey = `cronograma:gantt-collapsed:${stages[0]?.project_id ?? 'unknown'}`
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(collapseKey)
      if (raw) setCollapsed(JSON.parse(raw))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseKey])
  function toggleStage(stageId: number) {
    setCollapsed(c => {
      const next = { ...c, [stageId]: !c[stageId] }
      try { window.sessionStorage.setItem(collapseKey, JSON.stringify(next)) } catch {}
      return next
    })
  }
  function setAllCollapsed(value: boolean) {
    const next = stages.reduce<Record<number, boolean>>((acc, s) => { acc[s.id] = value; return acc }, {})
    setCollapsed(next)
    try { window.sessionStorage.setItem(collapseKey, JSON.stringify(next)) } catch {}
  }

  // Flatten rows (stage row + activity rows) para o layout vertical, respeitando collapse
  type Row = { kind: 'stage'; stage: ScheduleStage; hiddenChildrenCount: number } | { kind: 'activity'; activity: StageDelivery; stageId: number }
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const s of stages) {
      const childs = s.deliveries ?? []
      const isCollapsed = !!collapsed[s.id]
      out.push({ kind: 'stage', stage: s, hiddenChildrenCount: isCollapsed ? childs.length : 0 })
      if (!isCollapsed) {
        for (const d of childs) {
          out.push({ kind: 'activity', activity: d, stageId: s.id })
        }
      }
    }
    return out
  }, [stages, collapsed])

  // Build dependency lookup for arrow rendering
  const activityRowIndex = useMemo(() => {
    const map = new Map<number, number>() // delivery_id → row index
    rows.forEach((r, i) => {
      if (r.kind === 'activity') map.set(r.activity.id, i)
    })
    return map
  }, [rows])

  // delivery_id → title (para tooltip de predecessor pending)
  const activityTitleById = useMemo(() => {
    const map = new Map<number, string>()
    rows.forEach(r => { if (r.kind === 'activity') map.set(r.activity.id, r.activity.title) })
    return map
  }, [rows])

  // Header columns (month labels + day grid)
  const months = useMemo(() => {
    const result: { label: string; offsetPx: number }[] = []
    let cur = new Date(timeWindow.start)
    cur.setDate(1) // primeiro dia do mês
    while (cur <= timeWindow.end) {
      const offset = daysBetween(timeWindow.start, cur)
      if (offset >= 0) {
        result.push({
          label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          offsetPx: offset * dayWidth,
        })
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
    return result
  }, [timeWindow.start, timeWindow.end, dayWidth])

  // Today indicator
  const today = new Date()
  const todayOffset = daysBetween(timeWindow.start, today)
  const todayVisible = todayOffset >= 0 && todayOffset <= totalDays

  // Alinha o background-image (pattern de fim de semana) ao calendário real:
  // pattern = 5 dias transparente + 2 dias surface-hover, repetindo a cada 7 dias.
  // Quero que esses 2 dias caiam em sábado/domingo reais. getDay(): 0=dom,1=seg,...,6=sab.
  const weekendOffsetPx = useMemo(() => {
    const startDOW = timeWindow.start.getDay()
    const daysToSat = (6 - startDOW + 7) % 7
    return (daysToSat - 5) * dayWidth
  }, [timeWindow.start, dayWidth])

  // ─── Drag temporal ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!drag) return

    function onMove(e: MouseEvent) {
      const cur = dragRef.current
      if (!cur) return
      const dx = e.clientX - cur.startX
      const deltaDays = Math.round(dx / dayWidth)
      if (deltaDays !== cur.deltaDays) {
        setDrag({ ...cur, deltaDays })
      }
    }

    async function onUp(_e: MouseEvent) {
      const cur = dragRef.current
      setDrag(null)
      if (!cur) return
      if (cur.deltaDays === 0) return

      try {
        if (cur.kind === 'stage') {
          const newStart = cur.mode !== 'resize-end' ? addDays(cur.startDate, cur.deltaDays) : cur.startDate
          const newEnd   = cur.mode !== 'resize-start' ? addDays(cur.endDate, cur.deltaDays) : cur.endDate
          await api.patch(`/stages/${cur.id}`, {
            stage_start_at:    toIso(newStart),
            expected_end_date: toIso(newEnd),
          })
        } else {
          const newStart = cur.mode !== 'resize-end' ? addDays(cur.startDate, cur.deltaDays) : cur.startDate
          const newEnd   = cur.mode !== 'resize-start' ? addDays(cur.endDate, cur.deltaDays) : cur.endDate
          await api.patch(`/deliveries/${cur.id}`, {
            planned_start_at: toIso(newStart),
            due_date:         toIso(newEnd),
          })
        }
        onChanged?.()
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar movimentação')
        onChanged?.() // refetch reverte visualmente
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, dayWidth])

  function startDrag(kind: 'stage' | 'activity', id: number, mode: DragMode, startDate: Date, endDate: Date, mouseX: number) {
    if (!canEdit) return
    setDrag({ kind, id, mode, startX: mouseX, startDate, endDate, deltaDays: 0 })
  }

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'visible' }}>
      {/* Toolbar — sticky no topo da viewport */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-hover)',
        fontSize: 12,
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}>
        <span style={{ color: 'var(--text-muted)' }}>
          Linha do tempo · {totalDays} dias · zoom {zoom === 'day' ? 'dia' : zoom === 'week' ? 'semana' : zoom === 'biweek' ? '2 semanas' : 'mês'}
        </span>
        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setAllCollapsed(true)}
            title="Recolher todas as etapas"
            style={{
              padding: '3px 8px', fontSize: 11,
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Recolher tudo
          </button>
          <button
            type="button"
            onClick={() => setAllCollapsed(false)}
            title="Expandir todas as etapas"
            style={{
              padding: '3px 8px', fontSize: 11,
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
              marginRight: 8,
            }}
          >
            Expandir tudo
          </button>
          {(['day', 'week', 'biweek', 'month'] as Zoom[]).map(z => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              style={{
                padding: '3px 8px', fontSize: 11,
                background: zoom === z ? 'var(--primary)' : 'transparent',
                color: zoom === z ? 'var(--primary-fg)' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: zoom === z ? 600 : 400,
              }}
            >
              {z === 'day' ? 'Dia' : z === 'week' ? 'Semana' : z === 'biweek' ? '2 sem' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt body — sidebar fixa + canvas scrollable */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Sidebar fixa com nome de etapa + chevron de collapse */}
        <aside style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          {/* Header alinhado com months */}
          <div style={{
            height: HEADER_HEIGHT,
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-sunken)',
            display: 'flex', alignItems: 'center',
            padding: '0 12px',
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.04em',
            position: 'sticky',
            top: 33, // altura aproximada da toolbar (8+8 padding + ~17 conteúdo)
            zIndex: 4,
          }}>
            Etapa / Atividade
          </div>
          {/* Row labels */}
          {rows.map((r, i) => {
            if (r.kind === 'stage') {
              const isCollapsed = !!collapsed[r.stage.id]
              return (
                <button
                  key={`label-${i}`}
                  type="button"
                  onClick={() => toggleStage(r.stage.id)}
                  title={isCollapsed ? `Expandir (${r.hiddenChildrenCount} atividades ocultas)` : 'Recolher'}
                  style={{
                    height: ROW_HEIGHT,
                    width: '100%',
                    padding: '0 8px 0 10px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'transparent',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    textAlign: 'left',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ width: 12, color: 'var(--text-muted)' }}>
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>{codes.stageCode(r.stage.id)}.</span>
                    {r.stage.name}
                  </span>
                  {isCollapsed && r.hiddenChildrenCount > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                      ({r.hiddenChildrenCount})
                    </span>
                  )}
                </button>
              )
            }
            return (
              <div key={`label-${i}`} style={{
                height: ROW_HEIGHT,
                padding: '0 8px 0 28px',
                display: 'flex', alignItems: 'center',
                borderTop: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.activity.is_critical && <span style={{ marginRight: 4 }}>🔥</span>}
                <span style={{ fontWeight: 600, color: 'var(--text-light)', marginRight: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {codes.activityCode(r.activity.id)}
                </span>
                {r.activity.title}
              </div>
            )
          })}
        </aside>

        {/* Canvas scrollable */}
        <div style={{ overflowX: 'auto', position: 'relative', flex: 1 }}>
        <div style={{ width: widthPx, position: 'relative' }}>
          {/* Header: months — sticky no topo (mesma posição do header sidebar) */}
          <div style={{
            height: HEADER_HEIGHT,
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-sunken)',
            position: 'sticky',
            top: 33, zIndex: 4,
            overflow: 'hidden',
          }}>
            {months.map((m, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: m.offsetPx,
                top: 4,
                fontSize: 11, fontWeight: 700,
                color: 'var(--text)',
                textTransform: 'uppercase', letterSpacing: '.04em',
                paddingLeft: 4,
              }}>
                {m.label}
              </div>
            ))}
            {/* Sub-linha de dia (zoom Dia: número de cada dia; Semana: a cada 2 dias) */}
            {(zoom === 'day' || zoom === 'week') && Array.from({ length: totalDays }).map((_, i) => {
              if (zoom === 'week' && i % 2 !== 0) return null
              const d = addDays(timeWindow.start, i)
              const dow = d.getDay()
              const isWeekend = dow === 0 || dow === 6
              return (
                <div key={`d-${i}`} style={{
                  position: 'absolute',
                  left: i * dayWidth,
                  top: HEADER_HEIGHT - 18,
                  width: dayWidth,
                  textAlign: 'center',
                  fontSize: 9,
                  color: isWeekend ? 'var(--text-light)' : 'var(--text-muted)',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  pointerEvents: 'none',
                }}>
                  {d.getDate()}
                </div>
              )
            })}
            {/* Boundary lines of months */}
            {months.map((m, i) => (
              <div key={`mh-${i}`} style={{
                position: 'absolute',
                left: m.offsetPx,
                top: 0, bottom: 0,
                width: 1,
                background: 'var(--border-strong, var(--border))',
                opacity: 0.7,
              }} />
            ))}
            {/* Today label sticky no header */}
            {todayVisible && (
              <div style={{
                position: 'absolute',
                left: todayOffset * dayWidth - 18,
                top: HEADER_HEIGHT - 16,
                width: 36,
                fontSize: 9, fontWeight: 700,
                color: 'var(--primary-fg)',
                background: 'var(--danger)',
                textAlign: 'center',
                borderRadius: 3,
                padding: '1px 0',
                pointerEvents: 'none',
                zIndex: 3,
              }}>
                HOJE
              </div>
            )}
          </div>

          {/* Rows */}
          <div style={{
            position: 'relative',
            minHeight: rows.length * ROW_HEIGHT,
            // Banding fim de semana via repeating gradient (perf-friendly):
            // 5 dias úteis transparente + 2 dias sábado/domingo bg surface-hover.
            backgroundImage: `repeating-linear-gradient(to right,
              transparent 0,
              transparent ${5 * dayWidth}px,
              var(--surface-hover) ${5 * dayWidth}px,
              var(--surface-hover) ${7 * dayWidth}px)`,
            backgroundSize: `${7 * dayWidth}px 100%`,
            backgroundPositionX: `${weekendOffsetPx}px`,
          }}>
            {/* Linhas de SEMANA (claras) */}
            {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => (
              <div key={`gv-${i}`} style={{
                position: 'absolute',
                left: i * 7 * dayWidth,
                top: 0, bottom: 0,
                width: 1,
                background: 'var(--border)',
                opacity: 0.25,
                pointerEvents: 'none',
              }} />
            ))}
            {/* Linhas de MÊS (fortes) */}
            {months.map((m, i) => (
              <div key={`mb-${i}`} style={{
                position: 'absolute',
                left: m.offsetPx,
                top: 0, bottom: 0,
                width: 1,
                background: 'var(--border-strong, var(--border))',
                opacity: 0.6,
                pointerEvents: 'none',
              }} />
            ))}

            {/* Today indicator */}
            {todayVisible && (
              <div style={{
                position: 'absolute',
                left: todayOffset * dayWidth,
                top: 0, bottom: 0,
                width: 2,
                background: 'var(--danger)',
                opacity: 0.9,
                boxShadow: '0 0 4px var(--danger)',
                pointerEvents: 'none',
                zIndex: 1,
              }} title="Hoje" />
            )}

            {/* Bars */}
            {rows.map((row, rowIdx) => {
              if (row.kind === 'stage') {
                return (
                  <StageBar
                    key={`s-${row.stage.id}`}
                    stage={row.stage}
                    rowIdx={rowIdx}
                    windowStart={timeWindow.start}
                    dayWidth={dayWidth}
                    canEdit={canEdit}
                    drag={drag && drag.kind === 'stage' && drag.id === row.stage.id ? drag : null}
                    onDragStart={(mode, start, end, mouseX) => startDrag('stage', row.stage.id, mode, start, end, mouseX)}
                  />
                )
              }
              return (
                <ActivityBar
                  key={`a-${row.activity.id}`}
                  activity={row.activity}
                  rowIdx={rowIdx}
                  windowStart={timeWindow.start}
                  dayWidth={dayWidth}
                  canEdit={canEdit}
                  drag={drag && drag.kind === 'activity' && drag.id === row.activity.id ? drag : null}
                  onDragStart={(mode, start, end, mouseX) => startDrag('activity', row.activity.id, mode, start, end, mouseX)}
                  highlighted={highlightUserId !== null && row.activity.responsible_user_id === highlightUserId}
                  dimmed={highlightUserId !== null && row.activity.responsible_user_id !== highlightUserId}
                  predecessorTitle={
                    row.activity.predecessor_state === 'pending' && row.activity.depends_on_delivery_id
                      ? activityTitleById.get(row.activity.depends_on_delivery_id) ?? null
                      : null
                  }
                />
              )
            })}

            {/* Dependency arrows (SVG overlay) */}
            <svg
              width={widthPx}
              height={rows.length * ROW_HEIGHT}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              {rows.map((row, rowIdx) => {
                if (row.kind !== 'activity') return null
                const depId = row.activity.depends_on_delivery_id
                if (!depId) return null
                const depRow = activityRowIndex.get(depId)
                if (depRow === undefined) return null

                const depActivity = (rows[depRow] as Extract<Row, { kind: 'activity' }>).activity
                const fromEnd = parseDate(depActivity.due_date)
                const toStart = parseDate(row.activity.planned_start_at)
                if (!fromEnd || !toStart) return null

                const x1 = (daysBetween(timeWindow.start, fromEnd) + 1) * dayWidth
                const y1 = depRow * ROW_HEIGHT + ROW_HEIGHT / 2
                const x2 = daysBetween(timeWindow.start, toStart) * dayWidth
                const y2 = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2

                // Linha vermelha se a dependência termina depois do dependente começar
                const violated = fromEnd > toStart
                const color = violated ? 'var(--danger)' : 'var(--text-muted)'

                return (
                  <g key={`dep-${row.activity.id}`}>
                    <path
                      d={`M ${x1} ${y1} L ${x1 + 6} ${y1} L ${x1 + 6} ${y2} L ${x2 - 2} ${y2}`}
                      stroke={color}
                      strokeWidth={1.5}
                      fill="none"
                      opacity={0.7}
                    />
                    <path
                      d={`M ${x2 - 2} ${y2} L ${x2 - 6} ${y2 - 3} L ${x2 - 6} ${y2 + 3} Z`}
                      fill={color}
                      opacity={0.7}
                    />
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

function StageBar({ stage, rowIdx, windowStart, dayWidth, canEdit, drag, onDragStart }: {
  stage: ScheduleStage
  rowIdx: number
  windowStart: Date
  dayWidth: number
  canEdit: boolean
  drag: DragState | null
  onDragStart: (mode: DragMode, start: Date, end: Date, mouseX: number) => void
}) {
  const start = parseDate(stage.stage_start_at)
  const end   = parseDate(stage.expected_end_date)
  const actualStart = parseDate(stage.actual_start_at)
  const actualEnd   = parseDate(stage.actual_end_at)
  if (!start || !end) return null

  // Aplica delta do drag em curso (otimista)
  let drawStart = start
  let drawEnd   = end
  if (drag) {
    if (drag.mode !== 'resize-end') drawStart = addDays(start, drag.deltaDays)
    if (drag.mode !== 'resize-start') drawEnd  = addDays(end, drag.deltaDays)
  }

  const leftPx  = daysBetween(windowStart, drawStart) * dayWidth
  const widthPx = Math.max(dayWidth, (daysBetween(drawStart, drawEnd) + 1) * dayWidth)

  // Bar fantasma planejado quando real diverge (rollup das atividades)
  const showGhost = actualStart && actualEnd && (
    daysBetween(start, actualStart) !== 0 || daysBetween(end, actualEnd) !== 0
  )

  return (
    <>
    {showGhost && (
      <div
        title={`Planejado · ${start.toLocaleDateString('pt-BR')} → ${end.toLocaleDateString('pt-BR')}`}
        style={{
          position: 'absolute',
          top: rowIdx * ROW_HEIGHT + 6,
          left: daysBetween(windowStart, start) * dayWidth,
          width: Math.max(dayWidth, (daysBetween(start, end) + 1) * dayWidth),
          height: 16,
          background: 'transparent',
          border: '1px dashed var(--text-muted)',
          borderRadius: 4,
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      />
    )}
    <div
      title={`${stage.name} · ${drawStart.toLocaleDateString('pt-BR')} → ${drawEnd.toLocaleDateString('pt-BR')}` +
        (actualStart && actualEnd ? ` · Real: ${actualStart.toLocaleDateString('pt-BR')} → ${actualEnd.toLocaleDateString('pt-BR')}` : '')}
      style={{
        position: 'absolute',
        top: rowIdx * ROW_HEIGHT + 3,
        left: leftPx,
        width: widthPx,
        height: 22,
        background: 'var(--primary)',
        border: '1px solid var(--primary-hover)',
        borderRadius: 5,
        fontSize: 11,
        color: 'var(--primary-fg)',
        fontWeight: 700,
        paddingLeft: 8, paddingRight: 8,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        lineHeight: '20px',
        cursor: canEdit ? (drag ? 'grabbing' : 'grab') : 'default',
        opacity: drag ? 0.7 : 1,
        userSelect: 'none',
        boxShadow: 'var(--shadow-xs)',
      }}
      onMouseDown={canEdit ? e => { e.preventDefault(); onDragStart('move', start, end, e.clientX) } : undefined}
    >
      {canEdit && <ResizeHandle side="start" onDragStart={(mouseX) => onDragStart('resize-start', start, end, mouseX)} />}
      {stage.name}
      {canEdit && <ResizeHandle side="end" onDragStart={(mouseX) => onDragStart('resize-end', start, end, mouseX)} />}
    </div>
    </>
  )
}

function ActivityBar({ activity, rowIdx, windowStart, dayWidth, canEdit, drag, onDragStart, highlighted, dimmed, predecessorTitle }: {
  activity: StageDelivery
  rowIdx: number
  windowStart: Date
  dayWidth: number
  canEdit: boolean
  drag: DragState | null
  onDragStart: (mode: DragMode, start: Date, end: Date, mouseX: number) => void
  highlighted: boolean
  dimmed: boolean
  predecessorTitle: string | null
}) {
  const plannedStart = parseDate(activity.planned_start_at)
  const plannedEnd   = parseDate(activity.due_date)
  const actualStart  = parseDate(activity.actual_start_at)
  const actualEnd    = parseDate(activity.completed_at)

  if (!plannedStart && !plannedEnd && !actualStart && !actualEnd) return null

  // Bar planejada (cinza fantasma se houver diff com real)
  const plannedColor = STATUS_COLOR[activity.status]
  const hasPlanned = plannedStart && plannedEnd
  const hasActual  = actualStart && actualEnd
  const showGhost  = hasPlanned && hasActual && (
    daysBetween(plannedStart!, actualStart!) !== 0 || daysBetween(plannedEnd!, actualEnd!) !== 0
  )

  // Bar principal (real se completed, senão planned)
  // Drag opera sobre o planejado (planned_start_at + due_date)
  let mainStart = actualStart && actualEnd ? actualStart : plannedStart
  let mainEnd   = actualStart && actualEnd ? actualEnd : plannedEnd
  if (drag && plannedStart && plannedEnd) {
    if (drag.mode !== 'resize-end') mainStart = addDays(plannedStart, drag.deltaDays)
    if (drag.mode !== 'resize-start') mainEnd  = addDays(plannedEnd, drag.deltaDays)
  }
  if (!mainStart || !mainEnd) return null

  const mainLeftPx  = daysBetween(windowStart, mainStart) * dayWidth
  const mainWidthPx = Math.max(dayWidth, (daysBetween(mainStart, mainEnd) + 1) * dayWidth)
  const canDrag = canEdit && hasPlanned

  return (
    <>
      {/* Ghost (planejado) — só aparece se actual diverge */}
      {showGhost && plannedStart && plannedEnd && (
        <div style={{
          position: 'absolute',
          top: rowIdx * ROW_HEIGHT + 8,
          left: daysBetween(windowStart, plannedStart) * dayWidth,
          width: Math.max(dayWidth, (daysBetween(plannedStart, plannedEnd) + 1) * dayWidth),
          height: 12,
          background: 'transparent',
          border: '1px dashed var(--text-muted)',
          borderRadius: 3,
          opacity: 0.5,
        }} title="Planejado" />
      )}

      {/* Bar real ou planejada */}
      <div
        title={
          `${activity.title}${activity.is_critical ? ' 🔥' : ''} · ${mainStart.toLocaleDateString('pt-BR')} → ${mainEnd.toLocaleDateString('pt-BR')}` +
          ` · ${activity.hours_planned}h` +
          (typeof activity.duration_business_days === 'number' ? ` · ${activity.duration_business_days} d.ú.` : '') +
          (activity.responsible?.name ? ` · ${activity.responsible.name}` : '') +
          (hasActual ? ' (real)' : ' (planejado)') +
          (predecessorTitle ? `\n🔒 Bloqueada por: ${predecessorTitle}` : '')
        }
        style={{
          position: 'absolute',
          top: rowIdx * ROW_HEIGHT + 9,
          left: mainLeftPx,
          width: mainWidthPx,
          height: 10,
          background: plannedColor,
          borderRadius: 2,
          fontSize: 10,
          color: 'var(--primary-fg)',
          paddingLeft: 4, paddingRight: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: '10px',
          opacity: drag ? 0.6 : dimmed ? 0.25 : 0.85,
          cursor: canDrag ? (drag ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
          borderLeft: activity.is_critical ? '3px solid var(--danger)' : `2px solid ${plannedColor}`,
          outline: predecessorTitle
            ? '2px dashed var(--warning)'
            : highlighted ? '2px solid var(--primary)' : 'none',
          outlineOffset: (predecessorTitle || highlighted) ? 1 : 0,
        }}
        onMouseDown={canDrag ? e => { e.preventDefault(); onDragStart('move', plannedStart!, plannedEnd!, e.clientX) } : undefined}
      >
        {canDrag && <ResizeHandle side="start" onDragStart={(mouseX) => onDragStart('resize-start', plannedStart!, plannedEnd!, mouseX)} />}
        {mainWidthPx > 60 ? activity.title : ''}
        {canDrag && <ResizeHandle side="end" onDragStart={(mouseX) => onDragStart('resize-end', plannedStart!, plannedEnd!, mouseX)} />}
      </div>
    </>
  )
}

function ResizeHandle({ side, onDragStart }: {
  side: 'start' | 'end'
  onDragStart: (mouseX: number) => void
}) {
  return (
    <div
      onMouseDown={e => {
        e.preventDefault()
        e.stopPropagation()
        onDragStart(e.clientX)
      }}
      style={{
        position: 'absolute',
        top: 0, bottom: 0,
        [side === 'start' ? 'left' : 'right']: -3,
        width: 6,
        cursor: 'ew-resize',
        zIndex: 2,
      }}
    />
  )
}
