'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useTableSort } from '@/hooks/use-table-sort'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { RefreshCw, Printer, FileText, Users, Search, X, Mail, FileSpreadsheet, Send, Check } from 'lucide-react'
import { toast } from 'sonner'
import { NotasPjCell, type NotasPayload } from '@/components/fechamento/NotasPjCell'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Button, SkeletonTable, EmptyState,
} from '@/components/ds'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractType = 'cooperado' | 'clt' | 'pj'

interface ConsultorBase {
  user_id: number
  nome: string
  email: string
  type: string
  consultant_type: string
  contract_type: ContractType | null
  horas_trabalhadas: number
  valor_hora: number
  rate_type: string
  effective_rate: number
  horas_a_pagar: number
  total: number
  total_despesas: number    // despesas pagar_no_fechamento (não pagas avulso) somadas
  desconto: number          // ajuste manual: desconto
  desconto_desc: string | null
  adiantamento: number      // ajuste manual: adiantamento + parcelas da rotina
  adiantamento_desc?: string | null  // descrição das parcelas de adiantamento do mês
  adicional: number         // ajuste manual: adicional
  adicional_desc: string | null
  recebimento: number       // total + despesas − desconto − adiantamento + adicional
  envio_em: string | null   // ISO do último envio do fechamento; null = não enviado
  envio_por: string | null  // nome de quem enviou
  notas?: NotasPayload      // NFS-e + Nota de débito (só consultor PJ avulso)
  is_bizify?: boolean       // funcionário Bizify (relatório sai com logo Bizify)
}

interface ConsultorHorista extends ConsultorBase {
  guaranteed_hours: number
  guaranteed_prorated: number
  proporcional: boolean
  ratio: number
  dias_uteis_periodo: number
  dias_uteis_cheio: number
  data_inicio: string | null
  total_extras: number
}

interface ConsultorBancoHoras extends ConsultorBase {
  daily_hours: number
  working_days: number
  expected_hours: number
  month_balance: number
  previous_balance: number
  accumulated_balance: number
  paid_hours: number
  final_balance: number
  fixed_salary: number
  valor_hora_extra: number
  horas_extras: number
  total_extra: number
}

interface ConsultorFixo extends ConsultorBase {
  salario_mensal: number
}

interface Totais {
  total_horistas: number
  total_banco_horas: number
  total_fixos: number
  total_despesas: number
  total_geral: number
}

interface BizifyData {
  horistas: ConsultorHorista[]
  banco_horas: ConsultorBancoHoras[]
  fixos: ConsultorFixo[]
  totais: Totais
}

interface IndexData {
  horistas: ConsultorHorista[]
  banco_horas: ConsultorBancoHoras[]
  fixos: ConsultorFixo[]
  totais: Totais
  bizify?: BizifyData
}

interface ApontamentoRow {
  id: number
  data: string
  start_time?: string | null
  end_time?: string | null
  projeto: string
  projeto_codigo: string
  cliente: string
  tipo_contrato_code: string
  tipo_contrato_nome: string
  horas: number       // efetivas (infladas para banco de horas, base para horista)
  horas_base?: number // horas originais sem o acréscimo
  status: string
  ticket?: string
  titulo?: string
  observacao?: string
  consultant_extra_pct?: number | null
  valor_extra?: number | null // apenas horista/fixo
}

