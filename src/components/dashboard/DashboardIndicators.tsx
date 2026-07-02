'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { X, Eye, ArrowLeft, Clock, Calendar, User, FolderOpen, Ticket, Globe, Webhook, Building2, Hash, FileText, CheckCircle, Paperclip } from 'lucide-react'
import { api } from '@/lib/api'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE = [
  'var(--primary)', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#3B82F6', '#EC4899', '#14B8A6',
  '#F97316', '#A78BFA',
]

const CHART_STYLE = { background: 'transparent', backgroundColor: 'transparent', fontSize: 11 }
const CURSOR      = { fill: 'rgba(255,255,255,0.06)' }
const AXIS_TICK   = { fill: '#6B7280', fontSize: 11 }
const GRID_COLOR  = 'rgba(255,255,255,0.06)'
const TOOLTIP_STYLE = {
  background: '#111113', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, fontSize: 12, color: '#E5E7EB',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface HoursByRequesterItem  { requester: string;  total_hours: number }
interface HoursByServiceItem    { service: string;    total_hours: number }
interface TicketsByStatusItem   { status: string;     ticket_count: number }
interface TicketsByLevelItem    { level: string;      ticket_count: number }
interface TicketsByCategoryItem { category: string;   ticket_count: number }
interface TicketsAbove8Item     { ticket_id: string;  total_hours: number }
interface MonthlyTicketsItem    { month: string;      ticket_count: number }
interface MonthlyConsumptionItem{ month: string;      consumed_hours: number }

interface IndicatorData {
  requester:     HoursByRequesterItem[]
  service:       HoursByServiceItem[]
  status:        TicketsByStatusItem[]
  level:         TicketsByLevelItem[]
  category:      TicketsByCategoryItem[]
  above8:        TicketsAbove8Item[]
  monthlyTix:    MonthlyTicketsItem[]
  monthlyConsum: MonthlyConsumptionItem[]
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

function buildTimesheetsParams(params: URLSearchParams, extra?: Record<string, string>): URLSearchParams {
  const month      = params.get('month')
  const year       = params.get('year')
  const startMonth = params.get('start_month') ?? month
  const startYear  = params.get('start_year')  ?? year
  const tp = new URLSearchParams()
  if (startYear && startMonth) {
    tp.set('start_date', `${startYear}-${String(startMonth).padStart(2, '0')}-01`)
  }
  if (year && month) {
    const lastDay = new Date(Number(year), Number(month), 0).getDate()
    tp.set('end_date', `${year}-${String(month).padStart(2, '0')}-${lastDay}`)
  }
  if (params.get('project_id'))  tp.set('project_id',  params.get('project_id')!)
  if (params.get('customer_id')) tp.set('customer_id', params.get('customer_id')!)
  if (extra) Object.entries(extra).forEach(([k, v]) => tp.set(k, v))
  return tp
}

function buildMonthParams(monthStr: string, params: URLSearchParams): URLSearchParams {
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m) return buildTimesheetsParams(params)
  const lastDay = new Date(y, m, 0).getDate()
  const tp = new URLSearchParams()
  tp.set('start_date', `${y}-${String(m).padStart(2, '0')}-01`)
  tp.set('end_date',   `${y}-${String(m).padStart(2, '0')}-${lastDay}`)
  if (params.get('project_id'))  tp.set('project_id',  params.get('project_id')!)
  if (params.get('customer_id')) tp.set('customer_id', params.get('customer_id')!)
  return tp
}

// ─── Timesheets Modal ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado',
  conflicting: 'Conflitante', adjustment_requested: 'Ajuste',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444',
  conflicting: '#F97316', adjustment_requested: '#8B5CF6',
}

function fmtMinutes(m: number) { return (Number(m || 0) / 60).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }
function fmtDate(d: string)    { return d.split('-').reverse().join('/') }

