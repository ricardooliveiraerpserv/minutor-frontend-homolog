'use client'

import { useState } from 'react'
import { formatBRL } from '@/lib/format'

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
    name?: string
    customer?: { name?: string; executive?: { name?: string } | null } | null
    coordinators?: ({ name?: string } | null)[] | null
    kanban_override_coordinator?: { name?: string } | null
  } | null
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
    name?: string
    customer?: { name?: string; executive?: { name?: string } | null } | null
    coordinators?: ({ name?: string } | null)[] | null
    kanban_override_coordinator?: { name?: string } | null
  } | null
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
      </div>
    </div>
  )
}
