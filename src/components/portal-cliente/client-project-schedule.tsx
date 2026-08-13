'use client'

import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, List, CheckCircle2, Clock3, AlertTriangle, ListChecks, User } from 'lucide-react'
import { api } from '@/lib/api'

/**
 * Cronograma do projeto para o CLIENTE — INDICADORES (status, sem horas) +
 * cronograma em LISTA ou KANBAN por etapa (atividades com status/datas).
 * Sem horas / durações / alocações / valores. Fonte: GET /client/projects/{id}/schedule.
 */

type Delivery = { id: number; title: string; status: string; planned_start_at: string | null; due_date: string | null; completed_at: string | null; responsible_name?: string | null }
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
const isLate = (d: Delivery) => { if (d.status === 'done' || !d.due_date) return false; const due = new Date(d.due_date + 'T23:59:59'); return !isNaN(+due) && due.getTime() < Date.now() }

function Badge({ status }: { status: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', color: STATUS_COLOR[status] ?? 'var(--text-muted)', background: STATUS_BG[status] ?? 'var(--surface-hover)' }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function Responsible({ name }: { name?: string | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <User size={12} style={{ flexShrink: 0 }} />
      {name || 'Sem responsável'}
    </span>
  )
}

function Indicador({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 130, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-hover)', color, flexShrink: 0 }}>
        <Icon size={17} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  )
}

export function ClientProjectSchedule({ projectId }: { projectId: number }) {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>('list')

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    api.get<{ stages: Stage[] }>(`/client/projects/${projectId}/schedule`)
      .then(r => { if (alive) setStages(r?.stages ?? []) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  const withDel = useMemo(() => stages.filter(s => (s.deliveries?.length ?? 0) > 0), [stages])
  const ind = useMemo(() => {
    const all = withDel.flatMap(s => s.deliveries)
    const done = all.filter(d => d.status === 'done').length
    const late = all.filter(isLate).length
    const doing = all.filter(d => d.status !== 'done' && !isLate(d) && d.status !== 'backlog').length
    const pct = all.length ? Math.round((done / all.length) * 100) : 0
    return { total: all.length, done, doing, late, pct, stages: withDel.length }
  }, [withDel])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Carregando cronograma…</div>

  if (error) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13 }}>
        Não foi possível carregar o cronograma agora. Tente novamente em instantes.
      </div>
    )
  }

  if (withDel.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13 }}>
        Cronograma ainda não cadastrado para este projeto.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Indicadores (status, sem horas) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Indicador icon={CheckCircle2} label="Concluídas" value={`${ind.done}/${ind.total}`} color="var(--success)" />
        <Indicador icon={ListChecks}   label="Conclusão"  value={`${ind.pct}%`}              color="var(--primary)" />
        <Indicador icon={Clock3}       label="Em andamento" value={String(ind.doing)}        color="var(--primary)" />
        <Indicador icon={AlertTriangle} label="Atrasadas"  value={String(ind.late)}          color={ind.late > 0 ? 'var(--danger)' : 'var(--text-muted)'} />
        <Indicador icon={LayoutGrid}   label="Etapas"      value={String(ind.stages)}        color="var(--text-muted)" />
      </div>

      {/* Cabeçalho cronograma + toggle Lista/Kanban */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Cronograma</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {([['list', 'Lista', List], ['kanban', 'Kanban', LayoutGrid]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: view === key ? 'var(--primary-soft)' : 'var(--surface)',
                color: view === key ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? <ScheduleList stages={withDel} /> : <ScheduleKanban stages={withDel} />}
    </div>
  )
}

/* ---------- Lista: agrupado por etapa ---------- */
function ScheduleList({ stages }: { stages: Stage[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {stages.map(stage => {
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
                  <Responsible name={d.responsible_name} />
                  <span style={{ fontSize: 12, color: isLate(d) ? 'var(--danger)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.planned_start_at)} – {fmt(d.due_date)}</span>
                  <Badge status={d.status} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Kanban: 1 coluna por etapa ---------- */
function ScheduleKanban({ stages }: { stages: Stage[] }) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
      {stages.map(stage => {
        const total = stage.deliveries.length
        const done = stage.deliveries.filter(d => d.status === 'done').length
        return (
          <div key={stage.id} style={{ flex: '0 0 280px', width: 280, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-hover)', display: 'flex', flexDirection: 'column', maxHeight: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', flex: 1, lineHeight: 1.25 }}>{stage.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{done}/{total}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflowY: 'auto' }}>
              {stage.deliveries.map(d => (
                <div key={d.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}>{d.title}</span>
                  <Responsible name={d.responsible_name} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11.5, color: isLate(d) ? 'var(--danger)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.planned_start_at)} – {fmt(d.due_date)}</span>
                    <Badge status={d.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
