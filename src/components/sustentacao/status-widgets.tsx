'use client'

/**
 * Widgets do "Status de Suporte" — componentes de apresentação reutilizáveis.
 * Regras:
 *  - Cores hardcoded NÃO vivem aqui: quem usa passa cores por prop (design system).
 *  - Semântica de variação AA: ↑ pode ser bom OU ruim conforme a métrica (goodDirection).
 *  - Sem histórico → "sem histórico" (nunca 0).
 */

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

const SUCCESS = 'var(--success)'
const DANGER  = 'var(--danger)'
const MUTED   = 'var(--text-muted)'

/** Rótulo de seção (uppercase, tracking). Encoda o agrupamento Desempenho × Situação. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-light)] mb-2 mt-1">
      {children}
    </p>
  )
}

export type GoodDirection = 'up' | 'down' | 'neutral'

/** Badge de variação Ano-Anterior. `unit`: '%' | 'pp' | 'h'. null → "sem histórico". */
export function VariationBadge({ value, unit, good }: {
  value: number | null | undefined
  unit: '%' | 'pp' | 'h'
  good: GoodDirection
}) {
  if (value === null || value === undefined) {
    return <span className="text-[10px]" style={{ color: MUTED }}>sem histórico</span>
  }
  const up = value > 0
  const flat = value === 0
  // cor: depende se "para cima" é bom ou ruim para ESTA métrica
  let color = MUTED
  if (!flat && good !== 'neutral') {
    const isGood = (good === 'up' && up) || (good === 'down' && !up)
    color = isGood ? SUCCESS : DANGER
  }
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown
  const abs = Math.abs(value)
  const suffix = unit === 'pp' ? ' p.p.' : unit === 'h' ? 'h' : '%'
  return (
    <span className="text-[10px] font-medium inline-flex items-center gap-0.5" style={{ color }}>
      <Icon size={11} />{abs.toLocaleString('pt-BR')}{suffix} <span style={{ color: MUTED }}>AA</span>
    </span>
  )
}

/** KPI card com badge de variação AA opcional. */
export function KpiAA({ label, value, sub, variation, unit, good, valueColor }: {
  label: string
  value: string | number
  sub?: string
  variation?: number | null
  unit?: '%' | 'pp' | 'h'
  good?: GoodDirection
  valueColor?: string
}) {
  const showAA = variation !== undefined
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-2xl font-bold" style={{ color: valueColor ?? 'var(--text)' }}>{value}</span>
      <div className="flex items-center justify-between gap-2">
        {sub ? <span className="text-[10px] text-[var(--text-light)]">{sub}</span> : <span />}
        {showAA && <VariationBadge value={variation ?? null} unit={unit ?? '%'} good={good ?? 'neutral'} />}
      </div>
    </div>
  )
}

/** Barras horizontais Aging (0–3/4–7/8–15/+15). Cores passadas por prop. */
export function AgingBars({ aging, colors }: {
  aging: { d0_3: number; d4_7: number; d8_15: number; d15_plus: number }
  colors: { ok: string; warn: string; high: string; crit: string }
}) {
  const buckets = [
    { label: '0–3 dias',  value: aging.d0_3,     color: colors.ok },
    { label: '4–7 dias',  value: aging.d4_7,     color: colors.warn },
    { label: '8–15 dias', value: aging.d8_15,    color: colors.high },
    { label: '+15 dias',  value: aging.d15_plus, color: colors.crit },
  ]
  const max = Math.max(...buckets.map(b => b.value), 1)
  return (
    <div className="space-y-3">
      {buckets.map(b => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">{b.label}</span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 10 }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(b.value / max) * 100}%`, background: b.color }} />
          </div>
          <span className="text-[11px] font-semibold w-8 text-right" style={{ color: b.color }}>{b.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Barras horizontais Top-N + "Outros" + "Ver todos" (para servico/Módulo, 65 valores). */
export function HBarTopN({ items, others, othersCount, barColor, onSeeAll }: {
  items: { label: string; count: number }[]
  others?: number
  othersCount?: number
  barColor: string
  onSeeAll?: () => void
}) {
  const rows = [...items]
  if (others && others > 0) rows.push({ label: `Outros (${othersCount ?? 0})`, count: others })
  const max = Math.max(...rows.map(r => r.count), 1)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)] w-36 shrink-0 truncate" title={r.label}>{r.label}</span>
          <div className="flex-1 rounded overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 14 }}>
            <div className="h-full rounded transition-all" style={{ width: `${(r.count / max) * 100}%`, background: barColor }} />
          </div>
          <span className="text-[11px] font-semibold w-8 text-right text-[var(--text)]">{r.count}</span>
        </div>
      ))}
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-[11px] font-medium mt-1" style={{ color: 'var(--primary)' }}>
          Ver todos →
        </button>
      )}
    </div>
  )
}

