'use client'

import { useEffect, useMemo, useState, createContext, useContext, Fragment } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Calendar, Lock, Pencil } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { ScheduleStage, ProjectCoordinator } from '@/hooks/use-project-schedule'
import type { StageDelivery } from '@/lib/types/project-stage'
import { BusinessCalendar } from '@/lib/business-calendar'
import { CronogramaRecalcModal } from './cronograma-recalc-modal'
import { usePreviewRecalc, hasMeaningfulImpact, type RecalcTrigger } from '@/hooks/use-preview-recalc'
import { ResponsibleChip } from './responsible-chip'
import { useUserCapacityIndex } from '@/hooks/use-user-capacity'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { buildCronogramaCodes } from '@/lib/cronograma-numbering'
import { parseDateLocal } from '@/lib/date-only'
import { SearchSelect } from '@/components/ui/search-select'
import { HolidayDatePicker, type HolidayItem } from '@/components/ui/holiday-date-picker'

// Contexto p/ alimentar os date pickers (deep na árvore) com feriados + opções de calendário.
const CronoCalCtx = createContext<{ holidays: HolidayItem[]; allowWeekend?: boolean; allowHoliday?: boolean }>({ holidays: [] })

/**
 * Wrapper que mapeia a API antiga do InlineDate (value/canEdit/onSave) pro
 * HolidayDatePicker, lendo feriados + opções do contexto do cronograma.
 */
function CronogramaDate({ value, canEdit, onSave, placeholder = 'Definir' }: {
  value: string | null
  canEdit: boolean
  onSave: (v: string | null) => void
  placeholder?: string
}) {
  const ctx = useContext(CronoCalCtx)
  return (
    <HolidayDatePicker
      value={value ? value.slice(0, 10) : null}
      onChange={v => onSave(v)}
      holidays={ctx.holidays}
      allowWeekend={ctx.allowWeekend}
      allowHoliday={ctx.allowHoliday}
      placeholder={placeholder}
      disabled={!canEdit}
      compact
    />
  )
}

