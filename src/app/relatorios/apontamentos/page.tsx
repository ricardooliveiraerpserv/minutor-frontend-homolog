'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AppLayout } from '@/components/layout/app-layout'
import {
  PageHeader, Card, Button, Badge,
  Table, Thead, Th, Tbody, Tr, Td,
  EmptyState, Skeleton,
} from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { MultiSelect } from '@/components/ui/multi-select'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { api } from '@/lib/api'
import { previewText } from '@/lib/sanitize'
import { toast } from 'sonner'
import { FileText, FileSpreadsheet, Search, Eye, Printer, X } from 'lucide-react'
import {
  exportRelatorioToExcel,
  type RelatorioRow, type RelatorioMeta,
} from '@/lib/exportRelatorioApontamentos'
import { useTableSort } from '@/hooks/use-table-sort'

type FilterMode = 'month' | 'period'
type DateField  = 'date' | 'created_at'
type StatusKey  = 'pending' | 'approved'

interface Customer    { id: number; name: string }
interface Project     { id: number; name: string; parent_project_id?: number | null }
interface ServiceType { id: number; name: string }

interface TicketSummaryRow {
  ticket: string
  title: string | null
  requester: string | null
  period_minutes: number
  period_count: number
  lifetime_minutes: number
  lifetime_count: number
}

