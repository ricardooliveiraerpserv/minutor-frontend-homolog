'use client'

import { useEffect, useMemo, useState, useCallback, Fragment } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable, Button } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useTableSort } from '@/hooks/use-table-sort'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { TrendingUp, Download, FileText, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

interface Row {
  user_id: number; consultor: string
  project_id: number; projeto: string; cliente: string
  valor_hora_projeto: number; valor_hora_consultor: number
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
}

// Linha exibida na tabela. Na visão "consultor" é a própria Row; na visão
// "projeto" é o consolidado de todos os consultores daquele projeto (custo/h = médio).
interface DisplayRow extends Row { key: string; n_consultores: number }

// Aba "Clientes": rentabilidade por cliente cruzada com o RECEBIMENTO do Keruak
// (por CNPJ). O recebido é sempre do mês seguinte ao apontamento (trabalha em M,
// recebe em M+1): apontamentos de maio ↔ recebimento de junho.
interface ConsultorRent { user_id: number; consultor: string; valor_hora: number; horas: number; custo: number }
interface ClienteRow {
  customer_id: number | null; cliente: string; cnpj: string; executivo: string | null
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
  recebido: number; margem_real: number; margem_real_pct: number | null; no_minutor: boolean
  consultores: ConsultorRent[]
  // +40% Custo = 40% do Valor Recebido; Custo Total = Custo Operação + 40%; Resultado = Recebido − Custo Total.
  custo40: number; custo_total: number; resultado: number; resultado_pct: number | null
}

const fmtH = (h: number) => `${h.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`
const pctColor = (p: number | null) => p == null ? 'var(--text-light)' : p < 0 ? 'var(--danger)' : p < 20 ? 'var(--warning)' : 'var(--success)'

// Cores das colunas (mesmo conceito do BI): cabeçalho forte + célula tonalizada.
const COL_HEAD = { recebido: '#38761d', custo: '#bf9000', custo40: '#d9683a', total: '#cc0000', resultado: '#1f6fbf', margem: '#bf9000' }
const COL_CELL = { recebido: '#d9ead3', custo: '#fff2cc', custo40: '#fce5cd', total: '#f4cccc', resultado: '#cfe2f3' }
const margemBg = (pct: number | null) => pct == null ? '#e5e7eb' : pct < 0 ? '#e06666' : pct < 5 ? '#f6b26b' : '#93c47d'
const thCol = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.25)', position: 'sticky', top: 0, zIndex: 2 })
const tdCol = (bg: string, color = '#111827'): React.CSSProperties => ({ background: bg, color, padding: '6px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' })