interface Props {
  projectId: number
  stages: ScheduleStage[]
  coordinators: ProjectCoordinator[]
  canEdit: boolean
  onChanged: () => void
  holidays?: HolidayItem[]
  /** Fase 7: opções do calendário operacional (sábado/feriado como úteis). */
  calendarOpts?: { allowWeekend?: boolean; allowHoliday?: boolean }
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatHours(v: number): string {
  if (v === 0) return '0h'
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

interface NewStageDraft {
  name: string
  responsible_user_id: string
  stage_start_at: string
  expected_end_date: string
  hours_planned: string
}

interface ExtraAllocationDraft {
  user_id: number
  user_name: string
  planned_hours: string
}

interface ExtraClientDraft {
  user_id?: number
  email?: string
  name: string
}

interface NewActivityDraft {
  title: string
  responsible_user_id: string
  planned_start_at: string
  due_date: string
  hours_planned: string
  client_involved: boolean
  client_user_id: string
  client_email: string
  extra_clients: ExtraClientDraft[]
  extra_allocations: ExtraAllocationDraft[]
  /** Flag interna: vira true quando user digita fim manualmente; trava o auto-sugest. */
  dueTouched: boolean
}

const emptyStageDraft = (defaultResp: number | null): NewStageDraft => ({
  name: '',
  responsible_user_id: defaultResp ? String(defaultResp) : '',
  stage_start_at: '',
  expected_end_date: '',
  hours_planned: '',
})

const emptyActivityDraft = (defaultResp: number | null): NewActivityDraft => ({
  title: '',
  responsible_user_id: defaultResp ? String(defaultResp) : '',
  planned_start_at: '',
  due_date: '',
  hours_planned: '',
  client_involved: false,
  client_user_id: '',
  client_email: '',
  extra_clients: [],
  extra_allocations: [],
  dueTouched: false,
})

export function ProjectScheduleTable({ projectId, stages, coordinators, canEdit, onChanged, holidays, calendarOpts }: Props) {
  const defaultCoordId = coordinators[0]?.id ?? null

  // Responsável da etapa/atividade: TODOS os consultores, coordenadores e executivos
  // (não só os coordenadores do projeto). Executivo = flag is_executive.
  const [respOpts, setRespOpts] = useState<{ id: number; name: string }[]>([])
  const [clientOpts, setClientOpts] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    let cancel = false
    const pick = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
    Promise.all([
      api.get<any>('/users?type=consultor,coordenador&minimal=true&pageSize=500').catch(() => null),
      api.get<any>('/executives?pageSize=200').catch(() => null),
      api.get<any>('/users?type=cliente&minimal=true&pageSize=500').catch(() => null),
    ]).then(([u, e, c]) => {
      if (cancel) return
      const byId = new Map<number, { id: number; name: string }>()
      for (const x of [...pick(u), ...pick(e)]) {
        if (x?.id && x?.name && !byId.has(x.id)) byId.set(x.id, { id: x.id, name: x.name })
      }
      setRespOpts([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)))
      setClientOpts(pick(c).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)))
    })
    return () => { cancel = true }
  }, [])
  // Fallback p/ os coordenadores do projeto se a busca falhar (não deixa o select vazio).
  const responsibleList = respOpts.length > 0 ? respOpts : coordinators

  const calendar = useMemo(() => new BusinessCalendar((holidays ?? []).map(h => h.date), calendarOpts ?? {}),
    [holidays, calendarOpts?.allowWeekend, calendarOpts?.allowHoliday])
  // Ordena as atividades de cada etapa por DATA DE INÍCIO (desempate: entrega, depois
  // order_index). Visual only — não persiste; numeração (3.1, 3.2…) segue essa ordem.
  const sortedStages = useMemo(() => stages.map(s => ({
    ...s,
    deliveries: [...(s.deliveries ?? [])].sort((a, b) => {
      const sa = a.planned_start_at ?? '', sb = b.planned_start_at ?? ''
      if (sa !== sb) { if (!sa) return 1; if (!sb) return -1; return sa < sb ? -1 : 1 }
      const da = a.due_date ?? '', db = b.due_date ?? ''
      if (da !== db) { if (!da) return 1; if (!db) return -1; return da < db ? -1 : 1 }
      return (a.order_index ?? 0) - (b.order_index ?? 0)
    }),
  })), [stages])
  const codes = useMemo(() => buildCronogramaCodes(sortedStages), [sortedStages])

  // Set de delivery_ids que têm dependentes — usado pra abrir modal após edit
  const idsWithDependents = useMemo(() => {
    const set = new Set<number>()
    for (const st of stages) {
      for (const d of st.deliveries ?? []) {
        if (d.depends_on_delivery_id) set.add(d.depends_on_delivery_id)
      }
    }
    return set
  }, [stages])

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [creatingStage, setCreatingStage] = useState(false)
  // null = criando etapa de topo; número = criando sub-etapa sob essa etapa-mãe.
  const [subParentId, setSubParentId] = useState<number | null>(null)

  // Árvore: etapas de topo + sub-etapas por mãe (a API retorna lista plana c/ parent_stage_id).
  const topStages = useMemo(
    () => sortedStages.filter(s => s.parent_stage_id == null).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [sortedStages],
  )
  const childrenByParent = useMemo(() => {
    const m = new Map<number, ScheduleStage[]>()
    for (const s of sortedStages) {
      if (s.parent_stage_id != null) {
        const arr = m.get(s.parent_stage_id) ?? []
        arr.push(s); m.set(s.parent_stage_id, arr)
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    return m
  }, [sortedStages])

  // Rollup da etapa-mãe: soma horas + intervalo de datas das sub-etapas (+ atividades diretas).
  const rollupFor = (etapa: ScheduleStage): { hours: number; start: string | null; end: string | null } | null => {
    const subs = childrenByParent.get(etapa.id)
    if (!subs || subs.length === 0) return null
    let hours = num(etapa.effective_hours_planned ?? etapa.deliveries_hours_planned_sum)
    const starts: string[] = [], ends: string[] = []
    if (etapa.stage_start_at) starts.push(etapa.stage_start_at.slice(0, 10))
    if (etapa.expected_end_date) ends.push(etapa.expected_end_date.slice(0, 10))
    for (const sub of subs) {
      hours += num(sub.effective_hours_planned ?? sub.deliveries_hours_planned_sum)
      if (sub.stage_start_at) starts.push(sub.stage_start_at.slice(0, 10))
      if (sub.expected_end_date) ends.push(sub.expected_end_date.slice(0, 10))
    }
    starts.sort(); ends.sort()
    return { hours, start: starts[0] ?? null, end: ends[ends.length - 1] ?? null }
  }
  const [stageDraft, setStageDraft] = useState<NewStageDraft>(emptyStageDraft(defaultCoordId))
  const [creatingActivityIn, setCreatingActivityIn] = useState<number | null>(null)
  // Edição de atividade existente: reusa o MESMO form da criação (com envolver cliente etc.).
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null)
  const [activityDraft, setActivityDraft] = useState<NewActivityDraft>(emptyActivityDraft(defaultCoordId))
  const [recalcTrigger, setRecalcTrigger] = useState<RecalcTrigger | null>(null)
  const previewRecalc = usePreviewRecalc(projectId)

  function toggleCollapse(stageId: number) {
    setCollapsed(c => ({ ...c, [stageId]: !c[stageId] }))
  }

  function openCreateStage() {
    setStageDraft(emptyStageDraft(defaultCoordId))
    setSubParentId(null)
    setCreatingStage(true)
  }

  function openCreateSubStage(parentId: number) {
    setStageDraft(emptyStageDraft(defaultCoordId))
    setSubParentId(parentId)
    setCreatingStage(true)
  }

  function openCreateActivity(stageId: number, stageResp: number | null) {
    setActivityDraft(emptyActivityDraft(stageResp ?? defaultCoordId))
    setCreatingActivityIn(stageId)
  }

  async function createStage() {
    const name = stageDraft.name.trim()
    if (!name) {
      toast.error('Informe o nome da etapa')
      return
    }
    try {
      const body: Record<string, unknown> = { name }
      if (subParentId) body.parent_stage_id = subParentId
      if (stageDraft.responsible_user_id) body.responsible_user_id = Number(stageDraft.responsible_user_id)
      if (stageDraft.stage_start_at)      body.stage_start_at = stageDraft.stage_start_at
      if (stageDraft.expected_end_date)   body.expected_end_date = stageDraft.expected_end_date
      if (stageDraft.hours_planned)       body.hours_planned = Number(stageDraft.hours_planned)
      await api.post(`/projects/${projectId}/stages`, body)
      const wasSub = subParentId != null
      setCreatingStage(false)
      setSubParentId(null)
      setStageDraft(emptyStageDraft(defaultCoordId))
      onChanged()
      toast.success(wasSub ? 'Sub-etapa criada' : 'Etapa criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar etapa')
    }
  }

  async function createActivity(stageId: number) {
    const title = activityDraft.title.trim()
    if (!title) {
      toast.error('Informe o título da atividade')
      return
    }
    try {
      const body: Record<string, unknown> = { title }
      if (activityDraft.responsible_user_id && !activityDraft.client_involved) body.responsible_user_id = Number(activityDraft.responsible_user_id)
      if (activityDraft.planned_start_at)    body.planned_start_at = activityDraft.planned_start_at
      if (activityDraft.hours_planned)       body.hours_planned = Number(activityDraft.hours_planned)

      // Sugestão automática de fim quando start+horas preenchidos mas fim vazio
      let due = activityDraft.due_date
      if (!due && activityDraft.planned_start_at && activityDraft.hours_planned) {
        const suggested = calendar.suggestedEndISO(
          activityDraft.planned_start_at,
          Number(activityDraft.hours_planned),
          8,
        )
        if (suggested) due = suggested
      }
      if (due) body.due_date = due

      // Envolvimento do cliente
      if (activityDraft.client_involved) {
        body.client_involved = true
        if (activityDraft.client_user_id) body.client_user_id = Number(activityDraft.client_user_id)
        if (activityDraft.client_email.trim()) body.client_email = activityDraft.client_email.trim()
        if (activityDraft.extra_clients.length > 0) {
          body.extra_clients = activityDraft.extra_clients.map(c => ({
            user_id: c.user_id ?? null,
            email: c.email ?? null,
            name: c.name,
          }))
        }
      }

      const created = await api.post<{ id: number }>(`/stages/${stageId}/deliveries`, body)

      // Alocações adicionais (consultores extras além do responsável principal)
      if (created?.id && activityDraft.extra_allocations.length > 0) {
        await Promise.all(
          activityDraft.extra_allocations
            .filter(a => Number(a.planned_hours) >= 0.5)
            .map(a =>
              api.post(`/activities/${created.id}/allocations`, {
                user_id: a.user_id,
                planned_hours: Number(a.planned_hours),
              }).catch(() => null) // não bloqueia o sucesso da criação principal
            )
        )
      }

      setCreatingActivityIn(null)
      setActivityDraft(emptyActivityDraft(defaultCoordId))
      onChanged()
      toast.success('Atividade criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar atividade')
    }
  }

  // Abre o MESMO form da criação, pré-preenchido, pra editar uma atividade existente.
  function openEditActivity(d: StageDelivery, stageId: number) {
    setActivityDraft({
      title: d.title ?? '',
      responsible_user_id: d.responsible_user_id ? String(d.responsible_user_id) : '',
      planned_start_at: d.planned_start_at ?? '',
      due_date: d.due_date ?? '',
      hours_planned: d.hours_planned != null ? String(d.hours_planned) : '',
      client_involved: !!d.client_involved,
      client_user_id: d.client_user_id ? String(d.client_user_id) : '',
      client_email: d.client_email ?? '',
      extra_clients: (d.extra_clients ?? []).map(c => ({
        user_id: c.user_id ?? undefined,
        email: c.email ?? undefined,
        name: c.name ?? (c.email ?? ''),
      })),
      extra_allocations: [],
      dueTouched: !!d.due_date,
    })
    setEditingActivityId(d.id)
    setCreatingActivityIn(stageId)
  }

  function cancelActivityForm() {
    setCreatingActivityIn(null)
    setEditingActivityId(null)
    setActivityDraft(emptyActivityDraft(defaultCoordId))
  }

  async function updateActivity(deliveryId: number) {
    const title = activityDraft.title.trim()
    if (!title) { toast.error('Informe o título da atividade'); return }
    try {
      const body: Record<string, unknown> = { title }
      // Responsável vs cliente (mesma lógica da criação, mas explícito p/ limpar o outro lado).
      if (activityDraft.client_involved) {
        body.client_involved = true
        body.responsible_user_id = null
        body.client_user_id = activityDraft.client_user_id ? Number(activityDraft.client_user_id) : null
        body.client_email = activityDraft.client_email.trim() || null
        body.extra_clients = activityDraft.extra_clients.map(c => ({
          user_id: c.user_id ?? null, email: c.email ?? null, name: c.name,
        }))
      } else {
        body.client_involved = false
        body.client_user_id = null
        body.client_email = null
        body.extra_clients = []
        body.responsible_user_id = activityDraft.responsible_user_id ? Number(activityDraft.responsible_user_id) : null
      }
      body.planned_start_at = activityDraft.planned_start_at || null
      body.hours_planned = activityDraft.hours_planned ? Number(activityDraft.hours_planned) : null
      let due = activityDraft.due_date
      if (!due && activityDraft.planned_start_at && activityDraft.hours_planned) {
        const suggested = calendar.suggestedEndISO(activityDraft.planned_start_at, Number(activityDraft.hours_planned), 8)
        if (suggested) due = suggested
      }
      body.due_date = due || null

      await api.patch(`/deliveries/${deliveryId}`, body)

      // Alocações novas adicionadas no form de edição (não remove as existentes).
      if (activityDraft.extra_allocations.length > 0) {
        await Promise.all(
          activityDraft.extra_allocations
            .filter(a => Number(a.planned_hours) >= 0.5)
            .map(a => api.post(`/activities/${deliveryId}/allocations`, {
              user_id: a.user_id, planned_hours: Number(a.planned_hours),
            }).catch(() => null))
        )
      }

      cancelActivityForm()
      onChanged()
      toast.success('Atividade atualizada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar atividade')
    }
  }

  // Render de uma etapa/sub-etapa (props comuns) — depth controla indentação.
  const renderStage = (stage: ScheduleStage, depth: number, rollup: { hours: number; start: string | null; end: string | null } | null) => (
    <StageRows
      key={stage.id}
      responsibleOptions={responsibleList}
      clientOptions={clientOpts}
      projectId={projectId}
      stage={stage}
      stages={sortedStages}
      coordinators={coordinators}
      collapsed={!!collapsed[stage.id]}
      onToggle={() => toggleCollapse(stage.id)}
      canEdit={canEdit}
      onChanged={onChanged}
      creatingActivity={creatingActivityIn === stage.id}
      editingActivityId={editingActivityId}
      activityDraft={activityDraft}
      setActivityDraft={setActivityDraft}
      onStartCreateActivity={() => openCreateActivity(stage.id, stage.responsible_user_id)}
      onStartEditActivity={(d) => openEditActivity(d, stage.id)}
      onCancelCreateActivity={cancelActivityForm}
      onConfirmCreateActivity={() => editingActivityId ? updateActivity(editingActivityId) : createActivity(stage.id)}
      idsWithDependents={idsWithDependents}
      previewRecalc={previewRecalc}
      onOpenRecalcModal={setRecalcTrigger}
      calendar={calendar}
      codes={codes}
      depth={depth}
      rollup={rollup}
    />
  )

  // Formulário de criação de etapa/sub-etapa (reaproveitado no topo e inline).
  const stageFormRow = (depth: number) => (
    <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
      <td colSpan={8} style={{ padding: `10px 12px 10px ${12 + depth * 22}px` }}>
        {depth > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginBottom: 6 }}>Nova sub-etapa</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FieldLabeled label="Nome">
            <input
              autoFocus
              className="ds-input"
              value={stageDraft.name}
              onChange={e => setStageDraft(d => ({ ...d, name: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') createStage()
                if (e.key === 'Escape') { setCreatingStage(false); setSubParentId(null) }
              }}
              placeholder={depth > 0 ? 'Ex: Preparação Base teste…' : 'Ex: Fiscal, Compras…'}
              maxLength={100}
              style={{ width: 200, fontSize: 13, padding: '4px 8px' }}
            />
          </FieldLabeled>
          <FieldLabeled label="Responsável">
            <SearchSelect
              value={stageDraft.responsible_user_id}
              onChange={v => setStageDraft(d => ({ ...d, responsible_user_id: v }))}
              options={responsibleList}
              placeholder="—"
            />
          </FieldLabeled>
          <FieldLabeled label="Início">
            <HolidayDatePicker
              value={stageDraft.stage_start_at || null}
              onChange={v => setStageDraft(d => ({ ...d, stage_start_at: v ?? '' }))}
              holidays={holidays ?? []}
              allowWeekend={calendarOpts?.allowWeekend}
              allowHoliday={calendarOpts?.allowHoliday}
              placeholder="Início"
            />
          </FieldLabeled>
          <FieldLabeled label="Fim">
            <HolidayDatePicker
              value={stageDraft.expected_end_date || null}
              onChange={v => setStageDraft(d => ({ ...d, expected_end_date: v ?? '' }))}
              holidays={holidays ?? []}
              allowWeekend={calendarOpts?.allowWeekend}
              allowHoliday={calendarOpts?.allowHoliday}
              placeholder="Fim"
            />
          </FieldLabeled>
          <FieldLabeled label="Horas">
            <input
              type="number"
              min={0}
              step="0.5"
              className="ds-input"
              value={stageDraft.hours_planned}
              onChange={e => setStageDraft(d => ({ ...d, hours_planned: e.target.value }))}
              style={{ width: 80, fontSize: 13, padding: '4px 8px' }}
            />
          </FieldLabeled>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={createStage} className="ds-btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>Criar</button>
            <button onClick={() => { setCreatingStage(false); setSubParentId(null) }} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Cancelar</button>
          </div>
        </div>
      </td>
    </tr>
  )

  return (
    <CronoCalCtx.Provider value={{ holidays: holidays ?? [], allowWeekend: calendarOpts?.allowWeekend, allowHoliday: calendarOpts?.allowHoliday }}>
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surface-hover)' }}>
            <th style={th()}>Item</th>
            <th style={th()}>Responsável</th>
            <th style={th(110)}>Início</th>
            <th style={th(110)}>Fim</th>
            <th style={th(80)}>Dias úteis</th>
            <th style={th(80)}>Horas</th>
            <th style={th(160)}>Depende de</th>
            <th style={th(60)}></th>
          </tr>
        </thead>
        <tbody>
          {topStages.map(etapa => {
            const subs = childrenByParent.get(etapa.id) ?? []
            const etapaCollapsed = !!collapsed[etapa.id]
            return (
              <Fragment key={etapa.id}>
                {renderStage(etapa, 0, subs.length ? rollupFor(etapa) : null)}
                {!etapaCollapsed && subs.map(sub => renderStage(sub, 1, null))}
                {!etapaCollapsed && canEdit && (
                  creatingStage && subParentId === etapa.id
                    ? stageFormRow(1)
                    : (
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td colSpan={8} style={{ padding: '6px 12px 6px 34px' }}>
                          <button onClick={() => openCreateSubStage(etapa.id)} style={addBtnStyle()}>
                            <Plus size={12} /> Sub-etapa
                          </button>
                        </td>
                      </tr>
                    )
                )}
              </Fragment>
            )
          })}

          {canEdit && (
            creatingStage && subParentId === null
              ? stageFormRow(0)
              : (!creatingStage && (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td colSpan={8} style={{ padding: '8px 12px' }}>
                    <button onClick={openCreateStage} style={addBtnStyle()}>
                      <Plus size={12} /> Nova etapa
                    </button>
                  </td>
                </tr>
              ))
          )}
        </tbody>
      </table>

      <CronogramaRecalcModal
        open={!!recalcTrigger}
        projectId={projectId}
        trigger={recalcTrigger}
        onCancel={() => setRecalcTrigger(null)}
        onApplied={() => { setRecalcTrigger(null); onChanged() }}
      />
    </div>
    </CronoCalCtx.Provider>
  )
}

