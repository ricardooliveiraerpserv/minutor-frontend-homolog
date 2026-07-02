'use client'

import { Building2, CalendarDays, CheckCircle2, Clock } from 'lucide-react'

/**
 * Header do projeto na visão do CLIENTE — em dias, sem horas nem valores.
 * Alimentado por GET /projects/{id} (que para cliente retorna client_view).
 */
export interface ClientProjectSummary {
  id: number
  name: string
  code?: string | null
  status_display?: string
  customer?: { id: number; name: string } | null
  expected_end_date?: string | null
  progress_pct?: number
  days_remaining?: number | null
  total_activities?: number
  done_activities?: number
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function ClientProjectHeader({ project }: { project: ClientProjectSummary }) {
  const pct = project.progress_pct ?? 0
  return (
    <div style={{ padding: '16px 24px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
        <Building2 size={15} /> {project.customer?.name ?? '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{project.name}</h1>
        {project.code && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.code}</span>}
        {project.status_display && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            {project.status_display}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi icon={CalendarDays} label="Prazo de entrega" value={fmtDate(project.expected_end_date)}
          sub={project.days_remaining != null ? `${project.days_remaining} dia(s) úteis restantes` : undefined} />
        <Kpi icon={CheckCircle2} label="Concluído" value={`${pct}%`}
          sub={project.total_activities != null ? `${project.done_activities ?? 0}/${project.total_activities} atividades` : undefined} />
        <Kpi icon={Clock} label="Andamento" value={pct >= 100 ? 'Finalizado' : pct > 0 ? 'Em execução' : 'A iniciar'} />
      </div>

      {/* Barra de progresso por atividades */}
      <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'var(--surface-hover)', overflow: 'hidden', maxWidth: 520 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'var(--success)', transition: 'width .3s ease' }} />
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="ds-card" style={{ padding: '10px 16px', minWidth: 170 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        <Icon size={12} /> {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
