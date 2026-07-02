'use client'

import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { X as CloseIcon, Download, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { previewText } from '@/lib/sanitize'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { SkeletonTable } from '@/components/ui/loading'

// Apontamento retornado por /dashboards/bank-hours-fixed/project-timesheets.
interface TimesheetRow {
  id: number
  date: string | null
  user?: { id: number; name: string } | null
  ticket?: string | null
  ticket_subject?: string | null
  description?: string | null
  effort_minutes?: number | null
}

interface Props {
  projectId: number
  projectCode?: string
  projectName?: string
  customerId?: number | null
  onClose: () => void
}

// Converte a referência Mês/Ano em date_from (dia 1) / date_to (último dia).
function monthBounds(month: number, year: number) {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

function fmtDateBR(s: string | null | undefined) {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

/**
 * Modal reutilizável de "Apontamentos do projeto" para os dashboards de Contratos.
 * Lista os apontamentos do projeto (pai + filhos), com filtro de data (Mês/Ano | Período)
 * e exportação para Excel (client-side XLSX) e PDF (blob do backend).
 */
export default function ProjectTimesheetsModal({
  projectId,
  projectCode,
  projectName,
  customerId,
  onClose,
}: Props) {
  // Filtro de data — default no mês vigente.
  const now = new Date()
  const [filterMode, setFilterMode] = useState<'month' | 'period'>('month')
  const [refMonth, setRefMonth] = useState<number | null>(now.getMonth() + 1)
  const [refYear, setRefYear] = useState<number | null>(now.getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [rows, setRows] = useState<TimesheetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Resolve o intervalo efetivo (date_from/date_to) a partir do modo atual.
  const bounds = useMemo(() => {
    if (filterMode === 'month' && refMonth && refYear) return monthBounds(refMonth, refYear)
    return { from: dateFrom, to: dateTo }
  }, [filterMode, refMonth, refYear, dateFrom, dateTo])

  // Monta a query string compartilhada por JSON e PDF.
  const queryString = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set('project_id', String(projectId))
    if (customerId) qs.set('customer_id', String(customerId))
    if (bounds.from) qs.set('date_from', bounds.from)
    if (bounds.to) qs.set('date_to', bounds.to)
    return qs.toString()
  }, [projectId, customerId, bounds.from, bounds.to])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get<{ data: TimesheetRow[] }>(`/dashboards/bank-hours-fixed/project-timesheets?${queryString}`)
      .then(r => { if (!cancelled) setRows(Array.isArray(r?.data) ? r.data : []) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [queryString])

  const totalHours = rows.reduce((acc, r) => acc + (r.effort_minutes ?? 0) / 60, 0)

  function exportXLSX() {
    if (rows.length === 0) return
    const data = rows.map(r => ({
      Data: fmtDateBR(r.date),
      Consultor: r.user?.name ?? '',
      Ticket: r.ticket ?? '',
      Título: r.ticket_subject || previewText(r.description),
      'Horas': Number(((r.effort_minutes ?? 0) / 60).toFixed(2)),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Apontamentos')
    const stamp = new Date().toISOString().slice(0, 10)
    const slug = (projectCode || `projeto_${projectId}`).replace(/[^A-Za-z0-9_-]/g, '_')
    XLSX.writeFile(wb, `Apontamentos_${slug}_${stamp}.xlsx`)
  }

  async function exportPDF() {
    setDownloadingPdf(true)
    try {
      // Blob direto no proxy /api/v1 (o middleware injeta o Authorization via cookie).
      const res = await fetch(
        `/api/v1/dashboards/bank-hours-fixed/project-timesheets/pdf?${queryString}`,
        { credentials: 'same-origin', headers: { Accept: 'application/pdf' } },
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const slug = (projectCode || `projeto_${projectId}`).replace(/[^A-Za-z0-9_-]/g, '_')
      const fallback = `Apontamentos_${slug}.pdf`
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
      toast.error(`Erro ao baixar o PDF: ${err instanceof Error ? err.message : 'falha na API'}`)
    } finally {
      setDownloadingPdf(false)
    }
  }

  const headerTitle = [projectCode, projectName].filter(Boolean).join(' — ') || 'Apontamentos do projeto'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-6xl mt-8 rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>Apontamentos — {headerTitle}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Carregando…' : `${rows.length} registro${rows.length === 1 ? '' : 's'} · Total ${totalHours.toFixed(1)}h`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-muted)' }}><CloseIcon size={18} /></button>
        </div>

        {/* Toolbar: filtro de data + exportações */}
        <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
              {(['month', 'period'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className="px-3 py-1.5 font-medium transition-colors"
                  style={{
                    background: filterMode === mode ? 'var(--primary)' : 'transparent',
                    color: filterMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)',
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
                from={dateFrom}
                to={dateTo}
                onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportXLSX}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={exportPDF}
              disabled={rows.length === 0 || downloadingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
            >
              <FileText size={14} /> {downloadingPdf ? 'Gerando…' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto max-h-[65vh]">
          {loading && rows.length === 0 ? (
            /* Skeleton contextual: mesma tabela (5 cols:
               Data · Consultor · Ticket · Título · Horas). Refiltro com dados
               em memória mantém a tabela atual (anti-flicker). */
            <SkeletonTable rows={8} cols={5} />
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sem apontamentos no período.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Data</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Consultor</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Ticket</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Título</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap">Horas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDateBR(r.date)}</td>
                    <td className="px-3 py-2">{r.user?.name ?? '—'}</td>
                    <td className="px-3 py-2">{r.ticket ? <span className="font-mono text-xs">{r.ticket}</span> : '—'}</td>
                    <td className="px-3 py-2 max-w-md truncate" style={{ color: 'var(--text-muted)' }} title={r.ticket_subject || previewText(r.description)}>
                      {r.ticket_subject || previewText(r.description) || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{((r.effort_minutes ?? 0) / 60).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                  <td className="px-3 py-2 font-semibold" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{totalHours.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
