'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { MultiSelect } from '@/components/ui/multi-select'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { Users, CheckCircle2, UserX, Building2, ChevronUp, ChevronDown } from 'lucide-react'

interface Row {
  cnpj: string; cliente: string; executivo: string | null; no_minutor: boolean
  ultimo_faturamento: string; meses_inativo: number; ativo: boolean; ultimo_valor: number; total_recebido: number
}
interface Resp { ref: string; meses: number; total: number; ativos: number; inativos: number; clientes: Row[] }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtMes = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}` }
const fmtCnpj = (c: string) => c.length === 14
  ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c

type Sort = { key: string; dir: 1 | -1 }
function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR')
}
function Th({ label, sortKey, sort, onSort, right }: { label: string; sortKey: string; sort: Sort; onSort: (k: string) => void; right?: boolean }) {
  const active = sort.key === sortKey
  return (
    <th className="py-2 pr-3" style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: right ? 'right' : 'left' }} onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">{label}{active && (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
    </th>
  )
}

export default function AtividadeClientesPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(2)
  const [soMinutor, setSoMinutor] = useState(false)
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [execFilter, setExecFilter] = useState<string[]>([])
  const [clienteFilter, setClienteFilter] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>({ key: 'meses_inativo', dir: -1 })
  const clickSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: (s.dir === 1 ? -1 : 1) } : { key: k, dir: 1 })

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.get<Resp>(`/relatorios/atividade-clientes?meses=${meses}`)) }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao carregar')) } finally { setLoading(false) }
  }, [meses])
  useEffect(() => { load() }, [load])

  const all = data?.clientes ?? []
  const execOpts = useMemo(() => [...new Set(all.map(r => r.executivo).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(e => ({ id: e, name: e })), [all])
  const clienteOpts = useMemo(() => [...new Set(all.map(r => r.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ id: c, name: c })), [all])

  const rows = useMemo(() => {
    let r = all
    if (situacao === 'ativos') r = r.filter(x => x.ativo)
    else if (situacao === 'inativos') r = r.filter(x => !x.ativo)
    if (soMinutor) r = r.filter(x => x.no_minutor)
    if (execFilter.length) r = r.filter(x => x.executivo && execFilter.includes(x.executivo))
    if (clienteFilter.length) r = r.filter(x => clienteFilter.includes(x.cliente))
    const acc: Record<string, (r: Row) => unknown> = {
      cliente: r => r.cliente, executivo: r => r.executivo, cnpj: r => r.cnpj,
      ultimo_faturamento: r => r.ultimo_faturamento, meses_inativo: r => r.meses_inativo,
      ativo: r => (r.ativo ? 1 : 0), ultimo_valor: r => r.ultimo_valor, total_recebido: r => r.total_recebido,
    }
    const f = acc[sort.key]
    return f ? [...r].sort((a, b) => cmp(f(a), f(b)) * sort.dir) : r
  }, [all, situacao, soMinutor, execFilter, clienteFilter, sort])

  const potencialInativos = useMemo(() => all.filter(r => !r.ativo).reduce((s, r) => s + r.ultimo_valor, 0), [all])

  if (loading) return <AppLayout title="Atividade de Clientes"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>

  return (
    <AppLayout title="Atividade de Clientes">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Todos os clientes com recebimento no Keruak. <span style={{ color: 'var(--success)', fontWeight: 600 }}>Ativo</span> = recebeu nos últimos {data?.meses} meses; <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Inativo</span> = sem receber há {data?.meses}+ meses (oportunidade de reativação). Referência {data ? fmtMes(data.ref) : ''}.
        </p>

        {/* Filtros */}
        <div className="ds-card ds-card-pad flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Inativo se sem receber há</div>
            <select className="ds-input" style={{ width: 'auto' }} value={meses} onChange={e => setMeses(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}+ meses</option>)}
            </select>
          </div>
          <div>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Situação</div>
            <div className="flex gap-1">
              {([['todos', 'Todos'], ['ativos', 'Ativos'], ['inativos', 'Inativos']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setSituacao(k)}
                  className={situacao === k ? 'ds-filter-active' : 'ds-btn-secondary'} style={{ padding: '6px 12px', fontSize: 13 }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 200 }}>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Cliente</div>
            <MultiSelect value={clienteFilter} onChange={setClienteFilter} options={clienteOpts} placeholder="Todos os clientes" />
          </div>
          <div style={{ minWidth: 180 }}>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Executivo</div>
            <MultiSelect value={execFilter} onChange={setExecFilter} options={execOpts} placeholder="Todos os executivos" />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={soMinutor} onChange={e => setSoMinutor(e.target.checked)} /> Só clientes do Minutor
          </label>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="ds-card ds-card-pad flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><CheckCircle2 size={18} /></span>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{data?.ativos ?? 0}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>clientes ativos</div></div>
          </div>
          <div className="ds-card ds-card-pad flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><UserX size={18} /></span>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{data?.inativos ?? 0}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>clientes inativos</div></div>
          </div>
          <div className="ds-card ds-card-pad flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Building2 size={18} /></span>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{brl(potencialInativos)}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>potencial de reativação</div></div>
          </div>
        </div>

        {/* Tabela */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Users size={15} style={{ color: 'var(--primary)' }} /><h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Clientes</h3><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}</span></div>
            {/* Legenda */}
            <div className="flex items-center gap-3" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--success)', display: 'inline-block' }} /> Ativo</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--danger)', display: 'inline-block' }} /> Inativo</span>
            </div>
          </div>
          {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum cliente no filtro atual.</p> : (
            <div style={{ overflowX: 'auto', maxHeight: 620 }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                    <Th label="Situação" sortKey="ativo" sort={sort} onSort={clickSort} />
                    <Th label="Cliente" sortKey="cliente" sort={sort} onSort={clickSort} />
                    <Th label="Executivo" sortKey="executivo" sort={sort} onSort={clickSort} />
                    <Th label="CNPJ" sortKey="cnpj" sort={sort} onSort={clickSort} />
                    <Th label="Último recebimento" sortKey="ultimo_faturamento" sort={sort} onSort={clickSort} />
                    <Th label="Sem receber há" sortKey="meses_inativo" sort={sort} onSort={clickSort} />
                    <Th label="Último valor" sortKey="ultimo_valor" sort={sort} onSort={clickSort} right />
                    <Th label="Total recebido" sortKey="total_recebido" sort={sort} onSort={clickSort} right />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.cnpj} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', background: r.ativo ? undefined : 'var(--danger-bg)' }}>
                      <td className="py-2 pr-3">
                        <span className={r.ativo ? 'ds-status-success' : 'ds-status-danger'} style={{ fontSize: 11 }}>{r.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <div style={{ fontWeight: 600 }}>{r.cliente}{!r.no_minutor && <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 6 }}>(fora do Minutor)</span>}</div>
                      </td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{r.executivo ?? '—'}</td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtCnpj(r.cnpj)}</td>
                      <td className="py-2 pr-3">{fmtMes(r.ultimo_faturamento)}</td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{r.meses_inativo} {r.meses_inativo === 1 ? 'mês' : 'meses'}</td>
                      <td className="py-2 pr-3" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{brl(r.ultimo_valor)}</td>
                      <td className="py-2 pr-3" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{brl(r.total_recebido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
