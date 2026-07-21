'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { UserX, Search, AlertTriangle, Building2 } from 'lucide-react'

interface Row {
  cnpj: string; cliente: string; executivo: string | null; no_minutor: boolean
  ultimo_faturamento: string; meses_inativo: number; ultimo_valor: number; total_recebido: number
}
interface Resp { ref: string; meses: number; total: number; clientes: Row[] }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtMes = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}` }
const fmtCnpj = (c: string) => c.length === 14
  ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c

export default function ClientesInativosPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(2)
  const [q, setQ] = useState('')
  const [soMinutor, setSoMinutor] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.get<Resp>(`/relatorios/clientes-inativos?meses=${meses}`)) }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao carregar')) } finally { setLoading(false) }
  }, [meses])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    let r = data?.clientes ?? []
    if (soMinutor) r = r.filter(x => x.no_minutor)
    const term = q.trim().toLowerCase()
    if (term) r = r.filter(x => x.cliente.toLowerCase().includes(term) || x.cnpj.includes(term.replace(/\D/g, '')) || (x.executivo ?? '').toLowerCase().includes(term))
    return r
  }, [data, q, soMinutor])

  const potencial = useMemo(() => rows.reduce((s, r) => s + r.ultimo_valor, 0), [rows])
  const mesColor = (m: number) => m >= 6 ? 'var(--danger)' : m >= 3 ? 'var(--warning)' : 'var(--text)'

  if (loading) return <AppLayout title="Clientes Inativos"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>

  return (
    <AppLayout title="Clientes Inativos">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Clientes sem faturamento (última emissão no Keruak) há <strong>{data?.meses}+ meses</strong> — referência {data ? fmtMes(data.ref) : ''}. Oportunidade de reativação.
        </p>

        {/* Filtros */}
        <div className="ds-card ds-card-pad flex flex-wrap items-center gap-3">
          <div>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Sem faturar há</div>
            <select className="ds-input" style={{ width: 'auto' }} value={meses} onChange={e => setMeses(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}+ meses</option>)}
            </select>
          </div>
          <div className="flex-1" style={{ minWidth: 220 }}>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Buscar</div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-light)' }} />
              <input className="ds-input w-full" style={{ paddingLeft: 30 }} placeholder="Cliente, CNPJ ou executivo…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer', marginTop: 18 }}>
            <input type="checkbox" checked={soMinutor} onChange={e => setSoMinutor(e.target.checked)} /> Só clientes do Minutor
          </label>
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
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Executivo</th>
                    <th className="py-2 pr-3">CNPJ</th>
                    <th className="py-2 pr-3">Último faturamento</th>
                    <th className="py-2 pr-3">Meses inativo</th>
                    <th className="py-2 pr-3" style={{ textAlign: 'right' }}>Último valor</th>
                    <th className="py-2 pr-3" style={{ textAlign: 'right' }}>Total recebido</th>
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
