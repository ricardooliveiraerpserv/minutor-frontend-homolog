'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useTableSort } from '@/hooks/use-table-sort'
import { toast } from 'sonner'
import { Lock, RefreshCw, Building2, Printer, FileText, Receipt, ChevronRight, ChevronLeft, ChevronDown, Mail, FileSpreadsheet, Send, X, Save, Plus, Check, Paperclip, Eye, AlertTriangle } from 'lucide-react'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState,
} from '@/components/ds'

// Pendências (apontamentos + despesas a cobrar não aprovados) do cliente no período
interface PendItem {
  id: number
  tipo: 'timesheet' | 'expense'
  data: string
  colaborador: string
  projeto: string
  projeto_codigo: string
  horas?: number
  valor: number
  status: string
  ticket?: string | null
  observacao?: string | null
  descricao?: string | null
  categoria?: string | null
  executivo?: string | null
  coordenador?: string | null
}
interface PendData {
  timesheets: PendItem[]
  despesas: PendItem[]
  qtd_timesheets: number
  qtd_despesas: number
  total_pendencias: number
  valor_timesheets: number
  valor_despesas: number
  valor_pendente: number
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ClienteStatus {
  customer_id: number
  nome: string
  status: 'open' | 'closed' | 'sem_registro'
  total_servicos: number
  total_despesas: number
  total_geral: number
  desconto?: number
  desconto_descricao?: string | null
  closed_at?: string
  closed_by_name?: string
  envio_em?: string | null   // ISO do último envio por e-mail; null = não enviado
  envio_por?: string | null  // nome de quem enviou
}

interface ApontamentoRow {
  id: number
  data: string
  colaborador: string
  horas: number
  ticket?: string
  titulo?: string
  solicitante?: string
  observacao?: string
  client_extra_pct?: number | null
  valor_extra?: number | null
  // Sub-projeto real do apontamento. Quando um contrato On Demand pai consolida
  // projetos-filho, as linhas do pai trazem o código do pai e as do filho o
  // código do filho (ex: VDM004-23-01) — usado para separar em sub-blocos.
  sub_projeto_id?: number
  sub_projeto_codigo?: string
  sub_projeto_nome?: string
}

interface ProjetoRow {
  projeto_id: number
  projeto_nome: string
  projeto_codigo: string
  tipo_contrato: string
  horas: number
  valor_hora: number
  total_receita: number
  extra_receita?: number
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

// Apuração por Ticket (Vedamotors) — espelha /timesheets/summary-by-ticket.
interface TicketSummaryRow {
  ticket: string
  title: string | null
  requester: string | null
  period_minutes: number
  lifetime_minutes: number
}

// Estrutura mínima do /fechamento-contrato (on_demand only)
interface ProjetoGlobal { projeto_id: number; nome: string; codigo: string; horas: number; valor_hora: number; total_receita: number; invoiced?: boolean; is_investimento?: boolean }
interface ClienteGlobal  { customer_id: number; nome: string; projetos: ProjetoGlobal[]; total_horas: number; total_receita: number }
interface GlobalData     { tipos: { code: string; nome: string; clientes: ClienteGlobal[]; total_clientes: number; total_horas: number; total_receita: number }[]; total_geral: number }

type Tab = 'global' | 'servicos' | 'relatorio' | 'cobranca'
interface DespesaCobrancaRow { customer_id: number; nome: string; qtd: number; total: number }

// Apontamento "plano" (todos os clientes) — aba Apontamentos.
interface ApontamentoGeralRow {
  id: number
  data: string
  customer_id: number | null
  cliente: string
  projeto_id: number
  projeto_codigo: string
  projeto_nome: string
  colaborador: string
  solicitante?: string | null
  ticket?: string | null
  titulo?: string | null
  horas: number
}

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

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const now = new Date()
// Fechamento abre SEMPRE no mês anterior (o mês que se fecha), não no atual.
const closingRef = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const CLOSING_MONTH = closingRef.getMonth() + 1
const CLOSING_YEAR  = closingRef.getFullYear()

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FechamentoClientePage() {
  const { user } = useAuth()
  const isAdmin = (user as any)?.type === 'admin'
  const canInvoice = isAdmin || (user as any)?.type === 'administrativo'

  const { filters: flt, set: setFilter } = usePersistedFilters(
    'fechamento_cliente',
    user?.id,
    {
      customerId:   null as number | null,
      projetoFilter: null as number | null,
      tab:          'servicos' as Tab,
    },
  )
  const { customerId, projetoFilter, tab } = flt
  const setCustomerId    = (v: number | null) => setFilter('customerId', v)
  const setProjetoFilter = (v: number | null) => setFilter('projetoFilter', v)
  const setTab           = (v: Tab)           => setFilter('tab', v)

  // Período NÃO é persistido: a tela de fechamento sempre abre no mês anterior.
  const [fromMonth, setFromMonth] = useState<number | null>(CLOSING_MONTH)
  const [fromYear,  setFromYear]  = useState<number | null>(CLOSING_YEAR)
  const [toMonth,   setToMonth]   = useState<number | null>(CLOSING_MONTH)
  const [toYear,    setToYear]    = useState<number | null>(CLOSING_YEAR)

  // ── Período ──
  const fromYM = fromMonth && fromYear ? toYearMonth(fromMonth, fromYear) : ''
  const toYM   = toMonth   && toYear   ? toYearMonth(toMonth,   toYear)   : ''
  const isSingleMonth = fromYM !== '' && fromYM === toYM

  // ── Seleção de cliente ──
  const [clientes, setClientes]     = useState<ClienteStatus[]>([])
  const [status, setStatus]         = useState<ClienteStatus | null>(null)

  // ── Dados ──
  const [globalData,      setGlobalData]      = useState<GlobalData | null>(null)
  const [loadingGlobal,   setLoadingGlobal]   = useState(false)
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set())

  const [dados,    setDados]    = useState<ApontamentosData | null>(null)
  const [despesas, setDespesas] = useState<DespesaRow[]>([])

  // Pendências do cliente (cards no topo + modal)
  const [pendData,      setPendData]      = useState<PendData | null>(null)
  const [pendModalOpen, setPendModalOpen] = useState(false)
  // Apontamentos "planos" de TODOS os clientes (aba Apontamentos).
  const [apsGeral, setApsGeral]             = useState<ApontamentoGeralRow[]>([])
  const [loadingApsGeral, setLoadingApsGeral] = useState(false)
  // Apuração por Ticket — só preenchido para Vedamotors.
  // O valor (ticketSummary) só era lido pelo HTML client-side do relatório, que agora
  // vem do backend; o setter segue alimentado pelos loaders/efeitos para não mexer
  // na máquina de carregamento existente.
  const [, setTicketSummary] = useState<TicketSummaryRow[]>([])

  const [loading,         setLoading]         = useState(false)
  const [loadingDespesas, setLoadingDespesas] = useState(false)

  // ── Relatório (preview em iframe) / envio de e-mail ─────────────────────────
  const canSendEmail = (user as any)?.type === 'admin' || (user as any)?.type === 'administrativo'
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  const reportIframeRef = useRef<HTMLIFrameElement>(null)

  // HTML do relatório vem do backend (mesma Blade do PDF enviado por e-mail) — o
  // preview na tela e o PDF anexado ficam byte-idênticos pois nascem da mesma fonte.
  const [reportHtml, setReportHtml] = useState<string | null>(null)
  const [reportHtmlLoading, setReportHtmlLoading] = useState(false)
  // Contador que força refetch do relatório (ex.: após salvar desconto).
  const [reportReload, setReportReload] = useState(0)

  // Desconto do fechamento (valor + descritivo) — abate o total de serviços no
  // relatório/PDF/e-mail. Persistido por (cliente, competência).
  const [descontoValor, setDescontoValor] = useState('')
  const [descontoDesc, setDescontoDesc]   = useState('')
  const [savingDesconto, setSavingDesconto] = useState(false)

