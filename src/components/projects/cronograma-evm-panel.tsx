'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Snowflake, RefreshCw, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'

/**
 * Painel de EVM (Earned Value Management) em HORAS do Cronograma.
 * Consome GET /projects/{id}/evm; congela a linha de base via POST /projects/{id}/baseline.
 * Só horas + operacional (custo R$ = Fase 3). Semáforo do spec: ≥1 verde, 0,9–1 amarelo, <0,9 vermelho.
 */

type Metrics = {
  bac: number; pv: number; ev: number; ac: number; sv: number; cv: number
  spi: number | null; cpi: number | null; eac: number | null; etc: number | null; vac: number | null
  pct_planned: number | null; pct_real: number | null
}
type CurvePoint = { date: string; pv: number | null; ev: number | null; ac: number | null }
type Baseline = { id: number; label: string; frozen_at: string | null; frozen_by?: string | null; planned_hours_total: number; notes?: string | null }
type Evm = { has_baseline: boolean; message?: string; baseline?: Baseline; as_of?: string; metrics?: Metrics; curve?: CurvePoint[] }

type Tone = 'success' | 'warning' | 'danger' | 'neutral'
const toneVar = (t: Tone) => t === 'success' ? 'var(--success)' : t === 'warning' ? 'var(--warning)' : t === 'danger' ? 'var(--danger)' : 'var(--text-light)'
const toneBg = (t: Tone) => t === 'success' ? 'var(--success-bg)' : t === 'warning' ? 'var(--warning-bg)' : t === 'danger' ? 'var(--danger-bg)' : 'var(--surface-2, var(--surface-hover))'
const idxTone = (v: number | null | undefined): Tone => v == null ? 'neutral' : v >= 1 ? 'success' : v >= 0.9 ? 'warning' : 'danger'
const varTone = (v: number | null | undefined): Tone => v == null ? 'neutral' : v >= 0 ? 'success' : 'danger'

const fmtH = (n: number | null | undefined) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h` }
const fmtIdx = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2)
const fmtSigned = (n: number | null | undefined) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; const s = v > 0 ? '+' : ''; return `${s}${v >= 10 || v <= -10 ? Math.round(v) : Math.round(v * 10) / 10}h` }
const ddmm = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const fmtDate = (iso?: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(+d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }

const COL_PV = '#8b5cf6'  // planejado
const COL_EV = '#22c55e'  // agregado (feito)
const COL_AC = '#f59e0b'  // real (apontado)

export function CronogramaEvmPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [data, setData] = useState<Evm | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.get<Evm>(`/projects/${projectId}/evm`)) }
    catch (e) { toast.error(apiMessage(e, 'Erro ao carregar indicadores')) }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const freeze = async () => {
    setBusy(true)
    try { await api.post(`/projects/${projectId}/baseline`, {}); toast.success('Linha de base congelada.'); await load() }
    catch (e) { toast.error(apiMessage(e, 'Erro ao congelar a linha de base')) }
    finally { setBusy(false) }
  }

  if (loading) {
    return <div className="ds-card p-4 text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando indicadores de EVM…</div>
  }

  // Sem linha de base → chamada para ação (a fundação do EVM).
  if (!data?.has_baseline) {
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

  const m = data.metrics!
  const b = data.baseline
  const curve = (data.curve ?? []).map(p => ({ ...p, label: ddmm(p.date) }))

  const cards: { label: string; value: string; tone: Tone; sub: string; trend?: 'up' | 'down' | 'flat' }[] = [
    { label: 'SPI · Prazo', value: fmtIdx(m.spi), tone: idxTone(m.spi),
      sub: m.spi == null ? 'sem dado' : m.spi >= 1 ? 'no ritmo ou adiantado' : 'atrás do planejado',
      trend: m.spi == null ? 'flat' : m.spi >= 1 ? 'up' : 'down' },
    { label: 'CPI · Esforço', value: fmtIdx(m.cpi), tone: idxTone(m.cpi),
      sub: m.cpi == null ? 'sem apontamento' : m.cpi >= 1 ? 'dentro do esforço' : 'esforço acima do previsto',
      trend: m.cpi == null ? 'flat' : m.cpi >= 1 ? 'up' : 'down' },
    { label: 'SV · Prazo (horas)', value: fmtSigned(m.sv), tone: varTone(m.sv),
      sub: m.sv >= 0 ? 'adiantado' : 'atrasado', trend: m.sv >= 0 ? 'up' : 'down' },
    { label: 'CV · Esforço (horas)', value: fmtSigned(m.cv), tone: varTone(m.cv),
      sub: m.cv >= 0 ? 'abaixo do previsto' : 'acima do previsto', trend: m.cv >= 0 ? 'up' : 'down' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Faixa da linha de base */}
      <div className="flex items-center gap-2 flex-wrap text-[12px] px-3 py-2 rounded-lg"
        style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        <Snowflake size={13} style={{ color: 'var(--primary)' }} />
        <span><b style={{ color: 'var(--text)' }}>{b?.label ?? 'Linha de base'}</b> · congelada em {fmtDate(b?.frozen_at)}{b?.frozen_by ? ` por ${b.frozen_by}` : ''}</span>
        <span>· {fmtH(b?.planned_hours_total)} planejadas (BAC)</span>
        <span className="ml-auto" />
        {canEdit && (
          <button onClick={freeze} disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md ds-row-hover disabled:opacity-60"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }} title="Recongelar a linha de base com o plano atual">
            <RefreshCw size={12} /> {busy ? 'Recongelando…' : 'Recongelar'}
          </button>
        )}
      </div>

      {/* % Planejado vs Real */}
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

      {/* Cards EVM */}
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

      {/* Curva-S PV / EV / AC */}
      <div className="ds-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Curva-S · Valor Agregado (horas)</span>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }} title="PV = planejado acumulado · EV = feito acumulado · AC = apontado acumulado">
            <Info size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />
          </span>
        </div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(v)}h`} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(value, name) => [value == null ? '—' : fmtH(Number(value)), name === 'pv' ? 'Planejado (PV)' : name === 'ev' ? 'Feito (EV)' : 'Apontado (AC)']}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === 'pv' ? 'Planejado (PV)' : v === 'ev' ? 'Feito (EV)' : 'Apontado (AC)'} />
              <Line type="monotone" dataKey="pv" stroke={COL_PV} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="ev" stroke={COL_EV} strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="ac" stroke={COL_AC} strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Resumo BAC / EAC / ETC */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <span>BAC <b style={{ color: 'var(--text)' }}>{fmtH(m.bac)}</b></span>
          <span title="Estimativa no término = BAC / CPI">EAC <b style={{ color: 'var(--text)' }}>{fmtH(m.eac)}</b></span>
          <span title="Falta terminar = EAC − AC">ETC <b style={{ color: 'var(--text)' }}>{fmtH(m.etc)}</b></span>
          <span title="Variação no término = BAC − EAC">VAC <b style={{ color: varTone(m.vac) }}>{fmtSigned(m.vac)}</b></span>
        </div>
      </div>
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
