'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import {
  AlertTriangle, TrendingUp, Clock, Users, ChevronDown,
  FileText, CheckCircle, Check, X, Search, ChevronRight,
  BarChart2, CalendarClock, Zap, Layers, LayoutGrid, List, FolderOpen,
} from 'lucide-react'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  LineChart, Line, Cell,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalData {
  customer: { id: number; name: string }
  period: string
  overview: {
    balance_hours: number
    consumption_pct: number
    investment: number
    status: 'ok' | 'warning' | 'critical'
    total_sold: number
    total_consumed: number
    month_consumed: number
    prev_consumed: number
    trend_pct: number
    trend_dir: 'up' | 'down' | 'stable'
    avg_monthly: number
    avg_weekly: number
    weeks_remaining: number | null
    filter_month: number
    filter_year: number
  }
  monthly_chart: { month: string; label: string; consumed_hours: number }[]
  contracts: ContractGroup[]
  projects: PortalProject[]
  support: SupportData
  alerts: PortalAlert[]
}

interface ContractGroup {
  contract_type: string
  sold_hours: number
  consumed_hours: number
  balance_hours: number
  consumption_pct: number
  project_count: number
  status: 'ok' | 'warning' | 'critical'
}

interface PortalProject {
  id: number
  name: string
  code: string
  status_display: string
  sold_hours: number
  consumed_hours: number
  balance_hours: number
  consumption_pct: number
  health: 'ok' | 'warning' | 'critical'
  contract_type: string
  is_sustentacao: boolean
  children: PortalProject[]
}

interface SupportData {
  open_tickets: number
  resolved_tickets: number
  total_tickets: number
  consumed_hours: number
  avg_hours_ticket: number
  monthly_tickets: { month: string; count: number }[]
}

