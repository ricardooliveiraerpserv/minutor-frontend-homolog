'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Lock, RefreshCw, Building2, Printer, FileText, Receipt } from 'lucide-react'
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

interface DespesaRow {
  id: number
  data: string
  descricao: string
  categoria: string
  colaborador: string
  projeto: string
  valor: number
}

type Tab = 'servicos' | 'relatorio' | 'despesas'

const CONTRACT_TYPES = [
  { code: '',             label: 'Todos'          },
  { code: 'on_demand',    label: 'On Demand'      },
  { code: 'fixed_hours',  label: 'Banco de Horas' },
  { code: 'closed',       label: 'Fechado'        },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYearMonth(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function fmtYM(ym: string): string {
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]}/${y}`
}

function fmtYMFull(ym: string): string {
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]} / ${y}`
}

function fmtPeriodo(from: string, to: string): string {
  if (!from || !to) return ''
  return from === to ? fmtYM(to) : `${fmtYM(from)} — ${fmtYM(to)}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const now = new Date()

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FechamentoClientePage() {
  const { user } = useAuth()
  const isAdmin = (user as any)?.type === 'admin'

  // ── Período ──
  const [fromMonth, setFromMonth] = useState<number | null>(now.getMonth() + 1)
  const [fromYear,  setFromYear]  = useState<number | null>(now.getFullYear())
  const [toMonth,   setToMonth]   = useState<number | null>(now.getMonth() + 1)
  const [toYear,    setToYear]    = useState<number | null>(now.getFullYear())

  const fromYM = fromMonth && fromYear ? toYearMonth(fromMonth, fromYear) : ''
  const toYM   = toMonth   && toYear   ? toYearMonth(toMonth,   toYear)   : ''
  const isSingleMonth = fromYM !== '' && fromYM === toYM

  // ── Filtro de contrato ──
  const [contractType, setContractType] = useState<string>('on_demand')

  // ── Seleção de cliente ──
  const [clientes, setClientes]     = useState<ClienteStatus[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [status, setStatus]         = useState<ClienteStatus | null>(null)
  const [tab, setTab]               = useState<Tab>('servicos')

  // ── Dados ──
  const [dados,    setDados]    = useState<ApontamentosData | null>(null)
  const [despesas, setDespesas] = useState<DespesaRow[]>([])

  const [loading,         setLoading]         = useState(false)
  const [loadingDespesas, setLoadingDespesas] = useState(false)
  const [loadingFechar,   setLoadingFechar]   = useState(false)
  const [loadingReabrir,  setLoadingReabrir]  = useState(false)

  // ── Loaders ──

  const loadClientes = useCallback(() => {
    if (!toYM) return
    api.get<{ data: ClienteStatus[] }>(`/fechamento-cliente?year_month=${toYM}`)
      .then(r => {
        setClientes(r.data ?? [])
        if (customerId) {
          setStatus(r.data?.find(c => c.customer_id === customerId) ?? null)
        }
      })
      .catch(() => {})
  }, [toYM, customerId])

  const loadServicos = useCallback(() => {
    if (!customerId || !fromYM || !toYM) return
    setLoading(true)
    const params = new URLSearchParams({ from: fromYM, to: toYM })
    if (contractType) params.set('contract_type', contractType)
    api.get<{ data: ApontamentosData }>(`/fechamento-cliente/${customerId}/${toYM}/apontamentos?${params}`)
      .then(r => setDados(r.data ?? null))
      .catch(() => toast.error('Erro ao carregar apontamentos'))
      .finally(() => setLoading(false))
  }, [customerId, fromYM, toYM, contractType])

  const loadDespesas = useCallback(() => {
    if (!customerId || !fromYM || !toYM) return
    setLoadingDespesas(true)
    const params = new URLSearchParams({ from: fromYM, to: toYM })
    api.get<{ data: DespesaRow[] }>(`/fechamento-cliente/${customerId}/${toYM}/despesas?${params}`)
      .then(r => setDespesas(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setLoadingDespesas(false))
  }, [customerId, fromYM, toYM])

  // ── Efeitos ──

  useEffect(() => {
    loadClientes()
    setDados(null)
    setDespesas([])
  }, [fromYM, toYM])

  useEffect(() => {
    if (!customerId) { setStatus(null); setDados(null); setDespesas([]); return }
    setStatus(clientes.find(c => c.customer_id === customerId) ?? null)
    setDados(null)
    setDespesas([])
    setTab('servicos')
  }, [customerId, clientes])

  useEffect(() => {
    if (customerId && fromYM && toYM) {
      loadServicos()
      loadDespesas()
    }
  }, [customerId, fromYM, toYM, contractType])

  // ── Fechar / Reabrir ──

  const handleFechar = () => {
    if (!customerId || !toYM) return
    setLoadingFechar(true)
    api.post(`/fechamento-cliente/${customerId}/${toYM}/fechar`, {})
      .then(() => { toast.success('Fechamento encerrado!'); loadClientes() })
      .catch(() => toast.error('Erro ao fechar'))
      .finally(() => setLoadingFechar(false))
  }

  const handleReabrir = () => {
    if (!customerId || !toYM) return
    setLoadingReabrir(true)
    api.post(`/fechamento-cliente/${customerId}/${toYM}/reabrir`, {})
      .then(() => {
        toast.success('Fechamento reaberto.')
        setDados(null)
        setDespesas([])
        loadClientes()
        loadServicos()
        loadDespesas()
      })
      .catch(() => toast.error('Erro ao reabrir'))
      .finally(() => setLoadingReabrir(false))
  }

  // ── Imprimir ──

  const handlePrint = (target: 'servicos' | 'despesas') => {
    document.body.setAttribute('data-print', target)
    window.print()
    setTimeout(() => document.body.removeAttribute('data-print'), 500)
  }

  // ── Derivados ──

  const isClosed       = status?.status === 'closed'
  const clienteOptions = clientes.map(c => ({ id: c.customer_id, name: c.nome }))
  const projetos       = dados?.projetos ?? []
  const totalHoras     = dados?.total_horas ?? 0
  const totalGeral     = dados?.total_geral ?? 0
  const totalDespesas  = despesas.reduce((s, d) => s + d.valor, 0)
  const clienteNome    = clientes.find(c => c.customer_id === customerId)?.nome ?? ''
  const periodo        = fmtPeriodo(fromYM, toYM)

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Fechamento On Demand">
      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          body[data-print="servicos"] #print-servicos,
          body[data-print="servicos"] #print-servicos * { visibility: visible !important; }
          body[data-print="servicos"] #print-servicos { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
          body[data-print="despesas"] #print-despesas,
          body[data-print="despesas"] #print-despesas * { visibility: visible !important; }
          body[data-print="despesas"] #print-despesas { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
        }
      `}</style>

      <div className="flex-1 flex flex-col min-h-0 overflow-auto">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Building2 size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>
              Fechamento On Demand
            </h1>
            {periodo && (
              <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>{periodo}</span>
            )}
            {isClosed && isSingleMonth && (
              <Badge variant="success"><Lock size={10} className="mr-1" />FECHADO</Badge>
            )}
            {status?.status === 'open' && isSingleMonth && (
              <Badge variant="warning">ABERTO</Badge>
            )}
          </div>

          {/* Controles: período + cliente + contrato */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            {/* Pickers De/Até */}
            <div className="flex items-center gap-2">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>De</div>
                <MonthYearPicker
                  month={fromMonth}
                  year={fromYear}
                  onChange={(m, y) => {
                    setFromMonth(m || null)
                    setFromYear(y || null)
                    // Garante que toYM >= fromYM
                    if (m && y && toYear && toMonth) {
                      const fYM = toYearMonth(m, y)
                      const tYM = toYearMonth(toMonth, toYear)
                      if (fYM > tYM) { setToMonth(m); setToYear(y) }
                    }
                  }}
                />
              </div>
              <span className="text-sm pb-1" style={{ color: 'var(--brand-subtle)' }}>—</span>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Até</div>
                <MonthYearPicker
                  month={toMonth}
                  year={toYear}
                  onChange={(m, y) => { setToMonth(m || null); setToYear(y || null) }}
                />
              </div>
            </div>

            {/* Filtro tipo de contrato */}
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Contrato</div>
              <div className="flex gap-1">
                {CONTRACT_TYPES.map(ct => (
                  <button
                    key={ct.code}
                    onClick={() => setContractType(ct.code)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      background: contractType === ct.code ? 'var(--brand-primary)' : 'var(--brand-surface)',
                      color:      contractType === ct.code ? '#000' : 'var(--brand-muted)',
                      border:     '1px solid var(--brand-border)',
                    }}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cliente */}
            <div className="ml-auto flex items-end gap-2 flex-wrap">
              <SearchSelect
                value={customerId ?? ''}
                onChange={v => setCustomerId(v ? Number(v) : null)}
                options={clienteOptions}
                placeholder="Selecionar cliente..."
              />
              {isAdmin && customerId && isSingleMonth && !isClosed && (
                <Button size="sm" onClick={handleFechar} disabled={loadingFechar}
                  style={{ background: 'var(--brand-primary)', color: '#000' }}>
                  {loadingFechar ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                  <span className="ml-1">Fechar</span>
                </Button>
              )}
              {isAdmin && isClosed && isSingleMonth && (
                <Button size="sm" variant="secondary" onClick={handleReabrir} disabled={loadingReabrir}>
                  {loadingReabrir ? <RefreshCw size={12} className="animate-spin" /> : null}
                  Reabrir
                </Button>
              )}
            </div>
          </div>

          {isClosed && isSingleMonth && status && (
            <div className="mt-3 px-3 py-2 rounded text-xs"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
              Dados históricos — fechado em {new Date(status.closed_at!).toLocaleDateString('pt-BR')}
              {status.closed_by_name ? ` por ${status.closed_by_name}` : ''}
            </div>
          )}
        </div>

        {!customerId ? (
          <EmptyState icon={Building2} title="Selecione um cliente"
            description="Escolha o cliente e o período para visualizar o fechamento." />
        ) : (
          <>
            {/* ── Tabs ── */}
            <div className="flex gap-1 px-6 border-b" style={{ borderColor: 'var(--brand-border)' }}>
              {([
                { key: 'servicos',  label: 'Apontamentos' },
                { key: 'relatorio', label: 'Relatório Serviços' },
                { key: 'despesas',  label: `Despesas${despesas.length > 0 ? ` (${despesas.length})` : ''}` },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap"
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

              {/* ── Tab Apontamentos ── */}
              {tab === 'servicos' && (
                loading ? <SkeletonTable rows={6} cols={5} /> :
                projetos.length === 0 ? (
                  <EmptyState icon={FileText} title="Sem apontamentos"
                    description="Nenhum apontamento aprovado encontrado no período e filtro selecionados." />
                ) : (
                  <div className="space-y-6">
                    {projetos.map(p => (
                      <div key={p.projeto_id}>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>
                              {p.projeto_nome}
                            </span>
                            <span className="ml-2 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                              {p.projeto_codigo}
                            </span>
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
                              {p.tipo_contrato}
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
                                <Td muted className="text-xs tabular-nums whitespace-nowrap">{fmtDate(ts.data)}</Td>
                                <Td className="text-xs">{ts.colaborador}</Td>
                                <Td muted className="text-xs">{ts.ticket ?? '—'}</Td>
                                <Td muted className="text-xs">{ts.observacao ?? '—'}</Td>
                                <Td right className="tabular-nums text-xs font-medium">{ts.horas.toFixed(2)}h</Td>
                              </Tr>
                            ))}
                            <Tr>
                              <td colSpan={4} className="px-5 py-3 text-right text-xs font-semibold"
                                style={{ color: 'var(--brand-muted)' }}>
                                {p.horas.toFixed(2)}h × {formatBRL(p.valor_hora)}/h
                              </td>
                              <Td right className="font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                                {formatBRL(p.total_receita)}
                              </Td>
                            </Tr>
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                    <div className="flex justify-end pt-2">
                      <div className="px-5 py-3 rounded-xl"
                        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                        <span className="text-sm font-semibold mr-4" style={{ color: 'var(--brand-muted)' }}>
                          {totalHoras.toFixed(2)}h · Total Serviços
                        </span>
                        <span className="text-base font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                          {formatBRL(totalGeral)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* ── Tab Relatório Serviços ── */}
              {tab === 'relatorio' && (
                loading ? <SkeletonTable rows={6} cols={4} /> :
                projetos.length === 0 ? (
                  <EmptyState icon={FileText} title="Sem dados para relatório"
                    description="Nenhum apontamento encontrado no período selecionado." />
                ) : (
                  <>
                    <div className="flex justify-end mb-4">
                      <Button size="sm" onClick={() => handlePrint('servicos')}
                        style={{ background: 'var(--brand-primary)', color: '#000' }}>
                        <Printer size={13} />
                        <span className="ml-1.5">Imprimir / Salvar PDF</span>
                      </Button>
                    </div>
                    <div id="print-servicos">
                      <div className="bg-white text-gray-900 rounded-2xl shadow-lg mx-auto"
                        style={{ maxWidth: 800, fontFamily: 'Arial, sans-serif' }}>
                        <div className="flex items-start justify-between px-10 pt-8 pb-6"
                          style={{ borderBottom: '2px solid #5b21b6' }}>
                          <Image src="/logo.png" alt="ERPSERV" width={180} height={72}
                            style={{ objectFit: 'contain' }} />
                          <div className="text-right">
                            <div className="text-xl font-bold text-gray-800 mb-1">Relatório de Fechamento</div>
                            <div className="text-sm text-gray-500">On Demand — Serviços</div>
                            <div className="mt-2 text-sm text-gray-700">
                              <span className="font-semibold">Cliente:</span> {clienteNome}
                            </div>
                            <div className="text-sm text-gray-700">
                              <span className="font-semibold">Competência:</span>{' '}
                              {fromYM === toYM ? fmtYMFull(toYM) : `${fmtYM(fromYM)} a ${fmtYM(toYM)}`}
                            </div>
                            {isClosed && isSingleMonth && status?.closed_at && (
                              <div className="text-xs text-gray-400 mt-1">
                                Fechado em {new Date(status.closed_at).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="px-10 py-6 space-y-8">
                          {projetos.map((p, idx) => (
                            <div key={p.projeto_id}>
                              <div className="flex items-baseline justify-between mb-3">
                                <div>
                                  <span className="text-base font-bold text-gray-800">{p.projeto_nome}</span>
                                  <span className="ml-2 text-xs text-gray-400">{p.projeto_codigo}</span>
                                </div>
                                <span className="text-sm text-gray-500">
                                  Valor/hora: <b>{formatBRL(p.valor_hora)}</b>
                                </span>
                              </div>
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
                                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(ts.data)}</td>
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
                              {idx < projetos.length - 1 && (
                                <div className="mt-6 border-t border-dashed border-gray-200" />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="px-10 py-6 mx-10 mb-10 rounded-xl" style={{ background: '#5b21b6' }}>
                          <div className="flex items-center justify-between">
                            <div className="text-white">
                              <div className="text-sm font-medium opacity-80">Total de Horas</div>
                              <div className="text-2xl font-bold">{totalHoras.toFixed(2)}h</div>
                            </div>
                            <div className="text-right text-white">
                              <div className="text-sm font-medium opacity-80">Total Serviços</div>
                              <div className="text-3xl font-bold tabular-nums">{formatBRL(totalGeral)}</div>
                            </div>
                          </div>
                        </div>
                        <div className="px-10 pb-8 flex justify-between items-center text-xs text-gray-400"
                          style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                          <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
                          <span>Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )
              )}

              {/* ── Tab Despesas ── */}
              {tab === 'despesas' && (
                loadingDespesas ? <SkeletonTable rows={5} cols={5} /> :
                despesas.length === 0 ? (
                  <EmptyState icon={Receipt} title="Sem despesas"
                    description="Nenhuma despesa aprovada encontrada no período selecionado." />
                ) : (
                  <>
                    <div className="flex justify-end mb-4">
                      <Button size="sm" onClick={() => handlePrint('despesas')}
                        style={{ background: 'var(--brand-primary)', color: '#000' }}>
                        <Printer size={13} />
                        <span className="ml-1.5">Relatório de Despesas</span>
                      </Button>
                    </div>

                    {/* Tabela de despesas (UI) */}
                    <div className="mb-6">
                      <Table>
                        <Thead>
                          <tr>
                            <Th>Data</Th>
                            <Th>Descrição</Th>
                            <Th>Categoria</Th>
                            <Th>Colaborador</Th>
                            <Th>Projeto</Th>
                            <Th right>Valor</Th>
                          </tr>
                        </Thead>
                        <Tbody>
                          {despesas.map(d => (
                            <Tr key={d.id}>
                              <Td muted className="text-xs tabular-nums whitespace-nowrap">{fmtDate(d.data)}</Td>
                              <Td className="text-xs">{d.descricao}</Td>
                              <Td muted className="text-xs">{d.categoria}</Td>
                              <Td muted className="text-xs">{d.colaborador}</Td>
                              <Td muted className="text-xs">{d.projeto}</Td>
                              <Td right className="tabular-nums text-xs font-medium">{formatBRL(d.valor)}</Td>
                            </Tr>
                          ))}
                          <Tr>
                            <td colSpan={5} className="px-5 py-3 text-right text-xs font-bold"
                              style={{ color: 'var(--brand-muted)' }}>
                              TOTAL DESPESAS
                            </td>
                            <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(totalDespesas)}
                            </Td>
                          </Tr>
                        </Tbody>
                      </Table>
                    </div>

                    {/* Documento para impressão */}
                    <div id="print-despesas">
                      <div className="bg-white text-gray-900 rounded-2xl shadow-lg mx-auto"
                        style={{ maxWidth: 800, fontFamily: 'Arial, sans-serif' }}>
                        <div className="flex items-start justify-between px-10 pt-8 pb-6"
                          style={{ borderBottom: '2px solid #5b21b6' }}>
                          <Image src="/logo.png" alt="ERPSERV" width={180} height={72}
                            style={{ objectFit: 'contain' }} />
                          <div className="text-right">
                            <div className="text-xl font-bold text-gray-800 mb-1">Relatório de Despesas</div>
                            <div className="text-sm text-gray-500">Reembolso ao Cliente</div>
                            <div className="mt-2 text-sm text-gray-700">
                              <span className="font-semibold">Cliente:</span> {clienteNome}
                            </div>
                            <div className="text-sm text-gray-700">
                              <span className="font-semibold">Competência:</span>{' '}
                              {fromYM === toYM ? fmtYMFull(toYM) : `${fmtYM(fromYM)} a ${fmtYM(toYM)}`}
                            </div>
                          </div>
                        </div>
                        <div className="px-10 py-6">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr style={{ background: '#f5f3ff' }}>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Data</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Descrição</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Categoria</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Colaborador</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Projeto</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {despesas.map((d, i) => (
                                <tr key={d.id}
                                  style={{ background: i % 2 === 0 ? '#fff' : '#faf9ff', borderBottom: '1px solid #e5e7eb' }}>
                                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(d.data)}</td>
                                  <td className="px-3 py-2 text-xs text-gray-800">{d.descricao}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{d.categoria}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{d.colaborador}</td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{d.projeto}</td>
                                  <td className="px-3 py-2 text-xs text-right font-medium text-gray-800 tabular-nums">
                                    {formatBRL(d.valor)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: '#ede9fe', borderTop: '2px solid #5b21b6' }}>
                                <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">
                                  TOTAL DESPESAS
                                </td>
                                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums"
                                  style={{ color: '#5b21b6' }}>
                                  {formatBRL(totalDespesas)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <div className="px-10 pb-8 flex justify-between items-center text-xs text-gray-400"
                          style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                          <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
                          <span>Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )
              )}

            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
