'use client'

import { useState, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { uploadDirect } from '@/lib/upload'
import { previewText } from '@/lib/sanitize'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ExternalLink, AlertTriangle, DollarSign, TrendingUp, BarChart2, UserCheck, X, Check, Trash2, Download, FileText } from 'lucide-react'
import { MonthlyAccrualTable } from '@/components/projects/monthly-accrual-table'
import { CustomerContactsSection } from '@/components/ui/customer-contacts-section'
import { Skeleton } from '@/components/ui/loading'

// ─── Types (duplicados da página do kanban — manter idênticos) ──────────────────

interface ProjectFull {
  id: number; name: string; code: string; status: string; status_display?: string
  customer?: { id: number; name: string }
  description?: string | null; start_date?: string | null; expected_end_date?: string | null
  project_value?: number | null; hourly_rate?: number | null
  additional_hourly_rate?: number | null; initial_cost?: number | null
  initial_hours_balance?: number | null; sold_hours?: number | null
  hour_contribution?: number; exceeded_hour_contribution?: number | null
  consultant_hours?: number | null; coordinator_hours?: number | null
  coordinator_percentage?: number | null
  save_erpserv?: number | null; total_available_hours?: number | null
  total_project_value?: number | null; weighted_hourly_rate?: number | null
  general_hours_balance?: number | null; consumed_hours?: number | null
  balance_percentage?: number | null; total_contributions_hours?: number | null
  contract_type_display?: string; contract_type?: { id: number; name: string } | null
  service_type?: { id: number; name: string } | null
  parent_project?: { id: number; name: string; code: string } | null
  // Subprojeto faturado que gerou um aporte automático no pai (legenda verde).
  generated_aporte?: { id: number; parent_id: number; kanban_status: string } | null
  coordinators?: { id: number; name: string; email: string }[]
  consultants?: { id: number; name: string; email: string }[]
  approvers?: { id: number; name: string; email: string }[]
  // Coordenador efetivo (override do Kanban de Contratos) — tem precedência sobre coordinators M2M.
  kanban_override_coordinator?: { id: number; name: string } | null
}

interface ConsultantBreakdown {
  consultant_name: string; total_hours: number; approved_hours: number
  pending_hours: number; cost: number; consultant_hourly_rate: number
  consultant_rate_type?: string
}

interface CostSummary {
  project_info: {
    project_value?: number | null; initial_cost?: number | null
    initial_hours_balance?: number | null; tipo_faturamento?: string | null
    total_available_hours?: number; weighted_hourly_rate?: number
  }
  hours_summary: {
    total_logged_hours: number; approved_hours: number; pending_hours: number
    remaining_hours: number; general_balance?: number
    total_available_hours?: number; hours_percentage: number
  }
  cost_calculation: {
    total_cost: number; approved_cost: number; pending_cost: number
    is_on_demand: boolean; project_revenue: number
    aportes_total: number; receita_total: number
    custo_operacional: number; custo_total: number
    margin: number; margin_percentage: number
    coordinator_percentage: number; valor_coordenador: number
  }
  consultant_breakdown: ConsultantBreakdown[]
}

interface TimesheetEntry {
  id: number; date: string; effort_hours: string; effort_minutes: number
  observation?: string; status: string; status_display: string
  user?: { id: number; name: string }
}

interface ProjectEditForm {
  name: string; description: string; status: string
  start_date: string; expected_end_date: string
  sold_hours: string; project_value: string
  hourly_rate: string; additional_hourly_rate: string
  initial_hours_balance: string; initial_cost: string
  consultant_hours: string; coordinator_hours: string; coordination_hours: string
  parent_project_id: string
  service_type_id: string; contract_type_id: string
  tipo_faturamento: string; tipo_alocacao: string
  condicao_pagamento: string; vendedor_id: string
  cobra_despesa_cliente: boolean
  observacoes_contrato: string
  max_expense_per_consultant: string
  timesheet_retroactive_limit_days: string
  allow_manual_timesheets: boolean; allow_negative_balance: boolean
  client_follows_timesheets: boolean
  movidesk_integration_enabled: boolean
  coordinator_ids: number[]; consultant_ids: number[]; consultant_group_ids: number[]
}

// ─── Helpers (duplicados da página do kanban — manter idênticos) ─────────────────

function endDateStyle(dateStr: string): { color: string; bg: string; label: string } {
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0)   return { color: '#ef4444', bg: '#ef444420', label: `Venceu há ${Math.abs(diff)}d` }
  if (diff <= 7)  return { color: '#f97316', bg: '#f9731620', label: `Vence em ${diff}d` }
  if (diff <= 30) return { color: '#eab308', bg: '#eab30820', label: `${diff}d` }
  return { color: '#22c55e', bg: '#22c55e20', label: `${diff}d` }
}

// ─── Project Modals ───────────────────────────────────────────────────────────

