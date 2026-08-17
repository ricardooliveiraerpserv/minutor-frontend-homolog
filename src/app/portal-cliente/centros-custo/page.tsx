'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import * as XLSX from 'xlsx'
import { Building2, Calculator, BarChart3, Search, Download, ChevronDown } from 'lucide-react'
import { CostCentersManager, portalCostCenterEndpoints } from '@/components/customers/cost-centers-modal'
import { RateioTab } from '@/components/projects/project-view-modal'
import { SearchSelect } from '@/components/ui/search-select'

interface MyProject { id: number; code: string | null; name: string }
interface CCProjeto { project_id: number; code: string | null; name: string; percentual: number; valor: number; project_total: number }
interface CCData { id: number; code: string; description: string; active: boolean; valor_total: number; projetos: CCProjeto[] }

const brl = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (n: number) => `${(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`

type Tab = 'acompanhamento' | 'cadastro' | 'rateio'

export default function PortalCentrosCustoPage() {
  const [tab, setTab] = useState<Tab>('acompanhamento')
  const [projects, setProjects] = useState<MyProject[]>([])
  const [projectId, setProjectId] = useState<number | ''>('')

  useEffect(() => {
    api.get<{ data: MyProject[] }>('/client/portal/my-projects').then(r => setProjects(r.data ?? [])).catch(() => {})
  }, [])

  const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'acompanhamento', label: 'Acompanhamento', icon: BarChart3 },
    { id: 'cadastro',       label: 'Centros de Custo', icon: Building2 },
    { id: 'rateio',         label: 'Rateio por Projeto', icon: Calculator },
  ]

  return (
    <AppLayout title="Centros de Custo">
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b mb-5 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
              style={{ color: tab === t.id ? 'var(--text)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-1px' }}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>

        {tab === 'acompanhamento' && <Acompanhamento />}

        {tab === 'cadastro' && (
          <section className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <CostCentersManager endpoints={portalCostCenterEndpoints} canEdit />
          </section>
        )}

        {tab === 'rateio' && (
          <section className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Calculator size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Rateio por Projeto</h2>
              </div>
              <SearchSelect value={projectId} onChange={v => setProjectId(v ? Number(v) : '')} placeholder="Selecione um projeto…" wide
                options={projects.map(p => ({ id: p.id, name: `${p.code ? p.code + ' · ' : ''}${p.name}` }))} />
            </div>
            {projectId === '' ? (
              <div className="text-center py-8 text-sm rounded-xl" style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
                Escolha um projeto para distribuir o rateio entre seus centros de custo.
              </div>
            ) : (
              <RateioTab key={projectId} projectId={projectId} canEdit pathPrefix="/client/portal/projects" />
            )}
          </section>
        )}
      </div>
    </AppLayout>
  )
}

