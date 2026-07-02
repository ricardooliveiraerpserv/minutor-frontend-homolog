'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { previewText } from '@/lib/sanitize'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useTableSort } from '@/hooks/use-table-sort'
import { toast } from 'sonner'
import { NotasPjCell, type NotasPayload } from '@/components/fechamento/NotasPjCell'
import { Lock, RefreshCw, Handshake, Printer, Filter, Mail, FileSpreadsheet, Send, X, Save, Plus, Check } from 'lucide-react'
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
  envio_em?: string | null   // ISO do último envio por e-mail; null = não enviado
  envio_por?: string | null  // nome de quem enviou
  contract_type?: string | null // pj | clt | cooperado
  notas?: NotasPayload          // NFS-e + Nota de débito (só parceiro PJ)
  // Ajustes manuais do recebimento (desconto/adiantamento/adicional + descritivos).
  desconto?: number
  desconto_desc?: string | null
  adiantamento?: number
  adiantamento_desc?: string | null  // descrição das parcelas de adiantamento do mês
  adicional?: number
  adicional_desc?: string | null
  recebimento?: number          // total_a_pagar − desconto − adiantamento + adicional
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
  cliente?: string | null
  projeto: string
  valor: number
  status: string
  is_paid: boolean          // true = paga antecipadamente (fora do fechamento)
  paid_at?: string | null
  paid_by_name?: string | null
}

interface ApontamentoRow {
  id: number
  data: string
  user_id: number
  consultor: string
  cliente?: string
  projeto: string
  projeto_codigo: string
  tipo_contrato_code: string
  tipo_contrato_nome: string
  horas: number
  status: string
  ticket?: string
  titulo?: string
  solicitante?: string
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

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
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

  type ParceiroTab = 'consultores' | 'despesas' | 'apontamentos' | 'resumo' | 'relatorio'
  const { filters: flt, set: setFilter } = usePersistedFilters(
    'fechamento_parceiro',
    user?.id,
    {
      month:              now.getMonth() + 1 as number | null,
      year:               now.getFullYear() as number | null,
      partnerId:          null as number | null,
      tab:                'consultores' as ParceiroTab,
      filterConsultor:    '' as number | '',
      filterApStatus:     '',
      filterApConsultor:  '' as number | '',
    },
  )
  const { month, year, partnerId, tab, filterConsultor, filterApStatus, filterApConsultor } = flt
  const setMonth             = (v: number | null)      => setFilter('month', v)
  const setYear              = (v: number | null)      => setFilter('year', v)
  const setPartnerId         = (v: number | null)      => setFilter('partnerId', v)
  const setTab               = (v: ParceiroTab)        => setFilter('tab', v)
  const setFilterConsultor   = (v: number | '')        => setFilter('filterConsultor', v)
  const setFilterApStatus    = (v: string)             => setFilter('filterApStatus', v)
  const setFilterApConsultor = (v: number | '')        => setFilter('filterApConsultor', v)

  // Sem data selecionada, cai na apuração do MÊS ATUAL (não fica em branco).
  const effMonth = month || (now.getMonth() + 1)
  const effYear  = year  || now.getFullYear()
  const yearMonth = toYearMonth(effMonth, effYear)

  const [parceiros, setParceiros]     = useState<ParceiroStatus[]>([])
  const [status, setStatus]           = useState<ParceiroStatus | null>(null)

  const [consultores, setConsultores] = useState<ConsultorRow[]>([])
  const [despesas, setDespesas]       = useState<DespesaRow[]>([])

  // ── Ajustes do recebimento (desconto/adiantamento/adicional) — admin ──────────
  const [ajuste, setAjuste] = useState({
    desconto: '', desconto_desc: '', adiantamento: '', adicional: '', adicional_desc: '',
  })
  const [savingAjuste, setSavingAjuste] = useState(false)
  const [reportMode, setReportMode]   = useState<'servicos' | 'despesa' | 'ambos'>('ambos')
  // Relatório (preview): vem do MESMO Blade do servidor que gera o PDF/e-mail → tela = e-mail.
  const [reportHtmlSrv, setReportHtmlSrv] = useState<string | null>(null)
  const [loadingReport,  setLoadingReport]  = useState(false)
  useEffect(() => {
    if (tab !== 'relatorio' || !partnerId || !yearMonth) return
    setLoadingReport(true)
    api.get<{ html: string }>(`/fechamento-parceiro/${partnerId}/${yearMonth}/report-html?mode=${reportMode}`)
      .then(r => setReportHtmlSrv(r.html ?? null))
      .catch(() => setReportHtmlSrv(null))
      .finally(() => setLoadingReport(false))
  }, [tab, partnerId, yearMonth, reportMode])
  const [apontamentos, setApontamentos] = useState<ApontamentoRow[]>([])

  const [loadingConsult, setLoadingConsult]   = useState(false)
  const [loadingDesp,    setLoadingDesp]      = useState(false)
  const [loadingAp,      setLoadingAp]        = useState(false)
  const [consultorView, setConsultorView] = useState<'resumo' | 'tipo'>('resumo')

  // ── Relatório (preview + ações) / envio de e-mail ──────────────────────────
  const canSendEmail = (user as any)?.type === 'admin' || (user as any)?.type === 'administrativo'
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  const reportIframeRef = useRef<HTMLIFrameElement>(null)

