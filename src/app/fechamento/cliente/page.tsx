'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import {
  Lock, RefreshCw, Building2, ChevronDown, ChevronRight,
  CheckCircle, Clock, Receipt,
} from 'lucide-react'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState, Card,
} from '@/components/ds'

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

interface ProjetoOnDemand {
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  horas_aprovadas: number
  valor_hora: number
  total_receita: number
  timesheets?: ApontamentoRow[]
}

interface ProjetoBancoHoras {
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  horas_contratadas: number
  horas_aprovadas_no_mes: number
  horas_consumidas_total: number
  excedente_horas: number
  excedente_valor: number
  valor_mensal: number
  total_receita: number
}

interface ProjetoFechado {
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  total_receita: number
}

interface PorTipoData {
  on_demand:   { projetos: ProjetoOnDemand[];  total: number }
  banco_horas: { projetos: ProjetoBancoHoras[]; total: number }
  fechado:     { projetos: ProjetoFechado[];   total: number }
  outros:      { projetos: any[];              total: number }
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

interface PendenciaTS {
  id: number
  tipo: 'timesheet'
  data: string
  colaborador: string
  projeto: string
  horas: number
  status: string
  ticket?: string
  observacao?: string
}

interface PendenciaExp {
  id: number
  tipo: 'expense'
  data: string
  colaborador: string
  projeto: string
  descricao: string
  categoria: string
  valor: number
  status: string
}

interface PendenciasData {
  timesheets: PendenciaTS[]
  despesas: PendenciaExp[]
  total_pendencias: number
}

interface PagamentoInterno {
  user_id: number
  nome: string
  consultant_type: string
  horas: number
  valor_hora: number
  effective_rate: number
  total: number
}

interface PagamentoParceiro {
  partner_id: number
  partner_nome: string
  horas_total: number
  total_a_pagar: number
}

interface PagamentoData {
  internos: PagamentoInterno[]
  parceiros: PagamentoParceiro[]
  total_internos: number
  total_parceiros: number
  total_geral: number
}

type Tab = 'resumo' | 'on_demand' | 'banco_horas' | 'fechado' | 'pagamento' | 'pendencias'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYearMonth(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function fmtYearMonth(ym: string): string {
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]}/${y}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const now = new Date()

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function TabButton({ label, active, onClick, badge }: {
  label: string; active: boolean; onClick: () => void; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-3 text-sm font-medium transition-colors relative"
      style={{
        color: active ? 'var(--brand-primary)' : 'var(--brand-muted)',
        borderBottom: active ? '2px solid var(--brand-primary)' : '2px solid transparent',
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

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
  const [tab, setTab]               = useState<Tab>('resumo')

  const [porTipo, setPorTipo]       = useState<PorTipoData | null>(null)
  const [despesas, setDespesas]     = useState<DespesaRow[]>([])
  const [pendencias, setPendencias] = useState<PendenciasData | null>(null)
  const [pagamento, setPagamento]   = useState<PagamentoData | null>(null)

  const [loadingTipo,      setLoadingTipo]      = useState(false)
  const [loadingDesp,      setLoadingDesp]      = useState(false)
  const [loadingPend,      setLoadingPend]      = useState(false)
  const [loadingPag,       setLoadingPag]       = useState(false)
  const [loadingFechar,    setLoadingFechar]    = useState(false)
  const [loadingReabrir,   setLoadingReabrir]   = useState(false)
  const [approvingId,      setApprovingId]      = useState<number | null>(null)

  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())

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

  const loadPorTipo = useCallback((withTimesheets = false) => {
    if (!customerId || !yearMonth) return
    setLoadingTipo(true)
    const qs = withTimesheets ? '?include_timesheets=true' : ''
    api.get<{ data: PorTipoData }>(`/fechamento-cliente/${customerId}/${yearMonth}/por-tipo${qs}`)
      .then(r => setPorTipo(r.data ?? null))
      .catch(() => toast.error('Erro ao carregar contratos'))
      .finally(() => setLoadingTipo(false))
  }, [customerId, yearMonth])

  const loadDespesas = useCallback(() => {
    if (!customerId || !yearMonth) return
    setLoadingDesp(true)
    api.get<{ data: DespesaRow[] }>(`/fechamento-cliente/${customerId}/${yearMonth}/despesas`)
      .then(r => setDespesas(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setLoadingDesp(false))
  }, [customerId, yearMonth])

  const loadPendencias = useCallback(() => {
    if (!customerId || !yearMonth) return
    setLoadingPend(true)
    api.get<{ data: PendenciasData }>(`/fechamento-cliente/${customerId}/${yearMonth}/pendencias`)
      .then(r => setPendencias(r.data ?? null))
      .catch(() => toast.error('Erro ao carregar pendências'))
      .finally(() => setLoadingPend(false))
  }, [customerId, yearMonth])

  const loadPagamento = useCallback(() => {
    if (!customerId || !yearMonth) return
    setLoadingPag(true)
    api.get<{ data: PagamentoData }>(`/fechamento-cliente/${customerId}/${yearMonth}/pagamento`)
      .then(r => setPagamento(r.data ?? null))
      .catch(() => toast.error('Erro ao carregar pagamento'))
      .finally(() => setLoadingPag(false))
  }, [customerId, yearMonth])

  // ── efeitos ──

  useEffect(() => {
    loadClientes()
    setPorTipo(null); setDespesas([]); setPendencias(null); setPagamento(null)
  }, [yearMonth])

  useEffect(() => {
    if (!customerId) { setStatus(null); return }
    const found = clientes.find(c => c.customer_id === customerId)
    setStatus(found ?? null)
    setPorTipo(null); setDespesas([]); setPendencias(null); setPagamento(null)
    setExpandedProjects(new Set())
    setTab('resumo')
  }, [customerId, clientes])

  useEffect(() => {
    if (!customerId || !yearMonth) return
    if (tab === 'resumo' || tab === 'on_demand' || tab === 'banco_horas' || tab === 'fechado') {
      if (!porTipo) {
        const withTs = tab === 'on_demand'
        loadPorTipo(withTs)
      } else if (tab === 'on_demand' && porTipo.on_demand.projetos.length > 0
                 && !porTipo.on_demand.projetos[0].timesheets) {
        loadPorTipo(true)
      }
    }
    if (tab === 'resumo') {
      if (!despesas.length) loadDespesas()
    }
    if (tab === 'pendencias') loadPendencias()
    if (tab === 'pagamento')  { if (!pagamento) loadPagamento() }
  }, [tab, customerId, yearMonth])

  // carregar resumo ao selecionar cliente
  useEffect(() => {
    if (customerId && yearMonth) {
      loadPorTipo(false)
      loadDespesas()
      loadPendencias()
    }
  }, [customerId])

  // ── toggle expansão ──

  const toggleProject = (id: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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
        setPorTipo(null); setDespesas([]); setPendencias(null); setPagamento(null)
        loadClientes()
        loadPorTipo(false)
        loadDespesas()
        loadPendencias()
      })
      .catch(() => toast.error('Erro ao reabrir'))
      .finally(() => setLoadingReabrir(false))
  }

  // ── aprovar pendência ──

  const handleApprove = async (item: PendenciaTS | PendenciaExp) => {
    setApprovingId(item.id)
    try {
      const path = item.tipo === 'timesheet'
        ? `/timesheets/${item.id}/approve`
        : `/expenses/${item.id}/approve`
      await api.post(path, {})
      toast.success('Aprovado com sucesso')
      loadPendencias()
    } catch {
      toast.error('Erro ao aprovar')
    } finally {
      setApprovingId(null)
    }
  }

  // ── derivados ──

  const isClosed = status?.status === 'closed'
  const clienteOptions = clientes.map(c => ({ id: c.customer_id, name: c.nome }))

  const totalServicos = porTipo
    ? (porTipo.on_demand?.total ?? 0) + (porTipo.banco_horas?.total ?? 0)
      + (porTipo.fechado?.total ?? 0) + (porTipo.outros?.total ?? 0)
    : 0
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0)
  const totalGeral = totalServicos + totalDespesas
  const totalPendencias = pendencias?.total_pendencias ?? 0

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Fechamento — Clientes">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Building2 size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>
              Fechamento — Clientes
            </h1>
            {yearMonth && (
              <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                {fmtYearMonth(yearMonth)}
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
            description="Escolha o cliente e a competência para visualizar o fechamento." />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-6 border-b overflow-x-auto"
              style={{ borderColor: 'var(--brand-border)' }}>
              <TabButton label="Resumo"           active={tab === 'resumo'}      onClick={() => setTab('resumo')} />
              <TabButton label="On Demand"        active={tab === 'on_demand'}   onClick={() => setTab('on_demand')} />
              <TabButton label="Banco de Horas"   active={tab === 'banco_horas'} onClick={() => setTab('banco_horas')} />
              <TabButton label="Contrato Fixo"    active={tab === 'fechado'}     onClick={() => setTab('fechado')} />
              <TabButton label="Pagamento"        active={tab === 'pagamento'}   onClick={() => setTab('pagamento')} />
              <TabButton label="Pendências"       active={tab === 'pendencias'}  onClick={() => setTab('pendencias')}
                badge={totalPendencias} />
            </div>

            <div className="flex-1 overflow-auto p-6">

              {/* ── Tab Resumo ─────────────────────────────────────────────── */}
              {tab === 'resumo' && (
                <div className="max-w-2xl">
                  {loadingTipo ? <SkeletonTable rows={4} cols={3} /> : (
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Tipo de Faturamento</Th>
                          <Th right>Projetos</Th>
                          <Th right>Total</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        <Tr>
                          <Td>On Demand</Td>
                          <Td right muted>{porTipo?.on_demand?.projetos?.length ?? 0}</Td>
                          <Td right className="tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>
                            {formatBRL(porTipo?.on_demand?.total ?? 0)}
                          </Td>
                        </Tr>
                        <Tr>
                          <Td>Banco de Horas</Td>
                          <Td right muted>{porTipo?.banco_horas?.projetos?.length ?? 0}</Td>
                          <Td right className="tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>
                            {formatBRL(porTipo?.banco_horas?.total ?? 0)}
                          </Td>
                        </Tr>
                        <Tr>
                          <Td>Contrato Fixo</Td>
                          <Td right muted>{porTipo?.fechado?.projetos?.length ?? 0}</Td>
                          <Td right className="tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>
                            {formatBRL(porTipo?.fechado?.total ?? 0)}
                          </Td>
                        </Tr>
                        {(porTipo?.outros?.projetos?.length ?? 0) > 0 && (
                          <Tr>
                            <Td>Outros</Td>
                            <Td right muted>{porTipo!.outros.projetos.length}</Td>
                            <Td right className="tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(porTipo!.outros.total)}
                            </Td>
                          </Tr>
                        )}
                        <Tr>
                          <Td><span className="font-semibold">Total Serviços</span></Td>
                          <Td right />
                          <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>
                            {formatBRL(totalServicos)}
                          </Td>
                        </Tr>
                        <Tr>
                          <Td muted>Despesas Reembolsáveis</Td>
                          <Td right muted>{despesas.length}</Td>
                          <Td right className="tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                            {formatBRL(totalDespesas)}
                          </Td>
                        </Tr>
                        <Tr>
                          <Td>
                            <span className="text-base font-bold" style={{ color: 'var(--brand-primary)' }}>
                              TOTAL FATURA
                            </span>
                          </Td>
                          <Td right />
                          <Td right>
                            <span className="text-base tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(totalGeral)}
                            </span>
                          </Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  )}
                </div>
              )}

              {/* ── Tab On Demand ──────────────────────────────────────────── */}
              {tab === 'on_demand' && (
                <div>
                  {loadingTipo ? <SkeletonTable rows={5} cols={4} /> : (
                    !porTipo?.on_demand?.projetos?.length ? (
                      <EmptyState icon={Receipt} title="Sem projetos On Demand"
                        description="Nenhum projeto On Demand com apontamentos aprovados neste período." />
                    ) : (
                      <Table>
                        <Thead>
                          <tr>
                            <Th>Projeto</Th>
                            <Th right>Horas Aprov.</Th>
                            <Th right>Valor/h</Th>
                            <Th right>Total</Th>
                          </tr>
                        </Thead>
                        <Tbody>
                          {porTipo.on_demand.projetos.map(p => {
                            const expanded = expandedProjects.has(p.projeto_id)
                            return (
                              <>
                                <Tr key={p.projeto_id} onClick={() => toggleProject(p.projeto_id)}>
                                  <Td>
                                    <div className="flex items-center gap-2">
                                      {expanded
                                        ? <ChevronDown size={14} style={{ color: 'var(--brand-primary)' }} />
                                        : <ChevronRight size={14} style={{ color: 'var(--brand-muted)' }} />
                                      }
                                      <div>
                                        <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                                          {p.projeto_nome}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                                          {p.projeto_codigo}
                                        </div>
                                      </div>
                                    </div>
                                  </Td>
                                  <Td right className="tabular-nums text-xs">{p.horas_aprovadas.toFixed(2)}h</Td>
                                  <Td right className="tabular-nums text-xs">{formatBRL(p.valor_hora)}/h</Td>
                                  <Td right className="tabular-nums text-sm font-semibold"
                                    style={{ color: 'var(--brand-primary)' }}>
                                    {formatBRL(p.total_receita)}
                                  </Td>
                                </Tr>
                                {expanded && p.timesheets && p.timesheets.map(ts => (
                                  <Tr key={`ts-${ts.id}`}>
                                    <Td>
                                      <div className="pl-10 flex flex-col gap-0.5">
                                        <div className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                                          {fmtDate(ts.data)} · {ts.colaborador}
                                        </div>
                                        {ts.ticket && (
                                          <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                                            #{ts.ticket}
                                          </div>
                                        )}
                                        {ts.observacao && (
                                          <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                                            {ts.observacao}
                                          </div>
                                        )}
                                      </div>
                                    </Td>
                                    <Td right className="tabular-nums text-xs" muted>{ts.horas.toFixed(2)}h</Td>
                                    <Td right />
                                    <Td right />
                                  </Tr>
                                ))}
                                {expanded && !p.timesheets && (
                                  <Tr key={`ts-loading-${p.projeto_id}`}>
                                    <td colSpan={4} className="px-5 py-2">
                                      <div className="pl-10 text-xs" style={{ color: 'var(--brand-muted)' }}>
                                        Carregando apontamentos...
                                      </div>
                                    </td>
                                  </Tr>
                                )}
                              </>
                            )
                          })}
                          <Tr>
                            <Td><span className="font-semibold">Total On Demand</span></Td>
                            <Td right />
                            <Td right />
                            <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(porTipo.on_demand.total)}
                            </Td>
                          </Tr>
                        </Tbody>
                      </Table>
                    )
                  )}
                </div>
              )}

              {/* ── Tab Banco de Horas ─────────────────────────────────────── */}
              {tab === 'banco_horas' && (
                <div>
                  {loadingTipo ? <SkeletonTable rows={3} cols={2} /> : (
                    !porTipo?.banco_horas?.projetos?.length ? (
                      <EmptyState icon={Clock} title="Sem projetos Banco de Horas"
                        description="Nenhum projeto em banco de horas com apontamentos aprovados neste período." />
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {porTipo.banco_horas.projetos.map(p => {
                          const saldo = p.horas_contratadas - p.horas_consumidas_total
                          const negativo = saldo < 0
                          return (
                            <Card key={p.projeto_id} padding="md">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>
                                    {p.projeto_nome}
                                  </div>
                                  <div className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                                    {p.projeto_codigo}
                                  </div>
                                </div>
                                <Badge variant="primary">Banco de Horas</Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                <div>
                                  <div style={{ color: 'var(--brand-muted)' }}>Contratado</div>
                                  <div className="font-semibold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                                    {p.horas_contratadas.toFixed(0)}h
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--brand-muted)' }}>Consumido total</div>
                                  <div className="font-semibold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                                    {p.horas_consumidas_total.toFixed(2)}h
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--brand-muted)' }}>No mês</div>
                                  <div className="font-semibold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                                    {p.horas_aprovadas_no_mes.toFixed(2)}h
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--brand-muted)' }}>Saldo</div>
                                  <div className="font-semibold tabular-nums"
                                    style={{ color: negativo ? '#EF4444' : '#10B981' }}>
                                    {negativo ? '' : '+'}{saldo.toFixed(2)}h
                                  </div>
                                </div>
                              </div>

                              <div className="border-t pt-3 space-y-1.5" style={{ borderColor: 'var(--brand-border)' }}>
                                <div className="flex justify-between text-xs">
                                  <span style={{ color: 'var(--brand-muted)' }}>Mensalidade</span>
                                  <span className="tabular-nums" style={{ color: 'var(--brand-text)' }}>
                                    {formatBRL(p.valor_mensal)}
                                  </span>
                                </div>
                                {p.excedente_horas > 0 && (
                                  <div className="flex justify-between text-xs">
                                    <span style={{ color: '#EF4444' }}>
                                      Excedente {p.excedente_horas.toFixed(2)}h
                                    </span>
                                    <span className="tabular-nums" style={{ color: '#EF4444' }}>
                                      {formatBRL(p.excedente_valor)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm font-bold pt-1">
                                  <span style={{ color: 'var(--brand-text)' }}>TOTAL</span>
                                  <span className="tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                                    {formatBRL(p.total_receita)}
                                  </span>
                                </div>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                    )
                  )}
                  {porTipo && porTipo.banco_horas.projetos.length > 0 && (
                    <div className="mt-4 text-right text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>
                      Total Banco de Horas: {formatBRL(porTipo.banco_horas.total)}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab Contrato Fixo ──────────────────────────────────────── */}
              {tab === 'fechado' && (
                <div>
                  {loadingTipo ? <SkeletonTable rows={3} cols={2} /> : (
                    !porTipo?.fechado?.projetos?.length ? (
                      <EmptyState icon={Receipt} title="Sem contratos fixos"
                        description="Nenhum projeto com contrato fixo neste período." />
                    ) : (
                      <Table>
                        <Thead>
                          <tr>
                            <Th>Projeto</Th>
                            <Th right>Valor Fixo</Th>
                          </tr>
                        </Thead>
                        <Tbody>
                          {porTipo.fechado.projetos.map(p => (
                            <Tr key={p.projeto_id}>
                              <Td>
                                <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                                  {p.projeto_nome}
                                </div>
                                <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                                  {p.projeto_codigo}
                                </div>
                              </Td>
                              <Td right className="tabular-nums font-semibold"
                                style={{ color: 'var(--brand-primary)' }}>
                                {formatBRL(p.total_receita)}
                              </Td>
                            </Tr>
                          ))}
                          <Tr>
                            <Td><span className="font-semibold">Total Contratos Fixos</span></Td>
                            <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(porTipo.fechado.total)}
                            </Td>
                          </Tr>
                        </Tbody>
                      </Table>
                    )
                  )}
                </div>
              )}

              {/* ── Tab Pagamento ──────────────────────────────────────────── */}
              {tab === 'pagamento' && (
                <div className="space-y-6">
                  {loadingPag ? <SkeletonTable rows={5} cols={4} /> : !pagamento ? (
                    <EmptyState icon={Receipt} title="Sem dados de pagamento"
                      description="Nenhum apontamento aprovado encontrado neste período." />
                  ) : (
                    <>
                      {/* Internos */}
                      {pagamento.internos.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-muted)' }}>
                            Consultores Internos
                          </h3>
                          <Table>
                            <Thead>
                              <tr>
                                <Th>Consultor</Th>
                                <Th right>Horas</Th>
                                <Th right>Taxa/h</Th>
                                <Th right>Total</Th>
                              </tr>
                            </Thead>
                            <Tbody>
                              {pagamento.internos.map(r => (
                                <Tr key={r.user_id}>
                                  <Td>
                                    <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                                      {r.nome}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                                      {r.consultant_type}
                                    </div>
                                  </Td>
                                  <Td right className="tabular-nums text-xs">{r.horas.toFixed(2)}h</Td>
                                  <Td right className="tabular-nums text-xs">{formatBRL(r.effective_rate)}/h</Td>
                                  <Td right className="tabular-nums text-sm font-semibold"
                                    style={{ color: 'var(--brand-primary)' }}>
                                    {formatBRL(r.total)}
                                  </Td>
                                </Tr>
                              ))}
                              <Tr>
                                <td colSpan={3} className="px-5 py-3.5" style={{ color: 'var(--brand-text)' }}>
                                  <span className="font-semibold">Total Internos</span>
                                </td>
                                <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                                  {formatBRL(pagamento.total_internos)}
                                </Td>
                              </Tr>
                            </Tbody>
                          </Table>
                        </div>
                      )}

                      {/* Parceiros */}
                      {pagamento.parceiros.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-muted)' }}>
                            Parceiros
                          </h3>
                          <Table>
                            <Thead>
                              <tr>
                                <Th>Parceiro</Th>
                                <Th right>Horas</Th>
                                <Th right>Total a Pagar</Th>
                              </tr>
                            </Thead>
                            <Tbody>
                              {pagamento.parceiros.map(r => (
                                <Tr key={r.partner_id}>
                                  <Td>
                                    <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                                      {r.partner_nome}
                                    </div>
                                  </Td>
                                  <Td right className="tabular-nums text-xs">{r.horas_total.toFixed(2)}h</Td>
                                  <Td right className="tabular-nums text-sm font-semibold"
                                    style={{ color: 'var(--brand-primary)' }}>
                                    {formatBRL(r.total_a_pagar)}
                                  </Td>
                                </Tr>
                              ))}
                              <Tr>
                                <td colSpan={2} className="px-5 py-3.5" style={{ color: 'var(--brand-text)' }}>
                                  <span className="font-semibold">Total Parceiros</span>
                                </td>
                                <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                                  {formatBRL(pagamento.total_parceiros)}
                                </Td>
                              </Tr>
                            </Tbody>
                          </Table>
                        </div>
                      )}

                      {/* Rodapé total */}
                      <div className="flex justify-end">
                        <div className="px-4 py-3 rounded-xl text-sm"
                          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                          <span style={{ color: 'var(--brand-muted)' }}>Custo Total do Cliente · </span>
                          <span className="font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                            {formatBRL(pagamento.total_geral)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Tab Pendências ─────────────────────────────────────────── */}
              {tab === 'pendencias' && (
                <div className="space-y-6">
                  {loadingPend ? <SkeletonTable rows={5} cols={5} /> : (
                    !pendencias || pendencias.total_pendencias === 0 ? (
                      <EmptyState icon={CheckCircle} title="Tudo aprovado"
                        description="Não há apontamentos ou despesas pendentes de aprovação neste período." />
                    ) : (
                      <>
                        {/* Apontamentos pendentes */}
                        {pendencias.timesheets.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-muted)' }}>
                              Apontamentos Pendentes ({pendencias.timesheets.length})
                            </h3>
                            <Table>
                              <Thead>
                                <tr>
                                  <Th>Data</Th>
                                  <Th>Colaborador</Th>
                                  <Th>Projeto</Th>
                                  <Th right>Horas</Th>
                                  <Th>Status</Th>
                                  <Th right>Ação</Th>
                                </tr>
                              </Thead>
                              <Tbody>
                                {pendencias.timesheets.map(ts => (
                                  <Tr key={ts.id}>
                                    <Td muted className="text-xs tabular-nums">{fmtDate(ts.data)}</Td>
                                    <Td className="text-xs">{ts.colaborador}</Td>
                                    <Td className="text-xs" muted>{ts.projeto}</Td>
                                    <Td right className="tabular-nums text-xs">{ts.horas.toFixed(2)}h</Td>
                                    <Td>
                                      <Badge variant={ts.status === 'pending' ? 'warning' : 'default'}>
                                        {ts.status === 'pending' ? 'Pendente' : 'Ajuste'}
                                      </Badge>
                                    </Td>
                                    <Td right>
                                      <Button size="sm" variant="ghost"
                                        disabled={approvingId === ts.id}
                                        onClick={() => handleApprove(ts)}
                                        style={{ color: '#10B981' }}>
                                        {approvingId === ts.id
                                          ? <RefreshCw size={11} className="animate-spin" />
                                          : <CheckCircle size={11} />}
                                        <span className="ml-1">Aprovar</span>
                                      </Button>
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </div>
                        )}

                        {/* Despesas pendentes */}
                        {pendencias.despesas.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-muted)' }}>
                              Despesas Pendentes ({pendencias.despesas.length})
                            </h3>
                            <Table>
                              <Thead>
                                <tr>
                                  <Th>Data</Th>
                                  <Th>Descrição</Th>
                                  <Th>Colaborador</Th>
                                  <Th>Categoria</Th>
                                  <Th right>Valor</Th>
                                  <Th>Status</Th>
                                  <Th right>Ação</Th>
                                </tr>
                              </Thead>
                              <Tbody>
                                {pendencias.despesas.map(exp => (
                                  <Tr key={exp.id}>
                                    <Td muted className="text-xs tabular-nums">{fmtDate(exp.data)}</Td>
                                    <Td className="text-xs">{exp.descricao}</Td>
                                    <Td className="text-xs" muted>{exp.colaborador}</Td>
                                    <Td muted className="text-xs">{exp.categoria}</Td>
                                    <Td right className="tabular-nums text-xs font-semibold">
                                      {formatBRL(exp.valor)}
                                    </Td>
                                    <Td>
                                      <Badge variant={exp.status === 'pending' ? 'warning' : 'default'}>
                                        {exp.status === 'pending' ? 'Pendente' : 'Ajuste'}
                                      </Badge>
                                    </Td>
                                    <Td right>
                                      <Button size="sm" variant="ghost"
                                        disabled={approvingId === exp.id}
                                        onClick={() => handleApprove(exp)}
                                        style={{ color: '#10B981' }}>
                                        {approvingId === exp.id
                                          ? <RefreshCw size={11} className="animate-spin" />
                                          : <CheckCircle size={11} />}
                                        <span className="ml-1">Aprovar</span>
                                      </Button>
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </div>
                        )}
                      </>
                    )
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
