'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Calculator, RotateCcw } from 'lucide-react'

// Simulador de precificação: usa a MESMA memória de cálculo das propostas
// (POST /crm/simulador → CrmProposalCalcService::compute), sem persistir nada.

interface CalcOut {
  coordenacao_horas: number
  custos: { consultoria: number; coordenacao: number; comercial: number; imposto: number; custo_fixo: number }
  faturamento_detalhe: { consultoria: number; coordenacao: number; margem_markup: number }
  premios: { executivo: number; arquiteto: number; sdr_fixo: number }
  custo_total: number; faturamento: number; premios_total: number; desconto_valor: number
  margem_pct: number; lucro_liquido: number
}

const fmtBRL = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'w-full text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lblCls = 'text-[11px] font-semibold block mb-0.5'

const DEFAULT_INPUTS = {
  horas_consultoria: 100, venda_h: 200, custo_h_consultoria: 90, custo_h_coordenacao: 120,
  comercial_horas: 0, custo_h_comercial: 0, faturamento_fixo: 0,
  params: { pct_coordenacao: 0.20, pct_imposto: 0.10, pct_custo_fixo: 0.40, pct_margem: 0, premio_executivo_pct: 0, premio_arquiteto_pct: 0, sdr_fixo: 0, desconto_pct: 0 },
}

const PARAMS: [string, string][] = [
  ['pct_coordenacao', '% Coordenação'], ['pct_imposto', '% Imposto'], ['pct_custo_fixo', '% Custo fixo'],
  ['pct_margem', '% Margem'], ['premio_executivo_pct', '% Prêmio exec.'], ['premio_arquiteto_pct', '% Prêmio arq.'],
  ['desconto_pct', '% Desconto'], ['sdr_fixo', 'SDR fixo (R$)'],
]

function NumRow({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className={lblCls} style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input type="number" step={step} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className={fieldCls} style={inputStyle} />
    </label>
  )
}
function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color: tone === 'neg' ? 'var(--danger-border)' : tone === 'pos' ? '#22c55e' : 'var(--text)' }}>{value}</p>
    </div>
  )
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="tabular-nums" style={{ color: 'var(--text)', fontWeight: strong ? 700 : 400 }}>{value}</span>
    </div>
  )
}

