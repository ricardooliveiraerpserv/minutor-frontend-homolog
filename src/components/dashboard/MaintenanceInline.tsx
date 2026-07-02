'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { sanitizeHtml, previewText } from '@/lib/sanitize'
import * as XLSX from 'xlsx'
import {
  Clock, Eye, Download, Calendar, User as UserIcon, Building2, Folder,
  Paperclip, FileText, X as CloseIcon, Undo2, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DataTable, DataTableHead, DataTableHeadRow, DataTableHeadCell,
  DataTableBody, DataTableRow, DataTableCell, DataTableEmpty,
  isActionAllowed,
} from '@/components/ui/ds'

// ─── Types ──────────────────────────────────────────────────────────────────

export type MaintenanceCategory = 'maintenance' | 'architecture'
export type MaintenanceKind = MaintenanceCategory | 'expenses'

// ─── Hook: orquestra fetch das listas + ticket summary ──────────────────────

export function useMaintenanceInline(opts: {
  enabled: boolean
  kind: MaintenanceKind
  customerId?: number | null
  projectId?: number | null
  dateFrom?: string
  dateTo?: string
  dateField?: 'servico' | 'digitacao'  // qual data o período filtra (compat. callers antigos)
  competenciaFrom?: string  // mês do SERVIÇO (trava a competência)
  competenciaTo?: string
  digFrom?: string  // range de DIGITAÇÃO opcional (created_at) — só filtra a lista
  digTo?: string
}) {
  const { enabled, kind, customerId, projectId, dateFrom, dateTo, dateField, competenciaFrom, competenciaTo, digFrom, digTo } = opts
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [ticketSummary, setTicketSummary] = useState<any[]>([])
  const [ticketLoading, setTicketLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    if (!enabled) { setRows([]); setTicketSummary([]); return }
    setLoading(true)
    const qs = new URLSearchParams()
    if (customerId) qs.set('customer_id', String(customerId))
    if (projectId)  qs.set('project_id', String(projectId))
    if (dateFrom)   qs.set('date_from', dateFrom)
    if (dateTo)     qs.set('date_to', dateTo)
    if (dateField === 'digitacao') qs.set('date_field', 'digitacao')
    if (competenciaFrom) qs.set('competencia_start', competenciaFrom)
    if (competenciaTo)   qs.set('competencia_end', competenciaTo)
    if (digFrom) qs.set('dig_from', digFrom)
    if (digTo)   qs.set('dig_to', digTo)
    const path = kind === 'expenses'
      ? `/dashboards/bank-hours-fixed/expenses?${qs}`
      : `/dashboards/bank-hours-fixed/category-timesheets?${qs}&category=${kind}`
    api.get<{ data: any[] }>(path)
      .then(r => setRows(r.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))

    // Apuração por ticket — só pra Sustentação
    if (kind === 'maintenance') {
      setTicketLoading(true)
      api.get<{ tickets: any[] }>(`/dashboards/bank-hours-fixed/category-ticket-summary?${qs}&category=maintenance`)
        .then(r => setTicketSummary(r.tickets ?? []))
        .catch(() => setTicketSummary([]))
        .finally(() => setTicketLoading(false))
    } else {
      setTicketSummary([])
    }
  }, [enabled, kind, customerId, projectId, dateFrom, dateTo, dateField, competenciaFrom, competenciaTo, digFrom, digTo, reloadKey])

  return { rows, loading, ticketSummary, ticketLoading, reload }
}

// Straggler: digitado em mês POSTERIOR ao do serviço (lançado fora da competência do serviço).
function isDigitacaoLate(r: any): boolean {
  if (!r?.created_at || !r?.date) return false
  return String(r.created_at).slice(0, 7) > String(r.date).slice(0, 7)
}

// ─── Export Excel ───────────────────────────────────────────────────────────