function th(width?: number): React.CSSProperties {
  return {
    padding: '8px 12px', fontSize: 10, fontWeight: 700,
    color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '.04em', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    width: width ? `${width}px` : undefined,
  }
}

function addBtnStyle(): React.CSSProperties {
  return {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: 12, padding: '4px 8px',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}

function FieldLabeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontSize: 9, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '.04em',
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

interface StageRowProps {
  projectId: number
  stage: ScheduleStage
  stages: ScheduleStage[]
  coordinators: ProjectCoordinator[]
  responsibleOptions: { id: number; name: string }[]
  clientOptions: { id: number; name: string }[]
  collapsed: boolean
  onToggle: () => void
  canEdit: boolean
  onChanged: () => void
  creatingActivity: boolean
  editingActivityId: number | null
  activityDraft: NewActivityDraft
  setActivityDraft: (next: NewActivityDraft | ((d: NewActivityDraft) => NewActivityDraft)) => void
  onStartCreateActivity: () => void
  onStartEditActivity: (d: StageDelivery) => void
  onCancelCreateActivity: () => void
  onConfirmCreateActivity: () => void
  idsWithDependents: Set<number>
  previewRecalc: ReturnType<typeof usePreviewRecalc>
  onOpenRecalcModal: (trigger: RecalcTrigger) => void
  calendar: BusinessCalendar
  codes: ReturnType<typeof buildCronogramaCodes>
  /** 0 = etapa de topo, 1 = sub-etapa. Controla a indentação. */
  depth?: number
  /** Rollup opcional p/ etapas-mãe: horas/datas somadas das sub-etapas. */
  rollup?: { hours: number; start: string | null; end: string | null } | null
}

function StageRows(props: StageRowProps) {
  const { stage, coordinators, responsibleOptions, clientOptions, collapsed, onToggle, canEdit, onChanged, creatingActivity, editingActivityId, activityDraft, setActivityDraft, onStartCreateActivity, onStartEditActivity, onCancelCreateActivity, onConfirmCreateActivity, idsWithDependents, previewRecalc, onOpenRecalcModal, calendar, codes, depth = 0, rollup = null } = props
  const cronoCal = useContext(CronoCalCtx)
  const { byUserId: capacityByUserId } = useUserCapacityIndex()

  const allDeliveries = stage.deliveries ?? []

  async function patchStage(field: string, value: unknown) {
    try {
      await api.patch(`/stages/${stage.id}`, { [field]: value })
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    }
  }

  async function deleteStage() {
    if (!confirm(`Excluir a etapa "${stage.name}"?\n\nIsso remove TODAS as atividades dentro dela.`)) return
    try {
      await api.delete(`/stages/${stage.id}`)
      onChanged()
      toast.success('Etapa removida')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao remover')
    }
  }

  return (
    <>
      {/* Linha da etapa (depth 0, bold) ou sub-etapa (depth 1, indentada) */}
      <tr style={{ borderTop: '1px solid var(--border)', background: depth > 0 ? 'var(--surface-hover)' : 'var(--surface)' }}>
        <td style={cell()}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingLeft: depth * 22 }}>
            <button onClick={onToggle} aria-label="Expandir/recolher" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, marginRight: 4 }}>
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <span style={{ fontSize: depth > 0 ? 12 : 13, fontWeight: depth > 0 ? 600 : 700, color: 'var(--text-muted)', minWidth: 18, fontVariantNumeric: 'tabular-nums' }}>
              {codes.stageCode(stage.id)}.
            </span>
            <InlineText
              value={stage.name}
              canEdit={canEdit}
              onSave={v => patchStage('name', v)}
              bold={depth === 0}
            />
            {depth > 0 && (
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', padding: '1px 5px', borderRadius: 4, background: 'var(--brand-soft, var(--surface))', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                sub-etapa
              </span>
            )}
          </div>
        </td>
        <td style={cell()}>
          <ResponsibleChip
            user={stage.responsible}
            capacity={stage.responsible ? capacityByUserId[stage.responsible.id] : undefined}
            size="sm"
          />
        </td>
        <td style={cell()}>
          <CronogramaDate value={stage.stage_start_at ?? null} canEdit={canEdit} onSave={v => patchStage('stage_start_at', v)} placeholder="Definir início" />
        </td>
        <td style={cell()}>
          <CronogramaDate value={stage.expected_end_date ?? null} canEdit={canEdit} onSave={v => patchStage('expected_end_date', v)} placeholder="Definir fim" />
        </td>
        <td style={cell()}>
          {(() => {
            // Etapa-mãe: usa o intervalo de datas somado das sub-etapas (rollup).
            const start = rollup ? rollup.start : stage.stage_start_at
            const end = rollup ? rollup.end : stage.expected_end_date
            return start && end ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {calendar.businessDaysBetween(start, end)} d.ú.
              </span>
            ) : (
              <span style={{ color: 'var(--text-light)' }}>—</span>
            )
          })()}
        </td>
        <td style={cell()}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {formatHours(rollup ? rollup.hours : num(stage.effective_hours_planned ?? stage.deliveries_hours_planned_sum))}
          </span>
        </td>
        <td style={cell()}>—</td>
        <td style={cell()}>
          {canEdit && (
            <button onClick={deleteStage} aria-label="Excluir etapa" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <Trash2 size={12} />
            </button>
          )}
        </td>
      </tr>

      {/* Atividades indentadas */}
      {!collapsed && allDeliveries.map(d => (
        <ActivityRow
          key={d.id}
          delivery={d}
          stageDeliveries={allDeliveries}
          canEdit={canEdit}
          onChanged={onChanged}
          hasDependents={idsWithDependents.has(d.id)}
          previewRecalc={previewRecalc}
          onOpenRecalcModal={onOpenRecalcModal}
          calendar={calendar}
          activityCode={codes.activityCode(d.id)}
          responsibleOptions={responsibleOptions}
          clientOptions={clientOptions}
          onStartEdit={() => onStartEditActivity(d)}
          indent={36 + depth * 22}
        />
      ))}

      {/* Linha de criação */}
      {!collapsed && canEdit && (
        creatingActivity ? (
          <tr style={{ background: 'var(--surface-hover)' }}>
            <td colSpan={8} style={{ padding: `10px 12px 10px ${36 + depth * 22}px` }}>
              {editingActivityId && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 8 }}>
                  ✏️ Editando atividade
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <FieldLabeled label="Título">
                  <input
                    autoFocus
                    className="ds-input"
                    value={activityDraft.title}
                    onChange={e => setActivityDraft(d => ({ ...d, title: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onConfirmCreateActivity()
                      if (e.key === 'Escape') onCancelCreateActivity()
                    }}
                    placeholder="Ex: SPED Fiscal…"
                    maxLength={200}
                    style={{ width: 220, fontSize: 13, padding: '4px 8px' }}
                  />
                </FieldLabeled>
                <FieldLabeled label="Responsável">
                  <SearchSelect
                    value={activityDraft.client_involved ? '' : activityDraft.responsible_user_id}
                    onChange={v => setActivityDraft(d => ({ ...d, responsible_user_id: v }))}
                    options={responsibleOptions}
                    placeholder={activityDraft.client_involved ? 'Cliente (responsável)' : '—'}
                    disabled={activityDraft.client_involved}
                  />
                </FieldLabeled>
                <FieldLabeled label="Início">
                  <HolidayDatePicker
                    value={activityDraft.planned_start_at || null}
                    onChange={v => {
                      const val = v ?? ''
                      setActivityDraft(d => {
                        const next = { ...d, planned_start_at: val }
                        // Auto-sugere fim quando user não digitou um fim manual
                        if (!d.dueTouched && val && d.hours_planned) {
                          const suggested = calendar.suggestedEndISO(val, Number(d.hours_planned), 8)
                          if (suggested) next.due_date = suggested
                        }
                        return next
                      })
                    }}
                    holidays={cronoCal.holidays}
                    allowWeekend={cronoCal.allowWeekend}
                    allowHoliday={cronoCal.allowHoliday}
                    placeholder="Início"
                  />
                </FieldLabeled>
                <FieldLabeled label="Fim">
                  <HolidayDatePicker
                    value={activityDraft.due_date || null}
                    onChange={v => setActivityDraft(d => ({ ...d, due_date: v ?? '', dueTouched: true }))}
                    holidays={cronoCal.holidays}
                    allowWeekend={cronoCal.allowWeekend}
                    allowHoliday={cronoCal.allowHoliday}
                    placeholder="Fim"
                  />
                </FieldLabeled>
                {/* Atividade do cliente é medida em DIAS — sem campo de horas. */}
                {!activityDraft.client_involved && (
                  <FieldLabeled label="Horas">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      className="ds-input"
                      value={activityDraft.hours_planned}
                      onChange={e => {
                        const v = e.target.value
                        setActivityDraft(d => {
                          const next = { ...d, hours_planned: v }
                          if (!d.dueTouched && d.planned_start_at && v) {
                            const suggested = calendar.suggestedEndISO(d.planned_start_at, Number(v), 8)
                            if (suggested) next.due_date = suggested
                          }
                          return next
                        })
                      }}
                      style={{ width: 80, fontSize: 13, padding: '4px 8px' }}
                    />
                  </FieldLabeled>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={onConfirmCreateActivity} className="ds-btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>{editingActivityId ? 'Salvar' : 'Criar'}</button>
                  <button onClick={onCancelCreateActivity} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Cancelar</button>
                </div>
              </div>

              <ActivityExtraSections
                draft={activityDraft}
                setDraft={setActivityDraft}
                coordinators={coordinators}
                responsibleOptions={responsibleOptions}
              />
            </td>
          </tr>
        ) : (
          <tr>
            <td colSpan={8} style={{ padding: '4px 12px 4px 36px' }}>
              <button onClick={onStartCreateActivity} style={addBtnStyle()}>
                <Plus size={12} /> Nova atividade
              </button>
            </td>
          </tr>
        )
      )}
    </>
  )
}

function ActivityRow({ delivery, stageDeliveries, canEdit, onChanged, hasDependents, previewRecalc, onOpenRecalcModal, calendar, activityCode, responsibleOptions, clientOptions, onStartEdit, indent = 36 }: {
  delivery: StageDelivery
  stageDeliveries: StageDelivery[]
  canEdit: boolean
  onChanged: () => void
  hasDependents: boolean
  previewRecalc: ReturnType<typeof usePreviewRecalc>
  onOpenRecalcModal: (trigger: RecalcTrigger) => void
  calendar: BusinessCalendar
  activityCode: string
  responsibleOptions: { id: number; name: string }[]
  clientOptions: { id: number; name: string }[]
  onStartEdit: () => void
  indent?: number
}) {
  const structuralFields = new Set(['planned_start_at', 'due_date', 'hours_planned', 'depends_on_delivery_id'])
  const { byUserId } = useUserCapacityIndex()
  const responsibleCapacity = delivery.responsible_user_id ? byUserId[delivery.responsible_user_id] : undefined

  async function patch(field: string, value: unknown) {
    try {
      // Campo estrutural — preview-first (Fase 10.1)
      if (structuralFields.has(field)) {
        const simulate: Record<string, unknown> = { [field]: value }
        // Sugestão automática de fim: se editou start ou horas e atividade não tem
        // due_date setado, simula com fim derivado pra preview já refletir.
        if (!delivery.due_date && field === 'planned_start_at' && value && delivery.hours_planned) {
          const suggested = calendar.suggestedEndISO(String(value), Number(delivery.hours_planned), 8)
          if (suggested) simulate.due_date = suggested
        }
        if (!delivery.due_date && field === 'hours_planned' && delivery.planned_start_at && value) {
          const suggested = calendar.suggestedEndISO(delivery.planned_start_at, Number(value), 8)
          if (suggested) simulate.due_date = suggested
        }

        const preview = await previewRecalc({
          type: 'delivery_field',
          deliveryId: delivery.id,
          simulate,
        })

        if (hasMeaningfulImpact(preview)) {
          // Há propagação — abre modal pra coord decidir (não faz PATCH ainda)
          onOpenRecalcModal({
            type: 'delivery_field',
            deliveryId: delivery.id,
            simulate,
          })
          return
        }

        // Sem impacto temporal — PATCH silencioso direto
        await api.patch(`/deliveries/${delivery.id}`, simulate)
        onChanged()
        return
      }

      // Campos triviais (title, status, priority, responsible_user_id, client_*) — PATCH direto
      await api.patch(`/deliveries/${delivery.id}`, { [field]: value })
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    }
  }

  async function del() {
    if (!confirm(`Excluir a atividade "${delivery.title}"?`)) return
    try {
      await api.delete(`/deliveries/${delivery.id}`)
      onChanged()
      toast.success('Atividade removida')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao remover')
    }
  }

  // Prefer enriched payload do /schedule; fallback lookup local.
  const predecessorRef = delivery.predecessor
    ?? (delivery.depends_on_delivery_id
        ? stageDeliveries.find(d => d.id === delivery.depends_on_delivery_id) ?? null
        : null)
  const isBlocked = delivery.predecessor_state === 'pending'
  const impactedTitles = delivery.impacted_titles ?? []
  // Atividade de responsabilidade do CLIENTE → linha em outra cor (faixa azul + borda).
  const isClientRow = !!delivery.client_involved

  return (
    <tr style={{
      borderTop: '1px solid var(--border)',
      ...(isClientRow ? { background: 'var(--info-bg)', boxShadow: 'inset 3px 0 0 var(--info)' } : {}),
    }}>
      <td style={{ ...cell(), paddingLeft: indent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {delivery.is_critical && (
            <span
              title="Atividade no caminho crítico (maior soma de horas no DAG FS)"
              style={{ fontSize: 12, lineHeight: 1 }}
            >🔥</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 28 }}>
            {activityCode}
          </span>
          <InlineText value={delivery.title} canEdit={canEdit} onSave={v => patch('title', v)} />
          {isClientRow && (
            <span
              title="Atividade de responsabilidade do cliente"
              style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 4, background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info)', whiteSpace: 'nowrap' }}
            >
              Cliente
            </span>
          )}
          {isBlocked && predecessorRef && (
            <span
              title={`Bloqueada por: ${predecessorRef.title}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <Lock size={10} /> Bloqueada por: <strong>{predecessorRef.title}</strong>
            </span>
          )}
          {hasDependents && (
            <ImpactPopover titles={impactedTitles} />
          )}
        </div>
      </td>
      <td style={cell()}>
        {canEdit ? (
          // Responsável unificado: pessoa (consultor/coord/exec) OU cliente. Selecionar
          // cliente marca a atividade como responsabilidade do cliente; pessoa "des-cliente".
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <SearchSelect
              value={delivery.client_involved
                ? (delivery.client_user_id ? String(delivery.client_user_id) : '')
                : (delivery.responsible_user_id ? String(delivery.responsible_user_id) : '')}
              onChange={v => {
                const isClient = clientOptions.some(c => String(c.id) === v)
                const body = isClient
                  ? { client_user_id: Number(v), client_involved: true, responsible_user_id: null }
                  : { responsible_user_id: v ? Number(v) : null, client_involved: false, client_user_id: null }
                api.patch(`/deliveries/${delivery.id}`, body)
                  .then(() => onChanged())
                  .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar'))
              }}
              options={[
                ...responsibleOptions,
                ...clientOptions.map(c => ({ id: c.id, name: `${c.name} (cliente)` })),
              ]}
              placeholder={delivery.client_involved && !delivery.client_user_id ? (delivery.client_email ?? 'Cliente') : '—'}
              subtle
            />
            {isClientRow && (delivery.extra_clients?.length ?? 0) > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>+{delivery.extra_clients!.length}</span>
            )}
          </div>
        ) : isClientRow ? (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--info)', fontWeight: 500 }}
            title="Atividade de responsabilidade do cliente"
          >
            {delivery.client?.name ?? delivery.client_email ?? 'Cliente'}
            {(delivery.extra_clients?.length ?? 0) > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>+{delivery.extra_clients!.length}</span>
            )}
          </span>
        ) : (
          <ResponsibleChip user={delivery.responsible} capacity={responsibleCapacity} size="sm" />
        )}
      </td>
      <td style={cell()}>
        <CronogramaDate value={delivery.planned_start_at ?? null} canEdit={canEdit} onSave={v => patch('planned_start_at', v)} placeholder="Definir início" />
      </td>
      <td style={cell()}>
        <CronogramaDate value={delivery.due_date ?? null} canEdit={canEdit} onSave={v => patch('due_date', v)} placeholder="Definir fim" />
      </td>
      <td style={cell()}>
        {delivery.planned_start_at && canEdit ? (
          <InlineNumber
            value={delivery.duration_business_days ?? calendar.businessDaysBetween(delivery.planned_start_at, delivery.due_date ?? delivery.planned_start_at)}
            canEdit
            onSave={async (n) => {
              const N = Math.max(1, Math.floor(n))
              const newEnd = calendar.addBusinessDays(
                parseDateLocal(delivery.planned_start_at!),
                N - 1,
              )
              const iso = newEnd.toISOString().slice(0, 10)
              await patch('due_date', iso)
            }}
          />
        ) : typeof delivery.duration_business_days === 'number' ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {delivery.duration_business_days} d.ú.
          </span>
        ) : (
          <span style={{ color: 'var(--text-light)' }}>—</span>
        )}
      </td>
      <td style={cell()}>
        {/* Atividade do cliente é medida em DIAS, não horas — sem campo de horas. */}
        {isClientRow
          ? <span style={{ color: 'var(--text-light)' }}>—</span>
          : <InlineNumber value={num(delivery.hours_planned)} canEdit={canEdit} onSave={v => patch('hours_planned', v)} />}
      </td>
      <td style={cell()}>
        <InlineDependencySelect
          value={delivery.depends_on_delivery_id ?? null}
          options={stageDeliveries.filter(d => d.id !== delivery.id)}
          canEdit={canEdit}
          onSave={v => patch('depends_on_delivery_id', v)}
        />
      </td>
      <td style={cell()}>
        {canEdit && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button onClick={onStartEdit} aria-label="Editar atividade" title="Editar (responsável, cliente, datas…)" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <Pencil size={12} />
            </button>
            <button onClick={del} aria-label="Excluir atividade" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

function cell(): React.CSSProperties {
  return { padding: '6px 12px', verticalAlign: 'middle' }
}

function InlineText({ value, canEdit, onSave, bold }: {
  value: string
  canEdit: boolean
  onSave: (v: string) => void
  bold?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <span
        onClick={() => { if (canEdit) { setDraft(value); setEditing(true) } }}
        style={{
          cursor: canEdit ? 'text' : 'default',
          fontWeight: bold ? 600 : 400,
          color: 'var(--text)',
        }}
      >
        {value || <em style={{ color: 'var(--text-light)' }}>—</em>}
      </span>
    )
  }
  return (
    <input
      autoFocus
      className="ds-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); setEditing(false) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.currentTarget.blur() }
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      style={{ fontSize: 13, padding: '2px 6px', width: '100%', fontWeight: bold ? 600 : 400 }}
    />
  )
}

function InlineDate({ value, canEdit, onSave, placeholder = 'Definir' }: {
  value: string | null
  canEdit: boolean
  onSave: (v: string | null) => void
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ? value.slice(0, 10) : '')

  if (!editing) {
    return (
      <span
        onClick={() => { if (canEdit) { setDraft(value ? value.slice(0, 10) : ''); setEditing(true) } }}
        style={{
          cursor: canEdit ? 'pointer' : 'default',
          fontSize: 12,
          color: value ? 'var(--text)' : (canEdit ? 'var(--primary)' : 'var(--text-light)'),
          fontVariantNumeric: 'tabular-nums',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontStyle: value ? 'normal' : 'italic',
        }}
      >
        {value ? (
          // Formata o YYYY-MM-DD direto (sem new Date) — datas vêm como meia-noite UTC
          // e new Date() as joga pro dia anterior no fuso BR (off-by-one).
          (() => { const [y, m, d] = value.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` })()
        ) : (
          canEdit ? (<><Calendar size={11} /> {placeholder}</>) : <>—</>
        )}
      </span>
    )
  }
  return (
    <input
      autoFocus
      type="date"
      className="ds-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const newVal = draft || null
        if (newVal !== value) onSave(newVal)
        setEditing(false)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
      }}
      style={{ fontSize: 12, padding: '2px 6px', width: 110 }}
    />
  )
}

