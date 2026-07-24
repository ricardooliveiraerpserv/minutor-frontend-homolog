'use client'

import { useMemo, useState } from 'react'
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

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
// 'YYYY-MM' → 'jul/2026'
function formatMonth(ym?: string | null): string {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const mi = Number(m) - 1
  return mi >= 0 && mi < 12 ? `${MESES[mi]}/${y}` : ym
}

/**
 * Painel de capacidade dos consultores envolvidos no projeto.
 * Mostra carga total (planned/capacity) consumindo /users/{id}/capacity já existente.
 * Click no nome destaca atividades dele no Gantt.
 */
export function ProjectScheduleCapacity({ stages, selectedUserId, onSelectUser }: Props) {
  const { byUserId, loading } = useUserCapacityIndex()
  const [hoverUser, setHoverUser] = useState<number | null>(null)

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
            <li key={row.user.id} style={{ borderTop: '1px solid var(--border)', position: 'relative' }}
              onMouseEnter={() => setHoverUser(row.user.id)}
              onMouseLeave={() => setHoverUser(null)}>
              <button
                type="button"
                onClick={() => onSelectUser(isSelected ? null : row.user.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  width: '100%',
                  padding: '8px 12px',
                  background: isSelected ? 'var(--primary-soft)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
              >
                {/* Nome + selo de sobrecarga */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                    {row.user.name}
                  </span>
                  {row.overload && (
                    <span
                      title={row.overload_reasons.join(' · ') || 'Acima da capacidade'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 9, fontWeight: 600,
                        padding: '1px 5px', borderRadius: 3,
                        background: 'var(--danger-bg)', color: 'var(--danger)',
                        border: '1px solid var(--danger)',
                      }}
                    >
                      <AlertTriangle size={8} /> Acima da capacidade
                    </span>
                  )}
                </div>

                {/* Ocupação em % — headline claro + barra */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    title={`Ocupação do mês mais cheio${row.peak_month ? ` (${formatMonth(row.peak_month)})` : ''}: ${formatHours(row.peak_month_hours ?? 0)} de ${formatHours(row.capacity_hours)}/mês`}
                    style={{ fontSize: 11, fontWeight: 600, color: barColor, whiteSpace: 'nowrap' }}
                  >
                    {usagePct}% no mês mais cheio
                  </span>
                  <div style={{
                    flex: 1, height: 5,
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
                </div>

                {/* Detalhe: mês mais cheio (base do %) + horas neste projeto vs backlog total */}
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {row.peak_month && (
                    <>Mês mais cheio: <strong style={{ color: 'var(--text)' }}>{formatHours(row.peak_month_hours ?? 0)}</strong> em {formatMonth(row.peak_month)}{' · '}</>
                  )}
                  Neste projeto: <strong style={{ color: 'var(--text)' }}>{formatHours(inProjectHours)}</strong>
                  {' · '}
                  Backlog total: <strong style={{ color: 'var(--text)' }}>{formatHours(row.planned_hours)}</strong>
                </div>
              </button>

              {/* Tooltip: distribuição mês a mês (ocupação por mês) */}
              {hoverUser === row.user.id && (row.monthly?.length ?? 0) > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 12, zIndex: 20, marginTop: 2,
                  minWidth: 220, maxWidth: 300, padding: '8px 10px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.18)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Ocupação por mês · capacidade {formatHours(row.capacity_hours)}/mês
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {row.monthly!.map(m => {
                      const pct = row.capacity_hours > 0 ? Math.round((m.hours / row.capacity_hours) * 100) : 0
                      const over = m.hours > row.capacity_hours
                      const c = over ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--success)'
                      return (
                        <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 56, whiteSpace: 'nowrap' }}>{formatMonth(m.month)}</span>
                          <div style={{ flex: 1, height: 5, background: 'var(--surface-hover)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: c }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: c, width: 62, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {formatHours(m.hours)} · {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
