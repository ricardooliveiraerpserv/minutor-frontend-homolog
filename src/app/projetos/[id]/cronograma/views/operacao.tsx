'use client'

import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { ProjectActivityKanban } from '@/components/projects/project-activity-kanban'
import { DeliverySidePanel } from '@/components/projects/delivery-side-panel'
import type { ScheduleStage } from '@/hooks/use-project-schedule'
import type { StageDelivery } from '@/lib/types/project-stage'

interface Props {
  projectId: number
  stages: ScheduleStage[]
  onChanged?: () => void
  canEdit?: boolean
  /** Modo controlado pela toolbar do cronograma (Kanban/Lista). */
  mode?: 'kanban' | 'lista'
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  backlog:        { label: 'A iniciar',          color: 'var(--text-muted)' },
  in_progress:    { label: 'Em andamento',       color: 'var(--primary)' },
  waiting_client: { label: 'Aguardando cliente', color: 'var(--warning)' },
  review:         { label: 'Homologação',        color: '#38bdf8' },
  done:           { label: 'Concluído',          color: 'var(--success)' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Lista plana das atividades por etapa (alternativa ao kanban). Clicar abre o card (painel). */
function ActivityList({ stages, onOpen }: { stages: ScheduleStage[]; onOpen: (d: StageDelivery) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {stages.map(st => (
        <div key={st.id}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            {st.name}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(st.deliveries ?? []).length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                Sem atividades.
              </div>
            ) : st.deliveries.map((d, i) => {
              const s = STATUS_META[d.status] ?? STATUS_META.backlog
              const overdue = d.due_date && new Date(d.due_date) < new Date() && d.status !== 'done'
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpen(d)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '10px 14px', cursor: 'pointer', background: 'transparent',
                    border: 'none', borderTop: i ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {d.responsible?.name ?? 'Sem responsável'}
                      {d.due_date ? (
                        <> · <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>vence {fmtDate(d.due_date)}</span></>
                      ) : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function OperacaoView({ projectId, stages, onChanged, canEdit = true, mode = 'kanban' }: Props) {
  const [selected, setSelected] = useState<StageDelivery | null>(null)

  if (stages.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        color: 'var(--text-muted)',
        border: '1px dashed var(--border)', borderRadius: 8,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>Nenhuma etapa ainda</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          Crie a primeira frente do projeto (ex: Fiscal, Compras, Integrações).
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Toggle Kanban/Lista movido pra toolbar do cronograma (mesma linha das ações). */}
      {mode === 'kanban'
        ? <ProjectActivityKanban projectId={projectId} stages={stages} onChanged={onChanged ?? (() => {})} canEdit={canEdit} />
        : <ActivityList stages={stages} onOpen={setSelected} />}
      {mode === 'lista' && selected && (
        <DeliverySidePanel
          delivery={selected}
          projectId={projectId}
          onClose={() => setSelected(null)}
          onUpdated={(u) => { setSelected(u as StageDelivery); onChanged?.() }}
          onDeleted={() => { setSelected(null); onChanged?.() }}
        />
      )}
    </div>
  )
}
