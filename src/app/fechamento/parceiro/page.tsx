'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Lock, RefreshCw, Handshake, Printer, Filter } from 'lucide-react'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState,
} from '@/components/ds'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ParceiroStatus {
  partner_id: number
  nome: string
  pricing_type: 'fixed' | 'variable'
  hourly_rate: number
  status: 'open' | 'closed' | 'sem_registro'
  total_horas: number
  total_despesas: number
  total_a_pagar: number
  closed_at?: string
  closed_by_name?: string
}

interface ConsultorRow {
  user_id: number
  nome: string
  horas: number
  rate_type: string
  valor_hora: number
  pricing_type_parceiro: string
  total: number
}

interface DespesaRow {
  id: number
  data: string
  descricao: string
  categoria: string
  colaborador: string
  projeto: string
  valor: number
  status: string
}

interface ApontamentoRow {
  id: number
  data: string
  user_id: number
  consultor: string
  projeto: string
  horas: number
  status: string
  ticket?: string
  observacao?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYearMonth(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function fmtYearMonth(ym: string): string {
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]}/${y}`
}

const STATUS_LABELS: Record<string, string> = {
  pending:              'Pendente',
  approved:             'Aprovado',
  conflicted:           'Conflito',
  adjustment_requested: 'Ajuste Solicitado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'secondary'> = {
  approved:             'success',
  pending:              'warning',
  conflicted:           'error',
  adjustment_requested: 'secondary',
}

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending:  'Pendente',
}

const EXPENSE_STATUS_VARIANTS: Record<string, 'success' | 'warning'> = {
  approved: 'success',
  pending:  'warning',
}

const now = new Date()

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FechamentoParceiroPage() {
  const { user } = useAuth()
  const isAdmin = (user as any)?.type === 'admin'
  const printRef = useRef<HTMLDivElement>(null)

  const [month, setMonth] = useState<number | null>(now.getMonth() + 1)
  const [year,  setYear]  = useState<number | null>(now.getFullYear())
  const yearMonth = month && year ? toYearMonth(month, year) : ''

  const [parceiros, setParceiros]     = useState<ParceiroStatus[]>([])
  const [partnerId, setPartnerId]     = useState<number | null>(null)
  const [status, setStatus]           = useState<ParceiroStatus | null>(null)
  const [tab, setTab]                 = useState<'consultores' | 'despesas' | 'apontamentos' | 'resumo' | 'relatorio'>('consultores')

  const [consultores, setConsultores] = useState<ConsultorRow[]>([])
  const [despesas, setDespesas]       = useState<DespesaRow[]>([])
  const [apontamentos, setApontamentos] = useState<ApontamentoRow[]>([])

  const [loadingConsult, setLoadingConsult]   = useState(false)
  const [loadingDesp,    setLoadingDesp]      = useState(false)
  const [loadingAp,      setLoadingAp]        = useState(false)
  const [loadingFechar,  setLoadingFechar]    = useState(false)
  const [loadingReabrir, setLoadingReabrir]   = useState(false)

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [filterConsultor, setFilterConsultor] = useState<number | ''>('')
  const [filterApStatus,  setFilterApStatus]  = useState<string>('')
  const [filterApConsultor, setFilterApConsultor] = useState<number | ''>('')

  // ─── Carregamento de dados ────────────────────────────────────────────────

  const loadParceiros = useCallback(() => {
    if (!yearMonth) return
    api.get<{ data: ParceiroStatus[] }>(`/fechamento-parceiro?year_month=${yearMonth}`)
      .then(r => {
        setParceiros(r.data ?? [])
        if (partnerId) {
          const current = r.data?.find(p => p.partner_id === partnerId)
          setStatus(current ?? null)
        }
      })
      .catch(() => {})
  }, [yearMonth, partnerId])

  const loadConsultores = useCallback(() => {
    if (!partnerId || !yearMonth) return
    setLoadingConsult(true)
    api.get<{ data: ConsultorRow[] }>(`/fechamento-parceiro/${partnerId}/${yearMonth}/consultores`)
      .then(r => setConsultores(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar consultores'))
      .finally(() => setLoadingConsult(false))
  }, [partnerId, yearMonth])

  const loadDespesas = useCallback(() => {
    if (!partnerId || !yearMonth) return
    setLoadingDesp(true)
    api.get<{ data: DespesaRow[] }>(`/fechamento-parceiro/${partnerId}/${yearMonth}/despesas`)
      .then(r => setDespesas(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setLoadingDesp(false))
  }, [partnerId, yearMonth])

  const loadApontamentos = useCallback(() => {
    if (!partnerId || !yearMonth) return
    setLoadingAp(true)
    api.get<{ data: ApontamentoRow[] }>(`/fechamento-parceiro/${partnerId}/${yearMonth}/apontamentos`)
      .then(r => setApontamentos(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar apontamentos'))
      .finally(() => setLoadingAp(false))
  }, [partnerId, yearMonth])

  useEffect(() => {
    loadParceiros()
    setConsultores([])
    setDespesas([])
    setApontamentos([])
  }, [yearMonth])

  useEffect(() => {
    if (!partnerId) { setStatus(null); return }
    const found = parceiros.find(p => p.partner_id === partnerId)
    setStatus(found ?? null)
    setConsultores([])
    setDespesas([])
    setApontamentos([])
    setTab('consultores')
    setFilterConsultor('')
    setFilterApConsultor('')
    setFilterApStatus('')
  }, [partnerId, parceiros])

  useEffect(() => {
    if (!partnerId || !yearMonth) return
    if (tab === 'consultores')  loadConsultores()
    if (tab === 'despesas')     loadDespesas()
    if (tab === 'apontamentos') loadApontamentos()
    if (tab === 'resumo' || tab === 'relatorio') {
      if (!consultores.length)  loadConsultores()
      if (!despesas.length)     loadDespesas()
    }
  }, [tab, partnerId, yearMonth])

  useEffect(() => {
    if (partnerId && yearMonth) loadConsultores()
  }, [partnerId])

  // ─── Ações ────────────────────────────────────────────────────────────────

  const handleFechar = () => {
    if (!partnerId || !yearMonth) return
    setLoadingFechar(true)
    api.post(`/fechamento-parceiro/${partnerId}/${yearMonth}/fechar`, {})
      .then(() => { toast.success('Fechamento encerrado!'); loadParceiros() })
      .catch(() => toast.error('Erro ao fechar'))
      .finally(() => setLoadingFechar(false))
  }

  const handleReabrir = () => {
    if (!partnerId || !yearMonth) return
    setLoadingReabrir(true)
    api.post(`/fechamento-parceiro/${partnerId}/${yearMonth}/reabrir`, {})
      .then(() => {
        toast.success('Fechamento reaberto.')
        setConsultores([])
        setDespesas([])
        setApontamentos([])
        loadParceiros()
        loadConsultores()
      })
      .catch(() => toast.error('Erro ao reabrir'))
      .finally(() => setLoadingReabrir(false))
  }

  const handlePrint = () => window.print()

  // ─── Derivados ────────────────────────────────────────────────────────────

  const isClosed   = status?.status === 'closed'
  const isFixed    = status?.pricing_type === 'fixed'
  const parceiroOptions = parceiros.map(p => ({ id: p.partner_id, name: p.nome }))
  const consultorOptions = consultores.map(c => ({ id: c.user_id, name: c.nome }))

  const filteredConsultores = filterConsultor
    ? consultores.filter(c => c.user_id === filterConsultor)
    : consultores

  const filteredApontamentos = apontamentos
    .filter(a => !filterApConsultor || a.user_id === filterApConsultor)
    .filter(a => !filterApStatus    || a.status === filterApStatus)

  const totalHoras    = consultores.reduce((s, r) => s + r.horas, 0)
  const totalServicos = consultores.reduce((s, r) => s + r.total, 0)
  const totalDespesas = despesas.reduce((s, r) => s + r.valor, 0)
  const totalAPagar   = totalServicos + totalDespesas

  const TABS = [
    { key: 'consultores',  label: 'Consultores' },
    { key: 'despesas',     label: 'Despesas' },
    { key: 'apontamentos', label: 'Apontamentos' },
    { key: 'resumo',       label: 'Resumo' },
    { key: 'relatorio',    label: 'Relatório' },
  ] as const

  return (
    <AppLayout title="Fechamento — Parceiros">
      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b no-print" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Handshake size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>
              Fechamento — Parceiros
            </h1>
            {yearMonth && (
              <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                {fmtYearMonth(yearMonth)}
              </span>
            )}
            {isClosed && <Badge variant="success"><Lock size={10} className="mr-1" /> FECHADO</Badge>}
            {status?.status === 'open' && <Badge variant="warning">ABERTO</Badge>}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <SearchSelect
                value={partnerId ?? ''}
                onChange={v => setPartnerId(v ? Number(v) : null)}
                options={parceiroOptions}
                placeholder="Selecionar parceiro..."
              />
              <MonthYearPicker
                month={month}
                year={year}
                onChange={(m, y) => { setMonth(m || null); setYear(y || null) }}
              />
              {tab === 'relatorio' && partnerId && (
                <Button size="sm" variant="secondary" onClick={handlePrint}>
                  <Printer size={12} className="mr-1" /> Imprimir
                </Button>
              )}
              {isAdmin && partnerId && yearMonth && !isClosed && (
                <Button size="sm" onClick={handleFechar} disabled={loadingFechar} style={{ background: 'var(--brand-primary)', color: '#000' }}>
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

          {status && (
            <div className="mt-3 flex items-center gap-3">
              <span
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{
                  background: isFixed ? 'rgba(251,191,36,0.15)' : 'rgba(0,245,255,0.1)',
                  color: isFixed ? '#fbbf24' : 'var(--brand-primary)',
                }}
              >
                {isFixed ? 'PRECIFICAÇÃO FIXA' : 'PRECIFICAÇÃO VARIÁVEL'}
              </span>
              {isFixed && status.hourly_rate > 0 && (
                <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                  Taxa única: <b>{formatBRL(status.hourly_rate)}/h</b>
                </span>
              )}
            </div>
          )}

          {isClosed && status && (
            <div className="mt-3 px-3 py-2 rounded text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
              Dados históricos — fechado em {new Date(status.closed_at!).toLocaleDateString('pt-BR')}
              {status.closed_by_name ? ` por ${status.closed_by_name}` : ''}
            </div>
          )}
        </div>

        {!partnerId ? (
          <EmptyState icon={Handshake} title="Selecione um parceiro" description="Escolha o parceiro e a competência para visualizar o fechamento." />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-6 border-b no-print" style={{ borderColor: 'var(--brand-border)' }}>
              {TABS.map(t => (
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

            <div className="flex-1 overflow-auto">

              {/* ── Tab Consultores ── */}
              {tab === 'consultores' && (
                <div className="p-6">
                  {/* Filtro de consultor */}
                  {consultores.length > 1 && (
                    <div className="flex items-center gap-2 mb-4">
                      <Filter size={14} style={{ color: 'var(--brand-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>Filtrar:</span>
                      <SearchSelect
                        value={filterConsultor}
                        onChange={v => setFilterConsultor(v ? Number(v) : '')}
                        options={consultorOptions}
                        placeholder="Todos os consultores"
                      />
                      {filterConsultor && (
                        <button
                          className="text-xs underline"
                          style={{ color: 'var(--brand-muted)' }}
                          onClick={() => setFilterConsultor('')}
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  )}

                  {loadingConsult ? (
                    <SkeletonTable rows={4} cols={4} />
                  ) : filteredConsultores.length === 0 ? (
                    <EmptyState icon={Handshake} title="Sem consultores" description="Nenhum consultor com apontamentos neste período." />
                  ) : (
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
                        {filteredConsultores.map(row => (
                          <Tr key={row.user_id}>
                            <Td>
                              <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{row.nome}</div>
                              {row.rate_type === 'monthly' && !isFixed && (
                                <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Mensalista · ÷180</div>
                              )}
                            </Td>
                            <Td right className="tabular-nums text-xs">{row.horas.toFixed(2)}h</Td>
                            <Td right className="tabular-nums text-xs">{formatBRL(row.valor_hora)}/h</Td>
                            <Td right className="tabular-nums text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(row.total)}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                  {filteredConsultores.length > 0 && (
                    <div className="mt-4 flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                        Total: <b>{filteredConsultores.reduce((s, c) => s + c.horas, 0).toFixed(2)}h</b>
                      </span>
                      <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'rgba(0,245,255,0.07)', color: 'var(--brand-primary)' }}>
                        Total Serviços: {formatBRL(filteredConsultores.reduce((s, c) => s + c.total, 0))}
                      </div>
                    </div>
                  )}
                  {isFixed && consultores.length > 0 && (
                    <p className="mt-3 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                      * Taxa fixa do parceiro aplicada a todos os consultores.
                    </p>
                  )}
                </div>
              )}

              {/* ── Tab Despesas ── */}
              {tab === 'despesas' && (
                <div className="p-6">
                  {loadingDesp ? (
                    <SkeletonTable rows={4} cols={6} />
                  ) : despesas.length === 0 ? (
                    <EmptyState icon={Handshake} title="Sem despesas" description="Nenhuma despesa dos consultores neste período." />
                  ) : (
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Data</Th>
                          <Th>Descrição</Th>
                          <Th>Categoria</Th>
                          <Th>Consultor</Th>
                          <Th>Projeto</Th>
                          <Th>Status</Th>
                          <Th right>Valor</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {despesas.map(row => (
                          <Tr key={row.id}>
                            <Td className="text-xs tabular-nums">{new Date(row.data + 'T12:00:00').toLocaleDateString('pt-BR')}</Td>
                            <Td className="text-xs">{row.descricao}</Td>
                            <Td className="text-xs">{row.categoria}</Td>
                            <Td className="text-xs">{row.colaborador}</Td>
                            <Td className="text-xs">{row.projeto}</Td>
                            <Td className="text-xs">
                              <Badge variant={EXPENSE_STATUS_VARIANTS[row.status] ?? 'secondary'}>
                                {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
                              </Badge>
                            </Td>
                            <Td right className="tabular-nums text-xs font-medium" style={{ color: 'var(--brand-primary)' }}>{formatBRL(row.valor)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                  {despesas.length > 0 && (
                    <div className="mt-4 flex justify-end">
                      <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'rgba(0,245,255,0.07)', color: 'var(--brand-primary)' }}>
                        Total Despesas: {formatBRL(totalDespesas)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab Apontamentos ── */}
              {tab === 'apontamentos' && (
                <div className="p-6">
                  {/* Filtros */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Filter size={14} style={{ color: 'var(--brand-muted)' }} />
                    <SearchSelect
                      value={filterApConsultor}
                      onChange={v => setFilterApConsultor(v ? Number(v) : '')}
                      options={consultorOptions}
                      placeholder="Todos os consultores"
                    />
                    <select
                      value={filterApStatus}
                      onChange={e => setFilterApStatus(e.target.value)}
                      className="text-xs px-3 py-2 rounded border"
                      style={{ background: 'var(--brand-surface)', color: 'var(--brand-text)', borderColor: 'var(--brand-border)' }}
                    >
                      <option value="">Todos os status</option>
                      <option value="approved">Aprovado</option>
                      <option value="pending">Pendente</option>
                      <option value="conflicted">Conflito</option>
                    </select>
                    {(filterApConsultor || filterApStatus) && (
                      <button
                        className="text-xs underline"
                        style={{ color: 'var(--brand-muted)' }}
                        onClick={() => { setFilterApConsultor(''); setFilterApStatus('') }}
                      >
                        Limpar filtros
                      </button>
                    )}
                    <span className="ml-auto text-xs" style={{ color: 'var(--brand-muted)' }}>
                      {filteredApontamentos.length} registro{filteredApontamentos.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {loadingAp ? (
                    <SkeletonTable rows={6} cols={6} />
                  ) : filteredApontamentos.length === 0 ? (
                    <EmptyState icon={Handshake} title="Nenhum apontamento" description="Sem apontamentos para os filtros selecionados." />
                  ) : (
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Data</Th>
                          <Th>Consultor</Th>
                          <Th>Projeto</Th>
                          <Th right>Horas</Th>
                          <Th>Status</Th>
                          <Th>Ticket</Th>
                          <Th>Observação</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {filteredApontamentos.map(row => (
                          <Tr key={row.id}>
                            <Td className="text-xs tabular-nums whitespace-nowrap">
                              {new Date(row.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </Td>
                            <Td className="text-xs">{row.consultor}</Td>
                            <Td className="text-xs">{row.projeto}</Td>
                            <Td right className="tabular-nums text-xs">{row.horas.toFixed(2)}h</Td>
                            <Td className="text-xs">
                              <Badge variant={STATUS_VARIANTS[row.status] ?? 'secondary'}>
                                {STATUS_LABELS[row.status] ?? row.status}
                              </Badge>
                            </Td>
                            <Td className="text-xs">{row.ticket ?? '—'}</Td>
                            <Td className="text-xs max-w-xs truncate">
                              <span title={row.observacao ?? ''}>{row.observacao ?? '—'}</span>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                  {filteredApontamentos.length > 0 && (
                    <div className="mt-4 flex justify-between items-center text-xs" style={{ color: 'var(--brand-muted)' }}>
                      <span>
                        Total filtrado: <b>{filteredApontamentos.reduce((s, a) => s + a.horas, 0).toFixed(2)}h</b>
                      </span>
                      <span>
                        Aprovados: <b style={{ color: 'var(--brand-primary)' }}>
                          {filteredApontamentos.filter(a => a.status === 'approved').reduce((s, a) => s + a.horas, 0).toFixed(2)}h
                        </b>
                        {' · '}
                        Pendentes: <b style={{ color: '#fbbf24' }}>
                          {filteredApontamentos.filter(a => a.status === 'pending').reduce((s, a) => s + a.horas, 0).toFixed(2)}h
                        </b>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab Resumo ── */}
              {tab === 'resumo' && (
                <div className="p-6 max-w-md">
                  <div className="rounded-lg p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)' }}>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--brand-text)' }}>
                      Resumo — {yearMonth ? fmtYearMonth(yearMonth) : ''}
                      {isClosed && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--brand-muted)' }}>(dados do snapshot)</span>}
                    </h3>
                    <div className="flex justify-between text-sm" style={{ color: 'var(--brand-muted)' }}>
                      <span>Total Horas Trabalhadas</span>
                      <span className="tabular-nums">{(isClosed ? status!.total_horas : totalHoras).toFixed(2)}h</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: 'var(--brand-muted)' }}>
                      <span>Total Serviços</span>
                      <span className="tabular-nums">{formatBRL(totalServicos)}</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: 'var(--brand-muted)' }}>
                      <span>Total Despesas</span>
                      <span className="tabular-nums">{formatBRL(isClosed ? status!.total_despesas : totalDespesas)}</span>
                    </div>
                    <div className="border-t pt-3" style={{ borderColor: 'var(--brand-border)' }}>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>TOTAL A PAGAR</span>
                        <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                          {formatBRL(isClosed ? status!.total_a_pagar : totalAPagar)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab Relatório ── */}
              {tab === 'relatorio' && (
                <div className="p-6">
                  <div id="print-area" ref={printRef}
                    style={{ maxWidth: 760, margin: '0 auto', fontFamily: 'sans-serif' }}
                  >
                    {/* Cabeçalho do relatório */}
                    <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-xl font-bold" style={{ color: 'var(--brand-text)' }}>
                            Relatório de Fechamento
                          </h2>
                          <p className="text-sm mt-1" style={{ color: 'var(--brand-muted)' }}>
                            Parceiro: <b style={{ color: 'var(--brand-text)' }}>{status?.nome}</b>
                          </p>
                          <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                            Competência: <b style={{ color: 'var(--brand-text)' }}>{yearMonth ? fmtYearMonth(yearMonth) : '—'}</b>
                          </p>
                          {status && (
                            <p className="text-xs mt-1" style={{ color: 'var(--brand-muted)' }}>
                              {isFixed
                                ? `Precificação Fixa · Taxa: ${formatBRL(status.hourly_rate)}/h`
                                : 'Precificação Variável'}
                              {isClosed ? ` · Fechado em ${new Date(status.closed_at!).toLocaleDateString('pt-BR')}` : ' · Em aberto'}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs" style={{ color: 'var(--brand-muted)' }}>Gerado em</div>
                          <div className="text-sm" style={{ color: 'var(--brand-text)' }}>
                            {new Date().toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Consultores */}
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-text)' }}>
                        Consultores
                      </h3>
                      {loadingConsult ? <SkeletonTable rows={3} cols={4} /> : (
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
                            {consultores.map(row => (
                              <Tr key={row.user_id}>
                                <Td className="text-xs">{row.nome}</Td>
                                <Td right className="tabular-nums text-xs">{row.horas.toFixed(2)}h</Td>
                                <Td right className="tabular-nums text-xs">{formatBRL(row.valor_hora)}/h</Td>
                                <Td right className="tabular-nums text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                                  {formatBRL(row.total)}
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      )}
                      <div className="mt-2 flex justify-between text-xs px-1" style={{ color: 'var(--brand-muted)' }}>
                        <span>Total: <b>{totalHoras.toFixed(2)}h</b></span>
                        <span>Subtotal Serviços: <b style={{ color: 'var(--brand-primary)' }}>{formatBRL(totalServicos)}</b></span>
                      </div>
                    </div>

                    {/* Despesas */}
                    {despesas.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-text)' }}>
                          Despesas
                        </h3>
                        <Table>
                          <Thead>
                            <tr>
                              <Th>Data</Th>
                              <Th>Descrição</Th>
                              <Th>Consultor</Th>
                              <Th>Projeto</Th>
                              <Th>Status</Th>
                              <Th right>Valor</Th>
                            </tr>
                          </Thead>
                          <Tbody>
                            {despesas.map(row => (
                              <Tr key={row.id}>
                                <Td className="text-xs tabular-nums">{new Date(row.data + 'T12:00:00').toLocaleDateString('pt-BR')}</Td>
                                <Td className="text-xs">{row.descricao}</Td>
                                <Td className="text-xs">{row.colaborador}</Td>
                                <Td className="text-xs">{row.projeto}</Td>
                                <Td className="text-xs">
                                  <Badge variant={EXPENSE_STATUS_VARIANTS[row.status] ?? 'secondary'}>
                                    {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
                                  </Badge>
                                </Td>
                                <Td right className="tabular-nums text-xs font-medium" style={{ color: 'var(--brand-primary)' }}>
                                  {formatBRL(row.valor)}
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                        <div className="mt-2 flex justify-end text-xs px-1" style={{ color: 'var(--brand-muted)' }}>
                          <span>Subtotal Despesas: <b style={{ color: 'var(--brand-primary)' }}>{formatBRL(totalDespesas)}</b></span>
                        </div>
                      </div>
                    )}

                    {/* Totalizador */}
                    <div className="rounded-lg p-4 mt-4" style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid var(--brand-border)' }}>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm" style={{ color: 'var(--brand-muted)' }}>
                          <span>Total Horas</span>
                          <span className="tabular-nums font-medium">{totalHoras.toFixed(2)}h</span>
                        </div>
                        <div className="flex justify-between text-sm" style={{ color: 'var(--brand-muted)' }}>
                          <span>Total Serviços</span>
                          <span className="tabular-nums">{formatBRL(totalServicos)}</span>
                        </div>
                        <div className="flex justify-between text-sm" style={{ color: 'var(--brand-muted)' }}>
                          <span>Total Despesas</span>
                          <span className="tabular-nums">{formatBRL(totalDespesas)}</span>
                        </div>
                        <div className="border-t pt-2 mt-2 flex justify-between items-center" style={{ borderColor: 'var(--brand-border)' }}>
                          <span className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>TOTAL A PAGAR</span>
                          <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                            {formatBRL(totalAPagar)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isFixed && (
                      <p className="mt-3 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        * Taxa fixa do parceiro aplicada a todos os consultores.
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
