'use client'

import { useEffect, useMemo, useState, useCallback, Fragment } from 'react'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable, Button } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { KeruakTitulosModal } from '@/components/shared/KeruakTitulosModal'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useTableSort } from '@/hooks/use-table-sort'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { TrendingUp, Download, FileText, X, ChevronDown, ChevronRight, RefreshCw, Check, Pencil, BarChart2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

interface Row {
  user_id: number; consultor: string
  project_id: number; projeto: string; cliente: string
  valor_hora_projeto: number; valor_hora_consultor: number
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
  rate_type?: string; custo_fixo_mes?: number // 'monthly' = recebe fixo; salário mensal cheio
  fixo_excluir?: boolean // coordenador/diretor/Bizify → fora da seção Recebe Fixo
  is_investimento?: boolean // projeto de investimento (receita 0) — sempre incluído + em evidência
}
interface DiaRow { dia: string; user_id: number; project_id: number; cliente: string; horas: number; nao_util?: boolean }

// Linha exibida na tabela. Na visão "consultor" é a própria Row; na visão
// "projeto" é o consolidado de todos os consultores daquele projeto (custo/h = médio).
interface DisplayRow extends Row { key: string; n_consultores: number }

// Aba "Clientes": rentabilidade por cliente cruzada com o RECEBIMENTO do Keruak
// (por CNPJ). O recebido é sempre do mês seguinte ao apontamento (trabalha em M,
// recebe em M+1): apontamentos de maio ↔ recebimento de junho.
interface ProjetoRent { project_id: number; projeto: string; horas: number; custo: number; is_investimento: boolean }
interface ConsultorRent { user_id: number; consultor: string; valor_hora: number; horas: number; custo: number; tem_investimento?: boolean; projetos?: ProjetoRent[] }
interface ClienteRow {
  customer_id: number | null; cliente: string; cnpj: string; cnpjs?: string[]; executivo: string | null
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
  recebido: number; margem_real: number; margem_real_pct: number | null; no_minutor: boolean
  consultores: ConsultorRent[]
  despesas?: { custo: number; projetos: DespesaProj[] }
  investimento_mo?: number; investimento_desp?: number
  // +40% Custo = 40% do Valor Recebido; Custo Total = Custo Operação + 40%; Resultado = Recebido − Custo Total.
  custo40: number; custo_total: number; resultado: number; resultado_pct: number | null; custo40_pct: number | null
  // Ajustes iniciais do ano (somados no custo/recebido): só p/ cliente cadastrado.
  custo_inicial?: number; receita_inicial?: number
}
interface DespesaUser { user_id: number; usuario: string; custo: number }
interface DespesaProj { project_id: number; projeto: string; custo: number; is_investimento: boolean; usuarios?: DespesaUser[] }

const fmtH = (h: number) => `${h.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`
const pctColor = (p: number | null) => p == null ? 'var(--text-light)' : p < 0 ? 'var(--danger)' : p < 20 ? 'var(--warning)' : 'var(--success)'

// Cores das colunas (mesmo conceito do BI): cabeçalho forte + célula tonalizada.
const COL_HEAD = { recebido: '#38761d', custo: '#bf9000', custo40: '#d9683a', total: '#cc0000', resultado: '#1f6fbf', margem: '#bf9000' }
const COL_CELL = { recebido: '#d9ead3', custo: '#fff2cc', custo40: '#fce5cd', total: '#f4cccc', resultado: '#cfe2f3' }
const margemBg = (pct: number | null) => pct == null ? '#e5e7eb' : pct < 0 ? '#e06666' : pct < 5 ? '#f6b26b' : '#93c47d'
// Cor da legenda da Margem +40% (% mantido): <=49 vermelho, 50-79 amarelo, >=80 verde.
const pct40Color = (p: number | null) => p == null ? 'rgba(0,0,0,0.4)' : p >= 80 ? '#2e7d32' : p >= 50 ? '#b8860b' : '#cc0000'
// Cor da margem operacional ("Mg op."): >= 50% verde | 0 a 50% laranja | < 0 vermelho.
const mgOpColor = (p: number | null) => p == null ? 'rgba(0,0,0,0.4)' : p >= 50 ? '#2e7d32' : p >= 0 ? '#b8860b' : '#cc0000'

// Deriva a linha do cliente: injeta os AJUSTES INICIAIS do ano (custo inicial → Custo Operação,
// receita inicial → Valor Recebido) e recalcula todas as margens. Recebe a linha CRUA (soma dos
// meses) e o ajuste do cliente. Manter em sincronia com o cálculo do +40% no fechamento.
function deriveClienteRow(r: ClienteRow, init?: { custo_inicial: number; receita_inicial: number }): ClienteRow {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const custoInicial = init?.custo_inicial ?? 0
  const receitaInicial = init?.receita_inicial ?? 0
  const horas = r2(r.horas), receita = r2(r.receita)
  const custo = r2(r.custo + custoInicial)        // Custo Operação += custo inicial
  const recebido = r2(r.recebido + receitaInicial) // Valor Recebido += receita inicial
  const margem = r2(receita - custo), margem_real = r2(recebido - custo)
  const custo40Full = r2(recebido * 0.40)
  let custo40 = custo40Full
  let resultado = r2(recebido - custo - custo40)
  if (resultado < 0) {
    const absorvido = Math.min(-resultado, custo40)
    custo40 = r2(custo40 - absorvido)
    resultado = r2(resultado + absorvido)
  }
  const custo_total = r2(custo + custo40)
  const custo40_pct = custo40Full > 0 ? Math.round(custo40 / custo40Full * 1000) / 10 : null
  return {
    ...r, horas, receita, custo, recebido, margem,
    margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
    margem_real, margem_real_pct: recebido > 0 ? Math.round(margem_real / recebido * 1000) / 10 : null,
    custo40, custo_total, resultado,
    resultado_pct: recebido > 0 ? Math.round(resultado / recebido * 1000) / 10 : (resultado < 0 ? -100 : null),
    custo40_pct,
    custo_inicial: custoInicial, receita_inicial: receitaInicial,
  }
}

// Editor inline dos ajustes iniciais do ano (custo/receita) de um cliente. Salva no blur.
function InitialsEditor({ custoInicial, receitaInicial, onSave }: {
  custoInicial: number; receitaInicial: number; onSave: (custo: number, receita: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [custo, setCusto] = useState(custoInicial ? String(custoInicial) : '')
  const [receita, setReceita] = useState(receitaInicial ? String(receitaInicial) : '')
  const startEdit = () => {
    setCusto(custoInicial ? String(custoInicial) : '')
    setReceita(receitaInicial ? String(receitaInicial) : '')
    setEditing(true)
  }
  const save = () => {
    const c = Number(custo) || 0, rec = Number(receita) || 0
    if (c !== custoInicial || rec !== receitaInicial) onSave(c, rec)
    setEditing(false)
  }
  const inp: React.CSSProperties = { width: 120, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, textAlign: 'right' }
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)' }
  return (
    <div className="flex items-center gap-4 flex-wrap" style={{ padding: '8px 8px 10px' }} onClick={e => e.stopPropagation()}>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Ajustes iniciais do ano</span>
      {editing ? (
        <>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Custo inicial
            <input autoFocus type="number" step="0.01" min="0" value={custo} onChange={e => setCusto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="0,00" style={inp} />
          </label>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Receita inicial
            <input type="number" step="0.01" min="0" value={receita} onChange={e => setReceita(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="0,00" style={inp} />
          </label>
          <button type="button" onClick={save} title="Salvar e fechar"
            style={{ ...btn, background: 'var(--success-bg)', borderColor: 'var(--success-border)', color: 'var(--success-border)' }}>
            <Check size={15} strokeWidth={3} />
          </button>
        </>
      ) : (
        <>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Custo inicial <b style={{ color: 'var(--text)' }}>{formatBRL(custoInicial)}</b></span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Receita inicial <b style={{ color: 'var(--text)' }}>{formatBRL(receitaInicial)}</b></span>
          <button type="button" onClick={startEdit} title="Editar"
            style={{ ...btn, background: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
            <Pencil size={14} />
          </button>
        </>
      )}
      <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Somam no Custo Operação e no Valor Recebido deste ano.</span>
    </div>
  )
}
const thCol = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.25)', position: 'sticky', top: 0, zIndex: 2 })
const tdCol = (bg: string, color = '#111827'): React.CSSProperties => ({ background: bg, color, padding: '6px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' })

export default function RentabilidadePage({ visaoForced, embedded, periodo }: { visaoForced?: 'consultor' | 'projeto' | 'clientes'; embedded?: boolean; periodo?: { fromM: number; fromY: number; toM: number; toY: number } } = {}) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const [year, setYear]   = useState(currentYear)
  // Período (abas consultor/projeto): De..Até por mês — PODE incluir o mês atual.
  const [fromM, setFromM] = useState(currentYear <= 2026 ? 5 : 1)
  const [fromY, setFromY] = useState(currentYear)
  const [toM, setToM]     = useState(currentMonth)
  const [toY, setToY]     = useState(currentYear)
  // Embutido (Portal de Sustentação): o período vem do filtro do portal via prop.
  useEffect(() => {
    if (periodo) { setFromM(periodo.fromM); setFromY(periodo.fromY); setToM(periodo.toM); setToY(periodo.toY) }
  }, [periodo?.fromM, periodo?.fromY, periodo?.toM, periodo?.toY])
  const [rows, setRows]   = useState<Row[]>([])
  const [monthly, setMonthly] = useState<{ ym: string; rows: Row[]; dias: DiaRow[] }[]>([]) // dados crus por mês (gráficos + fixos)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [soReceita, setSoReceita] = useState(true)
  const [incluirErpserv, setIncluirErpserv] = useState(true) // Consultor×Projeto: incluir apontamentos da ERPSERV (interna) nos dados/totais
  const [diaModal, setDiaModal] = useState<string | null>(null) // dia (YYYY-MM-DD) clicado no gráfico "Horas apontadas por dia"
  const [fCliente, setFCliente]     = useState('')
  const [fProjeto, setFProjeto]     = useState('')
  const [fConsultor, setFConsultor] = useState('')
  // Cada visão é uma rotina própria no menu Relatórios (sub-rotas que reusam este
  // componente). A visão é derivada do pathname:
  //   /relatorios/rentabilidade            → Clientes (BI Keruak)
  //   /relatorios/rentabilidade/consultor  → Consultor × Projeto
  //   /relatorios/rentabilidade/projeto    → Por projeto
  const pathname = usePathname()
  const visao: 'consultor' | 'projeto' | 'clientes' = visaoForced ??
    (pathname?.endsWith('/rentabilidade/consultor') ? 'consultor'
    : pathname?.endsWith('/rentabilidade/projeto') ? 'projeto'
    : 'clientes')
  // Linhas CRUAS (agregadas dos meses, sem ajuste inicial). A derivação (que injeta os
  // iniciais do ano e calcula margens) é feita em useMemo abaixo → editar é instantâneo.
  const [rawClientesRows, setRawClientesRows] = useState<ClienteRow[]>([])
  // Ajustes iniciais do ANO por cliente: { customer_id: { custo_inicial, receita_inicial } }.
  const [initials, setInitials] = useState<Record<number, { custo_inicial: number; receita_inicial: number }>>({})
  const [clientesLoading, setClientesLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [soMinutor, setSoMinutor] = useState(false)
  const [soForaMinutor, setSoForaMinutor] = useState(false)
  const [considerarErpserv, setConsiderarErpserv] = useState(false) // ERPSERV vem separada; botão p/ incluí-la (ou não) nos totais
  const [fExecutivo, setFExecutivo] = useState('')
  // Drill-down: títulos do Keruak ao clicar no Valor Recebido de um cliente.
  const [keruakModal, setKeruakModal] = useState<{ cliente: string; cnpjs: string[]; valorInicial: number } | null>(null)
  const [fConsultorCli, setFConsultorCli] = useState('')
  const [expandedCli, setExpandedCli] = useState<Set<string>>(new Set())
  const [expandedCons, setExpandedCons] = useState<Set<string>>(new Set()) // consultor expandido → projetos que atuou

  // Filtro ANUAL. Minutor a partir de maio/2026 (início dos dados); anos seguintes
  // começam em janeiro. NUNCA traz o mês ATUAL — vai sempre até o mês ANTERIOR (mês
  // corrente incompleto e recebimento Keruak M+1 ainda não chegou). Anos anteriores
  // vão até dezembro. O endpoint de clientes pareia Minutor[M] × Keruak[M+1].
  const monthsToFetch = useMemo(() => {
    const out: string[] = []
    // Clientes (BI Keruak): ANUAL, NUNCA traz o mês atual (recebimento M+1 ainda não chegou).
    if (visao === 'clientes') {
      const startMonth = year <= 2026 ? 5 : 1
      const endMonth = year === currentYear ? currentMonth - 1 : 12
      for (let m = startMonth; m <= endMonth; m++) out.push(`${year}-${String(m).padStart(2, '0')}`)
      return out
    }
    // Consultor/Projeto: período De..Até escolhido (pode incluir o mês atual).
    let y = fromY, m = fromM, guard = 0
    while ((y < toY || (y === toY && m <= toM)) && guard++ < 60) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return out
  }, [visao, year, currentYear, currentMonth, fromM, fromY, toM, toY])

  // Meses de recebimento Keruak (M+1) que compõem o Valor Recebido exibido —
  // usados pelo drill-down de títulos pra o total bater com a célula.
  const recebMonths = useMemo(() => monthsToFetch.map(ym => {
    const [y, m] = ym.split('-').map(Number)
    const ny = m === 12 ? y + 1 : y
    const nm = m === 12 ? 1 : m + 1
    return `${ny}-${String(nm).padStart(2, '0')}`
  }), [monthsToFetch])

  useEffect(() => {
    setLoading(true)
    Promise.all(monthsToFetch.map(ym =>
      api.get<{ data: { rows: Row[]; por_dia?: DiaRow[] } }>(`/relatorios/rentabilidade/${ym}`)
        .then(r => ({ ym, rows: r?.data?.rows ?? [], dias: r?.data?.por_dia ?? [] })).catch(() => ({ ym, rows: [] as Row[], dias: [] as DiaRow[] }))
    )).then(perMonth => {
      setMonthly(perMonth)
      const results = perMonth.map(x => x.rows)
      const all = results.flat()
      if (monthsToFetch.length === 1) { setRows(all); return }
      // Período: agrega por consultor × projeto somando horas/receita/custo.
      const map = new Map<string, Row>()
      for (const r of all) {
        const k = `${r.user_id}:${r.project_id}`
        const e = map.get(k)
        if (!e) map.set(k, { ...r })
        else { e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.valor_hora_projeto = r.valor_hora_projeto; e.valor_hora_consultor = r.valor_hora_consultor }
      }
      setRows([...map.values()].map(r => {
        const horas = Math.round(r.horas * 100) / 100, receita = Math.round(r.receita * 100) / 100, custo = Math.round(r.custo * 100) / 100
        const margem = Math.round((receita - custo) * 100) / 100
        return { ...r, horas, receita, custo, margem, margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null }
      }))
    }).finally(() => setLoading(false))
  }, [monthsToFetch])

  // Aba Clientes: busca a rentabilidade-por-cliente + recebido Keruak (M+1).
  // refresh=true → ?refresh=1 (botão "Atualizar Keruak": ignora o cache de 3h).
  const loadClientes = useCallback((refresh = false) => {
    if (refresh) setRefreshing(true); else setClientesLoading(true)
    const qs = refresh ? '?refresh=1' : ''
    return Promise.all(monthsToFetch.map(ym =>
      api.get<{ data: { rows: ClienteRow[] } }>(`/relatorios/rentabilidade/clientes/${ym}${qs}`)
        .then(r => r?.data?.rows ?? []).catch(() => [] as ClienteRow[])
    )).then(results => {
      const all = results.flat()
      const map = new Map<string, ClienteRow>()
      for (const r of all) {
        const k = r.cnpj || (r.customer_id != null ? 'c' + r.customer_id : r.cliente)
        const e = map.get(k)
        if (!e) map.set(k, { ...r,
          consultores: (r.consultores || []).map(c => ({ ...c, projetos: (c.projetos || []).map(p => ({ ...p })) })),
          despesas: r.despesas ? { custo: r.despesas.custo, projetos: (r.despesas.projetos || []).map(p => ({ ...p, usuarios: (p.usuarios || []).map(u => ({ ...u })) })) } : undefined,
        })
        else {
          e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.recebido += r.recebido
          e.investimento_mo = (e.investimento_mo ?? 0) + (r.investimento_mo ?? 0)
          e.investimento_desp = (e.investimento_desp ?? 0) + (r.investimento_desp ?? 0)
          e.no_minutor = e.no_minutor || r.no_minutor
          if (!e.executivo && r.executivo) e.executivo = r.executivo
          if (r.despesas) {
            e.despesas = e.despesas || { custo: 0, projetos: [] }
            e.despesas.custo += r.despesas.custo
            for (const p of (r.despesas.projetos || [])) {
              const ep = e.despesas.projetos.find(x => x.project_id === p.project_id)
              if (ep) {
                ep.custo += p.custo; ep.is_investimento = ep.is_investimento || p.is_investimento
                ep.usuarios = ep.usuarios || []
                for (const u of (p.usuarios || [])) {
                  const eu = ep.usuarios.find(x => x.user_id === u.user_id)
                  if (eu) eu.custo += u.custo
                  else ep.usuarios.push({ ...u })
                }
              } else e.despesas.projetos.push({ ...p, usuarios: (p.usuarios || []).map(u => ({ ...u })) })
            }
          }
          for (const c of (r.consultores || [])) {
            const ex = e.consultores.find(x => x.user_id === c.user_id)
            if (ex) {
              ex.horas += c.horas; ex.custo += c.custo
              ex.tem_investimento = ex.tem_investimento || c.tem_investimento
              for (const p of (c.projetos || [])) {
                const ep = (ex.projetos = ex.projetos || []).find(x => x.project_id === p.project_id)
                if (ep) { ep.horas += p.horas; ep.custo += p.custo; ep.is_investimento = ep.is_investimento || p.is_investimento }
                else ex.projetos.push({ ...p })
              }
            } else e.consultores.push({ ...c, projetos: (c.projetos || []).map(p => ({ ...p })) })
          }
        }
      }
      // Guarda CRU; a derivação (injeção dos iniciais + margens) é o useMemo clientesRows.
      setRawClientesRows([...map.values()])
    }).finally(() => { setClientesLoading(false); setRefreshing(false) })
  }, [monthsToFetch])

  useEffect(() => { if (visao === 'clientes') void loadClientes(false) }, [visao, loadClientes])

  // Ajustes iniciais do ano (custo/receita inicial por cliente). Buscados 1x por ano.
  useEffect(() => {
    if (visao !== 'clientes') return
    api.get<{ data: Record<number, { custo_inicial: number; receita_inicial: number }> }>(`/relatorios/rentabilidade/initials/${year}`)
      .then(r => setInitials(r?.data ?? {}))
      .catch(() => setInitials({}))
  }, [visao, year])

  // Derivação: injeta os iniciais do ano e calcula margens (instantâneo ao editar).
  const clientesRows = useMemo(
    () => rawClientesRows.map(r => deriveClienteRow(r, r.customer_id != null ? initials[r.customer_id] : undefined)),
    [rawClientesRows, initials],
  )

  // Salva o ajuste inicial de um cliente (upsert) e atualiza local (re-deriva na hora).
  const saveInitial = useCallback(async (customerId: number, custo: number, receita: number) => {
    try {
      await api.put('/relatorios/rentabilidade/initials', { customer_id: customerId, year, custo_inicial: custo, receita_inicial: receita })
      setInitials(prev => ({ ...prev, [customerId]: { custo_inicial: custo, receita_inicial: receita } }))
      toast.success('Ajuste inicial salvo')
    } catch {
      toast.error('Erro ao salvar ajuste inicial')
    }
  }, [year])

  // Opções dos filtros (distintos, derivados das linhas carregadas).
  const optClientes = useMemo(() => {
    const set = new Map<string, string>()
    rows.forEach(r => { if (r.cliente) set.set(r.cliente, r.cliente) })
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ id: c, name: c }))
  }, [rows])
  const optProjetos = useMemo(() => {
    const set = new Map<number, string>()
    rows.forEach(r => set.set(r.project_id, r.projeto))
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => ({ id, name }))
  }, [rows])
  const optConsultores = useMemo(() => {
    const set = new Map<number, string>()
    rows.forEach(r => set.set(r.user_id, r.consultor))
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => ({ id, name }))
  }, [rows])

  // ERPSERV = empresa interna; quando o toggle "Incluir ERPSERV" está off, seus
  // apontamentos saem da tabela, totais e gráficos do Consultor×Projeto.
  const isErpservNome = (c?: string) => (c || '').toUpperCase().includes('ERPSERV')

  const filtered = useMemo(() => rows.filter(r => {
    if (soReceita && r.receita === 0 && !r.is_investimento) return false // investimento entra mesmo sem receita
    if (!incluirErpserv && isErpservNome(r.cliente)) return false
    if (fCliente && r.cliente !== fCliente) return false
    if (fProjeto && String(r.project_id) !== fProjeto) return false
    if (fConsultor && String(r.user_id) !== fConsultor) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      if (!r.consultor.toLowerCase().includes(q) && !r.projeto.toLowerCase().includes(q) && !r.cliente.toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, busca, soReceita, incluirErpserv, fCliente, fProjeto, fConsultor])

  const r2 = (n: number) => Math.round(n * 100) / 100
  const fmtMesCurto = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(y).slice(2) }

  // Gráfico de apontamento (horas). Sem consultor filtrado → barras POR CONSULTOR (top 15);
  // com consultor filtrado → barras POR PERÍODO (mês a mês do consultor selecionado).
  const chartData = useMemo(() => {
    const passaFiltro = (r: Row) => {
      if (soReceita && r.receita === 0 && !r.is_investimento) return false
      if (!incluirErpserv && isErpservNome(r.cliente)) return false
      if (fCliente && r.cliente !== fCliente) return false
      if (fProjeto && String(r.project_id) !== fProjeto) return false
      if (busca.trim()) {
        const q = busca.trim().toLowerCase()
        if (!r.consultor.toLowerCase().includes(q) && !r.projeto.toLowerCase().includes(q) && !r.cliente.toLowerCase().includes(q)) return false
      }
      return true
    }
    if (fConsultor) {
      return monthly.map(({ ym, rows: mr }) => ({
        label: fmtMesCurto(ym),
        horas: r2(mr.filter(r => String(r.user_id) === fConsultor && passaFiltro(r)).reduce((s, r) => s + r.horas, 0)),
      }))
    }
    const map = new Map<number, { label: string; horas: number }>()
    for (const r of filtered) {
      const e = map.get(r.user_id) ?? { label: r.consultor, horas: 0 }
      e.horas += r.horas; map.set(r.user_id, e)
    }
    return [...map.values()].map(e => ({ label: e.label, horas: r2(e.horas) })).sort((a, b) => b.horas - a.horas).slice(0, 15)
  }, [fConsultor, monthly, filtered, soReceita, incluirErpserv, fCliente, fProjeto, busca])

  // Gráfico de horas apontadas POR DIA (respeita filtros consultor/cliente/projeto + período).
  // Mês filtrado (≤ ~31 dias) mostra o mês inteiro; período longo → últimos 60 dias (legibilidade).
  const DIA_MAX = 60
  const diaChart = useMemo(() => {
    const map = new Map<string, { horas: number; naoUtil: boolean }>()
    for (const { dias } of monthly) {
      for (const d of dias) {
        if (fConsultor && String(d.user_id) !== fConsultor) continue
        if (fProjeto && String(d.project_id) !== fProjeto) continue
        if (fCliente && d.cliente !== fCliente) continue
        if (!incluirErpserv && isErpservNome(d.cliente)) continue
        const e = map.get(d.dia) ?? { horas: 0, naoUtil: !!d.nao_util }
        e.horas += d.horas; map.set(d.dia, e)
      }
    }
    const all = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, v]) => ({ label: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, horas: r2(v.horas), naoUtil: v.naoUtil, dia }))
    const limitado = all.length > DIA_MAX
    const data = limitado ? all.slice(-DIA_MAX) : all
    return { data, limitado, total: r2(data.reduce((s, d) => s + d.horas, 0)), temNaoUtil: data.some(d => d.naoUtil) }
  }, [monthly, fConsultor, fProjeto, fCliente, incluirErpserv])

  // Nome do consultor/projeto por user_id:project_id (resolve os IDs dos apontamentos diários).
  const nomesByUP = useMemo(() => {
    const m = new Map<string, { consultor: string; projeto: string; cliente: string }>()
    for (const { rows: mr } of monthly) for (const r of mr) m.set(`${r.user_id}:${r.project_id}`, { consultor: r.consultor, projeto: r.projeto, cliente: r.cliente })
    return m
  }, [monthly])

  // Detalhe do dia clicado (modal): apontamentos do dia respeitando os filtros ativos.
  const diaDetalhe = useMemo(() => {
    if (!diaModal) return null
    const itens: { consultor: string; projeto: string; cliente: string; horas: number }[] = []
    for (const { dias } of monthly) for (const d of dias) {
      if (d.dia !== diaModal) continue
      if (fConsultor && String(d.user_id) !== fConsultor) continue
      if (fProjeto && String(d.project_id) !== fProjeto) continue
      if (fCliente && d.cliente !== fCliente) continue
      if (!incluirErpserv && isErpservNome(d.cliente)) continue
      const nm = nomesByUP.get(`${d.user_id}:${d.project_id}`)
      itens.push({ consultor: nm?.consultor ?? `#${d.user_id}`, projeto: nm?.projeto ?? `#${d.project_id}`, cliente: d.cliente, horas: r2(d.horas) })
    }
    itens.sort((a, b) => b.horas - a.horas)
    return { itens, total: r2(itens.reduce((s, i) => s + i.horas, 0)) }
  }, [diaModal, monthly, nomesByUP, fConsultor, fProjeto, fCliente, incluirErpserv])

  // Seção "Recebe Fixo": consultores com rate_type 'monthly'. Custo Fixo = salário/mês ×
  // nº de meses do período; Receita = apontamentos no período; Resultado = Receita − Custo Fixo.
  // Derivado do MESMO `filtered` da tabela (mesmos filtros) → as horas/receita batem com a linha do consultor.
  const fixosData = useMemo(() => {
    const byUser = new Map<number, { user_id: number; consultor: string; receita: number; custoHoras: number; horas: number; salary: number }>()
    for (const r of filtered) {
      if (r.rate_type !== 'monthly') continue
      if (r.fixo_excluir) continue // não traz coordenador/diretor/Bizify
      const e = byUser.get(r.user_id) ?? { user_id: r.user_id, consultor: r.consultor, receita: 0, custoHoras: 0, horas: 0, salary: 0 }
      e.receita += r.receita; e.custoHoras += r.custo; e.horas += r.horas
      if (r.custo_fixo_mes) e.salary = r.custo_fixo_mes
      byUser.set(r.user_id, e)
    }
    const nMeses = monthsToFetch.length || 1
    return [...byUser.values()].map(e => {
      const custoFixo = r2(e.salary * nMeses)
      return { ...e, receita: r2(e.receita), custoHoras: r2(e.custoHoras), horas: r2(e.horas), nMeses, custoFixo, resultado: r2(e.receita - custoFixo) }
    }).sort((a, b) => a.resultado - b.resultado)
  }, [filtered, monthsToFetch])
  const fixosTot = useMemo(() => fixosData.reduce((a, f) => ({ custoFixo: a.custoFixo + f.custoFixo, receita: a.receita + f.receita, resultado: a.resultado + f.resultado }), { custoFixo: 0, receita: 0, resultado: 0 }), [fixosData])

  // Linhas-pai: consolidado por projeto (soma horas/receita/custo, conta consultores,
  // custo/h = custo total ÷ horas). Cada pai expande nas linhas dos consultores.
  const projectRows = useMemo<DisplayRow[]>(() => {
    const map = new Map<number, { projeto: string; cliente: string; vhp: number; horas: number; receita: number; custo: number; users: Set<number>; inv: boolean }>()
    for (const r of filtered) {
      let e = map.get(r.project_id)
      if (!e) { e = { projeto: r.projeto, cliente: r.cliente, vhp: r.valor_hora_projeto, horas: 0, receita: 0, custo: 0, users: new Set(), inv: false }; map.set(r.project_id, e) }
      e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.users.add(r.user_id); e.inv = e.inv || !!r.is_investimento
    }
    return [...map.entries()].map(([project_id, e]) => {
      const horas = Math.round(e.horas * 100) / 100, receita = Math.round(e.receita * 100) / 100, custo = Math.round(e.custo * 100) / 100
      const margem = Math.round((receita - custo) * 100) / 100
      return {
        key: `p${project_id}`, user_id: 0, consultor: '', n_consultores: e.users.size,
        project_id, projeto: e.projeto, cliente: e.cliente, is_investimento: e.inv,
        valor_hora_projeto: e.vhp, valor_hora_consultor: horas > 0 ? Math.round(custo / horas * 100) / 100 : 0,
        horas, receita, custo, margem, margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
      }
    })
  }, [filtered])

  // Filhos (consultores) de cada projeto, ordenados por receita desc.
  const childrenByProject = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of filtered) { const a = m.get(r.project_id) ?? []; a.push(r); m.set(r.project_id, a) }
    for (const a of m.values()) a.sort((x, y) => y.receita - x.receita)
    return m
  }, [filtered])

  // Linhas-pai por CONSULTOR (visão "Consultor × Projeto"): uma linha única por consultor
  // totalizando horas/receita/custo (custo já vem convertido /160 p/ fixo no filho).
  // n_consultores reaproveita o campo p/ guardar a contagem de projetos do consultor.
  const consultorRows = useMemo<DisplayRow[]>(() => {
    const map = new Map<number, { consultor: string; vhc: number; horas: number; receita: number; custo: number; projs: Set<number>; inv: boolean }>()
    for (const r of filtered) {
      let e = map.get(r.user_id)
      if (!e) { e = { consultor: r.consultor, vhc: r.valor_hora_consultor, horas: 0, receita: 0, custo: 0, projs: new Set(), inv: false }; map.set(r.user_id, e) }
      e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.projs.add(r.project_id); e.inv = e.inv || !!r.is_investimento
    }
    return [...map.entries()].map(([user_id, e]) => {
      const horas = Math.round(e.horas * 100) / 100, receita = Math.round(e.receita * 100) / 100, custo = Math.round(e.custo * 100) / 100
      const margem = Math.round((receita - custo) * 100) / 100
      return {
        key: `u${user_id}`, user_id, consultor: e.consultor, n_consultores: e.projs.size,
        project_id: 0, projeto: '', cliente: '', is_investimento: e.inv,
        valor_hora_projeto: horas > 0 ? Math.round(receita / horas * 100) / 100 : 0, // R$/h projeto médio (mix)
        valor_hora_consultor: e.vhc,
        horas, receita, custo, margem, margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
      }
    })
  }, [filtered])

  // Filhos (projetos) de cada consultor, ordenados por receita desc.
  const childrenByConsultor = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of filtered) { const a = m.get(r.user_id) ?? []; a.push(r); m.set(r.user_id, a) }
    for (const a of m.values()) a.sort((x, y) => y.receita - x.receita)
    return m
  }, [filtered])

  // Pai conforme a visão: projeto (id = project_id) ou consultor (id = user_id).
  const parentId = (r: DisplayRow) => visao === 'projeto' ? r.project_id : r.user_id
  const childrenOf = (r: DisplayRow) => (visao === 'projeto' ? childrenByProject.get(r.project_id) : childrenByConsultor.get(r.user_id)) ?? []
  const { sorted, thProps } = useTableSort(visao === 'projeto' ? projectRows : consultorRows)

  // Árvore: começa recolhida (uma linha por pai); clique expande. Reseta ao trocar de visão.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  useEffect(() => { setExpanded(new Set()) }, [visao])
  const toggleRow = (pid: number) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(pid)) n.delete(pid); else n.add(pid)
    return n
  })

  const tot = useMemo(() => {
    const receita = filtered.reduce((s, r) => s + r.receita, 0)
    const custo   = filtered.reduce((s, r) => s + r.custo, 0)
    const horas   = filtered.reduce((s, r) => s + r.horas, 0)
    return { receita, custo, horas, margem: receita - custo, pct: receita > 0 ? (receita - custo) / receita * 100 : null }
  }, [filtered])

  // ── Aba Clientes: filtro/ordenação/total ──
  const clientesFiltered = useMemo(() => clientesRows.filter(r => {
    if (soMinutor && !r.no_minutor) return false
    if (soForaMinutor && r.no_minutor) return false
    if (fCliente && r.cliente !== fCliente) return false
    if (fExecutivo && (r.executivo ?? '') !== fExecutivo) return false
    if (fConsultorCli && !(r.consultores ?? []).some(c => String(c.user_id) === fConsultorCli)) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      const digits = busca.replace(/\D/g, '')
      const matchNome = r.cliente.toLowerCase().includes(q)
      const matchCnpj = digits.length > 0 && r.cnpj.includes(digits)
      if (!matchNome && !matchCnpj) return false
    }
    return true
  }), [clientesRows, soMinutor, soForaMinutor, fCliente, fExecutivo, fConsultorCli, busca])
  const executivos = useMemo(() => [...new Set(clientesRows.map(r => r.executivo).filter(Boolean) as string[])].sort(), [clientesRows])
  const clientesOpts = useMemo(() => [...new Set(clientesRows.map(r => r.cliente).filter(Boolean))].sort().map(c => ({ id: c, name: c })), [clientesRows])
  const consultoresCli = useMemo(() => {
    const m = new Map<number, string>()
    clientesRows.forEach(r => (r.consultores ?? []).forEach(c => m.set(c.user_id, c.consultor)))
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [clientesRows])
  // ERPSERV (empresa interna) vem SEPARADA da lista de clientes; só entra nos totais
  // quando "Considerar ERPSERV" está ligado.
  const isErpserv = (r: ClienteRow) => (r.cliente || '').toUpperCase().includes('ERPSERV')
  // ERPSERV é fixada no TOPO, em evidência — vem da lista CRUA (clientesRows), sem sofrer
  // os filtros (inclusive "Só com movimento", que ignora custo); sempre aparece se existir.
  const erpservRow = useMemo(() => clientesRows.find(isErpserv) ?? null, [clientesRows])
  const clientesSemErp = useMemo(() => clientesFiltered.filter(r => !isErpserv(r)), [clientesFiltered])
  const { sorted: clientesSorted, thProps: cliThProps } = useTableSort(clientesSemErp)
  const clientesTot = useMemo(() => {
    const base = considerarErpserv && erpservRow ? [...clientesSemErp, erpservRow] : clientesSemErp
    const receita = base.reduce((s, r) => s + r.receita, 0)
    const custo = base.reduce((s, r) => s + r.custo, 0)
    const despesa = base.reduce((s, r) => s + (r.despesas?.custo ?? 0), 0)
    const investimentoMo = base.reduce((s, r) => s + (r.investimento_mo ?? 0), 0)
    const investimentoDesp = base.reduce((s, r) => s + (r.investimento_desp ?? 0), 0)
    const investimento = investimentoMo + investimentoDesp
    const recebido = base.reduce((s, r) => s + r.recebido, 0)
    const custo40 = base.reduce((s, r) => s + r.custo40, 0)
    const custoTotal = custo + custo40
    const resultado = recebido - custoTotal
    // Margem operacional = resultado SEM os 40% (só custo operação).
    const margemOpPct = recebido > 0 ? (recebido - custo) / recebido * 100 : null
    // Margem +40% total = +40% mantido (somado) ÷ +40% cheio (40% do recebido total).
    const custo40Full = recebido * 0.40
    const custo40Pct = custo40Full > 0 ? custo40 / custo40Full * 100 : null
    return { receita, custo, despesa, investimento, investimentoMo, investimentoDesp, recebido, custo40, custoTotal, resultado, pct: recebido > 0 ? resultado / recebido * 100 : null, margemOpPct, custo40Pct }
  }, [clientesSemErp, erpservRow, considerarErpserv])
  // Para exportar: clientes (sem ERPSERV) + a linha da ERPSERV no fim, espelhando a tela.
  const clientesExport = erpservRow ? [erpservRow, ...clientesSorted] : clientesSorted

  const limpar = () => { setFCliente(''); setFProjeto(''); setFConsultor(''); setBusca(''); setSoReceita(true); setSoMinutor(false); setSoForaMinutor(false); setFExecutivo(''); setFConsultorCli('') }
  const hasFiltros = !!(fCliente || fProjeto || fConsultor || busca.trim() || !soReceita || soMinutor || soForaMinutor || fExecutivo || fConsultorCli)

  const fmtYm = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) }
  const fmtMes = () => !monthsToFetch.length
    ? `Ano ${year}`
    : visao === 'clientes'
      ? `Ano ${year} (${fmtYm(monthsToFetch[0])} – ${fmtYm(monthsToFetch[monthsToFetch.length - 1])})`
      : `${fmtYm(monthsToFetch[0])} – ${fmtYm(monthsToFetch[monthsToFetch.length - 1])}`
  const periodoLabel = visao === 'clientes' || !monthsToFetch.length
    ? `${year}`
    : `${monthsToFetch[0]}_a_${monthsToFetch[monthsToFetch.length - 1]}`

  // Excel/PDF "Por projeto" = consolidado (sorted); "Consultor × Projeto" = detalhe
  // por consultor (filtered, ordenado por projeto e consultor).
  const detalheConsultor = () => [...filtered].sort((a, b) =>
    a.projeto.localeCompare(b.projeto, 'pt-BR') || a.consultor.localeCompare(b.consultor, 'pt-BR'))

  const exportExcel = () => {
    if (visao === 'clientes') {
      const data = clientesExport.map(r => ({
        Cliente: r.cliente, 'No Minutor': r.no_minutor ? 'Sim' : 'Não',
        'Valor Recebido': r.recebido, 'Custo Operação': r.custo, '+40% Custo': r.custo40,
        'Custo Total': r.custo_total, 'Lucro/Prejuízo': r.resultado,
        'Margem Operacional %': r.margem_real_pct, 'Margem +40% %': r.custo40_pct, 'Margem Total %': r.resultado_pct,
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
      XLSX.writeFile(wb, `rentabilidade_clientes_${periodoLabel}.xlsx`)
      return
    }
    const src = visao === 'projeto' ? sorted : detalheConsultor()
    const data = src.map(r => visao === 'projeto'
      ? { Projeto: r.projeto, Cliente: r.cliente, Consultores: (r as DisplayRow).n_consultores, Horas: r.horas, 'R$/h Projeto': r.valor_hora_projeto, 'Custo/h médio': r.valor_hora_consultor, Receita: r.receita, Custo: r.custo, Margem: r.margem, 'Margem %': r.margem_pct }
      : { Consultor: r.consultor, Projeto: r.projeto, Cliente: r.cliente, Horas: r.horas, 'R$/h Projeto': r.valor_hora_projeto, 'R$/h Consultor': r.valor_hora_consultor, Receita: r.receita, Custo: r.custo, Margem: r.margem, 'Margem %': r.margem_pct })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidade')
    XLSX.writeFile(wb, `rentabilidade_${visao}_${periodoLabel}.xlsx`)
  }

  const exportPdf = () => {
    if (visao === 'clientes') {
      const linhas = clientesExport.map(r => `
        <tr><td>${r.cliente}${r.no_minutor ? '' : ' <span style="color:#9ca3af">(fora do Minutor)</span>'}</td>
        <td class="r">${formatBRL(r.recebido)}</td>
        <td class="r">${formatBRL(r.custo)}${r.margem_real_pct == null ? '' : `<br><span style="color:${mgOpColor(r.margem_real_pct)}">Mg op. ${r.margem_real_pct}%</span>`}</td>
        <td class="r">${formatBRL(r.custo40)}${r.custo40_pct == null ? '' : `<br><span style="color:${pct40Color(r.custo40_pct)}">(${r.custo40_pct}%)</span>`}</td><td class="r">${formatBRL(r.custo_total)}</td>
        <td class="r">${formatBRL(r.resultado)}</td>
        <td class="r">${r.resultado_pct == null ? '—' : r.resultado_pct + '%'}</td></tr>`).join('')
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rentabilidade Clientes — ${fmtMes()}</title>
        <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:11px;padding:20px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:14px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:5px 6px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>
        <h1>Rentabilidade por Cliente</h1>
        <div class="sub">${fmtMes()} · recebimento do mês seguinte (M+1) · ${clientesExport.length} cliente(s)</div>
        <table><thead><tr><th>Cliente</th><th class="r">Valor Recebido</th><th class="r">Custo Operação</th><th class="r">+40% Custo</th><th class="r">Custo Total</th><th class="r">Lucro/Prejuízo</th><th class="r">Margem Total</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td class="r">Total</td><td class="r">${formatBRL(clientesTot.recebido)}</td><td class="r">${formatBRL(clientesTot.custo)}${clientesTot.margemOpPct == null ? '' : `<br><span style="color:${mgOpColor(clientesTot.margemOpPct)}">Mg op. ${clientesTot.margemOpPct.toFixed(1)}%</span>`}</td><td class="r">${formatBRL(clientesTot.custo40)}${clientesTot.custo40Pct == null ? '' : `<br><span style="color:${pct40Color(clientesTot.custo40Pct)}">(${clientesTot.custo40Pct.toFixed(1)}%)</span>`}</td><td class="r">${formatBRL(clientesTot.custoTotal)}</td><td class="r">${formatBRL(clientesTot.resultado)}</td><td class="r">${clientesTot.pct == null ? '—' : clientesTot.pct.toFixed(1) + '%'}</td></tr></tfoot></table>
        <script>window.onload=function(){window.print();}</script></body></html>`
      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close() }
      return
    }
    const src = visao === 'projeto' ? sorted : detalheConsultor()
    const linhas = src.map(r => `
      <tr>
        ${visao === 'consultor' ? `<td>${r.consultor}</td>` : ''}<td>${r.projeto}</td><td>${r.cliente}</td>
        ${visao === 'projeto' ? `<td class="r">${(r as DisplayRow).n_consultores}</td>` : ''}
        <td class="r">${fmtH(r.horas)}</td><td class="r">${formatBRL(r.valor_hora_projeto)}</td><td class="r">${formatBRL(r.valor_hora_consultor)}</td>
        <td class="r">${formatBRL(r.receita)}</td><td class="r">${formatBRL(r.custo)}</td><td class="r">${formatBRL(r.margem)}</td>
        <td class="r">${r.margem_pct == null ? '—' : r.margem_pct + '%'}</td>
      </tr>`).join('')
    const thead = visao === 'projeto'
      ? '<th>Projeto</th><th>Cliente</th><th class="r">Cons.</th><th class="r">Horas</th><th class="r">R$/h Proj</th><th class="r">Custo/h</th><th class="r">Receita</th><th class="r">Custo</th><th class="r">Margem</th><th class="r">%</th>'
      : '<th>Consultor</th><th>Projeto</th><th>Cliente</th><th class="r">Horas</th><th class="r">R$/h Proj</th><th class="r">R$/h Cons</th><th class="r">Receita</th><th class="r">Custo</th><th class="r">Margem</th><th class="r">%</th>'
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rentabilidade — ${fmtMes()}</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:11px;padding:20px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:14px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:5px 6px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
      <h1>Relatório de Rentabilidade</h1>
      <div class="sub">${fmtMes()} · ${visao === 'projeto' ? 'por projeto' : 'consultor × projeto'} · ${sorted.length} linha(s)</div>
      <table><thead><tr>${thead}</tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="6" class="r">Total</td><td class="r">${formatBRL(tot.receita)}</td><td class="r">${formatBRL(tot.custo)}</td><td class="r">${formatBRL(tot.margem)}</td><td class="r">${tot.pct == null ? '—' : tot.pct.toFixed(1) + '%'}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print();}</script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  const content = (
    <>
      <div className="max-w-[1400px] mx-auto">
        <PageHeader
          icon={TrendingUp}
          title="Rentabilidade"
          subtitle={visao === 'clientes' ? 'Custo Minutor × recebimento Keruak por cliente (CNPJ) — recebido do mês seguinte (M+1)' : visao === 'projeto' ? 'Receita, custo e margem por projeto' : 'Receita, custo e margem por consultor × projeto'}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {visao === 'clientes' ? (<>
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Ano</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                  {Array.from({ length: currentYear - 2026 + 1 }, (_, i) => 2026 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-light)' }}>
                  {monthsToFetch.length ? `até ${fmtYm(monthsToFetch[monthsToFetch.length - 1])} · não inclui o mês atual` : 'sem mês fechado neste ano ainda'}
                </span>
              </>) : embedded ? null : (<>
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Período</label>
                <MonthYearPicker month={fromM} year={fromY} placeholder="De" onChange={(m, y) => { if (m && y) { setFromM(m); setFromY(y) } }} />
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>até</span>
                <MonthYearPicker month={toM} year={toY} placeholder="Até" onChange={(m, y) => { if (m && y) { setToM(m); setToY(y) } }} />
              </>)}
              {visao === 'clientes' && (
                <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing}
                  onClick={() => loadClientes(true).then(() => toast.success('Recebimentos do Keruak atualizados'))}>
                  {refreshing ? 'Atualizando…' : 'Atualizar Keruak'}
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Download} onClick={exportExcel} disabled={(visao === 'clientes' ? clientesFiltered : filtered).length === 0}>Excel</Button>
              <Button variant="ghost" size="sm" icon={FileText} onClick={exportPdf} disabled={(visao === 'clientes' ? clientesFiltered : filtered).length === 0}>PDF</Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-end gap-3 mb-4">
          {visao !== 'clientes' && (<>
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Cliente</p>
              <SearchSelect value={fCliente} onChange={setFCliente} options={[{ id: '', name: 'Todos os clientes' }, ...optClientes]} placeholder="Todos os clientes" />
            </div>
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Projeto</p>
              <SearchSelect value={fProjeto} onChange={setFProjeto} options={[{ id: '', name: 'Todos os projetos' }, ...optProjetos]} placeholder="Todos os projetos" />
            </div>
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Consultor</p>
              <SearchSelect value={fConsultor} onChange={setFConsultor} options={[{ id: '', name: 'Todos os consultores' }, ...optConsultores]} placeholder="Todos os consultores" />
            </div>
          </>)}
          {visao !== 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={soReceita} onChange={e => setSoReceita(e.target.checked)} />
              Só com receita
            </label>
          )}
          {visao !== 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }} title="ERPSERV é a empresa interna; desmarque para tirar os apontamentos dela dos dados e totais">
              <input type="checkbox" checked={incluirErpserv} onChange={e => setIncluirErpserv(e.target.checked)} />
              Incluir ERPSERV
            </label>
          )}
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={soMinutor} onChange={e => { setSoMinutor(e.target.checked); if (e.target.checked) setSoForaMinutor(false) }} />
              Só clientes do Minutor
            </label>
          )}
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={soForaMinutor} onChange={e => { setSoForaMinutor(e.target.checked); if (e.target.checked) setSoMinutor(false) }} />
              Fora do Minutor
            </label>
          )}
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={considerarErpserv} onChange={e => setConsiderarErpserv(e.target.checked)} />
              Considerar ERPSERV
            </label>
          )}
          {visao === 'clientes' && (
            <div className="w-52 pb-2">
              <SearchSelect value={fCliente} onChange={setFCliente} options={clientesOpts} placeholder="Cliente (todos)" />
            </div>
          )}
          {visao === 'clientes' && (
            <div className="w-48 pb-2">
              <SearchSelect value={fExecutivo} onChange={setFExecutivo} options={executivos.map(e => ({ id: e, name: e }))} placeholder="Executivo (todos)" />
            </div>
          )}
          {visao === 'clientes' && (
            <div className="w-52 pb-2">
              <SearchSelect value={fConsultorCli} onChange={setFConsultorCli} options={consultoresCli} placeholder="Consultor (todos)" />
            </div>
          )}
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <Button variant="ghost" size="sm" icon={X} onClick={limpar} disabled={!hasFiltros}>Limpar</Button>
        </div>

        {/* Cards de total */}
        <div className={`grid gap-3 mb-4 ${visao === 'clientes' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          {(visao === 'clientes' ? [
            // Valor Recebido (Keruak M+1) e Custo Total (Operação + Despesa + 40% do recebido).
            { label: 'Valor Recebido', value: formatBRL(clientesTot.recebido), color: 'var(--brand-primary)' },
            { label: 'Custo', lines: [
              { k: 'Operação', v: formatBRL(clientesTot.custo - clientesTot.despesa - clientesTot.investimentoMo) },
              { k: 'Despesa', v: formatBRL(clientesTot.despesa - clientesTot.investimentoDesp) },
              { k: '+40%', v: formatBRL(clientesTot.custo40) },
              { k: 'Investimento', v: formatBRL(clientesTot.investimento), invest: true },
              { k: 'Total', v: formatBRL(clientesTot.custoTotal), strong: true },
            ] },
          ] : [
            { label: 'Receita', value: formatBRL(tot.receita), color: 'var(--text)' },
            { label: 'Custo', value: formatBRL(tot.custo), color: 'var(--text)' },
            { label: 'Margem', value: formatBRL(tot.margem), color: 'var(--brand-primary)' },
            { label: 'Margem %', value: tot.pct == null ? '—' : tot.pct.toFixed(1) + '%', color: pctColor(tot.pct) },
          ]).map(c => (
            <div key={c.label} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{c.label}</p>
              {'lines' in c && c.lines ? (
                <div className="mt-1 space-y-0.5">
                  {c.lines.map(l => (
                    <div key={l.k} className="flex items-baseline justify-between gap-2" style={'strong' in l && l.strong ? { borderTop: '1px solid var(--border)', paddingTop: 2, marginTop: 2 } : undefined}>
                      <span className="text-[10px]" style={{ color: 'invest' in l && l.invest ? '#cc0000' : 'var(--text-light)' }}>{l.k}</span>
                      <span className={`tabular-nums ${'strong' in l && l.strong ? 'text-sm font-bold' : 'text-xs font-semibold'}`} style={{ color: 'invest' in l && l.invest ? '#cc0000' : 'var(--text)' }}>{l.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-lg font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Gráfico de apontamento (consultor/projeto) + seção Recebe Fixo */}
        {visao !== 'clientes' && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={15} style={{ color: 'var(--brand-primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {fConsultor ? 'Apontamento por período (mês)' : 'Apontamento por consultor'}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>horas{!fConsultor && chartData.length === 15 ? ' · top 15' : ''}</span>
            </div>
            {chartData.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-light)' }}>Sem apontamentos no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 26 + 24)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-light)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={160} interval={0} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-hover)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)' }}
                    labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }}
                    formatter={((v: number) => [`${v}h`, 'Horas']) as never} />
                  <Bar dataKey="horas" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill="var(--brand-primary)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {visao !== 'clientes' && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={15} style={{ color: 'var(--brand-primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Horas apontadas por dia</span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{diaChart.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h {diaChart.limitado ? '· últimos 60 dias' : 'no período'}</span>
            </div>
            {diaChart.data.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-light)' }}>Sem apontamentos no período.</p>
            ) : (<>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={diaChart.data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-light)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip cursor={{ fill: 'var(--surface-hover)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)' }}
                    labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }}
                    formatter={((v: number, _n: string, p: { payload?: { naoUtil?: boolean } }) => [`${v}h${p?.payload?.naoUtil ? ' · fim de semana/feriado' : ''}`, 'Horas']) as never} />
                  <Bar dataKey="horas" radius={[4, 4, 0, 0]} cursor="pointer"
                    onClick={((e: { dia?: string; payload?: { dia?: string } }) => { const d = e?.dia ?? e?.payload?.dia; if (d) setDiaModal(d) }) as never}>
                    {/* fim de semana/feriado em âmbar; dia útil na cor da marca */}
                    {diaChart.data.map((d, i) => <Cell key={i} fill={d.naoUtil ? 'var(--warning)' : 'var(--brand-primary)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 px-1">
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-light)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--brand-primary)' }} /> Dia útil
                </span>
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-light)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--warning)' }} /> Fim de semana / feriado
                </span>
              </div>
            </>)}
          </div>
        )}

        {visao !== 'clientes' && fixosData.length > 0 && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={15} style={{ color: 'var(--brand-primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Recebe Fixo — Custo × Receita × Resultado</span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fixosData[0].nMeses} mês(es) · custo = salário × meses</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-light)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Salário/mês</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Custo Fixo</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Receita (apontado)</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {fixosData.map(f => (
                    <tr key={f.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>{f.consultor}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(f.salary)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(f.custoFixo)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-light)' }} className="tabular-nums">{f.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(f.receita)}</td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: f.resultado < 0 ? 'var(--danger)' : 'var(--success-border)' }} className="tabular-nums">{formatBRL(f.resultado)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text)' }}>Total</td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(fixosTot.custoFixo)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(fixosTot.receita)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: fixosTot.resultado < 0 ? 'var(--danger)' : 'var(--success-border)' }} className="tabular-nums">{formatBRL(fixosTot.resultado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {visao === 'clientes' ? (
          clientesLoading && clientesRows.length === 0 ? (
            <SkeletonTable rows={8} cols={9} />
          ) : clientesSemErp.length === 0 && !erpservRow ? (
            <EmptyState icon={TrendingUp} title="Sem dados" description="Nenhum cliente/recebimento para o mês/filtros." />
          ) : (
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)', maxHeight: '70vh' }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th onClick={cliThProps('cliente').onClick} style={{ background: 'var(--surface)', color: 'var(--text-light)', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 }}>Cliente</th>
                    <th onClick={cliThProps('executivo').onClick} style={{ background: 'var(--surface)', color: 'var(--text-light)', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 }}>Executivo</th>
                    <th onClick={cliThProps('recebido').onClick} style={thCol(COL_HEAD.recebido)}>Valor Recebido</th>
                    <th onClick={cliThProps('custo').onClick} style={thCol(COL_HEAD.custo)}>Custo Operação</th>
                    <th onClick={cliThProps('custo40').onClick} style={thCol(COL_HEAD.custo40)}>+40% Custo</th>
                    <th onClick={cliThProps('custo_total').onClick} style={thCol(COL_HEAD.total)}>Custo Total</th>
                    <th onClick={cliThProps('resultado').onClick} style={thCol(COL_HEAD.resultado)}>Lucro/Prejuízo</th>
                    <th onClick={cliThProps('resultado_pct').onClick} style={thCol(COL_HEAD.margem)}>Margem Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ERPSERV — empresa interna, EM EVIDÊNCIA no topo; expande por consultores; entra nos totais só com "Considerar ERPSERV" */}
                  {erpservRow && (() => {
                    const erpOpen = expandedCli.has('erpserv')
                    const erpTemCons = (erpservRow.consultores?.length ?? 0) > 0
                    const bb = '2px solid var(--primary)'
                    return (
                    <Fragment key="erpserv">
                    <tr style={{ background: 'var(--primary-soft)', opacity: considerarErpserv ? 1 : 0.7, cursor: erpTemCons ? 'pointer' : 'default' }}
                      onClick={() => { if (erpTemCons) setExpandedCli(prev => { const n = new Set(prev); n.has('erpserv') ? n.delete('erpserv') : n.add('erpserv'); return n }) }}>
                      <td style={{ padding: '8px 10px', color: 'var(--text)', fontWeight: 800, borderBottom: bb }}>
                        {erpTemCons && (erpOpen ? <ChevronDown size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                        ★ {erpservRow.cliente}
                        <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>— interno {considerarErpserv ? '(considerado nos totais)' : '(fora dos totais)'}</span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)', borderBottom: bb, textAlign: 'center' }}>{erpservRow.executivo || '—'}</td>
                      <td style={{ ...tdCol(COL_CELL.recebido), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.recebido)}</td>
                      <td style={{ ...tdCol(COL_CELL.custo), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.custo)}{erpservRow.margem_real_pct != null && <div style={{ fontSize: 10, fontWeight: 600, color: mgOpColor(erpservRow.margem_real_pct) }}>Mg op. {erpservRow.margem_real_pct}%</div>}</td>
                      <td style={{ ...tdCol(COL_CELL.custo40), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.custo40)}{erpservRow.custo40_pct != null && <div style={{ color: pct40Color(erpservRow.custo40_pct), fontWeight: 700, fontSize: 10 }}>({erpservRow.custo40_pct}%)</div>}</td>
                      <td style={{ ...tdCol(COL_CELL.total), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.custo_total)}</td>
                      <td style={{ ...tdCol(COL_CELL.resultado, erpservRow.resultado < 0 ? '#cc0000' : '#111827'), fontWeight: 700, borderBottom: bb }}>{formatBRL(erpservRow.resultado)}</td>
                      <td style={{ ...tdCol(margemBg(erpservRow.resultado_pct), '#fff'), borderBottom: bb }}><strong>{erpservRow.resultado_pct == null ? '—' : erpservRow.resultado_pct + '%'}</strong></td>
                    </tr>
                    {erpOpen && erpTemCons && (
                      <tr>
                        <td colSpan={8} style={{ padding: '0 0 8px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-light)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>% Particip.</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Custo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...erpservRow.consultores].sort((a, b) => b.horas - a.horas).map(c => {
                                const pct = erpservRow.horas > 0 ? c.horas / erpservRow.horas : 0
                                const consKey = `erpserv:${c.user_id}`
                                const consOpen = expandedCons.has(consKey)
                                const temProj = (c.projetos?.length ?? 0) > 0
                                return (
                                  <Fragment key={c.user_id}>
                                  <tr style={{ borderTop: '1px solid var(--border)', background: c.tem_investimento ? 'rgba(31,111,191,0.13)' : undefined, cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(consKey) ? n.delete(consKey) : n.add(consKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>
                                      {temProj && (consOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      {c.consultor} <span style={{ color: 'var(--text-light)', fontSize: 11 }}>({formatBRL(c.valor_hora)}/h)</span>
                                      {c.tem_investimento && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#1f6fbf', border: '1px solid #1f6fbf', borderRadius: 4, padding: '0 4px' }}>INVEST.</span>}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{fmtH(c.horas)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{(pct * 100).toFixed(1)}%</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(c.custo)}</td>
                                  </tr>
                                  {consOpen && temProj && [...(c.projetos ?? [])].sort((a, b) => b.horas - a.horas).map(p => (
                                    <tr key={p.project_id} style={{ background: 'var(--surface)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: '#1f6fbf', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: '#1f6fbf', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{fmtH(p.horas)}</td>
                                      <td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                    </tr>
                                  ))}
                                  </Fragment>
                                )
                              })}
                              {(erpservRow.despesas?.custo ?? 0) > 0 && (() => {
                                const dKey = 'erpserv:despesas'
                                const dOpen = expandedCons.has(dKey)
                                const dProj = erpservRow.despesas?.projetos ?? []
                                const temProj = dProj.length > 0
                                return (
                                  <Fragment key="despesas">
                                  <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.10)', cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(dKey) ? n.delete(dKey) : n.add(dKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)', fontWeight: 600 }}>
                                      {temProj && (dOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      🧾 Despesas
                                    </td>
                                    <td></td><td></td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(erpservRow.despesas?.custo ?? 0)}</td>
                                  </tr>
                                  {dOpen && temProj && [...dProj].sort((a, b) => b.custo - a.custo).map(p => (
                                    <Fragment key={p.project_id}>
                                    <tr style={{ background: 'var(--surface)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: '#1f6fbf', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: '#1f6fbf', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td></td><td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                    </tr>
                                    {[...(p.usuarios ?? [])].sort((a, b) => b.custo - a.custo).map(u => (
                                      <tr key={`${p.project_id}-u${u.user_id}`} style={{ background: 'var(--surface)' }}>
                                        <td style={{ textAlign: 'left', padding: '2px 8px 2px 52px', color: 'var(--text-light)', fontSize: 11 }}>👤 {u.usuario}</td>
                                        <td></td><td></td>
                                        <td style={{ textAlign: 'right', padding: '2px 8px', color: 'var(--text-light)', fontSize: 11 }} className="tabular-nums">{formatBRL(u.custo)}</td>
                                      </tr>
                                    ))}
                                    </Fragment>
                                  ))}
                                  </Fragment>
                                )
                              })()}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  })()}
                  {clientesSorted.map(r => {
                    const ck = r.cnpj || `c${r.customer_id}` || r.cliente
                    const open = expandedCli.has(ck)
                    const temConsultores = (r.consultores?.length ?? 0) > 0
                    // Cliente cadastrado pode expandir p/ editar os ajustes iniciais do ano (mesmo sem consultores).
                    const canExpand = temConsultores || r.customer_id != null
                    return (
                    <Fragment key={ck}>
                    <tr style={{ cursor: canExpand ? 'pointer' : 'default' }}
                      onClick={() => { if (canExpand) setExpandedCli(prev => { const n = new Set(prev); n.has(ck) ? n.delete(ck) : n.add(ck); return n }) }}>
                      <td style={{ padding: '6px 10px', color: 'var(--text)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
                        {canExpand && (open ? <ChevronDown size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                        <span className="truncate max-w-[220px] inline-block align-bottom">{r.cliente}</span>
                        {!r.no_minutor && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>(fora do Minutor)</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>{r.executivo || '—'}</td>
                      <td
                        style={{ ...tdCol(COL_CELL.recebido), cursor: r.recebido > 0 ? 'pointer' : undefined, textDecoration: r.recebido > 0 ? 'underline dotted' : undefined }}
                        title={r.recebido > 0 ? 'Ver títulos do Keruak' : undefined}
                        onClick={r.recebido > 0 ? (e) => { e.stopPropagation(); setKeruakModal({ cliente: r.cliente, cnpjs: (r.cnpjs?.length ? r.cnpjs : [r.cnpj]).filter(Boolean), valorInicial: r.receita_inicial ?? 0 }) } : undefined}
                      >{formatBRL(r.recebido)}</td>
                      <td style={tdCol(COL_CELL.custo)}>{formatBRL(r.custo)}{r.margem_real_pct != null && <div style={{ fontSize: 10, fontWeight: 600, color: mgOpColor(r.margem_real_pct) }}>Mg op. {r.margem_real_pct}%</div>}</td>
                      <td style={tdCol(COL_CELL.custo40)}>{formatBRL(r.custo40)}{r.custo40_pct != null && <div style={{ color: pct40Color(r.custo40_pct), fontSize: 10, fontWeight: 700 }}>({r.custo40_pct}%)</div>}</td>
                      <td style={tdCol(COL_CELL.total)}>{formatBRL(r.custo_total)}</td>
                      <td style={tdCol(COL_CELL.resultado, r.resultado < 0 ? '#cc0000' : '#111827')}>{formatBRL(r.resultado)}</td>
                      <td style={tdCol(margemBg(r.resultado_pct), '#fff')}><strong>{r.resultado_pct == null ? '—' : r.resultado_pct + '%'}</strong></td>
                    </tr>
                    {open && canExpand && (
                      <tr>
                        <td colSpan={8} style={{ padding: '0 0 8px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          {r.customer_id != null && (
                            <InitialsEditor
                              key={`init-${r.customer_id}`}
                              custoInicial={r.custo_inicial ?? 0}
                              receitaInicial={r.receita_inicial ?? 0}
                              onSave={(c, rec) => saveInitial(r.customer_id as number, c, rec)}
                            />
                          )}
                          {temConsultores && (
                          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-light)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>% Particip.</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Receita (rateio)</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Custo</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Margem</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>% Margem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...r.consultores].sort((a, b) => b.horas - a.horas).map(c => {
                                const pct = r.horas > 0 ? c.horas / r.horas : 0
                                const receitaC = Math.round(r.recebido * pct * 100) / 100
                                const margemC = Math.round((receitaC - c.custo) * 100) / 100
                                const margemPctC = receitaC > 0 ? Math.round(margemC / receitaC * 1000) / 10 : null
                                const consKey = `${ck}:${c.user_id}`
                                const consOpen = expandedCons.has(consKey)
                                const temProj = (c.projetos?.length ?? 0) > 0
                                return (
                                  <Fragment key={c.user_id}>
                                  <tr style={{ borderTop: '1px solid var(--border)', background: c.tem_investimento ? 'rgba(31,111,191,0.13)' : undefined, cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(consKey) ? n.delete(consKey) : n.add(consKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>
                                      {temProj && (consOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      {c.consultor} <span style={{ color: 'var(--text-light)', fontSize: 11 }}>({formatBRL(c.valor_hora)}/h)</span>
                                      {c.tem_investimento && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#1f6fbf', border: '1px solid #1f6fbf', borderRadius: 4, padding: '0 4px' }}>INVEST.</span>}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{fmtH(c.horas)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{(pct * 100).toFixed(1)}%</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(receitaC)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(c.custo)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: margemC < 0 ? 'var(--danger)' : 'var(--text)' }} className="tabular-nums">{formatBRL(margemC)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: pctColor(margemPctC) }} className="tabular-nums">{margemPctC == null ? '—' : margemPctC + '%'}</td>
                                  </tr>
                                  {consOpen && temProj && [...(c.projetos ?? [])].sort((a, b) => b.horas - a.horas).map(p => (
                                    <tr key={p.project_id} style={{ background: 'var(--bg)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: '#1f6fbf', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: '#1f6fbf', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{fmtH(p.horas)}</td>
                                      <td></td><td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                      <td></td><td></td>
                                    </tr>
                                  ))}
                                  </Fragment>
                                )
                              })}
                              {(r.despesas?.custo ?? 0) > 0 && (() => {
                                const dKey = `${ck}:despesas`
                                const dOpen = expandedCons.has(dKey)
                                const dProj = r.despesas?.projetos ?? []
                                const temProj = dProj.length > 0
                                return (
                                  <Fragment key="despesas">
                                  <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.10)', cursor: temProj ? 'pointer' : 'default' }}
                                    onClick={() => { if (temProj) setExpandedCons(prev => { const n = new Set(prev); n.has(dKey) ? n.delete(dKey) : n.add(dKey); return n }) }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)', fontWeight: 600 }}>
                                      {temProj && (dOpen ? <ChevronDown size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={11} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                                      🧾 Despesas
                                    </td>
                                    <td></td><td></td><td></td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(r.despesas?.custo ?? 0)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--danger)' }} className="tabular-nums">{formatBRL(-(r.despesas?.custo ?? 0))}</td>
                                    <td></td>
                                  </tr>
                                  {dOpen && temProj && [...dProj].sort((a, b) => b.custo - a.custo).map(p => (
                                    <Fragment key={p.project_id}>
                                    <tr style={{ background: 'var(--bg)' }}>
                                      <td style={{ textAlign: 'left', padding: '3px 8px 3px 32px', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {p.is_investimento && <span style={{ color: '#1f6fbf', marginRight: 4 }}>●</span>}
                                        {p.projeto}{p.is_investimento && <span style={{ color: '#1f6fbf', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                                      </td>
                                      <td></td><td></td><td></td>
                                      <td style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-muted)', fontSize: 11 }} className="tabular-nums">{formatBRL(p.custo)}</td>
                                      <td></td><td></td>
                                    </tr>
                                    {[...(p.usuarios ?? [])].sort((a, b) => b.custo - a.custo).map(u => (
                                      <tr key={`${p.project_id}-u${u.user_id}`} style={{ background: 'var(--bg)' }}>
                                        <td style={{ textAlign: 'left', padding: '2px 8px 2px 52px', color: 'var(--text-light)', fontSize: 11 }}>👤 {u.usuario}</td>
                                        <td></td><td></td><td></td>
                                        <td style={{ textAlign: 'right', padding: '2px 8px', color: 'var(--text-light)', fontSize: 11 }} className="tabular-nums">{formatBRL(u.custo)}</td>
                                        <td></td><td></td>
                                      </tr>
                                    ))}
                                    </Fragment>
                                  ))}
                                  </Fragment>
                                )
                              })()}
                            </tbody>
                          </table>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  })}
                  {/* Total */}
                  <tr>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', borderTop: '2px solid var(--border)' }}>Total</td>
                    <td style={{ borderTop: '2px solid var(--border)' }}></td>
                    <td style={{ ...tdCol(COL_HEAD.recebido, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.recebido)}</td>
                    <td style={{ ...tdCol(COL_HEAD.custo, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custo)}{clientesTot.margemOpPct != null && <div style={{ color: mgOpColor(clientesTot.margemOpPct), fontWeight: 700, fontSize: 10 }}>Mg op. {clientesTot.margemOpPct.toFixed(1)}%</div>}</td>
                    <td style={{ ...tdCol(COL_HEAD.custo40, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custo40)}{clientesTot.custo40Pct != null && <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 10 }}>({clientesTot.custo40Pct.toFixed(1)}%)</div>}</td>
                    <td style={{ ...tdCol(COL_HEAD.total, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custoTotal)}</td>
                    <td style={{ ...tdCol(COL_HEAD.resultado, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.resultado)}</td>
                    <td style={{ ...tdCol(margemBg(clientesTot.pct), '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{clientesTot.pct == null ? '—' : clientesTot.pct.toFixed(1) + '%'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : loading ? (
          <SkeletonTable rows={8} cols={10} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Sem dados" description="Nenhum apontamento para o mês/filtros." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th {...thProps(visao === 'projeto' ? 'projeto' : 'consultor')}>{visao === 'projeto' ? 'Projeto' : 'Consultor'}</Th>
                <Th {...thProps('cliente')}>Cliente</Th>
                <Th right {...thProps('n_consultores')}>{visao === 'projeto' ? 'Cons.' : 'Proj.'}</Th>
                <Th right {...thProps('horas')}>Horas</Th><Th right {...thProps('valor_hora_projeto')}>R$/h Proj.</Th>
                <Th right {...thProps('valor_hora_consultor')}>{visao === 'projeto' ? 'Custo/h' : 'R$/h Cons.'}</Th>
                <Th right {...thProps('receita')}>Receita</Th><Th right {...thProps('custo')}>Custo</Th><Th right {...thProps('margem')}>Margem</Th><Th right {...thProps('margem_pct')}>%</Th>
              </tr>
            </Thead>
            <Tbody>
              {sorted.map((r) => {
                const pid = parentId(r)
                const isOpen = expanded.has(pid)
                const kids = childrenOf(r)
                const nomePai = visao === 'projeto' ? r.projeto : r.consultor
                return (
                  <Fragment key={r.key}>
                    <Tr onClick={() => toggleRow(pid)}>
                      <Td className="font-medium" style={{ color: 'var(--text)' }}>
                        <span className="inline-flex items-center gap-1.5">
                          {kids.length > 0
                            ? (isOpen ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />)
                            : <span style={{ display: 'inline-block', width: 13 }} />}
                          <span className="truncate max-w-[240px]">{nomePai}</span>
                          {r.is_investimento && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#1f6fbf', border: '1px solid #1f6fbf', borderRadius: 4, padding: '0 4px' }}>INVEST.</span>}
                        </span>
                      </Td>
                      <Td muted className="truncate max-w-[140px]">{visao === 'projeto' ? r.cliente : '—'}</Td>
                      <Td right muted className="tabular-nums">{r.n_consultores}</Td>
                      <Td right className="tabular-nums">{fmtH(r.horas)}</Td>
                      <Td right muted className="tabular-nums">{formatBRL(r.valor_hora_projeto)}</Td>
                      <Td right muted className="tabular-nums">{formatBRL(r.valor_hora_consultor)}</Td>
                      <Td right className="tabular-nums">{formatBRL(r.receita)}</Td>
                      <Td right muted className="tabular-nums">{formatBRL(r.custo)}</Td>
                      <Td right className="font-semibold tabular-nums">{formatBRL(r.margem)}</Td>
                      <Td right className="font-semibold tabular-nums" style={{ color: pctColor(r.margem_pct) }}>{r.margem_pct == null ? '—' : r.margem_pct + '%'}</Td>
                    </Tr>
                    {isOpen && kids.map(c => (
                      <Tr key={`${r.key}:${visao === 'projeto' ? c.user_id : c.project_id}`} baseBackground="var(--surface-hover)">
                        <Td>
                          <span className="inline-flex items-center gap-1.5 pl-6" style={{ color: 'var(--text-muted)' }}>
                            <span className="text-zinc-600">↳</span>
                            <span className="truncate max-w-[220px]">
                              {visao !== 'projeto' && c.is_investimento && <span style={{ color: '#1f6fbf', marginRight: 4 }}>●</span>}
                              {visao === 'projeto' ? c.consultor : c.projeto}
                              {visao !== 'projeto' && c.is_investimento && <span style={{ color: '#1f6fbf', fontSize: 9, marginLeft: 4 }}>(investimento)</span>}
                            </span>
                          </span>
                        </Td>
                        <Td muted className="truncate max-w-[140px]">{visao === 'projeto' ? '—' : c.cliente}</Td>
                        <Td right muted></Td>
                        <Td right muted className="tabular-nums">{fmtH(c.horas)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.valor_hora_projeto)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.valor_hora_consultor)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.receita)}</Td>
                        <Td right muted className="tabular-nums">{formatBRL(c.custo)}</Td>
                        <Td right className="tabular-nums">{formatBRL(c.margem)}</Td>
                        <Td right className="tabular-nums" style={{ color: pctColor(c.margem_pct) }}>{c.margem_pct == null ? '—' : c.margem_pct + '%'}</Td>
                      </Tr>
                    ))}
                  </Fragment>
                )
              })}
            </Tbody>
          </Table>
        )}
      </div>

      {diaModal && diaDetalhe && (
        <div onClick={() => setDiaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'min(580px, 100%)', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Apontamentos de {diaModal.split('-').reverse().join('/')}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{diaDetalhe.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h em {diaDetalhe.itens.length} lançamento(s)</p>
              </div>
              <button onClick={() => setDiaModal(null)} style={{ color: 'var(--text-muted)' }} title="Fechar"><X size={18} /></button>
            </div>
            <div className="p-2">
              {diaDetalhe.itens.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-light)' }}>Sem apontamentos neste dia.</p>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: 'var(--text-light)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Consultor</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Projeto</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Cliente</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Horas</th>
                  </tr></thead>
                  <tbody>
                    {diaDetalhe.itens.map((it, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 8px', color: 'var(--text)' }}>{it.consultor}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{it.projeto}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-light)' }}>{it.cliente}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text)' }} className="tabular-nums">{it.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {keruakModal && (
        <KeruakTitulosModal
          cliente={keruakModal.cliente}
          cnpjs={keruakModal.cnpjs}
          recebMonths={recebMonths}
          valorInicial={keruakModal.valorInicial}
          onClose={() => setKeruakModal(null)}
        />
      )}
    </>
  )
  return embedded ? content : <AppLayout title="Relatório de Rentabilidade">{content}</AppLayout>
}
