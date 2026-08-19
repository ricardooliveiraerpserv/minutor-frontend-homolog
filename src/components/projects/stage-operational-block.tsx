'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Trash2, PlusCircle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { computeStageHealth } from '@/lib/utils/stage-health'
import { HealthDots } from './health-dots'
import { StageTeamAllocation } from './stage-team-allocation'
import { StageKanbanBoard } from './stage-kanban-board'
import { StageAporteDialog } from './stage-aporte-dialog'
import { StageActivityTimeline } from './stage-activity-timeline'
import { StageCommentComposer } from './stage-comment-composer'
import { useStageDeliveries } from '@/hooks/use-stage-deliveries'
import type { ProjectStage, StageDerivedStatus } from '@/lib/types/project-stage'

const DERIVED_STATUS_LABEL: Record<StageDerivedStatus, string> = {
  planejamento: 'Planejamento',
  execucao:     'Execução',
  homologacao:  'Homologação',
  bloqueada:    'Bloqueada',
  concluida:    'Concluída',
}

const DERIVED_STATUS_COLOR: Record<StageDerivedStatus, string> = {
  planejamento: 'var(--text-muted)',
  execucao:     'var(--info)',
  homologacao:  'var(--warning)',
  bloqueada:    'var(--danger)',
  concluida:    'var(--success)',
}

interface Props {
  stage: ProjectStage
  projectId: number
  onChanged: () => void
  canEdit?: boolean
  /** Comando bulk vindo do pai (Expandir todos / Recolher todos). */
  bulkAction?: 'expand' | 'collapse' | null
  bulkKey?: number
}

function formatHours(n: number): string {
  const v = Number(n) || 0
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

export function StageOperationalBlock({
  stage, projectId, onChanged, canEdit = true,
  bulkAction = null, bulkKey = 0,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [activityKey, setActivityKey] = useState(0)

  // Mobile: colapsa por default. Roda 1x no mount; usuário pode toggle manualmente.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 767px)').matches) {
      setExpanded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reage a comandos bulk do pai (Expandir todos / Recolher todos)
  useEffect(() => {
    if (bulkAction === 'expand') setExpanded(true)
    if (bulkAction === 'collapse') setExpanded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkKey])

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(stage.name)
  const [savingName, setSavingName] = useState(false)
  const [aporteOpen, setAporteOpen] = useState(false)
  const { deliveries, loading, error, refetch } = useStageDeliveries(expanded ? stage.id : null)

  const health = computeStageHealth({ stage })
  const planned = Number(stage.hours_planned) || 0
  const totalDeliveries = stage.deliveries_count ?? 0
  const doneDeliveries = stage.deliveries_done_count ?? 0
  const pctDeliveries = totalDeliveries > 0 ? Math.round((doneDeliveries / totalDeliveries) * 100) : 0

  async function handleSaveName() {
    if (!name.trim()) { setEditingName(false); setName(stage.name); return }
    setSavingName(true)
    try {
      await api.patch(`/stages/${stage.id}`, { name: name.trim() })
      setEditingName(false)
      onChanged()
      toast.success('Etapa renomeada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro')
      setName(stage.name)
    } finally {
      setSavingName(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir a etapa "${stage.name}"?\n\nEsta ação remove todas as entregas e alocações desta etapa.`)) return
    try {
      await api.delete(`/stages/${stage.id}`)
      onChanged()
      toast.success('Etapa removida')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao remover')
    }
  }

  return (
    <section style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: 'var(--surface)',
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      {/* Header da etapa */}
      <header style={{
        padding: '12px 16px',
        borderBottom: expanded ? '1px solid var(--border)' : 'none',
        background: 'var(--surface)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'Recolher' : 'Expandir'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 2, marginTop: 2,
          }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {editingName ? (
              <input
                autoFocus
                className="ds-input"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') { setEditingName(false); setName(stage.name) }
                }}
                disabled={savingName}
                style={{ fontSize: 15, fontWeight: 600, padding: '4px 8px', minWidth: 200 }}
              />
            ) : (
              <h3
                onClick={() => { if (canEdit) setEditingName(true) }}
                style={{
                  fontSize: 15, fontWeight: 600, color: 'var(--text)',
                  margin: 0, cursor: canEdit ? 'text' : 'default',
                }}
              >
                {stage.name}
              </h3>
            )}
            {stage.derived_status && (
              <span
                title="Status derivado das entregas"
                style={{
                  fontSize: 10, fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  color: DERIVED_STATUS_COLOR[stage.derived_status],
                  background: 'var(--surface-hover)',
                  border: `1px solid ${DERIVED_STATUS_COLOR[stage.derived_status]}`,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                {DERIVED_STATUS_LABEL[stage.derived_status]}
              </span>
            )}
            <HealthDots health={health} />
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setAporteOpen(true)}
                  aria-label="Aportar horas"
                  title="Aportar horas (com justificativa)"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11,
                  }}
                >
                  <PlusCircle size={12} /> Aportar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  aria-label="Editar nome"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2,
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label="Excluir"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12,
            marginTop: 4, fontSize: 12, color: 'var(--text-muted)',
          }}>
            {planned > 0 && <span>{formatHours(planned)} planejadas</span>}
            {totalDeliveries > 0 && (
              <span>{doneDeliveries}/{totalDeliveries} entregas · {pctDeliveries}%</span>
            )}
            {stage.responsible?.name && <span>Resp: {stage.responsible.name}</span>}
          </div>

          {totalDeliveries > 0 && (
            <div style={{
              marginTop: 8, height: 3, width: '100%',
              background: 'var(--surface-hover)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${Math.min(100, pctDeliveries)}%`,
                background: 'var(--info)', transition: 'width .2s ease',
              }} />
            </div>
          )}
        </div>
      </header>

      {aporteOpen && (
        <StageAporteDialog
          stageId={stage.id}
          stageName={stage.name}
          projectId={projectId}
          onClose={() => setAporteOpen(false)}
          onCreated={onChanged}
        />
      )}

      {/* Conteúdo expandido: alocação + kanban */}
      {expanded && (
        <div style={{ padding: 16 }}>
          {stage.derived_status === 'bloqueada' && (
            <BlockedReasonEditor
              stage={stage}
              canEdit={canEdit}
              onSaved={onChanged}
            />
          )}

          <StageDatesEditor stage={stage} canEdit={canEdit} onSaved={onChanged} />

          <div style={{ marginBottom: 16 }}>
            <StageTeamAllocation stageId={stage.id} projectId={projectId} canEdit={canEdit} />
          </div>

          <div style={{
            fontSize: 11, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.04em',
            marginBottom: 8,
          }}>
            Entregas
          </div>

          {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando entregas…</div>
          ) : (
            <StageKanbanBoard stageId={stage.id} deliveries={deliveries} onChanged={refetch} canEdit={canEdit} />
          )}

          <div style={{ marginTop: 20 }}>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '.04em',
              marginBottom: 8,
            }}>
              Atividade
            </div>
            <StageCommentComposer
              stageId={stage.id}
              onCreated={() => setActivityKey(k => k + 1)}
            />
            <StageActivityTimeline key={activityKey} stageId={stage.id} />
          </div>
        </div>
      )}
    </section>
  )
}

