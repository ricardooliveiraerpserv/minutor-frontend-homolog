'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Clock, ClipboardCheck, Receipt } from 'lucide-react'
import { useApiQuery } from '@/hooks/use-query'
import { TimesheetsScreen } from '@/components/screens/TimesheetsScreen'
import { ApprovalsScreen } from '@/components/screens/ApprovalsScreen'

// ─── helpers ────────────────────────────────────────────────────────────────────
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const fmtDate = (iso?: string | null) => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

type View = 'apontamentos' | 'aprovacoes' | 'despesas'
const VIEWS: View[] = ['apontamentos', 'aprovacoes', 'despesas']
function normalizeView(v: string | null): View {
  return (VIEWS as string[]).includes(String(v)) ? (v as View) : 'apontamentos'
}

// ─── mini KPI (padrão dos indicadores do cronograma) ────────────────────────────
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

// ─── SegmentedControl (troca de aba do módulo) ──────────────────────────────────
function Seg({ current, onChange }: { current: View; onChange: (v: View) => void }) {
  const items: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'apontamentos', label: 'Apontamentos', icon: <Clock size={13} /> },
    { id: 'aprovacoes', label: 'Aprovações', icon: <ClipboardCheck size={13} /> },
    { id: 'despesas', label: 'Despesas', icon: <Receipt size={13} /> },
  ]
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      {items.map(it => {
        const active = current === it.id
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)}
            className={active ? 'ds-tab-active' : 'ds-tab-inactive'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: active ? 600 : 500, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-muted)', boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}>
            {it.icon} {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── APONTAMENTOS — mesma lista global (hover, hist. de hs, clique abre o apontamento) ──
function ApontamentosView({ projectId }: { projectId: number }) {
  return <TimesheetsScreen embedded lockedProjectId={projectId} />
}

// ─── APROVAÇÕES — mesma fila global (ações no menu 3 pontinhos + hover) ──────────
function AprovacoesView({ projectId }: { projectId: number }) {
  return <ApprovalsScreen embedded lockedProjectId={projectId} />
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
  const view = normalizeView(searchParams.get('view'))
  const setView = (v: View) => router.replace(`/projetos/${projectId}/gestao-operacional?view=${v}`)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <Seg current={view} onChange={setView} />
        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Visão contextual deste projeto — reflete nas telas globais.</span>
      </div>
      {view === 'apontamentos' && <ApontamentosView projectId={projectId} />}
      {view === 'aprovacoes' && <AprovacoesView projectId={projectId} />}
      {view === 'despesas' && <DespesasView projectId={projectId} />}
    </div>
  )
}