function TimesheetsModal({
  tsParams, page, totalPages, total, timesheets, loading,
  onClose, onPage, onView,
}: {
  tsParams: URLSearchParams; page: number; totalPages: number; total: number
  timesheets: any[]; loading: boolean
  onClose: () => void; onPage: (p: number) => void; onView: (id: number) => void
}) {
  const fullUrl = `/timesheets?${tsParams.toString()}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
            Apontamentos
            {total > 0 && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                ({total})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <Link href={fullUrl} className="text-xs font-medium hover:opacity-80 transition-opacity"
              style={{ color: 'var(--primary)' }}>
              Ver todos →
            </Link>
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex flex-col gap-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
              ))}
            </div>
          ) : timesheets.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum apontamento encontrado.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: 'var(--surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Data', 'Ticket', 'Tempo', 'Colaborador', 'Projeto', 'Descrição', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-light)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timesheets.map((ts: any, i: number) => (
                  <tr key={ts.id ?? i} className="hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {ts.date ? fmtDate(ts.date) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ts.ticket && ts.ticket.length >= 5 ? (
                        <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`}
                          target="_blank" rel="noopener noreferrer"
                          className="hover:underline" style={{ color: 'var(--primary)' }}
                          onClick={e => e.stopPropagation()}>
                          #{ts.ticket}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>#{ts.ticket || '0'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-bold"
                      style={{ color: 'var(--primary)' }}>
                      {ts.effort_minutes != null ? fmtMinutes(ts.effort_minutes) : ts.effort_hours ?? '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text)' }}>
                      {ts.user?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {ts.project?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      {ts.observation ? (
                        <div className="relative group">
                          <span className="block truncate cursor-default text-xs" style={{ color: 'var(--text-muted)' }}>
                            {ts.observation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                          </span>
                          <div className="pointer-events-none absolute z-50 left-0 top-full mt-1 hidden group-hover:block w-72 rounded-xl p-3 text-xs leading-relaxed shadow-2xl"
                            style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
                            {ts.observation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                          </div>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ts.id && (
                        <button
                          onClick={e => { e.stopPropagation(); onView(ts.id) }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
                          style={{ color: 'var(--primary)' }}
                          title="Visualizar apontamento">
                          <Eye size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / Pagination */}
        {(totalPages > 1 || total > 0) && (
          <div className="flex items-center justify-between px-6 py-3 shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {total} apontamento{total !== 1 ? 's' : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => onPage(page - 1)}
                  className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-30 transition-opacity"
                  style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  ←
                </button>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {page} / {totalPages}
                </span>
                <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-30 transition-opacity"
                  style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timesheet Detail Modal ───────────────────────────────────────────────────

function DetailInfoRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="mt-0.5 shrink-0 p-1.5 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
        <Icon size={12} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-light)' }}>{label}</p>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{children}</div>
      </div>
    </div>
  )
}

function TimesheetDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [ts, setTs]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]     = useState('')

  useEffect(() => {
    setLoading(true); setErr('')
    api.get<any>(`/timesheets/${id}`)
      .then(r => setTs(r?.data ?? r))
      .catch(() => setErr('Erro ao carregar apontamento.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <ArrowLeft size={14} />
            </button>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              Detalhe do Apontamento
              {ts && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>#{ts.id}</span>}
            </h2>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 px-5 py-2">
          {loading && (
            <div className="flex flex-col gap-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
              ))}
            </div>
          )}
          {err && <p className="text-sm py-6 text-center" style={{ color: 'var(--danger-border)' }}>{err}</p>}
          {!loading && ts && (
            <div>
              {/* Status badge */}
              <div className="flex flex-wrap items-center gap-2 py-3">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: `${STATUS_COLOR[ts.status] ?? '#6B7280'}22`, color: STATUS_COLOR[ts.status] ?? '#6B7280' }}>
                  {STATUS_LABEL[ts.status] ?? ts.status}
                </span>
                {ts.origin === 'webhook' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: 'var(--purple-bg)', color: 'var(--purple)' }}>
                    <Webhook size={10} /> Auto (Movidesk)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    <Globe size={10} /> Web (manual)
                  </span>
                )}
                {ts.rejection_reason && (
                  <span className="text-xs" style={{ color: 'var(--danger-border)' }}>{ts.rejection_reason}</span>
                )}
              </div>

              <DetailInfoRow icon={Calendar} label="Data">{ts.date ? fmtDate(ts.date) : '—'}</DetailInfoRow>
              <DetailInfoRow icon={Clock} label="Período">
                {ts.start_time} – {ts.end_time}
                {ts.effort_hours && (
                  <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    {ts.effort_hours}
                  </span>
                )}
              </DetailInfoRow>
              <DetailInfoRow icon={User} label="Colaborador">{ts.user?.name ?? '—'}</DetailInfoRow>
              <DetailInfoRow icon={Building2} label="Cliente">{ts.customer?.name ?? ts.project?.customer?.name ?? '—'}</DetailInfoRow>
              <DetailInfoRow icon={FolderOpen} label="Projeto">
                {ts.project?.name ?? '—'}
                {ts.project?.contract_type_display && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>
                    {ts.project.contract_type_display}
                  </span>
                )}
              </DetailInfoRow>
              {ts.ticket && (
                <DetailInfoRow icon={Ticket} label="Ticket">
                  <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--primary)' }} className="hover:underline">
                    #{ts.ticket}
                  </a>
                  {ts.ticket_subject && <span className="ml-2" style={{ color: 'var(--text-muted)' }}>— {ts.ticket_subject}</span>}
                </DetailInfoRow>
              )}
              {ts.movidesk_appointment_id && (
                <DetailInfoRow icon={Hash} label="ID Movidesk">{String(ts.movidesk_appointment_id)}</DetailInfoRow>
              )}
              {ts.observation && (
                <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <FileText size={12} style={{ color: 'var(--primary)' }} />
                    <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-light)' }}>Observação</span>
                  </div>
                  <div className="px-4 py-3 text-sm leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg"
                    style={{ color: 'var(--text-muted)' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(ts.observation) }} />
                </div>
              )}
              {ts.reviewedBy && (
                <div className="flex items-center gap-2 px-4 py-2.5 mt-3 rounded-xl text-xs"
                  style={{ background: 'var(--primary-soft)', border: '1px solid var(--border)', color: 'var(--text-light)' }}>
                  <CheckCircle size={12} style={{ color: 'var(--primary)' }} />
                  Revisado por <strong style={{ color: 'var(--text-muted)' }}>{ts.reviewedBy.name}</strong>
                  {ts.reviewed_at && ` em ${fmtDate(ts.reviewed_at.slice(0, 10))}`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chart sub-components ─────────────────────────────────────────────────────

function ChartCard({ title, children, fullWidth = false, onOpen }: {
  title: string; children: React.ReactNode; fullWidth?: boolean; onOpen?: () => void
}) {
  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-4 ${fullWidth ? 'col-span-full' : ''}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
          {title}
        </h3>
        {onOpen && (
          <button onClick={onOpen} className="text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ color: 'var(--primary)' }}>
            Ver apontamentos →
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Empty() {
  return <p className="text-xs py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum dado disponível.</p>
}

function ChartSkeleton() {
  return <div className="animate-pulse rounded-xl h-52" style={{ background: 'var(--border)' }} />
}

function CustomTooltip({ active, payload, label, valueLabel }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-semibold mb-1 text-white">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {valueLabel ?? p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function renderPieLabel({ percent }: { percent?: number }) {
  if (percent == null || percent < 0.04) return ''
  return `${(percent * 100).toFixed(0)}%`
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  basePath: string
  params: URLSearchParams
  disabled?: boolean
}

const PAGE_SIZE = 15

export default function DashboardIndicators({ basePath, params, disabled = false }: Props) {
  const [data, setData]       = useState<IndicatorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)

  // Modal state
  const [modalTsParams, setModalTsParams] = useState<URLSearchParams | null>(null)
  const [modalPage, setModalPage]         = useState(1)
  const [modalRows, setModalRows]         = useState<any[]>([])
  const [modalTotal, setModalTotal]       = useState(0)
  const [modalLoading, setModalLoading]   = useState(false)
  const [viewId, setViewId]               = useState<number | null>(null)

  const openModal = useCallback((p: URLSearchParams) => {
    setModalTsParams(p)
    setModalPage(1)
  }, [])

  // Fetch indicator charts
  const load = useCallback(async () => {
    if (disabled) return
    setLoading(true); setError(false)
    try {
      const p = params.toString()
      const [req, svc, sta, lvl, cat, a8, mTix, mCon] = await Promise.all([
        api.get<any>(`${basePath}/hours-by-requester?${p}`),
        api.get<any>(`${basePath}/hours-by-service?${p}`),
        api.get<any>(`${basePath}/tickets-by-status?${p}`),
        api.get<any>(`${basePath}/tickets-by-level?${p}`),
        api.get<any>(`${basePath}/tickets-by-category?${p}`),
        api.get<any>(`${basePath}/tickets-above-8-hours?${p}`),
        api.get<any>(`${basePath}/monthly-tickets?${p}`),
        api.get<any>(`${basePath}/monthly-consumption?${p}`),
      ])
      setData({
        requester:     Array.isArray(req?.data)  ? req.data  : [],
        service:       Array.isArray(svc?.data)  ? svc.data  : [],
        status:        Array.isArray(sta?.data)  ? sta.data  : [],
        level:         Array.isArray(lvl?.data)  ? lvl.data  : [],
        category:      Array.isArray(cat?.data)  ? cat.data  : [],
        above8:        Array.isArray(a8?.data)   ? a8.data   : [],
        monthlyTix:    Array.isArray(mTix?.data) ? mTix.data : [],
        monthlyConsum: Array.isArray(mCon?.data) ? mCon.data : [],
      })
    } catch { setError(true) } finally { setLoading(false) }
  }, [basePath, params, disabled])

  useEffect(() => { load() }, [load])

  // Fetch timesheets for modal
  useEffect(() => {
    if (!modalTsParams) return
    setModalLoading(true)
    const p = new URLSearchParams(modalTsParams)
    p.set('page', String(modalPage))
    p.set('per_page', String(PAGE_SIZE))
    api.get<any>(`/timesheets?${p}`)
      .then(r => {
        setModalRows(Array.isArray(r?.items) ? r.items : [])
        setModalTotal(r?.total ?? 0)
      })
      .catch(() => { setModalRows([]); setModalTotal(0) })
      .finally(() => setModalLoading(false))
  }, [modalTsParams, modalPage])

  if (disabled) return null

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`rounded-2xl p-5 ${i >= 6 ? 'col-span-full' : ''}`}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <ChartSkeleton />
          </div>
        ))}
      </div>
    )
  }

  if (error) return (
    <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-sm" style={{ color: 'var(--danger-border)' }}>Erro ao carregar indicadores.</p>
    </div>
  )

  if (!data) return null

  const baseParams = buildTimesheetsParams(params)
  const totalPages = Math.ceil(modalTotal / PAGE_SIZE)

  return (
    <>
      {/* Modals */}
      {modalTsParams && (
        <TimesheetsModal
          tsParams={modalTsParams}
          page={modalPage}
          totalPages={totalPages}
          total={modalTotal}
          timesheets={modalRows}
          loading={modalLoading}
          onClose={() => setModalTsParams(null)}
          onPage={setModalPage}
          onView={id => setViewId(id)}
        />
      )}
      {viewId !== null && (
        <TimesheetDetailModal id={viewId} onClose={() => setViewId(null)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 1 — Horas por Solicitante */}
        <ChartCard title="Horas por Solicitante" onOpen={() => openModal(baseParams)}>
          {data.requester.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.requester} layout="vertical" style={CHART_STYLE}
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickFormatter={v => `${v}h`} />
                <YAxis type="category" dataKey="requester" tick={AXIS_TICK} width={110} />
                <Tooltip content={<CustomTooltip valueLabel="Horas" />} cursor={CURSOR} />
                <Bar dataKey="total_hours" name="Horas" radius={[0, 6, 6, 0]} style={{ cursor: 'pointer' }}
                  onClick={(d: any) => openModal(buildTimesheetsParams(params, { requester: d.requester }))}>
                  {data.requester.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 2 — Motivo de Abertura (trocado de posição com Módulos) */}
        <ChartCard title="Motivo de Abertura" onOpen={() => openModal(baseParams)}>
          {data.category.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.category} style={CHART_STYLE}
                margin={{ top: 0, right: 16, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="category" tick={AXIS_TICK} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip content={<CustomTooltip valueLabel="Tickets" />} cursor={CURSOR} />
                <Bar dataKey="ticket_count" name="Tickets" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }}
                  onClick={(d: any) => openModal(buildTimesheetsParams(params, { category: d.category }))}>
                  {data.category.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 3 — Status por Tickets */}
        <ChartCard title="Status por Tickets" onOpen={() => openModal(baseParams)}>
          {data.status.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.status} style={CHART_STYLE}
                margin={{ top: 0, right: 16, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="status" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip content={<CustomTooltip valueLabel="Tickets" />} cursor={CURSOR} />
                <Bar dataKey="ticket_count" name="Tickets" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }}
                  onClick={(d: any) => openModal(buildTimesheetsParams(params, { ticket_status: d.status }))}>
                  {data.status.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 4 — Níveis de Atendimento */}
        <ChartCard title="Níveis de Atendimento" onOpen={() => openModal(baseParams)}>
          {data.level.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart style={CHART_STYLE}>
                <Pie data={data.level} dataKey="ticket_count" nameKey="level"
                  cx="50%" cy="50%" outerRadius={90}
                  label={renderPieLabel} labelLine={false}
                  style={{ cursor: 'pointer' }}
                  onClick={(d: any) => openModal(buildTimesheetsParams(params, { ticket_level: d.level }))}>
                  {data.level.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
                </Pie>
                <Tooltip content={<CustomTooltip valueLabel="Tickets" />} cursor={CURSOR} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: '#9CA3AF' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 5 — Horas por Módulo (trocado de posição c/ Motivo de Abertura, full-width) */}
        <ChartCard title="Horas por Módulo" fullWidth onOpen={() => openModal(baseParams)}>
          {data.service.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.service} style={CHART_STYLE}
                margin={{ top: 0, right: 16, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="service" tick={AXIS_TICK} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={AXIS_TICK} tickFormatter={v => `${v}h`} />
                <Tooltip content={<CustomTooltip valueLabel="Horas" />} cursor={CURSOR} />
                <Bar dataKey="total_hours" name="Horas" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }}
                  onClick={(d: any) => openModal(buildTimesheetsParams(params, { ticket_service: d.service }))}>
                  {data.service.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 6 — Evolução Mensal (Tickets acima de 8h removido) */}
        {(() => {
          // Ordena cronologicamente: parse "mes/ano" e compara (year, month).
          const MONTH_ABBR_TO_NUM: Record<string, number> = {
            jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
            jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
          }
          const monthKey = (s: string): number => {
            const m = /^([a-zà-ú]{3,})\/?(\d{2,4})$/i.exec(s.trim().toLowerCase())
            if (!m) return 0
            const mon = MONTH_ABBR_TO_NUM[m[1].slice(0, 3)] ?? 0
            const y = Number(m[2].length === 2 ? '20' + m[2] : m[2])
            return y * 12 + mon
          }
          const allMonths = Array.from(new Set([
            ...data.monthlyTix.map(d => d.month),
            ...data.monthlyConsum.map(d => d.month),
          ])).sort((a, b) => monthKey(a) - monthKey(b))
          const combined = allMonths.map(month => ({
            month,
            ticket_count:   data.monthlyTix.find(d => d.month === month)?.ticket_count   ?? 0,
            consumed_hours: data.monthlyConsum.find(d => d.month === month)?.consumed_hours ?? 0,
          }))
          return (
            <ChartCard title="Evolução Mensal — Tickets e Consumo de Horas" fullWidth
              onOpen={() => openModal(baseParams)}>
              {combined.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={combined} style={CHART_STYLE}
                    margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="month" tick={AXIS_TICK} />
                    <YAxis yAxisId="left" tick={AXIS_TICK} allowDecimals={false}
                      label={{ value: 'Tickets', angle: -90, position: 'insideLeft', fill: 'var(--primary)', fontSize: 10, dx: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK}
                      tickFormatter={v => `${v}h`}
                      label={{ value: 'Horas', angle: 90, position: 'insideRight', fill: '#8B5CF6', fontSize: 10, dx: -4 }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR}
                      formatter={(value: any, name: any) =>
                        name === 'Tickets' ? [value, 'Tickets'] : [`${value}h`, 'Horas consumidas']
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#9CA3AF', paddingTop: 8 }} />
                    <Line yAxisId="left" type="monotone" dataKey="ticket_count" name="Tickets"
                      stroke="var(--primary)" strokeWidth={2} dot={{ fill: 'var(--primary)', r: 3 }}
                      activeDot={{ r: 6, style: { cursor: 'pointer' },
                        onClick: (_: any, payload: any) => {
                          if (payload?.payload?.month) openModal(buildMonthParams(payload.payload.month, params))
                        },
                      }}
                    />
                    <Line yAxisId="right" type="monotone" dataKey="consumed_hours" name="Horas consumidas"
                      stroke="#8B5CF6" strokeWidth={2} dot={{ fill: '#8B5CF6', r: 3 }}
                      activeDot={{ r: 6, style: { cursor: 'pointer' },
                        onClick: (_: any, payload: any) => {
                          if (payload?.payload?.month) openModal(buildMonthParams(payload.payload.month, params))
                        },
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          )
        })()}

      </div>
    </>
  )
}
