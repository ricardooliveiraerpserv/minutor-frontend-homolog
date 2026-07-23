'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { MultiSelect } from '@/components/ui/multi-select'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { Users, CheckCircle2, UserX, AlertTriangle, Building2, ChevronUp, ChevronDown, Settings } from 'lucide-react'

type Status = 'ativo' | 'inativando' | 'inativo'
interface Row {
  cnpj: string; cliente: string; executivo: string | null; no_minutor: boolean
  ultimo_faturamento: string; meses_inativo: number; status: Status; ultimo_valor: number; total_recebido: number
}
interface Config { ativo_ate: number; inativo_a_partir: number }
interface Resp { ref: string; config: Config; total: number; ativos: number; inativando: number; inativos: number; clientes: Row[] }

const STATUS: Record<Status, { label: string; cls: string; dot: string }> = {
  ativo: { label: 'Ativo', cls: 'ds-status-success', dot: 'var(--success)' },
  inativando: { label: 'Inativando', cls: 'ds-status-warning', dot: 'var(--warning)' },
  inativo: { label: 'Inativo', cls: 'ds-status-danger', dot: 'var(--danger)' },
}
const STATUS_ORD: Record<Status, number> = { ativo: 0, inativando: 1, inativo: 2 }

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

function Kpi({ icon: Icon, bg, fg, value, label }: { icon: typeof Users; bg: string; fg: string; value: number | string; label: string }) {
  return (
    <div className="ds-card ds-card-pad flex items-center gap-3">
      <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: bg, color: fg }}><Icon size={18} /></span>
      <div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{value}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div></div>
    </div>
  )
}

