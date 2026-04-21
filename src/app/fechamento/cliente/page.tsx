'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Lock, RefreshCw, Building2, Printer, FileText } from 'lucide-react'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState,
} from '@/components/ds'
import Image from 'next/image'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ClienteStatus {
  customer_id: number
  nome: string
  status: 'open' | 'closed' | 'sem_registro'
  total_servicos: number
  total_despesas: number
  total_geral: number
  closed_at?: string
  closed_by_name?: string
}

interface ApontamentoRow {
  id: number
  data: string
  colaborador: string
  horas: number
  ticket?: string
  observacao?: string
}

interface ProjetoRow {
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  tipo_contrato: string
  horas: number
  valor_hora: number
  total_receita: number
  apontamentos: ApontamentoRow[]
}

interface ApontamentosData {
  projetos: ProjetoRow[]
  total_horas: number
  total_geral: number
}

type Tab = 'apontamentos' | 'relatorio'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYearMonth(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function fmtYearMonth(ym: string): string {
  const MONTHS = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ]
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]} / ${y}`
}

function fmtYearMonthShort(ym: string): string {
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]}/${y}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const now = new Date()

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FechamentoClientePage() {
  const { user } = useAuth()
  const isAdmin = (user as any)?.type === 'admin'

  const [month, setMonth] = useState<number | null>(now.getMonth() + 1)
  const [year,  setYear]  = useState<number | null>(now.getFullYear())
  const yearMonth = month && year ? toYearMonth(month, year) : ''

  const [clientes, setClientes]     = useState<ClienteStatus[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [status, setStatus]         = useState<ClienteStatus | null>(null)
  const [tab, setTab]               = useState<Tab>('apontamentos')

  const [dados, setDados]           = useState<ApontamentosData | null>(null)
  const [loading, setLoading]       = useState(false)
  const [loadingFechar,  setLoadingFechar]  = useState(false)
  const [loadingReabrir, setLoadingReabrir] = useState(false)

  const printRef = useRef<HTMLDivElement>(null)

  // ── loaders ──

  const loadClientes = useCallback(() => {
    if (!yearMonth) return
    api.get<{ data: ClienteStatus[] }>(`/fechamento-cliente?year_month=${yearMonth}`)
      .then(r => {
        setClientes(r.data ?? [])
        if (customerId) {
          const cur = r.data?.find(c => c.customer_id === customerId)
          setStatus(cur ?? null)
        }
      })
      .catch(() => {})
  }, [yearMonth, customerId])

  const loadDados = useCallback(() => {
    if (!customerId || !yearMonth) return
    setLoading(true)
    api.get<{ data: ApontamentosData }>(`/fechamento-cliente/${customerId}/${yearMonth}/apontamentos`)
      .then(r => setDados(r.data ?? null))
      .catch(() => toast.error('Erro ao carregar apontamentos'))
      .finally(() => setLoading(false))
  }, [customerId, yearMonth])

  // ── efeitos ──

  useEffect(() => {
    loadClientes()
    setDados(null)
  }, [yearMonth])

  useEffect(() => {
    if (!customerId) { setStatus(null); setDados(null); return }
    const found = clientes.find(c => c.customer_id === customerId)
    setStatus(found ?? null)
    setDados(null)
    setTab('apontamentos')
  }, [customerId, clientes])

  useEffect(() => {
    if (customerId && yearMonth) loadDados()
  }, [customerId, yearMonth])

  // ── fechar / reabrir ──

  const handleFechar = () => {
    if (!customerId || !yearMonth) return
    setLoadingFechar(true)
    api.post(`/fechamento-cliente/${customerId}/${yearMonth}/fechar`, {})
      .then(() => { toast.success('Fechamento encerrado!'); loadClientes() })
      .catch(() => toast.error('Erro ao fechar'))
      .finally(() => setLoadingFechar(false))
  }

  const handleReabrir = () => {
    if (!customerId || !yearMonth) return
    setLoadingReabrir(true)
    api.post(`/fechamento-cliente/${customerId}/${yearMonth}/reabrir`, {})
      .then(() => {
        toast.success('Fechamento reaberto.')
        setDados(null)
        loadClientes()
        loadDados()
      })
      .catch(() => toast.error('Erro ao reabrir'))
      .finally(() => setLoadingReabrir(false))
  }

  // ── imprimir ──

  const handlePrint = () => {
    window.print()
  }

  // ── derivados ──

  const isClosed    = status?.status === 'closed'
  const clienteOptions = clientes.map(c => ({ id: c.customer_id, name: c.nome }))
  const projetos    = dados?.projetos ?? []
  const totalHoras  = dados?.total_horas ?? 0
  const totalGeral  = dados?.total_geral ?? 0
  const clienteNome = clientes.find(c => c.customer_id === customerId)?.nome ?? ''

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Fechamento — Clientes">
      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
        }
      `}</style>

      <div className="flex-1 flex flex-col min-h-0 overflow-auto no-print">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Building2 size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>
              Fechamento — Clientes
            </h1>
            {yearMonth && (
              <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                {fmtYearMonthShort(yearMonth)}
              </span>
            )}
            {isClosed && (
              <Badge variant="success">
                <Lock size={10} className="mr-1" /> FECHADO
              </Badge>
            )}
            {status?.status === 'open' && <Badge variant="warning">ABERTO</Badge>}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <SearchSelect
                value={customerId ?? ''}
                onChange={v => setCustomerId(v ? Number(v) : null)}
                options={clienteOptions}
                placeholder="Selecionar cliente..."
              />
              <MonthYearPicker
                month={month}
                year={year}
                onChange={(m, y) => { setMonth(m || null); setYear(y || null) }}
              />
              {isAdmin && customerId && yearMonth && !isClosed && (
                <Button size="sm" onClick={handleFechar} disabled={loadingFechar}
                  style={{ background: 'var(--brand-primary)', color: '#000' }}>
                  {loadingFechar ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                  <span className="ml-1">Fechar</span>
                </Button>
              )}
              {isAdmin && isClosed && (
                <Button size="sm" variant="secondary" onClick={handleReabrir} disabled={loadingReabrir}>
                  {loadingReabrir ? <RefreshCw size={12} className="animate-spin" /> : null}
                  Reabrir
                </Button>
              )}
            </div>
          </div>

          {isClosed && status && (
            <div className="mt-3 px-3 py-2 rounded text-xs"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
              Dados históricos — fechado em {new Date(status.closed_at!).toLocaleDateString('pt-BR')}
              {status.closed_by_name ? ` por ${status.closed_by_name}` : ''}
            </div>
          )}
        </div>

        {!customerId ? (
          <EmptyState icon={Building2} title="Selecione um cliente"
            description="Escolha o cliente e a competência para visualizar o fechamento On Demand." />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-6 border-b" style={{ borderColor: 'var(--brand-border)' }}>
              {([
                { key: 'apontamentos', label: 'Apontamentos' },
                { key: 'relatorio',    label: 'Relatório' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    color: tab === t.key ? 'var(--brand-primary)' : 'var(--brand-muted)',
                    borderBottom: tab === t.key ? '2px solid var(--brand-primary)' : '2px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-6">

              {/* ── Tab Apontamentos ──────────────────────────────────── */}
              {tab === 'apontamentos' && (
                <div>
                  {loading ? (
                    <SkeletonTable rows={6} cols={5} />
                  ) : projetos.length === 0 ? (
                    <EmptyState icon={FileText} title="Sem apontamentos On Demand"
                      description="Nenhum apontamento aprovado em projetos On Demand neste período." />
                  ) : (
                    <div className="space-y-6">
                      {projetos.map(p => (
                        <div key={p.projeto_id}>
                          {/* Cabeçalho do projeto */}
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>
                                {p.projeto_nome}
                              </span>
                              <span className="ml-2 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                                {p.projeto_codigo}
                              </span>
                            </div>
                            <div className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                              {formatBRL(p.valor_hora)}/h
                            </div>
                          </div>

                          <Table>
                            <Thead>
                              <tr>
                                <Th>Data</Th>
                                <Th>Colaborador</Th>
                                <Th>Ticket</Th>
                                <Th>Descrição</Th>
                                <Th right>Horas</Th>
                              </tr>
                            </Thead>
                            <Tbody>
                              {(p.apontamentos ?? []).map(ts => (
                                <Tr key={ts.id}>
                                  <Td muted className="text-xs tabular-nums whitespace-nowrap">
                                    {fmtDate(ts.data)}
                                  </Td>
                                  <Td className="text-xs">{ts.colaborador}</Td>
                                  <Td muted className="text-xs">{ts.ticket ?? '—'}</Td>
                                  <Td muted className="text-xs">{ts.observacao ?? '—'}</Td>
                                  <Td right className="tabular-nums text-xs font-medium">
                                    {ts.horas.toFixed(2)}h
                                  </Td>
                                </Tr>
                              ))}
                              <Tr>
                                <td colSpan={4} className="px-5 py-3 text-right text-xs font-semibold"
                                  style={{ color: 'var(--brand-muted)' }}>
                                  {p.horas.toFixed(2)}h × {formatBRL(p.valor_hora)}/h
                                </td>
                                <Td right className="font-bold tabular-nums"
                                  style={{ color: 'var(--brand-primary)' }}>
                                  {formatBRL(p.total_receita)}
                                </Td>
                              </Tr>
                            </Tbody>
                          </Table>
                        </div>
                      ))}

                      {/* Total geral */}
                      <div className="flex justify-end pt-2">
                        <div className="px-5 py-3 rounded-xl"
                          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                          <span className="text-sm font-semibold mr-4" style={{ color: 'var(--brand-muted)' }}>
                            {totalHoras.toFixed(2)}h · Total On Demand
                          </span>
                          <span className="text-base font-bold tabular-nums"
                            style={{ color: 'var(--brand-primary)' }}>
                            {formatBRL(totalGeral)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab Relatório ──────────────────────────────────────── */}
              {tab === 'relatorio' && (
                <div>
                  {loading ? (
                    <SkeletonTable rows={6} cols={4} />
                  ) : projetos.length === 0 ? (
                    <EmptyState icon={FileText} title="Sem dados para relatório"
                      description="Nenhum apontamento On Demand aprovado neste período." />
                  ) : (
                    <>
                      {/* Botão imprimir */}
                      <div className="flex justify-end mb-4 no-print">
                        <Button size="sm" onClick={handlePrint}
                          style={{ background: 'var(--brand-primary)', color: '#000' }}>
                          <Printer size={13} />
                          <span className="ml-1.5">Imprimir / Salvar PDF</span>
                        </Button>
                      </div>

                      {/* Documento — área de impressão */}
                      <div id="print-area" ref={printRef}>
                        <div className="bg-white text-gray-900 rounded-2xl shadow-lg mx-auto"
                          style={{ maxWidth: 800, fontFamily: 'Arial, sans-serif' }}>

                          {/* Cabeçalho do documento */}
                          <div className="flex items-start justify-between px-10 pt-8 pb-6"
                            style={{ borderBottom: '2px solid #5b21b6' }}>
                            <Image src="/logo.png" alt="ERPSERV Consultoria" width={180} height={72}
                              style={{ objectFit: 'contain' }} />
                            <div className="text-right">
                              <div className="text-xl font-bold text-gray-800 mb-1">
                                Relatório de Fechamento
                              </div>
                              <div className="text-sm text-gray-500">On Demand</div>
                              <div className="mt-2 text-sm text-gray-700">
                                <span className="font-semibold">Cliente:</span> {clienteNome}
                              </div>
                              <div className="text-sm text-gray-700">
                                <span className="font-semibold">Competência:</span>{' '}
                                {yearMonth ? fmtYearMonth(yearMonth) : '—'}
                              </div>
                              {isClosed && status?.closed_at && (
                                <div className="text-xs text-gray-400 mt-1">
                                  Fechado em {new Date(status.closed_at).toLocaleDateString('pt-BR')}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Projetos */}
                          <div className="px-10 py-6 space-y-8">
                            {projetos.map((p, idx) => (
                              <div key={p.projeto_id}>
                                {/* Nome do projeto */}
                                <div className="flex items-baseline justify-between mb-3">
                                  <div>
                                    <span className="text-base font-bold text-gray-800">{p.projeto_nome}</span>
                                    <span className="ml-2 text-xs text-gray-400">{p.projeto_codigo}</span>
                                  </div>
                                  <span className="text-sm text-gray-500">
                                    Valor/hora: <b>{formatBRL(p.valor_hora)}</b>
                                  </span>
                                </div>

                                {/* Tabela de apontamentos */}
                                <table className="w-full text-sm border-collapse">
                                  <thead>
                                    <tr style={{ background: '#f5f3ff' }}>
                                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Data</th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Colaborador</th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Ticket</th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Descrição</th>
                                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Horas</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(p.apontamentos ?? []).map((ts, i) => (
                                      <tr key={ts.id}
                                        style={{ background: i % 2 === 0 ? '#fff' : '#faf9ff', borderBottom: '1px solid #e5e7eb' }}>
                                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                          {fmtDate(ts.data)}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-800">{ts.colaborador}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{ts.ticket ?? '—'}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{ts.observacao ?? '—'}</td>
                                        <td className="px-3 py-2 text-xs text-right font-medium text-gray-800 tabular-nums">
                                          {ts.horas.toFixed(2)}h
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: '#ede9fe', borderTop: '2px solid #5b21b6' }}>
                                      <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">
                                        {p.horas.toFixed(2)}h × {formatBRL(p.valor_hora)}/h =
                                      </td>
                                      <td className="px-3 py-2 text-right text-sm font-bold tabular-nums"
                                        style={{ color: '#5b21b6' }}>
                                        {formatBRL(p.total_receita)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>

                                {/* Separador entre projetos */}
                                {idx < projetos.length - 1 && (
                                  <div className="mt-6 border-t border-dashed border-gray-200" />
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Rodapé — Total */}
                          <div className="px-10 py-6 mx-10 mb-10 rounded-xl"
                            style={{ background: '#5b21b6' }}>
                            <div className="flex items-center justify-between">
                              <div className="text-white">
                                <div className="text-sm font-medium opacity-80">Total de Horas</div>
                                <div className="text-2xl font-bold">{totalHoras.toFixed(2)}h</div>
                              </div>
                              <div className="text-right text-white">
                                <div className="text-sm font-medium opacity-80">Total On Demand</div>
                                <div className="text-3xl font-bold tabular-nums">
                                  {formatBRL(totalGeral)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Rodapé do documento */}
                          <div className="px-10 pb-8 flex justify-between items-center text-xs text-gray-400"
                            style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                            <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
                            <span>
                              Emitido em {new Date().toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
