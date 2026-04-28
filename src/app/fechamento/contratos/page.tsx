'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { toast } from 'sonner'
import { FileText, ChevronRight, ChevronDown } from 'lucide-react'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Badge, SkeletonTable, EmptyState, Card,
} from '@/components/ds'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProjetoRow {
  projeto_id: number
  nome: string
  codigo: string
  horas: number
  valor_hora: number
  excedente_horas: number
  excedente_valor: number
  valor_mensal: number
  total_receita: number
}

interface ClienteRow {
  customer_id: number
  nome: string
  projetos: ProjetoRow[]
  total_horas: number
  total_receita: number
}

interface TipoContrato {
  code: string
  nome: string
  clientes: ClienteRow[]
  total_clientes: number
  total_horas: number
  total_receita: number
}

interface ContratoData {
  tipos: TipoContrato[]
  total_geral: number
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

function tipoLabel(code: string): string {
  const MAP: Record<string, string> = {
    on_demand:     'On Demand',
    fixed_hours:   'Banco de Horas Fixo',
    monthly_hours: 'Banco de Horas Mensal',
    closed:        'Contrato Fixo',
  }
  return MAP[code] ?? code
}

const now = new Date()

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function TabButton({ label, active, onClick, count }: {
  label: string; active: boolean; onClick: () => void; count?: number
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap"
      style={{
        color: active ? 'var(--brand-primary)' : 'var(--brand-muted)',
        borderBottom: active ? '2px solid var(--brand-primary)' : '2px solid transparent',
      }}
    >
      {label}
      {count != null && (
        <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
          {count}
        </span>
      )}
    </button>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>{label}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{sub}</div>}
    </div>
  )
}

// ─── Tab de um tipo de contrato ───────────────────────────────────────────────

function TipoTab({ tipo }: { tipo: TipoContrato }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const isBH    = tipo.code === 'fixed_hours' || tipo.code === 'monthly_hours'
  const isClosed = tipo.code === 'closed'

  if (tipo.clientes.length === 0) {
    return (
      <EmptyState icon={FileText} title="Sem clientes"
        description={`Nenhum cliente com projetos do tipo ${tipo.nome} neste período.`} />
    )
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumo do tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Clientes" value={String(tipo.total_clientes)} />
        {!isClosed && (
          <SummaryCard label="Horas Aprovadas" value={`${tipo.total_horas.toFixed(2)}h`} />
        )}
        <SummaryCard label="Total" value={formatBRL(tipo.total_receita)} />
      </div>

      <Table>
        <Thead>
          <tr>
            <Th>Cliente</Th>
            {!isClosed && <Th right>Horas</Th>}
            {isBH && <Th right>Mensalidade</Th>}
            {isBH && <Th right>Excedente</Th>}
            <Th right>Total</Th>
          </tr>
        </Thead>
        <Tbody>
          {tipo.clientes.map(cliente => {
            const isOpen = expanded.has(cliente.customer_id)
            const excTotal = cliente.projetos.reduce((s, p) => s + p.excedente_valor, 0)
            const mensalTotal = cliente.projetos.reduce((s, p) => s + p.valor_mensal, 0)

            return (
              <>
                <Tr key={cliente.customer_id} onClick={() => toggle(cliente.customer_id)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {isOpen
                        ? <ChevronDown size={14} style={{ color: 'var(--brand-primary)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--brand-muted)' }} />
                      }
                      <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>
                        {cliente.nome}
                      </span>
                      {cliente.projetos.length > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
                          {cliente.projetos.length}
                        </span>
                      )}
                    </div>
                  </Td>
                  {!isClosed && (
                    <Td right className="tabular-nums text-xs">{cliente.total_horas.toFixed(2)}h</Td>
                  )}
                  {isBH && (
                    <Td right className="tabular-nums text-xs">{formatBRL(mensalTotal)}</Td>
                  )}
                  {isBH && (
                    <Td right className="tabular-nums text-xs"
                      style={{ color: excTotal > 0 ? '#EF4444' : 'var(--brand-muted)' }}>
                      {excTotal > 0 ? formatBRL(excTotal) : '—'}
                    </Td>
                  )}
                  <Td right className="tabular-nums text-sm font-semibold"
                    style={{ color: 'var(--brand-primary)' }}>
                    {formatBRL(cliente.total_receita)}
                  </Td>
                </Tr>

                {isOpen && cliente.projetos.map(p => (
                  <Tr key={`p-${p.projeto_id}`}>
                    <Td>
                      <div className="pl-8">
                        <div className="text-xs" style={{ color: 'var(--brand-text)' }}>{p.nome}</div>
                        <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{p.codigo}</div>
                      </div>
                    </Td>
                    {!isClosed && (
                      <Td right className="tabular-nums text-xs" muted>{p.horas.toFixed(2)}h</Td>
                    )}
                    {isBH && (
                      <Td right className="tabular-nums text-xs" muted>
                        {formatBRL(p.valor_mensal)}
                        <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                          {p.horas.toFixed(0)}h/{(p.horas > 0 ? p.valor_hora : 0).toFixed(0)} /h
                        </div>
                      </Td>
                    )}
                    {isBH && (
                      <Td right className="tabular-nums text-xs"
                        style={{ color: p.excedente_horas > 0 ? '#EF4444' : 'var(--brand-subtle)' }}>
                        {p.excedente_horas > 0
                          ? `${p.excedente_horas.toFixed(2)}h · ${formatBRL(p.excedente_valor)}`
                          : '—'}
                      </Td>
                    )}
                    <Td right className="tabular-nums text-xs font-semibold"
                      style={{ color: 'var(--brand-primary)' }}>
                      {formatBRL(p.total_receita)}
                    </Td>
                  </Tr>
                ))}
              </>
            )
          })}

          {/* Linha de total */}
          <Tr>
            <td className="px-5 py-3.5" style={{ color: 'var(--brand-text)' }}>
              <span className="font-bold">TOTAL</span>
            </td>
            {!isClosed && (
              <Td right className="tabular-nums font-bold">{tipo.total_horas.toFixed(2)}h</Td>
            )}
            {isBH && <Td right />}
            {isBH && <Td right />}
            <Td right className="tabular-nums text-base font-bold"
              style={{ color: 'var(--brand-primary)' }}>
              {formatBRL(tipo.total_receita)}
            </Td>
          </Tr>
        </Tbody>
      </Table>
    </div>
  )
}

