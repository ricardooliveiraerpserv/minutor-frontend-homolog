'use client'

// Atrasos da Integração — apontamentos que chegaram pela integração Movidesk com data
// em competência JÁ FECHADA. Ficam fora do período até aprovação: (a) entrar no período
// (mantém a data) ou (b) mudar a data de inclusão (joga p/ mês aberto + trava a data).

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { Table, Thead, Th, Tbody, Tr, Td, Button, Badge, EmptyState, SkeletonTable } from '@/components/ds'
import { AlertTriangle, Check, CalendarClock, X } from 'lucide-react'

interface AtrasoRow {
  id: number
  date: string
  year_month: string
  colaborador: string
  cliente: string
  projeto: string
  projeto_codigo: string
  ticket: string | null
  horas: number
  observacao: string | null
  date_locked: boolean
}

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
const fmtH = (n: number) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AtrasosIntegracaoPage() {
  const [rows, setRows] = useState<AtrasoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [dateModal, setDateModal] = useState<{ row: AtrasoRow; date: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: AtrasoRow[] }>('/timesheets/atrasos')
      .then(r => setRows(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar atrasos'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const aprovar = async (id: number, action: 'keep' | 'change_date', date?: string) => {
    setBusyId(id)
    try {
      await api.post(`/timesheets/${id}/aprovar-atraso`, { action, ...(date ? { date } : {}) })
      toast.success(action === 'change_date' ? 'Atraso aprovado com a nova data' : 'Atraso aprovado — entrou no período')
      setDateModal(null)
      setRows(rs => rs.filter(r => r.id !== id)) // update otimista
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao aprovar o atraso'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout title="Atrasos da Integração">
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4 text-xs"
          style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', color: 'var(--text-muted)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--warning)', marginTop: 1 }} className="shrink-0" />
          <span>Apontamentos que chegaram pela integração com data em <b>competência já fechada</b>. Eles não entram no período até você aprovar: <b>entrar no período</b> (mantém a data original) ou <b>mudar a data de inclusão</b> (joga para um mês aberto). A nova data fica travada — o reprocessamento da integração não a sobrescreve.</span>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Check} title="Nenhum atraso pendente" description="Não há apontamentos da integração aguardando aprovação de atraso." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Colaborador</Th>
                <Th>Cliente</Th>
                <Th>Projeto</Th>
                <Th>Ticket</Th>
                <Th className="text-right">Horas</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map(r => (
                <Tr key={r.id}>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">{fmtDate(r.date)} <Badge variant="warning">Atraso</Badge></span>
                  </Td>
                  <Td>{r.colaborador}</Td>
                  <Td>{r.cliente}</Td>
                  <Td>
                    <span style={{ color: 'var(--text-light)' }}>{r.projeto_codigo}</span> {r.projeto}
                    {r.observacao ? <span className="block text-xs" style={{ color: 'var(--text-light)' }}>{r.observacao}</span> : null}
                  </Td>
                  <Td>{r.ticket ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{fmtH(r.horas)}</Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1.5 justify-end">
                      <Button size="sm" variant="secondary" icon={CalendarClock} disabled={busyId === r.id} onClick={() => setDateModal({ row: r, date: '' })}>Mudar data</Button>
                      <Button size="sm" variant="primary" icon={Check} loading={busyId === r.id} onClick={() => aprovar(r.id, 'keep')}>Entrar no período</Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      {dateModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={e => { if (e.target === e.currentTarget) setDateModal(null) }}>
          <div className="ds-card w-full max-w-md p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Mudar data de inclusão</p>
              <button onClick={() => setDateModal(null)} style={{ color: 'var(--text-muted)' }} title="Fechar"><X size={18} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              {dateModal.row.colaborador} · {dateModal.row.projeto} · {fmtH(dateModal.row.horas)}h<br />
              Data original: <b>{fmtDate(dateModal.row.date)}</b> (competência fechada)
            </p>
            <label className="text-xs font-medium" style={{ color: 'var(--text-light)' }}>Nova data de inclusão</label>
            <input type="date" value={dateModal.date} onChange={e => setDateModal(d => d ? { ...d, date: e.target.value } : d)} className="ds-input w-full mt-1 mb-1" />
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-light)' }}>A data fica travada — o reprocessamento da integração não vai sobrescrevê-la.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDateModal(null)}>Cancelar</Button>
              <Button size="sm" variant="primary" disabled={!dateModal.date} loading={busyId === dateModal.row.id}
                onClick={() => aprovar(dateModal.row.id, 'change_date', dateModal.date)}>Aprovar com nova data</Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
