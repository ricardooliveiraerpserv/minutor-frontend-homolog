'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ApiError, api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Info, Plus, Eye, EyeOff, Settings,
  Layers, CheckSquare, Play, Lock, UserCheck, CalendarClock,
} from 'lucide-react'
import { useProjectSchedule } from '@/hooks/use-project-schedule'
import { notifyProjectUpdated } from '@/lib/project-events'
import { cronogramaPoolHours } from '@/lib/cronograma-pool'
import { useAuth } from '@/hooks/use-auth'
import { useExecutiveMode } from '@/hooks/use-executive-mode'
import { KpiCard } from '@/components/ui/kpi-card'
import type { ProjectStage } from '@/lib/types/project-stage'
import { OperacaoView } from './views/operacao'
import { PlanejamentoView } from './views/planejamento'
import { TimelineView } from './views/timeline'
import { CronogramaSettingsModal } from '@/components/projects/cronograma-settings-modal'
import { CronogramaExecutiveHeader } from '@/components/projects/cronograma-executive-header'
import { CronogramaAlertsList } from '@/components/projects/cronograma-alerts-list'
import { CronogramaRecalcModal } from '@/components/projects/cronograma-recalc-modal'
import { CronogramaModelosModal } from '@/components/projects/cronograma-modelos-modal'
import { ClientSchedule } from '@/components/projects/client-schedule'
import type { RecalcTrigger } from '@/hooks/use-preview-recalc'

type ViewMode = 'operacao' | 'planejamento' | 'timeline'
const ALLOWED_VIEWS: ViewMode[] = ['operacao', 'planejamento', 'timeline']
/** Compat permanente: bookmarks/links antigos continuam funcionando. */
const LEGACY_MAP: Record<string, ViewMode> = {
  board: 'operacao',
  tabela: 'planejamento',
  gantt: 'timeline',
}
const LS_KEY = (projectId: number) => `cronograma:view:${projectId}`

function normalizeView(raw: string | null): ViewMode | null {
  if (!raw) return null
  if ((ALLOWED_VIEWS as string[]).includes(raw)) return raw as ViewMode
  if (raw in LEGACY_MAP) return LEGACY_MAP[raw]
  return null
}

/**
 * Hub do Cronograma — view única (ADR 0009): Operação (kanban macro de etapas),
 * Planejamento (linha-a-linha editável) e Timeline (Gantt) são modos da mesma
 * fonte operacional.
 * View atual em `?view=operacao|planejamento|timeline` (default operacao).
 * Legacy: board → operacao, tabela → planejamento, gantt → timeline (normalizado
 * silently na leitura inicial e em localStorage).
 */
export default function CronogramaPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const { user } = useAuth()
  // Cliente: visão em dias, sem horas/valores, cards bloqueados com cadeado.
  if (user?.type === 'cliente') return <ClientSchedule projectId={projectId} />
  return <InternalCronogramaPage />
}

function InternalCronogramaPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const canEdit = user?.type !== 'consultor' && user?.type !== 'cliente'
  const [executive, toggleExecutive] = useExecutiveMode()
  const [highlightUserId, setHighlightUserId] = useState<number | null>(null)

  const view: ViewMode = normalizeView(searchParams.get('view')) ?? 'operacao'

  const { isOperational, project, stages, projectWindow, holidays, executive: executiveSummary, alerts, teamLoad, loading, error, refetch } =
    useProjectSchedule(projectId)

  // Pós-mutação no cronograma: refaz o schedule E avisa o header (layout) pra
  // ele recarregar o projeto — o "Prazo de entrega" deriva da última data daqui.
  const refresh = () => { refetch(); notifyProjectUpdated(projectId) }

  // Restore last-used view do localStorage quando entra sem ?view= explícito.
  // Normaliza legacy (board/tabela/gantt) → operacao/planejamento/timeline.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (searchParams.has('view')) {
      // Se URL veio com legacy (board/tabela/gantt), reescreve silently pra novo nome.
      const raw = searchParams.get('view')
      const normalized = normalizeView(raw)
      if (normalized && raw !== normalized) {
        const sp = new URLSearchParams(searchParams.toString())
        sp.set('view', normalized)
        router.replace(`?${sp.toString()}`)
      }
      return
    }
    const last = window.localStorage.getItem(LS_KEY(projectId))
    const normalized = normalizeView(last)
    if (normalized && normalized !== 'operacao') {
      const sp = new URLSearchParams(searchParams.toString())
      sp.set('view', normalized)
      router.replace(`?${sp.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function setView(v: ViewMode) {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('view', v)
    router.replace(`?${sp.toString()}`)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY(projectId), v)
    }
  }

  // Hotkeys globais: 1/2/3 trocam de view. Guard pra não disparar em inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && t.matches?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === '1') { setView('planejamento'); e.preventDefault() }
      else if (e.key === '2') { setView('timeline'); e.preventDefault() }
      else if (e.key === '3') { setView('operacao'); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, searchParams.toString()])

  const counts = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    let totalActivities = 0
    let totalHoursPlanned = 0
    let inProgressCount = 0
    let waitingClientCount = 0
    let blockedCount = 0
    let conflictsCount = 0   // Planejamento: predecessor termina depois do dependente começar (FS violado)
    let overdueCount = 0     // Timeline: due_date < hoje e status !== done
    const titleById: Record<number, string> = {}
    const endById: Record<number, string | null> = {}
    for (const st of stages) {
      for (const d of st.deliveries ?? []) {
        titleById[d.id] = d.title
        endById[d.id] = d.due_date ?? null
      }
    }
    for (const st of stages) {
      const deliveries = st.deliveries ?? []
      totalActivities += deliveries.length
      for (const d of deliveries) {
        totalHoursPlanned += Number(d.hours_planned) || 0
        if (d.status === 'in_progress') inProgressCount++
        if (d.status === 'waiting_client') waitingClientCount++
        if (d.predecessor_state === 'pending') blockedCount++
        if (d.due_date && d.status !== 'done' && d.due_date < todayIso) overdueCount++
        // Conflito FS: predecessor.due_date > minha planned_start_at
        if (d.depends_on_delivery_id && d.planned_start_at) {
          const predEnd = endById[d.depends_on_delivery_id]
          if (predEnd && predEnd > d.planned_start_at) conflictsCount++
        }
      }
    }
    return { totalActivities, totalHoursPlanned, inProgressCount, waitingClientCount, blockedCount, conflictsCount, overdueCount }
  }, [stages])

  // Deep link contextual: ?stage=N | ?activity=N — estrutura preparada pra futuros
  // estados (drill direto em etapa/atividade). Aqui só validamos parsing seguro
  // sem efeito colateral — quando precisar atuar, os children consomem via prop.
  const deepLink = useMemo(() => {
    const stageRaw = searchParams.get('stage')
    const activityRaw = searchParams.get('activity')
    const toIntOrNull = (s: string | null): number | null => {
      if (!s) return null
      const n = Number(s)
      return Number.isInteger(n) && n > 0 ? n : null
    }
    return {
      stageId: toIntOrNull(stageRaw),
      activityId: toIntOrNull(activityRaw),
    }
  }, [searchParams])

  // Form criar etapa (vive aqui, no hub)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelosOpen, setModelosOpen] = useState(false)
  const [calendarRecalc, setCalendarRecalc] = useState<RecalcTrigger | null>(null)
  const allowWeekend = !!project?.allow_weekend_work
  const allowHoliday = !!project?.allow_holiday_work
  const calendarFlexible = allowWeekend || allowHoliday

  async function handleCreateStage(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const hoursNum = hours ? Number(hours) : 0
    setSaving(true)
    try {
      await api.post<ProjectStage>(`/projects/${projectId}/stages`, {
        name: name.trim(),
        hours_planned: hoursNum,
      })
      setName(''); setHours(''); setCreating(false)
      refresh()
      toast.success('Etapa criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar etapa')
    } finally {
      setSaving(false)
    }
  }

  // Só mostra o placeholder no carregamento INICIAL. Em refetch (após salvar) os dados
  // persistem, então mantemos a tabela montada — senão a tela desmonta e rola pro topo.
  if (loading && !project) return <div style={{ color: 'var(--text-muted)' }}>Carregando cronograma…</div>
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>

  if (!isOperational) {
    return (
      <div style={{
        padding: '32px 24px', textAlign: 'center',
        border: '1px dashed var(--border)', borderRadius: 8,
      }}>
        <Info size={20} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
          Projeto de sustentação
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, maxWidth: 480, margin: '6px auto 0' }}>
          Cronograma é só pra projetos operacionais. Sustentação opera por demanda contínua, sem fases planejadas.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Fase 10: header executivo + alertas (acima dos KPIs simples) */}
      {executiveSummary && (
        <CronogramaExecutiveHeader
          executive={executiveSummary}
          teamLoad={teamLoad}
          alerts={alerts}
        />
      )}
      {alerts.length > 0 && <CronogramaAlertsList alerts={alerts} />}

      {/* Strip de KPIs operacionais */}
      <div style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: executive
          ? 'repeat(auto-fit, minmax(160px, 1fr))'
          : 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <KpiCard label="Etapas"     value={stages.length}                icon={Layers}      accent="default" />
        <KpiCard label="Atividades" value={counts.totalActivities}        icon={CheckSquare} accent="default"
                 hint={`${Math.round(counts.totalHoursPlanned)}h planejadas`} />
        {!executive && (
          <KpiCard label="Em execução" value={counts.inProgressCount} icon={Play} accent="primary" />
        )}
        <KpiCard label="Bloqueadas" value={counts.blockedCount} icon={Lock}
                 accent={counts.blockedCount > 0 ? 'danger' : 'default'} />
        {!executive && (
          <KpiCard label="Aguardando cliente" value={counts.waitingClientCount} icon={UserCheck}
                   accent={counts.waitingClientCount > 0 ? 'warning' : 'default'} />
        )}
      </div>

      {/* Toolbar: segmented control + ações — sticky no topo */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 16,
        position: 'sticky',
        top: 0,
        zIndex: 6,
        background: 'var(--bg)',
        paddingTop: 8,
        paddingBottom: 8,
      }}>
        <SegmentedControl current={view} onChange={setView} counts={{
          operacao: counts.inProgressCount,
          planejamento: counts.conflictsCount,
          timeline: counts.overdueCount,
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {project && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Liberado à gestão: <strong style={{ color: 'var(--text)' }}>{cronogramaPoolHours(project)}h</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => toggleExecutive()}
            title={executive ? 'Sair do modo executivo' : 'Ativar modo executivo — esconde detalhes operacionais'}
            className="ds-btn-ghost"
            style={{
              fontSize: 12, padding: '6px 10px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: executive ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: executive ? 600 : 400,
            }}
          >
            {executive ? <EyeOff size={12} /> : <Eye size={12} />}
            Modo executivo
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Configurações do Cronograma"
              className="ds-btn-ghost"
              style={{
                fontSize: 12, padding: '6px 10px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: calendarFlexible ? 'var(--warning)' : 'var(--text-muted)',
                fontWeight: calendarFlexible ? 600 : 400,
              }}
            >
              <Settings size={12} />
              Configurações
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setModelosOpen(true)}
              title="Salvar/aplicar modelo de cronograma ou copiar de outro projeto"
              className="ds-btn-ghost"
              style={{ fontSize: 12, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}
            >
              <Layers size={12} />
              Modelos
            </button>
          )}
          {canEdit && !creating && (
            <button
              type="button"
              className="ds-btn-primary"
              onClick={() => setCreating(true)}
              style={{ fontSize: 13, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Nova etapa
            </button>
          )}
        </div>
      </div>

      {creating && (
        <form
          onSubmit={handleCreateStage}
          className="ds-card ds-card-pad"
          style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div style={{ flex: '1 1 240px' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nome</label>
            <input
              autoFocus className="ds-input" value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Fiscal, Compras, Integrações…" maxLength={100}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
          <div style={{ width: 140 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Horas previstas</label>
            <input
              className="ds-input" type="number" min={0} step="0.5"
              value={hours} onChange={e => setHours(e.target.value)}
              placeholder="0" style={{ width: '100%', marginTop: 4 }}
            />
          </div>
          <button type="submit" className="ds-btn-primary"
            style={{ fontSize: 13, padding: '8px 14px' }}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Salvando…' : 'Criar'}
          </button>
          <button type="button" className="ds-btn-ghost"
            style={{ fontSize: 13, padding: '8px 14px' }}
            onClick={() => { setCreating(false); setName(''); setHours('') }}
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Banner: cronograma é uma fonte só */}
      <div style={{
        marginBottom: 12,
        padding: '8px 12px',
        background: 'var(--primary-soft)',
        borderRadius: 6,
        fontSize: 11, color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Info size={11} />
        <span>
          Cronograma é a camada operacional do projeto: <strong>Planejamento</strong>, <strong>Linha do Tempo</strong> e <strong>Operação</strong> são views da mesma fonte (ADR 0009). Atalhos: <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd>.
        </span>
      </div>

      {calendarFlexible && (
        <div
          title={[
            allowWeekend ? 'Inclui sábado/domingo' : null,
            allowHoliday ? 'Inclui feriados' : null,
          ].filter(Boolean).join(' · ')}
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            borderRadius: 6,
            fontSize: 11, color: 'var(--warning)',
            display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
          }}
        >
          <CalendarClock size={11} />
          📅 Calendário operacional especial — {allowWeekend && allowHoliday ? 'sábado/domingo + feriados' : allowWeekend ? 'sábado/domingo' : 'feriados'} contam como dias úteis
        </div>
      )}

      {/* View ativa — key força remontagem suave; CSS animation fade-in rápido */}
      <div key={view} className="cronograma-view-fade">
        {view === 'operacao' && <OperacaoView projectId={projectId} stages={stages} onChanged={refresh} canEdit={canEdit} />}
        {view === 'planejamento' && (
          <PlanejamentoView
            projectId={projectId}
            stages={stages}
            coordinators={project?.coordinators ?? []}
            canEdit={canEdit}
            holidays={holidays}
            calendarOpts={{ allowWeekend, allowHoliday }}
            onChanged={refresh}
          />
        )}
        {view === 'timeline' && (
          <TimelineView
            stages={stages}
            projectWindow={projectWindow}
            canEdit={canEdit}
            highlightUserId={highlightUserId}
            onSelectUser={setHighlightUserId}
            onChanged={refresh}
          />
        )}
      </div>
      <style jsx>{`
        .cronograma-view-fade {
          animation: cronograma-fade-in .14s ease-out;
        }
        @keyframes cronograma-fade-in {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {canEdit && (
        <CronogramaSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          projectId={projectId}
          initial={{ allow_weekend_work: allowWeekend, allow_holiday_work: allowHoliday }}
          onSaved={refetch}
          onCalendarChanged={(simulate) => setCalendarRecalc({ type: 'project_calendar', simulate })}
        />
      )}

      {/* Fase 10.1: recalc modal disparado pelo Settings (informativo — PATCH já foi). */}
      <CronogramaRecalcModal
        open={!!calendarRecalc}
        projectId={projectId}
        trigger={calendarRecalc}
        onCancel={() => setCalendarRecalc(null)}
        onApplied={() => { setCalendarRecalc(null); refresh() }}
      />

      {canEdit && (
        <CronogramaModelosModal
          open={modelosOpen}
          onClose={() => setModelosOpen(false)}
          projectId={projectId}
          onApplied={refresh}
        />
      )}
    </div>
  )
}

type SegmentedCounts = Record<ViewMode, number>

function SegmentedControl({
  current, onChange, counts,
}: {
  current: ViewMode
  onChange: (v: ViewMode) => void
  counts: SegmentedCounts
}) {
  const opts: { value: ViewMode; label: string; hintBase: string; countSuffix: (n: number) => string; countTone: 'primary' | 'warning' | 'danger' }[] = [
    { value: 'planejamento', label: 'Planejamento',   hintBase: 'Atalho: 1', countSuffix: n => `${n} conflito${n === 1 ? '' : 's'}`, countTone: 'warning' },
    { value: 'timeline',     label: 'Linha do Tempo', hintBase: 'Atalho: 2', countSuffix: n => `${n} atrasada${n === 1 ? '' : 's'}`, countTone: 'danger' },
    { value: 'operacao',     label: 'Operação',       hintBase: 'Atalho: 3', countSuffix: n => `${n} em execução`,                  countTone: 'primary' },
  ]
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--primary)',
      borderRadius: 12,
      overflow: 'hidden',
      background: 'var(--surface)',
      padding: 4,
      gap: 4,
    }}>
      {opts.map((opt) => {
        const active = current === opt.value
        const n = counts[opt.value] ?? 0
        return (
          <button
            key={opt.value}
            type="button"
            title={n > 0 ? `${opt.hintBase} · ${opt.countSuffix(n)}` : opt.hintBase}
            onClick={() => onChange(opt.value)}
            className={active ? 'ds-tab-active' : 'ds-tab-inactive'}
            style={{
              padding: '11px 24px',
              fontSize: 15,
              fontWeight: active ? 700 : 600,
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? 'var(--primary-fg)' : 'var(--text)',
              border: 'none',
              borderRadius: 9,
              cursor: 'pointer',
              transition: 'background .15s ease, color .15s ease',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {opt.label}
            {n > 0 && (
              <span
                style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: `var(--${opt.countTone}-bg)`,
                  color: `var(--${opt.countTone})`,
                  border: `1px solid var(--${opt.countTone}-border)`,
                  minWidth: 18,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
