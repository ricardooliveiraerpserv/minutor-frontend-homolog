'use client'

import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/app-layout'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Clock, Receipt, CheckSquare, Plus, AlertTriangle,
  TrendingUp, FolderOpen, Users, X, ChevronRight,
  DollarSign, CreditCard,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TsItem  { effort_minutes: number; status: string; date: string; project?: { name: string }; effort_hours?: string }
interface ExpItem { amount: number | string; status: string; expense_date?: string; description?: string; project?: { name: string }; formatted_amount?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHours(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function sumMin(items: TsItem[])  { return items.reduce((a, t) => a + (t.effort_minutes ?? 0), 0) }
function sumAmt(items: ExpItem[]) { return items.reduce((a, e) => a + (parseFloat(String(e.amount)) || 0), 0) }

function todayISO() { return new Date().toISOString().split('T')[0] }

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  return { start, end }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, loading, onClick,
}: {
  label: string; value: string; sub?: string; loading: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-4 transition-colors ${onClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
      {loading
        ? <Skeleton className="h-6 w-20 mb-1" />
        : <p className="text-xl font-bold" style={{ color: 'var(--brand-text)' }}>{value}</p>
      }
      {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>{sub}</p>}
    </div>
  )
}

function AlertRow({
  icon: Icon, color, message, action, href,
}: {
  icon: React.ElementType; color: string; message: React.ReactNode; action: string; href: string
}) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors group">
      <div className="flex items-center gap-2.5">
        <Icon size={13} style={{ color }} className="shrink-0" />
        <span className="text-sm" style={{ color: 'var(--brand-text)' }}>{message}</span>
      </div>
      <span className="text-xs font-semibold flex items-center gap-1 group-hover:gap-1.5 transition-all" style={{ color }}>
        {action} <ChevronRight size={11} />
      </span>
    </Link>
  )
}