  // Dialog de composição/preview do e-mail.
  const [composeOpen, setComposeOpen] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [limpandoEnvio, setLimpandoEnvio] = useState(false)
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null)
  const [emailMensagem, setEmailMensagem] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  // Destinatários
  const [adminEmails, setAdminEmails] = useState<string[]>([])          // fixos (parceiro admin) — sempre recebem
  const [cadastradoInput, setCadastradoInput] = useState('')            // e-mails do parceiro (cadastrados), separados por vírgula
  const [savingCadastro, setSavingCadastro] = useState(false)
  const [cadastroSaved, setCadastroSaved] = useState(false)
  const [avulsoEmails, setAvulsoEmails] = useState<string[]>([])        // e-mails avulsos (só deste envio)
  const [avulsoDraft, setAvulsoDraft] = useState('')
  // true só no primeiro fetch (sem mensagem) — usado pra semear o textarea com o padrão.
  const previewSeededRef = useRef(false)
  // True só quando o press (mousedown) começou no próprio backdrop do compose.
  const composePressOnBackdrop = useRef(false)

  // ─── Carregamento de dados ────────────────────────────────────────────────

  const loadParceiros = useCallback(() => {
    // A lista de parceiros NÃO depende do mês — o BE trata year_month vazio
    // (retorna os parceiros ativos com status 'sem_registro'). Sem isso, a
    // dropdown ficava vazia quando month/year não estavam selecionados.
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

  // Seed do formulário de ajustes a partir do parceiro selecionado.
  useEffect(() => {
    setAjuste({
      desconto:       status?.desconto ? String(status.desconto) : '',
      desconto_desc:  status?.desconto_desc ?? '',
      adiantamento:   status?.adiantamento ? String(status.adiantamento) : '',
      adicional:      status?.adicional ? String(status.adicional) : '',
      adicional_desc: status?.adicional_desc ?? '',
    })
  }, [status?.partner_id])

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
    if (tab === 'consultores')  { loadConsultores(); if (!apontamentos.length) loadApontamentos() }
    if (tab === 'despesas')     loadDespesas()
    if (tab === 'apontamentos') loadApontamentos()
    if (tab === 'resumo' || tab === 'relatorio') {
      if (!consultores.length)  loadConsultores()
      if (!despesas.length)     loadDespesas()
      if (!apontamentos.length) loadApontamentos()
    }
  }, [tab, partnerId, yearMonth])

  useEffect(() => {
    if (partnerId && yearMonth) loadConsultores()
  }, [partnerId])

  // ─── Ações ────────────────────────────────────────────────────────────────

  const openPrintWindow = (html: string) => {
    const win = window.open('', '_blank', 'width=960,height=780')
    if (!win) { toast.error('Popup bloqueado — permita popups para imprimir.'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 300)
  }

  const printStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 28px 32px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
    .page-header-left img { width: 130px; }
    .page-header-right { text-align: right; }
    .page-header-right h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 2px; }
    .page-header-right .subtitle { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
    .page-header-right .meta { font-size: 12px; color: #111; }
    .page-header-right .meta b { font-weight: 700; }
    .section { margin-bottom: 24px; }
    .section-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .section-title { font-size: 14px; font-weight: 700; color: #111; }
    .section-code { font-size: 11px; font-weight: 400; color: #6b7280; margin-left: 6px; }
    .section-rate { font-size: 11px; color: #6b7280; }
    .section-rate b { color: #111; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #f3f4f6; padding: 7px 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: #6b7280; text-align: left; border-bottom: 1px solid #e5e7eb; }
    tbody td { padding: 7px 10px; font-size: 11px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    tbody tr.main-row td { padding: 8px 8px; border-bottom: 1px solid #ece9f5; vertical-align: middle; }
    tbody tr.main-row:nth-child(even) td { background: #f7f6fc; }
    tbody tr.main-row:hover td { background: #efeafc; }
    .right { text-align: right; }
    .section-footer { background: #f5f3ff; padding: 8px 12px; text-align: right; font-size: 12px; color: #7c3aed; font-weight: 600; border-radius: 0 0 6px 6px; margin-top: -1px; }
    .divider { border: none; border-top: 1px dashed #d1d5db; margin: 20px 0; }
    .total-box { background: #7c3aed; border-radius: 8px; padding: 16px 24px; display: flex; justify-content: space-between; margin-top: 24px; color: #fff; }
    .total-box-block { }
    .total-box-label { font-size: 11px; opacity: 0.85; margin-bottom: 4px; }
    .total-box-value { font-size: 26px; font-weight: 700; }
    .page-footer { margin-top: 32px; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print {
      body { padding: 16px 20px; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  `

  // Monta o HTML completo do relatório de serviços (usado tanto no preview em
  // iframe quanto na janela de impressão). Retorna null se faltam dados.
  const buildServicosHtml = (mode: 'servicos' | 'despesa' | 'ambos' = 'ambos'): string | null => {
    if (!status || !apontamentos.length) return null

    const logoUrl = window.location.origin + '/logo.png'
    const competencia = yearMonth ? fmtYearMonth(yearMonth).replace('/', ' / ') : '—'
    const tipoPrec = isFixed ? `Precificação Fixa — Taxa: ${formatBRL(status.hourly_rate)}/h` : 'Precificação Variável'

    // Agrupa apontamentos: um bloco por CONSULTOR (o projeto vai como coluna na linha,
    // sem separar/totalizar por projeto — evita o relatório ficar grande demais).
    const consultorMapPrint = new Map<number, { consultor: string; taxa: number; horas: number; total: number; rows: ApontamentoRow[] }>()
    apontamentos.forEach(a => {
      if (!consultorMapPrint.has(a.user_id)) {
        const c = consultores.find(c => c.user_id === a.user_id)
        consultorMapPrint.set(a.user_id, { consultor: a.consultor, taxa: c?.valor_hora ?? 0, horas: 0, total: 0, rows: [] })
      }
      const entry = consultorMapPrint.get(a.user_id)!
      entry.rows.push(a)
      entry.horas += a.horas
      entry.total += a.horas * entry.taxa
    })

    // Resumo por consultor (horas + valor), agregado entre todos os tipos de contrato
    const resumoMap = new Map<number, { consultor: string; taxa: number; horas: number; total: number }>()
    apontamentos.forEach(a => {
      if (!resumoMap.has(a.user_id)) {
        const c = consultores.find(c => c.user_id === a.user_id)
        resumoMap.set(a.user_id, { consultor: a.consultor, taxa: c?.valor_hora ?? 0, horas: 0, total: 0 })
      }
      const e = resumoMap.get(a.user_id)!
      e.horas += a.horas
      e.total += a.horas * e.taxa
    })
    const resumoHtml = `
      <div class="section" style="margin-top:8px">
        <div style="font-size:14px;font-weight:700;color:#111;border-bottom:2px solid #7c3aed;padding-bottom:6px;margin-bottom:8px">Resumo por consultor</div>
        <table>
          <thead><tr><th>Consultor</th><th class="right">Horas</th><th class="right">Valor</th></tr></thead>
          <tbody>
            ${Array.from(resumoMap.values()).map(c => `
              <tr class="main-row"><td>${c.consultor}</td><td class="right">${c.horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</td><td class="right">${formatBRL(Math.round(c.total * 100) / 100)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`

    const sectionsHtml = Array.from(consultorMapPrint.values()).map(({ consultor, taxa, horas, total, rows }) => {
      const rowsHtml = rows.map(r => `
        <tr class="main-row">
          <td>${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
          <td>${r.cliente ?? '—'}</td>
          <td>${r.projeto}</td>
          <td>${r.solicitante ?? '—'}</td>
          <td>${r.ticket ?? '0'}</td>
          <td>${r.titulo ?? '—'}</td>
          <td class="right">${r.horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</td>
        </tr>`).join('')
      return `
        <div class="section" style="margin-bottom:20px">
          <div class="section-header" style="border-bottom:2px solid #7c3aed;padding-bottom:6px;margin-bottom:10px">
            <div><span class="section-title" style="font-size:15px;color:#111">${consultor}</span> <span style="font-size:12px;color:#7c3aed;font-weight:700">· ${horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</span></div>
            <div class="section-rate">Valor/hora: <b>${formatBRL(taxa)}/h</b></div>
          </div>
          <table>
            <thead><tr><th>Data</th><th>Cliente</th><th>Projeto</th><th>Solicitante</th><th>Ticket</th><th>Título</th><th class="right">Horas</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="section-footer">${horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h × ${formatBRL(taxa)}/h = <b>${formatBRL(Math.round(total * 100) / 100)}</b></div>
        </div>
        <hr class="divider"/>`
    }).join('')

    const saldoDesp = despesas.filter(d => !d.is_paid).reduce((s, d) => s + d.valor, 0)
    const despHtml = despesas.length === 0 ? '' : `
      <div class="section" style="margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0891b2;padding-bottom:6px;margin-bottom:14px">
          <span style="font-size:16px;font-weight:700;color:#0e7490">Despesas reembolsadas no fechamento</span>
          <span style="font-size:11px;color:#6b7280">Saldo: <b style="color:#0e7490">${formatBRL(saldoDesp)}</b></span>
        </div>
        <table>
          <thead><tr><th>Data</th><th>Colaborador</th><th>Categoria</th><th>Cliente</th><th>Projeto</th><th>Pagamento</th><th class="right">Valor</th></tr></thead>
          <tbody>${despesas.map(d => `
            <tr class="main-row">
              <td>${new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td>${d.colaborador}</td>
              <td>${d.categoria}</td>
              <td>${d.cliente ?? '—'}</td>
              <td>${d.projeto}</td>
              <td>${d.is_paid ? (d.paid_at ? 'Pago em ' + new Date(d.paid_at).toLocaleDateString('pt-BR') : 'Pago') : '<span style="color:#0e7490">No fechamento</span>'}</td>
              <td class="right">${formatBRL(d.valor)}</td>
            </tr>`).join('')}
            <tr><td colspan="6" class="right" style="font-weight:bold">Saldo a pagar no fechamento</td><td class="right" style="font-weight:bold;color:#0e7490">${formatBRL(saldoDesp)}</td></tr>
          </tbody>
        </table>
      </div>
      <hr class="divider"/>`

    // Ajustes do recebimento (desconto/adiantamento/adicional). Só exibe quando há algum.
    const ajDesconto     = Number(status.desconto ?? 0)     || 0
    const ajAdiantamento = Number(status.adiantamento ?? 0) || 0
    const ajAdicional    = Number(status.adicional ?? 0)    || 0
    // No relatório de Despesas só entram as despesas — sem ajustes nem recebimento.
    const temAjustes     = mode !== 'despesa' && (ajDesconto !== 0 || ajAdiantamento !== 0 || ajAdicional !== 0)
    const baseAjuste     = mode === 'despesa' ? saldoDesp : (mode === 'servicos' ? totalServicos : totalServicos + saldoDesp)
    const recebimentoRep = baseAjuste - ajDesconto - ajAdiantamento + ajAdicional
    const ajustesHtml = !temAjustes ? '' : `
      <div class="section" style="margin-bottom:24px">
        <div style="font-size:14px;font-weight:700;color:#111;border-bottom:2px solid #7c3aed;padding-bottom:6px;margin-bottom:8px">Ajustes do recebimento</div>
        <table>
          <thead><tr><th>Ajuste</th><th>Descritivo</th><th class="right">Valor</th></tr></thead>
          <tbody>
            <tr class="main-row"><td>Serviço</td><td>—</td><td class="right">${formatBRL(totalServicos)}</td></tr>
            ${mode !== 'servicos' && saldoDesp > 0 ? `<tr class="main-row"><td>Despesa</td><td>—</td><td class="right" style="color:#16a34a">+ ${formatBRL(saldoDesp)}</td></tr>` : ''}
            ${ajDesconto !== 0 ? `<tr class="main-row"><td>Desconto</td><td>${status.desconto_desc ?? '—'}</td><td class="right">− ${formatBRL(ajDesconto)}</td></tr>` : ''}
            ${ajAdiantamento !== 0 ? `<tr class="main-row"><td>Adiantamento</td><td>${status.adiantamento_desc ?? '—'}</td><td class="right">− ${formatBRL(ajAdiantamento)}</td></tr>` : ''}
            ${ajAdicional !== 0 ? `<tr class="main-row"><td>Adicional</td><td>${status.adicional_desc ?? '—'}</td><td class="right">+ ${formatBRL(ajAdicional)}</td></tr>` : ''}
            <tr><td colspan="2" class="right" style="font-weight:bold">Recebimento</td><td class="right" style="font-weight:bold;color:#7c3aed">${formatBRL(Math.round(recebimentoRep * 100) / 100)}</td></tr>
          </tbody>
        </table>
      </div>
      <hr class="divider"/>`

    const isServ = mode !== 'despesa'
    const isDesp = mode !== 'servicos'
    const h1Label = mode === 'despesa' ? 'Relatório de Despesas' : mode === 'servicos' ? 'Relatório de Serviços' : 'Relatório de Fechamento'
    const totalBoxHtml = mode === 'despesa'
      ? `<div class="total-box" style="background:#0e7490;border-color:#0891b2;"><div class="total-box-block"><div class="total-box-label">Saldo a pagar no fechamento</div><div class="total-box-value">${formatBRL(saldoDesp)}</div></div></div>`
      : mode === 'servicos'
        ? `<div class="total-box"><div class="total-box-block"><div class="total-box-label">Total de Horas</div><div class="total-box-value">${totalHoras.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</div></div><div class="total-box-block" style="text-align:right"><div class="total-box-label">Total Serviços</div><div class="total-box-value">${formatBRL(totalServicos)}</div></div></div>`
        : `<div class="total-box"><div class="total-box-block"><div class="total-box-label">Total de Horas</div><div class="total-box-value">${totalHoras.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</div></div><div class="total-box-block" style="text-align:center"><div class="total-box-label">Total Serviços</div><div class="total-box-value">${formatBRL(totalServicos)}</div></div>${saldoDesp > 0 ? `<div class="total-box-block" style="text-align:center"><div class="total-box-label">Despesas</div><div class="total-box-value">${formatBRL(saldoDesp)}</div></div>` : ''}<div class="total-box-block" style="text-align:right"><div class="total-box-label">Total a Pagar</div><div class="total-box-value">${formatBRL(totalServicos + saldoDesp)}</div></div></div>`

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<title>${h1Label} — ${status.nome} — ${competencia}</title>
<style>${printStyles}</style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-left"><img src="${logoUrl}" alt="Logo"/></div>
    <div class="page-header-right">
      <h1>${h1Label}</h1>
      <div class="subtitle">${tipoPrec}</div>
      <div class="meta"><b>Parceiro:</b> ${status.nome}</div>
      <div class="meta"><b>Competência:</b> ${competencia}</div>
    </div>
  </div>

  ${isServ ? sectionsHtml : ''}

  ${isServ ? resumoHtml : ''}

  ${isDesp ? despHtml : ''}

  ${ajustesHtml}

  ${totalBoxHtml}
  ${isServ && isFixed ? '<p style="margin-top:8px;font-size:10px;color:#9ca3af">* Taxa fixa aplicada a todos os consultores.</p>' : ''}

  <div class="page-footer">
    <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
    <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
  </div>
</body>
</html>`

    return html
  }

  const handlePrint = () => {
    const html = buildServicosHtml()
    if (!html) {
      toast.error('Carregue os apontamentos antes de imprimir.')
      return
    }
    openPrintWindow(html)
  }

  const handlePrintDespesas = () => {
    if (!status) return
    if (!despesas.length) { toast.error('Nenhuma despesa para imprimir.'); return }

    const logoUrl = window.location.origin + '/logo.png'
    const competencia = yearMonth ? fmtYearMonth(yearMonth).replace('/', ' / ') : '—'

    const porConsultor = despesas.reduce<Record<string, DespesaRow[]>>((acc, d) => {
      if (!acc[d.colaborador]) acc[d.colaborador] = []
      acc[d.colaborador].push(d)
      return acc
    }, {})

    const sectionsHtml = Object.entries(porConsultor).map(([consultor, rows]) => {
      const sub = rows.reduce((s, r) => s + r.valor, 0)
      const rowsHtml = rows.map(r => `
        <tr>
          <td>${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
          <td>${r.descricao}</td>
          <td>${r.categoria}</td>
          <td>${r.cliente ?? '—'}</td>
          <td>${r.projeto}</td>
          <td>${r.is_paid ? (r.paid_at ? 'Pago em ' + new Date(r.paid_at).toLocaleDateString('pt-BR') : 'Pago') : '<span style="color:#0e7490">No fechamento</span>'}</td>
          <td class="right" style="color:#0e7490;font-weight:600">${formatBRL(r.valor)}</td>
        </tr>`).join('')

      return `
        <div class="section">
          <div class="section-header" style="background:#cffafe;border-left:3px solid #0891b2;padding:6px 10px;border-radius:0 4px 4px 0;">
            <div><span class="section-title" style="color:#0e7490">${consultor}</span></div>
            <div class="section-rate" style="color:#0e7490">Subtotal: <b>${formatBRL(sub)}</b></div>
          </div>
          <table>
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Cliente</th><th>Projeto</th><th>Pagamento</th><th class="right">Valor</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <hr class="divider"/>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<title>Relatório de Despesas — ${status.nome} — ${competencia}</title>
<style>${printStyles}</style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-left"><img src="${logoUrl}" alt="Logo"/></div>
    <div class="page-header-right">
      <h1>Relatório de Despesas</h1>
      <div class="subtitle">Fechamento — Parceiros</div>
      <div class="meta"><b>Parceiro:</b> ${status.nome}</div>
      <div class="meta"><b>Competência:</b> ${competencia}</div>
    </div>
  </div>

  ${sectionsHtml}

  <div class="total-box" style="background:#0e7490;border-color:#0891b2;">
    <div class="total-box-block">
      <div class="total-box-label">Saldo a pagar no fechamento</div>
      <div class="total-box-value">${formatBRL(totalDespesas)}</div>
    </div>
  </div>

  <div class="page-footer">
    <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
    <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
  </div>
</body>
</html>`

    openPrintWindow(html)
  }

  // ─── Excel / E-mail ─────────────────────────────────────────────────────────

  async function downloadExcel() {
    if (!partnerId || !yearMonth) return
    setDownloadingExcel(true)
    try {
      // O `api` helper sempre faz res.json(); pra blob usamos fetch direto no
      // mesmo proxy /api/v1 (o middleware injeta o Authorization via cookie).
      const res = await fetch(
        `/api/v1/fechamento-parceiro/${partnerId}/${yearMonth}/excel?mode=${reportMode}`,
        { credentials: 'same-origin', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const fallback = `Fechamento_${yearMonth}_${status?.nome ?? 'parceiro'}.xlsx`
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
  // padrão + `mensagem_padrao` (usado pra semear o textarea) + destinatários.
  const fetchEmailPreview = useCallback(async (mensagem?: string) => {
    if (!partnerId || !yearMonth) return
    setPreviewLoading(true)
    try {
      const res = await api.post<{
        html: string
        mensagem_padrao: string
        parceiro_admin_emails: string[]
        fechamento_email: string | null
      }>(
        `/fechamento-parceiro/${partnerId}/${yearMonth}/email-preview`,
        mensagem !== undefined ? { mensagem, mode: reportMode } : { mode: reportMode },
      )
      setEmailPreviewHtml(res.html)
      if (!previewSeededRef.current) {
        previewSeededRef.current = true
        setEmailMensagem(res.mensagem_padrao ?? '')
        setAdminEmails(res.parceiro_admin_emails ?? [])
        setCadastradoInput(res.fechamento_email ?? '')
      }
    } catch (err: unknown) {
      toast.error(`Erro ao gerar a prévia do e-mail: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setPreviewLoading(false)
    }
  }, [partnerId, yearMonth])

  function openCompose() {
    if (!partnerId || !yearMonth) return
    previewSeededRef.current = false
    setEmailMensagem('')
    setEmailPreviewHtml(null)
    setAdminEmails([])
    setCadastradoInput('')
    setAvulsoEmails([])
    setAvulsoDraft('')
    setCadastroSaved(false)
    setComposeOpen(true)
    void fetchEmailPreview() // primeiro fetch: sem mensagem → html + mensagem_padrao + destinatários
  }

  function closeCompose() {
    setComposeOpen(false)
    setEmailPreviewHtml(null)
    setEmailMensagem('')
    setAdminEmails([])
    setCadastradoInput('')
    setAvulsoEmails([])
    setAvulsoDraft('')
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

  // Salva os e-mails cadastrados no parceiro (persiste no cadastro).
  async function saveCadastro() {
    if (!partnerId) return
    setSavingCadastro(true)
    setCadastroSaved(false)
    try {
      const res = await api.post<{ success: boolean; fechamento_email: string }>(
        `/fechamento-parceiro/${partnerId}/fechamento-email`,
        { fechamento_email: cadastradoInput },
      )
      setCadastradoInput(res.fechamento_email ?? cadastradoInput)
      setCadastroSaved(true)
      toast.success('E-mails salvos no cadastro do parceiro.')
    } catch (err: unknown) {
      toast.error(`Erro ao salvar os e-mails: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSavingCadastro(false)
    }
  }

  async function sendReportEmail() {
    if (!partnerId || !yearMonth) return
    // Destinatários = cadastrados (split por vírgula) + avulsos, trim + dedupe.
    const cadastrados = cadastradoInput.split(',').map(e => e.trim()).filter(Boolean)
    const emails = Array.from(new Set([...cadastrados, ...avulsoEmails]))
    setSendingEmail(true)
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/fechamento-parceiro/${partnerId}/${yearMonth}/enviar-email`,
        { mensagem: emailMensagem, emails, mode: reportMode },
      )
      toast.success(res?.message ?? 'Fechamento enviado por e-mail.')
      patchEnvio(partnerId, new Date().toISOString(), (user as any)?.name ?? null)
      closeCompose()
    } catch (err: unknown) {
      toast.error(`Erro ao enviar o fechamento: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSendingEmail(false)
    }
  }

  // Atualiza o status de envio do parceiro (otimista, sem refetch) — em `status` e na lista.
  function patchEnvio(id: number | null, envio_em: string | null, envio_por: string | null) {
    if (!id) return
    setStatus(prev => (prev && prev.partner_id === id ? { ...prev, envio_em, envio_por } : prev))
    setParceiros(prev => prev.map(p => (p.partner_id === id ? { ...p, envio_em, envio_por } : p)))
  }

  // Atualiza as notas fiscais (NFS-e/Nota de débito) do parceiro (otimista) — em `status` e na lista.
  const canDecideNotas = (user as any)?.type === 'admin' || (user as any)?.type === 'administrativo'
  function patchNotas(id: number, notas: NotasPayload) {
    setStatus(prev => (prev && prev.partner_id === id ? { ...prev, notas } : prev))
    setParceiros(prev => prev.map(p => (p.partner_id === id ? { ...p, notas } : p)))
  }

  async function limparEnvio() {
    if (!partnerId || !yearMonth) return
    setLimpandoEnvio(true)
    try {
      await api.post(`/fechamento-parceiro/${partnerId}/${yearMonth}/limpar-envio`, {})
      patchEnvio(partnerId, null, null)
      toast.success('Status de envio limpo.')
    } catch (err: unknown) {
      toast.error(`Erro ao limpar: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setLimpandoEnvio(false)
    }
  }

  // Salva (upsert) os ajustes do recebimento do parceiro no mês. Otimista: atualiza
  // status + parceiros com o ajuste salvo + recebimento recalculado pela API.
  async function salvarAjuste() {
    if (!partnerId || !yearMonth) return
    setSavingAjuste(true)
    try {
      const payload = {
        desconto:       ajuste.desconto === '' ? 0 : Number(ajuste.desconto),
        desconto_desc:  ajuste.desconto_desc || null,
        adiantamento:   ajuste.adiantamento === '' ? 0 : Number(ajuste.adiantamento),
        adicional:      ajuste.adicional === '' ? 0 : Number(ajuste.adicional),
        adicional_desc: ajuste.adicional_desc || null,
      }
      const res = await api.post<{ recebimento: number; total_a_pagar: number }>(
        `/fechamento-parceiro/${partnerId}/${yearMonth}/ajustes`, payload,
      )
      const patch: Partial<ParceiroStatus> = {
        desconto: payload.desconto,
        desconto_desc: payload.desconto_desc,
        adiantamento: payload.adiantamento,
        adicional: payload.adicional,
        adicional_desc: payload.adicional_desc,
        recebimento: res?.recebimento,
      }
      setStatus(prev => (prev && prev.partner_id === partnerId ? { ...prev, ...patch } : prev))
      setParceiros(prev => prev.map(p => (p.partner_id === partnerId ? { ...p, ...patch } : p)))
      toast.success('Ajustes salvos.')
    } catch (err: unknown) {
      toast.error(`Erro ao salvar ajustes: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSavingAjuste(false)
    }
  }

  // ─── Derivados ────────────────────────────────────────────────────────────

  const isFixed    = status?.pricing_type === 'fixed'
  const parceiroOptions = parceiros.map(p => ({ id: p.partner_id, name: p.nome }))
  const consultorOptions = consultores.map(c => ({ id: c.user_id, name: c.nome }))

  const filteredConsultores = filterConsultor
    ? consultores.filter(c => c.user_id === filterConsultor)
    : consultores

  const filteredApontamentos = apontamentos
    .filter(a => !filterApConsultor || a.user_id === filterApConsultor)
    .filter(a => !filterApStatus    || a.status === filterApStatus)

  // Ordenação client-side (clique no cabeçalho) das listas de despesas e apontamentos.
  const despesasSort = useTableSort(despesas)
  const apontSort    = useTableSort(filteredApontamentos)

  const totalHoras    = consultores.reduce((s, r) => s + r.horas, 0)
  const totalServicos = consultores.reduce((s, r) => s + r.total, 0)
  // Antecipadas (is_paid) já foram pagas fora do fechamento → fora do total a pagar.
  const totalDespesas    = despesas.filter(r => !r.is_paid).reduce((s, r) => s + r.valor, 0)
  const totalDespesasAnt = despesas.filter(r => r.is_paid).reduce((s, r) => s + r.valor, 0)
  const totalAPagar      = totalServicos + totalDespesas

  // Recebimento ao vivo = total a pagar − desconto − adiantamento + adicional.
  // Usa o total ao vivo quando os consultores já carregaram; senão o do payload (status).
  const ajusteDesconto     = ajuste.desconto === ''     ? 0 : Number(ajuste.desconto)     || 0
  const ajusteAdiantamento = ajuste.adiantamento === '' ? 0 : Number(ajuste.adiantamento) || 0
  const ajusteAdicional    = ajuste.adicional === ''    ? 0 : Number(ajuste.adicional)    || 0
  const baseRecebimento    = consultores.length ? totalAPagar : (status?.total_a_pagar ?? 0)
  const recebimentoLive    = baseRecebimento - ajusteDesconto - ajusteAdiantamento + ajusteAdicional

  const TABS = [
    { key: 'consultores',  label: 'Consultores' },
    { key: 'despesas',     label: 'Despesas' },
    { key: 'apontamentos', label: 'Apontamentos' },
    { key: 'resumo',       label: 'Resumo' },
    { key: 'relatorio',    label: 'Relatório' },
  ] as const

  return (
    <AppLayout title="Fechamento — Parceiros">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Header */}
        <div className="px-4 md:px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <Handshake size={20} style={{ color: 'var(--primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Fechamento — Parceiros
            </h1>
            {yearMonth && (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {fmtYearMonth(yearMonth)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <SearchSelect
                value={partnerId ?? ''}
                onChange={v => setPartnerId(v ? Number(v) : null)}
                options={parceiroOptions}
                placeholder="Selecionar parceiro..."
              />
              <MonthYearPicker
                month={effMonth}
                year={effYear}
                onChange={(m, y) => { setMonth(m || null); setYear(y || null) }}
              />
              {tab === 'relatorio' && partnerId && (
                <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {([['servicos', 'Serviços'], ['despesa', 'Despesas'], ['ambos', 'Ambos']] as const).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => setReportMode(m)}
                      className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                      style={{
                        background: reportMode === m ? 'var(--primary)' : 'transparent',
                        color: reportMode === m ? 'var(--primary-fg)' : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {status && (
            <div className="mt-3 flex items-center gap-3">
              <span
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{
                  background: isFixed ? 'var(--warning-bg)' : 'var(--primary-soft)',
                  color: isFixed ? 'var(--warning)' : 'var(--primary)',
                }}
              >
                {isFixed ? 'PRECIFICAÇÃO FIXA' : 'PRECIFICAÇÃO VARIÁVEL'}
              </span>
              {isFixed && status.hourly_rate > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Taxa única: <b>{formatBRL(status.hourly_rate)}/h</b>
                </span>
              )}
            </div>
          )}

        </div>

        {partnerId && status?.contract_type === 'pj' && (
          <div className="mx-6 mt-4 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Notas Fiscais (PJ)</div>
            <NotasPjCell
              type="parceiro"
              id={partnerId}
              yearMonth={yearMonth}
              notas={status?.notas ?? null}
              canDecide={canDecideNotas}
              canUpload={canDecideNotas}
              expectedValue={status?.recebimento ?? null}
              selfService={false}
              onChanged={(n) => patchNotas(partnerId, n)}
            />
          </div>
        )}

        {partnerId && (
          <div className="mx-6 mt-4 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Ajustes do recebimento</div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Recebimento</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{formatBRL(recebimentoLive)}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Desconto + descritivo */}
              <div>
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Desconto</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  disabled={!canDecideNotas}
                  value={ajuste.desconto}
                  onChange={(e) => setAjuste(a => ({ ...a, desconto: e.target.value }))}
                  onBlur={salvarAjuste}
                  placeholder="0,00"
                  className="w-full px-2 py-1.5 rounded text-sm tabular-nums"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <input
                  type="text"
                  disabled={!canDecideNotas}
                  value={ajuste.desconto_desc}
                  onChange={(e) => setAjuste(a => ({ ...a, desconto_desc: e.target.value }))}
                  onBlur={salvarAjuste}
                  placeholder="Descritivo (opcional)"
                  className="w-full mt-1 px-2 py-1 rounded text-xs"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              {/* Adiantamento (só valor) */}
              <div>
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Adiantamento</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  disabled={!canDecideNotas}
                  value={ajuste.adiantamento}
                  onChange={(e) => setAjuste(a => ({ ...a, adiantamento: e.target.value }))}
                  onBlur={salvarAjuste}
                  placeholder="0,00"
                  className="w-full px-2 py-1.5 rounded text-sm tabular-nums"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              {/* Adicional + descritivo */}
              <div>
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Adicional</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  disabled={!canDecideNotas}
                  value={ajuste.adicional}
                  onChange={(e) => setAjuste(a => ({ ...a, adicional: e.target.value }))}
                  onBlur={salvarAjuste}
                  placeholder="0,00"
                  className="w-full px-2 py-1.5 rounded text-sm tabular-nums"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <input
                  type="text"
                  disabled={!canDecideNotas}
                  value={ajuste.adicional_desc}
                  onChange={(e) => setAjuste(a => ({ ...a, adicional_desc: e.target.value }))}
                  onBlur={salvarAjuste}
                  placeholder="Descritivo (opcional)"
                  className="w-full mt-1 px-2 py-1 rounded text-xs"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            </div>
            {(() => {
              // Legenda do recebimento, com serviço e despesa SEPARADOS (despesa entra no total).
              const despLeg = consultores.length ? totalDespesas : (Number(status?.total_despesas ?? 0) || 0)
              const servLeg = baseRecebimento - despLeg
              const parts: string[] = [`serv ${formatBRL(servLeg)}`]
              if (despLeg > 0)             parts.push(`+ desp ${formatBRL(despLeg)}`)
              if (ajusteDesconto > 0)      parts.push(`− desc ${formatBRL(ajusteDesconto)}`)
              if (ajusteAdiantamento > 0)  parts.push(`− adiant ${formatBRL(ajusteAdiantamento)}`)
              if (ajusteAdicional > 0)     parts.push(`+ adic ${formatBRL(ajusteAdicional)}`)
              return (
                <div className="mt-2 text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                  Recebimento = {parts.join('  ')}{savingAjuste ? ' · salvando…' : ''}
                </div>
              )
            })()}
          </div>
        )}

        {!partnerId ? (
          <EmptyState icon={Handshake} title="Selecione um parceiro" description="Escolha o parceiro e a competência para visualizar o fechamento." />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-4 md:px-6 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
                    borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto">

              {/* ── Tab Consultores ── */}
              {tab === 'consultores' && (
                <div className="p-4 md:p-6">
                  {/* Toggle de visão */}
                  <div className="flex items-center gap-2 mb-5">
                    {(['resumo', 'tipo'] as const).map(v => (
                      <button key={v} onClick={() => setConsultorView(v)}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{
                          background: consultorView === v ? 'var(--primary)' : 'var(--surface)',
                          color: consultorView === v ? 'var(--primary-fg)' : 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {v === 'resumo' ? 'Resumo por Consultor' : 'Por Tipo de Contrato'}
                      </button>
                    ))}

                    {consultorView === 'resumo' && consultores.length > 1 && (
                      <div className="flex items-center gap-2 ml-4">
                        <Filter size={13} style={{ color: 'var(--text-muted)' }} />
                        <SearchSelect value={filterConsultor} onChange={v => setFilterConsultor(v ? Number(v) : '')} options={consultorOptions} placeholder="Todos" />
                        {filterConsultor && <button className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => setFilterConsultor('')}>Limpar</button>}
                      </div>
                    )}
                  </div>

                  {loadingConsult || (consultorView === 'tipo' && loadingAp) ? (
                    <SkeletonTable rows={4} cols={4} />
                  ) : consultorView === 'resumo' ? (
                    <>
                      {filteredConsultores.length === 0 ? (
                        <EmptyState icon={Handshake} title="Sem consultores" description="Nenhum consultor com apontamentos neste período." />
                      ) : (
                        <Table>
                          <Thead>
                            <tr><Th>Consultor</Th><Th right>Horas</Th><Th right>Taxa/h</Th><Th right>Total</Th></tr>
                          </Thead>
                          <Tbody>
                            {filteredConsultores.map(row => (
                              <Tr key={row.user_id}>
                                <Td>
                                  <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>{row.nome}</div>
                                  {row.rate_type === 'monthly' && !isFixed && (
                                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>Mensalista · ÷160</div>
                                  )}
                                </Td>
                                <Td right className="tabular-nums text-xs">{row.horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</Td>
                                <Td right className="tabular-nums text-xs">{formatBRL(row.valor_hora)}/h</Td>
                                <Td right className="tabular-nums text-sm font-semibold" style={{ color: 'var(--primary)' }}>{formatBRL(row.total)}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      )}
                      {filteredConsultores.length > 0 && (
                        <div className="mt-4 flex justify-between items-center">
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Total: <b>{filteredConsultores.reduce((s, c) => s + c.horas, 0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</b></span>
                          <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                            Total Serviços: {formatBRL(filteredConsultores.reduce((s, c) => s + c.total, 0))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* ── Visão Por Tipo de Contrato ── */
                    (() => {
                      // Agrupa apontamentos: tipo → consultor → {horas, total}
                      const tipoMap = new Map<string, { nome: string; consultores: Map<number, { user_id: number; consultor: string; taxa: number; horas: number; total: number }> }>()
                      apontamentos.forEach(a => {
                        if (!tipoMap.has(a.tipo_contrato_code)) {
                          tipoMap.set(a.tipo_contrato_code, { nome: a.tipo_contrato_nome, consultores: new Map() })
                        }
                        const tipo = tipoMap.get(a.tipo_contrato_code)!
                        if (!tipo.consultores.has(a.user_id)) {
                          const c = consultores.find(c => c.user_id === a.user_id)
                          tipo.consultores.set(a.user_id, { user_id: a.user_id, consultor: a.consultor, taxa: c?.valor_hora ?? 0, horas: 0, total: 0 })
                        }
                        const entry = tipo.consultores.get(a.user_id)!
                        entry.horas += a.horas
                        entry.total += a.horas * entry.taxa
                      })

                      if (tipoMap.size === 0) return <EmptyState icon={Handshake} title="Sem apontamentos" description="Nenhum apontamento no período." />

                      return (
                        <div className="space-y-8">
                          {Array.from(tipoMap.entries()).map(([code, { nome, consultores: consMap }]) => {
                            const rows = Array.from(consMap.values())
                            const tipoHoras = rows.reduce((s, r) => s + r.horas, 0)
                            const tipoTotal = rows.reduce((s, r) => s + r.total, 0)
                            return (
                              <div key={code}>
                                {/* Header do tipo */}
                                <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{nome}</span>
                                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{code}</span>
                                  </div>
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {tipoHoras.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h · <b style={{ color: 'var(--primary)' }}>{formatBRL(tipoTotal)}</b>
                                  </span>
                                </div>
                                <Table>
                                  <Thead>
                                    <tr><Th>Consultor</Th><Th right>Horas</Th><Th right>Taxa/h</Th><Th right>Total</Th></tr>
                                  </Thead>
                                  <Tbody>
                                    {rows.map(r => (
                                      <Tr key={r.user_id}>
                                        <Td className="text-xs font-medium" style={{ color: 'var(--text)' }}>{r.consultor}</Td>
                                        <Td right className="tabular-nums text-xs">{r.horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</Td>
                                        <Td right className="tabular-nums text-xs">{formatBRL(r.taxa)}/h</Td>
                                        <Td right className="tabular-nums text-sm font-semibold" style={{ color: 'var(--primary)' }}>{formatBRL(Math.round(r.total * 100) / 100)}</Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                              </div>
                            )
                          })}
                          <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              Total: <b>{apontamentos.reduce((s, a) => s + a.horas, 0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</b>
                            </span>
                            <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                              Total Serviços: {formatBRL(totalServicos)}
                            </div>
                          </div>
                        </div>
                      )
                    })()
                  )}

                  {isFixed && consultores.length > 0 && (
                    <p className="mt-3 text-xs" style={{ color: 'var(--text-light)' }}>
                      * Taxa fixa do parceiro aplicada a todos os consultores.
                    </p>
                  )}
                </div>
              )}

              {/* ── Tab Despesas ── */}
              {tab === 'despesas' && (
                <div className="p-4 md:p-6">
                  {loadingDesp ? (
                    <SkeletonTable rows={4} cols={6} />
                  ) : despesas.length === 0 ? (
                    <EmptyState icon={Handshake} title="Sem despesas" description="Nenhuma despesa dos consultores neste período." />
                  ) : (
                    <Table>
                      <Thead>
                        <tr>
                          <Th {...despesasSort.thProps('data')}>Data</Th>
                          <Th {...despesasSort.thProps('descricao')}>Descrição</Th>
                          <Th {...despesasSort.thProps('categoria')}>Categoria</Th>
                          <Th {...despesasSort.thProps('colaborador')}>Consultor</Th>
                          <Th {...despesasSort.thProps('projeto')}>Projeto</Th>
                          <Th {...despesasSort.thProps('status')}>Status</Th>
                          <Th>Pagamento</Th>
                          <Th right {...despesasSort.thProps('valor')}>Valor</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {despesasSort.sorted.map(row => (
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
                            <Td className="text-xs">
                              {row.is_paid ? (
                                <span
                                  title={`Paga em ${row.paid_at ? new Date(row.paid_at).toLocaleDateString('pt-BR') : '—'}${row.paid_by_name ? ` por ${row.paid_by_name}` : ''}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                                  style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                                >
                                  <Lock size={10} /> Paga antecipadamente
                                </span>
                              ) : row.status === 'approved' ? (
                                <span className="text-[11px]" style={{ color: 'var(--success)' }}>Pago no fechamento</span>
                              ) : (
                                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>—</span>
                              )}
                            </Td>
                            <Td
                              right
                              className="tabular-nums text-xs font-medium"
                              style={{ color: row.is_paid ? 'var(--text-light)' : 'var(--primary)', textDecoration: row.is_paid ? 'line-through' : undefined }}
                            >
                              {formatBRL(row.valor)}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                  {despesas.length > 0 && (
                    <div className="mt-4 flex flex-col items-end gap-1">
                      <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        Despesas no fechamento: {formatBRL(totalDespesas)}
                      </div>
                      {totalDespesasAnt > 0 && (
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          + {formatBRL(totalDespesasAnt)} já pagas antecipadamente (fora do fechamento)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab Apontamentos ── */}
              {tab === 'apontamentos' && (
                <div className="p-4 md:p-6">
                  {/* Filtros */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Filter size={14} style={{ color: 'var(--text-muted)' }} />
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
                      style={{ background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' }}
                    >
                      <option value="">Todos os status</option>
                      <option value="approved">Aprovado</option>
                      <option value="pending">Pendente</option>
                      <option value="conflicted">Conflito</option>
                    </select>
                    {(filterApConsultor || filterApStatus) && (
                      <button
                        className="text-xs underline"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => { setFilterApConsultor(''); setFilterApStatus('') }}
                      >
                        Limpar filtros
                      </button>
                    )}
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
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
                          <Th {...apontSort.thProps('data')}>Data</Th>
                          <Th {...apontSort.thProps('consultor')}>Consultor</Th>
                          <Th {...apontSort.thProps('projeto')}>Projeto</Th>
                          <Th right {...apontSort.thProps('horas')}>Horas</Th>
                          <Th {...apontSort.thProps('status')}>Status</Th>
                          <Th {...apontSort.thProps('ticket')}>Ticket</Th>
                          <Th>Observação</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {apontSort.sorted.map(row => (
                          <Tr key={row.id}>
                            <Td className="text-xs tabular-nums whitespace-nowrap">
                              {new Date(row.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </Td>
                            <Td className="text-xs">{row.consultor}</Td>
                            <Td className="text-xs">{row.projeto}</Td>
                            <Td right className="tabular-nums text-xs">{row.horas.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</Td>
                            <Td className="text-xs">
                              <Badge variant={STATUS_VARIANTS[row.status] ?? 'secondary'}>
                                {STATUS_LABELS[row.status] ?? row.status}
                              </Badge>
                            </Td>
                            <Td className="text-xs">{row.ticket ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${row.ticket}`} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:text-[var(--primary)]">#{row.ticket}</a> : '—'}</Td>
                            <Td className="text-xs max-w-xs truncate">
                              <span title={previewText(row.observacao)}>{row.observacao ? previewText(row.observacao) : '—'}</span>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                  {filteredApontamentos.length > 0 && (
                    <div className="mt-4 flex justify-between items-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>
                        Total filtrado: <b>{filteredApontamentos.reduce((s, a) => s + a.horas, 0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</b>
                      </span>
                      <span>
                        Aprovados: <b style={{ color: 'var(--primary)' }}>
                          {filteredApontamentos.filter(a => a.status === 'approved').reduce((s, a) => s + a.horas, 0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h
                        </b>
                        {' · '}
                        Pendentes: <b style={{ color: 'var(--warning)' }}>
                          {filteredApontamentos.filter(a => a.status === 'pending').reduce((s, a) => s + a.horas, 0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h
                        </b>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab Resumo ── */}
              {tab === 'resumo' && (
                <div className="p-4 md:p-6 max-w-md">
                  <div className="rounded-lg p-5 space-y-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
                      Resumo — {yearMonth ? fmtYearMonth(yearMonth) : ''}
                    </h3>
                    <div className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span>Total Horas Trabalhadas</span>
                      <span className="tabular-nums">{totalHoras.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}h</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span>Total Serviços</span>
                      <span className="tabular-nums">{formatBRL(totalServicos)}</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span>Total Despesas</span>
                      <span className="tabular-nums">{formatBRL(totalDespesas)}</span>
                    </div>
                    <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>TOTAL A PAGAR</span>
                        <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                          {formatBRL(totalAPagar)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab Relatório ── */}
              {tab === 'relatorio' && (
                (loadingAp || loadingReport) ? (
                  <div className="p-4 md:p-6"><SkeletonTable rows={4} cols={6} /></div>
                ) : (() => {
                  const reportHtml = reportHtmlSrv
                  if (!reportHtml) {
                    return (
                      <EmptyState
                        icon={Handshake}
                        title="Sem dados para o relatório"
                        description="Nenhum apontamento no período para gerar o relatório."
                      />
                    )
                  }
                  return (
                    /* Split horizontal — preview à esquerda, painel de ações à direita */
                    <div className="flex-1 flex min-h-0 flex-col md:flex-row">
                      {/* LEFT — preview do documento, largura limitada e centralizada */}
                      <div className="flex-1 min-h-0 overflow-auto flex justify-center p-3 md:p-6" style={{ background: 'var(--bg)' }}>
                        <iframe
                          ref={reportIframeRef}
                          srcDoc={reportHtml}
                          title="Relatório"
                          className="w-full"
                          style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 820, minHeight: 640 }}
                        />
                      </div>

                      {/* RIGHT — painel de ações fixo */}
                      <aside
                        className="shrink-0 w-full md:w-[300px] flex flex-col gap-3 p-4 overflow-y-auto border-t md:border-t-0 md:border-l"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <div className="pb-3 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                          <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{status?.nome}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{yearMonth ? fmtYearMonth(yearMonth) : ''}</p>
                          <p className="text-lg font-bold mt-2" style={{ color: 'var(--primary)' }}>{formatBRL(totalServicos)}</p>
                        </div>

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
                            title={`Enviar fechamento de ${status?.nome ?? ''} por e-mail`}
                            onClick={openCompose}
                          >
                            Enviar e-mail
                          </Button>
                        )}

                        {/* Status de envio: legenda (data/hora/quem) + limpar */}
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
                            <p className="text-xs px-1" style={{ color: 'var(--text-light)' }}>Fechamento ainda não enviado.</p>
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
                          icon={X}
                          className="w-full !justify-start mt-auto"
                          onClick={() => setTab('resumo')}
                        >
                          Fechar
                        </Button>
                      </aside>
                    </div>
                  )
                })()
              )}

            </div>
          </>
        )}
      </div>

      {/* Dialog de composição/preview do e-mail */}
      {composeOpen && partnerId && (
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
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Enviar fechamento por e-mail</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {status?.nome} · {yearMonth ? fmtYearMonth(yearMonth) : ''}
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

                {/* Parceiro admin — chips fixos, não removíveis */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Parceiro admin</label>
                    <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>sempre recebe</span>
                  </div>
                  {adminEmails.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {adminEmails.map(em => (
                        <span
                          key={em}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                          style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--border)' }}
                          title="Destinatário fixo (parceiro admin)"
                        >
                          <Lock size={10} /> {em}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum admin do parceiro cadastrado.</p>
                  )}
                </div>

                {/* E-mails do parceiro (cadastrados) — editável + salvar no cadastro */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    E-mails do parceiro (cadastrados)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cadastradoInput}
                      onChange={e => { setCadastradoInput(e.target.value); setCadastroSaved(false) }}
                      placeholder="email1@dominio.com, email2@dominio.com"
                      className="flex-1 rounded-lg px-3 py-2 text-sm ds-input focus:outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Save}
                      loading={savingCadastro}
                      onClick={saveCadastro}
                      title="Salvar estes e-mails no cadastro do parceiro"
                    >
                      Salvar
                    </Button>
                  </div>
                  {cadastroSaved && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--success)' }}>
                      Salvo no cadastro do parceiro.
                    </p>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                    Separe vários e-mails por vírgula. Estes ficam salvos para os próximos fechamentos.
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
