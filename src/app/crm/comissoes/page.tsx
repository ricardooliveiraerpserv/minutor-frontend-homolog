'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Percent, TrendingUp, TrendingDown, FileDown, Wallet, Trophy, Search, Info } from 'lucide-react'

interface Kpis { base: number; base_delta: number | null; comissao: number; comissao_delta: number | null; pct_faturamento: number | null; ticket: number; ganhos: number; pipeline: number; maior_comissao: { name: string; valor: number } | null; comissao_media: number; forecast_comissao: number }
interface Evo { mes: string; comissao: number }
interface Dist { name: string; valor: number }
interface Rank { user_id: number; name: string; cargo: string | null; base: number; negocios: number; ticket: number; percentual: number; comissao: number; pipeline: number; forecast_comissao: number }
interface Insights { maior_comissao: { name: string; valor: number } | null; maior_venda: { title: string; valor: number } | null; maior_ticket: any; maior_percentual: any; maior_pipeline: any; comissao_media: number; pendente: number }
interface Cockpit { competencia: string; can_edit: boolean; percentual_padrao: number; has_payment_tracking: boolean; kpis: Kpis; evolucao: Evo[]; distribuicao: Dist[]; ranking: Rank[]; insights: Insights }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const curMonth = () => new Date().toISOString().slice(0, 7)
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const MEDAL = ['🥇', '🥈', '🥉']
const PALETTE = ['var(--primary)', '#17914e', '#d97706', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b']

function Delta({ v }: { v: number | null }) {
  if (v == null) return null
  const up = v >= 0, Icon = up ? TrendingUp : TrendingDown
  return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: up ? '#17914e' : 'var(--danger-border)' }}><Icon size={12} /> {up ? '+' : ''}{v}%</span>
}

