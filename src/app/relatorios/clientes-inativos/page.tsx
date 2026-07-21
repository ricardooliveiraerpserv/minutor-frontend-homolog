'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { MultiSelect } from '@/components/ui/multi-select'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { UserX, AlertTriangle, Building2, ChevronUp, ChevronDown } from 'lucide-react'

interface Row {
  cnpj: string; cliente: string; executivo: string | null; no_minutor: boolean
  ultimo_faturamento: string; meses_inativo: number; ultimo_valor: number; total_recebido: number
}
interface Resp { ref: string; meses: number; total: number; clientes: Row[] }

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

export default function ClientesInativosPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(2)
  const [soMinutor, setSoMinutor] = useState(false)
  const [execFilter, setExecFilter] = useState<string[]>([])
  const [clienteFilter, setClienteFilter] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>({ key: 'meses_inativo', dir: -1 })
  const clickSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: (s.dir === 1 ? -1 : 1) } : { key: k, dir: 1 })

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.get<Resp>(`/relatorios/clientes-inativos?meses=${meses}`)) }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao carregar')) } finally { setLoading(false) }
  }, [meses])
  useEffect(() => { load() }, [load])

  const all = data?.clientes ?? []
  const execOpts = useMemo(() => [...new Set(all.map(r => r.executivo).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(e => ({ id: e, name: e })), [all])
  const clienteOpts = useMemo(() => [...new Set(all.map(r => r.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ id: c, name: c })), [all])

  const rows = useMemo(() => {
    let r = all
    if (soMinutor) r = r.filter(x => x.no_minutor)
    if (execFilter.length) r = r.filter(x => x.executivo && execFilter.includes(x.executivo))
    if (clienteFilter.length) r = r.filter(x => clienteFilter.includes(x.cliente))
    const acc: Record<string, (r: Row) => unknown> = {
      cliente: r => r.cliente, executivo: r => r.executivo, cnpj: r => r.cnpj,
      ultimo_faturamento: r => r.ultimo_faturamento, meses_inativo: r => r.meses_inativo,
      ultimo_valor: r => r.ultimo_valor, total_recebido: r => r.total_recebido,
    }
    const f = acc[sort.key]
    return f ? [...r].sort((a, b) => cmp(f(a), f(b)) * sort.dir) : r
  }, [all, soMinutor, execFilter, clienteFilter, sort])

  const potencial = useMemo(() => rows.reduce((s, r) => s + r.ultimo_valor, 0), [rows])
  const mesColor = (m: number) => m >= 6 ? 'var(--danger)' : m >= 3 ? 'var(--warning)' : 'var(--text)'

  if (loading) return <AppLayout title="Clientes Inativos"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>

  return (
    <AppLayout title="Clientes Inativos">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Clientes sem recebimento (último recebimento no Keruak) há <strong>{data?.meses}+ meses</strong> — referência {data ? fmtMes(data.ref) : ''}. Oportunidade de reativação.
        </p>

        {/* Filtros */}
        <div className="ds-card ds-card-pad flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Sem faturar há</div>
            <select className="ds-input" style={{ width: 'auto' }} value={meses} onChange={e => setMeses(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}+ meses</option>)}
            </select>
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
          {(execFilter.length > 0 || clienteFilter.length > 0 || soMinutor) &&
            <button type="button" onClick={() => { setExecFilter([]); setClienteFilter([]); setSoMinutor(false) }}
              style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', paddingBottom: 10 }}>limpar filtros</button>}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="ds-card ds-card-pad flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><UserX size={18} /></span>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{rows.length}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>clientes inativos</div></div>
          </div>
          <div className="ds-card ds-card-pad flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Building2 size={18} /></span>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{brl(potencial)}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>último faturamento somado (potencial)</div></div>
          </div>
        </div>

        {/* Tabela */}
        <div className="ds-card ds-card-pad">
          {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum cliente inativo no filtro atual.</p> : (
            <div style={{ overflowX: 'auto', maxHeight: 640 }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                    <Th label="Cliente" sortKey="cliente" sort={sort} onSort={clickSort} />
                    <Th label="Executivo" sortKey="executivo" sort={sort} onSort={clickSort} />
                    <Th label="CNPJ" sortKey="cnpj" sort={sort} onSort={clickSort} />
                    <Th label="Último recebimento" sortKey="ultimo_faturamento" sort={sort} onSort={clickSort} />
                    <Th label="Meses inativo" sortKey="meses_inativo" sort={sort} onSort={clickSort} />
                    <Th label="Último valor" sortKey="ultimo_valor" sort={sort} onSort={clickSort} right />
                    <Th label="Total recebido" sortKey="total_recebido" sort={sort} onSort={clickSort} right />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.cnpj} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5" style={{ fontWeight: 600 }}>
                          {r.meses_inativo >= 6 && <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />}
                          {r.cliente}
                          {!r.no_minutor && <span style={{ fontSize: 10, color: 'var(--text-light)' }}>(fora do Minutor)</span>}
                        </div>
                      </td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{r.executivo ?? '—'}</td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtCnpj(r.cnpj)}</td>
                      <td className="py-2 pr-3">{fmtMes(r.ultimo_faturamento)}</td>
                      <td className="py-2 pr-3"><span style={{ fontWeight: 600, color: mesColor(r.meses_inativo) }}>{r.meses_inativo} {r.meses_inativo === 1 ? 'mês' : 'meses'}</span></td>
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