export default function SimuladorPage() {
  const [modo, setModo] = useState<'por_hora' | 'valor_fixo'>('por_hora')
  const [inp, setInp] = useState<any>(DEFAULT_INPUTS)
  const [out, setOut] = useState<CalcOut | null>(null)
  const set = (k: string, v: number) => setInp((p: any) => ({ ...p, [k]: v }))
  const setParam = (k: string, v: number) => setInp((p: any) => ({ ...p, params: { ...p.params, [k]: v } }))

  const body = useMemo(() => JSON.stringify({ modo, inputs: inp }), [modo, inp])
  useEffect(() => {
    const t = setTimeout(() => {
      api.post<{ data: CalcOut }>('/crm/simulador', JSON.parse(body)).then(r => setOut(r?.data ?? null)).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [body])

  const margemPct = (out?.margem_pct ?? 0) * 100

  return (
    <AppLayout title="Simulador (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Simulador de Precificação</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— mesma memória de cálculo das propostas (não salva nada)</span>
        <button onClick={() => { setInp(DEFAULT_INPUTS); setModo('por_hora') }} className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}><RotateCcw size={13} /> Limpar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ENTRADAS */}
        <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
          <div className="flex gap-1.5">
            {(['por_hora', 'valor_fixo'] as const).map(m => (
              <button key={m} onClick={() => setModo(m)} className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: modo === m ? 'var(--primary)' : 'var(--surface-sunken)', color: modo === m ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                {m === 'por_hora' ? 'Por hora' : 'Valor fixo'}
              </button>
            ))}
          </div>

          {modo === 'valor_fixo' ? (
            <NumRow label="Faturamento fixo (R$)" step="0.01" value={inp.faturamento_fixo} onChange={v => set('faturamento_fixo', v)} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumRow label="Horas de consultoria" value={inp.horas_consultoria} onChange={v => set('horas_consultoria', v)} />
              <NumRow label="Valor/hora cliente (R$)" step="0.01" value={inp.venda_h} onChange={v => set('venda_h', v)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <NumRow label="Custo/h consultoria" step="0.01" value={inp.custo_h_consultoria} onChange={v => set('custo_h_consultoria', v)} />
            <NumRow label="Custo/h coordenação" step="0.01" value={inp.custo_h_coordenacao} onChange={v => set('custo_h_coordenacao', v)} />
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold" style={{ color: 'var(--primary)' }}>Comercial (opcional)</summary>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <NumRow label="Horas comercial" value={inp.comercial_horas} onChange={v => set('comercial_horas', v)} />
              <NumRow label="Custo/h comercial" step="0.01" value={inp.custo_h_comercial} onChange={v => set('custo_h_comercial', v)} />
            </div>
          </details>

          <details className="text-xs" open>
            <summary className="cursor-pointer font-semibold" style={{ color: 'var(--primary)' }}>Parâmetros (% planilha)</summary>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {PARAMS.map(([k, lbl]) => (
                <NumRow key={k} label={lbl} step="0.01" value={inp.params?.[k] ?? 0} onChange={v => setParam(k, v)} />
              ))}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Percentuais em decimal (ex.: 0,20 = 20%). Coordenação = arredonda p/ cima (horas × %).</p>
          </details>
        </div>

        {/* RESULTADO */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Faturamento" value={fmtBRL(out?.faturamento ?? 0)} />
            <KpiCard label="Custo total" value={fmtBRL(out?.custo_total ?? 0)} />
            <KpiCard label="Margem" value={`${margemPct.toFixed(2)}%`} tone={margemPct < 0 ? 'neg' : 'pos'} />
            <KpiCard label="Lucro líquido" value={fmtBRL(out?.lucro_liquido ?? 0)} tone={(out?.lucro_liquido ?? 0) < 0 ? 'neg' : 'pos'} />
          </div>

          <div className="rounded-xl p-4 text-sm" style={{ border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Detalhamento</p>
            <Row label={`Coordenação (horas)`} value={String(out?.coordenacao_horas ?? 0)} />
            <Row label="Faturamento — consultoria" value={fmtBRL(out?.faturamento_detalhe.consultoria ?? 0)} />
            <Row label="Faturamento — coordenação" value={fmtBRL(out?.faturamento_detalhe.coordenacao ?? 0)} />
            <Row label="Faturamento — margem (markup)" value={fmtBRL(out?.faturamento_detalhe.margem_markup ?? 0)} />
            <Row label="Custo — consultoria" value={fmtBRL(out?.custos.consultoria ?? 0)} />
            <Row label="Custo — coordenação" value={fmtBRL(out?.custos.coordenacao ?? 0)} />
            <Row label="Custo — comercial" value={fmtBRL(out?.custos.comercial ?? 0)} />
            <Row label="Imposto" value={fmtBRL(out?.custos.imposto ?? 0)} />
            <Row label="Custo fixo" value={fmtBRL(out?.custos.custo_fixo ?? 0)} />
            <Row label="Prêmio executivo" value={fmtBRL(out?.premios.executivo ?? 0)} />
            <Row label="Prêmio arquiteto" value={fmtBRL(out?.premios.arquiteto ?? 0)} />
            <Row label="SDR fixo" value={fmtBRL(out?.premios.sdr_fixo ?? 0)} />
            <Row label="Desconto" value={fmtBRL(out?.desconto_valor ?? 0)} />
            <Row label="Custo total" value={fmtBRL(out?.custo_total ?? 0)} strong />
            <Row label="Prêmios (total)" value={fmtBRL(out?.premios_total ?? 0)} strong />
            <Row label="Lucro líquido" value={fmtBRL(out?.lucro_liquido ?? 0)} strong />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