/** Donut para Tipo de Atendimento (categoria — poucas categorias). `palette` por prop. */
export function DonutTipo({ items, palette }: {
  items: { label: string; count: number }[]
  palette: string[]
}) {
  const total = items.reduce((a, b) => a + b.count, 0)
  if (!total) return <p className="text-xs text-[var(--text-muted)]">Sem dados no período.</p>
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={items} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={2}>
            {items.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 min-w-[140px]">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: palette[i % palette.length] }} />
            <span className="text-[var(--text)] flex-1 truncate" title={it.label}>{it.label}</span>
            <span className="text-[var(--text-muted)] font-medium">{it.count}</span>
            <span className="text-[var(--text-light)] w-9 text-right">{((it.count / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Gauge semicircular do SLA geral: % no centro + dentro/fora. Cores por prop. */
export function SlaGauge({ rate, num, den, good, bad }: {
  rate: number | null; num: number; den: number; good: string; bad: string
}) {
  const inside = rate ?? 0
  const data = [{ v: inside }, { v: Math.max(0, 100 - inside) }]
  return (
    <div className="relative" style={{ width: '100%', maxWidth: 240, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={data} dataKey="v" cx="50%" cy="88%" startAngle={180} endAngle={0}
            innerRadius={62} outerRadius={92} stroke="none" isAnimationActive={false}>
            <Cell fill={good} />
            <Cell fill="var(--surface-sunken)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: 6 }}>
        <span className="text-3xl font-bold leading-none" style={{ color: rate == null ? 'var(--text-light)' : rate >= 90 ? good : rate >= 70 ? 'var(--warning)' : bad }}>
          {rate != null ? `${rate}%` : '—'}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-light)] mt-0.5">SLA Solução</span>
        <span className="text-[11px] text-[var(--text-muted)] font-medium">{num} / {den} no prazo</span>
      </div>
    </div>
  )
}

/** Ranking em barras horizontais (consultores/clientes). `right` = meta na extremidade. */
export function RankBars({ items, barColor }: {
  items: { label: string; value: number; valueLabel?: string; right?: string }[]
  barColor: string
}) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-4 text-[var(--text-light)] shrink-0">{i + 1}</span>
          <span className="w-28 shrink-0 truncate text-[var(--text)]" title={it.label}>{it.label}</span>
          <div className="flex-1 rounded overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 14 }}>
            <div className="h-full rounded transition-all" style={{ width: `${(it.value / max) * 100}%`, background: barColor }} />
          </div>
          <span className="w-10 text-right font-semibold text-[var(--text)] tabular-nums">{it.valueLabel ?? it.value}</span>
          {it.right && <span className="w-16 text-right text-[var(--text-light)] tabular-nums">{it.right}</span>}
        </div>
      ))}
    </div>
  )
}

/** Linha de comparação anual com mini-barras (anterior × atual) + variação. */
export function CompareRow({ label, prev, cur, prevLabel, curLabel, variation, unit, good, noHistory }: {
  label: string; prev: number | null; cur: number
  prevLabel: string; curLabel: string
  variation: number | null; unit: '%' | 'pp' | 'h'; good: GoodDirection; noHistory?: boolean
}) {
  const max = Math.max(prev ?? 0, cur, 1)
  return (
    <div className="py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-[var(--text)]">{label}</span>
        {noHistory ? <span className="text-[10px] text-[var(--text-muted)]">sem histórico</span>
                   : <VariationBadge value={variation} unit={unit} good={good} />}
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        <span className="w-24 shrink-0 text-[var(--text-light)]">ant. {noHistory ? '—' : prevLabel}</span>
        <div className="flex-1 flex flex-col gap-1">
          <div className="rounded overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 8 }}>
            <div className="h-full rounded" style={{ width: `${noHistory ? 0 : ((prev ?? 0) / max) * 100}%`, background: 'var(--text-light)' }} />
          </div>
          <div className="rounded overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 8 }}>
            <div className="h-full rounded" style={{ width: `${(cur / max) * 100}%`, background: 'var(--primary)' }} />
          </div>
        </div>
        <span className="w-24 shrink-0 text-right text-[var(--text)] font-medium">atual {curLabel}</span>
      </div>
    </div>
  )
}
