'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Clock, BarChart2, Download } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

interface TimesheetEntry {
  id: number
  date: string
  effort_hours: string
  effort_minutes: number
  observation?: string
  status: string
  status_display: string
  user?: { id: number; name: string }
}

interface ExpenseEntry {
  id: number
  description: string
  amount: number
  expense_date: string
  status: string
  status_display?: string
  category?: { name: string }
  user?: { name: string }
}

interface Props {
  projectId: number
  projectName: string
  initialTab?: 'timesheets' | 'expenses'
  onClose: () => void
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  conflicted: '#a855f7',
  adjustment_requested: '#3b82f6',
  internal: '#6366f1',
}

function fmtDate(d: string) {
  return d.slice(0, 10).split('-').reverse().join('/')
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseEffortToDecimal(effortHours: string, effortMinutes: number): number {
  if (effortHours.includes(':')) {
    const [hStr, mStr] = effortHours.split(':')
    return parseInt(hStr, 10) + parseInt(mStr || '0', 10) / 60
  }
  return (parseFloat(effortHours) || 0) + (effortMinutes || 0) / 60
}

function fmtHours(effortHours: string, effortMinutes: number) {
  return `${parseEffortToDecimal(effortHours, effortMinutes).toFixed(2)}h`
}

function defaultStart() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function defaultEnd() {
  return new Date().toISOString().slice(0, 10)
}

export function ProjectDataModal({ projectId, projectName, initialTab = 'timesheets', onClose }: Props) {
  const [tab, setTab] = useState<'timesheets' | 'expenses'>(initialTab)
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    try {
      if (tab === 'timesheets') {
        const r = await api.get<any>(
          `/timesheets?project_id=${projectId}&start_date=${startDate}&end_date=${endDate}&per_page=500&sort=date&direction=desc`
        )
        const items = Array.isArray(r?.data) ? r.data : Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : []
        setTimesheets(items)
      } else {
        const r = await api.get<any>(
          `/expenses?project_id=${projectId}&start_date=${startDate}&end_date=${endDate}&per_page=500`
        )
        const items = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
        setExpenses(items)
      }
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [projectId, tab, startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  function exportExcel() {
    const safeName = projectName.replace(/\s+/g, '_').replace(/[[\]]/g, '')
    const period = `${startDate}_${endDate}`

    if (tab === 'timesheets') {
      const rows = timesheets.map(t => ({
        'Data': fmtDate(t.date),
        'Colaborador': t.user?.name ?? '—',
        'Horas': parseEffortToDecimal(t.effort_hours, t.effort_minutes),
        'Observação': t.observation ?? '',
        'Status': t.status_display,
      }))
      rows.push({ 'Data': '', 'Colaborador': 'TOTAL', 'Horas': totalHours, 'Observação': '', 'Status': '' })

      const ws = XLSX.utils.json_to_sheet(rows)
      // Bold the total row
      const totalRowIdx = rows.length // 1-based header + rows (header is row 1)
      const totalCell = `C${totalRowIdx + 1}` // +1 for header
      if (ws[totalCell]) ws[totalCell].s = { font: { bold: true } }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Apontamentos')
      XLSX.writeFile(wb, `apontamentos-${safeName}-${period}.xlsx`)
    } else {
      const rows = expenses.map(e => ({
        'Data': fmtDate(e.expense_date),
        'Descrição': e.description,
        'Categoria': e.category?.name ?? '—',
        'Responsável': e.user?.name ?? '—',
        'Valor (R$)': e.amount,
        'Status': e.status_display ?? e.status,
      }))
      rows.push({ 'Data': '', 'Descrição': 'TOTAL', 'Categoria': '', 'Responsável': '', 'Valor (R$)': totalExpenses, 'Status': '' })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Despesas')
      XLSX.writeFile(wb, `despesas-${safeName}-${period}.xlsx`)
    }
  }

  const totalHours = timesheets.reduce((s, t) => s + parseEffortToDecimal(t.effort_hours, t.effort_minutes), 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const activeCount = tab === 'timesheets' ? timesheets.length : expenses.length

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col w-full max-w-3xl rounded-2xl max-h-[90vh]"
        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Projeto</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{projectName}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={16} style={{ color: 'var(--brand-muted)' }} />
          </button>
        </div>

        {/* Tabs + Period */}
        <div className="flex items-center justify-between gap-4 px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {(['timesheets', 'expenses'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={tab === t
                  ? { background: 'var(--brand-primary)', color: '#000' }
                  : { color: 'var(--brand-muted)' }}
              >
                {t === 'timesheets' ? <Clock size={12} /> : <BarChart2 size={12} />}
                {t === 'timesheets' ? 'Apontamentos' : 'Despesas'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: 'var(--brand-subtle)' }}>Início</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: 'var(--brand-subtle)' }}>Fim</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm animate-pulse py-16" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
          ) : tab === 'timesheets' ? (
            timesheets.length === 0 ? (
              <p className="text-center text-sm py-16" style={{ color: 'var(--brand-subtle)' }}>Nenhum apontamento neste período.</p>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Horas', value: `${totalHours.toFixed(1)}h`, color: '#00F5FF' },
                    { label: 'Registros', value: String(timesheets.length), color: 'var(--brand-text)' },
                    { label: 'Aprovados', value: String(timesheets.filter(t => t.status === 'approved').length), color: '#22c55e' },
                    { label: 'Pendentes', value: String(timesheets.filter(t => t.status === 'pending').length), color: '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{s.label}</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-clip" style={{ border: '1px solid var(--brand-border)' }}>
                  <table className="w-full text-xs">
                    <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                        {['Data', 'Colaborador', 'Horas', 'Observação', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timesheets.map((ts, i) => {
                        const c = STATUS_COLOR[ts.status] ?? '#94a3b8'
                        return (
                          <tr key={ts.id} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{fmtDate(ts.date)}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--brand-text)' }}>{ts.user?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: '#00F5FF' }}>{fmtHours(ts.effort_hours, ts.effort_minutes)}</td>
                            <td className="px-3 py-2.5 max-w-[200px] truncate" style={{ color: 'var(--brand-muted)' }}>{ts.observation ?? '—'}</td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: `${c}18`, color: c }}>
                                {ts.status_display}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid rgba(0,245,255,0.2)' }}>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Total</td>
                        <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: '#00F5FF' }}>{totalHours.toFixed(1)}h</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            expenses.length === 0 ? (
              <p className="text-center text-sm py-16" style={{ color: 'var(--brand-subtle)' }}>Nenhuma despesa neste período.</p>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total', value: fmtBRL(totalExpenses), color: '#00F5FF' },
                    { label: 'Registros', value: String(expenses.length), color: 'var(--brand-text)' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{s.label}</p>
                      <p className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-clip" style={{ border: '1px solid var(--brand-border)' }}>
                  <table className="w-full text-xs">
                    <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                        {['Data', 'Descrição', 'Categoria', 'Responsável', 'Valor', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((e, i) => {
                        const c = STATUS_COLOR[e.status] ?? '#94a3b8'
                        return (
                          <tr key={e.id} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{fmtDate(e.expense_date)}</td>
                            <td className="px-3 py-2.5 max-w-[150px] truncate" style={{ color: 'var(--brand-text)' }}>{e.description}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--brand-muted)' }}>{e.category?.name ?? '—'}</td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--brand-muted)' }}>{e.user?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: '#00F5FF' }}>{fmtBRL(e.amount)}</td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: `${c}18`, color: c }}>
                                {e.status_display ?? e.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid rgba(0,245,255,0.2)' }}>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Total</td>
                        <td colSpan={2} />
                        <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: '#00F5FF' }}>{fmtBRL(totalExpenses)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button
            onClick={exportExcel}
            disabled={loading || activeCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
            style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.2)' }}
          >
            <Download size={12} /> Exportar Excel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5"
            style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
