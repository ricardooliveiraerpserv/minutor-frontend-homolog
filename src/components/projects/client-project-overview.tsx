'use client'

import { useApiQuery } from '@/hooks/use-query'
import { CalendarDays } from 'lucide-react'

/**
 * Visão Geral do projeto para o CLIENTE — progresso por etapa, em dias.
 * Reaproveita o schedule do cliente (já em dias, sem horas/valores).
 */
interface ClientStage {
  id: number
  parent_stage_id: number | null
  name: string
  start: string | null
  end: string | null
  progress_pct: number
  deliveries: { status: string }[]
}
interface ScheduleResp { is_operational: boolean; stages: ClientStage[] }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function ClientProjectOverview({ projectId }: { projectId: number }) {
  const { data, loading } = useApiQuery<ScheduleResp>(`/client/projects/${projectId}/schedule`)

  if (loading && !data) return <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  if (!data || data.is_operational === false) {
    return <div style={{ color: 'var(--text-muted)' }}>Sem cronograma para exibir.</div>
  }

  const top = (data.stages ?? []).filter(s => s.parent_stage_id == null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ds-card ds-card-pad">
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
          Progresso por etapa
        </div>
        {top.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma etapa cadastrada.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {top.map(s => {
            const total = s.deliveries.length
            const done = s.deliveries.filter(d => d.status === 'done').length
            return (
              <div key={s.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CalendarDays size={11} /> {fmtDate(s.start)} – {fmtDate(s.end)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, minWidth: 42, textAlign: 'right' }}>{s.progress_pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, s.progress_pct)}%`, height: '100%', background: 'var(--success)' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{done}/{total} atividades concluídas</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
