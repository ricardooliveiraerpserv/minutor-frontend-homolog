'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, ApiError } from '@/lib/api'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useTableSort } from '@/hooks/use-table-sort'
import { toast } from 'sonner'
import { Receipt, RefreshCw, Check, Lock, RotateCcw } from 'lucide-react'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState,
} from '@/components/ds'

interface Row {
  project_id: number
  contract_code: string
  contract_name: string
  customer: string | null
  customer_id: number | null
  executivo: string | null
  coordinators: string[]
  horas_a_aprovar: number
  horas_ajuste: number
  horas_aprovadas: number
  horas_total: number
  pct_aprovado: number
  released: boolean
  auto_released?: boolean
  released_by: string | null
  released_at: string | null
  can_release: boolean
}

const fmtH = (h: number) =>
  `${Number(h ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`

const uniq = (arr: (string | null)[]) =>
  Array.from(new Set(arr.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR'))

/**
 * Painel de Faturamento On Demand (liberação por coordenador/competência).
 * Usado na tela própria e dentro do Portal de Sustentação (onlySustentacao → só sustentação).
 */
export function FaturamentoOnDemandPanel({ onlySustentacao = false }: { onlySustentacao?: boolean }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)

  const [fCliente, setFCliente] = useState('')
  const [fCoord, setFCoord] = useState('')
  const [fExec, setFExec] = useState('')
  const [fStatus, setFStatus] = useState<'all' | 'open' | 'released'>('all')

  const ym = `${year}-${String(month).padStart(2, '0')}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sust = onlySustentacao ? '&only_sustentacao=1' : ''
      const res = await api.get<{ data: Row[]; year_month: string }>(`/on-demand/billing-release?year_month=${ym}${sust}`)
      setRows(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setRows([])
      toast.error('Erro ao carregar contratos On Demand')
    } finally {
      setLoading(false)
    }
  }, [ym, onlySustentacao])

  useEffect(() => { load() }, [load])

  const toggle = async (r: Row) => {
    if (!r.can_release) return
    setSavingId(r.project_id)
    try {
      await api.post('/on-demand/billing-release', { project_id: r.project_id, year_month: ym, released: !r.released })
      toast.success(!r.released ? 'Faturamento liberado' : 'Liberação estornada')
      await load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar a liberação')
    } finally {
      setSavingId(null)
    }
  }

  const clienteOpts = useMemo(() => uniq(rows.map(r => r.customer)).map(n => ({ id: n, name: n })), [rows])
  const coordOpts = useMemo(() => uniq(rows.flatMap(r => r.coordinators || [])).map(n => ({ id: n, name: n })), [rows])
  const execOpts = useMemo(() => uniq(rows.map(r => r.executivo)).map(n => ({ id: n, name: n })), [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (fCliente && r.customer !== fCliente) return false
    if (fCoord && !(r.coordinators || []).includes(fCoord)) return false
    if (fExec && r.executivo !== fExec) return false
    if (fStatus === 'released' && !r.released) return false
    if (fStatus === 'open' && r.released) return false
    return true
  }), [rows, fCliente, fCoord, fExec, fStatus])

  const accessor = useCallback((r: Row, key: string) => {
    if (key === 'coordinators') return (r.coordinators || []).join(', ')
    if (key === 'executivo') return r.executivo || ''
    if (key === 'released') return r.released ? 1 : 0
    return (r as unknown as Record<string, unknown>)[key]
  }, [])
  const { sorted, thProps } = useTableSort(filtered, accessor)

  const StatusBtn = ({ v, label }: { v: 'all' | 'open' | 'released'; label: string }) => (
    <button
      type="button"
      onClick={() => setFStatus(v)}
      className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
      style={{
        background: fStatus === v ? 'var(--primary)' : 'transparent',
        color: fStatus === v ? 'var(--primary-fg)' : 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Receipt size={18} /> Faturamento On Demand{onlySustentacao ? ' — Sustentação' : ''}
          </h2>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            Liberação de faturamento por contrato On Demand e competência. Enquanto o coordenador
            responsável não liberar, o fechamento do cliente não pode ser enviado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthYearPicker month={month} year={year} onChange={(m, y) => { if (m) setMonth(m); if (y) setYear(y) }} />
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load}>Atualizar</Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-56"><SearchSelect value={fCliente} onChange={setFCliente} options={clienteOpts} placeholder="Todos os clientes" /></div>
        <div className="w-52"><SearchSelect value={fCoord} onChange={setFCoord} options={coordOpts} placeholder="Todos os coordenadores" /></div>
        <div className="w-52"><SearchSelect value={fExec} onChange={setFExec} options={execOpts} placeholder="Todos os executivos" /></div>
        <div className="flex items-center gap-1.5">
          <StatusBtn v="all" label="Todos" />
          <StatusBtn v="open" label="Em aberto" />
          <StatusBtn v="released" label="Liberados" />
        </div>
        {(fCliente || fCoord || fExec || fStatus !== 'all') && (
          <button type="button" className="text-xs underline" style={{ color: 'var(--text-light)' }}
            onClick={() => { setFCliente(''); setFCoord(''); setFExec(''); setFStatus('all') }}>
            Limpar filtros
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-light)' }}>{sorted.length} contrato(s)</span>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhum contrato On Demand"
          description="Nenhum contrato On Demand para os filtros / competência selecionados."
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th {...thProps('contract_code')}>Contrato</Th>
              <Th {...thProps('customer')}>Cliente</Th>
              <Th {...thProps('executivo')}>Executivo</Th>
              <Th {...thProps('coordinators')}>Coordenador</Th>
              <Th right {...thProps('horas_a_aprovar')}>A aprovar</Th>
              <Th right {...thProps('horas_ajuste')}>Ajuste</Th>
              <Th right {...thProps('horas_aprovadas')}>Aprovadas</Th>
              <Th right {...thProps('horas_total')}>Total</Th>
              <Th right {...thProps('pct_aprovado')}>% Aprov.</Th>
              <Th {...thProps('released')}>Faturamento</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sorted.map(r => {
              const emAberto = r.horas_a_aprovar > 0 || r.horas_ajuste > 0
              return (
                <Tr key={r.project_id} baseBackground={emAberto ? 'var(--warning-bg)' : undefined}>
                  <Td label="Contrato">
                    <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{r.contract_code}</div>
                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>{r.contract_name}</div>
                  </Td>
                  <Td label="Cliente">{r.customer || '—'}</Td>
                  <Td label="Executivo" muted>{r.executivo || '—'}</Td>
                  <Td label="Coordenador" muted>{r.coordinators?.length ? r.coordinators.join(', ') : '—'}</Td>
                  <Td label="A aprovar" right mono>
                    <span style={{ color: r.horas_a_aprovar > 0 ? 'var(--warning)' : 'var(--text-light)', fontWeight: r.horas_a_aprovar > 0 ? 700 : 400 }}>
                      {fmtH(r.horas_a_aprovar)}
                    </span>
                  </Td>
                  <Td label="Ajuste" right mono>
                    <span style={{ color: r.horas_ajuste > 0 ? 'var(--purple)' : 'var(--text-light)', fontWeight: r.horas_ajuste > 0 ? 700 : 400 }}>
                      {fmtH(r.horas_ajuste)}
                    </span>
                  </Td>
                  <Td label="Aprovadas" right mono>{fmtH(r.horas_aprovadas)}</Td>
                  <Td label="Total" right mono><strong>{fmtH(r.horas_total)}</strong></Td>
                  <Td label="% Aprov." right mono>
                    <span style={{
                      color: r.horas_total <= 0 ? 'var(--text-light)' : r.pct_aprovado >= 100 ? 'var(--success)' : 'var(--warning)',
                      fontWeight: 700,
                    }}>
                      {r.horas_total > 0 ? `${r.pct_aprovado}%` : '—'}
                    </span>
                  </Td>
                  <Td label="Faturamento">
                    {r.released ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="success">Liberado</Badge>
                        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                          {r.auto_released
                            ? 'mês já faturado'
                            : `${r.released_by ? `por ${r.released_by}` : ''}${r.released_at ? ` · ${new Date(r.released_at).toLocaleDateString('pt-BR')}` : ''}`}
                        </span>
                        {r.can_release && (
                          <Button variant="secondary" size="sm" icon={RotateCcw} loading={savingId === r.project_id} onClick={() => toggle(r)}>
                            Estornar liberação
                          </Button>
                        )}
                      </div>
                    ) : r.can_release ? (
                      <Button variant="primary" size="sm" icon={Check} loading={savingId === r.project_id} onClick={() => toggle(r)}>
                        Liberar faturamento
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-light)' }}>
                        <Lock size={12} /> Aguardando coordenador responsável
                      </span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}
    </div>
  )
}
