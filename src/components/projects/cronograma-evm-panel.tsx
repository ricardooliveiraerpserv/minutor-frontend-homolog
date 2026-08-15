'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Snowflake, RefreshCw, Info, TrendingUp, TrendingDown, Minus, Users, Timer, Trash2 } from 'lucide-react'
import { api, apiMessage } from '@/lib/api'
import { useConfirm } from '@/components/ui/use-confirm'
import { toast } from 'sonner'

/**
 * Painel de indicadores do Cronograma — EVM em HORAS + operacionais.
 * EVM (precisa de baseline): GET /projects/{id}/evm; congela via POST /projects/{id}/baseline.
 * Operacionais (independem de baseline): GET /projects/{id}/operational-metrics.
 * Só horas + operacional (custo R$ = Fase 3). Semáforo do spec: ≥1 verde, 0,9–1 amarelo, <0,9 vermelho.
 */

type Metrics = {
  bac: number; pv: number; ev: number; ac: number; sv: number; cv: number
  spi: number | null; cpi: number | null; eac: number | null; etc: number | null; vac: number | null
  pct_planned: number | null; pct_real: number | null
}
type CostMetrics = { bac: number; pv: number; ev: number; ac: number; sv: number; cv: number; spi: number | null; cpi: number | null; eac: number | null; etc: number | null; vac: number | null }
type CurvePoint = { date: string; pv: number | null; ev: number | null; ac: number | null; pv_cost?: number | null; ev_cost?: number | null; ac_cost?: number | null }
type Baseline = { id: number; label: string; frozen_at: string | null; frozen_by?: string | null; planned_hours_total: number; planned_cost_total?: number; notes?: string | null }
type Evm = { has_baseline: boolean; using_live_plan?: boolean; has_cost?: boolean; message?: string; baseline?: Baseline; as_of?: string; metrics?: Metrics; cost?: CostMetrics | null; curve?: CurvePoint[] }