export default function RentabilidadePage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [mode, setMode]   = useState<'mes' | 'periodo'>('mes')
  const [fromM, setFromM] = useState(now.getMonth() + 1)
  const [fromY, setFromY] = useState(now.getFullYear())
  const [toM, setToM]     = useState(now.getMonth() + 1)
  const [toY, setToY]     = useState(now.getFullYear())
  const [rows, setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [soReceita, setSoReceita] = useState(true)
  const [fCliente, setFCliente]     = useState('')
  const [fProjeto, setFProjeto]     = useState('')
  const [fConsultor, setFConsultor] = useState('')
  const [visao] = useState<'consultor' | 'projeto' | 'clientes'>('clientes')
  const [clientesRows, setClientesRows] = useState<ClienteRow[]>([])
  const [clientesLoading, setClientesLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [soMinutor, setSoMinutor] = useState(false)
  const [fExecutivo, setFExecutivo] = useState('')
  const [fConsultorCli, setFConsultorCli] = useState('')
  const [expandedCli, setExpandedCli] = useState<Set<string>>(new Set())

  const monthsToFetch = useMemo(() => {
    if (mode === 'mes') return [`${year}-${String(month).padStart(2, '0')}`]
    const out: string[] = []
    let y = fromY, m = fromM, guard = 0
    while ((y < toY || (y === toY && m <= toM)) && guard++ < 48) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return out.length ? out : [`${fromY}-${String(fromM).padStart(2, '0')}`]
  }, [mode, month, year, fromM, fromY, toM, toY])

  useEffect(() => {
    setLoading(true)
    Promise.all(monthsToFetch.map(ym =>
      api.get<{ data: { rows: Row[] } }>(`/relatorios/rentabilidade/${ym}`)
        .then(r => r?.data?.rows ?? []).catch(() => [] as Row[])
    )).then(results => {
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
      const r2 = (n: number) => Math.round(n * 100) / 100
      const map = new Map<string, ClienteRow>()
      for (const r of all) {
        const k = r.cnpj || (r.customer_id != null ? 'c' + r.customer_id : r.cliente)
        const e = map.get(k)
        if (!e) map.set(k, { ...r, consultores: (r.consultores || []).map(c => ({ ...c })) })
        else {
          e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.recebido += r.recebido
          e.no_minutor = e.no_minutor || r.no_minutor
          if (!e.executivo && r.executivo) e.executivo = r.executivo
          for (const c of (r.consultores || [])) {
            const ex = e.consultores.find(x => x.user_id === c.user_id)
            if (ex) { ex.horas += c.horas; ex.custo += c.custo } else e.consultores.push({ ...c })
          }
        }
      }
      setClientesRows([...map.values()].map(r => {
        const horas = r2(r.horas), receita = r2(r.receita), custo = r2(r.custo), recebido = r2(r.recebido)
        const margem = r2(receita - custo), margem_real = r2(recebido - custo)
        // +40% Custo = 40% do Valor Recebido; Custo Total = Custo Operação + 40%; Resultado = Recebido − Custo Total.
        const custo40 = r2(recebido * 0.40)
        const custo_total = r2(custo + custo40)
        const resultado = r2(recebido - custo_total)
        return {
          ...r, horas, receita, custo, recebido, margem,
          margem_pct: receita > 0 ? Math.round(margem / receita * 1000) / 10 : null,
          margem_real, margem_real_pct: recebido > 0 ? Math.round(margem_real / recebido * 1000) / 10 : null,
          custo40, custo_total, resultado, resultado_pct: recebido > 0 ? Math.round(resultado / recebido * 1000) / 10 : null,
        }
      }))
    }).finally(() => { setClientesLoading(false); setRefreshing(false) })
  }, [monthsToFetch])

  useEffect(() => { if (visao === 'clientes') void loadClientes(false) }, [visao, loadClientes])

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

  const filtered = useMemo(() => rows.filter(r => {
    if (soReceita && r.receita === 0) return false
    if (fCliente && r.cliente !== fCliente) return false
    if (fProjeto && String(r.project_id) !== fProjeto) return false
    if (fConsultor && String(r.user_id) !== fConsultor) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      if (!r.consultor.toLowerCase().includes(q) && !r.projeto.toLowerCase().includes(q) && !r.cliente.toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, busca, soReceita, fCliente, fProjeto, fConsultor])

  // Linhas-pai: consolidado por projeto (soma horas/receita/custo, conta consultores,
  // custo/h = custo total ÷ horas). Cada pai expande nas linhas dos consultores.
  const projectRows = useMemo<DisplayRow[]>(() => {
    const map = new Map<number, { projeto: string; cliente: string; vhp: number; horas: number; receita: number; custo: number; users: Set<number> }>()
    for (const r of filtered) {
      let e = map.get(r.project_id)
      if (!e) { e = { projeto: r.projeto, cliente: r.cliente, vhp: r.valor_hora_projeto, horas: 0, receita: 0, custo: 0, users: new Set() }; map.set(r.project_id, e) }
      e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.users.add(r.user_id)
    }
    return [...map.entries()].map(([project_id, e]) => {
      const horas = Math.round(e.horas * 100) / 100, receita = Math.round(e.receita * 100) / 100, custo = Math.round(e.custo * 100) / 100
      const margem = Math.round((receita - custo) * 100) / 100
      return {
        key: `p${project_id}`, user_id: 0, consultor: '', n_consultores: e.users.size,
        project_id, projeto: e.projeto, cliente: e.cliente,
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
    const map = new Map<number, { consultor: string; vhc: number; horas: number; receita: number; custo: number; projs: Set<number> }>()
    for (const r of filtered) {
      let e = map.get(r.user_id)
      if (!e) { e = { consultor: r.consultor, vhc: r.valor_hora_consultor, horas: 0, receita: 0, custo: 0, projs: new Set() }; map.set(r.user_id, e) }
      e.horas += r.horas; e.receita += r.receita; e.custo += r.custo; e.projs.add(r.project_id)
    }
    return [...map.entries()].map(([user_id, e]) => {
      const horas = Math.round(e.horas * 100) / 100, receita = Math.round(e.receita * 100) / 100, custo = Math.round(e.custo * 100) / 100
      const margem = Math.round((receita - custo) * 100) / 100
      return {
        key: `u${user_id}`, user_id, consultor: e.consultor, n_consultores: e.projs.size,
        project_id: 0, projeto: '', cliente: '',
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
    if (soReceita && r.receita === 0 && r.recebido === 0) return false
    if (soMinutor && !r.no_minutor) return false
    if (fExecutivo && (r.executivo ?? '') !== fExecutivo) return false
    if (fConsultorCli && !(r.consultores ?? []).some(c => String(c.user_id) === fConsultorCli)) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      if (!r.cliente.toLowerCase().includes(q) && !r.cnpj.includes(busca.replace(/\D/g, ''))) return false
    }
    return true
  }), [clientesRows, soReceita, soMinutor, fExecutivo, fConsultorCli, busca])
  const executivos = useMemo(() => [...new Set(clientesRows.map(r => r.executivo).filter(Boolean) as string[])].sort(), [clientesRows])
  const consultoresCli = useMemo(() => {
    const m = new Map<number, string>()
    clientesRows.forEach(r => (r.consultores ?? []).forEach(c => m.set(c.user_id, c.consultor)))
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [clientesRows])
  const { sorted: clientesSorted, thProps: cliThProps } = useTableSort(clientesFiltered)
  const clientesTot = useMemo(() => {
    const receita = clientesFiltered.reduce((s, r) => s + r.receita, 0)
    const custo = clientesFiltered.reduce((s, r) => s + r.custo, 0)
    const recebido = clientesFiltered.reduce((s, r) => s + r.recebido, 0)
    const custo40 = clientesFiltered.reduce((s, r) => s + r.custo40, 0)
    const custoTotal = custo + custo40
    const resultado = recebido - custoTotal
    // Margem operacional = resultado SEM os 40% (só custo operação).
    const margemOpPct = recebido > 0 ? (recebido - custo) / recebido * 100 : null
    return { receita, custo, recebido, custo40, custoTotal, resultado, pct: recebido > 0 ? resultado / recebido * 100 : null, margemOpPct }
  }, [clientesFiltered])

  const limpar = () => { setFCliente(''); setFProjeto(''); setFConsultor(''); setBusca(''); setSoReceita(true); setSoMinutor(false); setFExecutivo(''); setFConsultorCli('') }
  const hasFiltros = !!(fCliente || fProjeto || fConsultor || busca.trim() || !soReceita || soMinutor || fExecutivo || fConsultorCli)

  const fmtYm = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) }
  const fmtMes = () => monthsToFetch.length === 1
    ? new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : `${fmtYm(monthsToFetch[0])} – ${fmtYm(monthsToFetch[monthsToFetch.length - 1])}`
  const periodoLabel = monthsToFetch.length === 1 ? monthsToFetch[0] : `${monthsToFetch[0]}_a_${monthsToFetch[monthsToFetch.length - 1]}`

  // Excel/PDF "Por projeto" = consolidado (sorted); "Consultor × Projeto" = detalhe
  // por consultor (filtered, ordenado por projeto e consultor).
  const detalheConsultor = () => [...filtered].sort((a, b) =>
    a.projeto.localeCompare(b.projeto, 'pt-BR') || a.consultor.localeCompare(b.consultor, 'pt-BR'))

  const exportExcel = () => {
    if (visao === 'clientes') {
      const data = clientesSorted.map(r => ({
        Cliente: r.cliente, 'No Minutor': r.no_minutor ? 'Sim' : 'Não',
        'Valor Recebido': r.recebido, 'Custo Operação': r.custo, '+40% Custo': r.custo40,
        'Custo Total': r.custo_total, Resultado: r.resultado,
        'Margem Operacional %': r.margem_real_pct, 'Margem Total %': r.resultado_pct,
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
      const linhas = clientesSorted.map(r => `
        <tr><td>${r.cliente}${r.no_minutor ? '' : ' <span style="color:#9ca3af">(fora do Minutor)</span>'}</td>
        <td class="r">${formatBRL(r.recebido)}</td><td class="r">${formatBRL(r.custo)}</td>
        <td class="r">${formatBRL(r.custo40)}</td><td class="r">${formatBRL(r.custo_total)}</td>
        <td class="r">${formatBRL(r.resultado)}</td>
        <td class="r">${r.margem_real_pct == null ? '—' : r.margem_real_pct + '%'}</td>
        <td class="r">${r.resultado_pct == null ? '—' : r.resultado_pct + '%'}</td></tr>`).join('')
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rentabilidade Clientes — ${fmtMes()}</title>
        <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:11px;padding:20px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:14px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:5px 6px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>
        <h1>Rentabilidade por Cliente</h1>
        <div class="sub">${fmtMes()} · recebimento do mês seguinte (M+1) · ${clientesSorted.length} cliente(s)</div>
        <table><thead><tr><th>Cliente</th><th class="r">Valor Recebido</th><th class="r">Custo Operação</th><th class="r">+40% Custo</th><th class="r">Custo Total</th><th class="r">Resultado</th><th class="r">Margem Operacional</th><th class="r">Margem Total</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td class="r">Total</td><td class="r">${formatBRL(clientesTot.recebido)}</td><td class="r">${formatBRL(clientesTot.custo)}</td><td class="r">${formatBRL(clientesTot.custo40)}</td><td class="r">${formatBRL(clientesTot.custoTotal)}</td><td class="r">${formatBRL(clientesTot.resultado)}</td><td class="r">${clientesTot.margemOpPct == null ? '—' : clientesTot.margemOpPct.toFixed(1) + '%'}</td><td class="r">${clientesTot.pct == null ? '—' : clientesTot.pct.toFixed(1) + '%'}</td></tr></tfoot></table>
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

  return (
    <AppLayout title="Relatório de Rentabilidade">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader
          icon={TrendingUp}
          title="Rentabilidade"
          subtitle={visao === 'clientes' ? 'Custo Minutor × recebimento Keruak por cliente (CNPJ) — recebido do mês seguinte (M+1)' : visao === 'projeto' ? 'Receita, custo e margem por projeto' : 'Receita, custo e margem por consultor × projeto'}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['mes', 'periodo'] as const).map((mo, i) => (
                  <button key={mo} onClick={() => setMode(mo)} className="px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{ background: mode === mo ? 'var(--primary)' : 'transparent', color: mode === mo ? 'var(--primary-fg)' : 'var(--text-muted)', borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}>
                    {mo === 'mes' ? 'Mês/Ano' : 'Período'}
                  </button>
                ))}
              </div>
              {mode === 'mes' ? (
                <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />
              ) : (
                <>
                  <MonthYearPicker month={fromM} year={fromY} onChange={(m, y) => { setFromM(m); setFromY(y) }} placeholder="De" />
                  <span className="text-xs" style={{ color: 'var(--text-light)' }}>→</span>
                  <MonthYearPicker month={toM} year={toY} onChange={(m, y) => { setToM(m); setToY(y) }} placeholder="Até" />
                </>
              )}
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
          <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={soReceita} onChange={e => setSoReceita(e.target.checked)} />
            {visao === 'clientes' ? 'Só com movimento' : 'Só com receita'}
          </label>
          {visao === 'clientes' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={soMinutor} onChange={e => setSoMinutor(e.target.checked)} />
              Só clientes do Minutor
            </label>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {(visao === 'clientes' ? [
            // Valor Recebido (Keruak M+1) − Custo Total (Operação + 40% do recebido).
            { label: 'Valor Recebido', value: formatBRL(clientesTot.recebido), color: 'var(--brand-primary)' },
            { label: 'Custo Operacional', value: formatBRL(clientesTot.custo), color: 'var(--text)' },
            { label: 'Resultado', value: formatBRL(clientesTot.resultado), color: pctColor(clientesTot.pct) },
            { label: 'Margem', value: clientesTot.pct == null ? '—' : clientesTot.pct.toFixed(1) + '%', color: pctColor(clientesTot.pct) },
          ] : [
            { label: 'Receita', value: formatBRL(tot.receita), color: 'var(--text)' },
            { label: 'Custo', value: formatBRL(tot.custo), color: 'var(--text)' },
            { label: 'Margem', value: formatBRL(tot.margem), color: 'var(--brand-primary)' },
            { label: 'Margem %', value: tot.pct == null ? '—' : tot.pct.toFixed(1) + '%', color: pctColor(tot.pct) },
          ]).map(c => (
            <div key={c.label} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{c.label}</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {visao === 'clientes' ? (
          clientesLoading && clientesRows.length === 0 ? (
            <SkeletonTable rows={8} cols={9} />
          ) : clientesFiltered.length === 0 ? (
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
                    <th onClick={cliThProps('resultado').onClick} style={thCol(COL_HEAD.resultado)}>Resultado</th>
                    <th onClick={cliThProps('margem_real_pct').onClick} style={thCol('#674ea7')}>Margem Operacional</th>
                    <th onClick={cliThProps('resultado_pct').onClick} style={thCol(COL_HEAD.margem)}>Margem Total</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesSorted.map(r => {
                    const ck = r.cnpj || `c${r.customer_id}` || r.cliente
                    const open = expandedCli.has(ck)
                    const temConsultores = (r.consultores?.length ?? 0) > 0
                    return (
                    <Fragment key={ck}>
                    <tr style={{ cursor: temConsultores ? 'pointer' : 'default' }}
                      onClick={() => { if (temConsultores) setExpandedCli(prev => { const n = new Set(prev); n.has(ck) ? n.delete(ck) : n.add(ck); return n }) }}>
                      <td style={{ padding: '6px 10px', color: 'var(--text)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
                        {temConsultores && (open ? <ChevronDown size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={13} className="inline mr-1" style={{ color: 'var(--text-light)' }} />)}
                        <span className="truncate max-w-[220px] inline-block align-bottom">{r.cliente}</span>
                        {!r.no_minutor && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>(fora do Minutor)</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>{r.executivo || '—'}</td>
                      <td style={tdCol(COL_CELL.recebido)}>{formatBRL(r.recebido)}</td>
                      <td style={tdCol(COL_CELL.custo)}>{formatBRL(r.custo)}</td>
                      <td style={tdCol(COL_CELL.custo40)}>{formatBRL(r.custo40)}</td>
                      <td style={tdCol(COL_CELL.total)}>{formatBRL(r.custo_total)}</td>
                      <td style={tdCol(COL_CELL.resultado, r.resultado < 0 ? '#cc0000' : '#111827')}>{formatBRL(r.resultado)}</td>
                      <td style={tdCol(margemBg(r.margem_real_pct), '#fff')}><strong>{r.margem_real_pct == null ? '—' : r.margem_real_pct + '%'}</strong></td>
                      <td style={tdCol(margemBg(r.resultado_pct), '#fff')}><strong>{r.resultado_pct == null ? '—' : r.resultado_pct + '%'}</strong></td>
                    </tr>
                    {open && temConsultores && (
                      <tr>
                        <td colSpan={9} style={{ padding: '0 0 8px 28px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
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
                                return (
                                  <tr key={c.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text)' }}>{c.consultor} <span style={{ color: 'var(--text-light)', fontSize: 11 }}>({formatBRL(c.valor_hora)}/h)</span></td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{fmtH(c.horas)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{(pct * 100).toFixed(1)}%</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)' }} className="tabular-nums">{formatBRL(receitaC)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)' }} className="tabular-nums">{formatBRL(c.custo)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: margemC < 0 ? 'var(--danger)' : 'var(--text)' }} className="tabular-nums">{formatBRL(margemC)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: pctColor(margemPctC) }} className="tabular-nums">{margemPctC == null ? '—' : margemPctC + '%'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
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
                    <td style={{ ...tdCol(COL_HEAD.custo, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custo)}</td>
                    <td style={{ ...tdCol(COL_HEAD.custo40, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custo40)}</td>
                    <td style={{ ...tdCol(COL_HEAD.total, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.custoTotal)}</td>
                    <td style={{ ...tdCol(COL_HEAD.resultado, '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{formatBRL(clientesTot.resultado)}</td>
                    <td style={{ ...tdCol(margemBg(clientesTot.margemOpPct), '#fff'), fontWeight: 700, borderTop: '2px solid var(--border)' }}>{clientesTot.margemOpPct == null ? '—' : clientesTot.margemOpPct.toFixed(1) + '%'}</td>
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
                            <span className="truncate max-w-[220px]">{visao === 'projeto' ? c.consultor : c.projeto}</span>
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
    </AppLayout>
  )
}
