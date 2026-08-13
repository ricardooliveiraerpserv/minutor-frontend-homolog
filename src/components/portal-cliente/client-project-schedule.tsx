'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Cronograma do projeto para o CLIENTE — etapas + atividades com STATUS.
 * Sem horas / durações / alocações (visão limitada). Fonte: GET /client/projects/{id}/schedule.
 */

type Delivery = { id: number; title: string; status: string; planned_start_at: string | null; due_date: string | null; completed_at: string | null }
type Stage = { id: number; name: string; deliveries: Delivery[] }

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', in_progress: 'Em andamento', waiting_client: 'Aguardando cliente', review: 'Homologação', done: 'Concluída',
}
const STATUS_COLOR: Record<string, string> = {
  backlog: 'var(--text-muted)', in_progress: 'var(--primary)', waiting_client: 'var(--warning)', review: 'var(--primary)', done: 'var(--success)',
}
const STATUS_BG: Record<string, string> = {
  backlog: 'var(--surface-hover)', in_progress: 'var(--primary-soft)', waiting_client: 'var(--warning-bg)', review: 'var(--primary-soft)', done: 'var(--success-bg)',
}

const fmt = (s: string | null) => { if (!s) return '—'; const d = new Date(s + 'T00:00:00'); return isNaN(+d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }

export function ClientProjectSchedule({ projectId }: { projectId: number }) {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get<{ stages: Stage[] }>(`/client/projects/${projectId}/schedule`)
      .then(r => { if (alive) setStages(r?.stages ?? []) })
      .catch(() => { if (alive) setStages([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Carregando cronograma…</div>

  const withDel = stages.filter(s => (s.deliveries?.length ?? 0) > 0)
  if (withDel.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13 }}>
        Cronograma ainda não cadastrado para este projeto.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {withDel.map(stage => {
        const total = stage.deliveries.length
        const done = stage.deliveries.filter(d => d.status === 'done').length
        return (
          <div key={stage.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', flex: 1 }}>{stage.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{done}/{total} concluídas</span>
            </div>
            <div>
              {stage.deliveries.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 160, fontSize: 13.5, color: 'var(--text)' }}>{d.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.planned_start_at)} – {fmt(d.due_date)}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: STATUS_COLOR[d.status] ?? 'var(--text-muted)', background: STATUS_BG[d.status] ?? 'var(--surface-hover)' }}>
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