type FlowItem = { title: string; completed_at: string; lead_days: number; cycle_days: number | null }
type Op = {
  totals: { deliveries: number; done: number; overdue: number; overdue_pct: number }
  productivity: { user_id: number; name: string; done_count: number; hours_done: number; hours_actual: number; efficiency: number | null }[]
  flow: { count: number; lead_avg_days: number | null; cycle_avg_days: number | null; items: FlowItem[] }
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral'
const toneVar = (t: Tone) => t === 'success' ? 'var(--success)' : t === 'warning' ? 'var(--warning)' : t === 'danger' ? 'var(--danger)' : 'var(--text-light)'
const idxTone = (v: number | null | undefined): Tone => v == null ? 'neutral' : v >= 1 ? 'success' : v >= 0.9 ? 'warning' : 'danger'
const varTone = (v: number | null | undefined): Tone => v == null ? 'neutral' : v >= 0 ? 'success' : 'danger'

const fmtH = (n: number | null | undefined) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h` }
const fmtIdx = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2)
const fmtSigned = (n: number | null | undefined) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; const s = v > 0 ? '+' : ''; return `${s}${v >= 10 || v <= -10 ? Math.round(v) : Math.round(v * 10) / 10}h` }
const fmtBRL = (n: number | null | undefined) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) }
const fmtBRLSigned = (n: number | null | undefined) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; return (v > 0 ? '+' : '') + fmtBRL(v) }
const fmtDays = (n: number | null | undefined) => n == null ? '—' : `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}d`
const ddmm = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const fmtDate = (iso?: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(+d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }

const COL_PV = '#8b5cf6'
const COL_EV = '#22c55e'
const COL_AC = '#f59e0b'

export function CronogramaEvmPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [data, setData] = useState<Evm | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [evm, opr] = await Promise.all([
        api.get<Evm>(`/projects/${projectId}/evm`),
        api.get<Op>(`/projects/${projectId}/operational-metrics`).catch(() => null),
      ])
      setData(evm); setOp(opr)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao carregar indicadores')) }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const freeze = async () => {
    setBusy(true)
    try { await api.post(`/projects/${projectId}/baseline`, {}); toast.success('Linha de base congelada.'); await load() }
    catch (e) { toast.error(apiMessage(e, 'Erro ao congelar a linha de base')) }
    finally { setBusy(false) }
  }

  const unfreeze = async () => {
    const ok = await confirm({
      title: 'Descongelar linha de base',
      message: 'Remover a linha de base? Os indicadores de EVM (SPI/CPI/curva-S) ficam indisponíveis até você congelar de novo. Os dados de progresso e apontamentos não são afetados.',
      danger: true, confirmLabel: 'Descongelar', cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setBusy(true)
    try { await api.delete(`/projects/${projectId}/baseline`); toast.success('Linha de base removida.'); await load() }
    catch (e) { toast.error(apiMessage(e, 'Erro ao remover a linha de base')) }
    finally { setBusy(false) }
  }

  if (loading) {
    return <div className="ds-card p-4 text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando indicadores…</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {(data?.has_baseline || data?.using_live_plan) ? evmBlock(data, canEdit, busy, freeze, unfreeze) : baselineCta(canEdit, busy, freeze)}
      {op && operationalBlock(op)}
      {confirmDialog}
    </div>
  )
}

// ——— EVM (precisa de baseline) ———

function baselineCta(canEdit: boolean, busy: boolean, freeze: () => void) {
  return (
    <div className="ds-card p-5" style={{ borderLeft: '3px solid var(--primary)' }}>
      <div className="flex items-start gap-3">
        <Snowflake size={20} style={{ color: 'var(--primary)', marginTop: 2 }} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Congele a linha de base para habilitar o EVM</h3>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            O EVM compara o realizado com um plano de referência <b>congelado</b>. Ao congelar, guardamos as datas e horas
            planejadas de cada etapa/atividade — depois disso o SPI/CPI passam a ter sentido, mesmo que o cronograma seja replanejado.
          </p>
          {canEdit ? (
            <button onClick={freeze} disabled={busy}
              className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg mt-3 disabled:opacity-60">
              <Snowflake size={15} /> {busy ? 'Congelando…' : 'Congelar linha de base'}
            </button>
          ) : (
            <p className="text-[12px] mt-3" style={{ color: 'var(--text-light)' }}>Peça a um coordenador para congelar a linha de base.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function evmBlock(data: Evm, canEdit: boolean, busy: boolean, freeze: () => void, unfreeze: () => void) {
  const m = data.metrics!
  const b = data.baseline
  const curve = (data.curve ?? []).map(p => ({ ...p, label: ddmm(p.date) }))

  const cards: { label: string; value: string; tone: Tone; sub: string; trend: 'up' | 'down' | 'flat' }[] = [
    { label: 'SPI · Prazo', value: fmtIdx(m.spi), tone: idxTone(m.spi), sub: m.spi == null ? 'sem dado' : m.spi >= 1 ? 'no ritmo ou adiantado' : 'atrás do planejado', trend: m.spi == null ? 'flat' : m.spi >= 1 ? 'up' : 'down' },
    { label: 'CPI · Esforço', value: fmtIdx(m.cpi), tone: idxTone(m.cpi), sub: m.cpi == null ? 'sem apontamento' : m.cpi >= 1 ? 'dentro do esforço' : 'esforço acima do previsto', trend: m.cpi == null ? 'flat' : m.cpi >= 1 ? 'up' : 'down' },
    { label: 'SV · Prazo (horas)', value: fmtSigned(m.sv), tone: varTone(m.sv), sub: m.sv >= 0 ? 'adiantado' : 'atrasado', trend: m.sv >= 0 ? 'up' : 'down' },
    { label: 'CV · Esforço (horas)', value: fmtSigned(m.cv), tone: varTone(m.cv), sub: m.cv >= 0 ? 'abaixo do previsto' : 'acima do previsto', trend: m.cv >= 0 ? 'up' : 'down' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {data.using_live_plan ? (
        <div className="flex items-center gap-2 flex-wrap text-[12px] px-3 py-2 rounded-lg"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <Info size={13} />
          <span><b>Estimativa pelo plano atual</b> — sem linha de base congelada. Os índices mudam se você replanejar.</span>
          <span className="ml-auto" />
          {canEdit && (
            <button onClick={freeze} disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md ds-row-hover disabled:opacity-60"
              style={{ border: '1px solid var(--warning-border)', color: 'var(--warning)' }} title="Congelar a linha de base para fixar a referência">
              <Snowflake size={12} /> {busy ? '…' : 'Congelar linha de base'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap text-[12px] px-3 py-2 rounded-lg"
          style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          <Snowflake size={13} style={{ color: 'var(--primary)' }} />
          <span><b style={{ color: 'var(--text)' }}>{b?.label ?? 'Linha de base'}</b> · congelada em {fmtDate(b?.frozen_at)}{b?.frozen_by ? ` por ${b.frozen_by}` : ''}</span>
          <span>· {fmtH(b?.planned_hours_total)} planejadas (BAC)</span>
          <span className="ml-auto" />
          {canEdit && (
            <div className="inline-flex items-center gap-1.5">
              <button onClick={freeze} disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md ds-row-hover disabled:opacity-60"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }} title="Recongelar a linha de base com o plano atual">
                <RefreshCw size={12} /> {busy ? '…' : 'Recongelar'}
              </button>
              <button onClick={unfreeze} disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md ds-row-hover disabled:opacity-60"
                style={{ border: '1px solid var(--danger-border, var(--border))', color: 'var(--danger)' }} title="Remover a linha de base (desfazer o congelamento)">
                <Trash2 size={12} /> Descongelar
              </button>
            </div>
          )}
        </div>
      )}

      <div className="ds-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>% Planejado vs Real</span>
          <span className="text-[12px]" style={{ color: (m.pct_real ?? 0) < (m.pct_planned ?? 0) ? 'var(--warning)' : 'var(--success)' }}>
            {(m.pct_real ?? 0) < (m.pct_planned ?? 0) ? 'abaixo do planejado' : 'no ritmo esperado'}
          </span>
        </div>
        <Bar label="Planejado (PV)" pct={m.pct_planned ?? 0} hours={m.pv} color={COL_PV} />
        <div className="h-2" />
        <Bar label="Real (EV)" pct={m.pct_real ?? 0} hours={m.ev} color={COL_EV} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map(c => (
          <div key={c.label} className="ds-card px-3.5 py-3" style={{ borderLeft: `3px solid ${toneVar(c.tone)}` }}>
            <div className="text-[11px] font-medium" style={{ color: 'var(--text-light)' }}>{c.label}</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold" style={{ color: toneVar(c.tone) }}>{c.value}</span>
              {c.trend === 'up' && <TrendingUp size={15} style={{ color: toneVar(c.tone) }} />}
              {c.trend === 'down' && <TrendingDown size={15} style={{ color: toneVar(c.tone) }} />}
              {c.trend === 'flat' && <Minus size={15} style={{ color: 'var(--text-light)' }} />}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <EvmSCurve curve={curve} hasCost={!!data.has_cost} />

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <span className="uppercase tracking-wide text-[10px] font-semibold self-center" style={{ color: 'var(--text-light)' }}>Horas</span>
        <span>BAC <b style={{ color: 'var(--text)' }}>{fmtH(m.bac)}</b></span>
        <span title="Estimativa no término = BAC / CPI">EAC <b style={{ color: 'var(--text)' }}>{fmtH(m.eac)}</b></span>
        <span title="Falta terminar = EAC − AC">ETC <b style={{ color: 'var(--text)' }}>{fmtH(m.etc)}</b></span>
        <span title="Variação no término = BAC − EAC">VAC <b style={{ color: varTone(m.vac) }}>{fmtSigned(m.vac)}</b></span>
      </div>

      {data.has_cost && data.cost && costBlock(data.cost)}
    </div>
  )
}

function costBlock(c: CostMetrics) {
  const cards: { label: string; value: string; tone: Tone; sub: string }[] = [
    { label: 'CPI · Custo', value: fmtIdx(c.cpi), tone: idxTone(c.cpi), sub: c.cpi == null ? 'sem apontamento' : c.cpi >= 1 ? 'dentro do orçado' : 'custo acima do orçado' },
    { label: 'CV · Custo', value: fmtBRLSigned(c.cv), tone: varTone(c.cv), sub: c.cv >= 0 ? 'economia' : 'estouro' },
    { label: 'EV · Agregado', value: fmtBRL(c.ev), tone: 'neutral', sub: 'valor entregue' },
    { label: 'AC · Real', value: fmtBRL(c.ac), tone: 'neutral', sub: 'custo apontado' },
  ]
  return (
    <div className="ds-card p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Custo (R$)</span>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-2">
        {cards.map(cd => (
          <div key={cd.label} className="rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-hover)', borderLeft: `3px solid ${toneVar(cd.tone)}` }}>
            <div className="text-[11px] font-medium" style={{ color: 'var(--text-light)' }}>{cd.label}</div>
            <div className="text-xl font-bold mt-0.5" style={{ color: cd.tone === 'neutral' ? 'var(--text)' : toneVar(cd.tone) }}>{cd.value}</div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{cd.sub}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <span>BAC <b style={{ color: 'var(--text)' }}>{fmtBRL(c.bac)}</b></span>
        <span title="Estimativa no término = BAC / CPI">EAC <b style={{ color: 'var(--text)' }}>{fmtBRL(c.eac)}</b></span>
        <span title="Falta terminar = EAC − AC">ETC <b style={{ color: 'var(--text)' }}>{fmtBRL(c.etc)}</b></span>
        <span title="Variação no término = BAC − EAC">VAC <b style={{ color: varTone(c.vac) }}>{fmtBRLSigned(c.vac)}</b></span>
      </div>
    </div>
  )
}

function EvmSCurve({ curve, hasCost }: { curve: (CurvePoint & { label: string })[]; hasCost: boolean }) {
  const [mode, setMode] = useState<'h' | 'r'>('h')
  const isR = mode === 'r' && hasCost
  const yFmt = (v: number) => isR ? (v >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${Math.round(v)}`) : `${Math.round(v)}h`
  const vFmt = (v: number) => isR ? fmtBRL(v) : fmtH(v)
  const nameFmt = (n: unknown) => { const s = String(n); return s.startsWith('pv') ? 'Planejado (PV)' : s.startsWith('ev') ? 'Feito (EV)' : 'Apontado (AC)' }
  return (
    <div className="ds-card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Curva-S · Valor Agregado</span>
          <span title="PV = planejado · EV = feito · AC = apontado (acumulados)" style={{ color: 'var(--text-light)' }}>
            <Info size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />
          </span>
        </div>
        {hasCost && (
          <div className="inline-flex rounded-md overflow-hidden text-[11px]" style={{ border: '1px solid var(--border)' }}>
            {(['h', 'r'] as const).map(k => (
              <button key={k} onClick={() => setMode(k)} className="px-2.5 py-0.5"
                style={{ background: mode === k ? 'var(--primary)' : 'transparent', color: mode === k ? 'var(--primary-fg, #fff)' : 'var(--text-muted)' }}>
                {k === 'h' ? 'Horas' : 'R$'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={false} width={48} tickFormatter={yFmt} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(value, name) => [value == null ? '—' : vFmt(Number(value)), nameFmt(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={nameFmt} />
            <Line type="monotone" dataKey={isR ? 'pv_cost' : 'pv'} stroke={COL_PV} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey={isR ? 'ev_cost' : 'ev'} stroke={COL_EV} strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey={isR ? 'ac_cost' : 'ac'} stroke={COL_AC} strokeWidth={2} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ——— Operacionais (independem de baseline) ———

function operationalBlock(op: Op) {
  const t = op.totals
  const overdueTone: Tone = t.overdue_pct >= 20 ? 'danger' : t.overdue_pct > 0 ? 'warning' : 'success'
  const maxActual = Math.max(1, ...op.productivity.map(p => p.hours_actual))

  return (
    <div className="flex flex-col gap-3">
      {/* Faixa operacional */}
      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat label="Atividades" value={`${t.done}/${t.deliveries}`} sub="concluídas" tone="neutral" />
        <MiniStat label="% Atrasadas" value={`${t.overdue_pct}%`} sub={`${t.overdue} fora do prazo`} tone={overdueTone} />
        <MiniStat label="Entregues" value={String(op.flow.count)} sub="no total" tone="neutral" />
      </div>

      {/* Produtividade da equipe */}
      {op.productivity.length > 0 && (
        <div className="ds-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Users size={14} style={{ color: 'var(--text-light)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Produtividade da equipe</span>
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }} title="Eficiência = horas planejadas das atividades concluídas ÷ horas apontadas (≥1 = eficiente)">
              <Info size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {op.productivity.map(p => (
              <div key={p.user_id} className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-[13px] truncate" style={{ color: 'var(--text)' }} title={p.name}>{p.name}</div>
                <div className="flex-1 min-w-0">
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((p.hours_actual / maxActual) * 100)}%`, height: '100%', background: 'var(--primary)', borderRadius: 999 }} />
                  </div>
                </div>
                <div className="w-40 shrink-0 text-right text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {p.done_count} ativ. · {fmtH(p.hours_actual)}
                </div>
                <div className="w-16 shrink-0 text-right text-[12px] font-semibold"
                  style={{ color: toneVar(idxTone(p.efficiency)) }} title="Eficiência (horas planejadas concluídas ÷ apontadas)">
                  {p.efficiency == null ? '—' : `${p.efficiency.toFixed(2)}×`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lead / Cycle time */}
      <div className="ds-card p-4">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Timer size={14} style={{ color: 'var(--text-light)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Tempo de entrega</span>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtDays(op.flow.lead_avg_days)}</div>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Lead time médio</div>
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>criação → conclusão</div>
          </div>
          <div className="flex-1 rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtDays(op.flow.cycle_avg_days)}</div>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Cycle time médio</div>
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>início → conclusão</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Tone }) {
  return (
    <div className="ds-card px-3.5 py-2.5" style={{ borderLeft: `3px solid ${toneVar(tone)}` }}>
      <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: tone === 'neutral' ? 'var(--text)' : toneVar(tone) }}>{value}</div>
      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function Bar({ label, pct, hours, color }: { label: string; pct: number; hours: number; color: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color: 'var(--text)' }}><b>{p}%</b> · {fmtH(hours)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .3s' }} />
      </div>
    </div>
  )
}