export function ProjectViewModal({ projectId, onClose, userRole, initialTab }: {
  projectId: number; onClose: () => void; userRole?: string; initialTab?: string
}) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'financial' | 'consultants' | 'timesheets' | 'cost' | 'aportes' | 'extrato'>((initialTab as any) ?? 'overview')
  const [breakdown, setBreakdown] = useState<ConsultantBreakdown[]>([])
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
  const [tsLoading, setTsLoading] = useState(false)
  const [tsLoaded, setTsLoaded] = useState(false)
  // Aba Aportes (somente leitura aqui — admin gerencia em gestão de projetos)
  const [aportesList, setAportesList]   = useState<any[]>([])
  const [aportesLoading, setAportesLoading] = useState(false)
  const [aportesLoaded, setAportesLoaded]   = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [viewAttachments, setViewAttachments] = useState<any[]>([])
  const downloadViewAtt = async (att: any) => {
    const res = await fetch(`/api/v1/projects/${projectId}/attachments/${att.id}`, { credentials: 'same-origin' })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob(); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = att.original_name; a.click(); URL.revokeObjectURL(url)
  }

  const reload = () => {
    setLoading(true)
    api.get<any[]>(`/projects/${projectId}/attachments`).then(r => setViewAttachments(Array.isArray(r) ? r : [])).catch(() => {})
    Promise.all([
      api.get<ProjectFull>(`/projects/${projectId}`),
      api.get<CostSummary>(`/projects/${projectId}/cost-summary`).catch(() => null),
    ]).then(([proj, cs]) => {
      setP(proj)
      setCostSummary(cs)
      setBreakdown(Array.isArray(cs?.consultant_breakdown) ? cs!.consultant_breakdown! : [])
    }).catch(() => toast.error('Erro ao carregar projeto'))
    .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [projectId])

  useEffect(() => {
    if (tab === 'timesheets' && !tsLoaded) {
      setTsLoading(true)
      api.get<any>(`/timesheets?project_id=${projectId}&per_page=30&sort=date&direction=desc`)
        .then(r => {
          const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
          setTimesheets(list); setTsLoaded(true)
        })
        .catch(() => {})
        .finally(() => setTsLoading(false))
    }
    if (tab === 'aportes' && !aportesLoaded) {
      setAportesLoading(true)
      api.get<any>(`/projects/${projectId}/hour-contributions`)
        .then(r => {
          const list = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
          setAportesList(list); setAportesLoaded(true)
        })
        .catch(() => {})
        .finally(() => setAportesLoading(false))
    }
  }, [tab, projectId, tsLoaded, aportesLoaded])

  const fmt = (n: number | null | undefined, dec = 0) =>
    n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  const fmtDate = (d?: string | null) => d ? d.slice(0, 10).split('-').reverse().join('/') : '—'
  const fmtBRL  = (v?: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

  const healthColor = (pct: number) => pct >= 90 ? 'var(--danger-border)' : pct >= 70 ? 'var(--warning-border)' : 'var(--success-border)'
  const riskEmoji   = (pct: number) => pct >= 90 ? '🔴' : pct >= 70 ? '🟡' : '🟢'
  const riskLabel   = (pct: number) => pct >= 90 ? 'Crítico' : pct >= 70 ? 'Atenção' : 'Saudável'

  const statusColors: Record<string, { background: string; color: string }> = {
    awaiting_start: { background: 'var(--info-bg)',    color: 'var(--info)' },
    started:        { background: 'var(--info-bg)',    color: 'var(--info)' },
    paused:         { background: 'var(--warning-bg)', color: 'var(--warning)' },
    cancelled:      { background: 'var(--danger-bg)',  color: 'var(--danger)' },
    finished:       { background: 'var(--surface-hover)', color: 'var(--text-muted)' },
  }
  const statusLabel: Record<string, string> = {
    awaiting_start: 'Aguardando Início', started: 'Em Andamento',
    paused: 'Pausado', cancelled: 'Cancelado', finished: 'Encerrado',
  }
  const tsStatusColor: Record<string, string> = {
    pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444', conflicted: '#a78bfa',
  }

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-xs shrink-0 w-44" style={{ color: 'var(--text-light)' }}>{label}</span>
      <span className="text-xs font-semibold text-right ml-2" style={{ color: 'var(--text)' }}>{value ?? '—'}</span>
    </div>
  )

  const { user: viewerUser } = useAuth()
  const consumed = p?.consumed_hours ?? 0
  const totalAvail = p?.total_available_hours ?? ((p?.sold_hours ?? 0) + (p?.hour_contribution ?? 0))
  // Lente do coordenador: se o usuário logado é coordenador do projeto e há banco de
  // coordenação, troca KPIs/risco pro banco; admin/demais continuam vendo o operacional.
  const isClienteViewer = viewerUser?.type === 'cliente'
  // Banco apontável = Horas Apontáveis informadas + APORTE (aporte soma com as contratadas).
  const coordRaw = Number((p as any)?.coordination_hours ?? 0)
  const aporteHoras = Math.max(0, totalAvail - Number(p?.sold_hours ?? 0))
  const coordHoursBank = coordRaw > 0 ? coordRaw + aporteHoras : 0
  // Cliente NUNCA vê a lente do coord: sempre o sold_hours original do contrato.
  const isCoordViewer = !isClienteViewer && !!viewerUser?.id && !!p?.coordinators?.some((c: any) => c.id === viewerUser.id) && coordHoursBank > 0
  const coordConsumedVal = Number((p as any)?.coordination_consumed_hours ?? 0)
  const cardVendidas = isCoordViewer ? coordHoursBank : (p?.sold_hours ?? 0)
  const cardConsumed = isCoordViewer ? coordConsumedVal : consumed
  const cardSaldo    = isCoordViewer ? Math.round((cardVendidas - cardConsumed) * 100) / 100 : (p?.general_hours_balance ?? 0)
  const pct = isCoordViewer ? (cardVendidas > 0 ? (cardConsumed / cardVendidas) * 100 : 0)
                            : (totalAvail > 0 ? (consumed / totalAvail) * 100 : 0)
  const bar = healthColor(pct)
  const sc = p ? (statusColors[p.status] ?? statusColors.awaiting_start) : statusColors.awaiting_start
  const totalBreakdownHours = breakdown.reduce((s, c) => s + c.total_hours, 0)
  const topConsultant = breakdown.length > 0 ? breakdown.reduce((a, b) => a.total_hours > b.total_hours ? a : b) : null
  const topShare = totalBreakdownHours > 0 && topConsultant ? (topConsultant.total_hours / totalBreakdownHours) * 100 : 0
  const avgHours = breakdown.length > 0 ? totalBreakdownHours / breakdown.length : 0

  const alerts: { msg: string; color: string }[] = []
  if (pct >= 90) alerts.push({ msg: `Consumo crítico: ${Math.round(pct)}% das horas já utilizadas`, color: '#ef4444' })
  else if (pct >= 70) alerts.push({ msg: `Atenção: ${Math.round(pct)}% das horas consumidas`, color: '#f59e0b' })
  if ((p?.general_hours_balance ?? 0) < 0) alerts.push({ msg: 'Saldo de horas negativo — projeto em déficit', color: '#ef4444' })

  const isCoordRole = viewerUser?.type === 'coordenador'
  // Coordenador de sustentação: NÃO vê valores (só valor/hora), anexos, aportes financeiros
  // nem extrato. Restrição adicional sobre o coordenador de projetos.
  const isSustCoord = isCoordRole && (viewerUser as any)?.coordinator_type === 'sustentacao'
  const tabs = [
    { id: 'overview'    as const, label: 'Visão Geral' },
    { id: 'consultants' as const, label: `Consultores${breakdown.length > 0 ? ` (${breakdown.length})` : ''}` },
    { id: 'timesheets'  as const, label: 'Apontamentos' },
    // Aportes financeiros e Extrato: ocultos p/ coordenador de sustentação.
    ...(isSustCoord ? [] : [
      { id: 'aportes'     as const, label: `Aportes${aportesList.length > 0 ? ` (${aportesList.length})` : ''}` },
      { id: 'extrato'     as const, label: 'Extrato' },
    ]),
    ...(isCoordRole ? [] : [
      { id: 'financial'   as const, label: 'Financeiro' },
      { id: 'cost'        as const, label: 'Custo' },
    ]),
  ]
  // Se a aba atual não está disponível p/ este perfil (ex.: sust coordenador abrindo em
  // Aportes/Extrato), volta p/ Visão Geral.
  useEffect(() => {
    if (!tabs.some(t => t.id === tab)) setTab('overview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isSustCoord, isCoordRole])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-4xl max-h-[92vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-start justify-between mb-4">
            {!p ? (
              // Skeleton contextual do cabeçalho (barra de saúde + badges + título + cliente).
              <div className="flex items-center gap-4 min-w-0 w-full">
                <Skeleton className="w-1 h-14 rounded-full shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-1 h-14 rounded-full shrink-0" style={{ background: bar }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>{p.code}</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={sc}>{p.status_display ?? statusLabel[p.status] ?? p.status}</span>
                    <span className="text-xs font-bold" title={`${Math.round(pct)}% consumido`}>{riskEmoji(pct)} {riskLabel(pct)}</span>
                    {p.generated_aporte && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}
                        title="Este subprojeto faturado gerou um aporte automático no projeto pai">
                        Gerou aporte automático
                      </span>
                    )}
                  </div>
                  <h2 className="ds-text-h2 leading-tight truncate" style={{ color: 'var(--text)' }}>{p.name}</h2>
                  {p.customer?.name && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.customer.name}</p>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {userRole === 'admin' && p && (
                <button onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }}>
                  <ExternalLink size={11} /> Editar
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
          </div>
          <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
                style={{ color: tab === t.id ? 'var(--text)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-1px' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!p ? (
          // Skeleton contextual do corpo (espelha a aba Visão Geral: KPIs + barra + blocos de infos).
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl p-4 text-center" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <Skeleton className="h-2.5 w-20 mx-auto mb-3" />
                    <Skeleton className="h-6 w-16 mx-auto" />
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between items-center mb-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-full rounded-full" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {Array.from({ length: 2 }).map((_, col) => (
                  <div key={col}>
                    <Skeleton className="h-2.5 w-24 mb-2" />
                    <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                      {Array.from({ length: 5 }).map((_, r) => (
                        <div key={r} className="flex items-center justify-between">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">

            {tab === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: isCoordViewer ? 'Horas Vendidas (Coord.)' : 'Horas Vendidas',
                      value: fmt(cardVendidas, 1) + 'h',  color: 'var(--text)', bg: 'var(--surface-hover)' },
                    { label: 'Horas Consumidas', value: fmt(cardConsumed, 1) + 'h',       color: 'var(--text-muted)', bg: 'var(--surface-hover)' },
                    { label: 'Saldo',            value: fmt(cardSaldo, 1) + 'h',
                      color: cardSaldo < 0 ? 'var(--danger-border)' : 'var(--success-border)',
                      bg: cardSaldo < 0 ? 'var(--danger-bg)' : 'var(--success-bg)' },
                    { label: 'Consultores c/h',  value: String(breakdown.length || (p.consultants?.length ?? 0)), color: 'var(--brand-purple)', bg: 'rgba(139,92,246,0.06)' },
                  ].map(it => (
                    <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: it.bg, border: '1px solid var(--border)' }}>
                      <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{it.label}</p>
                      <p className="ds-text-kpi ds-text-numeric" style={{ color: it.color }}>{it.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: `1px solid ${bar}33` }}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-semibold" style={{ color: bar }}>{riskEmoji(pct)} {riskLabel(pct)}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: bar }}>{totalAvail > 0 ? `${Math.round(pct)}% consumido` : 'Sem horas'}</span>
                  </div>
                  <div className="w-full h-4 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: bar }} />
                  </div>
                </div>

                {/* Horas de Coordenação — visível pro admin/governança (quando há banco explícito).
                    Pro coordenador, o swap dos KPIs já mostra esses números, então omite aqui. */}
                {!isCoordViewer && !isClienteViewer && coordHoursBank > 0 && (() => {
                  const cBank = coordHoursBank
                  const cCons = coordConsumedVal
                  const cSaldo = Math.round((cBank - cCons) * 100) / 100
                  const cPct = cBank > 0 ? (cCons / cBank) * 100 : 0
                  const cBar = cPct > 100 ? 'var(--danger-border)' : cPct >= 91 ? 'var(--danger-border)' : cPct >= 71 ? 'var(--warning-border)' : 'var(--success-border)'
                  return (
                    <div className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: `1px solid ${cBar}33` }}>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Horas Apontáveis</span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: cBar }}>{cBank > 0 ? `${Math.round(cPct)}% consumido` : 'Sem horas'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                        <div><p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Vendidas</p><p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{fmt(cBank, 1)}h</p></div>
                        <div><p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Consumidas</p><p className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>{fmt(cCons, 1)}h</p></div>
                        <div><p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Saldo</p><p className="text-sm font-bold" style={{ color: cSaldo < 0 ? 'var(--danger-border)' : 'var(--success-border)' }}>{fmt(cSaldo, 1)}h</p></div>
                      </div>
                      <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cPct, 100)}%`, background: cBar }} />
                      </div>
                    </div>
                  )
                })()}

                {alerts.length > 0 && (
                  <div className="space-y-2">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: `${a.color}10`, border: `1px solid ${a.color}40` }}>
                        <AlertTriangle size={14} className="shrink-0" style={{ color: a.color }} />
                        <span className="text-xs" style={{ color: a.color }}>{a.msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Identificação</p>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="divide-y px-4" style={{ borderColor: 'var(--border)' }}>
                        <Row label="Código" value={<span className="font-mono">{p.code}</span>} />
                        <Row label="Cliente" value={p.customer?.name} />
                        <Row label="Tipo de Serviço" value={p.service_type?.name} />
                        <Row label="Tipo de Contrato" value={p.contract_type_display ?? p.contract_type?.name} />
                        <Row label="Data de Início" value={fmtDate(p.start_date)} />
                        {p.expected_end_date && (() => {
                          const ds = endDateStyle(p.expected_end_date)
                          return (
                            <Row label="Data de Conclusão" value={
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: ds.bg, color: ds.color }}>
                                {new Date(p.expected_end_date).toLocaleDateString('pt-BR')} — {ds.label}
                              </span>
                            } />
                          )
                        })()}
                      </div>
                    </div>

                    {/* Detalhes do Contrato — campos herdados do contrato original */}
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 mt-4" style={{ color: 'var(--text-light)' }}>Detalhes do Contrato</p>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="divide-y px-4" style={{ borderColor: 'var(--border)' }}>
                        <Row label="Tipo de Alocação"     value={(p as any).tipo_alocacao ?? '—'} />
                        <Row label="Condição de Pagamento" value={(p as any).condicao_pagamento ?? '—'} />
                        <Row label="Percentual Gestão"    value={(p as any).coordinator_hours != null ? `${(p as any).coordinator_hours}%` : '—'} />
                        <Row label="Horas de Gestão"      value={(p as any).coordinator_hours != null && (p as any).sold_hours != null ? `${Math.round((Number((p as any).coordinator_hours) / 100) * Number((p as any).sold_hours) * 100) / 100}h` : '—'} />
                        <Row label="Horas Consultor"      value={(p as any).consultant_hours != null ? `${Number((p as any).consultant_hours).toFixed(1)}h` : '—'} />
                        <Row label="Saving ERPSERV"       value={(p as any).sold_hours != null && (p as any).consultant_hours != null && (p as any).coordinator_hours != null ? `${Math.round((Number((p as any).sold_hours) - Number((p as any).consultant_hours) - (Number((p as any).coordinator_hours) / 100) * Number((p as any).sold_hours)) * 100) / 100}h` : '—'} />
                        <Row label="Horas Apontáveis"     value={(p as any).coordination_hours != null && Number((p as any).coordination_hours) > 0 ? `${Number((p as any).coordination_hours).toFixed(1)}h` : '—'} />
                        <Row label="Cobra Despesa"        value={(p as any).cobra_despesa_cliente ? 'Sim' : 'Não'} />
                        {!isSustCoord && <Row label="Limite de Despesa"    value={(p as any).limite_despesa != null ? fmtBRL(Number((p as any).limite_despesa)) : '—'} />}
                        <Row label="Arquiteto"            value={(p as any).architect?.name ?? '—'} />
                        <Row label="Executivo de Conta"   value={(p as any).executivo_conta?.name ?? '—'} />
                        <Row label="Vendedor"             value={(p as any).vendedor?.name ?? '—'} />
                        {(p as any).observacoes_contrato && (
                          <Row label="Observações" value={<span className="text-left whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{(p as any).observacoes_contrato}</span>} />
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Equipe</p>
                    <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                      {(() => {
                        // Coordenador efetivo: override do Kanban vence sobre a lista M2M.
                        const effCoords = p.kanban_override_coordinator ? [p.kanban_override_coordinator] : (p.coordinators ?? [])
                        return effCoords.length > 0 && (
                          <div>
                            <p className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Coordenadores</p>
                            <div className="flex flex-wrap gap-1.5">{effCoords.map(u => (
                              <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{u.name}</span>
                            ))}</div>
                          </div>
                        )
                      })()}
                      {(p.consultants?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Consultores</p>
                          <div className="flex flex-wrap gap-1.5">{p.consultants!.map(u => (
                            <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(139,92,246,0.10)', color: 'var(--brand-purple)' }}>{u.name}</span>
                          ))}</div>
                        </div>
                      )}
                      {(p.kanban_override_coordinator ? 0 : (p.coordinators?.length ?? 0)) === 0 && !p.kanban_override_coordinator && (p.consultants?.length ?? 0) === 0 && (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-light)' }}>Sem equipe cadastrada</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contatos do cliente */}
                <CustomerContactsSection customerId={p.customer?.id} customerName={p.customer?.name} />

                {/* Anexos — oculto p/ coordenador */}
                {!isCoordRole && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Anexos</p>
                  {viewAttachments.length > 0 ? (
                    <div className="space-y-1.5">
                      {viewAttachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={13} className="shrink-0" style={{ color: 'var(--text-light)' }} />
                            <div className="min-w-0">
                              <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{att.original_name}</p>
                              <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{att.type ?? 'anexo'}{att.source === 'contract' ? ' · do contrato' : ''}</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => downloadViewAtt(att)} title="Baixar" className="p-1 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}><Download size={13} /></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum anexo</p>
                  )}
                </div>
                )}

                {breakdown.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>Quem está consumindo horas</p>
                    <div className="space-y-2">
                      {[...breakdown].sort((a, b) => b.total_hours - a.total_hours).slice(0, 5).map((c, i) => {
                        const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                        const colors = ['var(--primary)', '#a78bfa', '#22c55e', '#f59e0b', '#f87171']
                        const col = colors[i % colors.length]
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs shrink-0 w-28 truncate" style={{ color: 'var(--text)' }}>{c.consultant_name}</span>
                            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: col }} />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums shrink-0 w-12 text-right" style={{ color: col }}>{fmt(c.total_hours, 1)}h</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'consultants' && (
              <div className="space-y-4">
                {breakdown.length === 0 ? (
                  <p className="text-center text-sm py-12" style={{ color: 'var(--text-light)' }}>Nenhum lançamento de horas encontrado.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: 'Consultores', value: String(breakdown.length), color: 'var(--brand-purple)' },
                        { label: 'Total Horas', value: fmt(totalBreakdownHours, 1) + 'h', color: 'var(--text)' },
                        { label: 'Aprovadas',   value: fmt(breakdown.reduce((s, c) => s + c.approved_hours, 0), 1) + 'h', color: 'var(--success-border)' },
                        // Custo Total (valor): oculto p/ coordenador de sustentação.
                        ...(isSustCoord ? [] : [{ label: 'Custo Total', value: fmtBRL(breakdown.reduce((s, c) => s + c.cost, 0)), color: 'var(--primary)' }]),
                      ].map(it => (
                        <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                          <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{it.label}</p>
                          <p className="text-lg font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {[...breakdown].sort((a, b) => b.total_hours - a.total_hours).map((c, i) => {
                        const share = totalBreakdownHours > 0 ? (c.total_hours / totalBreakdownHours) * 100 : 0
                        const colors = ['var(--primary)', '#a78bfa', '#22c55e', '#f59e0b', '#f87171', '#34d399', '#60a5fa']
                        const col = colors[i % colors.length]
                        return (
                          <div key={i} className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{c.consultant_name}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color: col }}>{fmt(c.total_hours, 1)}h · {Math.round(share)}%</span>
                            </div>
                            <div className="w-full h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--surface-hover)' }}>
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: col }} />
                            </div>
                            <div className={`grid gap-2 text-[10px] ${!isCoordRole ? 'grid-cols-4' : isSustCoord ? 'grid-cols-3' : 'grid-cols-2'}`}>
                              <div><span style={{ color: 'var(--text-light)' }}>Aprovadas</span><br /><span style={{ color: 'var(--success-border)' }}>{fmt(c.approved_hours, 1)}h</span></div>
                              <div><span style={{ color: 'var(--text-light)' }}>Pendentes</span><br /><span style={{ color: c.pending_hours > 0 ? 'var(--warning-border)' : 'var(--text-light)' }}>{fmt(c.pending_hours, 1)}h</span></div>
                              {/* Taxa/h (valor/hora) permitida ao coord. de sustentação; Custo só p/ admin. */}
                              {(!isCoordRole || isSustCoord) && (
                              <div><span style={{ color: 'var(--text-light)' }}>Taxa/h</span><br /><span style={{ color: 'var(--text-muted)' }}>{fmtBRL(c.consultant_hourly_rate)}</span></div>
                              )}
                              {!isCoordRole && (
                              <div><span style={{ color: 'var(--text-light)' }}>Custo</span><br /><span style={{ color: 'var(--primary)' }}>{fmtBRL(c.cost)}</span></div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'timesheets' && (
              <div className="space-y-4">
                {tsLoading ? (
                  <p className="text-center text-sm animate-pulse py-12" style={{ color: 'var(--text-light)' }}>Carregando apontamentos...</p>
                ) : timesheets.length === 0 ? (
                  <p className="text-center text-sm py-12" style={{ color: 'var(--text-light)' }}>Nenhum apontamento encontrado.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: 'Total de Registros', value: String(timesheets.length), color: 'var(--text)' },
                        { label: 'Total de Horas', value: fmt(timesheets.reduce((s, t) => s + (t.effort_minutes ?? 0), 0) / 60, 1) + 'h', color: 'var(--primary)' },
                        { label: 'Aprovados', value: String(timesheets.filter(t => t.status === 'approved').length), color: 'var(--success-border)' },
                        { label: 'Pendentes', value: String(timesheets.filter(t => t.status === 'pending').length),  color: 'var(--warning-border)' },
                      ].map(it => (
                        <div key={it.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                          <p className="text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{it.label}</p>
                          <p className="ds-text-kpi" style={{ color: it.color }}>{it.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {timesheets.map(ts => {
                        const sColor = tsStatusColor[ts.status] ?? '#94a3b8'
                        return (
                          <div key={ts.id} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{ts.user?.name ?? '—'}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${sColor}18`, color: sColor }}>{ts.status_display}</span>
                              </div>
                              {ts.observation && <p className="text-xs line-clamp-2" style={{ color: 'var(--text-muted)' }}>{previewText(ts.observation)}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{fmtDate(ts.date)}</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{ts.effort_hours}h</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'aportes' && !isSustCoord && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-light)' }}>
                    Aportes do projeto
                  </p>
                  <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                    Para criar/editar/excluir, acesse Gestão de Projetos
                  </span>
                </div>
                {aportesLoading && (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Carregando aportes…</p>
                )}
                {!aportesLoading && aportesList.length === 0 && (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Nenhum aporte registrado.</p>
                )}
                {!aportesLoading && aportesList.length > 0 && (
                  <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
                    <table className="w-full text-xs">
                      <thead style={{ background: 'var(--surface-sunken)' }}>
                        <tr>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Data</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Motivo</th>
                          <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Horas</th>
                          <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Valor/h</th>
                          <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Total</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Status</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-light)' }}>Autor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aportesList.map((a: any) => {
                          const h = Number(a.contributed_hours)
                          const r = Number(a.hourly_rate)
                          const total = h * r
                          const motivoLabel: Record<string, string> = { aporte: 'Aporte', excedentes: 'Excedentes', absorvidas: 'Absorvidas' }
                          const isNovo = a.kanban_status === 'novo_contrato'
                          return (
                            <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td className="px-3 py-2" style={{ color: 'var(--text)' }}>
                                {a.contributed_at ? new Date(a.contributed_at).toLocaleDateString('pt-BR') : '—'}
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{motivoLabel[a.motivo] ?? a.motivo}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{h.toFixed(1)}h</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{r.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--success-border)' }}>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="px-3 py-2">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{
                                    background: isNovo ? 'var(--warning-bg)' : 'var(--success-bg)',
                                    color: isNovo ? 'var(--warning-border)' : 'var(--success-border)',
                                  }}>
                                  {isNovo ? 'Em revisão' : 'Confirmado'}
                                </span>
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-light)' }}>{a.contributed_by?.name ?? a.contributed_by ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === 'extrato' && !isSustCoord && (
              <div className="space-y-4">
                {(viewerUser?.type === 'admin' || viewerUser?.type === 'coordenador') && (() => {
                  const visivel = (p as any)?.extrato_visivel_cliente ?? true
                  return (
                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      <span className="text-xs" style={{ color: 'var(--text)' }}>Cliente vê este Extrato no perfil dele</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const v = !visivel
                          setP(prev => prev ? ({ ...prev, extrato_visivel_cliente: v } as any) : prev)
                          try {
                            await api.put(`/projects/${projectId}`, { extrato_visivel_cliente: v })
                            toast.success(v ? 'Extrato visível para o cliente' : 'Extrato oculto para o cliente')
                          } catch {
                            setP(prev => prev ? ({ ...prev, extrato_visivel_cliente: !v } as any) : prev)
                            toast.error('Erro ao salvar')
                          }
                        }}
                        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: visivel ? 'var(--success-border)' : 'var(--border-strong)' }}
                      >
                        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--surface)] transition-transform" style={{ transform: visivel ? 'translateX(20px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                  )
                })()}
                <MonthlyAccrualTable projectId={projectId} canEditConsumption={viewerUser?.type === 'admin' || viewerUser?.type === 'coordenador'} />
              </div>
            )}

            {tab === 'financial' && !isCoordRole && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { label: 'Valor do Projeto',        value: fmtBRL(p.project_value),                          color: 'var(--primary)' },
                    { label: 'Valor Total (c/aportes)', value: fmtBRL(p.total_project_value ?? p.project_value), color: 'var(--primary)' },
                    { label: 'Taxa / Hora',             value: fmtBRL(p.hourly_rate),                            color: 'var(--text)' },
                  ].map(it => (
                    <div key={it.label} className="rounded-xl p-4 text-center" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] mb-2 uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{it.label}</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="divide-y px-4" style={{ borderColor: 'var(--border)' }}>
                    <Row label="Horas Contratadas" value={p.sold_hours != null ? `${fmt(p.sold_hours, 1)}h` : '—'} />
                    <Row label="Total Disponível" value={`${fmt(totalAvail, 1)}h`} />
                    <Row label="Saldo Atual" value={<span style={{ color: (p.general_hours_balance ?? 0) < 0 ? 'var(--danger-border)' : 'var(--success-border)' }}>{fmt(p.general_hours_balance, 1)}h</span>} />
                    <Row label="% Consumido" value={<span style={{ color: bar }}>{totalAvail > 0 ? `${Math.round(pct)}%` : '—'}</span>} />
                    <Row label="Custo Inicial" value={fmtBRL(p.initial_cost)} />
                  </div>
                </div>
              </div>
            )}

            {tab === 'cost' && !isCoordRole && (
              <div className="space-y-4">
                {!costSummary ? (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Nenhum dado de custo disponível.</p>
                ) : (() => {
                  const { project_info: pi, hours_summary: hs, cost_calculation: cc, consultant_breakdown: cb } = costSummary
                  const isPositive = cc.margin >= 0
                  const marginColor = isPositive ? 'var(--success-border)' : 'var(--danger-border)'
                  const hoursIniciais = Math.abs(pi.initial_hours_balance ?? 0)
                  const horasConsumidas = hoursIniciais + hs.total_logged_hours
                  const totalDisp = hs.total_available_hours ?? pi.total_available_hours ?? 0
                  const horasRestantes = Math.max(0, totalDisp - horasConsumidas)
                  const pctUso = totalDisp > 0 ? Math.min(100, (horasConsumidas / totalDisp) * 100) : 0
                  const hoursBarColor = pctUso >= 90 ? 'var(--danger-border)' : pctUso >= 70 ? 'var(--warning-border)' : 'var(--success-border)'
                  const showHistorico = (pi.initial_hours_balance ?? 0) !== 0 || (pi.initial_cost ?? 0) !== 0
                  const isOnDemand = cc.is_on_demand
                  return (
                    <>
                      {/* Bloco 1 — RECEITA */}
                      <div className="rounded-xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                          <DollarSign size={11} />Receita {isOnDemand && <span className="text-[9px] font-normal ml-1 opacity-70">(On Demand — horas × R$/h)</span>}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[
                            { label: isOnDemand ? 'Horas × R$/h' : 'Valor Projeto', value: fmtBRL(cc.project_revenue) },
                            { label: 'Aportes',        value: fmtBRL(cc.aportes_total) },
                            { label: 'Receita Total',  value: fmtBRL(cc.receita_total), highlight: true },
                          ].map(c => (
                            <div key={c.label} className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: `1px solid ${c.highlight ? 'var(--ring)' : 'var(--border)'}` }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: c.highlight ? 'var(--primary)' : 'var(--text)' }}>{c.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bloco 2 — CUSTO */}
                      <div className="rounded-xl p-4" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--warning-border)' }}>
                          <TrendingUp size={11} />Custo
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[
                            { label: 'Custo Inicial',     value: fmtBRL(pi.initial_cost ?? 0) },
                            { label: 'Custo Operacional', value: fmtBRL(cc.custo_operacional) },
                            { label: 'Custo Total',        value: fmtBRL(cc.custo_total), highlight: true },
                          ].map(c => (
                            <div key={c.label} className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: `1px solid ${c.highlight ? 'var(--warning-border)' : 'var(--border)'}` }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: c.highlight ? 'var(--warning-border)' : 'var(--text)' }}>{c.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bloco 3 — RESULTADO */}
                      <div className="rounded-xl p-4" style={{ background: isPositive ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: marginColor }}>
                          <BarChart2 size={11} />Resultado
                        </p>
                        <p className="text-[10px] tabular-nums mb-3" style={{ color: 'var(--text-light)' }}>
                          {fmtBRL(cc.receita_total)} <span className="opacity-50">−</span> {fmtBRL(cc.custo_total)} <span className="opacity-50">=</span> <span style={{ color: marginColor }}>{fmtBRL(cc.margin)}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg p-3.5" style={{ background: 'var(--bg)', border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Margem R$</p>
                            <p className="ds-text-kpi ds-text-numeric" style={{ color: marginColor }}>{fmtBRL(cc.margin)}</p>
                          </div>
                          <div className="rounded-lg p-3.5" style={{ background: 'var(--bg)', border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Margem %</p>
                            <p className="ds-text-kpi ds-text-numeric" style={{ color: marginColor }}>{cc.margin_percentage.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>

                      {/* Bloco 4 — COORDENADOR (condicional) */}
                      {cc.coordinator_percentage > 0 && (
                        <div className="rounded-xl p-4" style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.18)' }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--brand-purple)' }}>
                            <UserCheck size={11} />Coordenador
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>% da Margem</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-purple)' }}>{cc.coordinator_percentage.toFixed(1)}%</p>
                            </div>
                            <div className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: '1px solid rgba(167,139,250,0.35)' }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Valor a Receber</p>
                              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-purple)' }}>{fmtBRL(cc.valor_coordenador)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bloco 5 — HORAS */}
                      <div className="rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>Horas</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                          {[
                            { label: 'Iniciais',    value: `${hoursIniciais.toFixed(1)}h`,          color: 'var(--text)' },
                            { label: 'Apontadas',   value: `${hs.total_logged_hours.toFixed(1)}h`,  color: 'var(--text)' },
                            { label: 'Consumido',   value: `${horasConsumidas.toFixed(1)}h`,        color: 'var(--text)' },
                            { label: '% Uso',       value: `${pctUso.toFixed(1)}%`,                 color: hoursBarColor },
                            { label: 'Restantes',   value: `${horasRestantes.toFixed(1)}h`,         color: horasRestantes < 10 ? 'var(--danger-border)' : 'var(--text)' },
                          ].map(c => (
                            <div key={c.label}>
                              <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                              <p className="font-bold tabular-nums mt-0.5 text-xs" style={{ color: c.color }}>{c.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--border)' }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pctUso}%`, background: hoursBarColor }} />
                        </div>
                        <p className="text-[10px] tabular-nums" style={{ color: 'var(--text-light)' }}>{pctUso.toFixed(1)}% das horas utilizadas</p>
                      </div>

                      {/* Bloco 6 — HISTÓRICO */}
                      {showHistorico && (
                        <div className="rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider w-full mb-0.5" style={{ color: 'var(--text-light)' }}>Saldo do sistema anterior</p>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--text-light)' }}>Horas iniciais: <strong>{(pi.initial_hours_balance ?? 0) < 0 ? '-' : ''}{Math.abs(pi.initial_hours_balance ?? 0).toFixed(1)}h</strong></span>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--text-light)' }}>Custo inicial: <strong>{fmtBRL(pi.initial_cost ?? 0)}</strong></span>
                        </div>
                      )}

                      {/* Tabela de custo por consultor */}
                      {cb.length > 0 && (
                        <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
                          <div className="px-4 py-3" style={{ background: 'var(--surface)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}>
                              <UserCheck size={11} />Custo por Consultor
                            </p>
                          </div>
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 z-10" style={{ background: 'var(--bg)' }}>
                              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                {['Consultor','Hs Total','Aprovadas','Pendentes','Taxa/h','Custo'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cb.map((c, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{c.consultant_name}</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--text)' }}>{c.total_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--success-border)' }}>{c.approved_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--warning-border)' }}>{c.pending_hours.toFixed(1)}h</td>
                                  <td className="px-3 py-2.5 tabular-nums text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                    {c.consultant_hourly_rate != null ? fmtBRL(c.consultant_hourly_rate) : '—'}
                                    {c.consultant_rate_type === 'monthly' && <span className="ml-1 opacity-60">÷160</span>}
                                  </td>
                                  <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--text)' }}>{fmtBRL(c.cost)}</td>
                                </tr>
                              ))}
                              <tr style={{ background: 'var(--primary-soft)', borderTop: '1px solid var(--border)' }}>
                                <td className="px-3 py-2.5 font-bold text-[11px] uppercase" style={{ color: 'var(--text-light)' }} colSpan={5}>Total Operacional</td>
                                <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(cc.custo_operacional)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Fechar</button>
        </div>
      </div>
      {showEdit && p && (
        <ProjectInlineEditModal project={p} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); reload() }} />
      )}
    </div>
  )
}