function InlineNumber({ value, canEdit, onSave }: {
  value: number
  canEdit: boolean
  onSave: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  if (!editing) {
    return (
      <span
        onClick={() => { if (canEdit) { setDraft(String(value)); setEditing(true) } }}
        style={{
          cursor: canEdit ? 'text' : 'default',
          fontSize: 12, fontVariantNumeric: 'tabular-nums',
          color: value > 0 ? 'var(--text)' : 'var(--text-light)',
        }}
      >
        {value > 0 ? formatHours(value) : '—'}
      </span>
    )
  }
  return (
    <input
      autoFocus
      type="number"
      min={0}
      step="0.5"
      className="ds-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (Number.isFinite(n) && n !== value) onSave(n)
        setEditing(false)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) }
      }}
      style={{ fontSize: 12, padding: '2px 6px', width: 70 }}
    />
  )
}

function InlineDependencySelect({ value, options, canEdit, onSave }: {
  value: number | null
  options: StageDelivery[]
  canEdit: boolean
  onSave: (v: number | null) => void
}) {
  const selected = value ? options.find(o => o.id === value) : null

  if (!canEdit) {
    return (
      <span style={{ fontSize: 12, color: selected ? 'var(--text)' : 'var(--text-light)' }}>
        {selected ? selected.title : '—'}
      </span>
    )
  }
  return (
    <select
      className="ds-input"
      value={value ?? ''}
      onChange={e => {
        const v = e.target.value
        onSave(v === '' ? null : Number(v))
      }}
      style={{ fontSize: 12, padding: '2px 6px', width: '100%' }}
    >
      <option value="">—</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>{o.title}</option>
      ))}
    </select>
  )
}

