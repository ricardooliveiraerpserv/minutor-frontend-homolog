'use client'

import { useState } from 'react'
import { CalendarDays, Pencil, AlertTriangle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useDelayRisk } from '@/hooks/use-delay-risk'
import { cronogramaPoolHours } from '@/lib/cronograma-pool'

interface Project {
  id: number
  name: string
  code: string | null
  status: string
  status_display?: string
  customer?: { id: number; name: string } | null
  sold_hours?: number | string | null
  coordination_hours?: number | string | null
  consumed_hours?: number | string | null
  general_hours_balance?: number | string | null
  expected_end_date?: string | null
  coordinators?: { id: number; name: string }[] | null
  executivo_conta?: { id: number; name: string } | null
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

// Indicador compacto (~70px) da tira do header.
function KPI({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 600, color: valueColor ?? 'var(--text)', marginTop: 2, lineHeight: 1.1 }}>
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
  // Data YYYY-MM-DD via `new Date()` é parseada como UTC → deslocava 1 dia no
  // Brasil (UTC-3), exibindo a véspera. Parse como meia-noite LOCAL.
  const endLocal = hasDate ? new Date((expectedEndDate as string).slice(0, 10) + 'T00:00:00') : null
  const isOverdue = !!endLocal && endLocal < new Date(new Date().toDateString())

  const displayDate = endLocal ? endLocal.toLocaleDateString('pt-BR') : '—'

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
      padding: '10px 12px',
      borderRadius: 8,
      background: 'var(--surface)',
      border: `1px solid ${isOverdue ? 'var(--danger)' : 'var(--border)'}`,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <CalendarDays size={10} /> Prazo
      </div>

      {!editing ? (
        <button
          type="button"
          onClick={canEdit ? () => { setValue(expectedEndDate ? expectedEndDate.slice(0, 10) : ''); setEditing(true) } : undefined}
          disabled={!canEdit}
          style={{
            background: 'transparent', border: 'none', padding: 0, margin: 0,
            cursor: canEdit ? 'pointer' : 'default',
            display: 'flex', alignItems: 'baseline', gap: 6,
            marginTop: 2, width: '100%', textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: 19, fontWeight: 600, lineHeight: 1.1,
            color: hasDate ? (isOverdue ? 'var(--danger)' : 'var(--text)') : 'var(--text-muted)',
            fontStyle: hasDate ? 'normal' : 'italic',
          }}>
            {hasDate ? displayDate : 'Definir'}
          </span>
          {canEdit && <Pencil size={10} style={{ color: 'var(--text-light)', marginLeft: 'auto' }} />}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
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
            style={{ fontSize: 13, padding: '3px 6px', flex: 1, minWidth: 0 }}
          />
          <button type="button" onClick={save} disabled={saving} className="ds-btn-primary" style={{ fontSize: 12, padding: '3px 8px', flexShrink: 0 }}>
            {saving ? '…' : 'OK'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="ds-btn-ghost" style={{ fontSize: 12, padding: '3px 6px', flexShrink: 0 }}>✕</button>
        </div>
      )}

      {hasDate && !editing && (
        <div style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
          {(() => {
            const d = new Date(endLocal as Date)
            d.setHours(0, 0, 0, 0)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            if (days === 0) return 'hoje'
            if (days === 1) return 'amanhã'
            if (days < 0)  return `${Math.abs(days)} dia(s) em atraso`
            if (days < 30) return `em ${days} dia(s)`
            const months = Math.round(days / 30)
            return `em ~${months} ${months === 1 ? 'mês' : 'meses'}`
          })()}
        </div>
      )}
    </div>
  )
}