function LineChart({ evo }: { evo: Evo[] }) {
  const W = 640, H = 190, pad = 8
  const max = Math.max(1, ...evo.map(e => e.comissao))
  const x = (i: number) => pad + i / Math.max(1, evo.length - 1) * (W - pad * 2)
  const y = (v: number) => H - 20 - v / max * (H - 34)
  const pts = evo.map((e, i) => `${x(i).toFixed(1)},${y(e.comissao).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 190 }} preserveAspectRatio="none">
      {[0.33, 0.66, 1].map(g => <line key={g} x1={pad} x2={W - pad} y1={y(max * g)} y2={y(max * g)} stroke="var(--border)" strokeWidth={0.5} />)}
      <polyline points={`${x(0)},${H - 20} ${pts} ${x(evo.length - 1)},${H - 20}`} fill="var(--primary)" opacity={0.08} />
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
      {evo.map((e, i) => <circle key={i} cx={x(i)} cy={y(e.comissao)} r={2} fill="var(--primary)" />)}
      {evo.map((e, i) => i % 2 === 0 && <text key={'t' + i} x={x(i)} y={H - 6} fontSize={8} textAnchor="middle" fill="var(--text-light)">{e.mes}</text>)}
    </svg>
  )
}

function Donut({ items }: { items: Dist[] }) {
  const total = items.reduce((s, x) => s + x.valor, 0)
  const top = items.slice(0, 7)
  const outros = items.slice(7).reduce((s, x) => s + x.valor, 0)
  const segs = [...top, ...(outros > 0 ? [{ name: 'Outros', valor: outros }] : [])]
  const R = 54, C = 2 * Math.PI * R
  let acc = 0
  if (total <= 0) return <p className="text-xs" style={{ color: 'var(--text-light)' }}>Sem comissão apurada no mês.</p>
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" style={{ width: 130, height: 130 }}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth="16" />
        {segs.map((s, i) => {
          const frac = s.valor / total
          const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="16"
            strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} strokeDashoffset={(-acc * C).toFixed(1)} transform="rotate(-90 70 70)" />
          acc += frac
          return el
        })}
        <text x="70" y="66" fontSize="9" textAnchor="middle" fill="var(--text-light)">Total</text>
        <text x="70" y="80" fontSize="12" fontWeight="700" textAnchor="middle" fill="var(--text)">{fmtBRL(total)}</text>
      </svg>
      <div className="flex-1 min-w-0 space-y-1">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate flex-1" style={{ color: 'var(--text-muted)' }}>{s.name}</span>
            <span className="tabular-nums" style={{ color: 'var(--text-light)' }}>{Math.round(s.valor / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CrmComissoesCockpit() {
  const [comp, setComp] = useState(curMonth())
  const [d, setD] = useState<Cockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [q, setQ] = useState('')
  const [defRate, setDefRate] = useState('')

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Cockpit }>(`/crm/comissoes/cockpit?competencia=${comp}`)
      .then(r => { setD(r?.data ?? null); setDefRate(r?.data ? String(r.data.percentual_padrao) : '') })
      .catch((e: any) => { if (String(e?.message || '').match(/permite|403/)) setDenied(true); else toast.error('Erro ao carregar cockpit') })
      .finally(() => setLoading(false))
  }, [comp])
  useEffect(() => { load() }, [load])

  const ranking = useMemo(() => d ? d.ranking.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase())) : [], [d, q])
  const maxCom = useMemo(() => Math.max(1, ...(d?.ranking.map(r => r.comissao) ?? [1])), [d])

  const saveRate = async (uid: number | null, raw: string) => {
    const v = Number(String(raw).replace(',', '.'))
    if (isNaN(v) || v < 0 || v > 100) { toast.error('Percentual inválido (0–100)'); return }
    try { await api.put('/crm/comissoes/rate', { user_id: uid, percentual: v }); toast.success('Percentual salvo'); load() }
    catch { toast.error('Erro ao salvar percentual') }
  }

  const exportCsv = () => {
    if (!d) return
    const head = ['Responsável', 'Cargo', 'Base', '%', 'Comissão', 'Negócios', 'Ticket', 'Pipeline']
    const rows = d.ranking.map(r => [r.name, r.cargo ?? '', r.base, r.percentual, r.comissao, r.negocios, r.ticket, r.pipeline])
    const csv = [head, ...rows].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `comissoes-${comp}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const cards = d ? [
    { label: 'Base comissionável', value: fmtBRL(d.kpis.base), foot: <Delta v={d.kpis.base_delta} />, icon: Wallet, color: 'var(--primary)' },
    { label: 'Comissão total', value: fmtBRL(d.kpis.comissao), foot: <div className="flex items-center gap-2"><Delta v={d.kpis.comissao_delta} />{d.kpis.pct_faturamento != null && <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{d.kpis.pct_faturamento}% s/ fat.</span>}</div>, icon: Percent, color: '#17914e' },
    { label: 'Forecast de comissão', value: fmtBRL(d.kpis.forecast_comissao), foot: <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>pipeline ponderado</span>, icon: TrendingUp, color: '#17914e' },
    { label: 'Maior comissão', value: d.kpis.maior_comissao ? fmtBRL(d.kpis.maior_comissao.valor) : '—', foot: d.kpis.maior_comissao ? <span className="text-[11px] truncate block" style={{ color: 'var(--text-light)' }}>{d.kpis.maior_comissao.name}</span> : null, icon: Trophy, color: 'var(--warning-border)' },
    { label: 'Comissão média', value: fmtBRL(d.kpis.comissao_media), foot: <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>por vendedor</span>, icon: Percent, color: 'var(--primary)' },
    { label: 'Ticket médio', value: fmtBRL(d.kpis.ticket), foot: <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{d.kpis.ganhos} negócios</span>, icon: Wallet, color: 'var(--primary)' },
  ] : []

  return (
    <AppLayout title="Comissões (CRM)">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><span>💰</span> Comissões</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>Acompanhe remuneração variável, performance comercial e apuração.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={comp} onChange={e => setComp(e.target.value)} className="text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          {d?.can_edit && (
            <div className="flex items-center gap-1 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} title="Percentual padrão da empresa">
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>% padrão</span>
              <input inputMode="decimal" value={defRate} onChange={e => setDefRate(e.target.value)} onBlur={() => d && defRate !== String(d.percentual_padrao) && saveRate(null, defRate)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className="w-12 text-right bg-transparent text-sm outline-none tabular-nums" style={{ color: 'var(--text)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
            </div>
          )}
          <button onClick={exportCsv} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><FileDown size={14} /> Exportar</button>
        </div>
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Seu perfil não permite ver comissões.</p>
      : loading ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: 'var(--surface-sunken)' }} />)}</div>
      : d && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {cards.map(c => (
                <div key={c.label} className="rounded-xl p-3.5 transition hover:brightness-[1.06]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <c.icon size={15} style={{ color: c.color }} className="mb-1" />
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                  <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: 'var(--text)' }}>{c.value}</p>
                  <div className="mt-1">{c.foot}</div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Evolução da comissão (12 meses)</h3>
                <LineChart evo={d.evolucao} />
              </div>
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Distribuição por vendedor</h3>
                <Donut items={d.distribuicao} />
              </div>
            </div>

            {/* Ranking com medalhas */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center justify-between gap-2 p-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Ranking de comissões</h3>
                <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-sunken)' }}>
                  <Search size={13} style={{ color: 'var(--text-light)' }} />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar vendedor" className="bg-transparent text-sm outline-none w-32" style={{ color: 'var(--text)' }} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ color: 'var(--text-light)' }}>
                    {['#', 'Vendedor', 'Base (ganho)', 'Neg.', 'Ticket', 'Pipeline', '%', 'Comissão'].map((h, i) => <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${i >= 2 && i !== 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.user_id} className="transition hover:brightness-110" style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2.5 text-center text-base w-8">{i < 3 && !q ? MEDAL[i] : <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{i + 1}</span>}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{initials(r.name)}</div>
                            <div className="min-w-0"><p className="font-medium truncate" style={{ color: 'var(--text)' }}>{r.name}</p><p className="text-[10px] truncate" style={{ color: 'var(--text-light)' }}>{r.cargo ?? '—'}</p></div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.base)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-light)' }}>{r.negocios}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.ticket)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtBRL(r.pipeline)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {d.can_edit ? (
                            <input inputMode="decimal" defaultValue={String(r.percentual)} onBlur={e => { const v = e.target.value; if (v !== String(r.percentual)) saveRate(r.user_id, v) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className="w-14 text-right rounded-lg px-2 py-1 outline-none tabular-nums" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                          ) : <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.percentual}%</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right" style={{ minWidth: 150 }}>
                          <div className="flex items-center gap-2 justify-end">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[80px]" style={{ background: 'var(--surface-sunken)' }}><div style={{ width: `${r.comissao / maxCom * 100}%`, height: '100%', background: '#17914e' }} /></div>
                            <span className="font-bold tabular-nums whitespace-nowrap w-24 text-right" style={{ color: '#17914e' }}>{fmtBRL(r.comissao)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {ranking.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum responsável no escopo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {!d.has_payment_tracking && (
              <div className="rounded-xl p-3.5 flex items-start gap-2 text-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
                <Info size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--warning-border)' }} />
                <span>Os valores são <b>comissão apurada</b> (base ganha × percentual). O <b>ciclo de pagamento</b> (pago / pendente / bloqueado), <b>políticas avançadas</b> (por cargo, produto, margem, progressiva) e o <b>simulador</b> exigem um novo módulo — próxima fase.</span>
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <h3 className="text-sm font-bold mb-3">⚡ Insights</h3>
              <div className="space-y-2.5 text-sm">
                {d.insights.maior_comissao && <Row label={`Maior comissão: ${d.insights.maior_comissao.name}`} value={fmtBRL(d.insights.maior_comissao.valor)} />}
                {d.insights.maior_venda && <Row label={`Maior venda: ${d.insights.maior_venda.title}`} value={fmtBRL(d.insights.maior_venda.valor)} />}
                {d.insights.maior_ticket?.name && <Row label={`Maior ticket: ${d.insights.maior_ticket.name}`} value={fmtBRL(d.insights.maior_ticket.ticket)} />}
                {d.insights.maior_percentual?.name && <Row label={`Maior %: ${d.insights.maior_percentual.name}`} value={`${d.insights.maior_percentual.percentual}%`} />}
                {d.insights.maior_pipeline?.name && <Row label={`Maior pipeline: ${d.insights.maior_pipeline.name}`} value={fmtBRL(d.insights.maior_pipeline.pipeline)} />}
                <Row label="Comissão média" value={fmtBRL(d.insights.comissao_media)} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex-1 leading-tight" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
