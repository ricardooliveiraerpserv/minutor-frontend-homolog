'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { TrendingUp, AlertTriangle, Clock, Users, Target, Wallet, X } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

interface Forecast {
  mes: string
  meta: { valor: number; previsto: number; realizado: number; gap: number; pct_atingido: number | null; coverage: number | null }
  kpis: { leads_ativos: number; oportunidades_abertas: number; valor_negociacao: number; valor_ponderado: number; valor_fechado_mes: number; previsto_mes: number; meta_mes: number; gap_meta: number; pct_atingido: number | null; propostas_aguardando_assinatura: number; em_risco: number }
  forecast: { negociacao: number; ponderado: number; fechado: number; previsto_mes: number }
  por_responsavel: { responsavel: string; user_id: number | null; abertas: number; valor: number; ponderado: number; meta: number; realizado: number; win_rate: number | null; ticket_medio: number | null; ciclo_medio: number | null }[]
  alertas: { opportunity_id: number; titulo: string | null; empresa: string | null; severidade: string; tipo: string; texto: string }[]
  oportunidades_risco: { opportunity_id: number; titulo: string | null; empresa: string | null; valor: number; ponderado: number; dias_sem_interacao: number | null; motivos: string[]; diagnostico: string }[]
  tempo_por_etapa: { etapa: string; dias: number | null }[]
  funil: { etapas: { etapa: string; qtd: number; valor: number; conversao: number | null }[] }
  gargalos: { etapa: string; abertas: number; valor_preso: number; mediana_dias: number }[]
  categorias: { commit: number; best_case: number; pipeline: number; omitido: number }
  tendencia: { delta_previsto: number | null; delta_commit: number | null; desde: string | null; historico: { data: string; previsto: number; commit: number; fechado: number }[] }
}

const fmtBRL = (n?: number | null) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const sevColor = (s: string) => s === 'alto' ? { bg: 'var(--danger-bg)', fg: 'var(--danger-border)', dot: '🔴' } : { bg: 'var(--warning-bg)', fg: 'var(--warning-border)', dot: '🟡' }

