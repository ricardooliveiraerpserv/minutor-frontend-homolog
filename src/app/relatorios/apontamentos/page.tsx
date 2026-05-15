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
import { toast } from 'sonner'
import { FileText, FileSpreadsheet, Search, Eye, Printer, X } from 'lucide-react'
import {
  exportRelatorioToExcel,
  type RelatorioRow, type RelatorioMeta,
} from '@/lib/exportRelatorioApontamentos'

type FilterMode = 'month' | 'period'
type DateField  = 'date' | 'created_at'
type StatusKey  = 'pending' | 'approved'

interface Customer    { id: number; name: string }
interface Project     { id: number; name: string }
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

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
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

  const [dateField,  setDateField]  = useState<DateField>('date')
  const [filterMode, setFilterMode] = useState<FilterMode>('month')
  const [refMonth,   setRefMonth]   = useState<number | null>(today.getMonth() + 1)
  const [refYear,    setRefYear]    = useState<number | null>(today.getFullYear())
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')

  const [statuses, setStatuses] = useState<StatusKey[]>(['pending', 'approved'])

  const [items,    setItems]    = useState<RawTimesheet[]>([])
  const [ticketSummary, setTicketSummary] = useState<TicketSummaryRow[]>([])
  const [loaded,   setLoaded]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // ── Default period to current month
  useEffect(() => {
    if (filterMode === 'month' && refMonth && refYear && (!startDate || !endDate)) {
      const mm = String(refMonth).padStart(2, '0')
      const last = new Date(refYear, refMonth, 0).getDate()
      setStartDate(`${refYear}-${mm}-01`)
      setEndDate(`${refYear}-${mm}-${String(last).padStart(2, '0')}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        setProjects(list.map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)))
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

  const customerName = useMemo(
    () => customers.find(c => String(c.id) === String(customerId))?.name ?? '',
    [customers, customerId],
  )

  // Regra especial VEDAMOTORS: coluna "Título" do relatório vira "TICKET ERPSERV".
  // Quando o ticket bate o padrão (5 dígitos), mantém o título original.
  // Quando NÃO bate, prefixa com "sem ticket".
  const isVedamotors = useMemo(
    () => customerName.toUpperCase().includes('VEDAMOTORS'),
    [customerName],
  )

  // Padrão Vedamotors: NNNN-NNNNNN (ex: 0526-000007).
  // Fora do padrão = "Sem ticket". (rev2)
  const VEDAMOTORS_PATTERN = /^\d{4}-\d{6}$/

  function vedaTitleValue(t: RawTimesheet): string {
    const original = (t.ticket_subject ?? '').trim()
    if (VEDAMOTORS_PATTERN.test(original)) return original
    return 'Sem ticket'
  }

  const toggleStatus = (s: StatusKey) => {
    setStatuses(prev => {
      const has = prev.includes(s)
      if (has && prev.length === 1) return prev // não deixa zerar
      return has ? prev.filter(x => x !== s) : [...prev, s]
    })
  }

  async function loadReport() {
    if (!customerId) { toast.error('Selecione um cliente'); return }
    if (!startDate || !endDate) { toast.error('Defina o período'); return }
    setLoading(true)
    try {
      const p = new URLSearchParams()
      p.set('customer_id', String(customerId))
      p.set('start_date',  startDate)
      p.set('end_date',    endDate)
      p.set('pageSize',    '2000')
      if (dateField === 'created_at') p.set('date_field', 'created_at')
      statuses.forEach(s => p.append('status[]', s))
      projectIds.forEach(id => p.append('project_id[]', id))
      serviceTypeIds.forEach(id => p.append('service_type_id[]', id))

      const summaryParams = new URLSearchParams()
      summaryParams.set('customer_id', String(customerId))
      summaryParams.set('start_date',  startDate)
      summaryParams.set('end_date',    endDate)
      if (dateField === 'created_at') summaryParams.set('date_field', 'created_at')
      statuses.forEach(s => summaryParams.append('status[]', s))
      projectIds.forEach(id => summaryParams.append('project_id[]', id))
      serviceTypeIds.forEach(id => summaryParams.append('service_type_id[]', id))

      const [r, sumR] = await Promise.all([
        api.get<any>(`/timesheets?${p}`),
        api.get<any>(`/timesheets/summary-by-ticket?${summaryParams}`).catch(() => ({ tickets: [] })),
      ])

      const list: RawTimesheet[] = Array.isArray(r?.items) ? r.items : []
      list.sort((a, b) => {
        const ai = a.created_at ?? a.date
        const bi = b.created_at ?? b.date
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
  const totalHHMM = minutesToHHMM(totalMinutes)
  const emittedAt = fmtDateBR(today.toISOString().slice(0, 10))

  function buildRows(): RelatorioRow[] {
    return items.map(t => ({
      date_inclusion: fmtDateBR(t.created_at),
      requester:      parseRequester(t.ticket_solicitante),
      consultant:     t.user?.name ?? '',
      ticket:         t.ticket ?? '',
      title:          isVedamotors ? vedaTitleValue(t) : (t.ticket_subject ?? ''),
      description:    t.observation ?? '',
      start_time:     fmtTimeHM(t.start_time),
      end_time:       fmtTimeHM(t.end_time),
      effort_hours:   t.effort_hours ?? minutesToHHMM(t.effort_minutes ?? 0),
      effort_decimal: Math.round(((t.effort_minutes ?? 0) / 60) * 100) / 100,
      date_service:   fmtDateBR(t.date),
    }))
  }

  function buildMeta(): RelatorioMeta {
    return {
      client:       customerName,
      period:       periodInfo.label,
      emittedAt,
      totalHours:   totalHHMM,
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
              options={projects}
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

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>
              Filtrar por
            </label>
            <div className="flex rounded-lg border overflow-hidden text-xs h-9" style={{ borderColor: 'var(--brand-border)' }}>
              {(['date', 'created_at'] as const).map(f => (
                <button
                  key={f} type="button" onClick={() => setDateField(f)}
                  className="flex-1 px-3 font-medium transition-colors"
                  style={{
                    background: dateField === f ? 'var(--primary)' : 'transparent',
                    color:      dateField === f ? 'var(--primary-fg)' : 'var(--text-muted)',
                  }}
                >
                  {f === 'date' ? 'Data do apontamento' : 'Data de inclusão'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>Período</label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--brand-border)' }}>
                {(['month', 'period'] as const).map(mode => (
                  <button
                    key={mode} type="button" onClick={() => setFilterMode(mode)}
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
                    if (m === 0) { setRefMonth(null); setRefYear(null); setStartDate(''); setEndDate('') }
                    else {
                      const mm = String(m).padStart(2, '0')
                      const last = new Date(y, m, 0).getDate()
                      setRefMonth(m); setRefYear(y)
                      setStartDate(`${y}-${mm}-01`)
                      setEndDate(`${y}-${mm}-${String(last).padStart(2, '0')}`)
                    }
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
        </div>

        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--brand-muted)' }}>Status</label>
              <div className="flex gap-2">
                {(['pending', 'approved'] as StatusKey[]).map(s => {
                  const active = statuses.includes(s)
                  const styles = s === 'pending'
                    ? { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' }
                    : { color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' }
                  return (
                    <button
                      key={s} type="button" onClick={() => toggleStatus(s)}
                      className="px-3 h-8 rounded-lg text-xs font-medium transition-colors"
                      style={active
                        ? { background: styles.bg, color: styles.color, border: `1px solid ${styles.border}` }
                        : { background: 'transparent', color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </div>
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
                Total: <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{totalHHMM}</span>
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
                  <div className="text-xs text-gray-400 mt-1">Emitido em {emittedAt}</div>
                </div>
              </div>

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
                    {items.map((t, i) => {
                      const bg = i % 2 === 0 ? '#fff' : '#faf9ff'
                      return (
                        <Fragment key={i}>
                          <tr style={{ background: bg, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                            <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center whitespace-nowrap">{fmtDateBR(t.created_at)}</td>
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
                              {t.effort_hours ?? minutesToHHMM(t.effort_minutes ?? 0)}
                            </td>
                            <td className="px-3 pt-2 pb-1 text-xs text-gray-700 text-center whitespace-nowrap">{fmtDateBR(t.date)}</td>
                          </tr>
                          <tr style={{ background: bg, borderBottom: '2px solid #5b21b6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                            <td colSpan={9} className="px-3 pt-1 pb-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                              <span className="font-semibold text-gray-500 mr-1">Descrição:</span>
                              {t.observation ?? '—'}
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#ede9fe', borderTop: '2px solid #5b21b6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                      <td colSpan={7} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">
                        Total ({items.length} registro{items.length === 1 ? '' : 's'})
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold tabular-nums" style={{ color: '#5b21b6' }}>
                        {totalHHMM}
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
                            {minutesToHHMM(tk.period_minutes)}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: '#5b21b6' }}>
                            {minutesToHHMM(tk.lifetime_minutes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#ede9fe', borderTop: '2px solid #5b21b6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                        <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">
                          Totais ({ticketSummary.length} ticket{ticketSummary.length === 1 ? '' : 's'})
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-gray-800 whitespace-nowrap">
                          {minutesToHHMM(ticketSummary.reduce((acc, t) => acc + t.period_minutes, 0))}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: '#5b21b6' }}>
                          {minutesToHHMM(ticketSummary.reduce((acc, t) => acc + t.lifetime_minutes, 0))}
                        </td>
                      </tr>
                    </tfoot>
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
                <Th>Data Inclusão</Th>
                <Th>Status</Th>
                <Th>Solicitante</Th>
                <Th>Consultor</Th>
                <Th>Ticket</Th>
                <Th>Título</Th>
                <Th>Descrição</Th>
                <Th className="text-center">Início</Th>
                <Th className="text-center">Fim</Th>
                <Th right>Esforço</Th>
                <Th>Data do Serviço</Th>
              </tr>
            </Thead>
            <Tbody>
              {items.map((t, i) => (
                <Tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateBR(t.created_at)}</Td>
                  <Td>
                    <Badge variant={t.status ?? 'default'}>{STATUS_LABEL[t.status ?? ''] ?? t.status}</Badge>
                  </Td>
                  <Td>{parseRequester(t.ticket_solicitante)}</Td>
                  <Td>{t.user?.name ?? ''}</Td>
                  <Td>{t.ticket ?? ''}</Td>
                  <Td>{t.ticket_subject ?? ''}</Td>
                  <Td className="max-w-[24rem]">
                    <span
                      title={t.observation ?? ''}
                      className="block overflow-hidden text-ellipsis whitespace-nowrap cursor-help"
                    >
                      {t.observation ?? ''}
                    </span>
                  </Td>
                  <Td className="text-center">{fmtTimeHM(t.start_time)}</Td>
                  <Td className="text-center">{fmtTimeHM(t.end_time)}</Td>
                  <Td right className="font-semibold">{t.effort_hours ?? minutesToHHMM(t.effort_minutes ?? 0)}</Td>
                  <Td className="whitespace-nowrap">{fmtDateBR(t.date)}</Td>
                </Tr>
              ))}
              <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                <td
                  colSpan={9}
                  className="px-5 py-3.5 text-right font-bold"
                  style={{ color: 'var(--brand-text)' }}
                >
                  Total
                </td>
                <td className="px-5 py-3.5 text-right font-bold" style={{ color: 'var(--brand-primary)' }}>
                  {totalHHMM}
                </td>
                <td />
              </tr>
            </Tbody>
          </Table>
        </Card>
      )}

    </AppLayout>
  )
}
