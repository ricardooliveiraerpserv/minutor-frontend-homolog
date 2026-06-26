'use client'

import { useState, useEffect } from 'react'
import { formatBRL } from '@/lib/format'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

interface ProjectConsumo { available: number; consumed: number; balance: number; pct: number }
const consumoCache = new Map<number, ProjectConsumo | null>()

/**
 * Barra de consumo de horas do PROJETO (apontáveis / consumidas / saldo) — mesma escala de cores
 * do health do projeto (<70% verde · 70-90% amarelo · >90% vermelho). Carrega via cost-summary
 * (cacheado por projeto). Usada nos tooltips de apontamento e despesa.
 */
function ProjectHoursBar({ projectId }: { projectId?: number | null }) {
  const { user } = useAuth()
  // Consultor (e parceiro) não enxerga consumo/saldo de horas do projeto.
  const hidden = user?.type === 'consultor' || user?.type === 'parceiro_admin'
  const [c, setC] = useState<ProjectConsumo | null>(projectId ? consumoCache.get(projectId) ?? null : null)
  useEffect(() => {
    if (hidden || !projectId) { setC(null); return }
    if (consumoCache.has(projectId)) { setC(consumoCache.get(projectId)!); return }
    let cancel = false
    api.get<any>(`/projects/${projectId}/cost-summary`).then(r => {
      const hs = r?.hours_summary ?? {}
      const available = Number(hs.total_available_hours ?? 0)
      const consumed  = Number(hs.approved_hours ?? 0)
      const data: ProjectConsumo = {
        available, consumed,
        balance: Math.max(0, available - consumed),
        pct: Number(hs.hours_percentage ?? (available > 0 ? (consumed / available) * 100 : 0)),
      }
      consumoCache.set(projectId, data)
      if (!cancel) setC(data)
    }).catch(() => { consumoCache.set(projectId, null); if (!cancel) setC(null) })
    return () => { cancel = true }
  }, [projectId, hidden])

  if (hidden || !c || c.available <= 0) return null
  const pct = Math.min(100, Math.round(c.pct))
  const color = c.pct >= 90 ? '#ef4444' : c.pct >= 70 ? '#f59e0b' : '#22c55e'
  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Horas do projeto</span>
        <span className="text-[11px] font-bold" style={{ color }}>{pct}% consumido</span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span>{fmt(c.consumed)}h consumidas</span>
        <span>saldo {fmt(c.balance)}h</span>
        <span>{fmt(c.available)}h apontáveis</span>
      </div>
    </div>
  )
}

/**
 * Tooltip flutuante (canto superior direito, pointer-events:none) que
 * mostra preview do apontamento ao passar o mouse na linha. Pode receber
 * qualquer objeto com os campos opcionais abaixo — funciona tanto pro
 * Timesheet completo quanto pro shape `{ user_name, customer_name, project_name }`
 * usado no /meu-painel.
 */
export interface TimesheetPreview {
  id?: number | string
  user?: { name?: string } | null
  user_name?: string
  customer?: { name?: string; executive?: { name?: string } | null } | null
  customer_name?: string
  project?: {
    id?: number
    name?: string
    customer?: { name?: string; executive?: { name?: string } | null } | null
    coordinators?: ({ name?: string } | null)[] | null
    kanban_override_coordinator?: { name?: string } | null
  } | null
  project_id?: number
  project_name?: string
  real_project?: { name?: string } | null
  effort_minutes?: number
  ticket?: string | null
  observation?: string | null
  coordinator_label?: string | null
  status?: string | null
  // No endpoint de apontamentos a relação vem serializada como objeto em `reviewed_by`
  // (a coluna int é sobrescrita pela relação); outras telas usam `reviewedBy`.
  reviewed_by?: { name?: string } | number | null
  reviewedBy?: { name?: string } | null
}

export function useTimesheetHover() {
  const [ts, setTs] = useState<TimesheetPreview | null>(null)
  const bind = (item: TimesheetPreview) => ({
    onMouseEnter: () => setTs(item),
    onMouseLeave: () => setTs(null),
  })
  return { ts, bind, clear: () => setTs(null) }
}