type Tab = 'horistas' | 'banco_horas' | 'fixo' | 'resumo' | 'bizify'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtYearMonth(ym: string): string {
  if (!ym) return ''
  const [year, month] = ym.split('-')
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[parseInt(month) - 1]} de ${year}`
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtH(h: number): string {
  // Horas em DECIMAL 2 casas (pt-BR) — bate com horas × taxa no total.
  return (h ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function balanceColor(val: number): string {
  if (val > 0) return 'text-[var(--success)]'
  if (val < 0) return 'text-[var(--danger)]'
  return 'text-[var(--text-muted)]'
}

// Rótulos do tipo de contrato (dimensão "Tipo de Contrato").
const CONTRACT_LABELS: Record<ContractType, string> = {
  cooperado: 'Cooperado',
  clt:       'CLT',
  pj:        'PJ',
}
const CONTRACT_ORDER: ContractType[] = ['cooperado', 'clt', 'pj']
function contractLabel(ct: ContractType | null): string {
  return ct ? CONTRACT_LABELS[ct] : '— (sem tipo)'
}

// ─── Print ────────────────────────────────────────────────────────────────────

const printStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { padding: 28px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #7c3aed; padding-bottom: 14px; }
  .logo img { height: 48px; width: auto; display: block; }
  .meta { text-align: right; font-size: 11px; color: #555; line-height: 1.6; }
  .meta strong { font-size: 15px; color: #1a1a1a; display: block; margin-bottom: 4px; }
  .summary-box { display: flex; gap: 24px; background: #f9f7ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
  .summary-item { flex: 1; }
  .summary-label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .summary-value { font-size: 14px; font-weight: 700; color: #1a1a1a; }
  .section { margin-bottom: 20px; break-inside: avoid; }
  .section-header { display: flex; justify-content: space-between; align-items: center; background: #ede9fe; border-left: 3px solid #7c3aed; padding: 6px 10px; margin-bottom: 6px; border-radius: 0 4px 4px 0; }
  .section-title { font-size: 11px; font-weight: 700; color: #5b21b6; text-transform: uppercase; letter-spacing: 0.4px; }
  .section-total { font-size: 12px; font-weight: 700; color: #5b21b6; }
  .section-header.despesa { background: #cffafe; border-left-color: #0891b2; }
  .section-header.despesa .section-title, .section-header.despesa .section-total { color: #0e7490; }
  .client-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin: 8px 0 4px; border-bottom: 1px solid #ddd6fe; }
  .client-name { font-size: 11px; font-weight: 700; color: #1a1a1a; }
  .client-total { font-size: 11px; color: #7c3aed; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; padding: 5px 8px; text-align: left; color: #555; border-bottom: 1px solid #ddd; }
  td { font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }
  tbody tr.main-row td { padding: 8px 8px; border-bottom: 1px solid #ece9f5; vertical-align: middle; }
  tbody tr.main-row:nth-child(even) td { background: #f7f6fc; }
  tbody tr.main-row:hover td { background: #efeafc; }
  .right { text-align: right; }
  .center { text-align: center; }
  .total-box { background: #7c3aed; color: #fff; padding: 12px 18px; margin-top: 24px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
  .total-label { font-size: 13px; font-weight: 700; }
  .total-value { font-size: 20px; font-weight: 900; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

interface DespesaRow {
  id: number
  data: string
  descricao: string | null
  categoria: string
  cliente: string
  projeto: string
  valor: number
  is_paid: boolean
  paid_at: string | null
}

type ReportMode = 'servicos' | 'despesa' | 'ambos'

function buildReport(
  consultor: ConsultorBase | ConsultorHorista | ConsultorBancoHoras | ConsultorFixo,
  apontamentos: ApontamentoRow[],
  yearMonth: string,
  despesas: DespesaRow[] = [],
  mode: ReportMode = 'ambos'
): string {
  const grouped = new Map<string, ApontamentoRow[]>()
  for (const apt of apontamentos) {
    const key = apt.tipo_contrato_nome || 'Sem tipo'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(apt)
  }

  let summaryExtra = ''
  if ('fixed_salary' in consultor) {
    const c = consultor as ConsultorBancoHoras
    summaryExtra = `
      <div class="summary-item"><div class="summary-label">H Úteis Disponib.</div><div class="summary-value">${fmtH(c.expected_hours)}</div></div>
      <div class="summary-item"><div class="summary-label">Base Mensal</div><div class="summary-value">${formatBRL(c.fixed_salary)}</div></div>
      <div class="summary-item"><div class="summary-label">Taxa/h (÷160)</div><div class="summary-value">R$ ${c.valor_hora_extra.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div></div>
      <div class="summary-item"><div class="summary-label">Saldo Acumulado</div><div class="summary-value">${fmtH(c.accumulated_balance)}</div></div>
      <div class="summary-item"><div class="summary-label">H Extras</div><div class="summary-value">${c.horas_extras > 0 ? fmtH(c.horas_extras) : '—'}</div></div>
    `
  } else if ('salario_mensal' in consultor) {
    const c = consultor as ConsultorFixo
    summaryExtra = `
      <div class="summary-item"><div class="summary-label">Repasse no Mês</div><div class="summary-value">${formatBRL(c.salario_mensal)}</div></div>
    `
  } else {
    const ch = consultor as ConsultorHorista
    const hasGuaranteed = ch.guaranteed_prorated > 0 && ch.horas_a_pagar > ch.horas_trabalhadas
    summaryExtra = `
      ${hasGuaranteed ? `
        <div class="summary-item"><div class="summary-label">H Garantidas (mín)</div><div class="summary-value" style="color:#d97706">${fmtH(ch.guaranteed_prorated)}</div></div>
        <div class="summary-item"><div class="summary-label">H a Pagar</div><div class="summary-value">${fmtH(ch.horas_a_pagar)}</div></div>
      ` : ''}
      <div class="summary-item"><div class="summary-label">Taxa/h</div><div class="summary-value">${formatBRL(consultor.effective_rate)}</div></div>
    `
  }

  let sectionsHtml = ''
  if (grouped.size === 0) {
    sectionsHtml = '<p style="color:#999;text-align:center;padding:16px;">Nenhum apontamento no período</p>'
  } else {
    for (const [tipo, rows] of grouped.entries()) {
      const totalHoras = rows.reduce((s, r) => s + r.horas, 0)

      // Sub-group by client within each contract type
      const byCliente = new Map<string, ApontamentoRow[]>()
      for (const r of rows) {
        const c = r.cliente || 'Sem cliente'
        if (!byCliente.has(c)) byCliente.set(c, [])
        byCliente.get(c)!.push(r)
      }

      let clienteBlocksHtml = ''
      for (const [cliente, clienteRows] of byCliente.entries()) {
        const clienteHoras = clienteRows.reduce((s, r) => s + r.horas, 0)
        const rowsHtml = clienteRows.map(r => `
          <tr class="main-row">
            <td>${fmtDate(r.data)}</td>
            <td>${r.cliente || '—'}</td>
            <td><span style="color:#888;margin-right:4px">${r.projeto_codigo}</span>${r.projeto}</td>
            <td>${r.ticket ?? '—'}</td>
            <td>${r.titulo ?? '—'}</td>
            <td class="center">${r.start_time ? (r.start_time.includes('T') ? r.start_time.slice(11, 16) : r.start_time.slice(0, 5)) : '—'}</td>
            <td class="center">${r.end_time   ? (r.end_time.includes('T')   ? r.end_time.slice(11, 16)   : r.end_time.slice(0, 5))   : '—'}</td>
            <td class="right">${fmtH(r.horas)}${r.consultant_extra_pct ? (r.valor_extra != null ? `<span style="color:#16a34a;font-size:10px;margin-left:4px">+${r.consultant_extra_pct}% (${formatBRL(r.valor_extra)})</span>` : `<span style="color:#16a34a;font-size:10px;margin-left:4px">+${r.consultant_extra_pct}% base ${fmtH(r.horas_base ?? r.horas)}</span>`) : ''}</td>
          </tr>
        `).join('')
        clienteBlocksHtml += `
          <div class="client-header">
            <span class="client-name">${cliente}</span>
            <span class="client-total">${fmtH(clienteHoras)}</span>
          </div>
          <table>
            <thead><tr><th>Data</th><th>Cliente</th><th>Projeto</th><th>Ticket</th><th>Título</th><th class="center">Início</th><th class="center">Fim</th><th class="right">Horas / Extra</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `
      }

      sectionsHtml += `
        <div class="section">
          <div class="section-header">
            <span class="section-title">${tipo}</span>
            <span class="section-total">${fmtH(totalHoras)}</span>
          </div>
          ${clienteBlocksHtml}
        </div>
      `
    }
  }

  const despesaTotal = despesas.filter(d => !d.is_paid).reduce((s, d) => s + d.valor, 0) // saldo a pagar no fechamento
  const despesasHtml = despesas.length === 0 ? '' : `
    <div class="section">
      <div class="section-header despesa">
        <span class="section-title">Despesas reembolsadas no fechamento</span>
        <span class="section-total">Saldo: ${formatBRL(despesaTotal)}</span>
      </div>
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Cliente</th><th>Projeto</th><th>Pagamento</th><th class="right">Valor</th></tr></thead>
        <tbody>${despesas.map(d => `
          <tr class="main-row">
            <td>${fmtDate(d.data)}</td>
            <td>${d.descricao || '—'}</td>
            <td>${d.categoria}</td>
            <td>${d.cliente}</td>
            <td>${d.projeto}</td>
            <td>${d.is_paid ? (d.paid_at ? 'Pago em ' + new Date(d.paid_at).toLocaleDateString('pt-BR') : 'Pago') : '<span style="color:#7c3aed">No fechamento</span>'}</td>
            <td class="right">${formatBRL(d.valor)}</td>
          </tr>`).join('')}
          <tr><td colspan="6" class="right" style="font-weight:bold;padding-top:6px">Saldo a pagar no fechamento</td><td class="right" style="font-weight:bold;padding-top:6px">${formatBRL(despesaTotal)}</td></tr>
        </tbody>
      </table>
    </div>
  `

  const totalHoras = apontamentos.reduce((s, r) => s + r.horas, 0)

  const isServ = mode !== 'despesa'
  const isDesp = mode !== 'servicos'
  const servTotal = consultor.total
  const despTot = consultor.total_despesas || 0
  const modeLabel = mode === 'servicos' ? 'Serviços' : mode === 'despesa' ? 'Despesas' : 'Completo'

  const summaryHtml = mode === 'despesa'
    ? `<div class="summary-item"><div class="summary-label">Despesas (fechamento)</div><div class="summary-value" style="color:#7c3aed">${formatBRL(despTot)}</div></div>`
    : `<div class="summary-item"><div class="summary-label">Total Horas</div><div class="summary-value">${fmtH(totalHoras)}</div></div>${summaryExtra}<div class="summary-item"><div class="summary-label">Total Serviços</div><div class="summary-value" style="color:#7c3aed">${formatBRL(servTotal)}</div></div>`

  const baseValor = mode === 'servicos' ? servTotal : mode === 'despesa' ? despTot : servTotal + despTot

  // Ajustes manuais (desconto/adiantamento/adicional) — entram no Recebimento final.
  const desconto     = consultor.desconto || 0
  const adiantamento = consultor.adiantamento || 0
  const adicional    = consultor.adicional || 0
  // No relatório de Despesas só entram as despesas — sem ajustes nem recebimento.
  const temAjustes   = mode !== 'despesa' && (desconto !== 0 || adiantamento !== 0 || adicional !== 0)
  const recebimento  = baseValor - desconto - adiantamento + adicional

  const ajustesHtml = temAjustes ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">Ajustes do recebimento</span>
      </div>
      <table>
        <thead><tr><th>Lançamento</th><th>Descritivo</th><th class="right">Valor</th></tr></thead>
        <tbody>
          <tr class="main-row"><td>Serviço</td><td>—</td><td class="right">${formatBRL(servTotal)}</td></tr>
          ${isDesp && despTot > 0 ? `<tr class="main-row"><td>Despesa</td><td>—</td><td class="right" style="color:#16a34a">+ ${formatBRL(despTot)}</td></tr>` : ''}
          <tr class="main-row"><td>Desconto</td><td>${consultor.desconto_desc ?? '—'}</td><td class="right" style="color:#dc2626">− ${formatBRL(desconto)}</td></tr>
          <tr class="main-row"><td>Adiantamento</td><td>${consultor.adiantamento_desc ?? '—'}</td><td class="right" style="color:#dc2626">− ${formatBRL(adiantamento)}</td></tr>
          <tr class="main-row"><td>Adicional</td><td>${consultor.adicional_desc ?? '—'}</td><td class="right" style="color:#16a34a">+ ${formatBRL(adicional)}</td></tr>
        </tbody>
      </table>
    </div>
  ` : ''

  const totalValor = temAjustes ? recebimento : baseValor
  const totalLabel = temAjustes
    ? `RECEBIMENTO &nbsp;<span style="font-size:10px;font-weight:normal">(base ${formatBRL(baseValor)} − desconto ${formatBRL(desconto)} − adiantamento ${formatBRL(adiantamento)} + adicional ${formatBRL(adicional)})</span>`
    : mode === 'servicos'
      ? 'TOTAL A PAGAR — SERVIÇOS'
      : mode === 'despesa'
        ? 'TOTAL — DESPESAS (FECHAMENTO)'
        : `TOTAL A PAGAR${despTot > 0 ? ` &nbsp;(serviços ${formatBRL(servTotal)} + despesas ${formatBRL(despTot)})` : ''}`

  return `
    <div class="page">
      <div class="header">
        <div class="logo"><img src="${window.location.origin}/${consultor.is_bizify ? 'logo-bizify.png' : 'logo.png'}" alt="${consultor.is_bizify ? 'Bizify' : 'ERPServ Consultoria'}" /></div>
        <div class="meta">
          <strong>${consultor.nome}</strong>
          Fechamento de Consultores &nbsp;·&nbsp; ${fmtYearMonth(yearMonth)} &nbsp;·&nbsp; ${modeLabel}
        </div>
      </div>
      <div class="summary-box">${summaryHtml}</div>
      ${isServ ? sectionsHtml : ''}
      ${isDesp ? despesasHtml : ''}
      ${ajustesHtml}
      <div class="total-box">
        <span class="total-label">${totalLabel}</span>
        <span class="total-value">${formatBRL(totalValor)}</span>
      </div>
    </div>
  `
}

