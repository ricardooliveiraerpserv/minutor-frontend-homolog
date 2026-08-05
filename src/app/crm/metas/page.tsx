'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Target, TrendingUp, TrendingDown, Plus, FileDown, Copy, Trophy, AlertTriangle, Flame, Wallet, Search, ArrowUpDown, Settings2 } from 'lucide-react'
import { MetaModal } from '@/components/crm/meta-modal'

interface Kpis { meta: number; meta_delta: number | null; realizado: number; realizado_delta: number | null; realizado_pct: number | null; forecast: number; forecast_pct: number | null; falta: number; opps_necessarias: number | null; ticket: number; ticket_delta: number | null; ganhos: number; conversao: number | null; pipeline: number }
interface Evo { dia: number; meta_acum: number; forecast_acum: number; realizado_acum: number | null }
interface Funil { stage: string; ordem: number; count: number; valor: number; pct: number }
interface Rank { user_id: number; name: string; cargo: string | null; meta: number; realizado: number; negocios: number; ticket: number; pipeline: number; forecast: number; pct: number | null; chance: number | null; ultima_venda: string | null }
interface Insights { abaixo_50: number; forecast_pct: number | null; melhor: { name: string; valor: number } | null; maior_oportunidade: { title: string; valor: number } | null; pipeline_total: number; paradas_15d: number; total_responsaveis: number }
interface Team { id: number; name: string }
interface Cockpit { competencia: string; can_edit: boolean; teams: Team[]; team_id: number | null; dias_mes: number; dia_corrente: number; kpis: Kpis; evolucao: Evo[]; funil: Funil[]; ranking: Rank[]; insights: Insights }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRLc = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const curMonth = () => new Date().toISOString().slice(0, 7)
const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

const STATUS = (pct: number | null) => {
  if (pct == null) return { l: 'Sem meta', c: 'var(--text-light)', b: 'var(--surface-sunken)' }
  if (pct >= 100) return { l: 'Acima da meta', c: '#17914e', b: 'rgba(34,197,94,.14)' }
  if (pct >= 70) return { l: 'No caminho', c: 'var(--warning-border)', b: 'var(--warning-bg)' }
  if (pct >= 50) return { l: 'Atenção', c: '#d97706', b: 'rgba(217,119,6,.14)' }
  return { l: 'Abaixo', c: 'var(--danger-border)', b: 'var(--danger-bg)' }
}
const barColor = (pct: number | null) => pct == null ? 'var(--text-light)' : pct >= 100 ? '#17914e' : pct >= 70 ? 'var(--warning-border)' : pct >= 50 ? '#d97706' : 'var(--danger-border)'

function Delta({ v, invert }: { v: number | null; invert?: boolean }) {
  if (v == null) return null
  const up = v >= 0
  const good = invert ? !up : up
  const Icon = up ? TrendingUp : TrendingDown
  return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: good ? '#17914e' : 'var(--danger-border)' }}><Icon size={12} /> {up ? '+' : ''}{v}%</span>
}