function toHHMM(mins: number): string {
  // Duração sempre em DECIMAL (ex.: 1h45 → 1,75).
  return (Number(mins || 0) / 60).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function TimesheetHoverTooltip({ ts }: { ts: TimesheetPreview | null }) {
  if (!ts) return null

  const userName    = ts.user?.name ?? ts.user_name ?? '—'
  const customerName = ts.customer?.name ?? ts.project?.customer?.name ?? ts.customer_name ?? '—'
  const projectName = ts.project?.name ?? ts.project_name ?? '—'
  const horas       = ts.effort_minutes != null ? toHHMM(ts.effort_minutes) : '—'
  // Coordenador efetivo: usa o label resolvido pelo BE (override → coordenadores → coord. de sustentação);
  // fallback pro cálculo local (override / coordenadores do projeto).
  const coordNames  = ts.coordinator_label
    || ts.project?.kanban_override_coordinator?.name
    || (ts.project?.coordinators ?? []).map(c => c?.name).filter(Boolean).join(', ')
  const execName    = ts.project?.customer?.executive?.name ?? ts.customer?.executive?.name ?? ''

  const approverName = (ts.reviewed_by && typeof ts.reviewed_by === 'object' ? ts.reviewed_by.name : undefined)
    ?? ts.reviewedBy?.name ?? ''
  const approverLabel = ts.status === 'approved' ? 'Aprovador' : 'Revisado por'

  const obsText = (ts.observation ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  const obsPreview = obsText.length > 240 ? obsText.slice(0, 240) + '…' : obsText

  return (
    <div
      className="fixed z-40 rounded-lg shadow-2xl pointer-events-none"
      style={{
        top: 80, right: 16, minWidth: 280, maxWidth: 380,
        background: 'var(--surface)', border: '1px solid var(--border)',
        padding: '12px 14px',
      }}
    >
      {ts.id != null && (
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>
          Apontamento #{ts.id}
        </p>
      )}
      <div className="space-y-1 text-xs" style={{ color: 'var(--text)' }}>
        <div><span style={{ color: 'var(--text-muted)' }}>Colaborador:</span> <span className="font-medium">{userName}</span></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Cliente:</span> <span className="font-medium">{customerName}</span></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Projeto:</span> <span className="font-medium">{projectName}</span></div>
        {ts.real_project?.name && (
          <div><span style={{ color: 'var(--text-muted)' }}>Projeto Real:</span> <span className="font-medium">{ts.real_project.name}</span></div>
        )}
        {coordNames && (
          <div><span style={{ color: 'var(--text-muted)' }}>Coordenador:</span> <span className="font-medium">{coordNames}</span></div>
        )}
        {execName && (
          <div><span style={{ color: 'var(--text-muted)' }}>Executivo:</span> <span className="font-medium">{execName}</span></div>
        )}
        <div><span style={{ color: 'var(--text-muted)' }}>Horas:</span> <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{horas}</span></div>
        {ts.ticket && (
          <div><span style={{ color: 'var(--text-muted)' }}>Ticket:</span> <span className="font-medium">#{ts.ticket}</span></div>
        )}
        {approverName && (
          <div><span style={{ color: 'var(--text-muted)' }}>{approverLabel}:</span> <span className="font-medium">{approverName}</span></div>
        )}
        {obsPreview && (
          <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Descrição</p>
            <p className="leading-snug" style={{ color: 'var(--text-muted)' }}>{obsPreview}</p>
          </div>
        )}
        <ProjectHoursBar projectId={ts.project?.id ?? ts.project_id} />
      </div>
    </div>
  )
}

// ─── Tooltip de Despesa (mesmo formato do apontamento, campos de despesa) ────────
export interface ExpensePreview {
  id?: number | string
  user?: { name?: string } | null
  customer?: { name?: string; executive?: { name?: string } | null } | null
  project?: {
    id?: number
    name?: string
    customer?: { name?: string; executive?: { name?: string } | null } | null
    coordinators?: ({ name?: string } | null)[] | null
    kanban_override_coordinator?: { name?: string } | null
  } | null
  project_id?: number
  category?: { name?: string } | null
  amount?: number | string | null
  description?: string | null
  real_project?: { name?: string } | null
  coordinator_label?: string | null
}

export function useExpenseHover() {
  const [exp, setExp] = useState<ExpensePreview | null>(null)
  const bind = (item: ExpensePreview) => ({
    onMouseEnter: () => setExp(item),
    onMouseLeave: () => setExp(null),
  })
  return { exp, bind, clear: () => setExp(null) }
}

export function ExpenseHoverTooltip({ exp }: { exp: ExpensePreview | null }) {
  if (!exp) return null

  const userName     = exp.user?.name ?? '—'
  const customerName = exp.customer?.name ?? exp.project?.customer?.name ?? '—'
  const projectName  = exp.project?.name ?? '—'
  const coordNames   = exp.coordinator_label
    || exp.project?.kanban_override_coordinator?.name
    || (exp.project?.coordinators ?? []).map(c => c?.name).filter(Boolean).join(', ')
  const execName     = exp.project?.customer?.executive?.name ?? exp.customer?.executive?.name ?? ''
  const categoria    = exp.category?.name ?? ''
  const valor        = exp.amount != null ? formatBRL(Number(exp.amount)) : '—'

  const descText = (exp.description ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  const descPreview = descText.length > 240 ? descText.slice(0, 240) + '…' : descText

  return (
    <div
      className="fixed z-40 rounded-lg shadow-2xl pointer-events-none"
      style={{
        top: 80, right: 16, minWidth: 280, maxWidth: 380,
        background: 'var(--surface)', border: '1px solid var(--border)',
        padding: '12px 14px',
      }}
    >
      {exp.id != null && (
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>
          Despesa #{exp.id}
        </p>
      )}
      <div className="space-y-1 text-xs" style={{ color: 'var(--text)' }}>
        <div><span style={{ color: 'var(--text-muted)' }}>Colaborador:</span> <span className="font-medium">{userName}</span></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Cliente:</span> <span className="font-medium">{customerName}</span></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Projeto:</span> <span className="font-medium">{projectName}</span></div>
        {exp.real_project?.name && (
          <div><span style={{ color: 'var(--text-muted)' }}>Projeto Real:</span> <span className="font-medium">{exp.real_project.name}</span></div>
        )}
        {coordNames && (
          <div><span style={{ color: 'var(--text-muted)' }}>Coordenador:</span> <span className="font-medium">{coordNames}</span></div>
        )}
        {execName && (
          <div><span style={{ color: 'var(--text-muted)' }}>Executivo:</span> <span className="font-medium">{execName}</span></div>
        )}
        {categoria && (
          <div><span style={{ color: 'var(--text-muted)' }}>Categoria:</span> <span className="font-medium">{categoria}</span></div>
        )}
        <div><span style={{ color: 'var(--text-muted)' }}>Valor:</span> <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{valor}</span></div>
        {descPreview && (
          <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Descrição</p>
            <p className="leading-snug" style={{ color: 'var(--text-muted)' }}>{descPreview}</p>
          </div>
        )}
        <ProjectHoursBar projectId={exp.project?.id ?? exp.project_id} />
      </div>
    </div>
  )
}
