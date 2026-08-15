'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Clock, ClipboardCheck, Receipt, Eye, Check, RotateCcw, XCircle, Webhook, Globe, Headphones } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useApiQuery } from '@/hooks/use-query'
import { useProjectSchedule } from '@/hooks/use-project-schedule'
import { useAuth } from '@/hooks/use-auth'
import { RowMenu, type RowMenuItem } from '@/components/ui/row-menu'
import { TimesheetViewModal } from '@/components/ui/timesheet-view-modal'
import { TimesheetHoverTooltip, useTimesheetHover } from '@/components/ui/timesheet-hover-tooltip'
import type { Timesheet } from '@/types'

// ─── helpers ────────────────────────────────────────────────────────────────────
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const fmtH = (h: number) => (h >= 100 ? `${Math.round(h)}h` : `${(Math.round(h * 10) / 10)}h`)
const fmtDate = (iso?: string | null) => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const hhmm = (t?: string | null) => t ? String(t).slice(0, 5) : '—'
// Tempo/total sempre em DECIMAL (ex.: 4h00 → 4 ; 0h30 → 0,5). Mesma regra da tela global.
const fmtMin = (min?: number | null) => (n(min) / 60).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
// Consumo do ticket por faixa: <4h verde | 4-8h amarelo | 8-12h laranja | >12h vermelho
const ticketColor = (min: number) => min < 240 ? 'var(--success-border)' : min < 720 ? 'var(--warning-border)' : 'var(--danger-border)'

const TS_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado', adjustment_requested: 'Ajuste',
  conflicted: 'Conflito', internal: 'Ação Interna', released: 'Liberado', late: 'Atrasado',
}
const tsStatusCls = (s: string) =>
  ['approved', 'released'].includes(s) ? 'ds-status-success'
    : s === 'rejected' ? 'ds-status-danger'
      : ['pending', 'adjustment_requested', 'conflicted', 'late'].includes(s) ? 'ds-status-warning'
        : 'ds-status-info'

type View = 'apontamentos' | 'aprovacoes' | 'despesas'
const VIEWS: View[] = ['apontamentos', 'aprovacoes', 'despesas']
function normalizeView(v: string | null): View {
  return (VIEWS as string[]).includes(String(v)) ? (v as View) : 'apontamentos'
}

