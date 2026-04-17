'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { formatBRL, formatNumber } from '@/lib/format'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Clock, DollarSign, Users, TrendingUp, Filter, RefreshCw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Partner {
  id: number
  name: string
  pricing_type: string
  hourly_rate: string | null
}

interface KPIs {
  total_hours: number
  total_amount: number
  consultants_count: number
  active_consultants: number
  avg_ticket: number
}

interface ConsultantRow {
  id: number
  name: string
  total_minutes: number
  total_hours: number
  hourly_rate: number
  total_amount: number
  is_admin: boolean
}

interface ReportData {
  partner: Partner
  kpis: KPIs
  consultants: ConsultantRow[]
}

interface ProjectOption { id: number; name: string; code: string }
interface ContractTypeOption { id: number; name: string; code: string }

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = '#00F5FF',
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-tight">{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartnerDashboardPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [projectId, setProjectId] = useState('')
  const [contractTypeId, setContractTypeId] = useState('')

  const [projects, setProjects]             = useState<ProjectOption[]>([])
  const [contractTypes, setContractTypes]   = useState<ContractTypeOption[]>([])

  useEffect(() => {
    api.get<{ items: ProjectOption[] }>('/projects?pageSize=200')
      .then(r => setProjects(r.items ?? []))
      .catch(() => {})
    api.get<ContractTypeOption[]>('/contract-types')
      .then(r => setContractTypes(Array.isArray(r) ? r : []))
      .catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (startDate)      qs.set('start_date',       startDate)
    if (endDate)        qs.set('end_date',          endDate)
    if (projectId)      qs.set('project_id',        projectId)
    if (contractTypeId) qs.set('contract_type_id',  contractTypeId)

    api.get<ReportData>(`/partner/report?${qs}`)
      .then(r => setData(r))
      .catch(() => toast.error('Erro ao carregar dados do parceiro'))
      .finally(() => setLoading(false))
  }, [startDate, endDate, projectId, contractTypeId])

  useEffect(() => { load() }, [load])

  const totalMinutes = data?.kpis.total_hours ? data.kpis.total_hours * 60 : 0
  const pricingLabel = data?.partner.pricing_type === 'fixed'
    ? `Valor único — ${formatBRL(Number(data.partner.hourly_rate ?? 0))}/h`
    : 'Valores por consultor'

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Painel do Parceiro</h1>
            {data && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
                {data.partner.name} · {pricingLabel}
              </p>
            )}
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>

        {/* ── Filters ── */}
        <div
          className="rounded-xl p-4 flex flex-wrap gap-3 items-end"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          <Filter size={14} style={{ color: 'var(--brand-subtle)' }} className="mt-6 shrink-0" />

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--brand-subtle)' }}>De</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-sm bg-transparent border outline-none text-white"
              style={{ borderColor: 'var(--brand-border)' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--brand-subtle)' }}>Até</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-sm bg-transparent border outline-none text-white"
              style={{ borderColor: 'var(--brand-border)' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--brand-subtle)' }}>Projeto</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-sm bg-[#0A0A0B] border outline-none text-white"
              style={{ borderColor: 'var(--brand-border)' }}
            >
              <option value="">Todos</option>
              {projects.map(p => (
                <option key={p.id} value={String(p.id)}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--brand-subtle)' }}>Tipo de Contrato</label>
            <select
              value={contractTypeId}
              onChange={e => setContractTypeId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-sm bg-[#0A0A0B] border outline-none text-white"
              style={{ borderColor: 'var(--brand-border)' }}
            >
              <option value="">Todos</option>
              {contractTypes.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>

          {(startDate || endDate || projectId || contractTypeId) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setProjectId(''); setContractTypeId('') }}
              className="text-xs px-2.5 py-1.5 rounded-lg mt-5 transition-colors hover:bg-white/[0.06]"
              style={{ color: 'var(--brand-subtle)' }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* ── KPIs ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={Clock}
              label="Total de Horas"
              value={formatNumber(data.kpis.total_hours)}
              sub={`${data.kpis.active_consultants} consultor${data.kpis.active_consultants !== 1 ? 'es' : ''} ativo${data.kpis.active_consultants !== 1 ? 's' : ''}`}
            />
            <KpiCard
              icon={DollarSign}
              label="Total a Receber"
              value={formatBRL(data.kpis.total_amount)}
              color="#22c55e"
            />
            <KpiCard
              icon={Users}
              label="Consultores"
              value={String(data.kpis.consultants_count)}
              sub={`${data.kpis.active_consultants} com horas no período`}
              color="#8B5CF6"
            />
            <KpiCard
              icon={TrendingUp}
              label="Ticket Médio"
              value={formatBRL(data.kpis.avg_ticket)}
              sub="por hora"
              color="#f59e0b"
            />
          </div>
        ) : null}

        {/* ── Table ── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--brand-border)' }}
        >
          <div
            className="px-5 py-3.5 border-b flex items-center justify-between"
            style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
          >
            <h2 className="text-sm font-semibold text-white">Consultores</h2>
            {data && (
              <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                {data.consultants.length} consultor{data.consultants.length !== 1 ? 'es' : ''}
              </span>
            )}
          </div>

          <div style={{ background: 'var(--brand-surface)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                  {['Consultor', 'Horas', 'Valor/h', 'Total'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--brand-subtle)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-24 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data?.consultants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                      Nenhum apontamento aprovado no período
                    </td>
                  </tr>
                ) : (
                  data?.consultants.map((c, idx) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid var(--brand-border)',
                        background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}
                          >
                            {c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          {c.name}
                          {c.is_admin && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold ml-1"
                              style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
                            >
                              Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white tabular-nums">
                        {formatNumber(c.total_hours)}h
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--brand-subtle)' }}>
                        {formatBRL(c.hourly_rate)}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#00F5FF' }}>
                        {formatBRL(c.total_amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* ── Footer totals ── */}
              {!loading && data && data.consultants.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--brand-border)', background: 'rgba(0,245,255,0.04)' }}>
                    <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
                      Total
                    </td>
                    <td className="px-4 py-3 font-bold text-white tabular-nums">
                      {formatNumber(data.kpis.total_hours)}h
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                      Ticket médio: {formatBRL(data.kpis.avg_ticket)}/h
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums" style={{ color: '#00F5FF' }}>
                      {formatBRL(data.kpis.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>
    </AppLayout>
  )
}