// ── Gráfico de evolução (SVG) ────────────────────────────────────────────────
function EvolutionChart({ evo }: { evo: Evo[] }) {
  const W = 640, H = 200, pad = 8
  const max = Math.max(1, ...evo.flatMap(e => [e.meta_acum, e.forecast_acum, e.realizado_acum ?? 0]))
  const x = (d: number) => pad + (d - 1) / Math.max(1, evo.length - 1) * (W - pad * 2)
  const y = (v: number) => H - pad - v / max * (H - pad * 2)
  const line = (key: 'meta_acum' | 'forecast_acum' | 'realizado_acum') => evo
    .filter(e => key !== 'realizado_acum' || e.realizado_acum != null)
    .map(e => `${x(e.dia).toFixed(1)},${y((e[key] as number) ?? 0).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75, 1].map(g => <line key={g} x1={pad} x2={W - pad} y1={y(max * g)} y2={y(max * g)} stroke="var(--border)" strokeWidth={0.5} />)}
      <polyline points={line('meta_acum')} fill="none" stroke="var(--text-light)" strokeWidth={1.5} strokeDasharray="1 0" opacity={0.6} />
      <polyline points={line('forecast_acum')} fill="none" stroke="#17914e" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.9} />
      <polyline points={line('realizado_acum')} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
    </svg>
  )
}

export default function CrmMetasCockpit() {
  const [comp, setComp] = useState(curMonth())
  const [teamId, setTeamId] = useState('')
  const [d, setD] = useState<Cockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: keyof Rank; dir: 1 | -1 }>({ k: 'realizado', dir: -1 })
  const [novaMeta, setNovaMeta] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Cockpit }>(`/crm/metas/cockpit?competencia=${comp}${teamId ? `&team_id=${teamId}` : ''}`)
      .then(r => setD(r?.data ?? null))
      .catch((e: any) => { if (String(e?.message || '').match(/permite|403/)) setDenied(true); else toast.error('Erro ao carregar cockpit') })
      .finally(() => setLoading(false))
  }, [comp, teamId])
  useEffect(() => { load() }, [load])

  const ranking = useMemo(() => {
    if (!d) return []
    const f = d.ranking.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    return [...f].sort((a, b) => {
      const av = a[sort.k] ?? -Infinity, bv = b[sort.k] ?? -Infinity
      if (typeof av === 'string') return String(av).localeCompare(String(bv)) * sort.dir
      return ((av as number) - (bv as number)) * sort.dir
    })
  }, [d, q, sort])

  const toggleSort = (k: keyof Rank) => setSort(s => s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: -1 })

  const exportCsv = () => {
    if (!d) return
    const head = ['Responsável', 'Cargo', 'Meta', 'Realizado', '%', 'Negócios', 'Ticket', 'Pipeline', 'Forecast', 'Última venda']
    const rows = d.ranking.map(r => [r.name, r.cargo ?? '', r.meta, r.realizado, r.pct ?? '', r.negocios, r.ticket, r.pipeline, r.forecast, r.ultima_venda ?? ''])
    const csv = [head, ...rows].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `metas-${comp}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const duplicar = async () => {
    try { const r = await api.post<{ data: { copiadas: number } }>(`/crm/metas/duplicate?competencia=${comp}`, {}); toast.success(`${r.data.copiadas} meta(s) copiada(s) do mês anterior`); load() }
    catch { toast.error('Erro ao duplicar metas') }
  }

  const kpiCards = d ? [
    { label: 'Meta do mês', value: fmtBRL(d.kpis.meta), foot: <Delta v={d.kpis.meta_delta} />, icon: Target, color: 'var(--primary)' },
    { label: 'Realizado', value: fmtBRL(d.kpis.realizado), foot: <div className="flex items-center gap-2"><Delta v={d.kpis.realizado_delta} />{d.kpis.realizado_pct != null && <span className="text-[11px] font-bold" style={{ color: barColor(d.kpis.realizado_pct) }}>{d.kpis.realizado_pct}%</span>}</div>, icon: Wallet, color: '#17914e', bar: d.kpis.realizado_pct },
    { label: 'Forecast', value: fmtBRL(d.kpis.forecast), foot: d.kpis.forecast_pct != null ? <span className="text-[11px] font-bold" style={{ color: d.kpis.forecast_pct >= 100 ? '#17914e' : 'var(--warning-border)' }}>{d.kpis.forecast_pct}% da meta</span> : null, icon: TrendingUp, color: '#17914e' },
    { label: 'Falta para meta', value: fmtBRL(d.kpis.falta), foot: d.kpis.opps_necessarias != null ? <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>~{d.kpis.opps_necessarias} negócios</span> : null, icon: AlertTriangle, color: 'var(--warning-border)' },
    { label: 'Ticket médio', value: fmtBRL(d.kpis.ticket), foot: <Delta v={d.kpis.ticket_delta} />, icon: Wallet, color: 'var(--primary)' },
    { label: 'Negócios ganhos', value: String(d.kpis.ganhos), foot: d.kpis.conversao != null ? <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>conversão {d.kpis.conversao}%</span> : null, icon: Trophy, color: '#17914e' },
  ] : []

  const SORTS: [keyof Rank, string][] = [['name', 'Nome'], ['meta', 'Meta'], ['realizado', 'Realizado'], ['forecast', 'Forecast'], ['negocios', 'Negócios'], ['ticket', 'Ticket']]

  return (
    <AppLayout title="Metas Comerciais (CRM)">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><span>🎯</span> Metas Comerciais</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>Acompanhe metas, performance e projeção comercial.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          {(d?.teams?.length ?? 0) > 0 && (
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: `1px solid ${teamId ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text)' }}>
              <option value="">Todas as equipes</option>
              {d!.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {d?.can_edit && <button onClick={duplicar} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Copy size={14} /> Duplicar mês ant.</button>}
          <button onClick={exportCsv} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><FileDown size={14} /> Exportar</button>
          {d?.can_edit && <a href="/crm/metas-admin" className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Settings2 size={14} /> Gerenciar</a>}
          {d?.can_edit && <button onClick={() => setNovaMeta(true)} className="text-sm rounded-lg px-4 py-2 font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova Meta</button>}
        </div>
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Seu perfil não permite ver metas.</p>
      : loading ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: 'var(--surface-sunken)' }} />)}</div>
      : d && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
          <div className="min-w-0 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {kpiCards.map(c => (
                <div key={c.label} className="rounded-xl p-3.5 transition hover:brightness-[1.06]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-1"><c.icon size={15} style={{ color: c.color }} /></div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                  <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: 'var(--text)' }}>{c.value}</p>
                  {(c as any).bar != null && <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--surface-sunken)' }}><div style={{ width: `${Math.min(100, (c as any).bar ?? 0)}%`, height: '100%', background: barColor((c as any).bar) }} /></div>}
                  <div className="mt-1">{c.foot}</div>
                </div>
              ))}
            </div>

            {/* Gráficos */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Evolução do mês</h3>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-light)' }}>
                    <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: 'var(--primary)' }} /> Realizado</span>
                    <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: '#17914e' }} /> Forecast</span>
                    <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: 'var(--text-light)' }} /> Meta</span>
                  </div>
                </div>
                <EvolutionChart evo={d.evolucao} />
              </div>
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Funil (oportunidades abertas)</h3>
                {d.funil.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-light)' }}>Sem oportunidades abertas no escopo.</p> : (
                  <div className="space-y-2.5">
                    {d.funil.map(f => (
                      <div key={f.stage}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span style={{ color: 'var(--text-muted)' }}>{f.stage} <span style={{ color: 'var(--text-light)' }}>· {f.count}</span></span>
                          <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(f.valor)}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}><div style={{ width: `${Math.max(3, f.pct)}%`, height: '100%', background: 'var(--primary)' }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ranking */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center justify-between gap-2 p-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Ranking comercial</h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-sunken)' }}>
                    <Search size={13} style={{ color: 'var(--text-light)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar vendedor" className="bg-transparent text-sm outline-none w-32" style={{ color: 'var(--text)' }} />
                  </div>
                  <select value={sort.k} onChange={e => setSort({ k: e.target.value as keyof Rank, dir: -1 })} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {SORTS.map(([k, l]) => <option key={k} value={k}>Ordenar: {l}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ color: 'var(--text-light)' }}>
                    {([['name', 'Vendedor', 'left'], ['meta', 'Meta', 'right'], ['realizado', 'Realizado', 'right'], ['pct', 'Atingimento', 'left'], ['negocios', 'Neg.', 'center'], ['ticket', 'Ticket', 'right'], ['pipeline', 'Pipeline', 'right'], ['forecast', 'Forecast', 'right'], ['ultima_venda', 'Últ. venda', 'center'], ['pct', 'Status', 'center']] as [keyof Rank, string, string][]).map(([k, l, al], i) => (
                      <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-${al} whitespace-nowrap cursor-pointer select-none`} onClick={() => toggleSort(k)}>
                        <span className="inline-flex items-center gap-1">{l}{sort.k === k && <ArrowUpDown size={10} />}</span>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {ranking.map(r => {
                      const st = STATUS(r.pct)
                      return (
                        <tr key={r.user_id} className="transition hover:brightness-110" style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{initials(r.name)}</div>
                              <div className="min-w-0"><p className="font-medium truncate" style={{ color: 'var(--text)' }}>{r.name}</p><p className="text-[10px] truncate" style={{ color: 'var(--text-light)' }}>{r.cargo ?? '—'}</p></div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.meta)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(r.realizado)}</td>
                          <td className="px-3 py-2.5" style={{ minWidth: 120 }}>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}><div style={{ width: `${Math.min(100, r.pct ?? 0)}%`, height: '100%', background: barColor(r.pct) }} /></div>
                              <span className="text-[11px] font-bold tabular-nums w-9 text-right" style={{ color: barColor(r.pct) }}>{r.pct == null ? '—' : `${Math.round(r.pct)}%`}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: 'var(--text-light)' }}>{r.negocios}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.ticket)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.pipeline)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: '#17914e' }}>{fmtBRL(r.forecast)}</td>
                          <td className="px-3 py-2.5 text-center text-[11px] tabular-nums" style={{ color: 'var(--text-light)' }}>{fmtDate(r.ultima_venda)}</td>
                          <td className="px-3 py-2.5 text-center"><span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ color: st.c, background: st.b }}>{st.l}</span></td>
                        </tr>
                      )
                    })}
                    {ranking.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum responsável no escopo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Insights */}
          <aside className="space-y-3">
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text)' }}>⚡ Insights</h3>
              <div className="space-y-2.5 text-sm">
                <Insight icon={<AlertTriangle size={14} style={{ color: 'var(--danger-border)' }} />} label={`${d.insights.abaixo_50} vendedor(es) abaixo de 50%`} />
                <Insight icon={<TrendingUp size={14} style={{ color: '#17914e' }} />} label="Forecast geral" value={d.insights.forecast_pct != null ? `${d.insights.forecast_pct}%` : '—'} />
                {d.insights.melhor && <Insight icon={<Trophy size={14} style={{ color: 'var(--warning-border)' }} />} label={`Melhor: ${d.insights.melhor.name}`} value={fmtBRL(d.insights.melhor.valor)} />}
                {d.insights.maior_oportunidade && <Insight icon={<Flame size={14} style={{ color: '#d97706' }} />} label={`Maior aberta: ${d.insights.maior_oportunidade.title}`} value={fmtBRL(d.insights.maior_oportunidade.valor)} />}
                <Insight icon={<Wallet size={14} style={{ color: 'var(--primary)' }} />} label="Pipeline total" value={fmtBRL(d.insights.pipeline_total)} />
                <Insight icon={<AlertTriangle size={14} style={{ color: 'var(--warning-border)' }} />} label={`${d.insights.paradas_15d} parada(s) +15 dias`} />
              </div>
            </div>
            <div className="rounded-xl p-4 text-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
              Realizado e ticket vêm das oportunidades <b>ganhas</b> no mês. Forecast = realizado + pipeline aberto ponderado pela probabilidade.
            </div>
          </aside>
        </div>
      )}

      {novaMeta && d && <MetaModal comp={comp} responsaveis={d.ranking.map(r => ({ id: r.user_id, name: r.name, cargo: r.cargo, meta: r.meta }))} onClose={() => setNovaMeta(false)} onSaved={() => { setNovaMeta(false); load() }} />}
    </AppLayout>
  )
}

function Insight({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex-1 leading-tight" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {value && <span className="font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{value}</span>}
    </div>
  )
}

