'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, ApiError } from '@/lib/api'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { toast } from 'sonner'
import { Receipt, RefreshCw, Check, Lock } from 'lucide-react'
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
  coordinators: string[]
  horas_a_aprovar: number
  horas_ajuste: number
  horas_aprovadas: number
  horas_total: number
  released: boolean
  released_by: string | null
  released_at: string | null
  can_release: boolean
}

const fmtH = (h: number) =>
  `${Number(h ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`

export default function FaturamentoOnDemandPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)

  const ym = `${year}-${String(month).padStart(2, '0')}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: Row[]; year_month: string }>(`/on-demand/billing-release?year_month=${ym}`)
      setRows(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setRows([])
      toast.error('Erro ao carregar contratos On Demand')
    } finally {
      setLoading(false)
    }
  }, [ym])

  useEffect(() => { load() }, [load])

  const toggle = async (r: Row) => {
    if (!r.can_release) return
    setSavingId(r.project_id)
    try {
      await api.post('/on-demand/billing-release', { project_id: r.project_id, year_month: ym, released: !r.released })
      toast.success(!r.released ? 'Faturamento liberado' : 'Liberação removida')
      await load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar a liberação')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Receipt size={20} /> Faturamento On Demand
            </h1>
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

        {loading ? (
          <SkeletonTable rows={6} cols={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhum contrato On Demand"
            description="Não há contratos On Demand visíveis para você nesta competência."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Contrato</Th>
                <Th>Cliente</Th>
                <Th>Coordenador</Th>
                <Th right>A aprovar</Th>
                <Th right>Ajuste</Th>
                <Th right>Aprovadas</Th>
                <Th right>Total</Th>
                <Th>Faturamento</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map(r => (
                <Tr key={r.project_id}>
                  <Td label="Contrato">
                    <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{r.contract_code}</div>
                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>{r.contract_name}</div>
                  </Td>
                  <Td label="Cliente">{r.customer || '—'}</Td>
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
                  <Td label="Faturamento">
                    {r.released ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="success">Liberado</Badge>
                        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                          {r.released_by ? `por ${r.released_by}` : ''}
                          {r.released_at ? ` · ${new Date(r.released_at).toLocaleDateString('pt-BR')}` : ''}
                        </span>
                        {r.can_release && (
                          <Button variant="ghost" size="sm" loading={savingId === r.project_id} onClick={() => toggle(r)}>
                            Remover
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
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </AppLayout>
  )
}