// ─── badges ─────────────────────────────────────────────────────────────────────
function StatusPill({ status, display }: { status: string; display?: string | null }) {
  return <span className={`ds-status ${tsStatusCls(status)}`} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{display ?? TS_STATUS_LABEL[status] ?? status}</span>
}
function OriginBadge({ origin }: { origin?: string | null }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' } as const
  if (origin === 'help_desk') return <span style={{ ...base, background: 'rgba(20,184,166,0.14)', color: '#14b8a6' }}><Headphones size={10} /> Help Desk</span>
  if (origin === 'webhook' || origin === 'movidesk' || origin === 'integration') return <span style={{ ...base, background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}><Webhook size={10} /> Movidesk</span>
  return <span style={{ ...base, background: 'var(--primary-soft)', color: 'var(--primary)' }}><Globe size={10} /> Web</span>
}

// ─── mini KPI ───────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, tone = 'default' }: { label: string; value: string | number; sub?: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const c = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : tone === 'primary' ? 'var(--primary)' : 'var(--text)'
  return (
    <div style={{ flex: '1 1 0', minWidth: 110, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: c, lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{sub}</div>}
    </div>
  )
}

// ─── SegmentedControl ────────────────────────────────────────────────────────────
function Seg({ current, onChange, hideAprovacoes = false }: { current: View; onChange: (v: View) => void; hideAprovacoes?: boolean }) {
  const items = ([
    { id: 'apontamentos', label: 'Apontamentos', icon: <Clock size={13} /> },
    { id: 'aprovacoes', label: 'Aprovações', icon: <ClipboardCheck size={13} /> },
    { id: 'despesas', label: 'Despesas', icon: <Receipt size={13} /> },
  ] as { id: View; label: string; icon: React.ReactNode }[]).filter(it => !(hideAprovacoes && it.id === 'aprovacoes')) // consultor não vê Aprovações
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      {items.map(it => {
        const active = current === it.id
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: active ? 700 : 500, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text-muted)', boxShadow: active ? '0 1px 3px rgba(0,0,0,.18)' : 'none', transition: 'background .12s, color .12s' }}>
            {it.icon} {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── accordion de atividade ──────────────────────────────────────────────────────
function ActivityAccordion({
  title, stageName, responsible, planned, apontadas, count, pending, headerRight, children, defaultOpen = false,
}: {
  title: string; stageName?: string; responsible?: string | null
  planned: number; apontadas: number; count: number; pending: number
  headerRight?: React.ReactNode; children: () => React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const saldo = planned - apontadas
  const pct = planned > 0 ? Math.min(100, (apontadas / planned) * 100) : 0
  const pctColor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={16} style={{ color: 'var(--text-light)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stageName && <span>{stageName}</span>}
            {responsible && <span>👤 {responsible}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: pctColor }}>{fmtH(apontadas)} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>/ {fmtH(planned)}</span></div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>saldo {fmtH(saldo)} · {Math.round(pct)}%</div>
          </div>
          <div style={{ width: 64, height: 6, background: 'var(--surface-hover)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pctColor }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span className="ds-status ds-status-info" style={{ fontSize: 11 }}>{count} apont.</span>
            {pending > 0 && <span className="ds-status ds-status-warning" style={{ fontSize: 11 }}>{pending} pend.</span>}
          </div>
          {headerRight}
        </div>
      </button>
      {open && <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>{children()}</div>}
    </div>
  )
}

// ─── tabela rica (mesmo formato da tela global) ──────────────────────────────────
const TH: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', whiteSpace: 'nowrap', background: 'var(--surface-sunken)' }
const TD: React.CSSProperties = { padding: '7px 10px', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 12 }

function RichTable({ rows, hover, buildMenu, onRowClick }: {
  rows: Timesheet[]
  hover: ReturnType<typeof useTimesheetHover>
  buildMenu: (t: Timesheet) => RowMenuItem[]
  onRowClick: (t: Timesheet) => void
}) {
  if (rows.length === 0) return <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>Nenhum apontamento nesta atividade.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 34 }} />
            <th style={{ ...TH, textAlign: 'center', background: 'var(--primary-soft)', borderLeft: '2px solid var(--primary)', borderRight: '2px solid var(--primary)' }}>Hist. de Hs Tikets</th>
            <th style={TH}>Status</th>
            <th style={TH}>Colaborador</th>
            <th style={TH}>Data</th>
            <th style={TH}>Início</th>
            <th style={TH}>Fim</th>
            <th style={{ ...TH, textAlign: 'right' }}>Tempo</th>
            <th style={TH}>Ticket #</th>
            <th style={TH}>Origem</th>
            <th style={TH}>Cliente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => {
            const ta = t as any
            return (
              <tr key={t.id} onClick={() => onRowClick(t)}
                style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => { hover.bind(t as any).onMouseEnter(); (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                onMouseLeave={e => { hover.bind(t as any).onMouseLeave(); (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <td style={{ ...TD, width: 34 }} onClick={e => e.stopPropagation()}>
                  <RowMenu items={buildMenu(t)} />
                </td>
                <td style={{ ...TD, textAlign: 'center', fontFamily: 'monospace', background: 'var(--primary-soft)', borderLeft: '2px solid var(--primary)', borderRight: '2px solid var(--primary)' }}>
                  {ta.ticket_total_minutes != null
                    ? <span style={{ color: ticketColor(n(ta.ticket_total_minutes)), fontWeight: 700 }}>{fmtMin(ta.ticket_total_minutes)}</span>
                    : <span style={{ color: 'var(--text-light)' }}>—</span>}
                </td>
                <td style={TD}><StatusPill status={t.status} display={ta.status_display} /></td>
                <td style={{ ...TD, fontWeight: 500 }}>{t.user?.name ?? '—'}</td>
                <td style={TD}>{fmtDate(t.date)}</td>
                <td style={{ ...TD, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{hhmm(ta.start_time)}</td>
                <td style={{ ...TD, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{hhmm(ta.end_time)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{fmtMin(t.effort_minutes)}</td>
                <td style={{ ...TD, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ta.ticket ? `#${ta.ticket}` : '—'}</td>
                <td style={TD}><OriginBadge origin={ta.origin} /></td>
                <td style={{ ...TD, color: 'var(--text-muted)' }}>{t.customer?.name ?? ta.project?.customer?.name ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── modal de motivo (rejeitar / ajuste) ─────────────────────────────────────────
function ReasonModal({ open, title, confirmLabel, danger, onClose, onConfirm }: {
  open: boolean; title: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{title}</h3>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
          placeholder="Descreva o motivo…" className="ds-input"
          style={{ width: '100%', fontSize: 13, padding: '8px 10px', resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 10, fontSize: 13, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => onConfirm(reason.trim())} disabled={!reason.trim()}
            style={{ padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: reason.trim() ? 'pointer' : 'not-allowed', opacity: reason.trim() ? 1 : .5, background: danger ? 'var(--danger)' : 'var(--primary)', color: '#fff' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── grupos por atividade (compartilhado por Apontamentos e Aprovações) ──────────
type Activity = { id: number; title: string; stageName: string; responsible?: { id: number; name: string } | null; planned: number }

function ActivityGroups({ projectId, mode }: { projectId: number; mode: 'view' | 'approve' }) {
  const { stages, loading: schedLoading } = useProjectSchedule(projectId)
  const { data, loading: tsLoading, refetch } = useApiQuery<{ items: Timesheet[] }>(
    Number.isFinite(projectId) ? `/timesheets?project_id=${projectId}&pageSize=100&order=-date,-created_at` : null
  )
  const items = useMemo(() => data?.items ?? [], [data])

  const hover = useTimesheetHover()
  const router = useRouter()
  const [viewTs, setViewTs] = useState<Timesheet | null>(null)
  const [reason, setReason] = useState<{ open: boolean; id: number | null; kind: 'reject' | 'adjust' }>({ open: false, id: null, kind: 'reject' })
  const [actioning, setActioning] = useState<number | null>(null)

  const isPending = (t: Timesheet) => ['pending', 'adjustment_requested'].includes(t.status)

  // agrupa apontamentos por atividade (stage_delivery_id)
  const byActivity = useMemo(() => {
    const g = new Map<number, Timesheet[]>()
    items.forEach(t => {
      const k = (t as any).stage_delivery_id
      if (!k) return
      const arr = g.get(k) ?? []; arr.push(t); g.set(k, arr)
    })
    return g
  }, [items])

  const orfaos = useMemo(() => items.filter(t => !(t as any).stage_delivery_id), [items])

  const activities = useMemo<Activity[]>(() => {
    const rows: Activity[] = []
    stages.forEach((s: any) => (s.deliveries ?? []).forEach((d: any) => rows.push({
      id: d.id, title: d.title, stageName: s.name, responsible: d.responsible ?? null, planned: n(d.hours_planned),
    })))
    return rows
  }, [stages])

  async function approve(id: number) {
    setActioning(id)
    try { await api.post(`/timesheets/${id}/approve`, {}); toast.success('Apontamento aprovado'); refetch() }
    catch { toast.error('Erro ao aprovar') }
    finally { setActioning(null) }
  }
  async function submitReason(reasonText: string) {
    const { id, kind } = reason
    if (!id || !reasonText) return
    setReason({ open: false, id: null, kind })
    setActioning(id)
    try {
      await api.post(`/timesheets/${id}/${kind === 'reject' ? 'reject' : 'request-adjustment'}`, { reason: reasonText })
      toast.success(kind === 'reject' ? 'Apontamento rejeitado' : 'Ajuste solicitado')
      refetch()
    } catch { toast.error('Erro ao processar') }
    finally { setActioning(null) }
  }

  const buildMenu = (t: Timesheet): RowMenuItem[] => {
    const menu: RowMenuItem[] = [{ label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setViewTs(t) }]
    if (mode === 'approve') {
      menu.push(
        { label: 'Aprovar', icon: <Check size={12} />, onClick: () => approve(t.id), disabled: actioning === t.id },
        { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => setReason({ open: true, id: t.id, kind: 'adjust' }) },
        { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => setReason({ open: true, id: t.id, kind: 'reject' }), danger: true },
      )
    }
    return menu
  }

  if (schedLoading || tsLoading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div>

  // Aprovações: só atividades com pendências; Apontamentos: todas.
  const visible = mode === 'approve'
    ? activities.filter(a => (byActivity.get(a.id) ?? []).some(isPending))
    : activities

  const totalPend = items.filter(isPending).length

  return (
    <div>
      {mode === 'approve' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Kpi label="Pendentes de aprovação" value={totalPend} tone={totalPend > 0 ? 'warning' : 'success'} />
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
          {mode === 'approve' ? 'Nenhum apontamento pendente neste projeto. ✅' : 'Este projeto ainda não tem atividades no cronograma.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(a => {
            const all = byActivity.get(a.id) ?? []
            const rows = mode === 'approve' ? all.filter(isPending) : all
            const apontadas = all.reduce((s, t) => s + n(t.effort_minutes) / 60, 0)
            const pending = all.filter(isPending).length
            return (
              <ActivityAccordion key={a.id} title={a.title} stageName={a.stageName} responsible={a.responsible?.name}
                planned={a.planned} apontadas={apontadas} count={all.length} pending={pending}>
                {() => <RichTable rows={rows} hover={hover} buildMenu={buildMenu} onRowClick={setViewTs} />}
              </ActivityAccordion>
            )
          })}

          {mode === 'view' && orfaos.length > 0 && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px' }}>
                <strong style={{ color: 'var(--warning)' }}>{orfaos.length}</strong> apontamento(s) sem atividade — lançados antes do cronograma.
              </div>
              <RichTable rows={orfaos} hover={hover} buildMenu={buildMenu} onRowClick={setViewTs} />
            </div>
          )}
        </div>
      )}

      <TimesheetHoverTooltip ts={hover.ts} />
      {viewTs && (
        <TimesheetViewModal ts={viewTs} onClose={() => setViewTs(null)}
          onEdit={() => { const id = viewTs.id; setViewTs(null); router.push(`/timesheets/${id}/edit`) }} />
      )}
      <ReasonModal
        open={reason.open}
        title={reason.kind === 'reject' ? 'Rejeitar apontamento' : 'Solicitar ajuste'}
        confirmLabel={reason.kind === 'reject' ? 'Rejeitar' : 'Solicitar ajuste'}
        danger={reason.kind === 'reject'}
        onClose={() => setReason(r => ({ ...r, open: false }))}
        onConfirm={submitReason}
      />
    </div>
  )
}

// ─── aprovação de despesas (flat — despesa é do projeto, sem atividade) ──────────
function ExpenseApprovals({ projectId }: { projectId: number }) {
  const { data, loading, refetch } = useApiQuery<{ items: any[] }>(
    Number.isFinite(projectId) ? `/expenses?project_id=${projectId}&pageSize=100&order=-expense_date` : null
  )
  const items = data?.items ?? []
  const pend = items.filter(e => e.status === 'pending' || e.status === 'adjustment_requested')
  const [reason, setReason] = useState<{ open: boolean; id: number | null; kind: 'reject' | 'adjust' }>({ open: false, id: null, kind: 'reject' })
  const [actioning, setActioning] = useState<number | null>(null)
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  async function approve(id: number, charge: boolean) {
    setActioning(id)
    try { await api.post(`/expenses/${id}/approve`, { charge_client: charge }); toast.success('Despesa aprovada'); refetch() }
    catch { toast.error('Erro ao aprovar') }
    finally { setActioning(null) }
  }
  async function submitReason(text: string) {
    const { id, kind } = reason
    if (!id || !text) return
    setReason({ open: false, id: null, kind })
    setActioning(id)
    try { await api.post(`/expenses/${id}/${kind === 'reject' ? 'reject' : 'request-adjustment'}`, { reason: text }); toast.success(kind === 'reject' ? 'Despesa rejeitada' : 'Ajuste solicitado'); refetch() }
    catch { toast.error('Erro ao processar') }
    finally { setActioning(null) }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Kpi label="Despesas pendentes" value={pend.length} tone={pend.length > 0 ? 'warning' : 'success'} />
      </div>
      {pend.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma despesa pendente neste projeto. ✅</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {pend.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div onClick={ev => ev.stopPropagation()}>
                <RowMenu items={[
                  { label: 'Aprovar (cobrar cliente)', icon: <Check size={12} />, onClick: () => approve(e.id, true), disabled: actioning === e.id },
                  { label: 'Aprovar (não cobrar)', icon: <Check size={12} />, onClick: () => approve(e.id, false), disabled: actioning === e.id },
                  { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => setReason({ open: true, id: e.id, kind: 'adjust' }) },
                  { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => setReason({ open: true, id: e.id, kind: 'reject' }), danger: true },
                ]} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.user?.name ?? '—'} · {fmtDate(e.expense_date)}{e.category?.name ? ` · ${e.category.name}` : ''}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(n(e.amount))}</span>
              <span className="ds-status ds-status-warning" style={{ fontSize: 11 }}>{e.status_display ?? e.status}</span>
            </div>
          ))}
        </div>
      )}
      <ReasonModal open={reason.open}
        title={reason.kind === 'reject' ? 'Rejeitar despesa' : 'Solicitar ajuste'}
        confirmLabel={reason.kind === 'reject' ? 'Rejeitar' : 'Solicitar ajuste'}
        danger={reason.kind === 'reject'}
        onClose={() => setReason(r => ({ ...r, open: false }))}
        onConfirm={submitReason} />
    </div>
  )
}

// ─── APROVAÇÕES — toggle Horas | Despesas ────────────────────────────────────────
function AprovacoesView({ projectId }: { projectId: number }) {
  const [sub, setSub] = useState<'horas' | 'despesas'>('horas')
  const btn = (id: 'horas' | 'despesas', label: string, icon: React.ReactNode) => {
    const active = sub === id
    return (
      <button type="button" onClick={() => setSub(id)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: active ? 700 : 500, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text-muted)' }}>
        {icon} {label}
      </button>
    )
  }
  return (
    <div>
      <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface-sunken)', border: '1px solid var(--border)', marginBottom: 12 }}>
        {btn('horas', 'Horas', <Clock size={13} />)}
        {btn('despesas', 'Despesas', <Receipt size={13} />)}
      </div>
      {sub === 'horas' ? <ActivityGroups projectId={projectId} mode="approve" /> : <ExpenseApprovals projectId={projectId} />}
    </div>
  )
}

// ─── DESPESAS (do projeto — sem vínculo com atividade, por definição) ────────────
function DespesasView({ projectId }: { projectId: number }) {
  const { data, loading } = useApiQuery<{ items: any[] }>(
    Number.isFinite(projectId) ? `/expenses?project_id=${projectId}&pageSize=100&order=-expense_date` : null
  )
  const items = data?.items ?? []
  const total = items.reduce((s, e) => s + n(e.amount), 0)
  const pend = items.filter(e => e.status === 'pending' || e.status === 'adjustment_requested')
  const aprov = items.filter(e => e.status === 'approved')
  const rej = items.filter(e => e.status === 'rejected')
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
        <Kpi label="Valor total" value={fmtBRL(total)} />
        <Kpi label="Quantidade" value={items.length} />
        <Kpi label="Pendentes" value={pend.length} tone={pend.length > 0 ? 'warning' : 'default'} />
        <Kpi label="Aprovadas" value={aprov.length} tone="success" />
        <Kpi label="Reprovadas" value={rej.length} tone={rej.length > 0 ? 'danger' : 'default'} />
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sem despesas neste projeto.</div>
        ) : items.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.user?.name ?? '—'} · {fmtDate(e.expense_date)}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(n(e.amount))}</span>
            <span className={`ds-status ${e.status === 'approved' ? 'ds-status-success' : e.status === 'rejected' ? 'ds-status-danger' : 'ds-status-warning'}`} style={{ fontSize: 11 }}>{e.status_display ?? e.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── página ─────────────────────────────────────────────────────────────────────
export default function GestaoOperacionalPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = Number(params.id)
  const { user } = useAuth()
  const isConsultor = user?.type === 'consultor'
  const rawView = normalizeView(searchParams.get('view'))
  // Consultor não acessa Aprovações — cai em Apontamentos (mesmo entrando pela URL ?view=aprovacoes).
  const view = isConsultor && rawView === 'aprovacoes' ? 'apontamentos' : rawView
  const setView = (v: View) => router.replace(`/projetos/${projectId}/gestao-operacional?view=${v}`)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <Seg current={view} onChange={setView} hideAprovacoes={isConsultor} />
        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Visão contextual deste projeto — reflete nas telas globais.</span>
      </div>
      {view === 'apontamentos' && <ActivityGroups projectId={projectId} mode="view" />}
      {view === 'aprovacoes' && !isConsultor && <AprovacoesView projectId={projectId} />}
      {view === 'despesas' && <DespesasView projectId={projectId} />}
    </div>
  )
}