// ─── Tab Resumo Geral ─────────────────────────────────────────────────────────

function ResumoTab({ data }: { data: ContratoData }) {
  return (
    <div className="space-y-4 max-w-2xl">
      <Table>
        <Thead>
          <tr>
            <Th>Tipo de Contrato</Th>
            <Th right>Clientes</Th>
            <Th right>Horas</Th>
            <Th right>Total</Th>
          </tr>
        </Thead>
        <Tbody>
          {data.tipos.map(t => (
            <Tr key={t.code}>
              <Td>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                    {t.nome}
                  </span>
                </div>
              </Td>
              <Td right muted className="text-xs">{t.total_clientes}</Td>
              <Td right className="tabular-nums text-xs" muted>
                {t.code === 'closed' ? '—' : `${t.total_horas.toFixed(2)}h`}
              </Td>
              <Td right className="tabular-nums font-semibold"
                style={{ color: 'var(--brand-primary)' }}>
                {formatBRL(t.total_receita)}
              </Td>
            </Tr>
          ))}
          <Tr>
            <td colSpan={3} className="px-5 py-3.5" style={{ color: 'var(--brand-text)' }}>
              <span className="text-base font-bold">TOTAL GERAL</span>
            </td>
            <Td right>
              <span className="text-base tabular-nums font-bold"
                style={{ color: 'var(--brand-primary)' }}>
                {formatBRL(data.total_geral)}
              </span>
            </Td>
          </Tr>
        </Tbody>
      </Table>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FechamentoContratosPage() {
  const { user } = useAuth()
  const { filters: flt, set: setFilter } = usePersistedFilters(
    'fechamento_contratos',
    user?.id,
    { month: now.getMonth() + 1 as number | null, year: now.getFullYear() as number | null, activeTab: 'resumo' },
  )
  const { month, year, activeTab } = flt
  const setMonth     = (v: number | null) => setFilter('month', v)
  const setYear      = (v: number | null) => setFilter('year', v)
  const setActiveTab = (v: string)        => setFilter('activeTab', v)

  const yearMonth = month && year ? toYearMonth(month, year) : ''

  const [data,    setData]    = useState<ContratoData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!yearMonth) return
    setLoading(true)
    api.get<{ data: ContratoData }>(`/fechamento-contrato?year_month=${yearMonth}`)
      .then(r => {
        setData(r.data ?? null)
        // Seleciona primeiro tipo disponível se tab atual não existe
        if (r.data?.tipos?.length && activeTab !== 'resumo') {
          const codes = r.data.tipos.map(t => t.code)
          if (!codes.includes(activeTab)) setActiveTab('resumo')
        }
      })
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [yearMonth])

  useEffect(() => { load() }, [yearMonth])

  const tabs = data ? [
    ...data.tipos.map(t => ({ code: t.code, label: tipoLabel(t.code), count: t.total_clientes })),
    { code: 'resumo', label: 'Resumo Geral', count: undefined },
  ] : [{ code: 'resumo', label: 'Resumo Geral', count: undefined }]

  const activeTipo = data?.tipos.find(t => t.code === activeTab)

  return (
    <AppLayout title="Fechamento — Por Contrato">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <FileText size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>
              Fechamento — Por Contrato
            </h1>
            {yearMonth && (
              <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>
                {fmtYearMonth(yearMonth)}
              </span>
            )}
            <div className="ml-auto">
              <MonthYearPicker
                month={month}
                year={year}
                onChange={(m, y) => { setMonth(m || null); setYear(y || null) }}
              />
            </div>
          </div>

          {/* Cards de total geral */}
          {data && !loading && (
            <div className="mt-4 flex flex-wrap gap-3">
              <SummaryCard
                label="Total Geral"
                value={formatBRL(data.total_geral)}
                sub={`${data.tipos.reduce((s, t) => s + t.total_clientes, 0)} clientes · ${data.tipos.length} tipos`}
              />
              {data.tipos.map(t => (
                <SummaryCard
                  key={t.code}
                  label={tipoLabel(t.code)}
                  value={formatBRL(t.total_receita)}
                  sub={`${t.total_clientes} cliente${t.total_clientes !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 border-b overflow-x-auto"
          style={{ borderColor: 'var(--brand-border)' }}>
          {tabs.map(t => (
            <TabButton
              key={t.code}
              label={t.label}
              active={activeTab === t.code}
              onClick={() => setActiveTab(t.code)}
              count={t.count}
            />
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <SkeletonTable rows={6} cols={4} />
          ) : !data ? (
            <EmptyState icon={FileText} title="Sem dados"
              description="Selecione a competência para visualizar o fechamento por tipo de contrato." />
          ) : activeTab === 'resumo' ? (
            <ResumoTab data={data} />
          ) : activeTipo ? (
            <TipoTab tipo={activeTipo} />
          ) : (
            <EmptyState icon={FileText} title="Tipo não encontrado" />
          )}
        </div>
      </div>
    </AppLayout>
  )
}