export default function CrmForecastPage() {
  const [d, setD] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [metasOpen, setMetasOpen] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)
  const load = () => { setLoading(true); api.get<{ data: Forecast }>('/crm/dashboard/forecast').then(r => setD(r?.data ?? null)).catch(() => toast.error('Erro ao carregar forecast')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  const salvarSnapshot = async () => {
    setSnapping(true)
    try { await api.post('/crm/dashboard/forecast/snapshot', {}); toast.success('Snapshot do forecast salvo'); load() }
    catch { toast.error('Erro ao salvar snapshot') } finally { setSnapping(false) }
  }

  const kpi = (label: string, value: string, sub?: string, color = 'var(--text)') => (
    <div className="rounded-xl p-3" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{sub}</p>}
    </div>
  )

  return (
    <AppLayout title="Forecast Comercial">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Forecast & Gestão Comercial</h1>
          {d && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{d.mes}</span>}
        </div>
        <button onClick={() => setMetasOpen(true)} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Target size={14} /> Definir metas</button>
      </div>

      {loading || !d ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
        <div className="space-y-5">
          {/* META vs PREVISTO — o número que ancora tudo */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: `1px solid ${d.meta.valor > 0 ? 'var(--primary)' : 'var(--border)'}` }}>
            {d.meta.valor <= 0 ? (
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sem meta definida para {d.mes}. <b style={{ color: 'var(--text)' }}>O forecast não tem contexto sem meta.</b></p>
                <button onClick={() => setMetasOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Definir meta</button>
              </div>
            ) : (<>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div><p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Meta do mês</p><p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(d.meta.valor)}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Realizado</p><p className="text-lg font-bold tabular-nums" style={{ color: 'var(--success-border)' }}>{fmtBRL(d.meta.realizado)}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Previsto</p><p className="text-lg font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(d.meta.previsto)}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Gap p/ meta</p><p className="text-lg font-bold tabular-nums" style={{ color: d.meta.gap > 0 ? 'var(--danger-border)' : 'var(--success-border)' }}>{d.meta.gap > 0 ? fmtBRL(d.meta.gap) : 'Batida ✓'}</p></div>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-sunken)' }}>
                <div className="h-full" style={{ width: `${Math.min(100, (d.meta.realizado / d.meta.valor) * 100)}%`, background: 'var(--success-border)' }} title="Realizado" />
                <div className="h-full" style={{ width: `${Math.min(100 - (d.meta.realizado / d.meta.valor) * 100, (d.meta.previsto - d.meta.realizado) / d.meta.valor * 100)}%`, background: 'var(--primary)', opacity: 0.5 }} title="Previsto (ponderado)" />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{d.meta.pct_atingido ?? 0}% da meta realizada</p>
            </>)}
          </div>

          {/* KPIs operacionais (secundário ao bloco de meta) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {kpi('Leads ativos', String(d.kpis.leads_ativos))}
            {kpi('Oportunidades abertas', String(d.kpis.oportunidades_abertas))}
            {kpi('Aguardando assinatura', String(d.kpis.propostas_aguardando_assinatura), 'propostas')}
            {kpi('Em risco', String(d.kpis.em_risco), 'oportunidades', d.kpis.em_risco > 0 ? 'var(--danger-border)' : 'var(--text)')}
          </div>

          {/* Forecast detalhado (Nível 2) */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Wallet size={13} /> Forecast detalhado de {d.mes}</p>
            {[['Em negociação', d.forecast.negociacao, 'var(--text-muted)'], ['Previsto ajustado', d.forecast.ponderado, 'var(--primary)'], ['Fechado', d.forecast.fechado, 'var(--success-border)']].map(([label, val, cor]) => {
              const max = Math.max(d.forecast.negociacao, 1)
              return (
                <div key={label as string} className="mb-2">
                  <div className="flex justify-between text-xs mb-0.5"><span style={{ color: 'var(--text-muted)' }}>{label}</span><span className="font-semibold tabular-nums" style={{ color: cor as string }}>{fmtBRL(val as number)}</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (val as number) / max * 100)}%`, background: cor as string }} /></div>
                </div>
              )
            })}
            {d.meta.coverage != null && <p className="text-xs mt-3 pt-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cobertura da meta: <b style={{ color: d.meta.coverage < 3 ? 'var(--warning-border)' : 'var(--success-border)' }}>{d.meta.coverage}x</b>{d.meta.coverage < 3 && ' (abaixo de 3x recomendado)'}</p>}
          </div>

          {/* Funil de conversão — onde os negócios morrem */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Users size={13} /> Funil de conversão</p>
            <div className="flex items-end gap-1">
              {d.funil.etapas.map((e, i) => {
                const max = Math.max(...d.funil.etapas.map(x => x.qtd), 1)
                const baixa = e.conversao != null && e.conversao < 30
                return (
                  <div key={e.etapa} className="flex-1 text-center">
                    {i > 0 && <p className="text-[10px] font-bold mb-1" style={{ color: baixa ? 'var(--danger-border)' : 'var(--text-muted)' }}>↓ {e.conversao}%</p>}
                    <div className="rounded-t-lg mx-auto" style={{ height: `${Math.max(8, e.qtd / max * 90)}px`, width: '100%', background: baixa ? 'var(--danger-bg)' : 'var(--primary-soft)', borderBottom: `2px solid ${baixa ? 'var(--danger-border)' : 'var(--primary)'}` }} />
                    <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text)' }}>{e.qtd}</p>
                    <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>{e.etapa}</p>
                    <p className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(e.valor)}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Gargalos reais por etapa — valor preso + mediana de dias */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Clock size={13} /> Gargalos por etapa (valor preso · mediana de dias)</p>
            <table className="w-full text-xs">
              <thead><tr style={{ color: 'var(--text-light)' }}><th className="text-left font-medium pb-1">Etapa</th><th className="text-right font-medium">Abertas</th><th className="text-right font-medium">Valor preso</th><th className="text-right font-medium">Mediana</th></tr></thead>
              <tbody>
                {d.gargalos.map(g => (
                  <tr key={g.etapa} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-1.5" style={{ color: 'var(--text)' }}>{g.etapa}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{g.abertas}</td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(g.valor_preso)}</td>
                    <td className="text-right tabular-nums" style={{ color: g.mediana_dias > 20 ? 'var(--danger-border)' : g.mediana_dias > 10 ? 'var(--warning-border)' : 'var(--text-muted)' }}>{g.mediana_dias}d</td>
                  </tr>
                ))}
                {d.gargalos.length === 0 && <tr><td colSpan={4} className="py-2 text-center" style={{ color: 'var(--text-light)' }}>—</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Por responsável */}
            <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Users size={13} /> Pipeline por responsável</p>
              <table className="w-full text-xs">
                <thead><tr style={{ color: 'var(--text-light)' }}><th className="text-left font-medium pb-1">Responsável</th><th className="text-right font-medium">Meta</th><th className="text-right font-medium">Realiz.</th><th className="text-right font-medium">%</th><th className="text-right font-medium">Win</th><th className="text-right font-medium">Ticket</th><th className="text-right font-medium">Ciclo</th></tr></thead>
                <tbody>
                  {d.por_responsavel.map(r => {
                    const pct = r.meta > 0 ? Math.round(r.realizado / r.meta * 100) : null
                    return (
                    <tr key={r.user_id ?? r.responsavel} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-1.5" style={{ color: 'var(--text)' }}>{r.responsavel}<span style={{ color: 'var(--text-light)' }}> · {r.abertas} ab.</span></td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.meta > 0 ? fmtBRL(r.meta) : '—'}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--success-border)' }}>{fmtBRL(r.realizado)}</td>
                      <td className="text-right tabular-nums" style={{ color: pct == null ? 'var(--text-light)' : pct >= 100 ? 'var(--success-border)' : pct >= 60 ? 'var(--warning-border)' : 'var(--danger-border)' }}>{pct == null ? '—' : `${pct}%`}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.win_rate == null ? '—' : `${r.win_rate}%`}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.ticket_medio == null ? '—' : fmtBRL(r.ticket_medio)}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.ciclo_medio == null ? '—' : `${r.ciclo_medio}d`}</td>
                    </tr>
                  ) })}
                  {d.por_responsavel.length === 0 && <tr><td colSpan={7} className="py-2 text-center" style={{ color: 'var(--text-light)' }}>—</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Tempo por etapa */}
            <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Clock size={13} /> Tempo médio por etapa (gargalos)</p>
              <div className="space-y-2">
                {d.tempo_por_etapa.map(t => (
                  <div key={t.etapa} className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>{t.etapa}</span>
                    <span className="font-semibold tabular-nums" style={{ color: t.dias == null ? 'var(--text-light)' : t.dias > 20 ? 'var(--danger-border)' : t.dias > 10 ? 'var(--warning-border)' : 'var(--text)' }}>{t.dias == null ? '—' : `${t.dias} dias`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Alertas de gestão */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><AlertTriangle size={13} /> Alertas de gestão ({d.alertas.length})</p>
            <div className="space-y-1.5">
              {d.alertas.map((a, i) => {
                const c = sevColor(a.severidade)
                return (
                  <div key={i} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5" style={{ background: c.bg }}>
                    <span>{c.dot}</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text)' }}><b>{a.empresa || a.titulo || `#${a.opportunity_id}`}</b> — {a.texto}</span>
                  </div>
                )
              })}
              {d.alertas.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum alerta. Pipeline saudável. 🎉</p>}
            </div>
          </div>

          {/* Oportunidades em risco */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--danger-border)' }}><Target size={13} /> Oportunidades em risco ({d.oportunidades_risco.length})</p>
            <div className="space-y-1.5">
              {d.oportunidades_risco.map(o => (
                <div key={o.opportunity_id} className="text-xs rounded-lg px-2.5 py-2" style={{ background: 'var(--danger-bg)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{o.empresa || o.titulo}</span>
                    <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtBRL(o.valor)} · pond. {fmtBRL(o.ponderado)}</span>
                  </div>
                  <p className="mt-0.5" style={{ color: 'var(--danger-border)' }}>{o.diagnostico}</p>
                </div>
              ))}
              {d.oportunidades_risco.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhuma oportunidade em risco.</p>}
            </div>
          </div>

          {/* ANÁLISES AVANÇADAS (Nível 3) — recolhida; não compete com a operação */}
          <div className="rounded-xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <button onClick={() => setAdvOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Análises avançadas</span>
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>{advOpen ? 'ocultar ▾' : 'mostrar ▸'}</span>
            </button>
            {advOpen && (
              <div className="px-4 pb-4 space-y-4">
                {/* Categorias de forecast */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-light)' }}>Categorias de forecast</p>
                    <button onClick={salvarSnapshot} disabled={snapping} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{snapping ? 'Salvando…' : '📸 Salvar snapshot'}</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {([['Comprometido', d.categorias.commit, 'var(--success-border)', 'vai fechar'], ['Melhor cenário', d.categorias.best_case, 'var(--primary)', 'teto otimista'], ['Pipeline', d.categorias.pipeline, 'var(--text-muted)', 'tudo em jogo'], ['Omitido', d.categorias.omitido, 'var(--text-light)', 'fora do forecast']] as const).map(([label, val, cor, hint]) => (
                      <div key={label} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)' }}>
                        <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{label}</p>
                        <p className="text-base font-bold tabular-nums" style={{ color: cor }}>{fmtBRL(val)}</p>
                        <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>{hint}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Tendência / escorregou de período */}
                {d.tendencia.desde && d.tendencia.delta_previsto != null && (
                  <p className="text-xs" style={{ color: d.tendencia.delta_previsto >= 0 ? 'var(--success-border)' : 'var(--danger-border)' }}>
                    {d.tendencia.delta_previsto >= 0 ? '▲' : '▼'} {fmtBRL(Math.abs(d.tendencia.delta_previsto))} no previsto desde {new Date(d.tendencia.desde).toLocaleDateString('pt-BR')} (tendência)
                  </p>
                )}
                <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Win rate, ticket médio e ciclo médio por vendedor estão na tabela "Pipeline por responsável" acima.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {metasOpen && <MetasModal onClose={() => setMetasOpen(false)} onSaved={() => { setMetasOpen(false); load() }} />}
    </AppLayout>
  )
}

// ── Definir metas (empresa + por vendedor) por competência ──────────────────
function MetasModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const ym = new Date().toISOString().slice(0, 7)
  const [periodo, setPeriodo] = useState(ym)
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  const [empresa, setEmpresa] = useState('')
  const [porVend, setPorVend] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get<any>('/users?pageSize=500').then(r => setUsers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((u: any) => ({ id: u.id, name: u.name })))).catch(() => {}) }, [])
  useEffect(() => {
    api.get<{ data: { empresa: number; por_vendedor: Record<string, number> } }>(`/crm/sales-targets?periodo=${periodo}`).then(r => {
      setEmpresa(r?.data?.empresa ? String(r.data.empresa) : '')
      const pv: Record<number, string> = {}; Object.entries(r?.data?.por_vendedor ?? {}).forEach(([k, v]) => { pv[Number(k)] = String(v) })
      setPorVend(pv)
    }).catch(() => {})
  }, [periodo])
  const salvar = async () => {
    setSaving(true)
    try {
      await api.post('/crm/sales-targets', { periodo, user_id: null, valor_meta: empresa ? Number(empresa) : 0 })
      for (const [uid, val] of Object.entries(porVend)) { if (val !== '') await api.post('/crm/sales-targets', { periodo, user_id: Number(uid), valor_meta: Number(val) }) }
      toast.success('Metas salvas'); onSaved()
    } catch { toast.error('Erro ao salvar metas') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Metas comerciais</h2><button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button></div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Competência</label>
        <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={inputStyle} />
        <label className="block text-xs mb-1 font-semibold" style={{ color: 'var(--text)' }}>Meta da empresa (R$)</label>
        <input type="number" value={empresa} onChange={e => setEmpresa(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={inputStyle} />
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-light)' }}>Meta por vendedor (R$)</p>
        <div className="space-y-1.5 mb-4">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-2">
              <span className="flex-1 text-xs truncate" style={{ color: 'var(--text)' }}>{u.name}</span>
              <input type="number" value={porVend[u.id] ?? ''} onChange={e => setPorVend(p => ({ ...p, [u.id]: e.target.value }))} className="w-28 px-2 py-1.5 rounded-lg text-sm outline-none text-right tabular-nums" style={inputStyle} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar metas'}</button>
        </div>
      </div>
    </div>
  )
}
