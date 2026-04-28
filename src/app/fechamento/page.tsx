'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { toast } from 'sonner'
import {
  DollarSign, TrendingUp, BarChart2, UserCheck, AlertTriangle,
  CheckCircle, Lock, X, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState,
} from '@/components/ds'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FechamentoStatus {
  year_month: string
  status: 'open' | 'closed'
  total_custo_interno: number
  total_custo_parceiros: number
  total_receita: number
  margem: number
  margem_percentual: number
  closed_at?: string
  closed_by_name?: string
}

interface ProducaoRow {
  consultor_id: number
  consultor_nome: string
  consultor_tipo: string
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  cliente_nome: string
  tipo_contrato: string
  horas_aprovadas: number
  horas_pendentes: number
  despesas_aprovadas: number
  despesas_pendentes: number
}

interface CustoRow {
  user_id: number
  nome: string
  tipo_usuario: string
  horas: number
  valor_hora: number
  rate_type: string
  effective_rate: number
  total: number
}

interface CustoData {
  internos: CustoRow[]
  parceiros: CustoRow[]
  total_custo_interno: number
  total_custo_parceiros: number
}

interface ReceitaRow {
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  cliente_id: number
  cliente_nome: string
  tipo_contrato: string
  tipo_faturamento: string
  horas_aprovadas: number
  valor_base: number
  total_receita: number
}

interface ReceitaCliente {
  cliente_id: number
  cliente_nome: string
  projetos: ReceitaRow[]
  total_cliente: number
}

interface ReceitaData {
  by_cliente: ReceitaCliente[]
  total_receita: number
}

interface Consolidado {
  total_custo_interno: number
  total_custo_parceiros: number
  total_receita: number
  margem: number
  margem_percentual: number
}

