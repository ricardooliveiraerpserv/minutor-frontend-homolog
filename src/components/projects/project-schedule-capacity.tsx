'use client'

import { useMemo } from 'react'
import { AlertTriangle, Users } from 'lucide-react'
import { useUserCapacityIndex } from '@/hooks/use-user-capacity'
import type { ScheduleStage } from '@/hooks/use-project-schedule'

interface Props {
  stages: ScheduleStage[]
  selectedUserId: number | null
  onSelectUser: (userId: number | null) => void
}

function formatHours(n: number): string {
  const v = Number(n) || 0
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

/**
 * Painel de capacidade dos consultores envolvidos no projeto.
 * Mostra carga total (planned/capacity) consumindo /users/{id}/capacity já existente.
 * Click no nome destaca atividades dele no Gantt.
 */
export function ProjectScheduleCapacity({ stages, selectedUserId, onSelectUser }: Props) {
  const { byUserId, loading } = useUserCapacityIndex()

  // Quem aparece: consultores que têm atividade como responsável no projeto
  const userIds = useMemo(() => {
    const set = new Set<number>()
    for (const s of stages) {
      for (const d of s.deliveries ?? []) {
        if (d.responsible_user_id) set.add(d.responsible_user_id)
      }
    }
    return Array.from(set)
  }, [stages])

  // Horas planejadas neste projeto por consultor (pra calcular share)
  const projectHoursByUser = useMemo(() => {
    const map = new Map<number, number>()
    for (const s of stages) {
      for (const d of s.deliveries ?? []) {
        if (!d.responsible_user_id) continue
        const cur = map.get(d.responsible_user_id) ?? 0
        map.set(d.responsible_user_id, cur + (Number(d.hours_planned) || 0))
      }
    }
    return map
  }, [stages])

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>Carregando capacidade…</div>
  }

  if (userIds.length === 0) {
    return null
  }

  // Ordena por overload primeiro, depois usage_pct desc
  const rows = userIds
    .map(uid => byUserId[uid])
    .filter(Boolean)
    .sort((a, b) => {
      if (a.overload !== b.overload) return a.overload ? -1 : 1
      return b.usage_pct - a.usage_pct
    })

  return (
    <div className="ds-card" style={{ padding: 0 }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-hover)',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <Users size={12} />
        <strong style={{ color: 'var(--text)' }}>Capacidade da equipe</strong>
        <span style={{ opacity: .6 }}>· {rows.length} {rows.length === 1 ? 'consultor' : 'consultores'}</span>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map(row => {
          const inProjectHours = projectHoursByUser.get(row.user.id) ?? 0
          const isSelected = selectedUserId === row.user.id
          const usagePct = row.usage_pct
          const barColor = row.overload
            ? 'var(--danger)'
            : usagePct > 80
              ? 'var(--warning)'
              : 'var(--success)'

          return (
            <li key={row.user.id} style={{ borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => onSelectUser(isSelected ? null : row.user.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  background: isSelected ? 'var(--primary-soft)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                      {row.user.name}
                    </span>
                    {row.overload && (
                      <span
                        title={row.overload_reasons.join(' · ') || 'Sobrecarregado'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 9, fontWeight: 600,
                          padding: '1px 5px', borderRadius: 3,
                          background: 'var(--danger-bg)', color: 'var(--danger)',
                          border: '1px solid var(--danger)',
                          textTransform: 'uppercase', letterSpacing: 0.3,
                        }}
                      >
                        <AlertTriangle size={8} /> Sobrecarregado
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Neste projeto: <strong style={{ color: 'var(--text)' }}>{formatHours(inProjectHours)}</strong>
                    {' · '}
                    Total: <strong style={{ color: 'var(--text)' }}>{formatHours(row.planned_hours)}</strong> / {formatHours(row.capacity_hours)}
                  </div>
                </div>

                <div style={{ flex: '0 0 140px' }}>
                  <div style={{
                    height: 5, width: '100%',
                    background: 'var(--surface-hover)',
                    borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, usagePct)}%`,
                      background: barColor,
                      transition: 'width .2s ease',
                    }} />
                  </div>
                  <div style={{
                    fontSize: 10, marginTop: 2,
                    color: row.overload ? 'var(--danger)' : 'var(--text-muted)',
                    fontWeight: row.overload ? 600 : 400,
                    textAlign: 'right',
                  }}>
                    {usagePct}%
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