function BlockedReasonEditor({
  stage, canEdit, onSaved,
}: {
  stage: ProjectStage
  canEdit: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(stage.blocked_reason ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api.patch(`/stages/${stage.id}`, { blocked_reason: value.trim() || null })
      setEditing(false)
      onSaved()
      toast.success(value.trim() ? 'Motivo do bloqueio atualizado' : 'Bloqueio limpo')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      marginBottom: 16, padding: 12,
      background: 'var(--danger-bg)',
      border: '1px solid var(--danger)',
      borderRadius: 6,
    }}>
      <div style={{
        fontSize: 11, color: 'var(--danger)',
        textTransform: 'uppercase', letterSpacing: '.04em',
        marginBottom: 6, fontWeight: 600,
      }}>
        Bloqueada por
      </div>

      {editing ? (
        <>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Ex: Aguardando retorno fiscal do cliente"
            rows={2}
            maxLength={500}
            autoFocus
            className="ds-input"
            style={{ width: '100%', padding: 8, fontSize: 13, fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="ds-btn-primary"
              disabled={saving}
              onClick={handleSave}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              className="ds-btn-ghost"
              onClick={() => { setEditing(false); setValue(stage.blocked_reason ?? '') }}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div
          onClick={() => canEdit && setEditing(true)}
          style={{
            fontSize: 13, color: 'var(--text)',
            cursor: canEdit ? 'text' : 'default',
            minHeight: 18,
            fontStyle: stage.blocked_reason ? 'normal' : 'italic',
          }}
        >
          {stage.blocked_reason || (canEdit ? 'Clique pra explicar o motivo do bloqueio…' : 'Sem motivo registrado.')}
        </div>
      )}
    </div>
  )
}

function StageDatesEditor({
  stage, canEdit, onSaved,
}: {
  stage: ProjectStage
  canEdit: boolean
  onSaved: () => void
}) {
  const [startAt, setStartAt] = useState(stage.stage_start_at ? stage.stage_start_at.slice(0, 10) : '')
  const [endAt, setEndAt] = useState(stage.expected_end_date ? stage.expected_end_date.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave(field: 'stage_start_at' | 'expected_end_date', value: string) {
    if (saving) return
    setSaving(true)
    try {
      await api.patch(`/stages/${stage.id}`, { [field]: value || null })
      toast.success('Prazo atualizado')
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar prazo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      marginBottom: 16, padding: 12,
      background: 'var(--surface-hover)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
    }}>
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Início previsto
        </label>
        <input
          type="date"
          className="ds-input"
          value={startAt}
          disabled={!canEdit || saving}
          onChange={e => setStartAt(e.target.value)}
          onBlur={e => { if (e.target.value !== (stage.stage_start_at ?? '').slice(0, 10)) handleSave('stage_start_at', e.target.value) }}
          style={{ width: '100%', marginTop: 4, fontSize: 13, padding: '4px 8px' }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Entrega prevista
        </label>
        <input
          type="date"
          className="ds-input"
          value={endAt}
          disabled={!canEdit || saving}
          onChange={e => setEndAt(e.target.value)}
          onBlur={e => { if (e.target.value !== (stage.expected_end_date ?? '').slice(0, 10)) handleSave('expected_end_date', e.target.value) }}
          style={{ width: '100%', marginTop: 4, fontSize: 13, padding: '4px 8px' }}
        />
      </div>
    </div>
  )
}
