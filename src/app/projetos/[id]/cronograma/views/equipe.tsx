'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { TeamLoadItem } from '@/hooks/use-project-schedule'
import { Users, Clock } from 'lucide-react'

/**
 * View "Equipe" do cronograma (por projeto):
 *  - Alocação por consultor: contratadas (planejadas) / consumidas / saldo — vem do
 *    team_load do próprio /schedule (já carregado).
 *  - Apontamento semanal: horas apontadas por semana × consultor — GET /weekly-timesheets?project_id.
 */

type WeeklyRow = {
  week_start: string; user_id: number; user_name: string
  project_id: number; hours: number
}

const fmtH = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h`
// Número da semana ISO-8601 (semana começa na segunda).
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
const weekLabel = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const end = new Date(d); end.setDate(end.getDate() + 6)
  const dd = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
  return `Sem. ${isoWeek(d)} · ${dd(d)} – ${dd(end)}`
}

export function EquipeView({ projectId, teamLoad }: { projectId: number; teamLoad: TeamLoadItem[] }) {
  const [weekly, setWeekly] = useState<WeeklyRow[]>([])
  const [loadingW, setLoadingW] = useState(true)

  useEffect(() => {
    let alive = true
    setLoadingW(true)
    api.get<{ rows: WeeklyRow[] }>(`/weekly-timesheets?weeks=8&project_id=${projectId}`)
      .then(r => { if (alive) setWeekly(r?.rows ?? []) })
      .catch(() => { if (alive) setWeekly([]) })
      .finally(() => { if (alive) setLoadingW(false) })
    return () => { alive = false }
  }, [projectId])

  const th = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left'
  const thR = th.replace('text-left', 'text-right')

  return (
    <div className="flex flex-col gap-4 cronograma-view-fade">
      {/* Visão 1 — Alocação por consultor */}
      <div className="ds-card overflow-x-auto">
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <Users size={15} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Alocação por consultor</span>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· contratadas (planejadas no cronograma) · consumidas · saldo</span>
        </div>
        <table className="w-full text-sm" style={{ minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className={th} style={{ color: 'var(--text-light)' }}>Consultor</th>
              <th className={th} style={{ color: 'var(--text-light)' }}>Papel</th>
              <th className={thR} style={{ color: 'var(--text-light)' }}>Contratadas</th>
              <th className={thR} style={{ color: 'var(--text-light)' }}>Consumidas</th>
              <th className={thR} style={{ color: 'var(--text-light)' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {teamLoad.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Sem consultores alocados.</td></tr>
            ) : teamLoad.map(t => (
              <tr key={t.user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{t.user.name}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>Consultor</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(t.planned_hours)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(t.actual_hours)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: t.remaining_hours < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtH(t.remaining_hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visão 2 — Apontamento semanal */}
      <div className="ds-card overflow-x-auto">
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <Clock size={15} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Apontamento semanal</span>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· últimas 8 semanas · horas apontadas</span>
        </div>
        <table className="w-full text-sm" style={{ minWidth: 480 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className={th} style={{ color: 'var(--text-light)' }}>Semana</th>
              <th className={th} style={{ color: 'var(--text-light)' }}>Consultor</th>
              <th className={thR} style={{ color: 'var(--text-light)' }}>Horas</th>
              <th className={th} style={{ color: 'var(--text-light)' }}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {loadingW ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            ) : weekly.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>Sem apontamentos no período.</td></tr>
            ) : weekly.map((r, i) => {
              const first = i === 0 || weekly[i - 1].week_start !== r.week_start
              return (
                <tr key={`${r.week_start}-${r.user_id}`} style={{ borderBottom: '1px solid var(--border)', borderTop: first && i > 0 ? '2px solid var(--border)' : undefined }}>
                  <td className="px-3 py-2.5" style={{ color: first ? 'var(--text)' : 'var(--text-light)' }}>{first ? weekLabel(r.week_start) : ''}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{r.user_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtH(r.hours)}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--success)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} /> Apontou
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