function buildFullHtml(html: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title><style>${printStyles}</style></head><body>${html}</body></html>`
}

// ─── RelatorioBtn ─────────────────────────────────────────────────────────────

function RelatorioBtn({ userId, printingUser, onClick }: {
  userId: number
  printingUser: number | null
  onClick: (mode: ReportMode) => void
}) {
  const loading = printingUser === userId
  const link = 'text-[11px] disabled:opacity-50 transition-colors ds-link'
  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      {loading
        ? <RefreshCw size={13} className="animate-spin" />
        : <Printer size={13} style={{ opacity: 0.7 }} />}
      <button onClick={() => onClick('servicos')} disabled={loading} title="Relatório de Serviços" className={link}>Serviços</button>
      <span className="text-[var(--text-muted)]">·</span>
      <button onClick={() => onClick('despesa')} disabled={loading} title="Relatório de Despesas" className={link}>Despesa</button>
      <span className="text-[var(--text-muted)]">·</span>
      <button onClick={() => onClick('ambos')} disabled={loading} title="Relatório completo (serviços + despesas)" className={link}>Ambos</button>
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FechamentoConsultorPage() {
  const { user } = useAuth()
  const now = new Date()
  const defaultYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { filters: flt, set: setFilter } = usePersistedFilters(
    'fechamento_consultor',
    user?.id,
    { yearMonth: defaultYearMonth, tab: 'horistas' as Tab },
  )
  const { yearMonth, tab } = flt
  const setYearMonth = (v: string) => setFilter('yearMonth', v)
  const setTab       = (v: Tab)    => setFilter('tab', v)
  const [data, setData] = useState<IndexData | null>(null)
  const [loading, setLoading] = useState(false)
  const [printingUser, setPrintingUser] = useState<number | null>(null)
  const [reportHtml, setReportHtml] = useState<string | null>(null)
  // Consultor alvo do relatório aberto (só pra relatório INDIVIDUAL — habilita o "Enviar e-mail").
  const [reportTarget, setReportTarget] = useState<{ userId: number; name: string; mode: ReportMode } | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  // Dialog de composição/preview do e-mail (abre ao clicar "Enviar e-mail").
  const [composeOpen, setComposeOpen] = useState(false)
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null)
  const [emailMensagem, setEmailMensagem] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  // true só no primeiro fetch (sem mensagem) — usado pra semear o textarea com o padrão.
  const previewSeededRef = useRef(false)
  const reportIframeRef = useRef<HTMLIFrameElement>(null)
  // Buffer de edição dos ajustes (desconto/adiantamento/adicional) por consultor.
  // A página remonta os componentes inline (AjusteCols) a cada re-render — ex.: quando
  // o auth-context refaz loadUser() no visibilitychange, ou ao abrir o relatório
  // (setPrintingUser). Sem este buffer, o valor digitado e ainda não salvo é perdido
  // na remontagem (o useState volta ao valor do servidor). Guardamos o rascunho num
  // ref (não dispara render) e o lemos na (re)montagem. Limpo no save e no load().
  const ajusteDraftRef = useRef<Record<number, { desconto: string; adiantamento: string; adicional: string }>>({})
  // True só quando o press (mousedown) começou no próprio backdrop do compose.
  // Evita fechar o dialog quando uma seleção de texto no textarea termina (mouseup) sobre o backdrop.
  const composePressOnBackdrop = useRef(false)
  const canSendEmail = user?.type === 'admin' || user?.type === 'administrativo'
  const [apenasComMovimento, setApenasComMovimento] = useState(true)
  const [filterNome, setFilterNome] = useState('')
  // Filtro por Tipo de Contrato (null = "Todos").
  const [contractType, setContractType] = useState<ContractType | null>(null)
  // Filtro por status de envio do fechamento.
  const [envioFilter, setEnvioFilter] = useState<'todos' | 'enviado' | 'nao_enviado'>('todos')
  const [downloadingAllExcel, setDownloadingAllExcel] = useState(false)
  // Consultor cujo status de envio está sendo limpo (spinner/disable no botão).
  const [limpandoEnvio, setLimpandoEnvio] = useState<number | null>(null)

  // Atualiza o status de envio de um consultor nas 3 listas (otimista, sem refetch).
  const patchEnvio = useCallback((userId: number, envio_em: string | null, envio_por: string | null) => {
    setData(prev => {
      if (!prev) return prev
      const patch = <T extends ConsultorBase>(arr: T[]): T[] =>
        arr.map(c => (c.user_id === userId ? { ...c, envio_em, envio_por } : c))
      return {
        ...prev,
        horistas: patch(prev.horistas),
        banco_horas: patch(prev.banco_horas),
        fixos: patch(prev.fixos),
      }
    })
  }, [])

  // Atualiza as notas fiscais (NFS-e/Nota de débito) de um consultor nas 3 listas (otimista).
  const patchNotas = useCallback((userId: number, notas: NotasPayload) => {
    setData(prev => {
      if (!prev) return prev
      const patch = <T extends ConsultorBase>(arr: T[]): T[] =>
        arr.map(c => (c.user_id === userId ? { ...c, notas } : c))
      return {
        ...prev,
        horistas: patch(prev.horistas),
        banco_horas: patch(prev.banco_horas),
        fixos: patch(prev.fixos),
      }
    })
  }, [])

  // Atualiza os ajustes (desconto/adiantamento/adicional + recebimento) de um consultor (otimista).
  const patchAjustes = useCallback((userId: number, fields: Partial<Pick<ConsultorBase,
    'desconto' | 'desconto_desc' | 'adiantamento' | 'adicional' | 'adicional_desc' | 'recebimento'>>) => {
    setData(prev => {
      if (!prev) return prev
      const patch = <T extends ConsultorBase>(arr: T[]): T[] =>
        arr.map(c => (c.user_id === userId ? { ...c, ...fields } : c))
      return {
        ...prev,
        horistas: patch(prev.horistas),
        banco_horas: patch(prev.banco_horas),
        fixos: patch(prev.fixos),
      }
    })
  }, [])

  const limparEnvioConsultor = useCallback(async (userId: number) => {
    setLimpandoEnvio(userId)
    try {
      await api.post(`/fechamento-consultor/${userId}/${yearMonth}/limpar-envio`, {})
      patchEnvio(userId, null, null)
      toast.success('Status de envio limpo.')
    } catch (err: unknown) {
      toast.error(`Erro ao limpar: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setLimpandoEnvio(null)
    }
  }, [yearMonth, patchEnvio])

  const load = useCallback(async () => {
    if (!yearMonth) return
    setLoading(true)
    setData(null)
    ajusteDraftRef.current = {} // novo período → descarta rascunhos de ajustes pendentes
    try {
      const res = await api.get<{ data: IndexData }>(`/fechamento-consultor/${yearMonth}`)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => { load() }, [load])

  async function sendReportEmail() {
    if (!reportTarget) return
    setSendingEmail(true)
    try {
      // O detalhamento (PDF + XLSX) é gerado no backend; não enviamos mais o HTML.
      // `mensagem` é a versão editada (por envio) que o admin compôs no dialog.
      const res = await api.post<{ success: boolean; message: string }>(
        `/fechamento-consultor/${reportTarget.userId}/${yearMonth}/enviar-email`,
        { mensagem: emailMensagem, mode: reportTarget.mode },
      )
      toast.success(res?.message ?? 'Fechamento enviado por e-mail.')
      patchEnvio(reportTarget.userId, new Date().toISOString(), user?.name ?? null)
      closeCompose()
    } catch (err: unknown) {
      toast.error(`Erro ao enviar o fechamento: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setSendingEmail(false)
    }
  }

  // Busca o HTML renderizado do e-mail. Sem `mensagem` → backend devolve o html
  // padrão + `mensagem_padrao` (usado pra semear o textarea no primeiro fetch).
  const fetchEmailPreview = useCallback(async (mensagem?: string) => {
    if (!reportTarget) return
    setPreviewLoading(true)
    try {
      const res = await api.post<{ html: string; mensagem_padrao: string }>(
        `/fechamento-consultor/${reportTarget.userId}/${yearMonth}/email-preview`,
        mensagem !== undefined ? { mensagem, mode: reportTarget.mode } : { mode: reportTarget.mode },
      )
      setEmailPreviewHtml(res.html)
      if (!previewSeededRef.current) {
        previewSeededRef.current = true
        setEmailMensagem(res.mensagem_padrao ?? '')
      }
    } catch (err: unknown) {
      toast.error(`Erro ao gerar a prévia do e-mail: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setPreviewLoading(false)
    }
  }, [reportTarget, yearMonth])

  function openCompose() {
    if (!reportTarget) return
    previewSeededRef.current = false
    setEmailMensagem('')
    setEmailPreviewHtml(null)
    setComposeOpen(true)
    void fetchEmailPreview() // primeiro fetch: sem mensagem → html + mensagem_padrao
  }

  function closeCompose() {
    setComposeOpen(false)
    setEmailPreviewHtml(null)
    setEmailMensagem('')
    previewSeededRef.current = false
  }

  // Live update do preview: ao editar a mensagem, faz debounce (~450ms) e re-busca
  // o html. Só dispara depois que o primeiro fetch semeou o textarea (evita refetch
  // logo na abertura, quando o seed acabou de setar a mensagem).
  useEffect(() => {
    if (!composeOpen || !previewSeededRef.current) return
    const t = setTimeout(() => { void fetchEmailPreview(emailMensagem) }, 450)
    return () => clearTimeout(t)
  }, [emailMensagem, composeOpen, fetchEmailPreview])

  async function downloadExcel() {
    if (!reportTarget) return
    setDownloadingExcel(true)
    try {
      // O `api` helper sempre faz res.json(); pra blob usamos fetch direto no
      // mesmo proxy /api/v1 (o middleware injeta o Authorization via cookie).
      const res = await fetch(
        `/api/v1/fechamento-consultor/${reportTarget.userId}/${yearMonth}/excel?mode=${reportTarget.mode}`,
        { credentials: 'same-origin', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      // Nome do arquivo: tenta o Content-Disposition do backend, senão monta um.
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const fallback = `Fechamento_${yearMonth}_${reportTarget.name ?? 'consultor'}.xlsx`
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

  // Export consolidado (todos os consultores do período). Quando o filtro de
  // Tipo de Contrato está ativo, passa `?contract_type=` pro backend filtrar.
  // Mesmo mecanismo de download dos demais excel desta página: fetch no proxy
  // /api/v1 (o middleware injeta o Authorization via cookie) → blob → <a download>.
  async function downloadAllExcel() {
    if (!yearMonth) return
    setDownloadingAllExcel(true)
    try {
      const qs = contractType ? `?contract_type=${contractType}` : ''
      const res = await fetch(
        `/api/v1/fechamento-consultor/${yearMonth}/export-excel${qs}`,
        { credentials: 'same-origin', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const sufixo = contractType ? `_${CONTRACT_LABELS[contractType]}` : ''
      const fallback = `Fechamento_Consultores_${yearMonth}${sufixo}.xlsx`
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
      setDownloadingAllExcel(false)
    }
  }

  async function handleRelatorio(consultor: ConsultorBase | ConsultorHorista | ConsultorBancoHoras | ConsultorFixo, mode: ReportMode = 'ambos') {
    setPrintingUser(consultor.user_id)
    try {
      // Fonte ÚNICA: o relatório vem do MESMO Blade do servidor que gera o PDF/e-mail,
      // garantindo que a tela e o e-mail sejam idênticos.
      const res = await api.get<{ html: string }>(`/fechamento-consultor/${consultor.user_id}/${yearMonth}/report-html?mode=${mode}`)
      setReportHtml(res.html)
      setReportTarget({ userId: consultor.user_id, name: consultor.nome, mode })
    } catch (err: unknown) {
      toast.error(`Erro ao gerar relatório: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setPrintingUser(null)
    }
  }

  function handlePrintTodos() {
    if (!data) return
    const todos = [
      ...data.horistas,
      ...data.banco_horas,
      ...data.fixos,
    ].sort((a, b) => a.nome.localeCompare(b.nome))

    const rowsHtml = todos.map(c => `
      <tr>
        <td>${c.nome}</td>
        <td>${c.email ?? '—'}</td>
        <td class="right">${formatBRL(c.total + (c.total_despesas || 0))}</td>
      </tr>
    `).join('')

    const totalGeral = todos.reduce((s, c) => s + c.total + (c.total_despesas || 0), 0)

    const html = `
      <div class="page">
        <div class="header">
          <div class="logo"><img src="${window.location.origin}/logo.png" alt="ERPServ Consultoria" /></div>
          <div class="meta"><strong>Fechamento de Consultores — Consolidado</strong>${fmtYearMonth(yearMonth)}</div>
        </div>
        <table>
          <thead><tr><th>Consultor</th><th>E-mail</th><th class="right">Total a Pagar</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="total-box">
          <span class="total-label">TOTAL GERAL — ${todos.length} CONSULTORES</span>
          <span class="total-value">${formatBRL(totalGeral)}</span>
        </div>
      </div>
    `
    setReportHtml(buildFullHtml(html))
    setReportTarget(null) // consolidado — sem alvo individual, esconde "Enviar e-mail"
  }

  function handlePrintResumo() {
    if (!data) return
    const { totais } = data
    const rows = [
      { label: 'Horistas',      count: data.horistas.length,    total: totais.total_horistas },
      { label: 'Banco de Horas', count: data.banco_horas.length, total: totais.total_banco_horas },
      { label: 'Fixo',          count: data.fixos.length,       total: totais.total_fixos },
    ]
    const rowsHtml = rows.map(r => `
      <tr><td>${r.label}</td><td class="right">${r.count}</td><td class="right">${formatBRL(r.total)}</td></tr>
    `).join('')
    const despesasHtml = totais.total_despesas > 0
      ? `<tr><td>Despesas (fechamento)</td><td class="right">—</td><td class="right">${formatBRL(totais.total_despesas)}</td></tr>`
      : ''
    const html = `
      <div class="page">
        <div class="header">
          <div class="logo"><img src="${window.location.origin}/logo.png" alt="ERPServ Consultoria" /></div>
          <div class="meta"><strong>Fechamento de Consultores</strong>${fmtYearMonth(yearMonth)}</div>
        </div>
        <table>
          <thead><tr><th>Tipo de Vínculo</th><th class="right">Consultores</th><th class="right">Total</th></tr></thead>
          <tbody>${rowsHtml}${despesasHtml}</tbody>
        </table>
        <div class="total-box">
          <span class="total-label">TOTAL GERAL</span>
          <span class="total-value">${formatBRL(totais.total_geral + (totais.total_despesas || 0))}</span>
        </div>
      </div>
    `
    setReportHtml(buildFullHtml(html))
    setReportTarget(null) // consolidado — sem alvo individual, esconde "Enviar e-mail"
  }

  const hasBizify = ((data?.bizify?.horistas?.length ?? 0)
    + (data?.bizify?.banco_horas?.length ?? 0)
    + (data?.bizify?.fixos?.length ?? 0)) > 0
  const TABS: { key: Tab; label: string }[] = [
    { key: 'horistas',    label: 'Horistas' },
    { key: 'banco_horas', label: 'Banco de Horas' },
    { key: 'fixo',        label: 'Fixo' },
    { key: 'resumo',      label: 'Resumo' },
    ...(hasBizify ? [{ key: 'bizify' as Tab, label: 'Bizify' }] : []),
  ]

  // ─── Filtros ──────────────────────────────────────────────────────────────

  function applyFilters<T extends ConsultorBase>(rows: T[]): T[] {
    let r = rows
    if (apenasComMovimento) r = r.filter(c => c.total > 0 || c.horas_trabalhadas > 0)
    if (contractType) r = r.filter(c => c.contract_type === contractType)
    if (envioFilter === 'enviado') r = r.filter(c => !!c.envio_em)
    else if (envioFilter === 'nao_enviado') r = r.filter(c => !c.envio_em)
    if (filterNome.trim()) {
      const q = filterNome.trim().toLowerCase()
      r = r.filter(c => c.nome.toLowerCase().includes(q))
    }
    return r
  }

  // Célula de status de envio: badge "Enviado" + legenda (data/hora/quem) + limpar.
  function EnvioCell({ c }: { c: ConsultorBase }) {
    if (!c.envio_em) {
      return <span className="text-xs" style={{ color: 'var(--text-light)' }}>Não enviado</span>
    }
    const legenda = `Enviado em ${fmtDateTime(c.envio_em)}${c.envio_por ? ` por ${c.envio_por}` : ''}`
    return (
      <div className="inline-flex flex-col items-end gap-0.5" title={legenda}>
        <div className="inline-flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
          >
            <Check size={11} /> Enviado
          </span>
          {canSendEmail && (
            <button
              onClick={() => limparEnvioConsultor(c.user_id)}
              disabled={limpandoEnvio === c.user_id}
              className="text-[11px] disabled:opacity-50 transition-colors hover:underline"
              style={{ color: 'var(--text-light)' }}
            >
              {limpandoEnvio === c.user_id ? '...' : 'limpar'}
            </button>
          )}
        </div>
        <span className="text-[10px] font-normal" style={{ color: 'var(--text-light)' }}>
          {fmtDateTime(c.envio_em)}{c.envio_por ? ` · ${c.envio_por}` : ''}
        </span>
      </div>
    )
  }

  // Recebimento ao vivo = serviços + despesas − desconto − adiantamento + adicional.
  function calcRecebimento(c: ConsultorBase, desconto: number, adiantamento: number, adicional: number): number {
    return c.total + (c.total_despesas || 0) - desconto - adiantamento + adicional
  }

  // 4 colunas (Desconto / Adiantamento / Adicional editáveis + Total/Recebimento ao vivo).
  // Estado local por consultor; salva no onBlur de cada campo via POST /ajustes (otimista).
  // O Total exibe o Recebimento e recalcula AO VIVO conforme edita.
  function AjusteCols({ c, totalExtra }: { c: ConsultorBase; totalExtra?: ReactNode }) {
    const editable = canSendEmail
    // Rascunho pendente (digitado e ainda não salvo) tem prioridade sobre o valor do
    // servidor, para sobreviver às remontagens da tabela. Limpo no save bem-sucedido.
    const draft = ajusteDraftRef.current[c.user_id]
    const [desconto, setDesconto] = useState<string>(draft?.desconto ?? String(c.desconto ?? 0))
    const [descontoDesc, setDescontoDesc] = useState<string>(c.desconto_desc ?? '')
    const [adiantamento, setAdiantamento] = useState<string>(draft?.adiantamento ?? String(c.adiantamento ?? 0))
    const [adicional, setAdicional] = useState<string>(draft?.adicional ?? String(c.adicional ?? 0))
    const [adicionalDesc, setAdicionalDesc] = useState<string>(c.adicional_desc ?? '')
    const [saving, setSaving] = useState(false)

    // Persiste o que está digitado num ref (não re-renderiza) para resistir à remontagem.
    const writeDraft = (patch: Partial<{ desconto: string; adiantamento: string; adicional: string }>) => {
      ajusteDraftRef.current[c.user_id] = { desconto, adiantamento, adicional, ...patch }
    }

    const [descModal, setDescModal] = useState<null | 'desconto' | 'adicional'>(null)
    const [descDraft, setDescDraft] = useState('')

    const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? 0 : n }

    async function save(override?: Partial<{ descontoDesc: string; adicionalDesc: string }>) {
      if (!editable || saving) return
      setSaving(true)
      const payload = {
        desconto: num(desconto),
        desconto_desc: (override?.descontoDesc ?? descontoDesc) || null,
        adiantamento: num(adiantamento),
        adicional: num(adicional),
        adicional_desc: (override?.adicionalDesc ?? adicionalDesc) || null,
      }
      try {
        const res = await api.post<{ recebimento: number }>(
          `/fechamento-consultor/${c.user_id}/${yearMonth}/ajustes`, payload,
        )
        patchAjustes(c.user_id, { ...payload, recebimento: res.recebimento })
        delete ajusteDraftRef.current[c.user_id] // salvo: servidor passa a ser a fonte
        toast.success('Ajustes salvos', { duration: 1500 })
      } catch (err: unknown) {
        toast.error(`Erro ao salvar ajustes: ${err instanceof Error ? err.message : 'falha na API'}`)
      } finally {
        setSaving(false)
      }
    }

    function openDesc(field: 'desconto' | 'adicional') {
      setDescDraft(field === 'desconto' ? descontoDesc : adicionalDesc)
      setDescModal(field)
    }
    function saveDesc() {
      const v = descDraft.trim()
      if (descModal === 'desconto') { setDescontoDesc(v); save({ descontoDesc: v }) }
      else if (descModal === 'adicional') { setAdicionalDesc(v); save({ adicionalDesc: v }) }
      setDescModal(null)
    }

    const inputCls = 'w-24 rounded-md px-2 py-1 text-sm text-right ds-input focus:outline-none disabled:opacity-50'
    const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const

    // Botão do descritivo (abre modal): mostra preview se já tem texto, senão "+ descrição".
    const descBtn = (field: 'desconto' | 'adicional', val: string) => (
      <button type="button" disabled={!editable} onClick={() => openDesc(field)}
        title={val || 'Adicionar descrição (vai no relatório)'}
        className="mt-1 text-[10px] max-w-[6rem] truncate hover:underline disabled:opacity-40"
        style={{ color: val ? 'var(--primary)' : 'var(--text-light)' }}>
        {val ? `✎ ${val}` : '+ descrição'}
      </button>
    )

    const recebimento = calcRecebimento(c, num(desconto), num(adiantamento), num(adicional))

    return (
      <>
        <Td right className="align-top">
          <div className="flex flex-col items-end">
            <input type="number" step="0.01" value={desconto} disabled={!editable || saving}
              onChange={e => { setDesconto(e.target.value); writeDraft({ desconto: e.target.value }) }} onBlur={() => save()}
              className={inputCls} style={inputStyle} />
            {descBtn('desconto', descontoDesc)}
          </div>
        </Td>
        <Td right className="align-top">
          <input type="number" step="0.01" value={adiantamento} disabled={!editable || saving}
            onChange={e => { setAdiantamento(e.target.value); writeDraft({ adiantamento: e.target.value }) }} onBlur={() => save()}
            className={inputCls} style={inputStyle} />
        </Td>
        <Td right className="align-top">
          <div className="flex flex-col items-end">
            <input type="number" step="0.01" value={adicional} disabled={!editable || saving}
              onChange={e => { setAdicional(e.target.value); writeDraft({ adicional: e.target.value }) }} onBlur={() => save()}
              className={inputCls} style={inputStyle} />
            {descBtn('adicional', adicionalDesc)}
          </div>
        </Td>
        <Td right className="font-semibold text-[var(--text)] align-top">
          {formatBRL(recebimento)}
          {(() => {
            const d = num(desconto), a = num(adiantamento), ad = num(adicional)
            const parts: string[] = [`serv ${formatBRL(c.total)}`]
            if (c.total_despesas > 0) parts.push(`+ desp ${formatBRL(c.total_despesas)}`)
            if (d > 0)  parts.push(`− desc ${formatBRL(d)}`)
            if (a > 0)  parts.push(`− adiant ${formatBRL(a)}`)
            if (ad > 0) parts.push(`+ adic ${formatBRL(ad)}`)
            // Empilha cada parcela em sua própria linha (whitespace-nowrap) para não quebrar no meio do valor.
            return parts.length > 1 ? (
              <div className="flex flex-col items-end text-[10px] font-normal leading-tight" style={{ color: 'var(--text-light)' }}>
                {parts.map((p, i) => <span key={i} className="whitespace-nowrap">{p}</span>)}
              </div>
            ) : null
          })()}
          {totalExtra}
          {descModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 text-left"
              onClick={e => { if (e.target === e.currentTarget) setDescModal(null) }}>
              <div className="w-full max-w-md rounded-xl p-4 shadow-2xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                  Descritivo — {descModal === 'desconto' ? 'Desconto' : 'Adicional'}
                </h3>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{c.nome} · vai no relatório de fechamento</p>
                <textarea autoFocus rows={4} value={descDraft} onChange={e => setDescDraft(e.target.value)}
                  placeholder="Descreva o motivo…"
                  className="w-full rounded-lg px-3 py-2 text-sm ds-input focus:outline-none resize-none"
                  style={inputStyle} />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => setDescModal(null)} className="px-3 py-1.5 rounded-lg text-sm"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancelar</button>
                  <button onClick={saveDesc} className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Salvar</button>
                </div>
              </div>
            </div>
          )}
        </Td>
      </>
    )
  }

  // ─── Tab: Horistas ────────────────────────────────────────────────────────

  function TabHoristas({ source }: { source?: ConsultorHorista[] } = {}) {
    const rows = applyFilters(source ?? data?.horistas ?? [])
    const { sorted, thProps } = useTableSort(rows, (c, k) => k === 'total' ? (c.recebimento ?? 0) : (c as unknown as Record<string, unknown>)[k])
    return (
      <div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{rows.length} consultor{rows.length !== 1 ? 'es' : ''}</p>
        <Table>
          <Thead>
            <tr>
              <Th {...thProps('nome')}>Consultor</Th>
              <Th right {...thProps('horas_trabalhadas')}>H Trabalhadas</Th>
              <Th right {...thProps('horas_a_pagar')}>H a Pagar</Th>
              <Th right {...thProps('effective_rate')}>Taxa/h</Th>
              <Th right>Desconto</Th>
              <Th right>Adiantamento</Th>
              <Th right>Adicional</Th>
              <Th right {...thProps('total')}>Total</Th>
              <Th right>Notas (PJ)</Th>
              <Th right>Envio</Th>
              <Th right>Relatório</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <td colSpan={11} className="py-8 text-center text-[var(--text-light)] text-sm">
                  Nenhum consultor horista no período
                </td>
              </Tr>
            )}
            {sorted.map(c => {
              const hasGuaranteed = c.guaranteed_prorated > 0 && c.horas_a_pagar > c.horas_trabalhadas
              return (
                <Tr key={c.user_id}>
                  <Td className="font-medium text-[var(--text)]">{c.nome}</Td>
                  <Td right className="font-mono text-[var(--text)]">{fmtH(c.horas_trabalhadas)}</Td>
                  <Td right>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-[var(--text)]">{fmtH(c.horas_a_pagar)}</span>
                      {hasGuaranteed && (
                        <span className="text-[10px] font-normal text-[var(--warning)]">
                          mín {fmtH(c.guaranteed_prorated)} garantidas
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td right className="text-[var(--text-muted)]">
                    {c.rate_type === 'monthly'
                      ? <span title={`Mensal: ${formatBRL(c.valor_hora)}`}>{formatBRL(c.effective_rate)}</span>
                      : formatBRL(c.effective_rate)
                    }
                  </Td>
                  <AjusteCols c={c} />
                  <Td><NotasPjCell type="consultor" id={c.user_id} yearMonth={yearMonth} notas={c.notas ?? null} canDecide={canSendEmail} canUpload={canSendEmail || user?.id === c.user_id} expectedValue={c.recebimento ?? null} selfService={false} onChanged={(n) => patchNotas(c.user_id, n)} /></Td>
                  <Td right><EnvioCell c={c} /></Td>
                  <Td right>
                    <RelatorioBtn userId={c.user_id} printingUser={printingUser} onClick={(mode) => handleRelatorio(c, mode)} />
                  </Td>
                </Tr>
              )
            })}
            {rows.length > 0 && (
              <Tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-hover)]">
                <td colSpan={7} className="py-2 px-3 text-right font-semibold text-[var(--text)] text-sm">Total (recebimento)</td>
                <Td right className="font-bold text-[var(--brand-purple)]">{formatBRL(rows.reduce((s, c) => s + (c.recebimento ?? 0), 0))}</Td>
                <Td />
                <Td />
                <Td />
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    )
  }

  // ─── Tab: Banco de Horas ──────────────────────────────────────────────────

  function TabBancoHoras({ source }: { source?: ConsultorBancoHoras[] } = {}) {
    const rows = applyFilters(source ?? data?.banco_horas ?? [])
    const { sorted, thProps } = useTableSort(rows, (c, k) => k === 'total' ? (c.recebimento ?? 0) : (c as unknown as Record<string, unknown>)[k])
    return (
      <div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{rows.length} consultor{rows.length !== 1 ? 'es' : ''}</p>
        <Table>
          <Thead>
            <tr>
              <Th {...thProps('nome')}>Consultor</Th>
              <Th right {...thProps('fixed_salary')}>Base Mensal</Th>
              <Th right {...thProps('expected_hours')}>Esperado</Th>
              <Th right {...thProps('horas_trabalhadas')}>Trabalhado</Th>
              <Th right {...thProps('month_balance')}>Saldo Mês</Th>
              <Th right {...thProps('accumulated_balance')}>Acumulado</Th>
              <Th right {...thProps('horas_extras')}>H Extras</Th>
              <Th right>Desconto</Th>
              <Th right>Adiantamento</Th>
              <Th right>Adicional</Th>
              <Th right {...thProps('total')}>Total</Th>
              <Th right>Notas (PJ)</Th>
              <Th right>Envio</Th>
              <Th right>Relatório</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <td colSpan={14} className="py-8 text-center text-[var(--text-light)] text-sm">
                  Nenhum consultor banco de horas no período
                </td>
              </Tr>
            )}
            {sorted.map(c => (
              <Tr key={c.user_id}>
                <Td className="font-medium text-[var(--text)]">{c.nome}</Td>
                <Td right className="font-semibold text-[var(--text)]">{formatBRL(c.fixed_salary)}</Td>
                <Td right className="font-mono text-[var(--text-muted)]">{fmtH(c.expected_hours)}</Td>
                <Td right className="font-mono text-[var(--text)]">{fmtH(c.horas_trabalhadas)}</Td>
                <Td right className={`font-mono ${balanceColor(c.month_balance)}`}>{fmtH(c.month_balance)}</Td>
                <Td right className={`font-mono font-semibold ${balanceColor(c.accumulated_balance)}`}>{fmtH(c.accumulated_balance)}</Td>
                <Td right className={`font-mono font-semibold ${c.horas_extras > 0 ? 'text-[var(--success)]' : 'text-[var(--text-light)]'}`}>
                  {c.horas_extras > 0 ? fmtH(c.horas_extras) : '—'}
                </Td>
                <AjusteCols c={c} totalExtra={c.total_extra > 0
                  ? <div className="text-[10px] text-[var(--success)] font-normal">+{formatBRL(c.total_extra)} extra</div>
                  : undefined} />
                <Td><NotasPjCell type="consultor" id={c.user_id} yearMonth={yearMonth} notas={c.notas ?? null} canDecide={canSendEmail} canUpload={canSendEmail || user?.id === c.user_id} expectedValue={c.recebimento ?? null} selfService={false} onChanged={(n) => patchNotas(c.user_id, n)} /></Td>
                  <Td right><EnvioCell c={c} /></Td>
                <Td right>
                  <RelatorioBtn userId={c.user_id} printingUser={printingUser} onClick={(mode) => handleRelatorio(c, mode)} />
                </Td>
              </Tr>
            ))}
            {rows.length > 0 && (
              <Tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-hover)]">
                <td colSpan={10} className="py-2 px-3 text-right font-semibold text-[var(--text)] text-sm">Total (recebimento)</td>
                <Td right className="font-bold text-[var(--brand-purple)]">{formatBRL(rows.reduce((s, c) => s + (c.recebimento ?? 0), 0))}</Td>
                <Td />
                <Td />
                <Td />
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    )
  }

  // ─── Tab: Fixo ────────────────────────────────────────────────────────────

  function TabFixo({ source }: { source?: ConsultorFixo[] } = {}) {
    const rows = applyFilters((source ?? data?.fixos ?? []) as ConsultorFixo[])
    const { sorted, thProps } = useTableSort(rows)
    return (
      <div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{rows.length} consultor{rows.length !== 1 ? 'es' : ''}</p>
        <Table>
          <Thead>
            <tr>
              <Th {...thProps('nome')}>Consultor</Th>
              <Th right {...thProps('horas_trabalhadas')}>H Trabalhadas</Th>
              <Th right {...thProps('salario_mensal')}>Repasse no Mês</Th>
              <Th right>Desconto</Th>
              <Th right>Adiantamento</Th>
              <Th right>Adicional</Th>
              <Th right>Total</Th>
              <Th right>Notas (PJ)</Th>
              <Th right>Envio</Th>
              <Th right>Relatório</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <td colSpan={10} className="py-8 text-center text-[var(--text-light)] text-sm">
                  Nenhum consultor fixo no período
                </td>
              </Tr>
            )}
            {sorted.map(c => (
              <Tr key={c.user_id}>
                <Td className="font-medium text-[var(--text)]">{c.nome}</Td>
                <Td right className="font-mono text-[var(--text)]">{fmtH(c.horas_trabalhadas)}</Td>
                <Td right className="font-semibold text-[var(--text)]">
                  {formatBRL(c.salario_mensal)}
                </Td>
                <AjusteCols c={c} />
                <Td><NotasPjCell type="consultor" id={c.user_id} yearMonth={yearMonth} notas={c.notas ?? null} canDecide={canSendEmail} canUpload={canSendEmail || user?.id === c.user_id} expectedValue={c.recebimento ?? null} selfService={false} onChanged={(n) => patchNotas(c.user_id, n)} /></Td>
                  <Td right><EnvioCell c={c} /></Td>
                <Td right>
                  <RelatorioBtn userId={c.user_id} printingUser={printingUser} onClick={(mode) => handleRelatorio(c, mode)} />
                </Td>
              </Tr>
            ))}
            {rows.length > 0 && (
              <Tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-hover)]">
                <td colSpan={6} className="py-2 px-3 text-right font-semibold text-[var(--text)] text-sm">Total (recebimento)</td>
                <Td right className="font-bold text-[var(--brand-purple)]">{formatBRL(rows.reduce((s, c) => s + (c.recebimento ?? 0), 0))}</Td>
                <Td />
                <Td />
                <Td />
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    )
  }

  // ─── Tab: Resumo ──────────────────────────────────────────────────────────

  function TabBizify() {
    const bz = data?.bizify
    const h = bz?.horistas ?? []
    const b = bz?.banco_horas ?? []
    const f = bz?.fixos ?? []
    const t = bz?.totais
    const vazio = h.length === 0 && b.length === 0 && f.length === 0
    return (
      <div>
        {/* Cabeçalho Bizify (mesmos campos do consultor, com o logo Bizify) */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-bizify.png" alt="Bizify" className="h-9 w-auto" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Fechamento Bizify</h3>
              <p className="text-xs text-[var(--text-muted)]">Não entra no resultado da ERPSERV</p>
            </div>
          </div>
          {t && (
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">Total Geral Bizify</p>
              <p className="text-lg font-bold text-[var(--text)]">{formatBRL(t.total_geral)}</p>
            </div>
          )}
        </div>

        {h.length > 0 && (
          <section className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Horistas</h4>
            <TabHoristas source={h} />
          </section>
        )}
        {b.length > 0 && (
          <section className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Banco de Horas</h4>
            <TabBancoHoras source={b} />
          </section>
        )}
        {f.length > 0 && (
          <section className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Fixo</h4>
            <TabFixo source={f} />
          </section>
        )}
        {vazio && (
          <p className="py-8 text-center text-[var(--text-light)] text-sm">Nenhum consultor Bizify no período</p>
        )}
      </div>
    )
  }

  function TabResumo() {
    const t = data?.totais
    if (!t) return null

    const tipoRows = [
      { label: 'Horistas',       count: data?.horistas.length ?? 0,    total: t.total_horistas },
      { label: 'Banco de Horas', count: data?.banco_horas.length ?? 0, total: t.total_banco_horas },
      { label: 'Fixo',           count: data?.fixos.length ?? 0,       total: t.total_fixos },
    ]

    const todos = [
      ...data!.horistas,
      ...data!.banco_horas,
      ...data!.fixos,
    ].sort((a, b) => a.nome.localeCompare(b.nome))
    // Lista individual respeita os filtros (busca por nome + "com movimentos").
    const todosFiltrados = applyFilters(todos as ConsultorBase[])
    const totalFiltrado = todosFiltrados.reduce((s, c) => s + (c.total ?? 0), 0)

    // Breakdown por Tipo de Contrato — sempre mostra os 3 tipos (+ "sem tipo" se
    // houver) pra ler como rateio do período. Respeita "com movimentos" + busca
    // por nome (pra bater com as abas), mas IGNORA o filtro de Tipo de Contrato:
    // esta tabela É a quebra por contrato, então mostra todos os tipos sempre.
    const baseSemFiltroContrato = (todos as ConsultorBase[]).filter(c => {
      if (apenasComMovimento && !(c.total > 0 || c.horas_trabalhadas > 0)) return false
      if (filterNome.trim() && !c.nome.toLowerCase().includes(filterNome.trim().toLowerCase())) return false
      return true
    })
    const contratoBuckets: { key: string; label: string; count: number; total: number }[] =
      CONTRACT_ORDER.map(ct => {
        const rows = baseSemFiltroContrato.filter(c => c.contract_type === ct)
        return { key: ct, label: CONTRACT_LABELS[ct], count: rows.length, total: rows.reduce((s, c) => s + (c.total ?? 0), 0) }
      })
    const semTipo = baseSemFiltroContrato.filter(c => c.contract_type == null)
    if (semTipo.length > 0) {
      contratoBuckets.push({
        key: 'null',
        label: contractLabel(null),
        count: semTipo.length,
        total: semTipo.reduce((s, c) => s + (c.total ?? 0), 0),
      })
    }
    const contratoTotalCount = contratoBuckets.reduce((s, b) => s + b.count, 0)
    const contratoTotalValor = contratoBuckets.reduce((s, b) => s + b.total, 0)

    return (
      <div className="space-y-6">
        {/* Tabela por tipo */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--text-light)] uppercase tracking-wide font-medium">Por tipo de vínculo</p>
            <button
              onClick={handlePrintResumo}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <Printer size={12} /> Imprimir
            </button>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Tipo de Vínculo</Th>
                <Th right>Consultores</Th>
                <Th right>Total</Th>
              </tr>
            </Thead>
            <Tbody>
              {tipoRows.map(r => (
                <Tr key={r.label}>
                  <Td>{r.label}</Td>
                  <Td right className="text-[var(--text-muted)]">{r.count}</Td>
                  <Td right className="font-mono text-[var(--text)]">{formatBRL(r.total)}</Td>
                </Tr>
              ))}
              <Tr className="border-t-2 border-[var(--brand-purple)]" baseBackground="rgba(124,58,237,0.06)">
                <Td style={{ color: '#6D28D9', fontWeight: 700 }}>Total Geral</Td>
                <Td right style={{ color: '#6D28D9', fontWeight: 600 }}>{todos.length}</Td>
                <Td right className="text-base" style={{ color: '#6D28D9', fontWeight: 700 }}>{formatBRL(t.total_geral)}</Td>
              </Tr>
            </Tbody>
          </Table>
        </div>

        {/* Tabela por tipo de contrato */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--text-light)] uppercase tracking-wide font-medium">Por tipo de contrato</p>
            <button
              onClick={downloadAllExcel}
              disabled={downloadingAllExcel}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
              title={contractType ? `Exportar ${CONTRACT_LABELS[contractType]} para Excel` : 'Exportar todos para Excel'}
            >
              {downloadingAllExcel ? <RefreshCw size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
              {downloadingAllExcel ? 'Baixando…' : 'Exportar Excel'}
            </button>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Tipo de Contrato</Th>
                <Th right>Consultores</Th>
                <Th right>Total</Th>
              </tr>
            </Thead>
            <Tbody>
              {contratoBuckets.map(r => (
                <Tr key={r.key}>
                  <Td>{r.label}</Td>
                  <Td right className="text-[var(--text-muted)]">{r.count}</Td>
                  <Td right className="font-mono text-[var(--text)]">{formatBRL(r.total)}</Td>
                </Tr>
              ))}
              <Tr className="border-t-2 border-[var(--brand-purple)]" baseBackground="rgba(124,58,237,0.06)">
                <Td style={{ color: '#6D28D9', fontWeight: 700 }}>Total Geral</Td>
                <Td right style={{ color: '#6D28D9', fontWeight: 600 }}>{contratoTotalCount}</Td>
                <Td right className="text-base" style={{ color: '#6D28D9', fontWeight: 700 }}>{formatBRL(contratoTotalValor)}</Td>
              </Tr>
            </Tbody>
          </Table>
        </div>

        {/* Lista individual de todos os consultores */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--text-light)] uppercase tracking-wide font-medium">
              Todos os consultores ({todosFiltrados.length})
            </p>
            <button
              onClick={handlePrintTodos}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--brand-purple)] hover:text-[var(--brand-purple)] transition-colors"
            >
              <Printer size={12} /> Imprimir lista
            </button>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Consultor</Th>
                <Th>E-mail</Th>
                <Th right>Total a Pagar</Th>
              </tr>
            </Thead>
            <Tbody>
              {todosFiltrados.map(c => (
                <Tr key={c.user_id}>
                  <Td className="font-medium text-[var(--text)]">{c.nome}</Td>
                  <Td className="text-[var(--text-muted)]">{c.email ?? '—'}</Td>
                  <Td right className="font-semibold text-[var(--text)]">{formatBRL(c.total)}</Td>
                </Tr>
              ))}
              <Tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-hover)]">
                <td colSpan={2} className="py-2 px-3 text-right font-semibold text-[var(--text)] text-sm">Total</td>
                <Td right className="font-bold text-[var(--brand-purple)]">{formatBRL(totalFiltrado)}</Td>
              </Tr>
            </Tbody>
          </Table>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Fechamento — Consultores">
      <div className="space-y-6">

        <PageHeader
          icon={Users}
          title="Fechamento de Consultores"
          subtitle={`Custo mensal por tipo de vínculo — ${fmtYearMonth(yearMonth)}`}
          actions={
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="month"
                value={yearMonth}
                onChange={e => setYearMonth(e.target.value)}
                className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-purple)]"
              />
              <Button size="sm" variant="secondary" onClick={downloadAllExcel} disabled={downloadingAllExcel} icon={FileSpreadsheet} loading={downloadingAllExcel}>
                {downloadingAllExcel ? 'Baixando…' : 'Exportar Excel'}
              </Button>
              <Button size="sm" variant="secondary" onClick={load} disabled={loading} icon={RefreshCw} loading={loading}>
                Atualizar
              </Button>
            </div>
          }
        />

        {/* Summary cards */}
        {data && !loading && (() => {
          const totalCount = data.horistas.length + data.banco_horas.length + data.fixos.length
          const totalValor = data.totais.total_geral
          const breakdown = [
            { key: 'horistas',  label: 'Horistas',      valor: data.totais.total_horistas,    count: data.horistas.length },
            { key: 'bh',        label: 'Banco de Horas', valor: data.totais.total_banco_horas, count: data.banco_horas.length },
            { key: 'fixo',      label: 'Fixo',          valor: data.totais.total_fixos,       count: data.fixos.length },
          ]
          const pct = (v: number) => totalValor > 0 ? Math.round((v / totalValor) * 100) : 0
          const maior = breakdown.reduce((a, b) => b.valor > a.valor ? b : a)
          const mediaPorConsultor = totalCount > 0 ? totalValor / totalCount : 0

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Cards menores (3 vínculos) — neutros via tokens */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:col-span-2 gap-3">
                {breakdown.map(b => (
                  <div key={b.key} className="rounded-xl p-4 border" style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--brand-card-shadow)',
                  }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{b.label}</div>
                    <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatBRL(b.valor)}</div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span style={{ color: 'var(--text-light)' }}>{b.count} consultor{b.count !== 1 ? 'es' : ''}</span>
                      <span className="font-semibold" style={{ color: 'var(--primary)' }}>{pct(b.valor)}%</span>
                    </div>
                    {/* Barra de % */}
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${pct(b.valor)}%`,
                        background: 'var(--primary)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Card destaque — Total Geral roxo sólido + breakdown rápido */}
              <div className="rounded-xl p-5 relative overflow-hidden" style={{
                background: 'linear-gradient(135deg, #6D28D9 0%, #7C3AED 60%, #8B5CF6 100%)',
                color: '#FFFFFF',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.25)',
              }}>
                <div className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">Total Geral</div>
                <div className="text-3xl font-bold tracking-tight">{formatBRL(totalValor)}</div>
                <div className="text-xs opacity-85 mt-1 mb-3">
                  {totalCount} consultor{totalCount !== 1 ? 'es' : ''} · {maior.label} lidera ({pct(maior.valor)}%)
                </div>
                <div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'rgba(255,255,255,0.20)' }}>
                  <div>
                    <div className="opacity-75">Média/consultor</div>
                    <div className="font-bold mt-0.5">{formatBRL(mediaPorConsultor)}</div>
                  </div>
                  <div className="text-right">
                    <div className="opacity-75">Tipos com movimento</div>
                    <div className="font-bold mt-0.5">{breakdown.filter(b => b.count > 0).length} de {breakdown.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Tabs */}
        <div className="border-b flex gap-1 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-2 text-sm border-b-2 transition-colors"
                style={{
                  borderColor: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 500,
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setApenasComMovimento(true)}
              className="px-3 py-1.5 transition-colors"
              style={apenasComMovimento
                ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)' }}
            >
              Com movimentos
            </button>
            <button
              onClick={() => setApenasComMovimento(false)}
              className="px-3 py-1.5 transition-colors"
              style={!apenasComMovimento
                ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)' }}
            >
              Todos
            </button>
          </div>

          {/* Filtro: Tipo de Contrato (Todos / Cooperado / CLT / PJ) */}
          <div className="flex rounded-lg overflow-hidden border text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setContractType(null)}
              className="px-3 py-1.5 transition-colors"
              style={contractType === null
                ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)' }}
            >
              Todos
            </button>
            {CONTRACT_ORDER.map(ct => (
              <button
                key={ct}
                onClick={() => setContractType(ct)}
                className="px-3 py-1.5 transition-colors border-l"
                style={contractType === ct
                  ? { background: 'var(--primary)', color: 'var(--primary-fg)', borderColor: 'var(--border)' }
                  : { background: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                {CONTRACT_LABELS[ct]}
              </button>
            ))}
          </div>

          {/* Filtro: status de envio (Todos / Enviado / Não enviado) */}
          <div className="flex rounded-lg overflow-hidden border text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
            {([['todos', 'Todos'], ['enviado', 'Enviado'], ['nao_enviado', 'Não enviado']] as const).map(([v, lbl], i) => (
              <button
                key={v}
                onClick={() => setEnvioFilter(v)}
                className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l' : ''}`}
                style={envioFilter === v
                  ? { background: 'var(--primary)', color: 'var(--primary-fg)', borderColor: 'var(--border)' }
                  : { background: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar consultor..."
              value={filterNome}
              onChange={e => setFilterNome(e.target.value)}
              className="w-full rounded-lg py-1.5 text-xs focus:outline-none ds-input"
              // paddingLeft/Right inline para vencer o shorthand `padding` do .ds-input (senão o texto fica atrás da lupa).
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', paddingLeft: '2.25rem', paddingRight: '1.75rem' }}
            />
            {filterNome && (
              <button onClick={() => setFilterNome('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'var(--text-muted)' }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="min-h-[200px]">
          {loading ? (
            <SkeletonTable rows={5} cols={5} />
          ) : !data ? (
            <EmptyState icon={FileText} title="Nenhum dado" description="Selecione um período para visualizar o fechamento." />
          ) : (
            <>
              {tab === 'horistas'    && <TabHoristas />}
              {tab === 'banco_horas' && <TabBancoHoras />}
              {tab === 'fixo'        && <TabFixo />}
              {tab === 'resumo'      && <TabResumo />}
              {tab === 'bizify'      && <TabBizify />}
            </>
          )}
        </div>

      </div>
      {/* Modal de visualização do relatório */}
      {reportHtml && (() => {
        // Total do consultor alvo (lookup em `data` por user_id) — só pra exibir no header do painel.
        const targetTotal = reportTarget
          ? [...(data?.horistas ?? []), ...(data?.banco_horas ?? []), ...(data?.fixos ?? [])]
              .find(c => c.user_id === reportTarget.userId)?.total
          : undefined
        const closeModal = () => { setReportHtml(null); setReportTarget(null) }
        return (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)', paddingTop: 'var(--banner-h, 0px)' }}>
          {/* Barra de topo slim — só o título */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Relatório</span>
          </div>

          {/* Corpo: split horizontal — preview à esquerda, painel de ações à direita */}
          <div className="flex-1 flex min-h-0 flex-col md:flex-row">
            {/* LEFT — preview do documento, largura limitada e centralizada */}
            <div className="flex-1 min-h-0 overflow-auto flex justify-center p-3 md:p-6" style={{ background: 'var(--bg)' }}>
              <iframe
                ref={reportIframeRef}
                srcDoc={reportHtml}
                title="Relatório"
                className="w-full h-full"
                style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 820 }}
              />
            </div>

            {/* RIGHT — painel de ações fixo */}
            <aside
              className="shrink-0 w-full md:w-[300px] flex flex-col gap-3 p-4 overflow-y-auto border-t md:border-t-0 md:border-l"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              {/* Header opcional — consultor + período + total */}
              {reportTarget && (
                <div className="pb-3 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{reportTarget.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtYearMonth(yearMonth)}</p>
                  {targetTotal != null && (
                    <p className="text-lg font-bold mt-2" style={{ color: 'var(--primary)' }}>{formatBRL(targetTotal)}</p>
                  )}
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

              {canSendEmail && reportTarget && (
                <Button
                  size="sm"
                  icon={Mail}
                  className="w-full !justify-start"
                  title={`Enviar para ${reportTarget.name} (cópia financeiro)`}
                  onClick={openCompose}
                >
                  Enviar e-mail
                </Button>
              )}

              {reportTarget && (
                <Button
                  size="sm"
                  icon={FileSpreadsheet}
                  loading={downloadingExcel}
                  className="w-full !justify-start"
                  onClick={downloadExcel}
                >
                  {downloadingExcel ? 'Baixando…' : 'Baixar Excel'}
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                icon={X}
                className="w-full !justify-start mt-auto"
                onClick={closeModal}
              >
                Fechar
              </Button>
            </aside>
          </div>
        </div>
        )
      })()}

      {/* Dialog de composição/preview do e-mail */}
      {composeOpen && reportTarget && (
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
                  {reportTarget.name} · {fmtYearMonth(yearMonth)}
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