interface ConsultantOption {
  id: number
  name: string
  email?: string | null
}

function ActivityExtraSections({ draft, setDraft, coordinators, responsibleOptions }: {
  draft: NewActivityDraft
  setDraft: (next: NewActivityDraft | ((d: NewActivityDraft) => NewActivityDraft)) => void
  coordinators: ProjectCoordinator[]
  responsibleOptions: { id: number; name: string }[]
}) {
  const [clientOptions, setClientOptions] = useState<ConsultantOption[]>([])
  const [allocHours, setAllocHours] = useState('8')

  // Clientes cadastrados (type=cliente) — carregados ao marcar "Envolver cliente".
  // A busca por texto fica no próprio SearchSelect (filtragem client-side, mesmo
  // conceito do Responsável).
  useEffect(() => {
    if (!draft.client_involved || clientOptions.length > 0) return
    api.get<{ items?: ConsultantOption[]; data?: ConsultantOption[] } | ConsultantOption[]>(
      `/users?type=cliente&minimal=true&pageSize=500`,
    )
      .then(res => {
        const list = Array.isArray(res) ? res : (res.items ?? res.data ?? [])
        setClientOptions(list ?? [])
      })
      .catch(() => setClientOptions([]))
  }, [draft.client_involved, clientOptions.length])

  function addExtraAllocation(u: ConsultantOption) {
    const n = Number(allocHours)
    if (!Number.isFinite(n) || n < 0.5) return
    setDraft(d => ({
      ...d,
      extra_allocations: [...d.extra_allocations, { user_id: u.id, user_name: u.name, planned_hours: String(n) }],
    }))
  }

  function addExtraClient(c: ExtraClientDraft) {
    setDraft(d => ({ ...d, extra_clients: [...d.extra_clients, c] }))
  }
  function removeExtraClient(idx: number) {
    setDraft(d => ({ ...d, extra_clients: d.extra_clients.filter((_, i) => i !== idx) }))
  }

  function removeExtraAllocation(userId: number) {
    setDraft(d => ({
      ...d,
      extra_allocations: d.extra_allocations.filter(a => a.user_id !== userId),
    }))
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {/* Toggle envolver cliente */}
      <div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          color: 'var(--text)', fontWeight: 500,
        }}>
          <input
            type="checkbox"
            checked={draft.client_involved}
            onChange={e => setDraft(d => ({ ...d, client_involved: e.target.checked, responsible_user_id: e.target.checked ? '' : d.responsible_user_id }))}
          />
          Envolver cliente
        </label>

        {draft.client_involved && (
          <div style={{
            marginTop: 6, marginLeft: 22, padding: 10,
            background: 'var(--primary-soft)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap',
          }}>
            <FieldLabeled label="Cliente cadastrado">
              <div style={{ width: 240 }}>
                <SearchSelect
                  value={draft.client_user_id}
                  onChange={v => setDraft(d => ({
                    ...d,
                    client_user_id: v,
                    client_email: v ? '' : d.client_email,
                  }))}
                  options={clientOptions.map(c => ({ id: c.id, name: c.email ? `${c.name} (${c.email})` : c.name }))}
                  placeholder="Buscar cliente…"
                  fullWidth
                />
              </div>
            </FieldLabeled>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>ou</span>
            <FieldLabeled label="E-mail externo">
              <input
                type="email"
                className="ds-input"
                placeholder="cliente@empresa.com"
                value={draft.client_email}
                onChange={e => setDraft(d => ({
                  ...d,
                  client_email: e.target.value,
                  client_user_id: e.target.value ? '' : d.client_user_id,
                }))}
                style={{ fontSize: 12, padding: '4px 8px', width: 220 }}
              />
            </FieldLabeled>

            {/* Incluir mais clientes (além do primário) — igual "alocar mais consultores" */}
            <div style={{ width: '100%', marginTop: 4 }}>
              <div style={{ color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, fontSize: 12 }}>
                Incluir mais clientes <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>(opcional)</span>
              </div>
              {draft.extra_clients.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {draft.extra_clients.map((c, i) => (
                    <li key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', fontSize: 11 }}>
                      <span>{c.name}</span>
                      <button type="button" onClick={() => removeExtraClient(i)} aria-label="Remover" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 280 }}>
                  <SearchSelect
                    value=""
                    onChange={id => {
                      if (!id) return
                      const c = clientOptions.find(o => String(o.id) === id)
                      if (c && !draft.extra_clients.some(x => x.user_id === c.id)) {
                        addExtraClient({ user_id: c.id, email: c.email ?? undefined, name: c.email ? `${c.name} (${c.email})` : c.name })
                      }
                    }}
                    options={clientOptions
                      .filter(c => !draft.extra_clients.some(x => x.user_id === c.id) && String(c.id) !== draft.client_user_id)
                      .map(c => ({ id: c.id, name: c.email ? `${c.name} (${c.email})` : c.name }))}
                    placeholder="Adicionar cliente cadastrado…"
                    fullWidth
                  />
                </div>
                <input
                  type="email"
                  className="ds-input"
                  placeholder="ou e-mail externo + Enter"
                  onKeyDown={e => {
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (e.key === 'Enter' && v) {
                      e.preventDefault()
                      if (!draft.extra_clients.some(x => x.email === v)) addExtraClient({ email: v, name: v })
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                  style={{ fontSize: 12, padding: '4px 8px', width: 220 }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alocações adicionais — escondido quando o cliente é o responsável da atividade */}
      {!draft.client_involved && (
      <div>
        <div style={{ color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>
          Alocar mais consultores <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>(opcional — equipe da atividade)</span>
        </div>

        {draft.extra_allocations.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {draft.extra_allocations.map(a => (
              <li key={a.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 8px', background: 'var(--surface)', borderRadius: 4,
                border: '1px solid var(--border)', fontSize: 12,
              }}>
                <span style={{ flex: 1 }}>{a.user_name}</span>
                <input
                  type="number"
                  min={0.5}
                  step="0.5"
                  className="ds-input"
                  value={a.planned_hours}
                  onChange={e => setDraft(d => ({
                    ...d,
                    extra_allocations: d.extra_allocations.map(x =>
                      x.user_id === a.user_id ? { ...x, planned_hours: e.target.value } : x
                    ),
                  }))}
                  style={{ fontSize: 12, padding: '2px 6px', width: 70 }}
                />
                <span style={{ color: 'var(--text-muted)' }}>h</span>
                <button
                  type="button"
                  onClick={() => removeExtraAllocation(a.user_id)}
                  aria-label="Remover"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2, fontSize: 14, lineHeight: 1,
                  }}
                >×</button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <SearchSelect
              value=""
              onChange={id => {
                if (!id) return
                const u = responsibleOptions.find(o => String(o.id) === id)
                if (u) addExtraAllocation({ id: u.id, name: u.name })
              }}
              options={responsibleOptions.filter(u =>
                !draft.extra_allocations.some(a => a.user_id === u.id)
                && (!draft.responsible_user_id || Number(draft.responsible_user_id) !== u.id)
              )}
              placeholder="Buscar consultor…"
              fullWidth
            />
          </div>
          <input
            type="number"
            min={0.5}
            step="0.5"
            className="ds-input"
            value={allocHours}
            onChange={e => setAllocHours(e.target.value)}
            title="Horas planejadas"
            style={{ fontSize: 12, padding: '4px 8px', width: 70 }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>h</span>
        </div>
      </div>
      )}
    </div>
  )
}

function ImpactPopover({ titles }: { titles: string[] }) {
  const count = titles.length
  if (count === 0) return null
  const limit = 5
  const shown = titles.slice(0, limit)
  const rest = count - shown.length
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 6px', borderRadius: 4,
              background: 'var(--primary-soft)', color: 'var(--primary)',
              fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap',
              border: 'none', cursor: 'pointer',
            }}
          />
        }
      >
        ⚠ Impacta {count}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" style={{ width: 260, padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Impactará na cadeia
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: 'var(--text)' }}>
          {shown.map((t, i) => (
            <li key={i} style={{ padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              · {t}
            </li>
          ))}
          {rest > 0 && (
            <li style={{ padding: '2px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              e mais {rest}…
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
