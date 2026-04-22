'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { ChevronDown, ChevronRight, Printer, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsultorBase {
  user_id: number
  nome: string
  type: string
  consultant_type: string
  horas_trabalhadas: number
  valor_hora: number
  rate_type: string
  effective_rate: number
  horas_a_pagar: number
  total: number
}

interface ConsultorHorista extends ConsultorBase {}

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
  total_geral: number
}

interface IndexData {
  horistas: ConsultorHorista[]
  banco_horas: ConsultorBancoHoras[]
  fixos: ConsultorFixo[]
  totais: Totais
}

interface ApontamentoRow {
  id: number
  data: string
  projeto: string
  projeto_codigo: string
  cliente: string
  tipo_contrato_code: string
  tipo_contrato_nome: string
  horas: number
  status: string
  ticket?: string
  titulo?: string
  solicitante?: string
  observacao?: string
}

type Tab = 'horistas' | 'banco_horas' | 'fixo' | 'resumo'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYearMonth(input: string): string {
  return input
}

function fmtYearMonth(ym: string): string {
  if (!ym) return ''
  const [year, month] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month) - 1]}/${year}`
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtH(h: number): string {
  return `${h.toFixed(2)}h`
}

function balanceColor(val: number): string {
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-zinc-400'
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  conflicted: 'Conflito',
  rejected: 'Rejeitado',
  adjustment_requested: 'Aj. Solicitado',
}

const printStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; }
  .logo { font-size: 22px; font-weight: 900; color: #7c3aed; letter-spacing: -0.5px; }
  .logo span { color: #a78bfa; }
  .meta { text-align: right; font-size: 11px; color: #666; }
  .meta strong { font-size: 14px; color: #1a1a1a; display: block; margin-bottom: 4px; }
  .section-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #7c3aed; padding: 8px 0; margin: 16px 0 8px; }
  .section-title { font-size: 13px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-total { font-size: 13px; font-weight: 700; color: #7c3aed; }
  .consultor-block { margin-bottom: 16px; break-inside: avoid; }
  .consultor-name { font-size: 12px; font-weight: 700; background: #f3f4f6; padding: 6px 10px; border-left: 3px solid #7c3aed; margin-bottom: 4px; }
  .consultor-summary { font-size: 11px; color: #555; padding: 2px 10px 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #f3f4f6; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; padding: 5px 8px; text-align: left; color: #555; }
  td { font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:last-child td { border-bottom: none; }
  .right { text-align: right; }
  .total-box { background: #7c3aed; color: #fff; padding: 12px 16px; margin-top: 20px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
  .total-box-label { font-size: 13px; font-weight: 700; }
  .total-box-value { font-size: 18px; font-weight: 900; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

function openPrintWindow(html: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title><style>${printStyles}</style></head><body>${html}</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 300)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FechamentoConsultorPage() {
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [tab, setTab] = useState<Tab>('horistas')
  const [data, setData] = useState<IndexData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedUser, setExpandedUser] = useState<number | null>(null)
  const [apontamentos, setApontamentos] = useState<Record<number, ApontamentoRow[]>>({})
  const [loadingApt, setLoadingApt] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    if (!yearMonth) return
    setLoading(true)
    setData(null)
    setExpandedUser(null)
    setApontamentos({})
    try {
      const res = await api.get<{ data: IndexData }>(`/fechamento-consultor/${yearMonth}`)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => { load() }, [load])

  const toggleExpand = useCallback(async (userId: number) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (!apontamentos[userId]) {
      setLoadingApt(p => ({ ...p, [userId]: true }))
      try {
        const res = await api.get<{ data: ApontamentoRow[] }>(`/fechamento-consultor/${userId}/${yearMonth}/apontamentos`)
        setApontamentos(p => ({ ...p, [userId]: res.data }))
      } finally {
        setLoadingApt(p => ({ ...p, [userId]: false }))
      }
    }
  }, [expandedUser, apontamentos, yearMonth])

  // ─── Print helpers ──────────────────────────────────────────────────────────

  function buildApontamentosTableRows(rows: ApontamentoRow[]): string {
    if (!rows.length) return '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:12px">Sem apontamentos</td></tr>'
    return rows.map(r => `
      <tr>
        <td>${fmtDate(r.data)}</td>
        <td>${r.projeto_codigo} — ${r.projeto}</td>
        <td>${r.cliente}</td>
        <td>${r.tipo_contrato_nome}</td>
        <td>${r.ticket ?? '—'}</td>
        <td class="right">${fmtH(r.horas)}</td>
      </tr>
    `).join('')
  }

  function handlePrintHoristas() {
    if (!data) return
    const rows = data.horistas
    let html = `<div class="page"><div class="header"><div class="logo">ERP<span>Serv</span></div><div class="meta"><strong>Fechamento — Horistas</strong>${fmtYearMonth(yearMonth)}</div></div>`
    for (const c of rows) {
      const apts = apontamentos[c.user_id] ?? []
      html += `<div class="consultor-block">
        <div class="consultor-name">${c.nome}</div>
        <div class="consultor-summary">Taxa/h: ${formatBRL(c.effective_rate)} &nbsp;|&nbsp; Horas: ${fmtH(c.horas_trabalhadas)} &nbsp;|&nbsp; Total: ${formatBRL(c.total)}</div>
        <table><thead><tr><th>Data</th><th>Projeto</th><th>Cliente</th><th>Tipo</th><th>Ticket</th><th class="right">Horas</th></tr></thead><tbody>${buildApontamentosTableRows(apts)}</tbody></table>
      </div>`
    }
    html += `<div class="total-box"><span class="total-box-label">TOTAL HORISTAS</span><span class="total-box-value">${formatBRL(data.totais.total_horistas)}</span></div></div>`
    openPrintWindow(html)
  }

  function handlePrintBancoHoras() {
    if (!data) return
    const rows = data.banco_horas
    let html = `<div class="page"><div class="header"><div class="logo">ERP<span>Serv</span></div><div class="meta"><strong>Fechamento — Banco de Horas</strong>${fmtYearMonth(yearMonth)}</div></div>`
    for (const c of rows) {
      const apts = apontamentos[c.user_id] ?? []
      html += `<div class="consultor-block">
        <div class="consultor-name">${c.nome}</div>
        <div class="consultor-summary">
          Base mensal: ${formatBRL(c.fixed_salary)} &nbsp;|&nbsp; Dias úteis: ${c.working_days} &nbsp;|&nbsp; Esperado: ${fmtH(c.expected_hours)} &nbsp;|&nbsp; Trabalhado: ${fmtH(c.horas_trabalhadas)} &nbsp;|&nbsp;
          Saldo mês: ${fmtH(c.month_balance)} &nbsp;|&nbsp; Acumulado: ${fmtH(c.accumulated_balance)} &nbsp;|&nbsp;
          H extras: ${fmtH(c.horas_extras)} × ${formatBRL(c.valor_hora_extra)} = ${formatBRL(c.total_extra)} &nbsp;|&nbsp; <strong>Total: ${formatBRL(c.total)}</strong>
        </div>
        <table><thead><tr><th>Data</th><th>Projeto</th><th>Cliente</th><th>Tipo</th><th>Ticket</th><th class="right">Horas</th></tr></thead><tbody>${buildApontamentosTableRows(apts)}</tbody></table>
      </div>`
    }
    html += `<div class="total-box"><span class="total-box-label">TOTAL BANCO DE HORAS</span><span class="total-box-value">${formatBRL(data.totais.total_banco_horas)}</span></div></div>`
    openPrintWindow(html)
  }

  function handlePrintFixo() {
    if (!data) return
    const rows = data.fixos as ConsultorFixo[]
    let html = `<div class="page"><div class="header"><div class="logo">ERP<span>Serv</span></div><div class="meta"><strong>Fechamento — Fixo</strong>${fmtYearMonth(yearMonth)}</div></div>
      <table><thead><tr><th>Consultor</th><th class="right">H Trabalhadas</th><th class="right">Salário Mensal</th></tr></thead><tbody>`
    for (const c of rows) {
      html += `<tr><td>${c.nome}</td><td class="right">${fmtH(c.horas_trabalhadas)}</td><td class="right">${formatBRL(c.salario_mensal)}</td></tr>`
    }
    html += `</tbody></table><div class="total-box"><span class="total-box-label">TOTAL FIXO</span><span class="total-box-value">${formatBRL(data.totais.total_fixos)}</span></div></div>`
    openPrintWindow(html)
  }

  // ─── Expandable row apontamentos ────────────────────────────────────────────

  function ApontamentosExpanded({ userId }: { userId: number }) {
    if (loadingApt[userId]) {
      return <tr><td colSpan={10} className="py-4 text-center"><RefreshCw size={16} className="animate-spin text-zinc-400 inline" /></td></tr>
    }
    const rows = apontamentos[userId] ?? []
    if (!rows.length) {
      return <tr><td colSpan={10} className="py-3 text-center text-zinc-500 text-xs">Nenhum apontamento no período</td></tr>
    }
    return (
      <>
        <tr className="bg-zinc-800/30">
          <td colSpan={10} className="pt-2 pb-0 px-8">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-400">
                  <th className="text-left py-1 font-medium w-24">Data</th>
                  <th className="text-left py-1 font-medium">Projeto</th>
                  <th className="text-left py-1 font-medium">Cliente</th>
                  <th className="text-left py-1 font-medium">Tipo</th>
                  <th className="text-left py-1 font-medium">Ticket</th>
                  <th className="text-right py-1 font-medium w-16">Horas</th>
                  <th className="text-left py-1 font-medium w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-zinc-700/30">
                    <td className="py-1 text-zinc-300">{fmtDate(r.data)}</td>
                    <td className="py-1 text-zinc-300">
                      <span className="text-zinc-500 mr-1">{r.projeto_codigo}</span>
                      {r.projeto}
                    </td>
                    <td className="py-1 text-zinc-300">{r.cliente}</td>
                    <td className="py-1 text-zinc-400">{r.tipo_contrato_nome}</td>
                    <td className="py-1 text-zinc-400">{r.ticket ?? '—'}</td>
                    <td className="py-1 text-right text-zinc-200 font-mono">{fmtH(r.horas)}</td>
                    <td className="py-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        r.status === 'approved' ? 'bg-emerald-900/40 text-emerald-400' :
                        r.status === 'pending'  ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-zinc-700 text-zinc-400'
                      }`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
        <tr className="bg-zinc-800/30"><td colSpan={10} className="pb-3" /></tr>
      </>
    )
  }

  // ─── Tab: Horistas ──────────────────────────────────────────────────────────

  function TabHoristas() {
    const rows = data?.horistas ?? []
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-zinc-400">
            {rows.length} consultor{rows.length !== 1 ? 'es' : ''}
          </div>
          <Button size="sm" variant="outline" onClick={handlePrintHoristas} className="gap-2">
            <Printer size={14} /> Imprimir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3 font-medium"></th>
                <th className="text-left py-2 px-3 font-medium">Consultor</th>
                <th className="text-right py-2 px-3 font-medium">H Trabalhadas</th>
                <th className="text-right py-2 px-3 font-medium">Taxa/h</th>
                <th className="text-right py-2 px-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-zinc-500">Nenhum consultor horista no período</td></tr>
              )}
              {rows.map(c => (
                <>
                  <tr
                    key={c.user_id}
                    className="border-b border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                    onClick={() => toggleExpand(c.user_id)}
                  >
                    <td className="py-2 px-3 w-8 text-zinc-500">
                      {expandedUser === c.user_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="py-2 px-3 font-medium text-zinc-100">{c.nome}</td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmtH(c.horas_trabalhadas)}</td>
                    <td className="py-2 px-3 text-right text-zinc-400">
                      {c.rate_type === 'monthly'
                        ? <span title={`Mensal: ${formatBRL(c.valor_hora)}`}>{formatBRL(c.effective_rate)}</span>
                        : formatBRL(c.effective_rate)
                      }
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-zinc-100">{formatBRL(c.total)}</td>
                  </tr>
                  {expandedUser === c.user_id && <ApontamentosExpanded userId={c.user_id} />}
                </>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                  <td colSpan={4} className="py-2 px-3 text-right font-semibold text-zinc-300">Total</td>
                  <td className="py-2 px-3 text-right font-bold text-violet-400">{formatBRL(data?.totais.total_horistas ?? 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ─── Tab: Banco de Horas ─────────────────────────────────────────────────────

  function TabBancoHoras() {
    const rows = data?.banco_horas ?? []
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-zinc-400">
            {rows.length} consultor{rows.length !== 1 ? 'es' : ''}
          </div>
          <Button size="sm" variant="outline" onClick={handlePrintBancoHoras} className="gap-2">
            <Printer size={14} /> Imprimir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3 font-medium w-8"></th>
                <th className="text-left py-2 px-3 font-medium">Consultor</th>
                <th className="text-right py-2 px-3 font-medium">Base Mensal</th>
                <th className="text-right py-2 px-3 font-medium">Esperado</th>
                <th className="text-right py-2 px-3 font-medium">Trabalhado</th>
                <th className="text-right py-2 px-3 font-medium">Saldo mês</th>
                <th className="text-right py-2 px-3 font-medium">Acumulado</th>
                <th className="text-right py-2 px-3 font-medium">H Extras</th>
                <th className="text-right py-2 px-3 font-medium">Taxa h.extra</th>
                <th className="text-right py-2 px-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-zinc-500">Nenhum consultor banco de horas no período</td></tr>
              )}
              {rows.map(c => (
                <>
                  <tr
                    key={c.user_id}
                    className="border-b border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                    onClick={() => toggleExpand(c.user_id)}
                  >
                    <td className="py-2 px-3 text-zinc-500">
                      {expandedUser === c.user_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="py-2 px-3 font-medium text-zinc-100">{c.nome}</td>
                    <td className="py-2 px-3 text-right font-semibold text-zinc-200">{formatBRL(c.fixed_salary)}</td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-400">{fmtH(c.expected_hours)}</td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmtH(c.horas_trabalhadas)}</td>
                    <td className={`py-2 px-3 text-right font-mono ${balanceColor(c.month_balance)}`}>{fmtH(c.month_balance)}</td>
                    <td className={`py-2 px-3 text-right font-mono font-semibold ${balanceColor(c.accumulated_balance)}`}>{fmtH(c.accumulated_balance)}</td>
                    <td className={`py-2 px-3 text-right font-mono font-semibold ${c.horas_extras > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {c.horas_extras > 0 ? fmtH(c.horas_extras) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-400 text-xs">
                      {c.valor_hora_extra > 0 ? formatBRL(c.valor_hora_extra) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-zinc-100">
                      {formatBRL(c.total)}
                      {c.total_extra > 0 && (
                        <div className="text-[10px] text-emerald-400 font-normal">+{formatBRL(c.total_extra)} extras</div>
                      )}
                    </td>
                  </tr>
                  {expandedUser === c.user_id && <ApontamentosExpanded userId={c.user_id} />}
                </>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                  <td colSpan={9} className="py-2 px-3 text-right font-semibold text-zinc-300">Total</td>
                  <td className="py-2 px-3 text-right font-bold text-violet-400">{formatBRL(data?.totais.total_banco_horas ?? 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ─── Tab: Fixo ────────────────────────────────────────────────────────────────

  function TabFixo() {
    const rows = (data?.fixos ?? []) as ConsultorFixo[]
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-zinc-400">
            {rows.length} consultor{rows.length !== 1 ? 'es' : ''}
          </div>
          <Button size="sm" variant="outline" onClick={handlePrintFixo} className="gap-2">
            <Printer size={14} /> Imprimir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3 font-medium w-8"></th>
                <th className="text-left py-2 px-3 font-medium">Consultor</th>
                <th className="text-right py-2 px-3 font-medium">H Trabalhadas</th>
                <th className="text-right py-2 px-3 font-medium">Salário Mensal</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-zinc-500">Nenhum consultor fixo no período</td></tr>
              )}
              {rows.map(c => (
                <>
                  <tr
                    key={c.user_id}
                    className="border-b border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                    onClick={() => toggleExpand(c.user_id)}
                  >
                    <td className="py-2 px-3 text-zinc-500">
                      {expandedUser === c.user_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="py-2 px-3 font-medium text-zinc-100">{c.nome}</td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmtH(c.horas_trabalhadas)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-zinc-100">{formatBRL(c.salario_mensal)}</td>
                  </tr>
                  {expandedUser === c.user_id && <ApontamentosExpanded userId={c.user_id} />}
                </>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                  <td colSpan={3} className="py-2 px-3 text-right font-semibold text-zinc-300">Total</td>
                  <td className="py-2 px-3 text-right font-bold text-violet-400">{formatBRL(data?.totais.total_fixos ?? 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ─── Tab: Resumo ──────────────────────────────────────────────────────────────

  function TabResumo() {
    const t = data?.totais
    if (!t) return null
    return (
      <div className="max-w-lg space-y-3">
        <div className="rounded-lg border border-zinc-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800/50 text-zinc-400 text-xs uppercase">
                <th className="text-left py-2 px-4 font-medium">Tipo</th>
                <th className="text-right py-2 px-4 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-800">
                <td className="py-3 px-4 text-zinc-300">Horistas ({data?.horistas.length ?? 0})</td>
                <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatBRL(t.total_horistas)}</td>
              </tr>
              <tr className="border-t border-zinc-800">
                <td className="py-3 px-4 text-zinc-300">Banco de Horas ({data?.banco_horas.length ?? 0})</td>
                <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatBRL(t.total_banco_horas)}</td>
              </tr>
              <tr className="border-t border-zinc-800">
                <td className="py-3 px-4 text-zinc-300">Fixo ({data?.fixos.length ?? 0})</td>
                <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatBRL(t.total_fixos)}</td>
              </tr>
              <tr className="border-t-2 border-violet-500 bg-violet-950/30">
                <td className="py-3 px-4 font-bold text-violet-300">Total Geral</td>
                <td className="py-3 px-4 text-right font-bold text-violet-300 text-base">{formatBRL(t.total_geral)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'horistas',    label: 'Horistas' },
    { key: 'banco_horas', label: 'Banco de Horas' },
    { key: 'fixo',        label: 'Fixo' },
    { key: 'resumo',      label: 'Resumo' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Fechamento de Consultores</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Custo mensal por tipo de vínculo</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={yearMonth}
            onChange={e => setYearMonth(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Horistas', value: data.totais.total_horistas, count: data.horistas.length },
            { label: 'Banco de Horas', value: data.totais.total_banco_horas, count: data.banco_horas.length },
            { label: 'Fixo', value: data.totais.total_fixos, count: data.fixos.length },
            { label: 'Total Geral', value: data.totais.total_geral, count: data.horistas.length + data.banco_horas.length + data.fixos.length, highlight: true },
          ].map(card => (
            <div key={card.label} className={`rounded-lg p-4 border ${card.highlight ? 'bg-violet-950/40 border-violet-700' : 'bg-zinc-800/40 border-zinc-700'}`}>
              <div className="text-xs text-zinc-400 mb-1">{card.label}</div>
              <div className={`text-lg font-bold ${card.highlight ? 'text-violet-300' : 'text-zinc-100'}`}>{formatBRL(card.value)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{card.count} consultor{card.count !== 1 ? 'es' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-700 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : !data ? null : (
          <>
            {tab === 'horistas'    && <TabHoristas />}
            {tab === 'banco_horas' && <TabBancoHoras />}
            {tab === 'fixo'        && <TabFixo />}
            {tab === 'resumo'      && <TabResumo />}
          </>
        )}
      </div>
    </div>
  )
}
