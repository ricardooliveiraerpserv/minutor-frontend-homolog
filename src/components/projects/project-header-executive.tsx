'use client'

import { useState } from 'react'
import { CalendarDays, Pencil, AlertTriangle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useApiQuery } from '@/hooks/use-query'
import { useDelayRisk } from '@/hooks/use-delay-risk'

interface Project {
  id: number
  name: string
  code: string | null
  status: string
  status_display?: string
  customer?: { id: number; name: string } | null
  sold_hours?: number | string | null
  consumed_hours?: number | string | null
  general_hours_balance?: number | string | null
  expected_end_date?: string | null
  coordinators?: { id: number; name: string }[] | null
  executivo_conta?: { id: number; name: string } | null
}

interface TimesheetItem {
  id: number
  date: string
  user?: { name: string } | null
  effort_minutes: number
  observation?: string | null
}

interface Props {
  project: Project
  consultantsCount?: number
  onProjectChange?: () => void
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function formatHours(value: number): string {
  if (!value) return '0h'
  return value >= 100 ? `${Math.round(value)}h` : `${value.toFixed(1)}h`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 8,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function PrazoKPI({
  projectId,
  expectedEndDate,
  canEdit,
  onChange,
}: {
  projectId: number
  expectedEndDate: string | null | undefined
  canEdit: boolean
  onChange?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(expectedEndDate ? expectedEndDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)

  const hasDate = Boolean(expectedEndDate)
  const isOverdue = hasDate && new Date(expectedEndDate as string) < new Date(new Date().toDateString())

  const displayDate = hasDate
    ? new Date(expectedEndDate as string).toLocaleDateString('pt-BR')
    : '—'

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await api.patch(`/projects/${projectId}`, { expected_end_date: value || null })
      toast.success('Prazo atualizado')
      setEditing(false)
      onChange?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar prazo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 8,
      background: 'var(--surface)',
      border: `1px solid ${isOverdue ? 'var(--danger)' : 'var(--border)'}`,
      minWidth: 0,
      position: 'relative',
    }}>
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <CalendarDays size={11} /> Prazo de entrega
      </div>

      {!editing ? (
        <button
          type="button"
          onClick={canEdit ? () => { setValue(expectedEndDate ? expectedEndDate.slice(0, 10) : ''); setEditing(true) } : undefined}
          disabled={!canEdit}
          style={{
            background: 'transparent', border: 'none', padding: 0, margin: 0,
            cursor: canEdit ? 'pointer' : 'default',
            display: 'flex', alignItems: 'baseline', gap: 8,
            marginTop: 2, width: '100%', textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: 20, fontWeight: 600,
            color: hasDate ? (isOverdue ? 'var(--danger)' : 'var(--text)') : 'var(--text-muted)',
            fontStyle: hasDate ? 'normal' : 'italic',
          }}>
            {hasDate ? displayDate : 'Definir prazo'}
          </span>
          {canEdit && (
            <Pencil size={11} style={{ color: 'var(--text-light)', marginLeft: 'auto' }} />
          )}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <input
            type="date"
            className="ds-input"
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{ fontSize: 14, padding: '4px 8px', flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ds-btn-primary"
            style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}
          >
            {saving ? '…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="ds-btn-ghost"
            style={{ fontSize: 12, padding: '4px 8px', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {hasDate && !editing && (
        <div style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
          {(() => {
            const d = new Date(expectedEndDate as string)
            d.setHours(0, 0, 0, 0)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            if (days === 0) return 'hoje'
            if (days === 1) return 'amanhã'
            if (days < 0)  return `${Math.abs(days)} dia(s) em atraso`
            if (days < 30) return `em ${days} dia(s)`
            const months = Math.round(days / 30)
            return `em ~${months} mês${months === 1 ? '' : 'es'}`
          })()}
        </div>
      )}
    </div>
  )
}

export function ProjectHeaderExecutive({ project, onProjectChange }: Props) {
  const { user } = useAuth()
  const canEditPrazo = user?.type !== 'consultor' && user?.type !== 'cliente'

  const sold = n(project.sold_hours)
  const consumed = n(project.consumed_hours)
  const balance = n(project.general_hours_balance)
  const pct = sold > 0 ? Math.min(100, (consumed / sold) * 100) : 0

  const healthColor =
    pct >= 90 ? 'var(--danger)' :
    pct >= 70 ? 'var(--warning)' : 'var(--success)'

  // Última atividade — V1: último timesheet do projeto
  const { data: tsResp } = useApiQuery<{ items: TimesheetItem[] }>(
    `/timesheets?project_id=${project.id}&pageSize=1&order=-date,-created_at`
  )
  const last = tsResp?.items?.[0]

  // Risco de atraso (Pilar 2): última etapa termina depois do prazo macro?
  const { data: delayRisk } = useDelayRisk(project.id)

  return (
    <div style={{
      padding: '16px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--brand-bg)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {project.name}
            </h1>
            {project.code && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {project.code}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {project.customer?.name && <span>{project.customer.name}</span>}
            {project.status_display && (
              <span className="ds-status ds-status-info" style={{ fontSize: 11 }}>
                {project.status_display}
              </span>
            )}
            {project.coordinators && project.coordinators.length > 0 && (
              <span title="Coordenador do projeto">👤 {project.coordinators[0].name}</span>
            )}
            {project.executivo_conta?.name && (
              <span title="Executivo de conta">🎯 Exec: {project.executivo_conta.name}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginTop: 14,
      }}>
        <KPI label="Vendidas" value={formatHours(sold)} />
        <KPI label="Consumidas" value={formatHours(consumed)} sub={`${Math.round(pct)}%`} />
        <KPI label="Saldo" value={formatHours(balance)} />
        <PrazoKPI
          projectId={project.id}
          expectedEndDate={project.expected_end_date}
          canEdit={canEditPrazo}
          onChange={onProjectChange}
        />
      </div>

      {sold > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            height: 4,
            width: '100%',
            background: 'var(--surface-hover)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: healthColor,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      )}

      {delayRisk?.has_risk && delayRisk.latest_stage_end && (
        <div style={{
          marginTop: 12,
          padding: '6px 10px',
          borderRadius: 6,
          background: delayRisk.delay_days >= 14 ? 'var(--danger-bg)' : 'var(--warning-bg)',
          color: delayRisk.delay_days >= 14 ? 'var(--danger)' : 'var(--warning)',
          fontSize: 12,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <AlertTriangle size={13} />
          <span>
            Última etapa termina em{' '}
            <strong>{new Date(delayRisk.latest_stage_end).toLocaleDateString('pt-BR')}</strong>
            {' — '}
            {delayRisk.delay_days} dia{delayRisk.delay_days === 1 ? '' : 's'} após o prazo do projeto
          </span>
        </div>
      )}

      {last && (
        <div style={{
          marginTop: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--success)',
            display: 'inline-block',
          }} />
          <span>
            <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{last.user?.name ?? 'Alguém'}</strong>
            {' apontou '}
            {formatHours((last.effort_minutes ?? 0) / 60)}
            {' · '}
            {timeAgo(last.date)}
          </span>
        </div>
      )}
    </div>
  )
}