function RecentRow({ left, leftSub, right, badge }: { left: string; leftSub?: string; right: string; badge: string }) {
  const badgeColor =
    badge === 'approved'  ? { bg: 'rgba(34,197,94,0.1)',  text: '#22c55e', label: 'Aprovado' } :
    badge === 'rejected'  ? { bg: 'rgba(239,68,68,0.1)',  text: '#ef4444', label: 'Reprovado' } :
    badge === 'pending'   ? { bg: 'rgba(234,179,8,0.1)',  text: '#eab308', label: 'Pendente' } :
    badge === 'adjustment_requested' ? { bg: 'rgba(249,115,22,0.1)', text: '#f97316', label: 'Ajuste' } :
                            { bg: 'rgba(113,113,122,0.1)', text: '#71717a', label: badge }
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b last:border-0" style={{ borderColor: 'var(--brand-border)' }}>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--brand-text)' }}>{left}</p>
        {leftSub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{leftSub}</p>}
      </div>
      <div className="flex items-center gap-2.5 shrink-0 ml-3">
        <span className="text-xs font-semibold font-mono" style={{ color: 'var(--brand-muted)' }}>{right}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: badgeColor.bg, color: badgeColor.text }}>
          {badgeColor.label}
        </span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // ── Admin state ──
  const [adminPendingTs,  setAdminPendingTs]  = useState(0)
  const [adminPendingExp, setAdminPendingExp] = useState(0)
  const [adminTodayMin,   setAdminTodayMin]   = useState(0)
  const [adminMonthMin,   setAdminMonthMin]   = useState(0)
  const [adminActiveUsers,setAdminActiveUsers]= useState(0)
  const [adminRecentTs,   setAdminRecentTs]   = useState<TsItem[]>([])
  const [adminLoading,    setAdminLoading]    = useState(false)

  // ── Administrativo state ──
  const [admPendingTs,     setAdmPendingTs]     = useState(0)
  const [admPendingExp,    setAdmPendingExp]    = useState(0)
  const [admUnpaidExp,     setAdmUnpaidExp]     = useState(0)
  const [admValorFaturar,  setAdmValorFaturar]  = useState(0)
  const [admValorPagar,    setAdmValorPagar]    = useState(0)
  const [admLoading,       setAdmLoading]       = useState(false)

  // ── Consultant state ──
  const [todayTs,    setTodayTs]    = useState<TsItem[]>([])
  const [monthTs,    setMonthTs]    = useState<TsItem[]>([])
  const [pendingTs,  setPendingTs]  = useState<TsItem[]>([])
  const [rejectedTs, setRejectedTs] = useState<TsItem[]>([])
  const [monthExp,   setMonthExp]   = useState<ExpItem[]>([])
  const [pendingExp, setPendingExp] = useState<ExpItem[]>([])
  const [recentTs,   setRecentTs]   = useState<TsItem[]>([])
  const [recentExp,  setRecentExp]  = useState<ExpItem[]>([])
  const [conLoading, setConLoading] = useState(false)

  const isAdmin          = user?.type === 'admin' || user?.type === 'coordenador'
  const isAdministrativo = user?.type === 'administrativo'
  const isConsultor      = user?.type === 'consultor' || user?.type === 'parceiro_admin'

  // ── Load admin data ──
  useEffect(() => {
    if (authLoading || !user || !isAdmin) return
    const today = todayISO()
    const month = getMonthRange()
    setAdminLoading(true)
    Promise.allSettled([
      api.get<any>(`/approvals/pending`),
      api.get<any>(`/timesheets?start_date=${today}&end_date=${today}&pageSize=50`),
      api.get<any>(`/timesheets?start_date=${month.start}&end_date=${month.end}&pageSize=30`),
    ]).then(([approvals, todayTs, monthTs]) => {
      const a = approvals.status === 'fulfilled' ? approvals.value : null
      const t = todayTs.status  === 'fulfilled' ? todayTs.value  : null
      const m = monthTs.status  === 'fulfilled' ? monthTs.value  : null
      setAdminPendingTs(a?.data?.summary?.total_timesheets ?? a?.total_timesheets ?? 0)
      setAdminPendingExp(a?.data?.summary?.total_expenses  ?? a?.total_expenses  ?? 0)
      setAdminTodayMin(sumMin(t?.items ?? []))
      setAdminMonthMin(sumMin(m?.items ?? []))
      setAdminRecentTs((m?.items ?? []).slice(0, 6))
    }).finally(() => setAdminLoading(false))
  }, [user, authLoading, isAdmin])

  // ── Load administrativo data ──
  useEffect(() => {
    if (authLoading || !user || !isAdministrativo) return
    const now  = new Date()
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setAdmLoading(true)
    Promise.allSettled([
      api.get<any>('/approvals/pending'),
      api.get<any>('/expenses?status=approved&is_paid=false&pageSize=500'),
      api.get<any>(`/fechamento/${yearMonth}/consolidado`),
    ]).then(([approvals, unpaidExp, consolidado]) => {
      const v = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : null
      const a = v(approvals)
      const u = v(unpaidExp)
      const c = v(consolidado)
      setAdmPendingTs(a?.data?.summary?.total_timesheets ?? a?.total_timesheets ?? 0)
      setAdmPendingExp(a?.data?.summary?.total_expenses  ?? a?.total_expenses  ?? 0)
      setAdmUnpaidExp(sumAmt(u?.items ?? []))
      setAdmValorFaturar(c?.data?.total_receita ?? 0)
      setAdmValorPagar(
        (c?.data?.total_custo_interno ?? 0) + (c?.data?.total_custo_parceiros ?? 0)
      )
    }).finally(() => setAdmLoading(false))
  }, [user, authLoading, isAdministrativo])

  // ── Load consultant data ──
  useEffect(() => {
    if (authLoading || !user || !isConsultor) return
    const today = todayISO()
    const month = getMonthRange()
    const uid   = user.id
    setConLoading(true)
    Promise.allSettled([
      api.get<any>(`/timesheets?start_date=${today}&end_date=${today}&pageSize=30&user_id=${uid}`),
      api.get<any>(`/timesheets?start_date=${month.start}&end_date=${month.end}&pageSize=50&user_id=${uid}`),
      api.get<any>(`/timesheets?status=pending&pageSize=30&user_id=${uid}`),
      api.get<any>(`/timesheets?status=rejected&pageSize=30&user_id=${uid}`),
      api.get<any>(`/expenses?start_date=${month.start}&end_date=${month.end}&pageSize=50&user_id=${uid}`),
      api.get<any>(`/expenses?status=pending&pageSize=30&user_id=${uid}`),
    ]).then(([todayR, monthR, pendR, rejR, expR, pendExpR]) => {
      const v = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : null
      setTodayTs(v(todayR)?.items ?? [])
      setMonthTs(v(monthR)?.items ?? [])
      setPendingTs(v(pendR)?.items ?? [])
      setRejectedTs(v(rejR)?.items ?? [])
      setMonthExp(v(expR)?.items ?? [])
      setPendingExp(v(pendExpR)?.items ?? [])
      setRecentTs((v(monthR)?.items ?? []).slice(0, 5))
      setRecentExp((v(expR)?.items ?? []).slice(0, 5))
    }).finally(() => setConLoading(false))
  }, [user, authLoading, isConsultor])

  const loading = authLoading || adminLoading || conLoading || admLoading

  // ── Computed ──
  const todayMin    = sumMin(todayTs)
  const monthMin    = sumMin(monthTs)
  const monthExpAmt = sumAmt(monthExp)
  const hasTodayTs  = todayTs.length > 0

  const hasAlerts = isAdmin
    ? adminPendingTs > 0 || adminPendingExp > 0
    : pendingTs.length > 0 || rejectedTs.length > 0 || pendingExp.length > 0

  // ── Admin alert row for adjustment_requested ──
  const adjustmentTs = monthTs.filter(t => t.status === 'adjustment_requested')

  return (
    <AppLayout title="Início">
      <div className="space-y-5 max-w-5xl">

        {/* ── Saudação ── */}
        {user && !loading && (
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text)' }}>
              Olá, {user.name.split(' ')[0]} 👋
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
              {isAdmin          ? 'Visão operacional do sistema'
              : isAdministrativo ? `Hoje é ${fmtDate(todayISO())} — resumo financeiro e operacional`
              : `Hoje é ${fmtDate(todayISO())} — veja o que precisa de atenção`}
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ ADMIN ══ */}
        {isAdmin && (
          <>
            {/* ── CTAs ── */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/approvals" className="flex-1">
                <div
                  className="flex items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] w-full"
                  style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
                >
                  <CheckSquare size={15} />
                  Revisar aprovações
                  {!loading && (adminPendingTs + adminPendingExp) > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-black/20">
                      {adminPendingTs + adminPendingExp}
                    </span>
                  )}
                </div>
              </Link>
              <Link href="/timesheets" className="flex-1">
                <div
                  className="flex items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-semibold border transition-all hover:bg-white/[0.04] active:scale-[0.98] w-full"
                  style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                >
                  <Clock size={15} />
                  Ver apontamentos
                </div>
              </Link>
              <Link href="/expenses" className="flex-1">
                <div
                  className="flex items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-semibold border transition-all hover:bg-white/[0.04] active:scale-[0.98] w-full"
                  style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                >
                  <Receipt size={15} />
                  Ver despesas
                </div>
              </Link>
            </div>

            {/* ── Alertas admin ── */}
            {!adminLoading && hasAlerts && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(234,179,8,0.2)', background: 'rgba(234,179,8,0.03)' }}>
                <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(234,179,8,0.12)' }}>
                  <AlertTriangle size={12} className="text-yellow-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400">Requer atenção</span>
                </div>
                {adminPendingTs > 0 && (
                  <AlertRow
                    icon={Clock} color="#eab308"
                    message={<><span className="font-semibold">{adminPendingTs}</span> apontamento{adminPendingTs !== 1 ? 's' : ''} aguardando aprovação</>}
                    action="Aprovar" href="/approvals"
                  />
                )}
                {adminPendingExp > 0 && (
                  <AlertRow
                    icon={Receipt} color="#f97316"
                    message={<><span className="font-semibold">{adminPendingExp}</span> despesa{adminPendingExp !== 1 ? 's' : ''} aguardando aprovação</>}
                    action="Aprovar" href="/approvals"
                  />
                )}
              </div>
            )}

            {/* ── Resumo do dia + mês ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Horas Hoje (total)"      value={adminLoading ? '—' : fmtHours(adminTodayMin)}    loading={adminLoading} />
              <StatCard label="Horas no Mês (total)"    value={adminLoading ? '—' : fmtHours(adminMonthMin)}    loading={adminLoading} />
              <StatCard label="Apontamentos Pendentes"  value={adminLoading ? '—' : String(adminPendingTs)}     loading={adminLoading} />
              <StatCard label="Despesas Pendentes"      value={adminLoading ? '—' : String(adminPendingExp)}    loading={adminLoading} />
            </div>

            {/* ── Recentes (admin) ── */}
            {!adminLoading && adminRecentTs.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Apontamentos Recentes</p>
                  <Link href="/timesheets" className="text-[11px] hover:opacity-80 transition-opacity" style={{ color: 'var(--brand-primary)' }}>Ver todos →</Link>
                </div>
                {adminRecentTs.map((ts, i) => (
                  <RecentRow
                    key={i}
                    left={ts.project?.name ?? '—'}
                    leftSub={fmtDate(ts.date)}
                    right={ts.effort_hours ? `${ts.effort_hours}h` : fmtHours(ts.effort_minutes)}
                    badge={ts.status}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════ ADMINISTRATIVO ══ */}
        {isAdministrativo && (
          <>
            {/* ── Alertas ── */}
            {!admLoading && (admPendingTs > 0 || admPendingExp > 0) && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(234,179,8,0.2)', background: 'rgba(234,179,8,0.03)' }}>
                <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(234,179,8,0.12)' }}>
                  <AlertTriangle size={12} className="text-yellow-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400">Requer atenção</span>
                </div>
                {admPendingTs > 0 && (
                  <AlertRow
                    icon={Clock} color="#eab308"
                    message={<><span className="font-semibold">{admPendingTs}</span> apontamento{admPendingTs !== 1 ? 's' : ''} aguardando aprovação</>}
                    action="Ver apontamentos" href="/timesheets"
                  />
                )}
                {admPendingExp > 0 && (
                  <AlertRow
                    icon={Receipt} color="#f97316"
                    message={<><span className="font-semibold">{admPendingExp}</span> despesa{admPendingExp !== 1 ? 's' : ''} aguardando aprovação</>}
                    action="Ver despesas" href="/expenses"
                  />
                )}
              </div>
            )}

            {/* ── Cards de resumo ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Apontamentos Pendentes"
                value={admLoading ? '—' : String(admPendingTs)}
                sub={admLoading ? undefined : 'aguardando aprovação'}
                loading={admLoading}
                onClick={() => window.location.href = '/timesheets'}
              />
              <StatCard
                label="Despesas Pendentes"
                value={admLoading ? '—' : String(admPendingExp)}
                sub={admLoading ? undefined : 'aguardando aprovação'}
                loading={admLoading}
                onClick={() => window.location.href = '/expenses'}
              />
              <StatCard
                label="Despesas a Pagar"
                value={admLoading ? '—' : formatBRL(admUnpaidExp)}
                sub={admLoading ? undefined : 'aprovadas e não pagas'}
                loading={admLoading}
                onClick={() => window.location.href = '/expenses'}
              />
              <StatCard
                label="Valor a Faturar (mês)"
                value={admLoading ? '—' : formatBRL(admValorFaturar)}
                sub={admLoading ? undefined : 'receita do mês atual'}
                loading={admLoading}
                onClick={() => window.location.href = '/fechamento'}
              />
            </div>

            {/* ── Segunda linha: custo consultores + atalhos ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                className="col-span-1 rounded-xl p-4"
                style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Valor a Pagar (Consultores)</p>
                {admLoading
                  ? <div className="h-6 w-24 rounded bg-zinc-800 animate-pulse" />
                  : <p className="text-xl font-bold" style={{ color: 'var(--brand-text)' }}>{formatBRL(admValorPagar)}</p>
                }
                <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>custo de produção do mês</p>
              </div>

              <Link href="/timesheets" className="col-span-1">
                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-4 h-full border transition-all hover:bg-white/[0.03] active:scale-[0.98]"
                  style={{ border: '1px solid var(--brand-border)' }}
                >
                  <Clock size={16} style={{ color: 'var(--brand-primary)' }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>Apontamentos</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Visualizar e gerenciar</p>
                  </div>
                  <ChevronRight size={13} className="ml-auto" style={{ color: 'var(--brand-subtle)' }} />
                </div>
              </Link>

              <Link href="/expenses" className="col-span-1">
                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-4 h-full border transition-all hover:bg-white/[0.03] active:scale-[0.98]"
                  style={{ border: '1px solid var(--brand-border)' }}
                >
                  <Receipt size={16} style={{ color: 'var(--brand-primary)' }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>Despesas</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Aprovar e pagar</p>
                  </div>
                  <ChevronRight size={13} className="ml-auto" style={{ color: 'var(--brand-subtle)' }} />
                </div>
              </Link>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════ CONSULTOR ══ */}
        {isConsultor && (
          <>
            {/* ── CTAs ── */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/meu-painel" className="flex-1">
                <div
                  className="flex items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] w-full"
                  style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
                >
                  <Plus size={15} />
                  Apontar horas
                </div>
              </Link>
              <Link href="/meu-painel" className="flex-1">
                <div
                  className="flex items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-semibold border transition-all hover:bg-white/[0.04] active:scale-[0.98] w-full"
                  style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                >
                  <Receipt size={15} />
                  Lançar despesa
                </div>
              </Link>
            </div>

            {/* ── Alertas consultor ── */}
            {!loading && hasAlerts && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(234,179,8,0.2)', background: 'rgba(234,179,8,0.03)' }}>
                <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(234,179,8,0.12)' }}>
                  <AlertTriangle size={12} className="text-yellow-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400">Requer atenção</span>
                </div>
                {pendingTs.length > 0 && (
                  <AlertRow
                    icon={Clock} color="#eab308"
                    message={<><span className="font-semibold">{pendingTs.length}</span> apontamento{pendingTs.length !== 1 ? 's' : ''} pendente{pendingTs.length !== 1 ? 's' : ''} de aprovação</>}
                    action="Ver" href="/meu-painel"
                  />
                )}
                {rejectedTs.length > 0 && (
                  <AlertRow
                    icon={X} color="#f87171"
                    message={<><span className="font-semibold text-red-400">{rejectedTs.length}</span> apontamento{rejectedTs.length !== 1 ? 's' : ''} reprovado{rejectedTs.length !== 1 ? 's' : ''}</>}
                    action="Corrigir" href="/meu-painel"
                  />
                )}
                {pendingExp.length > 0 && (
                  <AlertRow
                    icon={Receipt} color="#eab308"
                    message={<><span className="font-semibold">{pendingExp.length}</span> despesa{pendingExp.length !== 1 ? 's' : ''} pendente{pendingExp.length !== 1 ? 's' : ''} de aprovação</>}
                    action="Ver" href="/meu-painel"
                  />
                )}
              </div>
            )}

            {/* ── Status de hoje ── */}
            {!loading && (
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-4"
                style={{ background: 'var(--brand-surface)', border: `1px solid ${hasTodayTs ? 'rgba(34,197,94,0.2)' : 'var(--brand-border)'}` }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasTodayTs ? 'bg-green-500/15' : 'bg-zinc-500/15'}`}>
                    {hasTodayTs
                      ? <Clock size={14} className="text-green-400" />
                      : <AlertTriangle size={14} className="text-zinc-500" />
                    }
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: hasTodayTs ? '#22c55e' : 'var(--brand-muted)' }}>
                      Hoje — {fmtDate(todayISO())}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
                      {hasTodayTs
                        ? `${fmtHours(todayMin)} lançadas em ${todayTs.length} apontamento${todayTs.length !== 1 ? 's' : ''}`
                        : 'Nenhuma hora lançada ainda hoje'
                      }
                    </p>
                  </div>
                </div>
                {!hasTodayTs && (
                  <Link href="/meu-painel">
                    <div
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors hover:opacity-90 cursor-pointer"
                      style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
                    >
                      Lançar agora
                    </div>
                  </Link>
                )}
              </div>
            )}

            {/* ── Resumo do mês (compacto) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Horas no Mês"
                value={loading ? '—' : fmtHours(monthMin)}
                sub={loading ? undefined : `${monthTs.length} apontamento${monthTs.length !== 1 ? 's' : ''}`}
                loading={loading}
              />
              <StatCard
                label="Total Despesas"
                value={loading ? '—' : formatBRL(monthExpAmt)}
                sub={loading ? undefined : `${monthExp.length} lançamento${monthExp.length !== 1 ? 's' : ''}`}
                loading={loading}
              />
              <StatCard
                label="Pendentes"
                value={loading ? '—' : String(pendingTs.length + pendingExp.length)}
                sub={loading ? undefined : `${pendingTs.length} apontamentos · ${pendingExp.length} despesas`}
                loading={loading}
              />
              <StatCard
                label="Reprovados"
                value={loading ? '—' : String(rejectedTs.length)}
                sub={loading ? undefined : rejectedTs.length > 0 ? 'precisam de correção' : 'tudo ok'}
                loading={loading}
              />
            </div>

            {/* ── Recentes consultor ── */}
            {!loading && (recentTs.length > 0 || recentExp.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4">
                {recentTs.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                    <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Apontamentos Recentes</p>
                      <Link href="/meu-painel" className="text-[11px] hover:opacity-80 transition-opacity" style={{ color: 'var(--brand-primary)' }}>Ver todos →</Link>
                    </div>
                    {recentTs.map((ts, i) => (
                      <RecentRow
                        key={i}
                        left={ts.project?.name ?? '—'}
                        leftSub={fmtDate(ts.date)}
                        right={ts.effort_hours ? `${ts.effort_hours}h` : fmtHours(ts.effort_minutes)}
                        badge={ts.status}
                      />
                    ))}
                  </div>
                )}
                {recentExp.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                    <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Despesas Recentes</p>
                      <Link href="/meu-painel" className="text-[11px] hover:opacity-80 transition-opacity" style={{ color: 'var(--brand-primary)' }}>Ver todas →</Link>
                    </div>
                    {recentExp.map((exp, i) => (
                      <RecentRow
                        key={i}
                        left={(exp as any).description ?? '—'}
                        leftSub={exp.expense_date ? fmtDate(exp.expense_date) : undefined}
                        right={(exp as any).formatted_amount ?? formatBRL(parseFloat(String(exp.amount)) || 0)}
                        badge={exp.status}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Loading inicial (só quando ainda não sabe o perfil) ── */}
        {authLoading && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Skeleton className="h-14 flex-1 rounded-xl" />
              <Skeleton className="h-14 flex-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