export function ProjectInlineEditModal({ project, onClose, onSaved }: { project: ProjectFull; onClose: () => void; onSaved: () => void }) {
  const { user: authUser } = useAuth()
  const isAdmin = authUser?.type === 'admin'
  const d = project as any
  const [form, setForm] = useState<ProjectEditForm>({
    name:                            d.name ?? '',
    description:                     d.description ?? '',
    status:                          d.status ?? 'awaiting_start',
    start_date:                      d.start_date?.slice(0, 10) ?? '',
    expected_end_date:               d.expected_end_date?.slice(0, 10) ?? '',
    sold_hours:                      d.sold_hours != null ? String(d.sold_hours) : '',
    project_value:                   d.project_value != null ? String(d.project_value) : '',
    hourly_rate:                     d.hourly_rate != null ? String(d.hourly_rate) : '',
    additional_hourly_rate:          d.additional_hourly_rate != null ? String(d.additional_hourly_rate) : '',
    initial_hours_balance:           d.initial_hours_balance != null ? String(d.initial_hours_balance) : '',
    initial_cost:                    d.initial_cost != null ? String(d.initial_cost) : '',
    consultant_hours:                d.consultant_hours != null ? String(d.consultant_hours) : '',
    coordinator_hours:               d.coordinator_hours != null ? String(d.coordinator_hours) : '',
    coordination_hours:              (d as any).coordination_hours != null ? String((d as any).coordination_hours) : '',
    parent_project_id:               d.parent_project_id ? String(d.parent_project_id) : '',
    service_type_id:                 d.service_type_id ? String(d.service_type_id) : (d.service_type?.id ? String(d.service_type.id) : ''),
    contract_type_id:                d.contract_type_id ? String(d.contract_type_id) : (d.contract_type?.id ? String(d.contract_type.id) : ''),
    tipo_faturamento:                d.tipo_faturamento ?? '',
    tipo_alocacao:                   d.tipo_alocacao ?? '',
    condicao_pagamento:              d.condicao_pagamento ?? '',
    vendedor_id:                     d.vendedor_id ? String(d.vendedor_id) : '',
    cobra_despesa_cliente:           d.cobra_despesa_cliente ?? false,
    observacoes_contrato:            d.observacoes_contrato ?? '',
    max_expense_per_consultant:      d.max_expense_per_consultant != null ? String(d.max_expense_per_consultant) : '',
    timesheet_retroactive_limit_days: d.timesheet_retroactive_limit_days != null ? String(d.timesheet_retroactive_limit_days) : '',
    allow_manual_timesheets:         d.allow_manual_timesheets ?? true,
    allow_negative_balance:          d.allow_negative_balance ?? false,
    client_follows_timesheets:       (d as any).client_follows_timesheets ?? true,
    movidesk_integration_enabled:    (d as any).movidesk_integration_enabled ?? false,
    coordinator_ids:                 (d.coordinators ?? d.approvers ?? []).map((c: any) => c.id),
    consultant_ids:                  (d.consultants ?? []).map((c: any) => c.id),
    consultant_group_ids:            (d.consultant_groups ?? []).map((g: any) => g.id),
    kanban_coordinator_override_id:  d.kanban_coordinator_override_id ? String(d.kanban_coordinator_override_id) : '',
  } as any)
  const [saving, setSaving] = useState(false)
  const [projAttachments, setProjAttachments] = useState<any[]>([])
  const [pendingAttach, setPendingAttach] = useState<{ file: File; type: string }[]>([])
  const attachFileRef = useRef<HTMLInputElement>(null)
  // Fluxo in-app de troca de integração Movidesk (substitui window.confirm)
  const [movideskConflict, setMovideskConflict] = useState<{ current?: { code?: string; name?: string }; payload: Record<string, unknown> } | null>(null)
  const [movideskStep, setMovideskStep] = useState<'confirm' | 'migrate' | 'processing'>('confirm')
  const [movideskMigrating, setMovideskMigrating] = useState(false)
  useEffect(() => {
    api.get<any[]>(`/projects/${project.id}/attachments`).then(r => setProjAttachments(Array.isArray(r) ? r : [])).catch(() => {})
  }, [project.id])
  const fmtAttSize = (b: any) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const downloadProjAtt = async (att: any) => {
    const res = await fetch(`/api/v1/projects/${project.id}/attachments/${att.id}`, { credentials: 'same-origin' })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob(); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = att.original_name; a.click(); URL.revokeObjectURL(url)
  }
  const deleteProjAtt = async (att: any) => {
    if (!confirm('Remover este anexo?')) return
    try { await api.delete(`/projects/${project.id}/attachments/${att.id}`); setProjAttachments(p => p.filter(x => x.id !== att.id)); toast.success('Anexo removido') }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao remover anexo') }
  }
  const [optServiceTypes,   setOptServiceTypes]   = useState<{id:number;name:string}[]>([])
  const [optContractTypes,  setOptContractTypes]  = useState<{id:number;name:string}[]>([])
  const [optCoordinators,   setOptCoordinators]   = useState<{id:number;name:string}[]>([])
  const [optConsultants,    setOptConsultants]    = useState<{id:number;name:string}[]>([])
  const [optGroups,         setOptGroups]         = useState<{id:number;name:string}[]>([])
  const [optParentProjects, setOptParentProjects] = useState<{id:number;name:string}[]>([])
  const [teamSearch,        setTeamSearch]        = useState('')
  const [teamTab,           setTeamTab]           = useState<'coord'|'consult'|'group'>('coord')

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.allSettled([
      api.get<any>('/service-types?pageSize=100'),
      api.get<any>('/contract-types?pageSize=100'),
      api.get<any>('/users?type=coordenador&coordinator_type=projetos&pageSize=200'),
      api.get<any>('/users?type=admin&pageSize=200'),
      api.get<any>('/users?type=consultor,parceiro_admin&pageSize=200'),
      api.get<any>('/consultant-groups?pageSize=100&active=1'),
    ]).then(([st, ct, coords, admins, consults, grps]) => {
      if (st.status === 'fulfilled')       setOptServiceTypes(items(st.value))
      if (ct.status === 'fulfilled')       setOptContractTypes(items(ct.value))
      if (coords.status === 'fulfilled' || admins.status === 'fulfilled') {
        const coordList = coords.status === 'fulfilled' ? items(coords.value) : []
        const adminList = admins.status === 'fulfilled' ? items(admins.value) : []
        const merged = [...coordList, ...adminList.filter((a: any) => !coordList.some((c: any) => c.id === a.id))]
        setOptCoordinators(merged)
      }
      if (consults.status === 'fulfilled') setOptConsultants(items(consults.value))
      if (grps.status === 'fulfilled')     setOptGroups(items(grps.value))
    })
    if (d.customer_id) {
      const qs = new URLSearchParams({ pageSize: '200', parent_projects_only: 'true', customer_id: String(d.customer_id), exclude_id: String(project.id) })
      api.get<any>(`/projects?${qs}`).then(r => {
        setOptParentProjects(items(r).map((p: any) => ({ id: p.id, name: `${p.code} - ${p.name}` })))
      }).catch(() => {})
    }
  }, [])

  const toggleId = (ids: number[], id: number) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  const setF = (key: keyof ProjectEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))
  // "Horas de Gestão" deriva do % (coordinator_hours) sobre as Horas Vendidas.
  const [gestaoDraft, setGestaoDraft] = useState<string | null>(null)
  // Horas Apontáveis / Percentual Gestão / Horas de Gestão só p/ Fechado e BH Fixo.
  // Cloud/SaaS, On Demand e BH Mensal não têm esses campos.
  const ctNameK = (optContractTypes.find(c => String(c.id) === form.contract_type_id)?.name
    ?? (d.contract_type_display ?? d.contract_type?.name ?? '')).toLowerCase()
  const showApontaveis = !(ctNameK.includes('on demand') || form.tipo_faturamento === 'on_demand'
    || ctNameK.includes('mensal') || ctNameK === 'cloud' || ctNameK === 'saas')

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(), description: form.description || null, status: form.status,
        start_date: form.start_date || null, expected_end_date: form.expected_end_date || null,
        allow_manual_timesheets: form.allow_manual_timesheets,
        allow_negative_balance: form.allow_negative_balance,
        client_follows_timesheets: form.client_follows_timesheets,
        movidesk_integration_enabled: form.movidesk_integration_enabled,
        cobra_despesa_cliente: form.cobra_despesa_cliente,
        observacoes_contrato: form.observacoes_contrato || null,
        condicao_pagamento: form.condicao_pagamento || null,
        // coordinator_ids NÃO é reenviado: coordenação é definida só no Kanban de Contratos.
        // O backend preserva o M2M quando o campo é omitido.
        consultant_ids: form.consultant_ids,
        consultant_group_ids: form.consultant_group_ids,
      }
      if (form.service_type_id)               payload.service_type_id               = Number(form.service_type_id)
      if (form.contract_type_id)              payload.contract_type_id              = Number(form.contract_type_id)
      if (form.parent_project_id)             payload.parent_project_id             = Number(form.parent_project_id)
      if (form.vendedor_id)                   payload.vendedor_id                   = Number(form.vendedor_id)
      if (form.tipo_faturamento)              payload.tipo_faturamento              = form.tipo_faturamento
      if (form.tipo_alocacao)                 payload.tipo_alocacao                 = form.tipo_alocacao
      if (form.project_value !== '')          payload.project_value                 = Number(form.project_value)
      if (form.hourly_rate !== '')            payload.hourly_rate                   = Number(form.hourly_rate)
      if (form.additional_hourly_rate !== '') payload.additional_hourly_rate        = Number(form.additional_hourly_rate)
      if (form.sold_hours !== '')             payload.sold_hours                    = Number(form.sold_hours)
      if (form.consultant_hours !== '')       payload.consultant_hours              = Number(form.consultant_hours)
      if (form.coordinator_hours !== '')      payload.coordinator_hours             = Number(form.coordinator_hours)
      // coordination_hours (banco do coord, CA v1): envia 0 quando vazio pra permitir zerar.
      payload.coordination_hours = form.coordination_hours === '' ? 0 : Number(form.coordination_hours)
      if (form.initial_hours_balance !== '')  payload.initial_hours_balance         = Number(form.initial_hours_balance)
      if (form.initial_cost !== '')           payload.initial_cost                  = Number(form.initial_cost)
      if (form.max_expense_per_consultant !== '') payload.max_expense_per_consultant = Number(form.max_expense_per_consultant)
      if (form.timesheet_retroactive_limit_days !== '') payload.timesheet_retroactive_limit_days = Number(form.timesheet_retroactive_limit_days)
      // Override de coordenador (admin only, sustentação only — backend valida)
      const overrideVal = (form as any).kanban_coordinator_override_id
      if (overrideVal !== undefined) {
        payload.kanban_coordinator_override_id = overrideVal === '' ? null : Number(overrideVal)
      }
      try {
        await api.put(`/projects/${project.id}`, payload)
      } catch (err: any) {
        const isConflict = (err instanceof ApiError) && err.status === 409 && (err.data as any)?.code === 'MOVIDESK_INTEGRATION_CONFLICT'
        if (!isConflict) throw err
        // Abre o fluxo de modais in-app; o PUT de swap é refeito por submitMovideskSwap.
        setMovideskConflict({ current: (err.data as any)?.current_project, payload })
        setMovideskStep('confirm')
        setSaving(false)
        return
      }
      await finishAfterSave()
    } catch { toast.error('Erro ao salvar projeto') }
    finally { setSaving(false) }
  }

  // Pós-processamento compartilhado entre o fluxo normal e o de troca Movidesk.
  const finishAfterSave = async () => {
    if (pendingAttach.length > 0) {
      for (const { file, type } of pendingAttach) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('type', type)
        await uploadDirect(`/projects/${project.id}/attachments`, fd)
      }
      setPendingAttach([])
    }
    toast.success('Projeto atualizado')
    onSaved()
  }

  // Refaz o PUT confirmando a troca de integração Movidesk (com ou sem migração).
  const submitMovideskSwap = async (migrate: boolean) => {
    if (!movideskConflict) return
    setMovideskMigrating(migrate)
    setMovideskStep('processing')
    try {
      await api.put(`/projects/${project.id}`, { ...movideskConflict.payload, confirm_movidesk_swap: true, migrate_movidesk_timesheets: migrate })
      await finishAfterSave()
      setMovideskConflict(null)
    } catch {
      toast.error('Erro ao salvar projeto')
      setMovideskConflict(null)
    }
  }

  const iStyle: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text)', outline: 'none' }
  const lStyle: React.CSSProperties = { fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-light)', marginBottom: '0.375rem', display: 'block' }
  const SecTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold uppercase tracking-wider pt-3 pb-2" style={{ color: 'var(--text-light)', borderTop: '1px solid var(--border)' }}>{children}</p>
  )
  const Toggle2 = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
      <button type="button" onClick={() => onChange(!checked)} className="relative w-10 h-5 rounded-full transition-colors shrink-0" style={{ background: checked ? 'var(--success-border)' : 'var(--border-strong)' }}>
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--surface)] transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
      <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
    </div>
  )
  const STATUS_OPTS = [
    { value: 'awaiting_start', label: 'Aguardando Início' },
    { value: 'started',        label: 'Em Andamento' },
    { value: 'paused',         label: 'Pausado' },
    { value: 'finished',       label: 'Encerrado' },
    { value: 'cancelled',      label: 'Cancelado' },
  ]
  const filteredCoords   = optCoordinators.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredConsults = optConsultants.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredGroups   = optGroups.filter(g => g.name.toLowerCase().includes(teamSearch.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-5xl max-h-[94vh]" style={{ background: 'var(--surface)', border: '1px solid var(--primary-soft)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>{d.code}</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar Projeto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Identificação</p>
              <div><label style={lStyle}>Nome do Projeto *</label><input value={form.name} onChange={setF('name')} style={iStyle} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Status</label><select value={form.status} onChange={setF('status')} style={iStyle}>{STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label style={lStyle}>Data de Início</label><input type="date" value={form.start_date} onChange={setF('start_date')} style={iStyle} /></div>
              </div>
              <div><label style={lStyle}>Data de Conclusão</label><input type="date" value={form.expected_end_date} onChange={setF('expected_end_date')} style={iStyle} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Tipo de Contrato</label><select value={form.contract_type_id} onChange={setF('contract_type_id')} style={iStyle}><option value="">Selecione...</option>{optContractTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label style={lStyle}>Tipo de Serviço</label><select value={form.service_type_id} onChange={setF('service_type_id')} style={iStyle}><option value="">Selecione...</option>{optServiceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div><label style={lStyle}>Projeto Pai (Subprojeto)</label><select value={form.parent_project_id} onChange={setF('parent_project_id')} style={iStyle}><option value="">Nenhum</option>{optParentProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label style={lStyle}>Descrição</label><textarea value={form.description} onChange={setF('description')} style={{ ...iStyle, resize: 'vertical', minHeight: '64px' }} /></div>

              {/* Contatos do cliente */}
              <CustomerContactsSection customerId={d.customer_id} customerName={d.customer?.name} />

              {/* Anexos */}
              <div>
                <label style={lStyle}>Anexos (aprovação do cliente / proposta, contrato, logo)</label>
                {(projAttachments.length > 0 || pendingAttach.length > 0) ? (
                  <div className="space-y-1.5 mb-2">
                    {projAttachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={13} className="shrink-0" style={{ color: 'var(--text-light)' }} />
                          <div className="min-w-0">
                            <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{att.original_name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{att.type ?? 'anexo'}{att.size != null ? ` · ${fmtAttSize(att.size)}` : ''}{att.source === 'contract' ? ' · do contrato' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => downloadProjAtt(att)} title="Baixar" className="p-1 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}><Download size={13} /></button>
                          {att.source !== 'contract' && (
                            <button type="button" onClick={() => deleteProjAtt(att)} title="Remover" className="p-1 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}><Trash2 size={13} /></button>
                          )}
                        </div>
                      </div>
                    ))}
                    {pendingAttach.map((pf, i) => (
                      <div key={`pend-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
                        <div className="min-w-0">
                          <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{pf.file.name}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{pf.type} · aguardando salvar</p>
                        </div>
                        <button type="button" onClick={() => setPendingAttach(p => p.filter((_, j) => j !== i))} className="p-1 shrink-0" style={{ color: 'var(--text-light)' }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic mb-2" style={{ color: 'var(--text-light)' }}>Nenhum anexo</p>
                )}
                <input ref={attachFileRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingAttach(p => [...p, { file: f, type: 'proposta' }]); e.target.value = '' } }} />
                <button type="button" onClick={() => attachFileRef.current?.click()}
                  className="w-full py-3 rounded-lg border-2 border-dashed text-xs transition-colors hover:border-[var(--primary)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
                  Clique para adicionar anexo
                </button>
              </div>

              <SecTitle>Financeiro</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Valor do Projeto (R$)</label><input type="number" value={form.project_value} onChange={setF('project_value')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Valor da Hora (R$)</label><input type="number" value={form.hourly_rate} onChange={setF('hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Hora Adicional (R$)</label><input type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Horas Contratadas</label><input type="number" value={form.sold_hours} onChange={setF('sold_hours')} style={iStyle} placeholder="0" step="1" /></div>
                {showApontaveis && (<>
                <div><label style={lStyle}>Percentual Gestão (%)</label><input type="number" value={form.coordinator_hours}
                  onChange={e => { setGestaoDraft(null); setForm(f => ({ ...f, coordinator_hours: e.target.value })) }}
                  style={iStyle} placeholder="0" step="1" min="0" max="100" /></div>
                {(() => {
                  // Horas de Gestão = (Percentual Gestão / 100) × Horas Vendidas (contratadas). Bidirecional.
                  const base = Number(form.sold_hours || 0)
                  const pct  = Number(form.coordinator_hours || 0)
                  const derived = base > 0 ? Math.round((pct / 100) * base * 100) / 100 : 0
                  const shown = gestaoDraft ?? (derived ? String(derived) : '')
                  return (
                    <div>
                      <label style={lStyle}>Horas de Gestão</label>
                      <input type="number" value={shown} min="0" step="0.5" disabled={base <= 0}
                        onChange={e => {
                          const v = e.target.value
                          setGestaoDraft(v)
                          const h = Number(v) || 0
                          if (base > 0) setForm(f => ({ ...f, coordinator_hours: String(Math.round((h / base) * 100 * 100) / 100) }))
                        }}
                        onBlur={() => setGestaoDraft(null)}
                        style={iStyle} placeholder="0" />
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                        {base > 0 ? `${pct || 0}% de ${base}h (vendidas)` : 'Informe Horas Contratadas para calcular'}
                      </p>
                    </div>
                  )
                })()}
                </>)}
                <div><label style={lStyle}>Horas Consultor</label><input type="number" value={form.consultant_hours} onChange={setF('consultant_hours')} style={iStyle} placeholder="0" step="1" /></div>
                {showApontaveis && (<>
                {(() => {
                  // Saving ERPSERV = Horas Vendidas − Consultor − Horas de Gestão (% × Vendidas).
                  const sold = Number(form.sold_hours || 0)
                  const cons = Number(form.consultant_hours || 0)
                  const coordPct = Number(form.coordinator_hours || 0)
                  const gestao = sold > 0 ? (coordPct / 100) * sold : 0
                  const sobra = Math.round((sold - cons - gestao) * 100) / 100
                  return (
                    <div><label style={lStyle}>Saving ERPSERV</label><input type="text" value={isNaN(sobra) ? '—' : `${sobra}h`} readOnly tabIndex={-1} style={{ ...iStyle, opacity: 0.7, cursor: 'default' }} /></div>
                  )
                })()}
                <div>
                  <label style={lStyle}>Horas Apontáveis <span style={{ color: 'var(--danger-border)' }}>*</span></label>
                  <input type="number" value={form.coordination_hours} onChange={setF('coordination_hours')} style={iStyle} placeholder="0" step="0.5" min="0" max={form.sold_hours || undefined} />
                  {form.coordination_hours !== '' && form.sold_hours !== '' && Number(form.coordination_hours) > Number(form.sold_hours) && (
                    <p className="text-[10px] mt-1" style={{ color: 'var(--danger-border)' }}>Não pode exceder as horas vendidas ({form.sold_hours}h).</p>
                  )}
                </div>
                </>)}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                <div className="col-span-2"><label style={{ ...lStyle, marginBottom: 0 }}>Histórico do sistema anterior</label></div>
                <div><label style={lStyle}>Saldo Inicial de Horas</label><input type="number" value={form.initial_hours_balance} onChange={setF('initial_hours_balance')} style={iStyle} placeholder="0" step="0.5" /></div>
                <div><label style={lStyle}>Custo Inicial (R$)</label><input type="number" value={form.initial_cost} onChange={setF('initial_cost')} style={iStyle} placeholder="0.00" step="0.01" /></div>
              </div>

              <SecTitle>Informações Comerciais</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Tipo de Faturamento</label><select value={form.tipo_faturamento} onChange={setF('tipo_faturamento')} style={iStyle}><option value="">Não definido</option><option value="on_demand">On Demand</option><option value="banco_horas_mensal">Banco de Horas Mensal</option><option value="banco_horas_fixo">Banco de Horas Fixo</option><option value="por_servico">Por Serviço</option><option value="saas">SaaS</option></select></div>
                <div><label style={lStyle}>Tipo de Alocação</label><select value={form.tipo_alocacao} onChange={setF('tipo_alocacao')} style={iStyle}><option value="">Não definido</option><option value="remoto">Remoto</option><option value="presencial">Presencial</option><option value="ambos">Ambos</option></select></div>
                <div><label style={lStyle}>Condição de Pagamento</label><input value={form.condicao_pagamento} onChange={setF('condicao_pagamento')} style={iStyle} placeholder="Ex: 30/60/90 dias" /></div>
                <div><label style={lStyle}>Vendedor</label><select value={form.vendedor_id} onChange={setF('vendedor_id')} style={iStyle}><option value="">Não definido</option>{optConsultants.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              </div>
              <div><label style={lStyle}>Observações do Contrato</label><textarea value={form.observacoes_contrato} onChange={setF('observacoes_contrato')} style={{ ...iStyle, resize: 'vertical', minHeight: '56px' }} /></div>

              <SecTitle>Política de Despesas e Apontamentos</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Valor Máx. por Consultor (R$)</label><input type="number" value={form.max_expense_per_consultant} onChange={setF('max_expense_per_consultant')} style={iStyle} placeholder="Ilimitado" min="0" step="0.01" /><p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Vazio = ilimitado</p></div>
                <div><label style={lStyle}>Prazo para Lançamento (dias)</label><input type="number" value={form.timesheet_retroactive_limit_days} onChange={setF('timesheet_retroactive_limit_days')} style={iStyle} placeholder="Padrão global" min="0" max="365" /></div>
              </div>
              <Toggle2 checked={form.allow_negative_balance} onChange={v => setForm(p => ({ ...p, allow_negative_balance: v }))} label="Permitir saldo negativo de horas" />
              {ctNameK.includes('banco de horas fixo') && (
                <Toggle2 checked={form.client_follows_timesheets}
                  onChange={v => setForm(p => ({ ...p, client_follows_timesheets: v }))}
                  label="Cliente acompanha apontamento (se desligado, o cliente não vê os apontamentos e o saldo aparece zerado — tudo consumido)" />
              )}
              <Toggle2
                checked={form.movidesk_integration_enabled}
                onChange={v => setForm(p => ({ ...p, movidesk_integration_enabled: v }))}
                label="Receber integração Movidesk (apontamentos importados deste cliente caem neste projeto)"
              />

              {/* Override de Coordenador (sustentação) — só admin */}
              {(() => {
                const stName = (optServiceTypes.find(s => s.id === Number(form.service_type_id))?.name ?? '').toLowerCase()
                const isSustentacao = stName.includes('sustenta')
                if (!isAdmin || !isSustentacao) return null
                return (
                  <div className="rounded-xl p-3 mt-2" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
                    <label style={lStyle} className="block mb-1">Gerenciado por outro coordenador</label>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-light)' }}>
                      Ao selecionar um coordenador, o card sai da fila de sustentação e migra pra fila dele.
                      O projeto também some das abas Apontamentos/Despesas/Aprovações do Portal de Sustentação.
                    </p>
                    <select
                      value={(form as any).kanban_coordinator_override_id ?? ''}
                      onChange={e => setForm(p => ({ ...(p as any), kanban_coordinator_override_id: e.target.value }))}
                      style={iStyle}
                    >
                      <option value="">— Nenhum (segue fluxo padrão de sustentação) —</option>
                      {optCoordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )
              })()}
            </div>

            <div className="flex flex-col">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>Equipe Alocada</p>
              <div className="flex gap-1 mb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                {([['coord','Coordenadores',(form as any).kanban_coordinator_override_id ? 1 : form.coordinator_ids.length],['consult','Consultores',form.consultant_ids.length],['group','Grupos',form.consultant_group_ids.length]] as const).map(([id,label,count]) => (
                  <button key={id} onClick={() => { setTeamTab(id); setTeamSearch('') }}
                    className="px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                    style={{ color: teamTab === id ? 'var(--text)' : 'var(--text-muted)', borderBottom: teamTab === id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-1px' }}>
                    {label}{count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{count}</span>}
                  </button>
                ))}
              </div>
              {teamTab !== 'coord' && (
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Buscar..."
                  className="w-full text-xs px-3 py-2 rounded-xl outline-none mb-2"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              )}
              <div className="flex-1 overflow-y-auto space-y-1 rounded-xl p-2" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', maxHeight: 520 }}>
                {teamTab === 'coord' && (() => {
                  // Coordenador efetivo = override do Kanban tem precedência sobre a lista M2M
                  // (mesma regra do Kanban de Contratos: override ?? coordinator_ids).
                  const overrideId = (form as any).kanban_coordinator_override_id ? Number((form as any).kanban_coordinator_override_id) : null
                  const effectiveCoordIds = overrideId != null ? [overrideId] : form.coordinator_ids
                  return (
                  <div className="px-1 py-1">
                    {effectiveCoordIds.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum coordenador definido.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveCoordIds.map(cid => {
                          const c = optCoordinators.find(o => o.id === cid)
                          return <span key={cid} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{c?.name ?? (d as any).kanban_coordinator?.name ?? `#${cid}`}</span>
                        })}
                      </div>
                    )}
                    <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--text-light)' }}>🔒 O coordenador é definido no Kanban de Contratos e não pode ser editado aqui.</p>
                  </div>
                  )
                })()}
                {teamTab === 'consult' && filteredConsults.map(c => {
                  const sel = form.consultant_ids.includes(c.id)
                  return <button key={c.id} onClick={() => setForm(p => ({ ...p, consultant_ids: toggleId(p.consultant_ids, c.id) }))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-hover)]" style={{ background: sel ? 'rgba(139,92,246,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(139,92,246,0.25)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(139,92,246,0.2)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}>{sel && <Check size={10} style={{ color: 'var(--brand-purple)' }} />}</div>
                    <span className="text-xs" style={{ color: sel ? 'var(--brand-purple)' : 'var(--text)' }}>{c.name}</span>
                  </button>
                })}
                {teamTab === 'group' && filteredGroups.map(g => {
                  const sel = form.consultant_group_ids.includes(g.id)
                  return <button key={g.id} onClick={() => setForm(p => ({ ...p, consultant_group_ids: toggleId(p.consultant_group_ids, g.id) }))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-hover)]" style={{ background: sel ? 'var(--warning-bg)' : 'transparent', border: `1px solid ${sel ? 'var(--warning-border)' : 'transparent'}` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'var(--warning-bg)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}>{sel && <Check size={10} style={{ color: 'var(--warning-border)' }} />}</div>
                    <span className="text-xs" style={{ color: sel ? 'var(--warning-border)' : 'var(--text)' }}>{g.name}</span>
                  </button>
                })}
                {teamTab === 'consult' && filteredConsults.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>}
                {teamTab === 'group' && filteredGroups.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: saving ? 'var(--primary-soft)' : 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Fluxo de troca de integração Movidesk (modais in-app) */}
      {movideskConflict && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Integração Movidesk</p>

            {movideskStep === 'confirm' && (
              <>
                <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                  Cliente já tem a integração ativa em <strong style={{ color: 'var(--text)' }}>{movideskConflict.current?.code ?? ''} {movideskConflict.current?.name ?? ''}</strong>. Deseja mudar a integração para este projeto?
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => setMovideskConflict(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                  <button onClick={() => setMovideskStep('migrate')} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }}>Sim, mudar</button>
                </div>
              </>
            )}

            {movideskStep === 'migrate' && (
              <>
                <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                  Deseja migrar os apontamentos de origem Movidesk de <strong style={{ color: 'var(--text)' }}>{movideskConflict.current?.code ?? ''} {movideskConflict.current?.name ?? ''}</strong> para este projeto? (somente os apontamentos importados do Movidesk são movidos)
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => submitMovideskSwap(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Não migrar</button>
                  <button onClick={() => submitMovideskSwap(true)} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }}>Sim, migrar</button>
                </div>
              </>
            )}

            {movideskStep === 'processing' && (
              <>
                <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>{movideskMigrating ? 'Migrando apontamentos...' : 'Salvando...'}</p>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full w-1/3 rounded-full animate-[mvProgress_1.1s_ease-in-out_infinite]" style={{ background: 'var(--primary)' }} />
                </div>
                <style>{`@keyframes mvProgress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