export function exportMaintenanceToXLSX(kind: MaintenanceKind, rows: any[], showDigitacao = true) {
  if (rows.length === 0) return
  const sheetName = kind === 'expenses' ? 'Despesas' : (kind === 'architecture' ? 'Arquitetura' : 'Sustentação')
  const data = kind === 'expenses'
    ? rows.map(r => ({
        Data: r.date ? r.date.split('-').reverse().join('/') : '',
        Colaborador: r.user?.name ?? '',
        Valor: Number(r.amount) || 0,
      }))
    : kind === 'maintenance'
      ? rows.map(r => ({
          Data: r.date ? r.date.split('-').reverse().join('/') : '',
          ...(showDigitacao ? {
            Digitação: r.created_at
              ? (isDigitacaoLate(r) ? '⚠ ' : '') + new Date(r.created_at).toLocaleDateString('pt-BR')
              : '',
          } : {}),
          Solicitante: r.requester ?? '',
          Consultor: r.user?.name ?? '',
          Ticket: r.ticket ?? '',
          'Titulo do ticket': r.ticket_subject ?? '',
          Descrição: previewText(r.description),
          Início: r.start_time ?? '',
          Fim: r.end_time ?? '',
          'Esforço (h)': Number(((r.effort_minutes ?? 0) / 60).toFixed(2)),
          'Data do Serviço': r.date ? r.date.split('-').reverse().join('/') : '',
        }))
      : rows.map(r => ({
          Data: r.date ? r.date.split('-').reverse().join('/') : '',
          Consultor: r.user?.name ?? '',
          Descrição: previewText(r.description),
          'Esforço (h)': Number(((r.effort_minutes ?? 0) / 60).toFixed(2)),
        }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${sheetName.toLowerCase()}_${stamp}.xlsx`)
}

// ─── Inline Components ─────────────────────────────────────────────────────

export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
        style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
      >
        <Download size={14} />
        Exportar Excel
      </button>
    </div>
  )
}

// Botão de estornar aprovação — visível só em linha aprovada e quando o caller habilita.
function ReverseApprovalButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      disabled={busy}
      title="Estornar aprovação"
      className="inline-flex items-center justify-center p-1.5 rounded-md transition-colors disabled:opacity-40"
      style={{ color: 'var(--danger-border)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Undo2 size={13} />
    </button>
  )
}

export function InlineTimesheetsTable({ rows, loading, variant = 'maintenance', onRowClick, onReverseApproved, onReverseSuccess, clientView = false, showDigitacao = true }: {
  rows: any[]
  loading: boolean
  variant?: 'maintenance' | 'architecture'
  onRowClick?: (r: any) => void
  // Quando definido, mostra o botão de estornar nas linhas aprovadas.
  onReverseApproved?: boolean
  onReverseSuccess?: () => void
  // Visão do cliente: paginar 30 linhas + totalizador de horas conforme filtro.
  // Outras visões (admin/coord) seguem sem paginação/totalizador.
  clientView?: boolean
  // Coluna/destaque de Digitação (created_at). No perfil de cliente fica só p/ Vedamotors.
  showDigitacao?: boolean
}) {
  const [reversingId, setReversingId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  // ── Ordenação por coluna (clique no cabeçalho) ──────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const requestSort = (k: string) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const sortVal = (r: any, k: string): string | number => {
    switch (k) {
      case 'date':       return r.date ?? ''
      case 'created_at': return r.created_at ?? ''
      case 'requester':  return (r.requester ?? '').toString().toLowerCase()
      case 'consultor':  return (r.user?.name ?? '').toLowerCase()
      case 'ticket':     return r.ticket ?? ''
      case 'titulo':     return (r.ticket_subject ?? '').toLowerCase()
      case 'inicio':     return r.start_time ?? ''
      case 'fim':        return r.end_time ?? ''
      case 'esforco':    return r.effort_minutes ?? 0
      default:           return ''
    }
  }
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const mul = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = sortVal(a, sortKey), bv = sortVal(b, sortKey)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true }) * mul
    })
  }, [rows, sortKey, sortDir])

  // Reset pra página 1 quando filtro/ordenação muda.
  useEffect(() => { setPage(1) }, [rows, sortKey, sortDir])
  const totalPages = clientView ? Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE)) : 1
  const visibleRows = clientView ? sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : sortedRows
  const totalHours = clientView ? rows.reduce((s, r) => s + ((r.effort_minutes ?? 0) / 60), 0) : 0
  // Cabeçalho ordenável: clica e mostra a seta da direção.
  const sortIcon = (k: string) => sortKey === k
    ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
    : <ChevronsUpDown size={11} style={{ opacity: 0.35 }} />
  const SortHead = ({ k, align, children }: { k: string; align?: 'left' | 'center' | 'right'; children: React.ReactNode }) => (
    <DataTableHeadCell align={align} className="cursor-pointer select-none" onClick={() => requestSort(k)}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : ''}`}>{children}{sortIcon(k)}</span>
    </DataTableHeadCell>
  )
  const handleReverse = async (id: number) => {
    if (!confirm('Estornar a aprovação deste apontamento?')) return
    setReversingId(id)
    try {
      await api.post(`/timesheets/${id}/reverse-approval`, {})
      toast.success('Aprovação estornada')
      onReverseSuccess?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao estornar aprovação')
    } finally {
      setReversingId(null)
    }
  }
  const isArch = variant === 'architecture'
  const colSpan = isArch ? 5 : (showDigitacao ? 11 : 10)
  const fmtDigitacao = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="ds-text-h2" style={{ color: 'var(--text)' }}>Apontamentos do período</h3>
        <span className="ds-text-caption flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          {clientView && rows.length > 0 && (
            <span style={{ color: 'var(--text)' }}>
              Total: <strong style={{ color: 'var(--primary)' }}>{totalHours.toFixed(2)}h</strong>
            </span>
          )}
          <span>{rows.length} registros</span>
        </span>
      </div>
      <DataTable inline>
        <DataTableHead>
          <DataTableHeadRow>
            {isArch ? (
              <>
                <DataTableHeadCell>Data</DataTableHeadCell>
                <DataTableHeadCell>Consultor</DataTableHeadCell>
                <DataTableHeadCell>Descrição</DataTableHeadCell>
                <DataTableHeadCell align="right">Horas</DataTableHeadCell>
                <DataTableHeadCell align="right" />
              </>
            ) : (
              <>
                <SortHead k="date">Data</SortHead>
                {showDigitacao && <SortHead k="created_at">Digitação</SortHead>}
                <SortHead k="requester">Solicitante</SortHead>
                <SortHead k="consultor">Consultor</SortHead>
                <SortHead k="ticket">Ticket</SortHead>
                <SortHead k="titulo">Título do ticket</SortHead>
                <DataTableHeadCell>Descrição</DataTableHeadCell>
                <SortHead k="inicio">Início</SortHead>
                <SortHead k="fim">Fim</SortHead>
                <SortHead k="esforco" align="right">Esforço (h)</SortHead>
                <DataTableHeadCell align="right" />
              </>
            )}
          </DataTableHeadRow>
        </DataTableHead>
        <DataTableBody>
          {loading ? (
            <DataTableEmpty colSpan={colSpan} message="Carregando…" />
          ) : rows.length === 0 ? (
            <DataTableEmpty colSpan={colSpan} message="Sem apontamentos no período selecionado." />
          ) : visibleRows.map(r => {
            const desc = previewText(r.description) || '—'
            const canReverse = onReverseApproved && isActionAllowed(r.status, 'reverse_approval')
            const handleClick = onRowClick ? () => onRowClick(r) : undefined
            return isArch ? (
              <DataTableRow key={r.id} onClick={handleClick}>
                <DataTableCell>{r.date ? r.date.split('-').reverse().join('/') : '—'}</DataTableCell>
                <DataTableCell muted={false}>{r.user?.name ?? '—'}</DataTableCell>
                <DataTableCell className="max-w-2xl truncate" title={desc}>{desc}</DataTableCell>
                <DataTableCell align="right" numeric muted={false}>{((r.effort_minutes ?? 0) / 60).toFixed(2)}h</DataTableCell>
                <DataTableCell align="right">
                  {canReverse && <ReverseApprovalButton onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                  {onRowClick && <Eye size={14} className="inline-block ml-1" style={{ color: 'var(--text-muted)' }} />}
                </DataTableCell>
              </DataTableRow>
            ) : (
              <DataTableRow key={r.id} onClick={handleClick}>
                <DataTableCell>{r.date ? r.date.split('-').reverse().join('/') : '—'}</DataTableCell>
                {showDigitacao && (
                  <DataTableCell
                    title={isDigitacaoLate(r) ? 'Digitado fora da competência do serviço (lançado depois)' : (r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '')}
                    style={isDigitacaoLate(r) ? { color: 'var(--warning)', fontWeight: 600 } : undefined}
                  >{isDigitacaoLate(r) && '⚠ '}{fmtDigitacao(r.created_at)}</DataTableCell>
                )}
                <DataTableCell muted={false}>{r.requester ?? '—'}</DataTableCell>
                <DataTableCell muted={false}>{r.user?.name ?? '—'}</DataTableCell>
                <DataTableCell>
                  {r.ticket
                    ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${r.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }} onClick={e => e.stopPropagation()}>#{r.ticket}</a>
                    : <span style={{ color: 'var(--text-light)' }}>—</span>}
                </DataTableCell>
                <DataTableCell className="max-w-xs truncate" title={r.ticket_subject ?? '—'}>{r.ticket_subject ?? '—'}</DataTableCell>
                <DataTableCell className="max-w-sm truncate" title={desc}>{desc}</DataTableCell>
                <DataTableCell>{r.start_time ?? '—'}</DataTableCell>
                <DataTableCell>{r.end_time ?? '—'}</DataTableCell>
                <DataTableCell align="right" numeric muted={false}>{((r.effort_minutes ?? 0) / 60).toFixed(2)}</DataTableCell>
                <DataTableCell align="right">
                  {canReverse && <ReverseApprovalButton onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                  {onRowClick && <Eye size={14} className="inline-block ml-1" style={{ color: 'var(--text-muted)' }} />}
                </DataTableCell>
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
      {clientView && totalPages > 1 && (
        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="ds-text-caption" style={{ color: 'var(--text-muted)' }}>
            Página {page} de {totalPages} · mostrando {visibleRows.length} de {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >Anterior</button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function InlineTicketSummaryTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  // Apuração em horas DECIMAIS (não HH:MM) — ex.: 44h42min = 44,70h → "44.70h".
  const fmtH = (mins: number) => `${((mins ?? 0) / 60).toFixed(2)}h`
  if (!loading && rows.length === 0) return null
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="ds-text-h2" style={{ color: 'var(--text)' }}>Apuração por Ticket</h3>
        <span className="ds-text-caption" style={{ color: 'var(--text-muted)' }}>{rows.length} tickets</span>
      </div>
      <DataTable inline>
        <DataTableHead>
          <DataTableHeadRow>
            <DataTableHeadCell>Ticket</DataTableHeadCell>
            <DataTableHeadCell>Título</DataTableHeadCell>
            <DataTableHeadCell>Solicitante</DataTableHeadCell>
            <DataTableHeadCell>Status Ticket</DataTableHeadCell>
            <DataTableHeadCell align="right">Total no período</DataTableHeadCell>
            <DataTableHeadCell align="right">Total histórico</DataTableHeadCell>
          </DataTableHeadRow>
        </DataTableHead>
        <DataTableBody>
          {loading ? (
            <DataTableEmpty colSpan={6} message="Carregando…" />
          ) : rows.map(tk => (
            <DataTableRow key={tk.ticket}>
              <DataTableCell>
                <a href={`https://erpserv.movidesk.com/Ticket/Edit/${tk.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }}>#{tk.ticket}</a>
              </DataTableCell>
              <DataTableCell muted={false}>{tk.title ?? '—'}</DataTableCell>
              <DataTableCell>{tk.requester ?? '—'}</DataTableCell>
              <DataTableCell>
                {(() => {
                  if (!tk.status) return <span style={{ color: 'var(--text-light)' }}>—</span>
                  const b = String(tk.base_status ?? tk.status).toLowerCase()
                  const c =
                    /cancel/.test(b)                                        ? '#ef4444' :
                    /(resolv|closed|fechad|encerrad)/.test(b)               ? '#22c55e' :
                    /(stop|parad|aguard|pend|espera)/.test(b)               ? '#f59e0b' :
                    /(new|novo|attend|atend|andamento|aberto|open)/.test(b) ? '#00b8d4' :
                                                                              '#9ca3af'
                  return (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                      style={{ color: c, background: `${c}22`, border: `1px solid ${c}55` }}>
                      {tk.status}
                    </span>
                  )
                })()}
              </DataTableCell>
              <DataTableCell align="right" numeric muted={false}>{fmtH(tk.period_minutes)}</DataTableCell>
              <DataTableCell align="right" numeric>{fmtH(tk.lifetime_minutes)}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
        {!loading && rows.length > 0 && (
          <tfoot style={{ borderTop: '1px solid var(--border)' }}>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                Totais ({rows.length} {rows.length === 1 ? 'ticket' : 'tickets'})
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-[13px]" style={{ color: 'var(--text)' }}>{fmtH(rows.reduce((s, r) => s + (r.period_minutes || 0), 0))}</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-[13px]" style={{ color: 'var(--text-muted)' }}>{fmtH(rows.reduce((s, r) => s + (r.lifetime_minutes || 0), 0))}</td>
            </tr>
          </tfoot>
        )}
      </DataTable>
    </div>
  )
}

export function InlineExpensesTable({ rows, loading, onReverseApproved, onReverseSuccess }: {
  rows: any[]
  loading: boolean
  onReverseApproved?: boolean
  onReverseSuccess?: () => void
}) {
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const [reversingId, setReversingId] = useState<number | null>(null)
  const handleReverse = async (id: number) => {
    if (!confirm('Estornar a aprovação desta despesa?')) return
    setReversingId(id)
    try {
      await api.post(`/expenses/${id}/reverse-approval`, {})
      toast.success('Aprovação estornada')
      onReverseSuccess?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao estornar aprovação')
    } finally {
      setReversingId(null)
    }
  }
  const colSpan = onReverseApproved ? 4 : 3
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="ds-text-h2" style={{ color: 'var(--text)' }}>Despesas do período</h3>
        <span className="ds-text-caption" style={{ color: 'var(--text-muted)' }}>{rows.length} registros</span>
      </div>
      <DataTable inline>
        <DataTableHead>
          <DataTableHeadRow>
            <DataTableHeadCell>Data</DataTableHeadCell>
            <DataTableHeadCell>Colaborador</DataTableHeadCell>
            <DataTableHeadCell align="right">Valor</DataTableHeadCell>
            {onReverseApproved && <DataTableHeadCell align="right" />}
          </DataTableHeadRow>
        </DataTableHead>
        <DataTableBody>
          {loading ? (
            <DataTableEmpty colSpan={colSpan} message="Carregando…" />
          ) : rows.length === 0 ? (
            <DataTableEmpty colSpan={colSpan} message="Sem despesas no período selecionado." />
          ) : rows.map(r => {
            const canReverse = onReverseApproved && isActionAllowed(r.status, 'reverse_approval')
            return (
              <DataTableRow key={r.id}>
                <DataTableCell>{r.date ? r.date.split('-').reverse().join('/') : '—'}</DataTableCell>
                <DataTableCell muted={false}>{r.user?.name ?? '—'}</DataTableCell>
                <DataTableCell align="right" numeric muted={false}>{fmtBRL(Number(r.amount) || 0)}</DataTableCell>
                {onReverseApproved && (
                  <DataTableCell align="right">
                    {canReverse && <ReverseApprovalButton onClick={() => handleReverse(r.id)} busy={reversingId === r.id} />}
                  </DataTableCell>
                )}
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  )
}

export function TimesheetDetailModal({ ts, onClose }: { ts: any; onClose: () => void }) {
  const fmtDateBR = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '—'
  const period = (ts.start_time && ts.end_time) ? `${ts.start_time} – ${ts.end_time}` : null
  const hours = ((ts.effort_minutes ?? 0) / 60)
  const hoursDisplay = `${Math.floor(hours)}:${String(Math.round((hours - Math.floor(hours)) * 60)).padStart(2, '0')}`
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl mt-8 rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 py-5 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
              <Clock size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Detalhe do Apontamento</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>#{ts.id} · {fmtDateBR(ts.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-muted)' }}><CloseIcon size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {period && (
            <div className="rounded-xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Período</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>
                {period} <span className="text-base font-normal" style={{ color: 'var(--text-muted)' }}>({hoursDisplay})</span>
              </p>
            </div>
          )}

          <div className="rounded-xl divide-y" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
            <DetailRow icon={<Calendar size={14} />} label="Data" value={fmtDateBR(ts.date)} />
            <DetailRow icon={<UserIcon size={14} />} label="Colaborador" value={ts.user?.name ?? '—'} />
            <DetailRow icon={<Building2 size={14} />} label="Cliente" value={ts.customer ?? '—'} />
            <DetailRow icon={<Folder size={14} />} label="Projeto" value={
              <div className="flex items-center gap-2 flex-wrap">
                <span>{ts.project?.name ?? '—'}</span>
                {ts.project?.contract_type && (
                  <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{ts.project.contract_type}</span>
                )}
              </div>
            } />
            <DetailRow icon={<Paperclip size={14} />} label="Anexo" value={ts.attachment_path ? <a href={ts.attachment_path} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Ver anexo</a> : 'Sem anexo'} />
            {ts.ticket && (
              <DetailRow icon={<FileText size={14} />} label="Ticket" value={
                <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs" style={{ color: 'var(--primary)' }}>#{ts.ticket}{ts.ticket_subject ? ` · ${ts.ticket_subject}` : ''}</a>
              } />
            )}
          </div>

          {ts.description && (
            <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} style={{ color: 'var(--primary)' }} />
                <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Observação</span>
              </div>
              <div
                className="text-sm leading-relaxed
                  [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                  [&_a]:underline [&_a]:text-[var(--primary)]
                  [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto
                  [&_code]:break-words
                  [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
                  [&_th]:border [&_th]:border-[var(--border)] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold
                  [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top
                  [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5
                  [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
                  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                  [&_hr]:my-3 [&_hr]:border-[var(--border)]
                "
                style={{ color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(ts.description) }}
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