interface Validacao {
  pode_fechar: boolean
  ja_fechado: boolean
  apontamentos_pendentes: number
  despesas_pendentes: number
  projetos_saldo_negativo: number
  alertas: { tipo: string; mensagem: string; link_path: string | null }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function toYearMonth(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function fromYearMonth(ym: string): { month: number; year: number } {
  const [y, m] = ym.split('-')
  return { year: parseInt(y), month: parseInt(m) }
}

function fmtYearMonth(ym: string): string {
  const { month, year } = fromYearMonth(ym)
  return `${MONTHS_FULL[month - 1]} ${year}`
}

function marginColor(pct: number): string {
  return pct >= 30 ? '#22c55e' : pct >= 10 ? '#f59e0b' : '#ef4444'
}

// ─── Subcomponentes de aba ───────────────────────────────────────────────────

function TabProducao({ data, loading }: { data: ProducaoRow[]; loading: boolean }) {
  if (loading) return <SkeletonTable rows={6} cols={8} />
  if (!data.length) return <EmptyState icon={BarChart2} title="Sem produção" description="Nenhum apontamento encontrado para o período." />

  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Consultor</Th>
          <Th>Projeto</Th>
          <Th>Cliente</Th>
          <Th>Tipo Contrato</Th>
          <Th right>Hs Aprov.</Th>
          <Th right>Hs Pend.</Th>
          <Th right>Despesas Aprov.</Th>
          <Th right>Despesas Pend.</Th>
        </Tr>
      </Thead>
      <Tbody>
        {data.map((row, i) => (
          <Tr key={i}>
            <Td>
              <div className="font-medium text-xs" style={{ color: 'var(--brand-text)' }}>{row.consultor_nome}</div>
              <div className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{row.consultor_tipo}</div>
            </Td>
            <Td>
              <div className="text-xs" style={{ color: 'var(--brand-text)' }}>{row.projeto_nome}</div>
              <div className="text-[10px] font-mono" style={{ color: 'var(--brand-subtle)' }}>{row.projeto_codigo}</div>
            </Td>
            <Td className="text-xs">{row.cliente_nome}</Td>
            <Td className="text-xs">{row.tipo_contrato}</Td>
            <Td right className="tabular-nums text-xs font-semibold" style={{ color: '#22c55e' }}>{row.horas_aprovadas.toFixed(1)}h</Td>
            <Td right className="tabular-nums text-xs" style={{ color: row.horas_pendentes > 0 ? '#f59e0b' : 'var(--brand-subtle)' }}>{row.horas_pendentes.toFixed(1)}h</Td>
            <Td right className="tabular-nums text-xs font-semibold" style={{ color: '#22c55e' }}>{formatBRL(row.despesas_aprovadas)}</Td>
            <Td right className="tabular-nums text-xs" style={{ color: row.despesas_pendentes > 0 ? '#f59e0b' : 'var(--brand-subtle)' }}>{formatBRL(row.despesas_pendentes)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

function TabCusto({ data, loading }: { data: CustoData | null; loading: boolean }) {
  if (loading) return <SkeletonTable rows={6} cols={5} />
  if (!data) return <EmptyState icon={DollarSign} title="Sem dados de custo" description="Nenhum apontamento aprovado no período." />

  const Section = ({ title, rows, total, color }: { title: string; rows: CustoRow[]; total: number; color: string }) => (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--brand-bg)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--brand-subtle)' }}>
          <UserCheck size={11} />{title}
        </p>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{formatBRL(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum registro</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Pessoa</Th>
              <Th right>Horas</Th>
              <Th right>Taxa/h</Th>
              <Th right>Total</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r, i) => (
              <Tr key={i}>
                <Td>
                  <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{r.nome}</div>
                </Td>
                <Td right className="tabular-nums text-xs">{r.horas.toFixed(1)}h</Td>
                <Td right className="tabular-nums text-xs" style={{ color: 'var(--brand-muted)' }}>
                  {r.valor_hora > 0 ? formatBRL(r.valor_hora) : '—'}
                  {r.rate_type === 'monthly' && <span className="ml-1 text-[10px] opacity-60">÷180</span>}
                </Td>
                <Td right className="tabular-nums text-xs font-bold" style={{ color: 'var(--brand-text)' }}>{formatBRL(r.total)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <Section title="Internos" rows={data.internos} total={data.total_custo_interno} color="#00F5FF" />
      <Section title="Parceiros" rows={data.parceiros} total={data.total_custo_parceiros} color="#a78bfa" />
      <div className="flex justify-end px-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--brand-subtle)' }}>
          Total Custo: <span className="text-sm font-bold ml-2 tabular-nums" style={{ color: '#f59e0b' }}>
            {formatBRL(data.total_custo_interno + data.total_custo_parceiros)}
          </span>
        </div>
      </div>
    </div>
  )
}

function TabReceita({ data, loading }: { data: ReceitaData | null; loading: boolean }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  if (loading) return <SkeletonTable rows={6} cols={5} />
  if (!data || !data.by_cliente.length) return <EmptyState icon={TrendingUp} title="Sem receita" description="Nenhum projeto com apontamentos aprovados no período." />

  const tipoLabel: Record<string, string> = {
    on_demand: 'On Demand', banco_horas: 'Banco de Horas', fechado: 'Fechado', outros: 'Outros',
  }

  return (
    <div className="space-y-3">
      {data.by_cliente.map(cliente => (
        <div key={cliente.cliente_id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
          <button
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
            style={{ background: 'var(--brand-bg)' }}
            onClick={() => setExpanded(prev => ({ ...prev, [cliente.cliente_id]: !prev[cliente.cliente_id] }))}>
            <div className="flex items-center gap-2">
              {expanded[cliente.cliente_id] ? <ChevronDown size={13} style={{ color: 'var(--brand-subtle)' }} /> : <ChevronRight size={13} style={{ color: 'var(--brand-subtle)' }} />}
              <span className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>{cliente.cliente_nome}</span>
              <span className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{cliente.projetos.length} projeto(s)</span>
            </div>
            <span className="text-xs font-bold tabular-nums" style={{ color: '#22c55e' }}>{formatBRL(cliente.total_cliente)}</span>
          </button>
          {expanded[cliente.cliente_id] && (
            <Table>
              <Thead>
                <Tr>
                  <Th>Projeto</Th>
                  <Th>Tipo Faturamento</Th>
                  <Th right>Horas Aprov.</Th>
                  <Th right>Valor Base</Th>
                  <Th right>Receita</Th>
                </Tr>
              </Thead>
              <Tbody>
                {cliente.projetos.map((p, i) => (
                  <Tr key={i}>
                    <Td>
                      <div className="text-xs" style={{ color: 'var(--brand-text)' }}>{p.projeto_nome}</div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--brand-subtle)' }}>{p.projeto_codigo}</div>
                    </Td>
                    <Td className="text-xs">{tipoLabel[p.tipo_faturamento] ?? p.tipo_faturamento}</Td>
                    <Td right className="tabular-nums text-xs">{p.horas_aprovadas.toFixed(1)}h</Td>
                    <Td right className="tabular-nums text-xs" style={{ color: 'var(--brand-muted)' }}>{p.valor_base > 0 ? formatBRL(p.valor_base) : '—'}</Td>
                    <Td right className="tabular-nums text-xs font-bold" style={{ color: '#22c55e' }}>{formatBRL(p.total_receita)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      ))}
      <div className="flex justify-end px-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--brand-subtle)' }}>
          Total Receita: <span className="text-sm font-bold ml-2 tabular-nums" style={{ color: '#22c55e' }}>
            {formatBRL(data.total_receita)}
          </span>
        </div>
      </div>
    </div>
  )
}

function TabConsolidado({ data, loading }: { data: Consolidado | null; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-16"><span className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Calculando...</span></div>
  if (!data) return <EmptyState icon={BarChart2} title="Sem dados" description="Selecione um período com dados." />

  const mColor = marginColor(data.margem_percentual)
  const totalCusto = data.total_custo_interno + data.total_custo_parceiros
  const marginPct = Math.min(100, Math.max(0, data.margem_percentual))

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Custo Interno',   value: formatBRL(data.total_custo_interno),   icon: UserCheck,  color: '#00F5FF' },
          { label: 'Custo Parceiros', value: formatBRL(data.total_custo_parceiros), icon: UserCheck,  color: '#a78bfa' },
          { label: 'Receita Total',   value: formatBRL(data.total_receita),         icon: TrendingUp, color: '#22c55e' },
          { label: 'Margem',          value: formatBRL(data.margem),                icon: BarChart2,  color: mColor   },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <c.icon size={12} style={{ color: c.color }} />
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p>
            </div>
            <p className="text-lg font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold" style={{ color: mColor }}>Margem sobre receita</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: mColor }}>{data.margem_percentual.toFixed(1)}%</span>
        </div>
        <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${marginPct}%`, background: mColor }} />
        </div>
        <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'var(--brand-subtle)' }}>
          <span>Custo total: {formatBRL(totalCusto)}</span>
          <span>Receita: {formatBRL(data.total_receita)}</span>
        </div>
      </div>
    </div>
  )
}

function TabRelatorio({ data, loading }: { data: Consolidado | null; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-16"><span className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Calculando...</span></div>
  if (!data) return <EmptyState icon={BarChart2} title="Sem dados" description="Selecione um período com dados." />

  const mColor = marginColor(data.margem_percentual)
  const totalCusto = data.total_custo_interno + data.total_custo_parceiros

  const rows = [
    { label: 'Custo Interno',   value: data.total_custo_interno,   color: '#00F5FF', bold: false },
    { label: 'Custo Parceiros', value: data.total_custo_parceiros, color: '#a78bfa', bold: false },
    { label: 'Total Custo',     value: totalCusto,                 color: '#f59e0b', bold: true  },
    { label: 'Receita Clientes',value: data.total_receita,         color: '#22c55e', bold: false },
    { label: 'Resultado (Margem)', value: data.margem,             color: mColor,    bold: true  },
    { label: 'Margem %',        value: null,                       color: mColor,    bold: true, pct: data.margem_percentual },
  ]

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
        <div className="px-4 py-3" style={{ background: 'var(--brand-bg)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Relatório Financeiro do Período</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)', background: r.bold ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <td className="px-4 py-3" style={{ color: r.bold ? 'var(--brand-text)' : 'var(--brand-muted)', fontWeight: r.bold ? 700 : 400 }}>{r.label}</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: r.color }}>
                  {r.pct !== undefined ? `${r.pct.toFixed(1)}%` : formatBRL(r.value!)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-center mt-4" style={{ color: 'var(--brand-subtle)' }}>
        Exportação em breve
      </p>
    </div>
  )
}

// ─── Modal de Validação ───────────────────────────────────────────────────────

function ModalValidacao({ yearMonth, onClose, onFechar }: {
  yearMonth: string
  onClose: () => void
  onFechar: () => void
}) {
  const [validacao, setValidacao] = useState<Validacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [fechando, setFechando] = useState(false)

  useEffect(() => {
    api.get<any>(`/fechamento/${yearMonth}/validar`)
      .then(r => setValidacao(r))
      .catch(() => toast.error('Erro ao validar'))
      .finally(() => setLoading(false))
  }, [yearMonth])

  const handleFechar = async () => {
    if (!validacao?.pode_fechar) return
    setFechando(true)
    try {
      await api.post(`/fechamento/${yearMonth}/fechar`, {})
      toast.success(`Competência ${fmtYearMonth(yearMonth)} fechada com sucesso!`)
      onFechar()
    } catch {
      toast.error('Erro ao fechar competência')
    } finally {
      setFechando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-md" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>Validar Fechamento</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Competência: <span className="font-semibold" style={{ color: 'var(--brand-text)' }}>{fmtYearMonth(yearMonth)}</span></p>
          {loading ? (
            <p className="text-xs animate-pulse py-4 text-center" style={{ color: 'var(--brand-subtle)' }}>Verificando...</p>
          ) : !validacao ? null : (
            <div className="space-y-2">
              {validacao.alertas.map((a, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                  <span className="text-xs" style={{ color: '#f59e0b' }}>{a.mensagem}</span>
                </div>
              ))}
              {validacao.pode_fechar && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle size={14} className="shrink-0" style={{ color: '#22c55e' }} />
                  <span className="text-xs" style={{ color: '#22c55e' }}>Tudo ok — pronto para fechar</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button
            onClick={handleFechar}
            disabled={!validacao?.pode_fechar || fechando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={validacao?.pode_fechar
              ? { background: '#22c55e', color: '#000' }
              : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)', cursor: 'not-allowed' }}>
            <Lock size={13} />
            {fechando ? 'Fechando...' : 'Fechar Competência'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'producao',    label: 'Produção'     },
  { id: 'custo',       label: 'Custo'        },
  { id: 'receita',     label: 'Receita'      },
  { id: 'consolidado', label: 'Consolidado'  },
  { id: 'relatorio',   label: 'Relatório'    },
] as const
type TabId = typeof TABS[number]['id']

export default function FechamentoPage() {
  const { user } = useAuth()
  const isAdmin = (user as any)?.type === 'admin'

  const now = new Date()
  const { filters: flt, set: setFilter } = usePersistedFilters(
    'fechamento',
    user?.id,
    { month: now.getMonth() + 1, year: now.getFullYear(), tab: 'producao' as TabId },
  )
  const { month, year, tab } = flt
  const setMonth = (v: number)  => setFilter('month', v)
  const setYear  = (v: number)  => setFilter('year', v)
  const setTab   = (v: TabId)   => setFilter('tab', v)

  const yearMonth = toYearMonth(month, year)

  const [status,      setStatus]      = useState<FechamentoStatus | null>(null)
  const [producao,    setProducao]    = useState<ProducaoRow[]>([])
  const [custo,       setCusto]       = useState<CustoData | null>(null)
  const [receita,     setReceita]     = useState<ReceitaData | null>(null)
  const [consolidado, setConsolidado] = useState<Consolidado | null>(null)

  const [loadingProducao,    setLoadingProducao]    = useState(false)
  const [loadingCusto,       setLoadingCusto]       = useState(false)
  const [loadingReceita,     setLoadingReceita]     = useState(false)
  const [loadingConsolidado, setLoadingConsolidado] = useState(false)

  const [showValidacao, setShowValidacao] = useState(false)
  const [reabrindo,     setReabrindo]     = useState(false)

  // Carrega status do fechamento ao mudar o mês
  const loadStatus = useCallback(() => {
    api.get<{ data: FechamentoStatus[] }>('/fechamento')
      .then(r => {
        const found = r.data.find((f: FechamentoStatus) => f.year_month === yearMonth)
        setStatus(found ?? null)
      })
      .catch(() => {})
  }, [yearMonth])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Carrega aba ativa ao mudar aba ou mês
  const loadTab = useCallback((t: TabId) => {
    if (t === 'producao') {
      setLoadingProducao(true)
      api.get<{ data: ProducaoRow[] }>(`/fechamento/${yearMonth}/producao`)
        .then(r => setProducao(r.data ?? []))
        .catch(() => toast.error('Erro ao carregar produção'))
        .finally(() => setLoadingProducao(false))
    } else if (t === 'custo') {
      setLoadingCusto(true)
      api.get<{ data: CustoData }>(`/fechamento/${yearMonth}/custo`)
        .then(r => setCusto(r.data))
        .catch(() => toast.error('Erro ao carregar custos'))
        .finally(() => setLoadingCusto(false))
    } else if (t === 'receita') {
      setLoadingReceita(true)
      api.get<{ data: ReceitaData }>(`/fechamento/${yearMonth}/receita`)
        .then(r => setReceita(r.data))
        .catch(() => toast.error('Erro ao carregar receita'))
        .finally(() => setLoadingReceita(false))
    } else if (t === 'consolidado' || t === 'relatorio') {
      setLoadingConsolidado(true)
      api.get<{ data: Consolidado }>(`/fechamento/${yearMonth}/consolidado`)
        .then(r => setConsolidado(r.data))
        .catch(() => toast.error('Erro ao carregar consolidado'))
        .finally(() => setLoadingConsolidado(false))
    }
  }, [yearMonth])

  useEffect(() => {
    setProducao([])
    setCusto(null)
    setReceita(null)
    setConsolidado(null)
    loadTab(tab)
  }, [yearMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (t: TabId) => {
    setTab(t)
    loadTab(t)
  }

  const handleReabrir = async () => {
    if (!confirm(`Reabrir a competência ${fmtYearMonth(yearMonth)}? Os dados de snapshot serão apagados.`)) return
    setReabrindo(true)
    try {
      await api.post(`/fechamento/${yearMonth}/reabrir`, {})
      toast.success('Competência reaberta.')
      loadStatus()
      loadTab(tab)
    } catch {
      toast.error('Erro ao reabrir competência')
    } finally {
      setReabrindo(false)
    }
  }

  const isClosed = status?.status === 'closed'

  return (
    <AppLayout title="Fechamento">
      <div className="flex flex-col gap-5 p-6 h-full">

        {/* Header */}
        <PageHeader
          icon={DollarSign}
          title="Fechamento Administrativo"
          subtitle={`Competência: ${fmtYearMonth(yearMonth)}`}
          actions={
            <div className="flex items-center gap-3">
              <MonthYearPicker
                month={month}
                year={year}
                onChange={(m, y) => { if (m && y) { setMonth(m); setYear(y) } }}
              />

              {isClosed ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <Lock size={11} /> FECHADO
                  </div>
                  {status?.closed_by_name && (
                    <span className="text-[11px]" style={{ color: 'var(--brand-subtle)' }}>por {status.closed_by_name}</span>
                  )}
                  {isAdmin && (
                    <button onClick={handleReabrir} disabled={reabrindo}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5"
                      style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
                      <RefreshCw size={11} className={reabrindo ? 'animate-spin' : ''} />
                      Reabrir
                    </button>
                  )}
                </div>
              ) : (
                isAdmin && (
                  <button
                    onClick={() => setShowValidacao(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <Lock size={13} />
                    Validar e Fechar
                  </button>
                )
              )}
            </div>
          }
        />

        {/* Banner snapshot */}
        {isClosed && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <Lock size={13} style={{ color: '#22c55e' }} />
            <span style={{ color: '#22c55e' }}>
              Dados históricos — competência fechada
              {status?.closed_at && ` em ${new Date(status.closed_at).toLocaleDateString('pt-BR')}`}
              {status?.closed_by_name && ` por ${status.closed_by_name}`}
            </span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className="px-5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
              style={{
                color: tab === t.id ? '#00F5FF' : 'var(--brand-subtle)',
                borderBottom: tab === t.id ? '2px solid #00F5FF' : '2px solid transparent',
                marginBottom: '-1px',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'producao'    && <TabProducao    data={producao}    loading={loadingProducao}    />}
          {tab === 'custo'       && <TabCusto       data={custo}       loading={loadingCusto}       />}
          {tab === 'receita'     && <TabReceita     data={receita}     loading={loadingReceita}     />}
          {tab === 'consolidado' && <TabConsolidado data={consolidado} loading={loadingConsolidado} />}
          {tab === 'relatorio'   && <TabRelatorio   data={consolidado} loading={loadingConsolidado} />}
        </div>
      </div>

      {showValidacao && (
        <ModalValidacao
          yearMonth={yearMonth}
          onClose={() => setShowValidacao(false)}
          onFechar={() => { setShowValidacao(false); loadStatus(); loadTab(tab) }}
        />
      )}
    </AppLayout>
  )
}