export function ProjectHeaderExecutive({ project, onProjectChange }: Props) {
  const { user } = useAuth()
  const isConsultor = user?.type === 'consultor'
  const canEditPrazo = user?.type !== 'consultor' && user?.type !== 'cliente'

  // Horas APONTÁVEIS (pool liberado à gestão) — nunca a base comercial "Vendidas".
  const appointable = cronogramaPoolHours(project)
  const consumed = n(project.consumed_hours)
  const balance = appointable - consumed
  const pct = appointable > 0 ? Math.min(100, (consumed / appointable) * 100) : 0

  const healthColor =
    pct >= 90 ? 'var(--danger)' :
    pct >= 70 ? 'var(--warning)' : 'var(--success)'

  // Risco de atraso (Pilar 2): última etapa termina depois do prazo macro?
  const { data: delayRisk } = useDelayRisk(project.id)

  // Risco geral do header (badge): compõe horas + risco de atraso.
  const riskLevel: 'baixo' | 'medio' | 'alto' =
    (pct >= 90 || (delayRisk?.has_risk === true && delayRisk.delay_days >= 14)) ? 'alto'
    : (pct >= 70 || delayRisk?.has_risk === true) ? 'medio' : 'baixo'
  const riskMeta = {
    baixo: { cls: 'ds-status-success', dot: '🟢', label: 'Baixo' },
    medio: { cls: 'ds-status-warning', dot: '🟡', label: 'Médio' },
    alto:  { cls: 'ds-status-danger',  dot: '🔴', label: 'Alto' },
  }[riskLevel]

  return (
    <div style={{
      padding: '10px 24px 10px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Linha 1 — identidade + pessoas + risco + alertas (barra superior) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{project.name}</h1>
        {project.code && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{project.code}</span>
        )}
        {project.customer?.name && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>· {project.customer.name}</span>
        )}
        {project.status_display && (
          <span className="ds-status ds-status-info" style={{ fontSize: 11 }}>{project.status_display}</span>
        )}
        {project.coordinators && project.coordinators.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }} title="Responsável">👤 {project.coordinators[0].name}</span>
        )}
        {project.executivo_conta?.name && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }} title="Executivo de conta">🎯 {project.executivo_conta.name}</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Alertas → indicador compacto na barra (era banner) */}
          {!isConsultor && delayRisk?.has_risk && delayRisk.latest_stage_end && (
            <span
              className={`ds-status ${delayRisk.delay_days >= 14 ? 'ds-status-danger' : 'ds-status-warning'}`}
              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title={`Última etapa termina em ${new Date(delayRisk.latest_stage_end).toLocaleDateString('pt-BR')} — ${delayRisk.delay_days} dia(s) após o prazo do projeto`}
            >
              <AlertTriangle size={11} /> {delayRisk.delay_days}d de atraso
            </span>
          )}
          {/* Risco → badge (era card) */}
          {!isConsultor && (
            <span className={`ds-status ${riskMeta.cls}`} style={{ fontSize: 11 }} title="Risco geral (horas + prazo)">
              {riskMeta.dot} {riskMeta.label}
            </span>
          )}
        </div>
      </div>

      {/* Linha 2 — indicadores ~70px */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 8,
        marginTop: 8,
      }}>
        {/* Consultor não vê o total de horas do projeto — só suas atividades no board. */}
        {!isConsultor && (
          <>
            <KPI label="Apontáveis" value={formatHours(appointable)} />
            <KPI label="Consumidas" value={formatHours(consumed)} sub={`${Math.round(pct)}% consumido`} valueColor={healthColor} />
            <KPI label="Saldo" value={formatHours(balance)} />
          </>
        )}
        <PrazoKPI
          projectId={project.id}
          expectedEndDate={project.expected_end_date}
          canEdit={canEditPrazo}
          onChange={onProjectChange}
        />
      </div>

      {/* Barra de progresso fina (percentual consumido) */}
      {!isConsultor && appointable > 0 && (
        <div style={{ height: 3, width: '100%', background: 'var(--surface-hover)', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: healthColor, transition: 'width .3s ease' }} />
        </div>
      )}
    </div>
  )
}
