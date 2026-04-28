'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
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

  const yearMonth = month && year ? toYearMonth(month, year) : ''

  const [parceiros, setParceiros]     = useState<ParceiroStatus[]>([])
  const [status, setStatus]           = useState<ParceiroStatus | null>(null)

  const [consultores, setConsultores] = useState<ConsultorRow[]>([])
  const [despesas, setDespesas]       = useState<DespesaRow[]>([])
  const [apontamentos, setApontamentos] = useState<ApontamentoRow[]>([])

  const [loadingConsult, setLoadingConsult]   = useState(false)
  const [loadingDesp,    setLoadingDesp]      = useState(false)
  const [loadingAp,      setLoadingAp]        = useState(false)
  const [loadingFechar,  setLoadingFechar]    = useState(false)
  const [loadingReabrir, setLoadingReabrir]   = useState(false)
  const [consultorView, setConsultorView] = useState<'resumo' | 'tipo'>('resumo')

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
    .right { text-align: right; }
    .section-footer { background: #f5f3ff; padding: 8px 12px; text-align: right; font-size: 12px; color: #7c3aed; font-weight: 600; border-radius: 0 0 6px 6px; margin-top: -1px; }
    .divider { border: none; border-top: 1px dashed #d1d5db; margin: 20px 0; }
    .total-box { background: #7c3aed; border-radius: 8px; padding: 16px 24px; display: flex; justify-content: space-between; margin-top: 24px; color: #fff; }
    .total-box-block { }
    .total-box-label { font-size: 11px; opacity: 0.85; margin-bottom: 4px; }
    .total-box-value { font-size: 26px; font-weight: 700; }
    .page-footer { margin-top: 32px; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print { body { padding: 16px 20px; } }
  `

  const handlePrint = () => {
    if (!status || !apontamentos.length) {
      toast.error('Carregue os apontamentos antes de imprimir.')
      return
    }

    const logoUrl = window.location.origin + '/logo.png'
    const competencia = yearMonth ? fmtYearMonth(yearMonth).replace('/', ' / ') : '—'
    const tipoPrec = isFixed ? `Precificação Fixa — Taxa: ${formatBRL(status.hourly_rate)}/h` : 'Precificação Variável'

    // Agrupa apontamentos: tipo de contrato → consultor
    const tipoMapPrint = new Map<string, { nome: string; consultores: Map<number, { consultor: string; taxa: number; horas: number; total: number; rows: ApontamentoRow[] }> }>()
    apontamentos.forEach(a => {
      if (!tipoMapPrint.has(a.tipo_contrato_code)) tipoMapPrint.set(a.tipo_contrato_code, { nome: a.tipo_contrato_nome, consultores: new Map() })
      const tipo = tipoMapPrint.get(a.tipo_contrato_code)!
      if (!tipo.consultores.has(a.user_id)) {
        const c = consultores.find(c => c.user_id === a.user_id)
        tipo.consultores.set(a.user_id, { consultor: a.consultor, taxa: c?.valor_hora ?? 0, horas: 0, total: 0, rows: [] })
      }
      const entry = tipo.consultores.get(a.user_id)!
      entry.rows.push(a)
      entry.horas += a.horas
      entry.total += a.horas * entry.taxa
    })

    const sectionsHtml = Array.from(tipoMapPrint.entries()).map(([, { nome, consultores: consMap }]) => {
      const tipoHoras = Array.from(consMap.values()).reduce((s, c) => s + c.horas, 0)
      const tipoTotal = Array.from(consMap.values()).reduce((s, c) => s + c.total, 0)

      const consultoresHtml = Array.from(consMap.values()).map(({ consultor, taxa, horas, total, rows }) => {
        const rowsHtml = rows.map(r => `
          <tr>
            <td>${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${r.projeto}</td>
            <td>${r.solicitante ?? '—'}</td>
            <td>${r.ticket ?? '0'}</td>
            <td>${r.titulo ?? '—'}</td>
            <td>${r.observacao ?? '—'}</td>
            <td class="right">${r.horas.toFixed(2)}h</td>
          </tr>`).join('')
        return `
          <div style="margin-bottom:16px">
            <div class="section-header">
              <div><span class="section-title" style="font-size:13px">${consultor}</span></div>
              <div class="section-rate">Valor/hora: <b>${formatBRL(taxa)}/h</b></div>
            </div>
            <table>
              <thead><tr><th>Data</th><th>Projeto</th><th>Solicitante</th><th>Ticket</th><th>Título</th><th>Descrição</th><th class="right">Horas</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="section-footer">${horas.toFixed(2)}h × ${formatBRL(taxa)}/h = <b>${formatBRL(Math.round(total * 100) / 100)}</b></div>
          </div>`
      }).join('')

      return `
        <div class="section" style="margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #7c3aed;padding-bottom:6px;margin-bottom:14px">
            <span style="font-size:16px;font-weight:700;color:#111">${nome}</span>
            <span style="font-size:11px;color:#6b7280">${tipoHoras.toFixed(2)}h · <b style="color:#7c3aed">${formatBRL(tipoTotal)}</b></span>
          </div>
          ${consultoresHtml}
        </div>
        <hr class="divider"/>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<title>Relatório de Fechamento — ${status.nome} — ${competencia}</title>
<style>${printStyles}</style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-left"><img src="${logoUrl}" alt="Logo"/></div>
    <div class="page-header-right">
      <h1>Relatório de Fechamento</h1>
      <div class="subtitle">${tipoPrec}</div>
      <div class="meta"><b>Parceiro:</b> ${status.nome}</div>
      <div class="meta"><b>Competência:</b> ${competencia}</div>
    </div>
  </div>

  ${sectionsHtml}

  <div class="total-box">
    <div class="total-box-block">
      <div class="total-box-label">Total de Horas</div>
      <div class="total-box-value">${totalHoras.toFixed(2)}h</div>
    </div>
    <div class="total-box-block" style="text-align:right">
      <div class="total-box-label">Total Serviços</div>
      <div class="total-box-value">${formatBRL(totalServicos)}</div>
    </div>
  </div>
  ${isFixed ? '<p style="margin-top:8px;font-size:10px;color:#9ca3af">* Taxa fixa aplicada a todos os consultores.</p>' : ''}

  <div class="page-footer">
    <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
    <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
  </div>
</body>
</html>`

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
          <td>${r.projeto}</td>
          <td><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:500;background:${r.status === 'approved' ? '#dcfce7' : '#fef9c3'};color:${r.status === 'approved' ? '#15803d' : '#854d0e'}">${EXPENSE_STATUS_LABELS[r.status] ?? r.status}</span></td>
          <td class="right" style="color:#7c3aed;font-weight:600">${formatBRL(r.valor)}</td>
        </tr>`).join('')

      return `
        <div class="section">
          <div class="section-header">
            <div><span class="section-title">${consultor}</span></div>
            <div class="section-rate">Subtotal: <b>${formatBRL(sub)}</b></div>
          </div>
          <table>
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Projeto</th><th>Status</th><th class="right">Valor</th></tr></thead>
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

  <div class="total-box">
    <div class="total-box-block">
      <div class="total-box-label">Total de Despesas</div>
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
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
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
                <>
                  <Button size="sm" variant="secondary" onClick={handlePrint}>
                    <Printer size={12} className="mr-1" /> Serviços
                  </Button>
                  {despesas.length > 0 && (
                    <Button size="sm" variant="secondary" onClick={handlePrintDespesas}>
                      <Printer size={12} className="mr-1" /> Despesas
                    </Button>
                  )}
                </>
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
            <div className="flex gap-1 px-6 border-b" style={{ borderColor: 'var(--brand-border)' }}>
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
                  {/* Toggle de visão */}
                  <div className="flex items-center gap-2 mb-5">
                    {(['resumo', 'tipo'] as const).map(v => (
                      <button key={v} onClick={() => setConsultorView(v)}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{
                          background: consultorView === v ? 'var(--brand-primary)' : 'var(--brand-surface)',
                          color: consultorView === v ? '#000' : 'var(--brand-muted)',
                          border: '1px solid var(--brand-border)',
                        }}
                      >
                        {v === 'resumo' ? 'Resumo por Consultor' : 'Por Tipo de Contrato'}
                      </button>
                    ))}

                    {consultorView === 'resumo' && consultores.length > 1 && (
                      <div className="flex items-center gap-2 ml-4">
                        <Filter size={13} style={{ color: 'var(--brand-muted)' }} />
                        <SearchSelect value={filterConsultor} onChange={v => setFilterConsultor(v ? Number(v) : '')} options={consultorOptions} placeholder="Todos" />
                        {filterConsultor && <button className="text-xs underline" style={{ color: 'var(--brand-muted)' }} onClick={() => setFilterConsultor('')}>Limpar</button>}
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
                                  <div className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{row.nome}</div>
                                  {row.rate_type === 'monthly' && !isFixed && (
                                    <div className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Mensalista · ÷180</div>
                                  )}
                                </Td>
                                <Td right className="tabular-nums text-xs">{row.horas.toFixed(2)}h</Td>
                                <Td right className="tabular-nums text-xs">{formatBRL(row.valor_hora)}/h</Td>
                                <Td right className="tabular-nums text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>{formatBRL(row.total)}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      )}
                      {filteredConsultores.length > 0 && (
                        <div className="mt-4 flex justify-between items-center">
                          <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>Total: <b>{filteredConsultores.reduce((s, c) => s + c.horas, 0).toFixed(2)}h</b></span>
                          <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'rgba(0,245,255,0.07)', color: 'var(--brand-primary)' }}>
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
                                <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{nome}</span>
                                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>{code}</span>
                                  </div>
                                  <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                                    {tipoHoras.toFixed(2)}h · <b style={{ color: 'var(--brand-primary)' }}>{formatBRL(tipoTotal)}</b>
                                  </span>
                                </div>
                                <Table>
                                  <Thead>
                                    <tr><Th>Consultor</Th><Th right>Horas</Th><Th right>Taxa/h</Th><Th right>Total</Th></tr>
                                  </Thead>
                                  <Tbody>
                                    {rows.map(r => (
                                      <Tr key={r.user_id}>
                                        <Td className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{r.consultor}</Td>
                                        <Td right className="tabular-nums text-xs">{r.horas.toFixed(2)}h</Td>
                                        <Td right className="tabular-nums text-xs">{formatBRL(r.taxa)}/h</Td>
                                        <Td right className="tabular-nums text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>{formatBRL(Math.round(r.total * 100) / 100)}</Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                              </div>
                            )
                          })}
                          <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                            <span className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                              Total: <b>{apontamentos.reduce((s, a) => s + a.horas, 0).toFixed(2)}h</b>
                            </span>
                            <div className="text-sm font-semibold px-4 py-2 rounded" style={{ background: 'rgba(0,245,255,0.07)', color: 'var(--brand-primary)' }}>
                              Total Serviços: {formatBRL(totalServicos)}
                            </div>
                          </div>
                        </div>
                      )
                    })()
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
                  <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    {/* Cabeçalho preview */}
                    <div className="flex justify-between items-start mb-6 pb-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                      <img src="/logo.png" alt="Logo" style={{ height: 48, objectFit: 'contain' }} />
                      <div className="text-right">
                        <div className="text-xl font-bold" style={{ color: 'var(--brand-text)' }}>Relatório de Fechamento</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--brand-muted)' }}>
                          {isFixed ? `Precificação Fixa · Taxa: ${formatBRL(status?.hourly_rate ?? 0)}/h` : 'Precificação Variável'}
                        </div>
                        <div className="text-sm mt-1" style={{ color: 'var(--brand-text)' }}>
                          <b>Parceiro:</b> {status?.nome}
                        </div>
                        <div className="text-sm" style={{ color: 'var(--brand-text)' }}>
                          <b>Competência:</b> {yearMonth ? fmtYearMonth(yearMonth).replace('/', ' / ') : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Apontamentos por tipo de contrato → consultor */}
                    {loadingAp ? <SkeletonTable rows={4} cols={6} /> : (() => {
                      // tipo → consultor → rows
                      const tipoMap = new Map<string, { nome: string; consultores: Map<number, { consultor: string; taxa: number; horas: number; total: number; rows: ApontamentoRow[] }> }>()
                      apontamentos.forEach(a => {
                        if (!tipoMap.has(a.tipo_contrato_code)) tipoMap.set(a.tipo_contrato_code, { nome: a.tipo_contrato_nome, consultores: new Map() })
                        const tipo = tipoMap.get(a.tipo_contrato_code)!
                        if (!tipo.consultores.has(a.user_id)) {
                          const c = consultores.find(c => c.user_id === a.user_id)
                          tipo.consultores.set(a.user_id, { consultor: a.consultor, taxa: c?.valor_hora ?? 0, horas: 0, total: 0, rows: [] })
                        }
                        const entry = tipo.consultores.get(a.user_id)!
                        entry.rows.push(a)
                        entry.horas += a.horas
                        entry.total += a.horas * entry.taxa
                      })

                      return Array.from(tipoMap.entries()).map(([code, { nome, consultores: consMap }]) => {
                        const tipoHoras = Array.from(consMap.values()).reduce((s, c) => s + c.horas, 0)
                        const tipoTotal = Array.from(consMap.values()).reduce((s, c) => s + c.total, 0)
                        return (
                          <div key={code} className="mb-10">
                            {/* Header do tipo */}
                            <div className="flex items-center justify-between mb-4 pb-2 border-b-2" style={{ borderColor: 'var(--brand-primary)' }}>
                              <div className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{nome}</div>
                              <div className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                                {tipoHoras.toFixed(2)}h · <b style={{ color: 'var(--brand-primary)' }}>{formatBRL(tipoTotal)}</b>
                              </div>
                            </div>

                            {Array.from(consMap.values()).map(({ consultor, taxa, horas, total, rows }) => (
                              <div key={consultor} className="mb-6">
                                <div className="flex justify-between items-baseline mb-2">
                                  <div className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{consultor}</div>
                                  <div className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                                    Valor/hora: <b style={{ color: 'var(--brand-text)' }}>{formatBRL(taxa)}/h</b>
                                  </div>
                                </div>
                                <Table>
                                  <Thead>
                                    <tr>
                                      <Th>Data</Th><Th>Projeto</Th><Th>Solicitante</Th>
                                      <Th>Ticket</Th><Th>Título</Th><Th>Descrição</Th><Th right>Horas</Th>
                                    </tr>
                                  </Thead>
                                  <Tbody>
                                    {rows.map(r => (
                                      <Tr key={r.id}>
                                        <Td className="text-xs tabular-nums whitespace-nowrap">{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</Td>
                                        <Td className="text-xs">{r.projeto}</Td>
                                        <Td className="text-xs">{r.solicitante ?? '—'}</Td>
                                        <Td className="text-xs tabular-nums">{r.ticket ?? '—'}</Td>
                                        <Td className="text-xs">{r.titulo ?? '—'}</Td>
                                        <Td className="text-xs">{r.observacao ?? '—'}</Td>
                                        <Td right className="tabular-nums text-xs">{r.horas.toFixed(2)}h</Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                                <div className="flex justify-end px-3 py-2 text-xs font-semibold rounded-b"
                                  style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                                  {horas.toFixed(2)}h × {formatBRL(taxa)}/h = <b className="ml-1">{formatBRL(Math.round(total * 100) / 100)}</b>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })
                    })()}

                    {/* Totalizador */}
                    <div className="flex justify-between items-center rounded-xl p-5 mt-4"
                      style={{ background: '#7c3aed', color: '#fff' }}>
                      <div>
                        <div className="text-xs opacity-80 mb-1">Total de Horas</div>
                        <div className="text-2xl font-bold tabular-nums">{totalHoras.toFixed(2)}h</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs opacity-80 mb-1">Total Serviços</div>
                        <div className="text-2xl font-bold tabular-nums">{formatBRL(totalServicos)}</div>
                      </div>
                    </div>

                    {isFixed && (
                      <p className="mt-3 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        * Taxa fixa do parceiro aplicada a todos os consultores.
                      </p>
                    )}

                    <div className="flex justify-between mt-8 pt-3 text-xs border-t" style={{ color: 'var(--brand-muted)', borderColor: 'var(--brand-border)' }}>
                      <span>ERPSERV Consultoria — Documento gerado pelo sistema Minutor</span>
                      <span>Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
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