interface PortalAlert {
  type: 'critical' | 'warning'
  icon: string
  title: string
  message: string
  project_id?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HC = {
  ok:       { bar: '#22c55e', text: '#86efac', bg: 'rgba(34,197,94,0.10)',   border: '#22c55e' },
  warning:  { bar: '#f59e0b', text: '#fcd34d', bg: 'rgba(245,158,11,0.10)', border: '#f59e0b' },
  critical: { bar: '#ef4444', text: '#fca5a5', bg: 'rgba(239,68,68,0.10)',  border: '#ef4444' },
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const fmtR = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const STATUS_LABEL: Record<string, string> = {
  ok: 'Saudável', warning: 'Atenção', critical: 'Crítico',
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl ${className}`} style={{ background: 'rgba(255,255,255,0.06)' }} />
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const c = HC[status as keyof typeof HC] ?? HC.ok
  return (
    <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? HC.critical.bar : c.bar }}
      />
    </div>
  )
}

// ─── MultiCustomerSelect ──────────────────────────────────────────────────────

function MultiCustomerSelect({ selected, onChange, options }: {
  selected: string[]
  onChange: (v: string[]) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())), [options, q])
  const isAll = selected.length === 0

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }

  const label = isAll
    ? 'Todos os clientes'
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? '1 cliente')
      : `${selected.length} clientes selecionados`

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ('') }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQ('') }}
        className="flex items-center gap-2 pl-4 pr-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer"
        style={{
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${!isAll ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
          color: isAll ? 'var(--brand-subtle)' : 'var(--brand-text)', minWidth: 220,
        }}
      >
        <span className="flex-1 text-left truncate font-medium">{label}</span>
        {!isAll && (
          <span onClick={e => { e.stopPropagation(); onChange([]) }}
            className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--brand-subtle)' }}>
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', minWidth: 260 }}>
          <div className="p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar..." className="w-full pl-7 pr-2 py-1.5 text-sm rounded-lg outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-text)' }} />
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {/* Todos */}
            <button type="button" onClick={() => { onChange([]); setOpen(false); setQ('') }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/[0.06] transition-colors border-b"
              style={{ color: isAll ? '#00F5FF' : 'var(--brand-muted)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isAll ? 'border-[#00F5FF] bg-[#00F5FF]' : 'border-zinc-600'}`}>
                {isAll && <CheckCircle size={10} className="text-black" />}
              </div>
              Todos os clientes
            </button>
            {filtered.map(o => {
              const checked = selected.includes(o.value)
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors"
                  style={{ color: checked ? '#00F5FF' : 'var(--brand-text)' }}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${checked ? 'border-[#00F5FF] bg-[#00F5FF]' : 'border-zinc-600'}`}>
                    {checked && <CheckCircle size={10} className="text-black" />}
                  </div>
                  {o.label}
                </button>
              )
            })}
            {filtered.length === 0 && <p className="px-3 py-3 text-xs text-center" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t flex justify-between items-center" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{selected.length} selecionado{selected.length !== 1 ? 's' : ''}</span>
              <button type="button" onClick={() => onChange([])} className="text-xs" style={{ color: '#00F5FF' }}>Limpar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: 'all',     label: 'Todo o período' },
  { value: 'month',   label: 'Este mês' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year',    label: 'Este ano' },
]


// ── ExecMultiSelect ───────────────────────────────────────────────────────────

function ExecMultiSelect({ selected, onChange, options }: {
  selected: string[]
  onChange: (v: string[]) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())), [options, q])

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  const label = selected.length === 0
    ? 'Todos os executivos'
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? '1 executivo')
      : `${selected.length} executivos`

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ('') }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(v => !v); setQ('') }}
        className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm rounded-lg outline-none cursor-pointer whitespace-nowrap"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: selected.length > 0 ? 'var(--brand-text)' : 'var(--brand-subtle)', minWidth: 160 }}>
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={12} style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-xl shadow-xl overflow-hidden" style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', minWidth: 220, maxWidth: 320 }}>
          <div className="p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar executivo..."
              className="w-full bg-transparent outline-none text-sm px-1"
              style={{ color: 'var(--brand-text)', caretColor: '#00F5FF' }} />
          </div>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/[0.06] transition-colors"
              style={{ color: '#00F5FF', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              Limpar seleção
            </button>
          )}
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {filtered.map(o => {
              const checked = selected.includes(o.value)
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2"
                  style={{ color: checked ? '#00F5FF' : 'var(--brand-text)' }}>
                  <span className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border"
                    style={{ borderColor: checked ? '#00F5FF' : 'rgba(255,255,255,0.2)', background: checked ? '#00F5FF' : 'transparent' }}>
                    {checked && <Check size={9} color="#0A0A0B" strokeWidth={3} />}
                  </span>
                  {o.label}
                </button>
              )
            })}
            {filtered.length === 0 && <p className="px-3 py-3 text-xs text-center" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Indicadores helpers ──────────────────────────────────────────────────────

const IND_CACHE_TTL = 5 * 60 * 1000
function indCacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > IND_CACHE_TTL) { sessionStorage.removeItem(key); return null }
    return data as T
  } catch { return null }
}
function indCacheSet(key: string, data: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

function healthColorInd(pct: number | undefined): 'green' | 'yellow' | 'red' {
  if (pct == null) return 'green'
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}
const HSI = {
  green:  { bar: '#22c55e', badge: 'rgba(34,197,94,0.12)',  text: '#86efac' },
  yellow: { bar: '#f59e0b', badge: 'rgba(245,158,11,0.12)', text: '#fcd34d' },
  red:    { bar: '#ef4444', badge: 'rgba(239,68,68,0.12)',  text: '#fca5a5' },
}

function IndChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-sm shadow-lg" style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', color: '#E4E4E7' }}>
      <p className="font-semibold mb-1.5" style={{ color: '#A1A1AA' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="tabular-nums" style={{ color: p.stroke }}>
          {p.name}: <strong>{fmt(p.value ?? 0)}</strong>{p.dataKey === 'hours' ? 'h' : ''}
        </p>
      ))}
    </div>
  )
}

// ── ProjectSearchSelect ───────────────────────────────────────────────────────

function ProjectSearchSelect({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())), [options, q])
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(v => !v); setQ('') }}
        className="flex items-center gap-2 pl-3 pr-2 py-2.5 text-sm rounded-xl outline-none cursor-pointer whitespace-nowrap font-medium"
        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${value ? 'rgba(0,245,255,0.4)' : 'var(--brand-border)'}`, color: value ? 'var(--brand-primary)' : 'var(--brand-text)', minWidth: 180 }}>
        <span className="flex-1 text-left truncate">{selected?.label ?? 'Todos os projetos'}</span>
        <ChevronDown size={12} style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 rounded-xl shadow-xl overflow-hidden" style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', minWidth: 260, maxWidth: 360 }}>
          <div className="p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar projeto..."
                className="w-full pl-7 pr-2 py-1.5 text-sm rounded-lg outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-text)', caretColor: '#00F5FF' }} />
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors"
              style={{ color: value === '' ? '#00F5FF' : 'var(--brand-muted)' }}>
              Todos os projetos
            </button>
            {filtered.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors"
                style={{ color: value === o.value ? '#00F5FF' : 'var(--brand-text)' }}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-center" style={{ color: 'var(--brand-subtle)' }}>Nenhum projeto encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PortalClientePage() {
  const { user } = useAuth()
  const router = useRouter()
  const isCliente = user?.type === 'cliente'

  useEffect(() => {
    if (user && user.type === 'coordenador') router.replace('/dashboard')
  }, [user, router])

  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([])
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [multiData, setMultiData] = useState<(PortalData & { _cid: string })[]>([])
  const [multiLoading, setMultiLoading] = useState(false)
  const [period, setPeriod] = useState('all')

  // single-customer derived (existing code path)
  const customerId = customerIds.length === 1 ? customerIds[0] : ''
  const [filterMonth, setFilterMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [filterYear, setFilterYear]   = useState<number | null>(new Date().getFullYear())
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  const [projectFilter, setProjectFilter] = useState<number | null>(null)
  const [healthFilter, setHealthFilter] = useState<'all' | 'ok' | 'warning' | 'critical'>('all')
  const [viewMode, setViewMode] = useState<'card' | 'linear'>('card')
  const [activeTab, setActiveTab] = useState<'portal' | 'indicadores'>('portal')

  // ── Indicadores state ──
  const normalizeInd = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const IND_EXCLUDED = ['sustentacao']
  const [indProjects, setIndProjects] = useState<any[]>(() => indCacheGet<any[]>('ind_projects') ?? [])
  const [indTeamProjects, setIndTeamProjects] = useState<any[]>(() => indCacheGet<any[]>('ind_team') ?? [])
  const [indPendingTs, setIndPendingTs] = useState(0)
  const [indPendingExp, setIndPendingExp] = useState(0)
  const [indLoading, setIndLoading] = useState(false)
  const [indTeamLoading, setIndTeamLoading] = useState(false)
  const [indHoursData, setIndHoursData] = useState<{ id: number; name: string; total_hours: number }[]>([])
  const [indHoursLoading, setIndHoursLoading] = useState(false)
  const indLoadedRef = useRef(false)
  const execLoadedRef = useRef(false)
  const [indCFilter, setIndCFilter] = useState('')
  const [indPFilter, setIndPFilter] = useState('')

  const [indStatusFilter, setIndStatusFilter] = useState('')
  const [indExecFilter, setIndExecFilter] = useState<string[]>([])
  const [execFilter,    setExecFilter]    = useState<string[]>([])

  // Para cliente: usa o customer_id do próprio usuário automaticamente
  useEffect(() => {
    if (isCliente && user?.customer_id) {
      setCustomerIds([String(user.customer_id)])
    }
  }, [isCliente, user?.customer_id])

  // Para admin/coordenador: carrega lista de clientes
  useEffect(() => {
    if (isCliente) return
    api.get<any[]>('/client/portal/customers')
      .then(res => setCustomers((res ?? []).map((c: any) => ({ value: String(c.id), label: c.name }))))
      .catch(() => {})
  }, [isCliente])

  // Load portal data when customer or period changes
  useEffect(() => {
    if (!customerId) { setData(null); return }
    setLoading(true)
    const qs = new URLSearchParams({ customer_id: customerId, period })
    if (filterMonth && filterYear) { qs.set('filter_month', String(filterMonth)); qs.set('filter_year', String(filterYear)) }
    api.get<PortalData>(`/client/portal?${qs}`)
      .then(res => {
        setData(res)
        // Salva dashboards disponíveis para sidebar dinâmica
        if (res?.contracts) {
          const nrm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const types = res.contracts.map((c: any) => nrm(c.contract_type))
          const available: string[] = []
          if (types.some((t: string) => t.includes('fixo'))) available.push('bank-hours-fixed')
          if (types.some((t: string) => t.includes('mensal'))) available.push('bank-hours-monthly')
          if (types.some((t: string) => t.includes('demand'))) available.push('on-demand')
          try { sessionStorage.setItem('client_dashboards', JSON.stringify(available)) } catch {}
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [customerId, period, filterMonth, filterYear])

  // Multi-customer load (Todos or >1 selected)
  const isMultiMode = !isCliente && customerIds.length !== 1
  useEffect(() => {
    if (!isMultiMode) { setMultiData([]); return }
    const ids = customerIds.length === 0
      ? customers.slice(0, 25).map(c => c.value)
      : customerIds
    if (!ids.length) { setMultiData([]); return }
    setMultiLoading(true)
    Promise.all(ids.map(cid => {
      const qs = new URLSearchParams({ customer_id: cid, period })
      if (filterMonth && filterYear) { qs.set('filter_month', String(filterMonth)); qs.set('filter_year', String(filterYear)) }
      return api.get<PortalData>(`/client/portal?${qs}`)
        .then(r => ({ ...r, _cid: cid }))
        .catch(() => null)
    })).then(results => {
      setMultiData(results.filter(Boolean) as (PortalData & { _cid: string })[])
    }).finally(() => setMultiLoading(false))
  }, [isMultiMode, customerIds, customers, period, filterMonth, filterYear])

  // Reset project filter when customer or data changes
  useEffect(() => { setProjectFilter(null) }, [customerId])

  const toggleProject = (id: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const d = data

  // ── Dashboards disponíveis baseados nos tipos de contrato do cliente ──
  const CONTRACT_TO_DASH = [
    { keys: ['banco de horas fixo', 'fixo'],   label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',   icon: BarChart2, color: '#00F5FF' },
    { keys: ['banco de horas mensal', 'mensal'],label: 'Banco de Horas Mensal',   href: '/dashboards/bank-hours-monthly', icon: CalendarClock, color: '#a78bfa' },
    { keys: ['on demand', 'demand'],            label: 'On Demand',               href: '/dashboards/on-demand',          icon: Zap, color: '#f59e0b' },
  ]

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const availableDashboards = useMemo(() => {
    if (!d?.contracts?.length) return []
    const clientTypes = d.contracts.map(c => normalize(c.contract_type))
    return CONTRACT_TO_DASH.filter(dash =>
      dash.keys.some(k => clientTypes.some(t => t.includes(k)))
    )
  }, [d?.contracts])

  const hasMultiContract = useMemo(() =>
    (d?.projects ?? []).some(p => p.children.length > 0),
    [d?.projects]
  )

  const projectOptions = useMemo(() => {
    const opts: { value: number; label: string }[] = []
    ;(d?.projects ?? []).filter(p => !p.is_sustentacao).forEach(p => {
      opts.push({ value: p.id, label: p.name })
      p.children.forEach(c => opts.push({ value: c.id, label: `↳ ${c.name}` }))
    })
    return opts
  }, [d?.projects])

  // Projeto selecionado para KPIs específicos
  const selectedProject = useMemo(() => {
    if (!projectFilter || !d) return null
    const allP = d.projects.filter(p => !p.is_sustentacao)
    // pai direto
    const parent = allP.find(p => p.id === projectFilter)
    if (parent) return parent
    // filho
    for (const p of allP) {
      const child = p.children.find(c => c.id === projectFilter)
      if (child) return child
    }
    return null
  }, [projectFilter, d])

  // Auto-expande o pai quando um projeto filho é selecionado no filtro
  useEffect(() => {
    if (!projectFilter || !d) return
    const all = (d.projects ?? []).filter(p => !p.is_sustentacao)
    const isParent = all.some(p => p.id === projectFilter)
    if (!isParent) {
      const parent = all.find(p => p.children.some(c => c.id === projectFilter))
      if (parent) setExpandedProjects(new Set([parent.id]))
    }
  }, [projectFilter, d])

  // ── Indicadores: carrega lazy quando aba abre ──────────────────────────────
  useEffect(() => {
    if (activeTab !== 'indicadores' || indLoadedRef.current) return
    indLoadedRef.current = true  // marca antes de qualquer setState para não re-disparar

    setIndLoading(true); setIndTeamLoading(true); setIndHoursLoading(true)

    const projPromise  = api.get<any>('/projects?pageSize=300&gestao=true&with_team=false')
    const tsPromise    = api.get<any>('/approvals/timesheets?per_page=1&status=pending')
    const expPromise   = api.get<any>('/approvals/expenses?per_page=1&status=pending')
    const hoursPromise = api.get<any>('/projects/hours-per-consultant')

    hoursPromise
      .then((res: any) => setIndHoursData(Array.isArray(res) ? res : []))
      .catch(() => {})
      .finally(() => setIndHoursLoading(false))

    Promise.allSettled([projPromise, tsPromise, expPromise]).then(([projRes, tsRes, expRes]) => {
      if (projRes.status === 'fulfilled') {
        const items = (projRes.value?.items ?? []).filter(
          (p: any) => !IND_EXCLUDED.includes(normalizeInd(p.contract_type_display ?? ''))
        )
        setIndProjects(items); indCacheSet('ind_projects', items)
      }
      if (tsRes.status === 'fulfilled') {
        const dv = tsRes.value
        setIndPendingTs(dv?.pagination?.total ?? dv?.meta?.total ?? dv?.total ?? 0)
      }
      if (expRes.status === 'fulfilled') {
        const dv = expRes.value
        setIndPendingExp(dv?.pagination?.total ?? dv?.meta?.total ?? dv?.total ?? 0)
      }
      setIndLoading(false)

      api.get<any>('/projects?pageSize=300&gestao=true')
        .then(res => {
          const items = (res?.items ?? []).filter(
            (p: any) => !IND_EXCLUDED.includes(normalizeInd(p.contract_type_display ?? ''))
          )
          setIndTeamProjects(items); indCacheSet('ind_team', items)
        })
        .catch(() => {})
        .finally(() => setIndTeamLoading(false))
    })
  }, [activeTab])

  // Eager load indProjects for exec filter when in multi-mode (no need to open Indicadores tab)
  useEffect(() => {
    if (isCliente || execLoadedRef.current || indLoadedRef.current) return
    if (!isMultiMode) return
    execLoadedRef.current = true
    api.get<any>('/projects?pageSize=300&gestao=true&with_team=false')
      .then(res => {
        const items = (res?.items ?? []).filter(
          (p: any) => !IND_EXCLUDED.includes(normalizeInd(p.contract_type_display ?? ''))
        )
        setIndProjects(items); indCacheSet('ind_projects', items)
      })
      .catch(() => {})
  }, [isCliente, isMultiMode])

  // ── Indicadores computed ──
  const indClienteOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of indProjects) if (p.customer?.id && p.customer?.name) map.set(String(p.customer.id), p.customer.name)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))
  }, [indProjects])

  const indProjetoOptions = useMemo(() =>
    indProjects
      .filter(p => !indCFilter || String(p.customer?.id) === indCFilter)
      .map(p => ({ value: String(p.id), label: `${p.code ? `[${p.code}] ` : ''}${p.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [indProjects, indCFilter]
  )

  const indExecOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of indProjects) {
      const ec = p.executivo_conta
      if (ec?.id && ec?.name) map.set(ec.id, ec.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), label: name }))
  }, [indProjects])

  const custToExecs = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const p of indProjects) {
      if (!p.customer?.id) continue
      const ec = p.executivo_conta
      if (!ec?.id) continue
      const cid = String(p.customer.id)
      if (!map.has(cid)) map.set(cid, new Set())
      map.get(cid)!.add(ec.id)
    }
    return map
  }, [indProjects])

  const filteredMultiData = useMemo(() => {
    let base = healthFilter === 'all' ? multiData : multiData.filter(md => md.overview?.status === healthFilter)
    if (execFilter.length > 0) base = base.filter(md => execFilter.some(eid => custToExecs.get(md._cid)?.has(Number(eid)) ?? false))
    return base
  }, [multiData, healthFilter, execFilter, custToExecs])

  const IND_STATUS_LABELS: Record<string, string> = {
    active: 'Ativo', awaiting_start: 'Aguardando início', started: 'Iniciado',
    paused: 'Pausado', cancelled: 'Cancelado', finished: 'Finalizado',
  }
  const indStatusOptions = Object.entries(IND_STATUS_LABELS).map(([value, label]) => ({ value, label }))

  const indFiltered = useMemo(() => indProjects.filter(p => {
    if (indCFilter && String(p.customer?.id) !== indCFilter) return false
    if (indPFilter && String(p.id) !== indPFilter) return false
    if (indStatusFilter && p.status !== indStatusFilter) return false
    if (indExecFilter.length > 0 && !indExecFilter.includes(String(p.executivo_conta?.id))) return false
    return true
  }), [indProjects, indCFilter, indPFilter, indStatusFilter, indExecFilter])

  const indKpis = useMemo(() => {
    const saldoTotal = indFiltered.reduce((acc, p) => acc + (p.general_hours_balance ?? 0), 0)
    const withHours = indFiltered.filter(p => (p.sold_hours ?? 0) > 0)
    const consumoMedio = withHours.length ? withHours.reduce((acc, p) => acc + (p.balance_percentage ?? 0), 0) / withHours.length : 0
    const emRisco = indFiltered.filter(p => (p.balance_percentage ?? 0) >= 90).length
    return { saldoTotal, consumoMedio, emRisco, totalProjetos: indFiltered.length }
  }, [indFiltered])

  const indAlerts = useMemo(() => {
    const list: any[] = []
    for (const p of indFiltered) {
      if ((p.general_hours_balance ?? 0) < 0)
        list.push({ type: 'red', icon: 'alert', title: p.name, msg: `Saldo negativo (${Math.round(p.general_hours_balance ?? 0)}h)`, href: null, projectId: p.id })
      else if ((p.balance_percentage ?? 0) >= 90)
        list.push({ type: 'red', icon: 'alert', title: p.name, msg: `${Math.round(p.balance_percentage ?? 0)}% consumido — risco crítico`, href: null, projectId: p.id })
    }
    for (const p of indFiltered) {
      const pct = p.balance_percentage ?? 0
      if (pct >= 70 && pct < 90 && (p.general_hours_balance ?? 0) >= 0)
        list.push({ type: 'yellow', icon: 'warning', title: p.name, msg: `${Math.round(pct)}% consumido — atenção`, href: null, projectId: p.id })
    }
    if (indPendingTs > 0) list.push({ type: 'yellow', icon: 'clock', title: 'Apontamentos pendentes', msg: `${indPendingTs} apontamento(s) aguardando aprovação`, href: '/approvals' })
    if (indPendingExp > 0) list.push({ type: 'yellow', icon: 'receipt', title: 'Despesas pendentes', msg: `${indPendingExp} despesa(s) aguardando aprovação`, href: '/approvals' })
    return list
  }, [indFiltered, indPendingTs, indPendingExp])

  const indSorted = useMemo(() =>
    [...indFiltered].sort((a, b) => (a.general_hours_balance ?? 0) - (b.general_hours_balance ?? 0)),
    [indFiltered]
  )

  const indConsultants = useMemo(() => {
    const map = new Map<number, { id: number; name: string; projects: number; role: string }>()
    const filtered = indTeamProjects.filter(p => {
      if (indCFilter && String(p.customer?.id) !== indCFilter) return false
      if (indPFilter && String(p.id) !== indPFilter) return false
      if (indStatusFilter && p.status !== indStatusFilter) return false
      if (indExecFilter.length > 0 && !indExecFilter.includes(String(p.executivo_conta?.id))) return false
      return true
    })
    for (const p of filtered) {
      for (const c of [...(p.consultants ?? []), ...(p.coordinators ?? [])]) {
        if (!map.has(c.id)) map.set(c.id, { id: c.id, name: c.name, projects: 0, role: p.coordinators?.some((co: any) => co.id === c.id) ? 'Coordenador' : 'Consultor' })
        map.get(c.id)!.projects++
      }
    }
    return Array.from(map.values()).sort((a, b) => b.projects - a.projects)
  }, [indTeamProjects, indCFilter, indPFilter, indStatusFilter, indExecFilter])

  // Sincroniza o filtro de cliente do topo com o indCFilter (quando 1 cliente selecionado)
  useEffect(() => {
    setIndCFilter(customerIds.length === 1 ? customerIds[0] : '')
  }, [customerIds])

  const indHasFilter = indPFilter !== '' || indStatusFilter !== '' || indExecFilter.length > 0

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--brand-primary)' }}>
                Portal do Cliente
              </p>
              {isMultiMode ? (
                <h1 className="text-3xl font-bold text-white leading-tight">
                  {customerIds.length === 0 ? 'Todos os Clientes' : `${customerIds.length} Clientes`}
                </h1>
              ) : d?.customer?.name ? (
                <h1 className="text-3xl font-bold text-white leading-tight">{d.customer.name}</h1>
              ) : (
                <div className="h-9 w-48 rounded-lg animate-pulse" style={{ background: 'var(--brand-surface)' }} />
              )}
              <p className="text-sm mt-1" style={{ color: 'var(--brand-muted)' }}>
                Visão Executiva · consumo, tendência e saúde do contrato
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isCliente && (
                <MultiCustomerSelect
                  selected={customerIds}
                  onChange={setCustomerIds}
                  options={customers}
                />
              )}

              {/* Filtro de projeto da aba Visão Executiva (single-mode) */}
              {(activeTab === 'portal' || isCliente) && !isMultiMode && projectOptions.length > 0 && (
                <div className="relative">
                  <select
                    value={projectFilter ?? ''}
                    onChange={e => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
                    className="appearance-none pl-3 pr-8 py-2.5 text-sm rounded-xl outline-none cursor-pointer font-medium"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)', color: projectFilter ? 'var(--brand-primary)' : 'var(--brand-text)' }}
                  >
                    <option value="" style={{ background: '#161618' }}>Todos os projetos</option>
                    {projectOptions.map(p => (
                      <option key={p.value} value={p.value} style={{ background: '#161618' }}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--brand-subtle)' }} />
                </div>
              )}

              {/* Filtro de projeto da aba Indicadores de Gestão */}
              {!isCliente && activeTab === 'indicadores' && (
                <ProjectSearchSelect
                  value={indPFilter}
                  onChange={v => { setIndPFilter(v) }}
                  options={indProjetoOptions}
                />
              )}

            </div>
          </div>

          {/* ── Tabs ── */}
          {!isCliente && (
            <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              {([
                { key: 'portal', label: 'Visão Executiva' },
                { key: 'indicadores', label: 'Indicadores de Gestão' },
              ] as const).map(tab => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={activeTab === tab.key
                    ? { background: '#00F5FF', color: '#0A0A0B' }
                    : { color: 'var(--brand-muted)', background: 'transparent' }
                  }>
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Portal tab content ── */}
          {(activeTab === 'portal' || isCliente) && <>

          {/* Health pills + view toggle — só em multi-mode dentro da aba portal */}
          {isMultiMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                {([
                  { key: 'all',      label: 'Todos',    color: '#00F5FF' },
                  { key: 'ok',       label: 'Saudável', color: '#22c55e' },
                  { key: 'warning',  label: 'Atenção',  color: '#f59e0b' },
                  { key: 'critical', label: 'Crítico',  color: '#ef4444' },
                ] as const).map(btn => {
                  const active = healthFilter === btn.key
                  return (
                    <button key={btn.key} type="button" onClick={() => setHealthFilter(btn.key)}
                      className="px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
                      style={active
                        ? { background: btn.color, color: btn.key === 'all' ? '#0A0A0B' : '#fff' }
                        : { color: btn.color, background: 'transparent' }
                      }>
                      {btn.label}
                    </button>
                  )
                })}
              </div>
              {indExecOptions.length > 0 && (
                <ExecMultiSelect
                  selected={execFilter}
                  onChange={setExecFilter}
                  options={indExecOptions}
                />
              )}
              <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                <button type="button" onClick={() => setViewMode('card')} className="p-2.5 transition-all"
                  style={viewMode === 'card' ? { background: 'var(--brand-primary)', color: '#0A0A0B' } : { background: 'rgba(255,255,255,0.04)', color: 'var(--brand-subtle)' }}>
                  <LayoutGrid size={15} />
                </button>
                <button type="button" onClick={() => setViewMode('linear')} className="p-2.5 transition-all"
                  style={viewMode === 'linear' ? { background: 'var(--brand-primary)', color: '#0A0A0B' } : { background: 'rgba(255,255,255,0.04)', color: 'var(--brand-subtle)' }}>
                  <List size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── Multi-customer grid ── */}
          {isMultiMode && (
            <div>
              {multiLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: 'var(--brand-surface)' }} />
                  ))}
                </div>
              ) : multiData.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 rounded-2xl border"
                  style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                  <Users size={40} style={{ color: 'var(--brand-subtle)' }} />
                  <p className="text-base font-semibold" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível</p>
                </div>
              ) : viewMode === 'card' ? (
                /* ── Card grid ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMultiData.map(md => {
                    const ov = md.overview
                    const pct = ov?.consumption_pct ?? 0
                    const statusColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
                    return (
                      <button key={md._cid} type="button"
                        onClick={() => setCustomerIds([md._cid])}
                        className="text-left rounded-2xl p-5 flex flex-col gap-3 transition-all hover:scale-[1.01]"
                        style={{ background: 'var(--brand-surface)', border: `1px solid var(--brand-border)` }}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-white leading-tight">{md.customer?.name}</p>
                          <span className="shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ background: statusColor }} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Consumido</p>
                            <p className="text-lg font-bold" style={{ color: '#00F5FF' }}>{(ov?.total_consumed ?? 0).toFixed(1)}h</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Saldo</p>
                            <p className="text-lg font-bold" style={{ color: (ov?.balance_hours ?? 0) < 0 ? '#ef4444' : '#22c55e' }}>
                              {(ov?.balance_hours ?? 0).toFixed(1)}h
                            </p>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--brand-subtle)' }}>
                            <span>Consumo</span><span>{pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: statusColor }} />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* ── Linear / table view ── */
                <div className="rounded-2xl overflow-clip" style={{ border: '1px solid var(--brand-border)' }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--brand-border)' }}>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Cliente</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Vendido</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consumido</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Saldo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider w-40" style={{ color: 'var(--brand-subtle)' }}>% Consumo</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Saúde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMultiData.map((md, i) => {
                        const ov = md.overview
                        const pct = ov?.consumption_pct ?? 0
                        const sc = HC[ov?.status as keyof typeof HC] ?? HC.ok
                        return (
                          <tr key={md._cid}
                            onClick={() => setCustomerIds([md._cid])}
                            className="cursor-pointer transition-colors"
                            style={{
                              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,245,255,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}
                          >
                            <td className="px-4 py-3 font-semibold text-white">{md.customer?.name}</td>
                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                              {fmt(ov?.total_sold ?? 0)}h
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: '#00F5FF' }}>
                              {fmt(ov?.total_consumed ?? 0)}h
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: (ov?.balance_hours ?? 0) < 0 ? '#ef4444' : '#22c55e' }}>
                              {(ov?.balance_hours ?? 0) < 0 ? '−' : ''}{fmt(Math.abs(ov?.balance_hours ?? 0))}h
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: sc.bar }} />
                                </div>
                                <span className="text-xs tabular-nums w-10 text-right" style={{ color: 'var(--brand-muted)' }}>{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                                {STATUS_LABEL[ov?.status ?? 'ok'] ?? '—'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isMultiMode && customerId && (
            <>
              {/* ── 1. KPIs ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />) : d ? (<>
                  {selectedProject ? (
                    /* ── KPIs por projeto ── */
                    <>
                      <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Saldo Restante</p>
                        <p className="text-3xl font-bold tabular-nums" style={{ color: selectedProject.balance_hours < 0 ? HC.critical.text : '#00F5FF' }}>
                          {selectedProject.balance_hours < 0 ? '−' : ''}{fmt(Math.abs(selectedProject.balance_hours))}h
                        </p>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>de {fmt(selectedProject.sold_hours)}h contratadas</p>
                      </div>
                      <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Consumo Total</p>
                        <p className="text-3xl font-bold tabular-nums" style={{ color: HC[selectedProject.health]?.text ?? HC.ok.text }}>
                          {fmt(selectedProject.consumption_pct)}%
                        </p>
                        <ProgressBar pct={selectedProject.consumption_pct} status={selectedProject.health} />
                        <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>
                          {fmt(selectedProject.consumed_hours)}h de {fmt(selectedProject.sold_hours)}h utilizadas
                        </p>
                      </div>
                      <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'rgba(0,245,255,0.18)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Horas Consumidas</p>
                        <p className="text-3xl font-bold tabular-nums" style={{ color: '#00F5FF' }}>
                          {fmt(selectedProject.consumed_hours)}h
                        </p>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>total apontado no projeto</p>
                      </div>
                      <div className="rounded-2xl p-5 border"
                        style={{ background: 'var(--brand-surface)', borderColor: HC[selectedProject.health]?.border ?? 'var(--brand-border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Saúde do Projeto</p>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: HC[selectedProject.health]?.bar ?? HC.ok.bar }} />
                          <p className="text-xl font-bold" style={{ color: HC[selectedProject.health]?.text ?? HC.ok.text }}>
                            {STATUS_LABEL[selectedProject.health] ?? '—'}
                          </p>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                          Saldo: <strong style={{ color: 'var(--brand-muted)' }}>{selectedProject.balance_hours < 0 ? '−' : ''}{fmt(Math.abs(selectedProject.balance_hours))}h</strong>
                        </p>
                      </div>
                    </>
                  ) : (
                    /* ── KPIs globais ── */
                    <>
                      <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Saldo Restante</p>
                        <p className="text-3xl font-bold tabular-nums" style={{ color: d.overview.balance_hours < 0 ? HC.critical.text : '#00F5FF' }}>
                          {d.overview.balance_hours < 0 ? '−' : ''}{fmt(Math.abs(d.overview.balance_hours))}h
                        </p>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>de {fmt(d.overview.total_sold)}h contratadas</p>
                      </div>
                      <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Consumo Total</p>
                        <p className="text-3xl font-bold tabular-nums" style={{ color: HC[d.overview.status]?.text ?? HC.ok.text }}>
                          {fmt(d.overview.consumption_pct)}%
                        </p>
                        <ProgressBar pct={d.overview.consumption_pct} status={d.overview.status} />
                        <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>
                          {fmt(d.overview.total_consumed)}h de {fmt(d.overview.total_sold)}h utilizadas
                        </p>
                      </div>
                      <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'rgba(0,245,255,0.18)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Uso no Mês</p>
                          {d.overview.trend_dir !== 'stable' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: d.overview.trend_dir === 'up' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                color: d.overview.trend_dir === 'up' ? '#fca5a5' : '#86efac',
                              }}>
                              {d.overview.trend_dir === 'up' ? '▲' : '▼'} {Math.abs(d.overview.trend_pct)}% vs mês ant.
                            </span>
                          )}
                        </div>
                        <p className="text-3xl font-bold tabular-nums" style={{ color: '#00F5FF' }}>
                          {fmt(d.overview.month_consumed)}h
                        </p>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>
                          {d.overview.month_consumed > d.overview.avg_monthly
                            ? `▲ acima da média (${fmt(d.overview.avg_monthly)}h/mês)`
                            : `▼ abaixo da média (${fmt(d.overview.avg_monthly)}h/mês)`}
                        </p>
                      </div>
                      <div className="rounded-2xl p-5 border"
                        style={{ background: 'var(--brand-surface)', borderColor: HC[d.overview.status]?.border ?? 'var(--brand-border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Saúde do Contrato</p>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: HC[d.overview.status]?.bar ?? HC.ok.bar }} />
                          <p className="text-xl font-bold" style={{ color: HC[d.overview.status]?.text ?? HC.ok.text }}>
                            {STATUS_LABEL[d.overview.status] ?? '—'}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                            Saldo: <strong style={{ color: 'var(--brand-muted)' }}>{d.overview.balance_hours < 0 ? '−' : ''}{fmt(Math.abs(d.overview.balance_hours))}h</strong>
                          </p>
                          <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                            Ritmo: <strong style={{ color: 'var(--brand-muted)' }}>{fmt(d.overview.avg_weekly ?? 0)}h/semana</strong>
                          </p>
                          <p className="text-xs font-semibold" style={{ color: HC[d.overview.status]?.text ?? HC.ok.text }}>
                            {d.overview.weeks_remaining !== null
                              ? `→ ~${d.overview.weeks_remaining} semanas restantes`
                              : '→ saldo esgotado'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </>) : null}
              </div>

              {/* ── 1b. Gráfico de consumo mensal ── */}
              {!loading && d && d.monthly_chart?.length > 0 && (() => {
                const avg = d.overview.avg_monthly
                const lastEntry = d.monthly_chart[d.monthly_chart.length - 1]
                const prevEntry = d.monthly_chart[d.monthly_chart.length - 2]
                const varPct = prevEntry?.consumed_hours > 0
                  ? Math.round(((lastEntry.consumed_hours - prevEntry.consumed_hours) / prevEntry.consumed_hours) * 100)
                  : null
                return (
                  <div className="rounded-2xl border p-5" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Evolução de Consumo</h2>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        <span className="flex items-center gap-1">
                          <span className="w-6 border-t border-dashed" style={{ borderColor: 'rgba(0,245,255,0.4)' }} />
                          média {fmt(avg)}h
                        </span>
                        {varPct !== null && (
                          <span className="font-semibold"
                            style={{ color: varPct > 0 ? '#fca5a5' : '#86efac' }}>
                            {varPct > 0 ? '▲' : '▼'} {Math.abs(varPct)}% vs mês ant.
                          </span>
                        )}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={d.monthly_chart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#00F5FF" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#00F5FF" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12, color: '#E5E7EB' }}
                          formatter={(v: any) => [`${fmt(v)}h`, 'Consumo']}
                        />
                        <ReferenceLine y={avg} stroke="rgba(0,245,255,0.35)" strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="consumed_hours" stroke="#00F5FF" strokeWidth={2} fill="url(#chartGrad)"
                          dot={(props: any) => {
                            const isLast = props.index === d.monthly_chart.length - 1
                            return <circle cx={props.cx} cy={props.cy} r={isLast ? 5 : 3}
                              fill={isLast ? '#00F5FF' : '#00F5FF'} stroke={isLast ? '#0A0A0B' : 'none'} strokeWidth={isLast ? 2 : 0} />
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* ── 2. Alertas ── */}
              {!loading && d && d.alerts.length > 0 && (
                <div className="rounded-2xl border p-5" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                  <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--brand-text)' }}>Alertas</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {d.alerts.map((a, i) => {
                      const c = a.type === 'critical' ? HC.critical : HC.warning
                      return (
                        <div key={i}
                          className="flex items-start gap-3 rounded-xl p-3 pl-4"
                          style={{ borderLeft: `4px solid ${c.border}`, background: c.bg }}>
                          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: c.text }} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{a.title}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-muted)' }}>{a.message}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── 4. Projetos ── */}
              <div className="rounded-2xl border overflow-clip" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Projetos</h2>
                </div>
                {loading ? (
                  <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : d && (() => {
                    const allP = d.projects.filter(p => !p.is_sustentacao)
                    if (!projectFilter) return allP.length > 0
                    const isPar = allP.some(p => p.id === projectFilter)
                    return isPar ? allP.some(p => p.id === projectFilter) : allP.some(p => p.children.some(c => c.id === projectFilter))
                  })() ? (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
                      <tr className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
                        {['Projeto', 'Saldo', 'Consumo', 'Status'].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const allProjects = d.projects.filter(p => !p.is_sustentacao)
                        const filteredProjects = !projectFilter
                          ? allProjects
                          : allProjects.some(p => p.id === projectFilter)
                            ? allProjects.filter(p => p.id === projectFilter)
                            : allProjects.filter(p => p.children.some(c => c.id === projectFilter))
                        const mostCriticalId = filteredProjects
                          .filter(p => p.health === 'critical')
                          .sort((a, b) => b.consumption_pct - a.consumption_pct)[0]?.id
                        return filteredProjects.map(p => {
                        const c = HC[p.health]
                        const expanded = expandedProjects.has(p.id)
                        const hasChildren = p.children.length > 0
                        const isMostCritical = p.id === mostCriticalId
                        return (
                          <>
                            <tr
                              key={p.id}
                              className="border-b transition-colors"
                              style={{ borderColor: 'var(--brand-border)', cursor: hasChildren ? 'pointer' : 'default',
                                background: isMostCritical ? 'rgba(239,68,68,0.04)' : undefined }}
                              onClick={() => hasChildren && toggleProject(p.id)}
                            >
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  {hasChildren
                                    ? expanded
                                      ? <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--brand-primary)' }} />
                                      : <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--brand-subtle)' }} />
                                    : <span className="w-[14px] shrink-0" />
                                  }
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium" style={{ color: 'var(--brand-text)' }}>{p.name}</span>
                                    {p.code && <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{p.code}</span>}
                                    {hasChildren && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: 'rgba(0,245,255,0.10)', color: 'var(--brand-primary)' }}>PAI</span>
                                    )}
                                    {isMostCritical && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>🔥 1º risco</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3 tabular-nums font-semibold whitespace-nowrap"
                                style={{ color: p.balance_hours < 0 ? HC.critical.text : 'var(--brand-text)' }}>
                                {p.balance_hours < 0 ? '−' : ''}{fmt(Math.abs(p.balance_hours))}h
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(p.consumption_pct, 100)}%`, background: c.bar }} />
                                  </div>
                                  <span className="text-xs tabular-nums font-semibold" style={{ color: c.text }}>
                                    {fmt(p.consumption_pct)}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <span className="px-2 py-0.5 rounded-md text-xs font-bold"
                                  style={{ background: c.bg, color: c.text }}>
                                  {p.health === 'ok' ? 'OK' : p.health === 'warning' ? 'Atenção' : 'Crítico'}
                                </span>
                              </td>
                            </tr>
                            {expanded && p.children.map(child => {
                              const cc = HC[child.health]
                              return (
                                <tr key={child.id} className="border-b"
                                  style={{ borderColor: 'var(--brand-border)', background: 'rgba(255,255,255,0.015)' }}>
                                  <td className="py-2.5" style={{ paddingLeft: 32 }}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium" style={{ color: 'var(--brand-muted)' }}>{child.name}</span>
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>FILHO</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5 tabular-nums text-sm font-medium whitespace-nowrap"
                                    style={{ color: child.balance_hours < 0 ? HC.critical.text : 'var(--brand-muted)' }}>
                                    {child.balance_hours < 0 ? '−' : ''}{fmt(Math.abs(child.balance_hours))}h
                                  </td>
                                  <td className="px-5 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                        <div className="h-full rounded-full" style={{ width: `${Math.min(child.consumption_pct, 100)}%`, background: cc.bar }} />
                                      </div>
                                      <span className="text-xs tabular-nums font-semibold" style={{ color: cc.text }}>
                                        {fmt(child.consumption_pct)}%
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="px-2 py-0.5 rounded-md text-xs font-bold"
                                      style={{ background: cc.bg, color: cc.text }}>
                                      {child.health === 'ok' ? 'OK' : child.health === 'warning' ? 'Atenção' : 'Crítico'}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </>
                        )
                      })
                      })()}
                    </tbody>
                  </table>
                ) : !loading ? (
                  <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--brand-subtle)' }}>
                    Nenhum projeto encontrado
                  </div>
                ) : null}
              </div>

              {/* ── 5. Sustentação ── */}
              {!loading && d && (d.support.total_tickets > 0 || d.support.consumed_hours > 0) && (
                <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Sustentação</h2>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                      {[
                        { label: 'Chamados abertos',   value: d.support.open_tickets,     unit: '' },
                        { label: 'Resolvidos no mês',  value: d.support.resolved_tickets, unit: '' },
                        { label: 'Horas consumidas',   value: d.support.consumed_hours,   unit: 'h' },
                        { label: 'Tempo médio/chamado',value: d.support.avg_hours_ticket,  unit: 'h' },
                      ].map((kpi, i) => (
                        <div key={i} className="rounded-xl p-4 border"
                          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--brand-border)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>
                            {kpi.label}
                          </p>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                            {fmt(kpi.value)}{kpi.unit}
                          </p>
                        </div>
                      ))}
                    </div>

                    {d.support.monthly_tickets.length > 0 && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>
                          Chamados por Mês
                        </p>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={d.support.monthly_tickets} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                              <XAxis dataKey="month" tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                              <Tooltip
                                contentStyle={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#E4E4E7' }}
                                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                formatter={(v: any) => [v, 'Chamados']}
                              />
                              <Bar dataKey="count" fill="#00F5FF" radius={[4, 4, 0, 0]} opacity={0.85} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

            </>
          )}

          </> /* end portal tab */}

          {/* ── Indicadores tab content ── */}
          {activeTab === 'indicadores' && !isCliente && (
            <div className="space-y-6">

              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-2">

                {/* Status */}
                <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                  {([
                    { key: '',               label: 'Todos' },
                    { key: 'active',         label: 'Ativo' },
                    { key: 'awaiting_start', label: 'Aguardando' },
                    { key: 'paused',         label: 'Pausado' },
                    { key: 'finished',       label: 'Finalizado' },
                  ] as const).map(btn => {
                    const active = indStatusFilter === btn.key
                    return (
                      <button key={btn.key} type="button" onClick={() => setIndStatusFilter(btn.key)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={active
                          ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                          : { color: 'var(--brand-muted)', background: 'transparent' }
                        }>
                        {btn.label}
                      </button>
                    )
                  })}
                </div>

                <ExecMultiSelect selected={indExecFilter} onChange={setIndExecFilter} options={indExecOptions} />
                {indHasFilter && (
                  <button onClick={() => { setIndPFilter(''); setIndStatusFilter(''); setIndExecFilter([]) }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors hover:bg-white/[0.06]"
                    style={{ color: 'var(--brand-muted)' }}>
                    <X size={13} /> Limpar
                  </button>
                )}
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {indLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />) : (<>
                  <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Saldo Total</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: indKpis.saldoTotal < 0 ? '#ef4444' : '#00F5FF' }}>
                      {indKpis.saldoTotal < 0 ? '−' : ''}{fmt(Math.abs(indKpis.saldoTotal))}h
                    </p>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>{indFiltered.length} projeto(s) filtrado(s)</p>
                  </div>
                  <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Consumo Médio</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: HSI[healthColorInd(indKpis.consumoMedio)].text }}>{fmt(indKpis.consumoMedio)}%</p>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>Média das horas consumidas</p>
                  </div>
                  <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Projetos em Risco</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: indKpis.emRisco > 0 ? '#ef4444' : '#22c55e' }}>{indKpis.emRisco}</p>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>{indKpis.emRisco > 0 ? '≥ 90% consumido' : 'Nenhum em risco crítico'}</p>
                  </div>
                  <div className="rounded-2xl p-5 border" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Total de Projetos</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: '#00F5FF' }}>{indKpis.totalProjetos}</p>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--brand-subtle)' }}>Projetos ativos</p>
                  </div>
                </>)}
              </div>

              {/* Alertas */}
              <div className="rounded-2xl border p-5" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--brand-text)' }}>Alertas Operacionais</h2>
                {indLoading ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                ) : indAlerts.length === 0 ? (
                  <div className="flex items-center gap-2.5 py-4" style={{ color: '#22c55e' }}>
                    <CheckCircle size={18} /><span className="text-sm font-medium">Nenhum alerta no momento</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {indAlerts.map((a: any, i: number) => {
                      const borderColor = a.type === 'red' ? '#ef4444' : '#f59e0b'
                      const bgIdle = a.type === 'red' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)'
                      const bgHover = a.type === 'red' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'
                      const iconColor = a.type === 'red' ? '#fca5a5' : '#fcd34d'
                      return (
                        <button key={i} type="button"
                          onClick={() => { if (a.href) router.push(a.href); else if (a.projectId) setIndPFilter(String(a.projectId)) }}
                          className="flex items-start gap-3 rounded-xl p-3 pl-4 w-full text-left transition-all"
                          style={{ borderLeft: `4px solid ${borderColor}`, background: bgIdle }}
                          onMouseEnter={e => (e.currentTarget.style.background = bgHover)}
                          onMouseLeave={e => (e.currentTarget.style.background = bgIdle)}>
                          <span className="mt-0.5 shrink-0" style={{ color: iconColor }}>
                            {a.icon === 'clock' ? <Clock size={16} /> : <AlertTriangle size={16} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--brand-text)' }}>{a.title}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-muted)' }}>{a.msg}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Projetos */}
              <div className="rounded-2xl border overflow-x-auto overflow-y-clip" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Projetos</h2>
                    {!indLoading && indSorted.length > 0 && (
                      <span className="text-xs tabular-nums" style={{ color: 'var(--brand-subtle)' }}>{indSorted.length} projeto(s)</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Ordenados por menor saldo</p>
                </div>
                {indLoading ? (
                  <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : indSorted.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12">
                    <FolderOpen size={28} style={{ color: 'var(--brand-subtle)' }} />
                    <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum projeto encontrado</p>
                  </div>
                ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
                        <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                          {['Projeto', 'Cliente', 'Tipo', 'Saldo', '% Uso', 'Status'].map(col => (
                            <th key={col} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {indSorted.map((p: any, i: number) => {
                          const pct = p.balance_percentage ?? 0
                          const bal = p.general_hours_balance ?? 0
                          const isCritical = pct >= 90 || bal < 0
                          const isWarning = pct >= 70 && !isCritical
                          const hc = healthColorInd(pct)
                          return (
                            <tr key={p.id ?? i} style={{
                              borderBottom: i < indSorted.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                              borderLeft: isCritical ? '3px solid #ef4444' : isWarning ? '3px solid #f59e0b' : '3px solid transparent',
                              background: isCritical ? 'rgba(239,68,68,0.03)' : isWarning ? 'rgba(245,158,11,0.03)' : 'transparent',
                            }}>
                              <td className="px-4 py-3 font-medium max-w-[180px] truncate" style={{ color: 'var(--brand-text)' }}>
                                {p.name ?? '—'}{p.code && <span className="ml-1.5 text-xs" style={{ color: 'var(--brand-subtle)' }}>{p.code}</span>}
                              </td>
                              <td className="px-4 py-3 max-w-[140px] truncate" style={{ color: 'var(--brand-muted)' }}>{p.customer?.name ?? '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{p.contract_type_display ?? '—'}</td>
                              <td className="px-4 py-3 tabular-nums whitespace-nowrap font-medium">
                                <span style={{ color: bal < 0 ? '#ef4444' : bal >= 20 ? '#86efac' : 'var(--brand-muted)' }}>
                                  {bal < 0 ? '−' : ''}{fmt(Math.abs(bal))}h
                                </span>
                              </td>
                              <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: HSI[hc].badge, color: HSI[hc].text }}>{fmt(pct)}%</span>
                              </td>
                              <td className="px-4 py-3">
                                {p.status_display ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--brand-muted)' }}>{p.status_display}</span> : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                )}
              </div>

              {/* Performance da Equipe */}
              <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="flex items-center gap-2">
                    <Users size={16} style={{ color: 'var(--brand-muted)' }} />
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Performance da Equipe</h2>
                  </div>
                </div>
                {indTeamLoading ? (
                  <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : indConsultants.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <Users size={28} style={{ color: 'var(--brand-subtle)' }} />
                    <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum consultor encontrado</p>
                  </div>
                ) : (
                  <div className="p-5">
                    <ResponsiveContainer width="100%" height={Math.max(indConsultants.length * 36, 120)}>
                      <BarChart
                        layout="vertical"
                        data={indConsultants}
                        margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                        barCategoryGap="30%"
                      >
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={160}
                          tick={({ x, y, payload }: any) => (
                            <text x={x - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="#A1A1AA">
                              {payload.value.length > 20 ? payload.value.slice(0, 19) + '…' : payload.value}
                            </text>
                          )}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div className="rounded-xl px-3 py-2 text-sm shadow-lg" style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)' }}>
                                <p className="font-semibold mb-0.5" style={{ color: '#E4E4E7' }}>{d.name}</p>
                                <p style={{ color: '#71717A' }}>{d.role}</p>
                                <p className="font-bold mt-1" style={{ color: d.role === 'Coordenador' ? '#00F5FF' : '#a78bfa' }}>
                                  {d.projects} projeto(s)
                                </p>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="projects" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {indConsultants.map((c: any) => (
                            <Cell
                              key={c.id}
                              fill={c.role === 'Coordenador' ? '#00F5FF' : '#a78bfa'}
                              fillOpacity={0.85}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-3 justify-end">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#00F5FF' }} /> Coordenador
                      </span>
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#a78bfa' }} /> Consultor
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Consumo de Horas por Consultor */}
              <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Consumo de Horas por Consultor</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Horas apontadas (aprovadas + pendentes)</p>
                </div>
                {indHoursLoading ? (
                  <div className="p-5 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : indHoursData.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <TrendingUp size={28} style={{ color: 'var(--brand-subtle)' }} />
                    <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum dado disponível</p>
                  </div>
                ) : (
                  <div className="p-5">
                    <ResponsiveContainer width="100%" height={Math.max(indHoursData.length * 36, 120)}>
                      <BarChart
                        layout="vertical"
                        data={indHoursData}
                        margin={{ top: 0, right: 64, left: 0, bottom: 0 }}
                        barCategoryGap="30%"
                      >
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} unit="h" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={160}
                          tick={({ x, y, payload }: any) => (
                            <text x={x - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="#A1A1AA">
                              {payload.value.length > 20 ? payload.value.slice(0, 19) + '…' : payload.value}
                            </text>
                          )}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div className="rounded-xl px-3 py-2 text-sm shadow-lg" style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)' }}>
                                <p className="font-semibold mb-1" style={{ color: '#E4E4E7' }}>{d.name}</p>
                                <p className="font-bold tabular-nums" style={{ color: '#00F5FF' }}>{fmt(d.total_hours)}h apontadas</p>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="total_hours" radius={[0, 4, 4, 0]} maxBarSize={20} fill="#00F5FF" fillOpacity={0.8}>
                          {indHoursData.map((_: any, i: number) => (
                            <Cell key={i} fill="#00F5FF" fillOpacity={0.7 + (i === 0 ? 0.3 : 0)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </AppLayout>
  )
}