// ── Acompanhamento: valores por centro de custo, com filtros, 2 visões e Excel ──
function Acompanhamento() {
  const [centers, setCenters] = useState<CCData[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'centro' | 'projeto'>('centro')
  const [q, setQ] = useState('')
  const [fCentro, setFCentro] = useState<number | ''>('')
  const [fProjeto, setFProjeto] = useState<number | ''>('')
  const [soComValor, setSoComValor] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    api.get<{ data: CCData[] }>('/client/portal/cost-centers')
      .then(r => setCenters(r.data ?? []))
      .catch(() => setCenters([]))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (k: string) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  // opções de filtro (projetos únicos)
  const projetoOpts = useMemo(() => {
    const m = new Map<number, string>()
    centers.forEach(c => c.projetos.forEach(p => m.set(p.project_id, `${p.code ? p.code + ' · ' : ''}${p.name}`)))
    return Array.from(m.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [centers])

  const ql = q.trim().toLowerCase()
  const centerMatchesQ = (c: CCData) => !ql || `${c.code} ${c.description}`.toLowerCase().includes(ql)
  const projMatches = (c: CCData, p: CCProjeto) =>
    (!fProjeto || p.project_id === fProjeto) &&
    (!ql || centerMatchesQ(c) || `${p.code ?? ''} ${p.name}`.toLowerCase().includes(ql))

  // Visão POR CENTRO
  const centrosView = useMemo(() => {
    return centers
      .filter(c => !fCentro || c.id === fCentro)
      .map(c => {
        const projs = c.projetos.filter(p => projMatches(c, p))
        const valor = Math.round(projs.reduce((s, p) => s + p.valor, 0) * 100) / 100
        return { c, projs, valor }
      })
      .filter(({ c, projs }) => centerMatchesQ(c) || projs.length > 0)
      .filter(({ valor }) => !soComValor || valor > 0)
      .sort((a, b) => b.valor - a.valor)
  }, [centers, fCentro, fProjeto, ql, soComValor])

  // Visão POR PROJETO (invertida)
  const projetosView = useMemo(() => {
    const map = new Map<number, { id: number; code: string | null; name: string; project_total: number; valor: number; centros: { code: string; description: string; percentual: number; valor: number }[] }>()
    centers.filter(c => !fCentro || c.id === fCentro).forEach(c => {
      c.projetos.filter(p => projMatches(c, p)).forEach(p => {
        let e = map.get(p.project_id)
        if (!e) { e = { id: p.project_id, code: p.code, name: p.name, project_total: p.project_total, valor: 0, centros: [] }; map.set(p.project_id, e) }
        e.valor = Math.round((e.valor + p.valor) * 100) / 100
        e.centros.push({ code: c.code, description: c.description, percentual: p.percentual, valor: p.valor })
      })
    })
    return Array.from(map.values()).filter(e => !soComValor || e.valor > 0).sort((a, b) => b.valor - a.valor)
  }, [centers, fCentro, fProjeto, ql, soComValor])

  // KPIs
  const totalGeral = Math.round(centrosView.reduce((s, x) => s + x.valor, 0) * 100) / 100
  const nCentros = centrosView.filter(x => x.valor > 0).length
  const nProjetos = new Set(centrosView.flatMap(x => x.projs.map(p => p.project_id))).size

  const limpar = () => { setQ(''); setFCentro(''); setFProjeto(''); setSoComValor(false) }
  const temFiltro = ql !== '' || fCentro !== '' || fProjeto !== '' || soComValor

  const exportar = () => {
    const rows = centrosView.flatMap(({ c, projs, valor }) =>
      projs.length
        ? projs.map(p => ({ 'Centro de Custo': c.code, 'Descrição': c.description, 'Projeto': `${p.code ? p.code + ' · ' : ''}${p.name}`, 'Valor Total Projeto': p.project_total, '%': p.percentual, 'Valor Rateado': p.valor }))
        : [{ 'Centro de Custo': c.code, 'Descrição': c.description, 'Projeto': '—', 'Valor Total Projeto': 0, '%': 0, 'Valor Rateado': valor }]
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rateio por Centro')
    XLSX.writeFile(wb, 'acompanhamento_centros_custo.xlsx')
  }

  if (loading) return <div className="text-sm py-10 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Total rateado" value={brl(totalGeral)} accent />
        <Kpi label="Centros com valor" value={String(nCentros)} />
        <Kpi label="Projetos rateados" value={String(nProjetos)} />
      </div>

      {/* Filtros + visão */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar centro ou projeto…"
            className="w-full pl-8 pr-2 py-1.5 rounded-lg text-sm outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
        <SearchSelect value={fCentro} onChange={v => setFCentro(v ? Number(v) : '')} placeholder="Todos os centros" wide
          options={[{ id: '', name: 'Todos os centros' }, ...centers.map(c => ({ id: c.id, name: `${c.code} — ${c.description}` }))]} />
        <SearchSelect value={fProjeto} onChange={v => setFProjeto(v ? Number(v) : '')} placeholder="Todos os projetos" wide
          options={[{ id: '', name: 'Todos os projetos' }, ...projetoOpts.map(p => ({ id: p.id, name: p.label }))]} />
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={soComValor} onChange={e => setSoComValor(e.target.checked)} /> Só com valor
        </label>
        {temFiltro && <button onClick={limpar} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>Limpar</button>}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {([['centro', 'Por Centro'], ['projeto', 'Por Projeto']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{ background: view === v ? 'var(--primary)' : 'transparent', color: view === v ? 'var(--primary-fg)' : 'var(--text-muted)' }}>{l}</button>
            ))}
          </div>
          <button onClick={exportar} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Download size={13} /> Excel
          </button>
        </div>
      </div>

      {/* ── Por Centro de Custo ── */}
      {view === 'centro' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {centrosView.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum centro de custo para os filtros.</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {centrosView.map(({ c, projs, valor }) => {
                const share = totalGeral > 0 ? (valor / totalGeral) * 100 : 0
                const k = `c${c.id}`
                return (
                  <li key={c.id}>
                    <button onClick={() => toggle(k)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--surface-hover)] transition-colors">
                      <ChevronDown size={14} style={{ color: 'var(--text-light)', transform: open.has(k) ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.code} — {c.description}</div>
                        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                          <div style={{ width: `${Math.min(100, share)}%`, height: '100%', background: 'var(--primary)' }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{brl(valor)}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{pct(share)} do total · {projs.length} proj.</div>
                      </div>
                    </button>
                    {open.has(k) && projs.length > 0 && (
                      <div className="px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead><tr style={{ color: 'var(--text-muted)' }}>
                            <th className="text-left font-medium py-1">Projeto</th>
                            <th className="text-right font-medium py-1">Valor Projeto</th>
                            <th className="text-center font-medium py-1">%</th>
                            <th className="text-right font-medium py-1">Rateado</th>
                          </tr></thead>
                          <tbody>
                            {projs.map(p => (
                              <tr key={p.project_id} style={{ borderTop: '1px solid var(--border)' }}>
                                <td className="py-1.5" style={{ color: 'var(--text)' }}>{p.code ? `${p.code} · ` : ''}{p.name}</td>
                                <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{brl(p.project_total)}</td>
                                <td className="py-1.5 text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>{pct(p.percentual)}</td>
                                <td className="py-1.5 text-right tabular-nums font-medium" style={{ color: 'var(--primary)' }}>{brl(p.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                )
              })}
              <li className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface-hover)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Total geral</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{brl(totalGeral)}</span>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* ── Por Projeto ── */}
      {view === 'projeto' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {projetosView.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum projeto rateado para os filtros.</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {projetosView.map(pj => {
                const k = `p${pj.id}`
                const distribuido = pj.project_total > 0 ? (pj.valor / pj.project_total) * 100 : 0
                return (
                  <li key={pj.id}>
                    <button onClick={() => toggle(k)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--surface-hover)] transition-colors">
                      <ChevronDown size={14} style={{ color: 'var(--text-light)', transform: open.has(k) ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{pj.code ? `${pj.code} · ` : ''}{pj.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{pj.centros.length} centro(s) · {pct(distribuido)} rateado</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{brl(pj.valor)}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>de {brl(pj.project_total)}</div>
                      </div>
                    </button>
                    {open.has(k) && (
                      <div className="px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead><tr style={{ color: 'var(--text-muted)' }}>
                            <th className="text-left font-medium py-1">Centro de Custo</th>
                            <th className="text-center font-medium py-1">%</th>
                            <th className="text-right font-medium py-1">Valor</th>
                          </tr></thead>
                          <tbody>
                            {pj.centros.map((cc, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td className="py-1.5" style={{ color: 'var(--text)' }}>{cc.code} — {cc.description}</td>
                                <td className="py-1.5 text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>{pct(cc.percentual)}</td>
                                <td className="py-1.5 text-right tabular-nums font-medium" style={{ color: 'var(--primary)' }}>{brl(cc.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: accent ? 'var(--primary)' : 'var(--text)' }}>{value}</div>
    </div>
  )
}