export default function StatusClientesPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [soMinutor, setSoMinutor] = useState(false)
  const [situacao, setSituacao] = useState<'todos' | Status>('todos')
  const [execFilter, setExecFilter] = useState<string[]>([])
  const [clienteFilter, setClienteFilter] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>({ key: 'meses_inativo', dir: -1 })
  const clickSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: (s.dir === 1 ? -1 : 1) } : { key: k, dir: 1 })

  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgAtivo, setCfgAtivo] = useState('4')
  const [cfgInativo, setCfgInativo] = useState('6')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<Resp>('/relatorios/atividade-clientes')
      setData(r); setCfgAtivo(String(r.config.ativo_ate)); setCfgInativo(String(r.config.inativo_a_partir))
    }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao carregar')) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function saveCfg() {
    const ativo_ate = parseInt(cfgAtivo, 10), inativo_a_partir = parseInt(cfgInativo, 10)
    if (isNaN(ativo_ate) || isNaN(inativo_a_partir)) { toast.error('Informe números válidos'); return }
    if (inativo_a_partir <= ativo_ate) { toast.error('"Inativo a partir de" deve ser maior que "Ativo até"'); return }
    setSaving(true)
    try {
      await api.put('/relatorios/atividade-clientes/config', { ativo_ate, inativo_a_partir })
      toast.success('Limiares salvos'); setCfgOpen(false); load()
    } catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao salvar')) } finally { setSaving(false) }
  }

  const all = data?.clientes ?? []
  const execOpts = useMemo(() => [...new Set(all.map(r => r.executivo).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(e => ({ id: e, name: e })), [all])
  const clienteOpts = useMemo(() => [...new Set(all.map(r => r.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ id: c, name: c })), [all])

  // População = filtros de recorte (cliente / executivo / "Só clientes do Minutor").
  // Os cards resumem ESTA população. Antes usavam os totais fixos da API e ignoravam
  // os filtros — por isso não mudavam. O filtro Situação abaixo é só drill-down da lista.
  const pop = useMemo(() => {
    let r = all
    if (soMinutor) r = r.filter(x => x.no_minutor)
    if (execFilter.length) r = r.filter(x => x.executivo && execFilter.includes(x.executivo))
    if (clienteFilter.length) r = r.filter(x => clienteFilter.includes(x.cliente))
    return r
  }, [all, soMinutor, execFilter, clienteFilter])

  const kpi = useMemo(() => ({
    ativos:     pop.filter(r => r.status === 'ativo').length,
    inativando: pop.filter(r => r.status === 'inativando').length,
    inativos:   pop.filter(r => r.status === 'inativo').length,
    potencial:  pop.filter(r => r.status !== 'ativo').reduce((s, r) => s + r.ultimo_valor, 0),
  }), [pop])

  const rows = useMemo(() => {
    let r = situacao !== 'todos' ? pop.filter(x => x.status === situacao) : pop
    const acc: Record<string, (r: Row) => unknown> = {
      cliente: r => r.cliente, executivo: r => r.executivo, cnpj: r => r.cnpj,
      ultimo_faturamento: r => r.ultimo_faturamento, meses_inativo: r => r.meses_inativo,
      status: r => STATUS_ORD[r.status], ultimo_valor: r => r.ultimo_valor, total_recebido: r => r.total_recebido,
    }
    const f = acc[sort.key]
    return f ? [...r].sort((a, b) => cmp(f(a), f(b)) * sort.dir) : r
  }, [pop, situacao, sort])

  const cfg = data?.config

  if (loading) return <AppLayout title="Status de Clientes"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>

  return (
    <AppLayout title="Status de Clientes">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p className="text-sm" style={{ color: 'var(--text-muted)', flex: 1, minWidth: 280 }}>
            Status por último recebimento no Keruak (referência {data ? fmtMes(data.ref) : ''}):{' '}
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>Ativo</span> (até {cfg?.ativo_ate} meses),{' '}
            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Inativando</span> (entre {(cfg?.ativo_ate ?? 4) + 1} e {(cfg?.inativo_a_partir ?? 6) - 1}),{' '}
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Inativo</span> ({cfg?.inativo_a_partir}+ meses).
          </p>
          <button className="ds-btn-secondary flex items-center gap-1.5" onClick={() => setCfgOpen(true)}><Settings size={15} /> Configurar status</button>
        </div>

        {/* Filtros */}
        <div className="ds-card ds-card-pad flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Situação</div>
            <div className="flex gap-1 flex-wrap">
              {([['todos', 'Todos'], ['ativo', 'Ativo'], ['inativando', 'Inativando'], ['inativo', 'Inativo']] as const).map(([k, label]) => (
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={CheckCircle2} bg="var(--success-bg)" fg="var(--success)" value={kpi.ativos} label="ativos" />
          <Kpi icon={AlertTriangle} bg="var(--warning-bg)" fg="var(--warning)" value={kpi.inativando} label="inativando" />
          <Kpi icon={UserX} bg="var(--danger-bg)" fg="var(--danger)" value={kpi.inativos} label="inativos" />
          <Kpi icon={Building2} bg="var(--primary-soft)" fg="var(--primary)" value={brl(kpi.potencial)} label="potencial reativação" />
        </div>

        {/* Tabela */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Users size={15} style={{ color: 'var(--primary)' }} /><h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Clientes</h3><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}</span></div>
            <div className="flex items-center gap-3" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {(Object.keys(STATUS) as Status[]).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS[s].dot, display: 'inline-block' }} /> {STATUS[s].label}</span>
              ))}
            </div>
          </div>
          {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum cliente no filtro atual.</p> : (
            <div style={{ overflowX: 'auto', maxHeight: 620 }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                    <Th label="Situação" sortKey="status" sort={sort} onSort={clickSort} />
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
                    <tr key={r.cnpj} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', background: r.status === 'inativo' ? 'var(--danger-bg)' : r.status === 'inativando' ? 'var(--warning-bg)' : undefined }}>
                      <td className="py-2 pr-3"><span className={STATUS[r.status].cls} style={{ fontSize: 11 }}>{STATUS[r.status].label}</span></td>
                      <td className="py-2 pr-3"><div style={{ fontWeight: 600 }}>{r.cliente}{!r.no_minutor && <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 6 }}>(fora do Minutor)</span>}</div></td>
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

      {cfgOpen && (
        <Modal open onClose={() => setCfgOpen(false)} size="sm">
          <ModalHeader title="Configurar status do cliente" subtitle="Limiares por meses sem receber (Keruak)" icon={Settings} onClose={() => setCfgOpen(false)} />
          <ModalBody className="space-y-3">
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Ativo — até quantos meses sem receber</div>
              <input className="ds-input" type="number" min={0} max={60} value={cfgAtivo} onChange={e => setCfgAtivo(e.target.value)} />
            </div>
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Inativo — a partir de quantos meses sem receber</div>
              <input className="ds-input" type="number" min={1} max={120} value={cfgInativo} onChange={e => setCfgInativo(e.target.value)} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-light)' }}>
              Entre os dois = <b style={{ color: 'var(--warning)' }}>Inativando</b>. Ex.: 4 e 6 → Ativo (0–4), Inativando (5), Inativo (6+).
            </p>
          </ModalBody>
          <ModalFooter>
            <button className="ds-btn-secondary" onClick={() => setCfgOpen(false)}>Cancelar</button>
            <button className="ds-btn-primary" disabled={saving} onClick={saveCfg}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </ModalFooter>
        </Modal>
      )}
    </AppLayout>
  )
}