interface RawTimesheet {
  date: string
  created_at?: string | null
  start_time?: string | null
  end_time?: string | null
  effort_hours?: string | null
  effort_minutes?: number | null
  ticket?: string | null
  ticket_subject?: string | null
  ticket_solicitante?: { name?: string } | string | null
  observation?: string | null
  user?: { id: number; name: string } | null
  project?: { id?: number; name?: string; code?: string; parent_project_id?: number | null } | null
  status?: string
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_LABEL: Record<string, string> = {
  pending:  'Pendente',
  approved: 'Aprovado',
}

function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = iso.split('T')[0]
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function fmtTimeHM(t: string | null | undefined): string {
  if (!t) return ''
  return t.length >= 5 ? t.slice(0, 5) : t
}

// Apuração 100% em horas DECIMAIS (não HH:MM) — ex.: 8h30 = 8,50h → "8.50h".
function fmtHoras(minutes: number): string {
  return `${((minutes ?? 0) / 60).toFixed(2)}h`
}

function parseRequester(v: RawTimesheet['ticket_solicitante']): string {
  if (!v) return ''
  if (typeof v === 'string') {
    try { return (JSON.parse(v)?.name as string) ?? '' } catch { return '' }
  }
  return v.name ?? ''
}

export default function RelatorioApontamentosPage() {
  const today = new Date()

  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | number>('')
  const [projects,   setProjects]   = useState<Project[]>([])
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [serviceTypes,    setServiceTypes]    = useState<ServiceType[]>([])
  const [serviceTypeIds,  setServiceTypeIds]  = useState<string[]>([])

  const [filterMode, setFilterMode] = useState<FilterMode>('month')
  const [refMonth,   setRefMonth]   = useState<number | null>(today.getMonth() + 1)
  const [refYear,    setRefYear]    = useState<number | null>(today.getFullYear())
  // Competência (serviço): Mês/Ano (refMonth/refYear) ou Período (startDate/endDate).
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  // Digitação (created_at) — range opcional que filtra a lista; vazio = 100% da competência.
  const [digFrom, setDigFrom] = useState('')
  const [digTo,   setDigTo]   = useState('')

  // Status fixo: relatório sempre considera pendentes + aprovados (sem toggle).
  const statuses: StatusKey[] = ['pending', 'approved']

  const [items,    setItems]    = useState<RawTimesheet[]>([])
  const [ticketSummary, setTicketSummary] = useState<TicketSummaryRow[]>([])
  const [loaded,   setLoaded]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Em Mês/Ano o período é a COMPETÊNCIA (derivada de refMonth/refYear); o range de digitação
  // (startDate/endDate) começa vazio = 100% da competência. Sem auto-preencher no mount.

  // ── Load customers
  useEffect(() => {
    api.get<any>('/customers?pageSize=2000')
      .then(r => {
        const list: any[] = Array.isArray(r) ? r : r?.items ?? r?.data ?? []
        setCustomers(list.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => toast.error('Erro ao carregar clientes'))
  }, [])

  // ── Load service types
  useEffect(() => {
    api.get<any>('/service-types?pageSize=100')
      .then(r => {
        const list: any[] = Array.isArray(r) ? r : r?.items ?? r?.data ?? []
        setServiceTypes(list.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => setServiceTypes([]))
  }, [])

  // ── Load projects do cliente selecionado
  useEffect(() => {
    if (!customerId) { setProjects([]); setProjectIds([]); return }
    api.get<any>(`/projects?customer_id=${customerId}&pageSize=500`)
      .then(r => {
        const list: any[] = Array.isArray(r) ? r : r?.items ?? r?.data ?? []
        setProjects(list.map(p => ({ id: p.id, name: p.name, parent_project_id: p.parent_project_id ?? null })))
      })
      .catch(() => setProjects([]))
    setProjectIds([])
  }, [customerId])

  const periodInfo = useMemo(() => {
    if (filterMode === 'month' && refMonth && refYear) {
      return { label: `${MONTHS_PT[refMonth - 1]} ${refYear}` }
    }
    if (filterMode === 'period' && startDate && endDate) {
      return { label: `${fmtDateBR(startDate)} a ${fmtDateBR(endDate)}` }
    }
    return { label: '' }
  }, [filterMode, refMonth, refYear, startDate, endDate])

  // COMPETÊNCIA = mês do SERVIÇO. Mês/Ano → bounds do mês; Período → o range escolhido.
  // O range de DIGITAÇÃO (digFrom/digTo) é separado e opcional — vazio = 100% da competência.
  const competenciaStart = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-01`
    : startDate
  const competenciaEnd = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-${String(new Date(refYear, refMonth, 0).getDate()).padStart(2, '0')}`
    : endDate

  const customerName = useMemo(
    () => customers.find(c => String(c.id) === String(customerId))?.name ?? '',
    [customers, customerId],
  )

  // Opções do seletor de projetos em árvore: filho aparece sob o pai com "↳".
  const projectOptions = useMemo(() => {
    const ids = new Set(projects.map(p => p.id))
    const byParent = new Map<number | null, Project[]>()
    for (const p of projects) {
      const key = p.parent_project_id && ids.has(p.parent_project_id) ? p.parent_project_id : null
      const arr = byParent.get(key) ?? []
      arr.push(p); byParent.set(key, arr)
    }
    const sortName = (a: Project, b: Project) => a.name.localeCompare(b.name, 'pt-BR')
    const out: { id: number; name: string; depth: number }[] = []
    const walk = (parentId: number | null, depth: number) => {
      for (const p of (byParent.get(parentId) ?? []).sort(sortName)) {
        out.push({ id: p.id, name: p.name, depth })
        walk(p.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [projects])

  // Regra especial VEDAMOTORS: coluna "Título" do relatório vira "TICKET ERPSERV".
  // Quando o ticket bate o padrão (5 dígitos), mantém o título original.
  // Quando NÃO bate, prefixa com "sem ticket".
  const isVedamotors = useMemo(
    () => customerName.toUpperCase().includes('VEDAMOTORS'),
    [customerName],
  )

  // Padrão Vedamotors: NNNN-NNNNNN (ex: 0526-000007).
  // Extrai o primeiro match em qualquer parte do subject — aceita:
  //   "0326-000136"
  //   "0326-000136 - Parametrização..."
  //   "0326-000136Parametrização..." (sem espaço)
  //   "Texto antes 0326-000136 texto depois"
  // Sem match = "Sem ticket". (rev3)
  const VEDAMOTORS_PATTERN = /\d{4}-\d{6}/

  function vedaTitleValue(t: RawTimesheet): string {
    const original = (t.ticket_subject ?? '').trim()
    const match = original.match(VEDAMOTORS_PATTERN)
    return match ? match[0] : 'Sem ticket'
  }

  async function loadReport() {
    if (!customerId) { toast.error('Selecione um cliente'); return }
    if (!competenciaStart || !competenciaEnd) {
      toast.error(filterMode === 'month' ? 'Selecione a competência (mês/ano)' : 'Defina a competência (período)'); return
    }
    setLoading(true)
    try {
      // Competência = data do SERVIÇO (sempre). Digitação = created_at (range opcional).
      const applyDates = (q: URLSearchParams) => {
        if (competenciaStart) q.set('competencia_start', competenciaStart)
        if (competenciaEnd)   q.set('competencia_end',   competenciaEnd)
        if (digFrom || digTo) {
          q.set('date_field', 'created_at')
          if (digFrom) q.set('start_date', digFrom)
          if (digTo)   q.set('end_date',   digTo)
        }
      }

      const p = new URLSearchParams()
      p.set('customer_id', String(customerId))
      p.set('pageSize',    '2000')
      applyDates(p)
      statuses.forEach(s => p.append('status[]', s))
      projectIds.forEach(id => p.append('project_id[]', id))
      serviceTypeIds.forEach(id => p.append('service_type_id[]', id))

      const summaryParams = new URLSearchParams()
      summaryParams.set('customer_id', String(customerId))
      applyDates(summaryParams)
      statuses.forEach(s => summaryParams.append('status[]', s))
      projectIds.forEach(id => summaryParams.append('project_id[]', id))
      serviceTypeIds.forEach(id => summaryParams.append('service_type_id[]', id))

      const [r, sumR] = await Promise.all([
        api.get<any>(`/timesheets?${p}`),
        api.get<any>(`/timesheets/summary-by-ticket?${summaryParams}`).catch(() => ({ tickets: [] })),
      ])

      const list: RawTimesheet[] = Array.isArray(r?.items) ? r.items : []
      // Ordena pela DATA DO SERVIÇO (competência) — assim os atrasados (digitados depois)
      // aparecem na posição do serviço, e não jogados pro fim por created_at.
      list.sort((a, b) => {
        const ai = (a.date ?? a.created_at ?? '').slice(0, 10)
        const bi = (b.date ?? b.created_at ?? '').slice(0, 10)
        if (ai !== bi) return ai < bi ? -1 : 1
        return (a.start_time ?? '').localeCompare(b.start_time ?? '')
      })
      setItems(list)

      const tickets: TicketSummaryRow[] = Array.isArray(sumR?.tickets) ? sumR.tickets : []
      tickets.sort((a, b) => a.ticket.localeCompare(b.ticket, 'pt-BR', { numeric: true }))
      setTicketSummary(tickets)

      setLoaded(true)
      setShowPreview(false)
    } catch {
      toast.error('Erro ao carregar relatório')
    } finally {
      setLoading(false)
    }
  }

  const totalMinutes = useMemo(
    () => items.reduce((acc, t) => acc + (t.effort_minutes ?? 0), 0),
    [items],
  )
  const totalHoras = fmtHoras(totalMinutes)
  const emittedAt = fmtDateBR(today.toISOString().slice(0, 10))

  // Ordenação por coluna (só na TABELA da tela; o relatório/PDF mantém a ordem por serviço).
  const { sorted: sortedItems, thProps } = useTableSort<RawTimesheet>(items, (t, k) => {
    switch (k) {
      case 'date_inclusion': return t.created_at ?? ''
      case 'date_service':   return t.date ?? ''
      case 'status':         return t.status ?? ''
      case 'requester':      return parseRequester(t.ticket_solicitante)
      case 'consultant':     return t.user?.name ?? ''
      case 'ticket':         return t.ticket ?? ''
      case 'title':          return t.ticket_subject ?? ''
      case 'description':    return previewText(t.observation)
      case 'start':          return t.start_time ?? ''
      case 'end':            return t.end_time ?? ''
      case 'effort':         return t.effort_minutes ?? 0
      default:               return ''
    }
  })

  // Straggler: digitado FORA da competência (created_at fora do período), mas serviço dentro.
  // Só sinaliza quando filtrando por "Data do apontamento" — no modo "Data de inclusão" tudo está dentro.
  function isLateInclusion(t: RawTimesheet): boolean {
    if (!t.created_at || !competenciaStart || !competenciaEnd) return false
    // Destacado quando digitado FORA da competência (serviço dentro, lançado depois).
    const c = t.created_at.slice(0, 10)
    return c < competenciaStart || c > competenciaEnd
  }

  function buildRows(): RelatorioRow[] {
    return items.map(t => ({
      date_inclusion: fmtDateBR(t.created_at),
      date_inclusion_late: isLateInclusion(t),
      requester:      parseRequester(t.ticket_solicitante),
      consultant:     t.user?.name ?? '',
      ticket:         t.ticket ?? '',
      title:          isVedamotors ? vedaTitleValue(t) : (t.ticket_subject ?? ''),
      description:    previewText(t.observation),
      start_time:     fmtTimeHM(t.start_time),
      end_time:       fmtTimeHM(t.end_time),
      effort_hours:   fmtHoras(t.effort_minutes ?? 0),
      effort_decimal: Math.round(((t.effort_minutes ?? 0) / 60) * 100) / 100,
      date_service:   fmtDateBR(t.date),
    }))
  }

  function buildMeta(): RelatorioMeta {
    return {
      client:       customerName,
      period:       periodInfo.label,
      emittedAt,
      totalHours:   totalHoras,
      totalRecords: items.length,
      ticketHeader: isVedamotors ? 'Ticket ERPSERV' : 'Ticket',
      titleHeader:  isVedamotors ? 'Ticket Vedamotors' : 'Título',
    }
  }

  function onExportExcel() {
    if (items.length === 0) { toast.error('Sem dados para exportar'); return }
    exportRelatorioToExcel(buildRows(), buildMeta())
  }

  function handlePrint() {
    if (typeof document === 'undefined') return
    const el = document.getElementById('print-relatorio')
    if (!el) return
    // Clona pra evitar interferência do React reconciliando.
    const clone = el.cloneNode(true) as HTMLElement
    clone.id = 'print-relatorio-clone'
    clone.classList.add('print-clone')
    document.body.appendChild(clone)
    document.body.dataset.print = 'relatorio'
    const cleanup = () => {
      clone.remove()
      delete document.body.dataset.print
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    setTimeout(() => window.print(), 100)
  }

  return (
    <AppLayout>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          /* Esconde tudo que NÃO é o clone do print. O clone é anexado ao
             body (via JS no handlePrint) e classe .print-clone garante o pega. */
          body[data-print="relatorio"] > *:not(.print-clone) {
            display: none !important;
          }
          body[data-print="relatorio"] .print-clone {
            display: block !important;
            width: 100% !important;
          }
          .print-clone > div {
            max-width: none !important;
            width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .print-clone .px-10 {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .print-clone table {
            table-layout: fixed !important;
            width: 100% !important;
            font-size: 9px !important;
          }
          .print-clone table td,
          .print-clone table th {
            white-space: normal !important;
            word-break: break-word !important;
            padding: 4px 6px !important;
          }
          .print-clone table td.description-cell {
            white-space: pre-wrap !important;
          }
          .print-clone table tr {
            page-break-inside: avoid;
          }
          .print-clone .table-scroll {
            overflow: visible !important;
          }
          .print-clone {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        /* Na tela, esconde o clone (caso ainda exista por algum motivo) */
        .print-clone { display: none; }
        /* Scroll horizontal só no container da tabela */
        #print-relatorio .table-scroll { overflow-x: auto; }
      `}</style>

      <PageHeader
        icon={FileText}
        title="Relatório de Apontamentos"
        subtitle="Documento de cobrança e transparência por cliente — pronto para envio."
      />

      {/* Filtros */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>
              Cliente <span style={{ color: 'var(--brand-danger)' }}>*</span>
            </label>
            <SearchSelect
              value={customerId}
              onChange={v => setCustomerId(v)}
              options={customers}
              placeholder="Selecione um cliente"
              fullWidth
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>
              Projetos
            </label>
            <MultiSelect
              value={projectIds}
              onChange={setProjectIds}
              options={projectOptions}
              placeholder={projects.length === 0 ? 'Selecione um cliente' : 'Todos os projetos'}
              fullWidth
              disabled={!customerId || projects.length === 0}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>
              Tipo de Serviço
            </label>
            <MultiSelect
              value={serviceTypeIds}
              onChange={setServiceTypeIds}
              options={serviceTypes}
              placeholder={serviceTypes.length === 0 ? 'Carregando...' : 'Todos os tipos'}
              fullWidth
              disabled={serviceTypes.length === 0}
            />
          </div>

          {/* COMPETÊNCIA (mês do serviço) — Mês/Ano ou Período. Trava a data do serviço. */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>
              Competência (mês do serviço)
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--brand-border)' }}>
                {(['month', 'period'] as const).map(mode => (
                  <button
                    key={mode} type="button"
                    onClick={() => {
                      setFilterMode(mode)
                      if (mode === 'month') {
                        if (!refMonth) setRefMonth(today.getMonth() + 1)
                        if (!refYear) setRefYear(today.getFullYear())
                        setStartDate(''); setEndDate('')
                      }
                    }}
                    className="px-3 py-1.5 font-medium transition-colors"
                    style={{
                      background: filterMode === mode ? 'var(--primary)' : 'transparent',
                      color:      filterMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)',
                    }}
                  >
                    {mode === 'month' ? 'Mês/Ano' : 'Período'}
                  </button>
                ))}
              </div>
              {filterMode === 'month' ? (
                <MonthYearPicker
                  month={refMonth}
                  year={refYear}
                  onChange={(m, y) => {
                    if (m === 0) { setRefMonth(null); setRefYear(null) }
                    else { setRefMonth(m); setRefYear(y) }
                  }}
                />
              ) : (
                <DateRangePicker
                  from={startDate}
                  to={endDate}
                  onChange={(f, t) => { setStartDate(f); setEndDate(t); setRefMonth(null); setRefYear(null) }}
                />
              )}
            </div>
          </div>

          {/* DIGITAÇÃO (opcional) — filtra a lista por quando foi lançado; vazio = 100% da competência. */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>
              Digitação (opcional)
            </label>
            <div className="flex items-center gap-2">
              <DateRangePicker
                from={digFrom}
                to={digTo}
                onChange={(f, t) => { setDigFrom(f); setDigTo(t) }}
              />
              {(digFrom || digTo) && (
                <button type="button" onClick={() => { setDigFrom(''); setDigTo('') }}
                  className="text-[11px] px-2 py-1 rounded" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
                  limpar
                </button>
              )}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>
              Filtra por quando foi lançado; vazio traz 100% da competência. Digitados fora do mês ficam destacados.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex items-end gap-3 flex-wrap">
            <Button variant="primary" icon={Search} loading={loading} onClick={loadReport} disabled={!customerId}>
              {loading ? 'Carregando...' : 'Gerar relatório'}
            </Button>
          </div>

          {loaded && items.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" icon={Eye} onClick={() => setShowPreview(p => !p)}>
                {showPreview ? 'Ocultar pré-visualização' : 'Pré-visualizar'}
              </Button>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={onExportExcel}>Excel</Button>
            </div>
          )}
        </div>
      </Card>

      {/* Cabeçalho do relatório (resumo na tela) */}
      {loaded && (
        <Card className="mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>
                Relatório de Apontamentos
              </div>
              <div className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>
                {customerName || '—'}
              </div>
            </div>
            <div className="text-right text-xs space-y-0.5" style={{ color: 'var(--brand-muted)' }}>
              <div>Competência: <span style={{ color: 'var(--brand-text)' }}>{periodInfo.label || '—'}</span></div>
              <div>Emitido em: <span style={{ color: 'var(--brand-text)' }}>{emittedAt}</span></div>
              <div>
                Total: <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{totalHoras}</span>
                <span className="mx-2" style={{ color: 'var(--brand-subtle)' }}>•</span>
                <span style={{ color: 'var(--brand-text)' }}>{items.length}</span> registro{items.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Pré-visualização (estilo Relatório de Fechamento) — fica acima da tabela operacional */}
      {loaded && items.length > 0 && showPreview && (
        <div className="mb-6">
          <div className="flex justify-end gap-2 mb-3 print:hidden">
            <Button variant="primary" icon={Printer} onClick={handlePrint}>Imprimir / Salvar PDF</Button>
            <Button variant="secondary" icon={X} onClick={() => setShowPreview(false)}>Fechar</Button>
          </div>

          <div id="print-relatorio">
            <div
              className="bg-white text-gray-900 rounded-2xl shadow-lg mx-auto"
              style={{ maxWidth: 1280, width: '100%', fontFamily: 'Arial, sans-serif' }}
            >
              {/* Cabeçalho */}
              <div
                className="flex items-start justify-between px-10 pt-8 pb-6"
                style={{ borderBottom: '2px solid #5b21b6' }}
              >
                <Image src="/logo.png" alt="ERPSERV" width={180} height={72} style={{ objectFit: 'contain' }} />
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-800 mb-1">Relatório de Apontamentos</div>
                  <div className="text-sm text-gray-500 mb-2">Documento de cobrança e transparência</div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Cliente:</span> {customerName}
                  </div>
                  <div className="text-sm text-gray-700" style={{ maxWidth: 420 }}>
                    <span className="font-semibold">Projeto:</span>{' '}
                    {projectIds.length === 0
                      ? 'Todos'
                      : projects.filter(p => projectIds.includes(String(p.id))).map(p => p.name).join(', ')}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Competência:</span> {periodInfo.label}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Digitação:</span>{' '}
                    {(digFrom || digTo)
                      ? `${digFrom ? fmtDateBR(digFrom) : '…'} a ${digTo ? fmtDateBR(digTo) : '…'}`
                      : 'Todas (100% da competência)'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Emitido em {emittedAt}</div>
                </div>
              </div>

              {/* Legenda do destaque (digitação fora da competência) */}
              {items.some(isLateInclusion) && (
                <div className="px-10 pt-3 text-xs" style={{ color: '#b45309', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                  <b>⚠ Em laranja:</b> apontamentos com <b>serviço dentro da competência</b> porém <b>digitados fora dela</b> (lançados depois) — entram neste período.
                </div>
              )}

              {/* Tabela */}
              <div className="px-10 py-6 table-scroll">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ background: '#f5f3ff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Data de Inclusão</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Solicitante</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Consultor</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">{isVedamotors ? 'Ticket ERPSERV' : 'Ticket'}</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">{isVedamotors ? 'Ticket Vedamotors' : 'Título'}</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Início</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Fim</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Esforço</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Data do Serviço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Agrupa por PROJETO — projetos filhos viram seções separadas (cada projeto = um bloco).
                      const groups: { name: string; rows: RawTimesheet[]; mins: number }[] = []
                      const idx: Record<string, number> = {}
                      items.forEach(t => {
                        const key = t.project?.name ?? 'Sem projeto'
                        if (idx[key] === undefined) { idx[key] = groups.length; groups.push({ name: key, rows: [], mins: 0 }) }
                        groups[idx[key]].rows.push(t)
                        groups[idx[key]].mins += (t.effort_minutes ?? 0)
                      })
                      return groups.map((g, gi) => (
                        <Fragment key={`grp-${gi}`}>
                          <tr style={{ background: '#ede9fe', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                            <td colSpan={9} className="px-3 py-2 text-xs font-bold whitespace-nowrap" style={{ color: '#5b21b6' }}>Projeto: {g.name}</td>
                          </tr>
                          {g.rows.map((t, i) => {
                            const bg = i % 2 === 0 ? '#fff' : '#faf9ff'
                            return (
                              <Fragment key={`${gi}-${i}`}>
                                <tr style={{ background: bg, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                                  {(() => {
                                    const late = isLateInclusion(t)
                                    return (
                                      <td className="px-3 pt-2 pb-1 text-xs text-center whitespace-nowrap"
                                        style={late
                                          ? { color: '#b45309', fontWeight: 700, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties
                                          : { color: '#374151' }}
                                        title={late ? 'Digitado fora da competência (serviço no período, lançado depois)' : undefined}>
                                        {late && '⚠ '}{fmtDateBR(t.created_at)}
                                      </td>
                                    )
                                  })()}
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center">{parseRequester(t.ticket_solicitante) || '—'}</td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center">{t.user?.name ?? '—'}</td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-500 text-center">
                                    {t.ticket
                                      ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${t.ticket}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-500">#{t.ticket}</a>
                                      : '—'}
                                  </td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center whitespace-nowrap">
                                    {isVedamotors ? (vedaTitleValue(t) || '—') : (t.ticket_subject ?? '—')}
                                  </td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center whitespace-nowrap">{fmtTimeHM(t.start_time) || '—'}</td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center whitespace-nowrap">{fmtTimeHM(t.end_time) || '—'}</td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-center font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                                    {fmtHoras(t.effort_minutes ?? 0)}
                                  </td>
                                  <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center whitespace-nowrap">{fmtDateBR(t.date)}</td>
                                </tr>
                                <tr style={{ background: bg, borderBottom: '2px solid #5b21b6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                                  <td colSpan={9} className="description-cell px-3 pt-1 pb-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                    <span className="font-semibold text-gray-500 mr-1">Descrição:</span>
                                    {t.observation ? previewText(t.observation) : '—'}
                                  </td>
                                </tr>
                              </Fragment>
                            )
                          })}
                          <tr style={{ background: '#faf9ff', borderBottom: '2px solid #c4b5fd', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                            <td colSpan={7} className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Subtotal — {g.name} ({g.rows.length} reg.)</td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums" style={{ color: '#5b21b6' }}>{fmtHoras(g.mins)}</td>
                            <td />
                          </tr>
                        </Fragment>
                      ))
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#ede9fe', borderTop: '2px solid #5b21b6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                      <td colSpan={7} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">
                        Total ({items.length} registro{items.length === 1 ? '' : 's'})
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold tabular-nums" style={{ color: '#5b21b6' }}>
                        {totalHoras}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 2ª tabela: Apuração por Ticket — total no período + histórico */}
              {ticketSummary.length > 0 && (
                <div className="px-10 pb-6 table-scroll">
                  <h2 className="text-sm font-bold text-gray-800 mb-3 mt-2">Apuração por Ticket</h2>
                  <p className="text-xs text-gray-500 mb-3">
                    Tickets com apontamento dentro do período, mostrando o total no período selecionado e o
                    total acumulado desde o primeiro apontamento no sistema (mesmo cliente).
                  </p>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: '#f5f3ff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Ticket</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Título</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Solicitante</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Total no período</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Total histórico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketSummary.map((tk, i) => (
                        <tr
                          key={tk.ticket}
                          style={{ background: i % 2 === 0 ? '#fff' : '#faf9ff', borderBottom: '1px solid #e5e7eb', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
                        >
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            <a href={`https://erpserv.movidesk.com/Ticket/Edit/${tk.ticket}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-500">
                              #{tk.ticket}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">{tk.title ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{tk.requester ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                            {fmtHoras(tk.period_minutes)}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: '#5b21b6' }}>
                            {fmtHoras(tk.lifetime_minutes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-10 pb-6 text-center text-xs text-gray-400">
                ERPSERV Consultoria — Documento gerado pelo sistema Minutor
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabela operacional (com Status) */}
      {loading && (
        <Card>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8" />)}
          </div>
        </Card>
      )}

      {!loading && loaded && items.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Nenhum apontamento encontrado"
          description="Ajuste os filtros e gere o relatório novamente."
        />
      )}

      {!loading && loaded && items.length > 0 && (
        <Card padding="none" className="overflow-x-auto">
          <Table>
            <Thead>
              <tr>
                <Th {...thProps('date_inclusion')}>Data Inclusão</Th>
                <Th {...thProps('date_service')}>Data do Serviço</Th>
                <Th {...thProps('status')}>Status</Th>
                <Th {...thProps('requester')}>Solicitante</Th>
                <Th {...thProps('consultant')}>Consultor</Th>
                <Th {...thProps('ticket')}>Ticket</Th>
                <Th {...thProps('title')}>Título</Th>
                <Th {...thProps('description')}>Descrição</Th>
                <Th className="text-center" {...thProps('start')}>Início</Th>
                <Th className="text-center" {...thProps('end')}>Fim</Th>
                <Th right {...thProps('effort')}>Esforço</Th>
              </tr>
            </Thead>
            <Tbody>
              {sortedItems.map((t, i) => (
                <Tr key={i}>
                  <Td className="whitespace-nowrap">
                    <span
                      style={isLateInclusion(t) ? { color: 'var(--warning)', fontWeight: 600 } : undefined}
                      title={isLateInclusion(t) ? 'Digitado fora da competência (serviço no mês, lançado depois)' : undefined}
                    >
                      {isLateInclusion(t) && '⚠ '}{fmtDateBR(t.created_at)}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDateBR(t.date)}</Td>
                  <Td>
                    <Badge variant={t.status ?? 'default'}>{STATUS_LABEL[t.status ?? ''] ?? t.status}</Badge>
                  </Td>
                  <Td>{parseRequester(t.ticket_solicitante)}</Td>
                  <Td>{t.user?.name ?? ''}</Td>
                  <Td>{t.ticket ?? ''}</Td>
                  <Td>{t.ticket_subject ?? ''}</Td>
                  <Td className="max-w-[24rem]">
                    <span
                      title={previewText(t.observation)}
                      className="block overflow-hidden text-ellipsis whitespace-nowrap cursor-help"
                    >
                      {previewText(t.observation)}
                    </span>
                  </Td>
                  <Td className="text-center">{fmtTimeHM(t.start_time)}</Td>
                  <Td className="text-center">{fmtTimeHM(t.end_time)}</Td>
                  <Td right className="font-semibold">{fmtHoras(t.effort_minutes ?? 0)}</Td>
                </Tr>
              ))}
              <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                <td
                  colSpan={10}
                  className="px-5 py-3.5 text-right font-bold"
                  style={{ color: 'var(--brand-text)' }}
                >
                  Total
                </td>
                <td className="px-5 py-3.5 text-right font-bold" style={{ color: 'var(--brand-primary)' }}>
                  {totalHoras}
                </td>
              </tr>
            </Tbody>
          </Table>
        </Card>
      )}

    </AppLayout>
  )
}