  // Dialog de composição/preview do e-mail.
  const [composeOpen, setComposeOpen] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [limpandoEnvio, setLimpandoEnvio] = useState(false)
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null)
  const [emailMensagem, setEmailMensagem] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  // Destinatários — clientes não têm admin fixos, só cadastrados + avulsos.
  const [cadastradoEmails, setCadastradoEmails] = useState<string[]>([]) // e-mails do cliente (cadastrados) — chips
  const [cadastradoDraft, setCadastradoDraft] = useState('')
  const [savingCadastro, setSavingCadastro] = useState(false)
  const [cadastroSaved, setCadastroSaved] = useState(false)
  const [avulsoEmails, setAvulsoEmails] = useState<string[]>([])        // e-mails avulsos (só deste envio)
  const [avulsoDraft, setAvulsoDraft] = useState('')
  // Anexos extras (além do PDF + Excel) — só deste envio.
  const [anexos, setAnexos] = useState<File[]>([])
  const addAnexos = (files: FileList | null) => {
    if (!files?.length) return
    setAnexos(prev => {
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`))
      return [...prev, ...Array.from(files).filter(f => !seen.has(`${f.name}:${f.size}`))]
    })
  }
  // Abre o seletor criando o <input> imperativamente FORA da árvore do React
  // (anexado ao document.body). O <input> dentro do JSX podia ser remontado
  // enquanto o diálogo do SO estava aberto — ex.: o setUser do loadUser disparado
  // no visibilitychange quando a janela perde foco — e o onChange do arquivo
  // escolhido se perdia num nó descartado → anexo intermitente ("às vezes anexa").
  // Imperativo no body é imune a qualquer re-render/remontagem do modal.
  const openFilePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    input.addEventListener('change', () => { addAnexos(input.files); input.remove() })
    document.body.appendChild(input)
    input.click()
  }
  const removeAnexo = (i: number) => setAnexos(prev => prev.filter((_, idx) => idx !== i))
  // Limite dos anexos extras. O envio via Graph soma PDF+XLSX+extras até ~3 MB; como o
  // relatório já pesa ~1 MB, os extras ficam limitados a 2 MB (o backend revalida o total).
  const MAX_ANEXOS_BYTES = 2 * 1024 * 1024
  const anexosBytes = anexos.reduce((s, f) => s + f.size, 0)
  const anexosExcedido = anexosBytes > MAX_ANEXOS_BYTES
  const addCadastrado = () => {
    const v = cadastradoDraft.trim().replace(/,$/, '').trim().toLowerCase()
    if (!v) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast.error('E-mail inválido'); return }
    setCadastradoEmails(prev => prev.includes(v) ? prev : [...prev, v])
    setCadastradoDraft(''); setCadastroSaved(false)
  }
  const removeCadastrado = (em: string) => { setCadastradoEmails(prev => prev.filter(e => e !== em)); setCadastroSaved(false) }
  // true só no primeiro fetch (sem mensagem) — usado pra semear o textarea com o padrão.
  const previewSeededRef = useRef(false)
  // True só quando o press (mousedown) começou no próprio backdrop do compose.
  const composePressOnBackdrop = useRef(false)

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

  const loadGlobal = useCallback(() => {
    if (!toYM) return
    setLoadingGlobal(true)
    api.get<{ data: GlobalData }>(`/fechamento-contrato?year_month=${toYM}`)
      .then(r => setGlobalData(r.data ?? null))
      .catch(() => {})
      .finally(() => setLoadingGlobal(false))
  }, [toYM])

  // Flag "Faturado / NFS-e enviada" por projeto On Demand (pai) no mês selecionado.
  const setProjetoInvoiced = (projetoId: number, val: boolean) =>
    setGlobalData(prev => prev ? { ...prev, tipos: prev.tipos.map(t => ({ ...t,
      clientes: t.clientes.map(c => ({ ...c, projetos: c.projetos.map(p => p.projeto_id === projetoId ? { ...p, invoiced: val } : p) })) })) } : prev)

  const toggleInvoiced = async (projetoId: number, current: boolean) => {
    const next = !current
    setProjetoInvoiced(projetoId, next) // otimista
    try {
      await api.post('/on-demand/invoiced', { project_id: projetoId, year_month: toYM, invoiced: next })
    } catch {
      toast.error('Erro ao atualizar faturamento')
      setProjetoInvoiced(projetoId, current) // reverte
    }
  }

  const renderInvoiceToggle = (projetoId: number, invoiced: boolean, isOd: boolean) => {
    if (!isOd) return <span style={{ color: 'var(--brand-muted)' }}>—</span>
    return (
      <button type="button" disabled={!canInvoice}
        onClick={e => { e.stopPropagation(); toggleInvoiced(projetoId, invoiced) }}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-default"
        title={invoiced ? 'Faturado e NFS-e enviada — clique p/ desmarcar' : 'Marcar como faturado / NFS-e enviada'}
        style={invoiced
          ? { background: 'var(--success-bg)', color: 'var(--success-border)', border: '1px solid var(--success-border)' }
          : { background: 'transparent', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
        {invoiced ? <><Check size={11} /> Faturado</> : 'Marcar faturado'}
      </button>
    )
  }

  const loadServicos = useCallback(() => {
    if (!customerId || !fromYM || !toYM) return
    setLoading(true)
    const params = new URLSearchParams({ from: fromYM, to: toYM })
    api.get<{ data: ApontamentosData }>(`/fechamento-cliente/${customerId}/${toYM}/apontamentos?${params}`)
      .then(r => setDados(r.data ?? null))
      .catch(() => toast.error('Erro ao carregar apontamentos'))
      .finally(() => setLoading(false))
  }, [customerId, fromYM, toYM])

  // Pendências (apontamentos + despesas a cobrar não aprovados) — alimenta os cards do topo.
  // Endpoint retorna o objeto direto (sem wrapper `data`).
  const loadPendencias = useCallback(() => {
    if (!customerId || !fromYM || !toYM) { setPendData(null); return }
    const params = new URLSearchParams({ from: fromYM, to: toYM })
    api.get<PendData>(`/fechamento-cliente/${customerId}/${toYM}/pendencias?${params}`)
      .then(setPendData)
      .catch(() => setPendData(null))
  }, [customerId, fromYM, toYM])

  // Apontamentos de TODOS os clientes (aba Apontamentos) — filtra cliente/projeto no front.
  const loadApsGeral = useCallback(() => {
    if (!fromYM || !toYM) return
    setLoadingApsGeral(true)
    const params = new URLSearchParams({ from: fromYM, to: toYM })
    api.get<{ data: ApontamentoGeralRow[] }>(`/fechamento-cliente/apontamentos-geral?${params}`)
      .then(r => setApsGeral(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar apontamentos'))
      .finally(() => setLoadingApsGeral(false))
  }, [fromYM, toYM])

  const loadDespesas = useCallback(() => {
    if (!customerId || !fromYM || !toYM) return
    setLoadingDespesas(true)
    const params = new URLSearchParams({ from: fromYM, to: toYM })
    api.get<{ data: DespesaRow[] }>(`/fechamento-cliente/${customerId}/${toYM}/despesas?${params}`)
      .then(r => setDespesas(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setLoadingDespesas(false))
  }, [customerId, fromYM, toYM])

  // ── Despesas a cobrar (consolidado de TODOS os clientes do mês) ──
  const [despCobranca, setDespCobranca]     = useState<DespesaCobrancaRow[]>([])
  const [loadingCobranca, setLoadingCobranca] = useState(false)
  const loadCobranca = useCallback(() => {
    if (!toYM) return
    setLoadingCobranca(true)
    api.get<{ data: DespesaCobrancaRow[] }>(`/fechamento-cliente/despesas-resumo?year_month=${toYM}`)
      .then(r => setDespCobranca(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar despesas a cobrar'))
      .finally(() => setLoadingCobranca(false))
  }, [toYM])
  useEffect(() => { if (tab === 'cobranca') loadCobranca() }, [tab, loadCobranca])
  useEffect(() => { if (tab === 'servicos') loadApsGeral() }, [tab, loadApsGeral])
  // Filtro persistido pode ter guardado a aba "despesas" (removida) — normaliza.
  useEffect(() => { if ((tab as string) === 'despesas') setTab('servicos') }, [tab])

  // Apuração por Ticket — só Vedamotors. Espelha o relatório de apontamentos:
  // GET /timesheets/summary-by-ticket com customer_id + start_date/end_date.
  // O fechamento trabalha com ano-mês (fromYM/toYM); converte pra dia inicial
  // do fromYM e dia final do toYM. Statuses pending+approved (escopo do relatório).
  const loadTicketSummary = useCallback(() => {
    if (!customerId || !fromYM || !toYM) { setTicketSummary([]); return }
    const nome = clientes.find(c => c.customer_id === customerId)?.nome ?? ''
    if (!nome.toUpperCase().includes('VEDAMOTORS')) { setTicketSummary([]); return }

    const startDate = `${fromYM}-01`
    const [ty, tm] = toYM.split('-').map(Number)
    const lastDay = new Date(ty, tm, 0).getDate()
    const endDate = `${toYM}-${String(lastDay).padStart(2, '0')}`

    const p = new URLSearchParams()
    p.set('customer_id', String(customerId))
    p.set('start_date',  startDate)
    p.set('end_date',    endDate)
    ;['pending', 'approved'].forEach(s => p.append('status[]', s))

    api.get<{ tickets?: TicketSummaryRow[] }>(`/timesheets/summary-by-ticket?${p}`)
      .then(r => {
        const tickets = Array.isArray(r?.tickets) ? r.tickets : []
        tickets.sort((a, b) => a.ticket.localeCompare(b.ticket, 'pt-BR', { numeric: true }))
        setTicketSummary(tickets)
      })
      .catch(() => setTicketSummary([]))
  }, [customerId, fromYM, toYM, clientes])

  // ── Efeitos ──

  // "Até" vazio mas "De" preenchido → default "Até" = "De" (fechamento de mês único).
  // Sem isso, as listas que dependem de toYM (clientes, visão global) ficam vazias.
  useEffect(() => {
    if (fromMonth && fromYear && (toMonth == null || toYear == null)) {
      setToMonth(fromMonth)
      setToYear(fromYear)
    }
  }, [fromMonth, fromYear, toMonth, toYear])

  useEffect(() => {
    loadClientes()
    loadGlobal()
    setDados(null)
    setDespesas([])
    setTicketSummary([])
    setProjetoFilter(null)
  }, [fromYM, toYM])

  useEffect(() => {
    if (!customerId) { setStatus(null); setDados(null); setDespesas([]); setTicketSummary([]); setPendData(null); return }
    setStatus(clientes.find(c => c.customer_id === customerId) ?? null)
    setDados(null)
    setDespesas([])
    setTicketSummary([])
    setProjetoFilter(null)
    // NÃO troca de aba ao mudar o cliente — o seletor filtra a Visão Global; o usuário
    // escolhe a aba (Relatório/Apontamentos) quando quiser.
  }, [customerId, clientes])

  useEffect(() => {
    if (customerId && fromYM && toYM) {
      loadServicos()
      loadDespesas()
      loadTicketSummary()
      loadPendencias()
    }
  }, [customerId, fromYM, toYM, clientes])

  // ── Excel / E-mail ──────────────────────────────────────────────────────────
  // Modo do relatório aberto: a aba Despesas a Cobrar abre em modo 'despesa'.
  const detailMode = (): 'servicos' | 'despesa' => (tab === 'cobranca' ? 'despesa' : 'servicos')

  async function downloadExcel() {
    if (!customerId || !toYM) return
    setDownloadingExcel(true)
    try {
      // O `api` helper sempre faz res.json(); pra blob usamos fetch direto no
      // mesmo proxy /api/v1 (o middleware injeta o Authorization via cookie).
      const modo = detailMode()
      // Propaga o filtro de contrato (projetoFilter) — sem isso, o XLSX baixado
      // trazia todos os contratos mesmo com 1 selecionado no header.
      const qs = new URLSearchParams()
      if (modo === 'despesa') qs.set('mode', 'despesa')
      if (modo === 'servicos' && projetoFilter) qs.set('project_id', String(projetoFilter))
      const qstr = qs.toString()
      const res = await fetch(
        `/api/v1/fechamento-cliente/${customerId}/${toYM}/excel${qstr ? `?${qstr}` : ''}`,
        { credentials: 'same-origin', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const fallback = `${modo === 'despesa' ? 'Despesas' : 'Fechamento'}_${toYM}_${clienteNome || 'cliente'}.xlsx`
      const filename = match ? decodeURIComponent(match[1]) : fallback
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      toast.error(`Erro ao baixar o Excel: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setDownloadingExcel(false)
    }
  }

  // Busca o HTML renderizado do e-mail. Sem `mensagem` → backend devolve o html
  // padrão + `mensagem_padrao` (semeia o textarea) + e-mails cadastrados.
  // Clientes não têm admin fixos, então não há lista de e-mails fixos.
  const fetchEmailPreview = useCallback(async (mensagem?: string) => {
    if (!customerId || !toYM) return
    setPreviewLoading(true)
    try {
      // Propaga projetoFilter ao preview pra listar só o projeto filtrado no template.
      const mode = detailMode()
      const payload: Record<string, unknown> = { mode }
      if (mensagem !== undefined) payload.mensagem = mensagem
      if (mode === 'servicos' && projetoFilter) payload.project_id = projetoFilter
      const res = await api.post<{
        html: string
        mensagem_padrao: string
        fechamento_email: string | null
        emails_administrativos?: string[]
      }>(
        `/fechamento-cliente/${customerId}/${toYM}/email-preview`,
        payload,
      )
      setEmailPreviewHtml(res.html)
      if (!previewSeededRef.current) {
        previewSeededRef.current = true
        setEmailMensagem(res.mensagem_padrao ?? '')
        setCadastradoEmails(res.emails_administrativos ?? (res.fechamento_email ? res.fechamento_email.split(/[,;]+/).map(e => e.trim()).filter(Boolean) : []))
      }
    } catch (err: unknown) {
      toast.error(`Erro ao gerar a prévia do e-mail: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setPreviewLoading(false)
    }
    // projetoFilter precisa estar nas deps: sem isso, a callback fica stale com o valor
    // antigo do filtro e a prévia continua mostrando todos os projetos mesmo após o user
    // selecionar 1 contrato no header. Inclui o tab pra recriar quando alterna servicos/cobranca.
  }, [customerId, toYM, tab, projetoFilter])

  function openCompose() {
    if (!customerId || !toYM) return
    previewSeededRef.current = false
    setEmailMensagem('')
    setEmailPreviewHtml(null)
    setCadastradoEmails([])
    setAvulsoEmails([])
    setAvulsoDraft('')
    setAnexos([])
    setCadastroSaved(false)
    setComposeOpen(true)
    void fetchEmailPreview() // primeiro fetch: sem mensagem → html + mensagem_padrao + e-mails
  }

  function closeCompose() {
    setComposeOpen(false)
    setEmailPreviewHtml(null)
    setEmailMensagem('')
    setCadastradoEmails([])
    setAvulsoEmails([])
    setAvulsoDraft('')
    setAnexos([])
    setCadastroSaved(false)
    previewSeededRef.current = false
  }

  // Live update do preview: ao editar a mensagem, faz debounce (~450ms) e re-busca
  // o html. Só dispara depois que o primeiro fetch semeou o textarea.
  useEffect(() => {
    if (!composeOpen || !previewSeededRef.current) return
    const t = setTimeout(() => { void fetchEmailPreview(emailMensagem) }, 450)
    return () => clearTimeout(t)
  }, [emailMensagem, composeOpen, fetchEmailPreview])

  // Adiciona um e-mail avulso (chip) só deste envio. Aceita Enter / vírgula.
  function addAvulso() {
    const v = avulsoDraft.trim().replace(/,$/, '').trim()
    if (!v) return
    setAvulsoEmails(prev => prev.includes(v) ? prev : [...prev, v])
    setAvulsoDraft('')
  }

  function removeAvulso(email: string) {
    setAvulsoEmails(prev => prev.filter(e => e !== email))
  }

  // Salva os e-mails cadastrados no cliente (persiste no cadastro).
  async function saveCadastro() {
    if (!customerId) return
    setSavingCadastro(true)
    setCadastroSaved(false)
    try {
      const res = await api.post<{ success: boolean; fechamento_email: string; emails_administrativos?: string[] }>(
        `/fechamento-cliente/${customerId}/fechamento-email`,
        { emails_administrativos: cadastradoEmails },
      )
      setCadastradoEmails(res.emails_administrativos ?? cadastradoEmails)
      setCadastroSaved(true)
      toast.success('E-mails salvos no cadastro do cliente.')
    } catch (err: unknown) {
      toast.error(`Erro ao salvar os e-mails: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSavingCadastro(false)
    }
  }

  async function sendReportEmail() {
    if (!customerId || !toYM) return
    if (anexosExcedido) {
      toast.error(`Anexos excedem o limite de ${(MAX_ANEXOS_BYTES / 1048576).toFixed(0)} MB. Remova ou reduza os arquivos.`)
      return
    }
    // Promove avulsoDraft pra chip se o user digitou e não pressionou Enter / + Adicionar.
    // Sem isso, um e-mail digitado mas não confirmado era ignorado e dava 422 do BE.
    const draftClean = avulsoDraft.trim().replace(/,$/, '').trim()
    const avulsoFinal = draftClean && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draftClean)
      ? Array.from(new Set([...avulsoEmails, draftClean]))
      : avulsoEmails
    // Idem para o campo cadastrado: promove o draft digitado e não confirmado.
    const cadDraftClean = cadastradoDraft.trim().replace(/,$/, '').trim()
    const cadastradoFinal = cadDraftClean && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cadDraftClean)
      ? Array.from(new Set([...cadastradoEmails, cadDraftClean]))
      : cadastradoEmails
    // Destinatários = cadastrados (chips + draft) + avulsos (chips + draft), dedupe.
    const emails = Array.from(new Set([...cadastradoFinal, ...avulsoFinal]))
    if (emails.length === 0) {
      toast.error('Informe ao menos um e-mail de destino antes de enviar.')
      return
    }
    // Sincroniza estado: se promoveu algum draft, persiste como chip e limpa o input.
    if (avulsoFinal !== avulsoEmails) {
      setAvulsoEmails(avulsoFinal)
      setAvulsoDraft('')
    }
    if (cadastradoFinal !== cadastradoEmails) {
      setCadastradoEmails(cadastradoFinal)
      setCadastradoDraft('')
    }
    setSendingEmail(true)
    try {
      // multipart (FormData) para levar os anexos extras junto do PDF + Excel.
      const fd = new FormData()
      fd.append('mensagem', emailMensagem)
      const mode = detailMode()
      fd.append('mode', mode)
      // Propaga filtro de contrato (projetoFilter) — sem isso o PDF/XLSX anexados ao
      // e-mail traziam todos os contratos do cliente mesmo com 1 selecionado no header.
      if (mode === 'servicos' && projetoFilter) fd.append('project_id', String(projetoFilter))
      emails.forEach(e => fd.append('emails[]', e))
      anexos.forEach(f => fd.append('anexos[]', f, f.name))

      const res = await fetch(
        `/api/v1/fechamento-cliente/${customerId}/${toYM}/enviar-email`,
        { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, body: fd },
      )
      const json = await res.json().catch(() => ({})) as {
        success?: boolean
        message?: string
        errors?: Record<string, string[]>
      }
      if (!res.ok || json?.success === false) {
        // Laravel 422 traz errors{field:[msgs]}; preferir primeira msg de validação (mais
        // amigável que 'validation.required'). Fallback: message do BE; depois HTTP code.
        const firstFieldMsg = json?.errors
          ? Object.values(json.errors).flat().find(m => typeof m === 'string' && !m.startsWith('validation.'))
          : undefined
        throw new Error(firstFieldMsg || json?.message || `Erro ${res.status}`)
      }
      toast.success(json?.message ?? 'Fechamento enviado por e-mail.')
      patchEnvio(customerId, new Date().toISOString(), (user as any)?.name ?? null)
      closeCompose()
    } catch (err: unknown) {
      toast.error(`Erro ao enviar o fechamento: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSendingEmail(false)
    }
  }

  // Atualiza o status de envio do cliente (otimista, sem refetch) — em `status` e na lista.
  function patchEnvio(id: number | null, envio_em: string | null, envio_por: string | null) {
    if (!id) return
    setStatus(prev => (prev && prev.customer_id === id ? { ...prev, envio_em, envio_por } : prev))
    setClientes(prev => prev.map(c => (c.customer_id === id ? { ...c, envio_em, envio_por } : c)))
  }

  async function limparEnvio() {
    if (!customerId || !toYM) return
    setLimpandoEnvio(true)
    try {
      await api.post(`/fechamento-cliente/${customerId}/${toYM}/limpar-envio`, {})
      patchEnvio(customerId, null, null)
      toast.success('Status de envio limpo.')
    } catch (err: unknown) {
      toast.error(`Erro ao limpar: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setLimpandoEnvio(false)
    }
  }

  // ── Toggle expansão de cliente na visão global ──
  const toggleClient = (id: number) => setExpandedClients(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // ── Derivados ──

  const clienteOptions = clientes.map(c => ({ id: c.customer_id, name: c.nome }))
  const todosProjetos  = dados?.projetos ?? []
  const projetoOptions = todosProjetos.map(p => ({ id: p.projeto_id, name: `${p.projeto_codigo} — ${p.projeto_nome}` }))
  const projetos       = projetoFilter ? todosProjetos.filter(p => p.projeto_id === projetoFilter) : todosProjetos
  const totalHoras     = projetos.reduce((s, p) => s + p.horas, 0)
  const totalGeral     = projetos.reduce((s, p) => s + p.total_receita, 0)
  const totalDespesas  = despesas.reduce((s, d) => s + d.valor, 0)
  const clienteNome    = clientes.find(c => c.customer_id === customerId)?.nome ?? ''
  const periodo        = fmtPeriodo(fromYM, toYM)

  // ── Aba Apontamentos (todos os clientes) ──
  const apsCliente     = customerId ? apsGeral.filter(a => a.customer_id === customerId) : apsGeral
  const apsFiltered    = projetoFilter ? apsCliente.filter(a => a.projeto_id === projetoFilter) : apsCliente
  const apsHorasTotal  = apsFiltered.reduce((s, a) => s + a.horas, 0)
  const apsProjetoOptions = Array.from(
    new Map(apsCliente.map(a => [a.projeto_id, `${a.projeto_codigo} — ${a.projeto_nome}`])).entries(),
  ).map(([id, name]) => ({ id, name }))
  // Filtro de contrato do cabeçalho: na aba Apontamentos usa os projetos do conjunto
  // geral (todos os clientes); nas demais, os projetos do cliente aberto.
  const headerProjetoOptions = tab === 'servicos' ? apsProjetoOptions : projetoOptions

  // ── Aba Relatório Serviços (lista de clientes com serviços, da Visão Global) ──
  // Só clientes On Demand PAI (sem investimento): o /fechamento-contrato classifica
  // pelo contrato-raiz (filho consolida no pai), então o tipo 'on_demand' já é pai;
  // a interseção com a lista do índice exclui os buckets de investimento comercial.
  const onDemandClientes = new Set(clientes.map(c => c.customer_id))
  const clientesServicos = (() => {
    const m = new Map<number, { customer_id: number; nome: string; total_horas: number; total_receita: number; tipos: Set<string> }>()
    ;(globalData?.tipos ?? []).filter(t => t.code === 'on_demand').forEach(tipo => tipo.clientes.forEach(c => {
      if (!onDemandClientes.has(c.customer_id)) return
      c.projetos.forEach(p => {
        if (p.horas <= 0) return
        if (!m.has(c.customer_id)) m.set(c.customer_id, { customer_id: c.customer_id, nome: c.nome, total_horas: 0, total_receita: 0, tipos: new Set() })
        const e = m.get(c.customer_id)!
        e.total_horas   += p.horas
        e.total_receita += Math.round(p.horas * p.valor_hora * 100) / 100
        e.tipos.add(tipo.nome)
      })
    }))
    return Array.from(m.values()).filter(c => c.total_receita > 0).sort((a, b) => a.nome.localeCompare(b.nome))
  })()

  // Status de envio por cliente (legenda nas listas) — do /fechamento-cliente.
  const enviadoMap = new Map(clientes.map(c => [c.customer_id, { envio_em: c.envio_em, envio_por: c.envio_por }]))

  // Desconto por cliente (valor + descritivo) — do /fechamento-cliente.
  const descontoMap = new Map(clientes.map(c => [c.customer_id, { valor: c.desconto ?? 0, descricao: c.desconto_descricao ?? null }]))

  // Ordenação client-side das tabelas (clique no cabeçalho).
  const apontamentosSort = useTableSort(apsFiltered)
  const servicosSort     = useTableSort(clientesServicos)
  const cobrancaSort     = useTableSort(despCobranca)

  // Relatório — busca o HTML standalone do backend (mesma Blade do PDF). Reseta ao
  // trocar cliente/competência pra não exibir um relatório defasado durante o fetch.
  // As escritas de estado ficam dentro do fluxo async (não no corpo síncrono do
  // efeito) e são guardadas por `cancelled` para corridas entre cliente/competência.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setReportHtml(null)
      const isServ = tab === 'relatorio'
      const isDesp = tab === 'cobranca'
      // Saídas "não vai carregar" precisam zerar o loading também: se um run anterior
      // ligou reportHtmlLoading e foi cancelado (cancelled=true), o finally guardado
      // por !cancelled não desliga o flag — e este run, ao dar return cedo, deixaria o
      // skeleton preso pra sempre (relatório não abre após refetch/troca de valor).
      if ((!isServ && !isDesp) || !customerId
          || (isServ && projetos.length === 0)
          || (isDesp && despesas.length === 0)) {
        setReportHtmlLoading(false)
        return
      }
      setReportHtmlLoading(true)
      try {
        // Filtro de contrato (projetoFilter) propaga pro BE: senão o relatório/PDF
        // mostrava todos os contratos do cliente mesmo com 1 selecionado no header.
        const params = new URLSearchParams()
        if (isDesp) params.set('mode', 'despesa')
        if (isServ && projetoFilter) params.set('project_id', String(projetoFilter))
        const qs = params.toString()
        const q = qs ? `?${qs}` : ''
        const res = await api.get<{ html: string }>(`/fechamento-cliente/${customerId}/${toYM}/report-html${q}`)
        if (!cancelled) setReportHtml(res.html)
      } catch {
        if (!cancelled) { setReportHtml(null); toast.error('Erro ao gerar o relatório') }
      } finally {
        if (!cancelled) setReportHtmlLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [tab, customerId, toYM, projetos.length, despesas.length, projetoFilter, reportReload])

  // Pré-preenche os campos de desconto com o valor persistido do cliente/mês.
  useEffect(() => {
    const d = status?.desconto ?? 0
    setDescontoValor(d ? String(d) : '')
    setDescontoDesc(status?.desconto_descricao ?? '')
  }, [status?.customer_id, status?.desconto, status?.desconto_descricao])

  // Salva o desconto (valor + descritivo) do cliente/competência e recarrega o
  // relatório pra refletir o abatimento. Update otimista no status local.
  const salvarDesconto = async () => {
    if (!customerId) return
    const valor = parseFloat(descontoValor.replace(',', '.')) || 0
    if (valor < 0) { toast.error('Desconto não pode ser negativo'); return }
    const descricao = descontoDesc.trim() || null
    setSavingDesconto(true)
    try {
      await api.post(`/fechamento-cliente/${customerId}/${toYM}/desconto`, {
        desconto: valor,
        desconto_descricao: descricao,
      })
      setStatus(prev => (prev && prev.customer_id === customerId
        ? { ...prev, desconto: valor, desconto_descricao: descricao } : prev))
      setReportReload(n => n + 1)
      toast.success('Desconto salvo')
    } catch {
      toast.error('Erro ao salvar o desconto')
    } finally {
      setSavingDesconto(false)
    }
  }

  // ── Detalhe (tela tradicional): preview do relatório + ações (imprimir/email/excel) ──
  const renderDetail = (mode: 'servicos' | 'despesa') => {
    const isDesp = mode === 'despesa'
    const descontoAtual = status?.desconto ?? 0
    const total  = isDesp ? totalDespesas : Math.max(0, totalGeral - descontoAtual)

    // Projetos On Demand (pai, não-investimento) deste cliente/mês — fonte do
    // toggle "Faturado / NFS-e" (mesmo flag da Visão Global, via globalData).
    const odProjetos = (globalData?.tipos ?? [])
      .filter(t => t.code === 'on_demand')
      .flatMap(t => t.clientes)
      .filter(c => c.customer_id === customerId)
      .flatMap(c => c.projetos)
      .filter(p => !p.is_investimento)

    // Enquanto carrega (dados/despesas/relatório), mostra skeleton — o "vazio" só
    // vale depois do load, senão pisca a mensagem de vazio durante o fetch.
    if (loading || loadingDespesas || reportHtmlLoading) {
      return <SkeletonTable rows={6} cols={4} />
    }
    if (!isDesp && projetos.length === 0) {
      return <EmptyState icon={FileText} title="Sem dados para relatório"
        description="Nenhum apontamento encontrado no período selecionado." />
    }
    if (isDesp && despesas.length === 0) {
      return <EmptyState icon={Receipt} title="Sem despesas a cobrar"
        description="Este cliente não tem despesas a cobrar no período." />
    }
    if (reportHtml === null) {
      return <SkeletonTable rows={6} cols={4} />
    }

    return (
      <div className="flex-1 flex min-h-0 flex-col md:flex-row -m-6">
        {/* LEFT — preview do documento */}
        <div className="flex-1 min-h-0 overflow-auto flex justify-center p-3 md:p-6" style={{ background: 'var(--bg)' }}>
          <iframe
            ref={reportIframeRef}
            srcDoc={reportHtml}
            title="Relatório"
            className="w-full"
            style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 820, minHeight: 640 }}
          />
        </div>

        {/* RIGHT — painel de ações */}
        <aside
          className="shrink-0 w-full md:w-[300px] flex flex-col gap-3 p-4 overflow-y-auto border-t md:border-t-0 md:border-l"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="pb-3 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{clienteNome}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {fromYM === toYM ? fmtYM(toYM) : `${fmtYM(fromYM)} — ${fmtYM(toYM)}`}
            </p>
            <p className="text-[11px] mt-2 uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
              {isDesp ? 'Total a cobrar' : 'Valor a pagar'}
            </p>
            <p className="text-lg font-bold" style={{ color: isDesp ? '#0e7490' : 'var(--primary)' }}>{formatBRL(total)}</p>
            {!isDesp && descontoAtual > 0 && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Subtotal {formatBRL(totalGeral)} − desconto {formatBRL(descontoAtual)}
              </p>
            )}
          </div>

          {/* Desconto do fechamento (valor + descritivo) — entra no relatório/PDF/e-mail */}
          {!isDesp && canSendEmail && (
            <div className="rounded-lg p-3 flex flex-col gap-2"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-light)' }}>
                Desconto
              </p>
              <div>
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Valor (R$)</label>
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={descontoValor}
                  onChange={e => setDescontoValor(e.target.value)}
                  placeholder="0,00"
                  className="ds-input w-full mt-1"
                />
              </div>
              <div>
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Descritivo</label>
                <textarea
                  value={descontoDesc}
                  onChange={e => setDescontoDesc(e.target.value)}
                  rows={2}
                  placeholder="Motivo do desconto (aparece no relatório)"
                  className="ds-input w-full mt-1 resize-none"
                />
              </div>
              <Button
                size="sm"
                icon={Save}
                loading={savingDesconto}
                className="w-full !justify-center"
                onClick={salvarDesconto}
              >
                {savingDesconto ? 'Salvando…' : 'Salvar desconto'}
              </Button>
            </div>
          )}

          {/* Faturamento (NFS-e) — mesmo toggle por projeto On Demand da Visão Global */}
          {!isDesp && odProjetos.length > 0 && (
            <div className="rounded-lg p-3 flex flex-col gap-2"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-light)' }}>
                Faturamento (NFS-e)
              </p>
              {odProjetos.map(p => (
                <button
                  key={p.projeto_id}
                  type="button"
                  disabled={!canInvoice}
                  onClick={() => toggleInvoiced(p.projeto_id, !!p.invoiced)}
                  title={p.invoiced ? 'Faturado e NFS-e enviada — clique p/ desmarcar' : 'Marcar como faturado / NFS-e enviada'}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={p.invoiced
                    ? { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' }
                    : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {p.invoiced ? <Check size={13} /> : null}
                  {odProjetos.length > 1 ? `${p.codigo}: ` : ''}{p.invoiced ? 'Faturado' : 'Marcar como faturado'}
                </button>
              ))}
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            icon={Printer}
            className="w-full !justify-start"
            onClick={() => reportIframeRef.current?.contentWindow?.print()}
          >
            Imprimir
          </Button>

          {canSendEmail && (
            <Button
              size="sm"
              icon={Mail}
              className="w-full !justify-start"
              title={`Enviar ${isDesp ? 'despesas' : 'fechamento'} de ${clienteNome} por e-mail`}
              onClick={openCompose}
            >
              Enviar e-mail
            </Button>
          )}

          {canSendEmail && (
            status?.envio_em ? (
              <div
                className="rounded-lg px-3 py-2 text-xs flex items-start justify-between gap-2"
                style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
              >
                <span className="flex items-start gap-1.5">
                  <Check size={13} className="mt-0.5 shrink-0" />
                  <span>Enviado em {fmtDateTime(status.envio_em)}{status.envio_por ? ` por ${status.envio_por}` : ''}</span>
                </span>
                <button
                  onClick={limparEnvio}
                  disabled={limpandoEnvio}
                  className="shrink-0 disabled:opacity-50 hover:underline"
                  style={{ color: 'var(--text-light)' }}
                >
                  {limpandoEnvio ? '...' : 'limpar'}
                </button>
              </div>
            ) : (
              <p className="text-xs px-1" style={{ color: 'var(--text-light)' }}>
                {isDesp ? 'Despesas ainda não enviadas.' : 'Fechamento ainda não enviado.'}
              </p>
            )
          )}

          <Button
            size="sm"
            icon={FileSpreadsheet}
            loading={downloadingExcel}
            className="w-full !justify-start"
            onClick={downloadExcel}
          >
            {downloadingExcel ? 'Baixando…' : 'Baixar Excel'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            className="w-full !justify-start mt-auto"
            onClick={() => setCustomerId(null)}
          >
            Voltar à lista
          </Button>
        </aside>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Fechamento On Demand">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">

        {/* ── Header ── */}
        <div className="px-4 md:px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Building2 size={20} style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--brand-text)' }}>
              Fechamento On Demand
            </h1>
            {periodo && (
              <span className="text-sm" style={{ color: 'var(--brand-muted)' }}>{periodo}</span>
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

            {/* Filtro de contrato (projeto) */}
            {headerProjetoOptions.length > 0 && (
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>
                  {tab === 'servicos' ? 'Projeto' : 'Contrato'}
                </div>
                <SearchSelect
                  value={projetoFilter ?? ''}
                  onChange={v => setProjetoFilter(v ? Number(v) : null)}
                  options={headerProjetoOptions}
                  placeholder={tab === 'servicos' ? 'Todos os projetos' : 'Todos os contratos'}
                />
              </div>
            )}

            {/* Cliente */}
            <div className="ml-auto flex items-end gap-2 flex-wrap">
              <SearchSelect
                value={customerId ?? ''}
                onChange={v => setCustomerId(v ? Number(v) : null)}
                options={clienteOptions}
                placeholder="Selecionar cliente..."
              />
            </div>
          </div>

        </div>

        {/* ── Cards de pendências (apontamentos + despesas a cobrar não aprovados) — topo, sempre visíveis ── */}
        {customerId && pendData && (
          <div className="px-4 md:px-6 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card 1 — apontamentos pendentes */}
            <div
              className="ds-card flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${pendData.total_pendencias > 0 ? 'var(--warning)' : 'var(--border)'}`,
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                  {pendData.total_pendencias > 0 && <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />}
                  Apontamentos pendentes
                </div>
                <div className="text-2xl font-bold leading-tight mt-0.5" style={{ color: pendData.qtd_timesheets > 0 ? 'var(--warning)' : 'var(--text)' }}>
                  {pendData.qtd_timesheets}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  {pendData.qtd_despesas > 0 ? `+ ${pendData.qtd_despesas} despesa(s) a cobrar` : 'sem despesas pendentes'}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={Eye}
                disabled={pendData.total_pendencias === 0}
                onClick={() => setPendModalOpen(true)}
              >
                Ver
              </Button>
            </div>

            {/* Card 2 — valor pendente */}
            <div
              className="ds-card flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${pendData.valor_pendente > 0 ? 'var(--warning)' : 'var(--border)'}`,
              }}
            >
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                  Valor pendente
                </div>
                <div className="text-2xl font-bold leading-tight mt-0.5" style={{ color: pendData.valor_pendente > 0 ? 'var(--warning)' : 'var(--text)' }}>
                  {formatBRL(pendData.valor_pendente)}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  apontamentos {formatBRL(pendData.valor_timesheets)} · despesas {formatBRL(pendData.valor_despesas)}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={Eye}
                disabled={pendData.total_pendencias === 0}
                onClick={() => setPendModalOpen(true)}
              >
                Ver
              </Button>
            </div>
          </div>
        )}

        {/* ── Tabs — sempre visíveis ── */}
        <div className="flex gap-1 px-4 md:px-6 border-b overflow-x-auto" style={{ borderColor: 'var(--brand-border)' }}>
          {([
            { key: 'global',    label: 'Visão Global' },
            { key: 'servicos',  label: 'Apontamentos' },
            { key: 'relatorio', label: 'Relatório Serviços' },
            { key: 'cobranca',  label: 'Despesas a Cobrar' },
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

          {/* ── Tab Visão Global ── */}
          {tab === 'global' && (() => {
            if (loadingGlobal) return <SkeletonTable rows={6} cols={4} />

            // Agrega TODOS os tipos → um mapa por cliente com todos os projetos
            // total_receita na visão global = horas × valor_hora (não a mensalidade contratada)
            type ProjDisp = ProjetoGlobal & { tipo_nome: string; tipo_code: string; total_display: number }
            type ClienteAgg = { customer_id: number; nome: string; projetos: ProjDisp[]; total_horas: number; total_receita: number }
            const clientMap = new Map<number, ClienteAgg>()
            ;(globalData?.tipos ?? []).forEach(tipo => {
              // Fechamento On Demand: só contratos On Demand entram aqui. Banco de Horas
              // (fixed_hours/monthly_hours), Fechado e demais tipos saem fora desta visão.
              if (tipo.code !== 'on_demand') return
              tipo.clientes.forEach(c => {
                if (!clientMap.has(c.customer_id)) {
                  clientMap.set(c.customer_id, { customer_id: c.customer_id, nome: c.nome, projetos: [], total_horas: 0, total_receita: 0 })
                }
                const entry = clientMap.get(c.customer_id)!
                c.projetos.forEach(p => {
                  // Buckets internos de investimento (Investimento Comercial/Suporte/Projetos)
                  // têm contract_type on_demand mas NÃO são contratos com o cliente.
                  if (p.is_investimento) return
                  const display = Math.round(p.horas * p.valor_hora * 100) / 100
                  if (p.horas > 0) {
                    entry.projetos.push({ ...p, tipo_nome: tipo.nome, tipo_code: tipo.code, total_display: display })
                    entry.total_horas   += p.horas
                    entry.total_receita += display
                  }
                })
              })
            })
            const lista = Array.from(clientMap.values())
              .filter(c => c.total_receita > 0)
              .filter(c => !customerId || c.customer_id === customerId) // seletor filtra a Visão Global
              .sort((a, b) => a.nome.localeCompare(b.nome))

            if (lista.length === 0) {
              return (
                <EmptyState icon={Building2} title="Sem movimento no período"
                  description="Nenhum cliente com apontamentos no período selecionado." />
              )
            }
            const totalHoras   = lista.reduce((s, c) => s + c.total_horas, 0)
            const totalReceita = lista.reduce((s, c) => s + c.total_receita, 0)
            // Desconto por cliente (do /fechamento-cliente) e líquido (cheio − desconto).
            const descClienteVG = (cid: number) => descontoMap.get(cid)?.valor ?? 0
            const liquidoCliente = (c: ClienteAgg) => Math.max(0, c.total_receita - descClienteVG(c.customer_id))
            const totalDesconto  = lista.reduce((s, c) => s + descClienteVG(c.customer_id), 0)
            const totalLiquido   = lista.reduce((s, c) => s + liquidoCliente(c), 0)
            const statusMap = new Map(clientes.map(c => [c.customer_id, c.status]))
            return (
              <div>
                {/* Cards de resumo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Clientes com movimento</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--brand-text)' }}>{lista.length}</div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>Horas Aprovadas</div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                      {totalHoras.toFixed(2)}h
                    </div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--brand-muted)' }}>
                      {totalDesconto > 0 ? 'Total Geral (com desconto)' : 'Total Geral'}
                    </div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                      {formatBRL(totalLiquido)}
                    </div>
                    {totalDesconto > 0 && (
                      <div className="text-xs mt-1 tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                        Cheio {formatBRL(totalReceita)} · <span style={{ color: 'var(--danger)' }}>desconto −{formatBRL(totalDesconto)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabela apenas com quem tem movimento */}
                <Table>
                  <Thead>
                    <tr>
                      <Th>Cliente / Projeto</Th>
                      <Th>Status</Th>
                      <Th right>Horas</Th>
                      <Th right>Valor/h</Th>
                      <Th right>Total Serviços</Th>
                      <Th right>Desconto</Th>
                      <Th right>Com Desconto</Th>
                      <Th>Faturado (NFS-e)</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {lista.map(c => {
                      const st       = statusMap.get(c.customer_id)
                      const expanded = expandedClients.has(c.customer_id)
                      const hasMult  = c.projetos.length > 1
                      return (
                        <>
                          {/* Linha do cliente */}
                          <tr
                            key={c.customer_id}
                            style={{ cursor: hasMult ? 'pointer' : 'default' }}
                            className="border-b transition-colors hover:bg-[var(--surface-hover)]"
                            onClick={hasMult ? () => toggleClient(c.customer_id) : undefined}
                          >
                            <td className="px-5 py-3 text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
                              <div className="flex items-center gap-2">
                                {hasMult
                                  ? (expanded ? <ChevronDown size={14} style={{ color: 'var(--brand-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--brand-muted)' }} />)
                                  : <ChevronRight size={14} style={{ color: 'var(--brand-muted)' }} />
                                }
                                <span>{c.nome}</span>
                                {!hasMult && c.projetos[0] && (
                                  <span className="text-xs font-normal" style={{ color: 'var(--brand-muted)' }}>
                                    — {c.projetos[0].nome}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              {st === 'closed'
                                ? <Badge variant="success"><Lock size={10} className="mr-1" />Fechado</Badge>
                                : <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>Aberto</span>
                              }
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-sm" style={{ color: 'var(--brand-text)' }}>
                              {c.total_horas.toFixed(2)}h
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-sm" style={{ color: 'var(--brand-muted)' }}>
                              {!hasMult && c.projetos[0] ? formatBRL(c.projetos[0].valor_hora) : '—'}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(c.total_receita)}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-sm">
                              {descClienteVG(c.customer_id) > 0
                                ? <span title={descontoMap.get(c.customer_id)?.descricao ?? undefined} style={{ color: 'var(--danger)' }}>− {formatBRL(descClienteVG(c.customer_id))}</span>
                                : <span style={{ color: 'var(--brand-muted)' }}>—</span>}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--brand-text)' }}>
                              {formatBRL(liquidoCliente(c))}
                            </td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              {!hasMult && c.projetos[0]
                                ? renderInvoiceToggle(c.projetos[0].projeto_id, !!c.projetos[0].invoiced, c.projetos[0].tipo_code === 'on_demand')
                                : <span style={{ color: 'var(--brand-muted)' }}>—</span>}
                            </td>
                          </tr>
                          {/* Linhas dos projetos (expandido ou multi-projeto) */}
                          {expanded && hasMult && c.projetos.map(p => (
                            <tr
                              key={`${c.customer_id}-${p.projeto_id}`}
                              className="border-b"
                            >
                              <td className="py-2.5 text-xs" style={{ color: 'var(--brand-muted)', paddingLeft: '2.75rem' }}>
                                {p.nome}
                                <span className="ml-2 opacity-60">{p.codigo}</span>
                                <span className="ml-2 px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
                                  {p.tipo_nome}
                                </span>
                              </td>
                              <td />
                              <td className="px-5 py-2.5 text-right tabular-nums text-xs" style={{ color: 'var(--brand-muted)' }}>
                                {p.horas.toFixed(2)}h
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-xs" style={{ color: 'var(--brand-muted)' }}>
                                {formatBRL(p.valor_hora)}
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-xs font-medium" style={{ color: 'var(--brand-primary)' }}>
                                {formatBRL(p.total_display)}
                              </td>
                              <td className="px-5 py-2.5 text-right" style={{ color: 'var(--brand-muted)' }}>—</td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-xs font-medium" style={{ color: 'var(--brand-muted)' }}>
                                {formatBRL(p.total_display)}
                              </td>
                              <td className="px-5 py-2.5">
                                {renderInvoiceToggle(p.projeto_id, !!p.invoiced, p.tipo_code === 'on_demand')}
                              </td>
                            </tr>
                          ))}
                        </>
                      )
                    })}
                  </Tbody>
                </Table>

                {/* Rodapé */}
                <div className="flex justify-end pt-4">
                  <div className="px-5 py-3 rounded-xl flex items-center gap-4 flex-wrap"
                    style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--brand-muted)' }}>
                      {totalHoras.toFixed(2)}h
                    </span>
                    {totalDesconto > 0 ? (
                      <>
                        <span className="text-sm tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                          Cheio <span className="font-semibold" style={{ color: 'var(--brand-text)' }}>{formatBRL(totalReceita)}</span>
                        </span>
                        <span className="text-sm tabular-nums" style={{ color: 'var(--danger)' }}>
                          Desconto −{formatBRL(totalDesconto)}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: 'var(--brand-muted)' }}>
                          Com desconto
                        </span>
                        <span className="text-base font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                          {formatBRL(totalLiquido)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-semibold" style={{ color: 'var(--brand-muted)' }}>Total Geral</span>
                        <span className="text-base font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                          {formatBRL(totalReceita)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Tab Apontamentos — todos os clientes (filtros: cliente + projeto) ── */}
          {tab === 'servicos' && (
            loadingApsGeral ? <SkeletonTable rows={8} cols={8} /> :
            apsFiltered.length === 0 ? (
              <EmptyState icon={FileText} title="Sem apontamentos"
                description="Nenhum apontamento On Demand aprovado no período e filtros selecionados." />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {apsFiltered.length} apontamento{apsFiltered.length === 1 ? '' : 's'}
                    {customerId ? '' : ' · todos os clientes'} em <span className="font-semibold">{fmtYMFull(toYM)}</span>
                  </p>
                  <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                    {apsHorasTotal.toFixed(2)}h
                  </div>
                </div>
                <Table>
                  <Thead>
                    <tr>
                      <Th {...apontamentosSort.thProps('data')}>Data</Th>
                      <Th {...apontamentosSort.thProps('cliente')}>Cliente</Th>
                      <Th {...apontamentosSort.thProps('projeto_codigo')}>Projeto</Th>
                      <Th {...apontamentosSort.thProps('colaborador')}>Colaborador</Th>
                      <Th {...apontamentosSort.thProps('solicitante')}>Solicitante</Th>
                      <Th {...apontamentosSort.thProps('ticket')}>Ticket</Th>
                      <Th {...apontamentosSort.thProps('titulo')}>Título</Th>
                      <Th right {...apontamentosSort.thProps('horas')}>Horas</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {apontamentosSort.sorted.map(a => (
                      <Tr key={a.id}>
                        <Td muted className="text-xs tabular-nums whitespace-nowrap">{fmtDate(a.data)}</Td>
                        <Td className="text-xs font-medium">{a.cliente}</Td>
                        <Td muted className="text-xs">{a.projeto_codigo}</Td>
                        <Td className="text-xs">{a.colaborador}</Td>
                        <Td muted className="text-xs">{a.solicitante ?? '—'}</Td>
                        <Td muted className="text-xs">{a.ticket ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${a.ticket}`} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:text-[var(--primary)]">#{a.ticket}</a> : '—'}</Td>
                        <Td muted className="text-xs">{a.titulo ?? '—'}</Td>
                        <Td right className="tabular-nums text-xs font-medium">{a.horas.toFixed(2)}h</Td>
                      </Tr>
                    ))}
                    <Tr>
                      <td colSpan={7} className="px-5 py-3 text-right text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>
                        TOTAL DE HORAS
                      </td>
                      <Td right className="font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                        {apsHorasTotal.toFixed(2)}h
                      </Td>
                    </Tr>
                  </Tbody>
                </Table>
              </>
            )
          )}

              {/* ── Tab Relatório Serviços — lista de clientes; Abrir → relatório tradicional ── */}
              {tab === 'relatorio' && (
                customerId ? renderDetail('servicos') : (
                  loadingGlobal ? <SkeletonTable rows={6} cols={5} /> :
                  clientesServicos.length === 0 ? (
                    <EmptyState icon={FileText} title="Sem serviços no período"
                      description="Nenhum cliente com apontamentos On Demand no mês selecionado." />
                  ) : (
                    <>
                      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                        Clientes com serviços em <span className="font-semibold">{fmtYMFull(toYM)}</span>.
                        Clique em “Abrir” para ver o relatório e imprimir / enviar por e-mail / exportar.
                      </p>
                      <Table>
                        <Thead>
                          <tr>
                            <Th {...servicosSort.thProps('nome')}>Cliente</Th>
                            <Th>Tipo de contrato</Th>
                            <Th right {...servicosSort.thProps('total_horas')}>Horas</Th>
                            <Th right {...servicosSort.thProps('total_receita')}>Total Serviços</Th>
                            <Th right>Desconto</Th>
                            <Th right>Com Desconto</Th>
                            <Th>Envio</Th>
                            <Th right>Ação</Th>
                          </tr>
                        </Thead>
                        <Tbody>
                          {servicosSort.sorted.map(c => {
                            const env = enviadoMap.get(c.customer_id)
                            return (
                              <Tr key={c.customer_id}>
                                <Td className="text-sm font-medium">{c.nome}</Td>
                                <Td>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(c.tipos).map(t => (
                                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                                        style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>{t}</span>
                                    ))}
                                  </div>
                                </Td>
                                <Td right muted className="tabular-nums text-xs">{c.total_horas.toFixed(2)}h</Td>
                                <Td right className="tabular-nums text-sm font-semibold">{formatBRL(c.total_receita)}</Td>
                                <Td right className="tabular-nums text-xs">
                                  {(() => {
                                    const d = descontoMap.get(c.customer_id)
                                    return d && d.valor > 0
                                      ? <span title={d.descricao ?? undefined} style={{ color: 'var(--danger)' }}>− {formatBRL(d.valor)}</span>
                                      : <span style={{ color: 'var(--text-light)' }}>—</span>
                                  })()}
                                </Td>
                                <Td right className="tabular-nums text-sm font-semibold">
                                  {formatBRL(Math.max(0, c.total_receita - (descontoMap.get(c.customer_id)?.valor ?? 0)))}
                                </Td>
                                <Td>{env?.envio_em
                                  ? <Badge variant="success"><Check size={10} className="mr-1" />{fmtDateTime(env.envio_em)}{env.envio_por ? ` · ${env.envio_por}` : ''}</Badge>
                                  : <span className="text-xs" style={{ color: 'var(--text-light)' }}>não enviado</span>}
                                </Td>
                                <Td right>
                                  <Button size="sm" variant="secondary" onClick={() => setCustomerId(c.customer_id)}>Abrir</Button>
                                </Td>
                              </Tr>
                            )
                          })}
                          <Tr>
                            <td className="px-5 py-3 text-right text-xs font-bold" style={{ color: 'var(--brand-muted)' }} colSpan={2}>TOTAL GERAL</td>
                            <Td right muted className="tabular-nums text-xs">{clientesServicos.reduce((s, c) => s + c.total_horas, 0).toFixed(2)}h</Td>
                            <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>{formatBRL(clientesServicos.reduce((s, c) => s + c.total_receita, 0))}</Td>
                            <Td right className="tabular-nums text-xs font-bold" style={{ color: 'var(--danger)' }}>
                              {(() => {
                                const tot = clientesServicos.reduce((s, c) => s + (descontoMap.get(c.customer_id)?.valor ?? 0), 0)
                                return tot > 0 ? <>− {formatBRL(tot)}</> : '—'
                              })()}
                            </Td>
                            <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>
                              {formatBRL(clientesServicos.reduce((s, c) => s + Math.max(0, c.total_receita - (descontoMap.get(c.customer_id)?.valor ?? 0)), 0))}
                            </Td>
                            <Td /><Td right />
                          </Tr>
                        </Tbody>
                      </Table>
                    </>
                  )
                )
              )}

              {/* ── Tab Despesas a Cobrar — lista de clientes; Abrir → relatório de despesa ── */}
              {tab === 'cobranca' && (
                customerId ? renderDetail('despesa') : (
                loadingCobranca ? <SkeletonTable rows={5} cols={4} /> :
                despCobranca.length === 0 ? (
                  <EmptyState icon={Receipt} title="Sem despesas a cobrar"
                    description="Nenhum cliente com despesa marcada para cobrança (e ainda não paga) no mês selecionado." />
                ) : (
                  <>
                    <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                      Clientes com despesas marcadas para cobrança e ainda não pagas em{' '}
                      <span className="font-semibold">{fmtYMFull(toYM)}</span>. Clique em “Abrir” para
                      revisar e enviar o relatório de despesas do cliente.
                    </p>
                    <Table>
                      <Thead>
                        <tr>
                          <Th {...cobrancaSort.thProps('nome')}>Cliente</Th>
                          <Th right {...cobrancaSort.thProps('qtd')}>Despesas</Th>
                          <Th right {...cobrancaSort.thProps('total')}>Total a cobrar</Th>
                          <Th>Envio</Th>
                          <Th right>Ação</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {cobrancaSort.sorted.map(r => {
                          const env = enviadoMap.get(r.customer_id)
                          return (
                            <Tr key={r.customer_id}>
                              <Td className="text-sm font-medium">{r.nome}</Td>
                              <Td right muted className="tabular-nums text-xs">{r.qtd}</Td>
                              <Td right className="tabular-nums text-sm font-semibold">{formatBRL(r.total)}</Td>
                              <Td>{env?.envio_em
                                ? <Badge variant="success"><Check size={10} className="mr-1" />{fmtDateTime(env.envio_em)}{env.envio_por ? ` · ${env.envio_por}` : ''}</Badge>
                                : <span className="text-xs" style={{ color: 'var(--text-light)' }}>não enviado</span>}
                              </Td>
                              <Td right>
                                <Button size="sm" variant="secondary" onClick={() => setCustomerId(r.customer_id)}>Abrir</Button>
                              </Td>
                            </Tr>
                          )
                        })}
                        <Tr>
                          <td className="px-5 py-3 text-right text-xs font-bold" style={{ color: 'var(--brand-muted)' }}>TOTAL GERAL</td>
                          <Td right muted className="tabular-nums text-xs">{despCobranca.reduce((s, r) => s + r.qtd, 0)}</Td>
                          <Td right className="tabular-nums font-bold" style={{ color: 'var(--brand-primary)' }}>{formatBRL(despCobranca.reduce((s, r) => s + r.total, 0))}</Td>
                          <Td /><Td right />
                        </Tr>
                      </Tbody>
                    </Table>
                  </>
                )
                )
              )}

        </div>
      </div>

      {/* Modal de pendências — apontamentos + despesas a cobrar não aprovados (respeita o filtro de período) */}
      {pendModalOpen && customerId && pendData && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={e => { if (e.target === e.currentTarget) setPendModalOpen(false) }}
        >
          <div
            className="ds-card flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />
                  Pendências — {clienteNome}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {fromYM === toYM ? fmtYM(toYM) : `${fmtYM(fromYM)} — ${fmtYM(toYM)}`}
                  {' · '}{pendData.total_pendencias} item(ns) · {formatBRL(pendData.valor_pendente)}
                </p>
              </div>
              <button
                onClick={() => setPendModalOpen(false)}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-6">
              {/* Apontamentos pendentes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                    Apontamentos ({pendData.qtd_timesheets})
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{formatBRL(pendData.valor_timesheets)}</span>
                </div>
                {pendData.timesheets.length === 0 ? (
                  <EmptyState title="Sem apontamentos pendentes" />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Data</Th>
                        <Th>Colaborador</Th>
                        <Th>Projeto</Th>
                        <Th>Coordenador</Th>
                        <Th>Executivo</Th>
                        <Th className="text-right">Horas</Th>
                        <Th className="text-right">Valor</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {pendData.timesheets.map(t => (
                        <Tr key={`ts-${t.id}`}>
                          <Td>{fmtDate(t.data)}</Td>
                          <Td>{t.colaborador}</Td>
                          <Td>
                            <span style={{ color: 'var(--text)' }}>{t.projeto}</span>
                            {t.ticket ? <span className="text-xs ml-1" style={{ color: 'var(--text-light)' }}>#{t.ticket}</span> : null}
                          </Td>
                          <Td>{t.coordenador ?? '—'}</Td>
                          <Td>{t.executivo ?? '—'}</Td>
                          <Td className="text-right tabular-nums">{(t.horas ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Td>
                          <Td className="text-right tabular-nums">{formatBRL(t.valor)}</Td>
                          <Td><Badge variant={t.status === 'adjustment_requested' ? 'danger' : 'warning'}>{t.status === 'adjustment_requested' ? 'Ajuste solicitado' : 'Pendente'}</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </div>

              {/* Despesas a cobrar pendentes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                    Despesas a cobrar ({pendData.qtd_despesas})
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{formatBRL(pendData.valor_despesas)}</span>
                </div>
                {pendData.despesas.length === 0 ? (
                  <EmptyState title="Sem despesas pendentes" />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Data</Th>
                        <Th>Colaborador</Th>
                        <Th>Projeto</Th>
                        <Th>Categoria</Th>
                        <Th className="text-right">Valor</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {pendData.despesas.map(d => (
                        <Tr key={`ex-${d.id}`}>
                          <Td>{fmtDate(d.data)}</Td>
                          <Td>{d.colaborador}</Td>
                          <Td>{d.projeto}</Td>
                          <Td>
                            <span style={{ color: 'var(--text)' }}>{d.categoria ?? '—'}</span>
                            {d.descricao ? <span className="block text-xs" style={{ color: 'var(--text-light)' }}>{d.descricao}</span> : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatBRL(d.valor)}</Td>
                          <Td><Badge variant={d.status === 'adjustment_requested' ? 'danger' : 'warning'}>{d.status === 'adjustment_requested' ? 'Ajuste solicitado' : 'Pendente'}</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Total pendente: {formatBRL(pendData.valor_pendente)}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setPendModalOpen(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de composição/preview do e-mail */}
      {composeOpen && customerId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onMouseDown={e => { composePressOnBackdrop.current = e.target === e.currentTarget }}
          onClick={e => { if (e.target === e.currentTarget && composePressOnBackdrop.current) closeCompose() }}
        >
          <div
            className="ds-card flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {tab === 'cobranca' ? 'Enviar despesas por e-mail' : 'Enviar fechamento por e-mail'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {clienteNome} · {fromYM === toYM ? fmtYM(toYM) : `${fmtYM(fromYM)} — ${fmtYM(toYM)}`}
                </p>
              </div>
              <button
                onClick={closeCompose}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
              {/* Destinatários */}
              <div className="rounded-lg p-4 flex flex-col gap-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                  Destinatários
                </span>

                {/* E-mails do cliente (cadastrados) — editável + salvar no cadastro */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    E-mails do cliente (cadastrados)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={cadastradoDraft}
                      onChange={e => setCadastradoDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCadastrado() } }}
                      placeholder="adicionar e-mail e pressionar Enter"
                      className="flex-1 rounded-lg px-3 py-2 text-sm ds-input focus:outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    <Button size="sm" variant="secondary" icon={Plus} onClick={addCadastrado}>
                      Adicionar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Save}
                      loading={savingCadastro}
                      onClick={saveCadastro}
                      disabled={cadastradoEmails.length === 0}
                      title="Salvar estes e-mails no cadastro do cliente"
                    >
                      Salvar no cadastro
                    </Button>
                  </div>
                  {/* chips verdes (e-mails cadastrados) com × p/ remover */}
                  {cadastradoEmails.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {cadastradoEmails.map(em => (
                        <span
                          key={em}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}
                        >
                          {em}
                          <button onClick={() => removeCadastrado(em)} title="Remover" style={{ color: 'var(--success)', lineHeight: 0 }}>
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {cadastroSaved && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>
                      Salvo no cadastro do cliente.
                    </p>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                    Adicione e-mails (Enter ou “Adicionar”). Clique em “Salvar no cadastro” para usá-los nos próximos fechamentos.
                  </p>
                </div>

                {/* E-mail avulso (só deste envio) — chips add/remove */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    E-mail avulso (só deste envio)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={avulsoDraft}
                      onChange={e => setAvulsoDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addAvulso() } }}
                      placeholder="adicionar e-mail e pressionar Enter"
                      className="flex-1 rounded-lg px-3 py-2 text-sm ds-input focus:outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    <Button size="sm" variant="secondary" icon={Plus} onClick={addAvulso}>
                      Adicionar
                    </Button>
                  </div>
                  {avulsoEmails.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {avulsoEmails.map(em => (
                        <span
                          key={em}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                        >
                          {em}
                          <button
                            onClick={() => removeAvulso(em)}
                            className="transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            title="Remover"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                    Não fica salvo — vale só para este envio.
                  </p>
                </div>
              </div>

              {/* Preview do e-mail (doc HTML claro — mantém o próprio fundo branco) */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>
                    Prévia do e-mail
                  </span>
                  {previewLoading && (
                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <RefreshCw size={12} className="animate-spin" /> atualizando…
                    </span>
                  )}
                </div>
                <iframe
                  srcDoc={emailPreviewHtml ?? ''}
                  title="Prévia do e-mail"
                  className="w-full"
                  style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, height: 360 }}
                />
              </div>

              {/* Mensagem editável (por envio — não persiste) */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>
                  Mensagem do e-mail
                </label>
                <textarea
                  value={emailMensagem}
                  onChange={e => setEmailMensagem(e.target.value)}
                  rows={5}
                  placeholder="Mensagem que aparece no corpo do e-mail…"
                  className="w-full rounded-lg px-3 py-2 text-sm resize-y ds-input focus:outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Anexos extras — o relatório (PDF) e a planilha (Excel) já vão automaticamente */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>
                  Anexos
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <Paperclip size={13} />
                    Adicionar arquivo
                  </button>
                  <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                    O relatório (PDF) e a planilha (Excel) do fechamento já vão anexados.
                  </span>
                </div>
                {anexos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {anexos.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      >
                        <FileText size={11} style={{ color: 'var(--text-muted)' }} />
                        {f.name}
                        <span style={{ color: 'var(--text-light)' }}>({(f.size / 1024).toFixed(0)} KB)</span>
                        <button onClick={() => removeAnexo(i)} style={{ color: 'var(--text-muted)' }} title="Remover">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {anexos.length > 0 && (
                  <p className="text-[11px] mt-1.5 font-medium" style={{ color: anexosExcedido ? 'var(--danger)' : 'var(--text-light)' }}>
                    {(anexosBytes / 1048576).toFixed(1)} MB de {(MAX_ANEXOS_BYTES / 1048576).toFixed(0)} MB
                    {anexosExcedido && ' — excede o limite; remova arquivos para poder enviar.'}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <Button variant="ghost" size="sm" onClick={closeCompose} disabled={sendingEmail}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Send}
                loading={sendingEmail}
                // Conta o draft de QUALQUER campo (cadastrado ou avulso), mesmo sem ter
                // virado chip — basta um e-mail válido digitado em um deles pra habilitar.
                disabled={anexosExcedido || (
                  cadastradoEmails.length === 0
                  && avulsoEmails.length === 0
                  && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(avulsoDraft.trim())
                  && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cadastradoDraft.trim())
                )}
                title={
                  anexosExcedido ? 'Anexos excedem o limite — remova arquivos para enviar.'
                  : (cadastradoEmails.length === 0 && avulsoEmails.length === 0 && !avulsoDraft.trim() && !cadastradoDraft.trim())
                    ? 'Cadastre ao menos um e-mail no cliente ou adicione um e-mail avulso para enviar.'
                    : undefined
                }
                onClick={sendReportEmail}
              >
                {sendingEmail ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
