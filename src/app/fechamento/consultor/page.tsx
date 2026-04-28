'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { RefreshCw, Printer, FileText, Users } from 'lucide-react'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Button, SkeletonTable, EmptyState,
} from '@/components/ds'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsultorBase {
  user_id: number
  nome: string
  email: string
  type: string
  consultant_type: string
  horas_trabalhadas: number
  valor_hora: number
  rate_type: string
  effective_rate: number
  horas_a_pagar: number
  total: number
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
  total_geral: number
}

interface IndexData {
  horistas: ConsultorBase[]
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
  observacao?: string
  consultant_extra_pct?: number | null
  valor_extra?: number | null
}

type Tab = 'horistas' | 'banco_horas' | 'fixo' | 'resumo'

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

function fmtH(h: number): string {
  return `${h.toFixed(2)}h`
}

function balanceColor(val: number): string {
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-zinc-400'
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
  .client-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin: 8px 0 4px; border-bottom: 1px solid #ddd6fe; }
  .client-name { font-size: 11px; font-weight: 700; color: #1a1a1a; }
  .client-total { font-size: 11px; color: #7c3aed; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; padding: 5px 8px; text-align: left; color: #555; border-bottom: 1px solid #ddd; }
  td { font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }
  .right { text-align: right; }
  .total-box { background: #7c3aed; color: #fff; padding: 12px 18px; margin-top: 24px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
  .total-label { font-size: 13px; font-weight: 700; }
  .total-value { font-size: 20px; font-weight: 900; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

function buildReport(
  consultor: ConsultorBase | ConsultorBancoHoras | ConsultorFixo,
  apontamentos: ApontamentoRow[],
  yearMonth: string
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
      <div class="summary-item"><div class="summary-label">Base Mensal</div><div class="summary-value">${formatBRL(c.fixed_salary)}</div></div>
      <div class="summary-item"><div class="summary-label">Saldo Acumulado</div><div class="summary-value">${fmtH(c.accumulated_balance)}</div></div>
      <div class="summary-item"><div class="summary-label">H Extras</div><div class="summary-value">${c.horas_extras > 0 ? fmtH(c.horas_extras) : '—'}</div></div>
    `
  } else if ('salario_mensal' in consultor) {
    const c = consultor as ConsultorFixo
    summaryExtra = `
      <div class="summary-item"><div class="summary-label">Salário Mensal</div><div class="summary-value">${formatBRL(c.salario_mensal)}</div></div>
    `
  } else {
    summaryExtra = `
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
          <tr>
            <td>${fmtDate(r.data)}</td>
            <td><span style="color:#888;margin-right:4px">${r.projeto_codigo}</span>${r.projeto}</td>
            <td>${r.ticket ?? '—'}</td>
            <td>${r.titulo ? r.titulo.slice(0, 70) : (r.observacao ? r.observacao.slice(0, 70) : '—')}</td>
            <td class="right">${fmtH(r.horas)}${r.consultant_extra_pct ? `<span style="color:#16a34a;font-size:10px;margin-left:4px">+${r.consultant_extra_pct}%${r.valor_extra ? ` (${formatBRL(r.valor_extra)})` : ''}</span>` : ''}</td>
          </tr>
        `).join('')
        clienteBlocksHtml += `
          <div class="client-header">
            <span class="client-name">${cliente}</span>
            <span class="client-total">${fmtH(clienteHoras)}</span>
          </div>
          <table>
            <thead><tr><th>Data</th><th>Projeto</th><th>Ticket</th><th>Descrição</th><th class="right">Horas / Extra</th></tr></thead>
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

  const totalHoras = apontamentos.reduce((s, r) => s + r.horas, 0)

  return `
    <div class="page">
      <div class="header">
        <div class="logo"><img src="${window.location.origin}/logo.png" alt="ERPServ Consultoria" /></div>
        <div class="meta">
          <strong>${consultor.nome}</strong>
          Fechamento de Consultores &nbsp;·&nbsp; ${fmtYearMonth(yearMonth)}
        </div>
      </div>
      <div class="summary-box">
        <div class="summary-item"><div class="summary-label">Total Horas</div><div class="summary-value">${fmtH(totalHoras)}</div></div>
        ${summaryExtra}
        <div class="summary-item"><div class="summary-label">Total a Pagar</div><div class="summary-value" style="color:#7c3aed">${formatBRL(consultor.total)}</div></div>
      </div>
      ${sectionsHtml}
      <div class="total-box">
        <span class="total-label">TOTAL A PAGAR — ${consultor.nome.toUpperCase()}</span>
        <span class="total-value">${formatBRL(consultor.total)}</span>
      </div>
    </div>
  `
}

function openPrintWindow(html: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title><style>${printStyles}</style></head><body>${html}</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 300)
}

// ─── RelatorioBtn ─────────────────────────────────────────────────────────────

function RelatorioBtn({ userId, printingUser, onClick }: {
  userId: number
  printingUser: number | null
  onClick: () => void
}) {
  const loading = printingUser === userId
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Gerar relatório individual"
      className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors"
    >
      {loading ? <RefreshCw size={13} className="animate-spin" /> : <Printer size={13} />}
      Relatório
    </button>
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

  const load = useCallback(async () => {
    if (!yearMonth) return
    setLoading(true)
    setData(null)
    try {
      const res = await api.get<{ data: IndexData }>(`/fechamento-consultor/${yearMonth}`)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => { load() }, [load])

  async function handleRelatorio(consultor: ConsultorBase | ConsultorBancoHoras | ConsultorFixo) {
    setPrintingUser(consultor.user_id)
    try {
      const res = await api.get<{ data: ApontamentoRow[] }>(
        `/fechamento-consultor/${consultor.user_id}/${yearMonth}/apontamentos`
      )
      const html = buildReport(consultor, res.data ?? [], yearMonth)
      openPrintWindow(html)
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
        <td class="right">${formatBRL(c.total)}</td>
      </tr>
    `).join('')

    const totalGeral = todos.reduce((s, c) => s + c.total, 0)

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
    openPrintWindow(html)
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
    const html = `
      <div class="page">
        <div class="header">
          <div class="logo"><img src="${window.location.origin}/logo.png" alt="ERPServ Consultoria" /></div>
          <div class="meta"><strong>Fechamento de Consultores</strong>${fmtYearMonth(yearMonth)}</div>
        </div>
        <table>
          <thead><tr><th>Tipo de Vínculo</th><th class="right">Consultores</th><th class="right">Total</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="total-box">
          <span class="total-label">TOTAL GERAL</span>
          <span class="total-value">${formatBRL(totais.total_geral)}</span>
        </div>
      </div>
    `
    openPrintWindow(html)
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'horistas',    label: 'Horistas' },
    { key: 'banco_horas', label: 'Banco de Horas' },
    { key: 'fixo',        label: 'Fixo' },
    { key: 'resumo',      label: 'Resumo' },
  ]

  // ─── Tab: Horistas ────────────────────────────────────────────────────────

  function TabHoristas() {
    const rows = data?.horistas ?? []
    return (
      <div>
        <p className="text-sm text-zinc-400 mb-3">{rows.length} consultor{rows.length !== 1 ? 'es' : ''}</p>
        <Table>
          <Thead>
            <tr>
              <Th>Consultor</Th>
              <Th right>H Trabalhadas</Th>
              <Th right>Taxa/h</Th>
              <Th right>Total</Th>
              <Th right>Relatório</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500 text-sm">
                  Nenhum consultor horista no período
                </td>
              </Tr>
            )}
            {rows.map(c => (
              <Tr key={c.user_id}>
                <Td className="font-medium text-zinc-100">{c.nome}</Td>
                <Td right className="font-mono text-zinc-300">{fmtH(c.horas_trabalhadas)}</Td>
                <Td right className="text-zinc-400">
                  {c.rate_type === 'monthly'
                    ? <span title={`Mensal: ${formatBRL(c.valor_hora)}`}>{formatBRL(c.effective_rate)}</span>
                    : formatBRL(c.effective_rate)
                  }
                </Td>
                <Td right className="font-semibold text-zinc-100">{formatBRL(c.total)}</Td>
                <Td right>
                  <RelatorioBtn userId={c.user_id} printingUser={printingUser} onClick={() => handleRelatorio(c)} />
                </Td>
              </Tr>
            ))}
            {rows.length > 0 && (
              <Tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                <td colSpan={3} className="py-2 px-3 text-right font-semibold text-zinc-300 text-sm">Total</td>
                <Td right className="font-bold text-violet-400">{formatBRL(data?.totais.total_horistas ?? 0)}</Td>
                <Td />
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    )
  }

  // ─── Tab: Banco de Horas ──────────────────────────────────────────────────

  function TabBancoHoras() {
    const rows = data?.banco_horas ?? []
    return (
      <div>
        <p className="text-sm text-zinc-400 mb-3">{rows.length} consultor{rows.length !== 1 ? 'es' : ''}</p>
        <Table>
          <Thead>
            <tr>
              <Th>Consultor</Th>
              <Th right>Base Mensal</Th>
              <Th right>Esperado</Th>
              <Th right>Trabalhado</Th>
              <Th right>Saldo Mês</Th>
              <Th right>Acumulado</Th>
              <Th right>H Extras</Th>
              <Th right>Total</Th>
              <Th right>Relatório</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500 text-sm">
                  Nenhum consultor banco de horas no período
                </td>
              </Tr>
            )}
            {rows.map(c => (
              <Tr key={c.user_id}>
                <Td className="font-medium text-zinc-100">{c.nome}</Td>
                <Td right className="font-semibold text-zinc-200">{formatBRL(c.fixed_salary)}</Td>
                <Td right className="font-mono text-zinc-400">{fmtH(c.expected_hours)}</Td>
                <Td right className="font-mono text-zinc-300">{fmtH(c.horas_trabalhadas)}</Td>
                <Td right className={`font-mono ${balanceColor(c.month_balance)}`}>{fmtH(c.month_balance)}</Td>
                <Td right className={`font-mono font-semibold ${balanceColor(c.accumulated_balance)}`}>{fmtH(c.accumulated_balance)}</Td>
                <Td right className={`font-mono font-semibold ${c.horas_extras > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {c.horas_extras > 0 ? fmtH(c.horas_extras) : '—'}
                </Td>
                <Td right className="font-semibold text-zinc-100">
                  {formatBRL(c.total)}
                  {c.total_extra > 0 && (
                    <div className="text-[10px] text-emerald-400 font-normal">+{formatBRL(c.total_extra)}</div>
                  )}
                </Td>
                <Td right>
                  <RelatorioBtn userId={c.user_id} printingUser={printingUser} onClick={() => handleRelatorio(c)} />
                </Td>
              </Tr>
            ))}
            {rows.length > 0 && (
              <Tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                <td colSpan={7} className="py-2 px-3 text-right font-semibold text-zinc-300 text-sm">Total</td>
                <Td right className="font-bold text-violet-400">{formatBRL(data?.totais.total_banco_horas ?? 0)}</Td>
                <Td />
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    )
  }

  // ─── Tab: Fixo ────────────────────────────────────────────────────────────

  function TabFixo() {
    const rows = (data?.fixos ?? []) as ConsultorFixo[]
    return (
      <div>
        <p className="text-sm text-zinc-400 mb-3">{rows.length} consultor{rows.length !== 1 ? 'es' : ''}</p>
        <Table>
          <Thead>
            <tr>
              <Th>Consultor</Th>
              <Th right>H Trabalhadas</Th>
              <Th right>Salário Mensal</Th>
              <Th right>Relatório</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <td colSpan={4} className="py-8 text-center text-zinc-500 text-sm">
                  Nenhum consultor fixo no período
                </td>
              </Tr>
            )}
            {rows.map(c => (
              <Tr key={c.user_id}>
                <Td className="font-medium text-zinc-100">{c.nome}</Td>
                <Td right className="font-mono text-zinc-300">{fmtH(c.horas_trabalhadas)}</Td>
                <Td right className="font-semibold text-zinc-100">{formatBRL(c.salario_mensal)}</Td>
                <Td right>
                  <RelatorioBtn userId={c.user_id} printingUser={printingUser} onClick={() => handleRelatorio(c)} />
                </Td>
              </Tr>
            ))}
            {rows.length > 0 && (
              <Tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                <td colSpan={2} className="py-2 px-3 text-right font-semibold text-zinc-300 text-sm">Total</td>
                <Td right className="font-bold text-violet-400">{formatBRL(data?.totais.total_fixos ?? 0)}</Td>
                <Td />
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    )
  }

  // ─── Tab: Resumo ──────────────────────────────────────────────────────────

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

    return (
      <div className="space-y-6">
        {/* Tabela por tipo */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Por tipo de vínculo</p>
            <button
              onClick={handlePrintResumo}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
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
                  <Td right className="text-zinc-400">{r.count}</Td>
                  <Td right className="font-mono text-zinc-200">{formatBRL(r.total)}</Td>
                </Tr>
              ))}
              <Tr className="border-t-2 border-violet-500 bg-violet-950/20">
                <Td className="font-bold text-violet-300">Total Geral</Td>
                <Td right className="text-violet-400">{todos.length}</Td>
                <Td right className="font-bold text-violet-300 text-base">{formatBRL(t.total_geral)}</Td>
              </Tr>
            </Tbody>
          </Table>
        </div>

        {/* Lista individual de todos os consultores */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Todos os consultores ({todos.length})
            </p>
            <button
              onClick={handlePrintTodos}
              className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
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
              {todos.map(c => (
                <Tr key={c.user_id}>
                  <Td className="font-medium text-zinc-100">{c.nome}</Td>
                  <Td className="text-zinc-400">{c.email ?? '—'}</Td>
                  <Td right className="font-semibold text-zinc-100">{formatBRL(c.total)}</Td>
                </Tr>
              ))}
              <Tr className="border-t-2 border-zinc-600 bg-zinc-800/20">
                <td colSpan={2} className="py-2 px-3 text-right font-semibold text-zinc-300 text-sm">Total</td>
                <Td right className="font-bold text-violet-400">{formatBRL(t.total_geral)}</Td>
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
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={yearMonth}
                onChange={e => setYearMonth(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <Button size="sm" variant="secondary" onClick={load} disabled={loading} icon={RefreshCw} loading={loading}>
                Atualizar
              </Button>
            </div>
          }
        />

        {/* Summary cards */}
        {data && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Horistas',       value: data.totais.total_horistas,   count: data.horistas.length,    hl: false },
              { label: 'Banco de Horas', value: data.totais.total_banco_horas, count: data.banco_horas.length, hl: false },
              { label: 'Fixo',           value: data.totais.total_fixos,       count: data.fixos.length,       hl: false },
              { label: 'Total Geral',    value: data.totais.total_geral,       count: data.horistas.length + data.banco_horas.length + data.fixos.length, hl: true },
            ].map(card => (
              <div key={card.label} className={`rounded-lg p-4 border ${card.hl ? 'bg-violet-950/40 border-violet-700' : 'bg-zinc-800/40 border-zinc-700'}`}>
                <div className="text-xs text-zinc-400 mb-1">{card.label}</div>
                <div className={`text-lg font-bold ${card.hl ? 'text-violet-300' : 'text-zinc-100'}`}>{formatBRL(card.value)}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{card.count} consultor{card.count !== 1 ? 'es' : ''}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-zinc-700 flex gap-1">
          {TABS.map(t => (
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
            <SkeletonTable rows={5} cols={5} />
          ) : !data ? (
            <EmptyState icon={FileText} title="Nenhum dado" description="Selecione um período para visualizar o fechamento." />
          ) : (
            <>
              {tab === 'horistas'    && <TabHoristas />}
              {tab === 'banco_horas' && <TabBancoHoras />}
              {tab === 'fixo'        && <TabFixo />}
              {tab === 'resumo'      && <TabResumo />}
            </>
          )}
        </div>

      </div>
    </AppLayout>
  )
}
