'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ApiError, api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Info, Plus, Eye, EyeOff, Settings, Pencil,
  Layers, CalendarClock, ListChecks, Play, Lock, UserCheck, Clock, Users, Activity, Bell,
  LayoutGrid, List,
} from 'lucide-react'
import { useProjectSchedule, type LastMovement } from '@/hooks/use-project-schedule'
import { useApiQuery } from '@/hooks/use-query'
import { notifyProjectUpdated } from '@/lib/project-events'
import { cronogramaPoolHours } from '@/lib/cronograma-pool'
import { useAuth } from '@/hooks/use-auth'
import { TimesheetFormModal } from '@/components/ui/timesheet-form-modal'
import { ExpenseQuickModal } from '@/components/ui/expense-quick-modal'
import { useExecutiveMode } from '@/hooks/use-executive-mode'
import type { ProjectStage } from '@/lib/types/project-stage'
import { OperacaoView } from './views/operacao'
import { ActivityGroups, DespesasView } from '../gestao-operacional/page'
import { PlanejamentoView } from './views/planejamento'
import { TimelineView } from './views/timeline'
import { IndicadoresView } from './views/indicadores'
import { EquipeView } from './views/equipe'
import { ProjectConversation } from '@/components/portal-cliente/project-conversation'
import { ProjectMessages } from '@/components/shared/ProjectMessages'
import { CronogramaEvmPanel } from '@/components/projects/cronograma-evm-panel'
import { ProjectDocsPanel } from '@/components/projects/project-docs-panel'
import { CronogramaSettingsModal } from '@/components/projects/cronograma-settings-modal'
import { CronogramaAlertsList } from '@/components/projects/cronograma-alerts-list'
import { CronogramaRecalcModal } from '@/components/projects/cronograma-recalc-modal'
import { CronogramaModelosModal } from '@/components/projects/cronograma-modelos-modal'
import { ClientSchedule } from '@/components/projects/client-schedule'
import type { RecalcTrigger } from '@/hooks/use-preview-recalc'

type ViewMode = 'operacao' | 'planejamento' | 'timeline' | 'indicadores' | 'equipe' | 'conversa' | 'diary' | 'documentos'
const ALLOWED_VIEWS: ViewMode[] = ['operacao', 'planejamento', 'timeline', 'indicadores', 'equipe', 'conversa', 'diary', 'documentos']
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
  return <Suspense fallback={null}><CronogramaPageInner /></Suspense>
}

function CronogramaPageInner() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const { user } = useAuth()
  // Cliente: visão em dias, sem horas/valores, cards bloqueados com cadeado.
  if (user?.type === 'cliente') return <ClientSchedule projectId={projectId} />
  return <InternalCronogramaPage />
}

function fmtShortDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d} dia${d === 1 ? '' : 's'}`
}

// Rótulo por tipo de movimentação (apontamento OU evento de atividade).
const MOV_COL_LABEL: Record<string, string> = {
  backlog: 'A fazer', in_progress: 'Em andamento', review: 'Em revisão',
  homologacao: 'Homologação', waiting_client: 'Aguardando cliente', blocked: 'Bloqueado', done: 'Concluído',
}
function fmtMovement(m: LastMovement): string {
  const t = m.title ?? 'atividade'
  switch (m.kind) {
    case 'timesheet': return `Apontou +${Math.round(m.hours ?? 0)}h`
    case 'delivery_completed': return `Concluiu ${t}`
    case 'delivery_created': return `Criou ${t}`
    case 'delivery_moved': return `Moveu ${t}${m.to ? ` → ${MOV_COL_LABEL[m.to] ?? m.to}` : ''}`
    default: return 'Movimentou o cronograma'
  }
}

// Mini card dos indicadores — ícone + rótulo em cima, valor embaixo, barra opcional.
type StackTone = 'default' | 'primary' | 'warning' | 'danger' | 'success'
interface StackRow { label: string; value: React.ReactNode; tone?: StackTone; onClick?: () => void }
function toneColor(t?: StackTone): string {
  return t === 'danger' ? 'var(--danger)' : t === 'warning' ? 'var(--warning)' : t === 'primary' ? 'var(--primary)' : t === 'success' ? 'var(--success)' : 'var(--text)'
}
/** Card aglutinado: título + várias métricas empilhadas (label à esquerda, valor à direita). */
function StackCard({ title, rows }: { title: string; rows: StackRow[] }) {
  return (
    <div style={{
      flexShrink: 0, minWidth: 128,
      padding: '6px 12px', borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 1 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} onClick={r.onClick} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
          cursor: r.onClick ? 'pointer' : 'default',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.label}</span>
          <strong style={{ fontSize: 13, fontWeight: 600, color: toneColor(r.tone), whiteSpace: 'nowrap' }}>{r.value}</strong>
        </div>
      ))}
    </div>
  )
}

/** Prazo de entrega (editável) em formato de card da faixa — replica o PATCH do header. */
function PrazoStackCard({ projectId, expectedEndDate, canEdit, onChange }: {
  projectId: number; expectedEndDate?: string | null; canEdit: boolean; onChange?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(expectedEndDate ? expectedEndDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const hasDate = Boolean(expectedEndDate)
  const isOverdue = hasDate && new Date(expectedEndDate as string) < new Date(new Date().toDateString())
  const displayDate = hasDate ? new Date(expectedEndDate as string).toLocaleDateString('pt-BR') : '—'
  const overdueDays = hasDate && isOverdue ? Math.floor((Date.now() - new Date(expectedEndDate as string).getTime()) / 86400000) : 0
  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await api.patch(`/projects/${projectId}`, { expected_end_date: value || null })
      toast.success('Prazo atualizado'); setEditing(false); onChange?.()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar prazo') }
    finally { setSaving(false) }
  }
  return (
    <div style={{
      flexShrink: 0, minWidth: 150,
      padding: '6px 12px', borderRadius: 8,
      background: 'var(--surface)', border: `1px solid ${isOverdue ? 'var(--danger)' : 'var(--border)'}`,
      display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center',
    }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <CalendarClock size={10} /> Prazo de entrega
      </div>
      {!editing ? (
        <button type="button" onClick={canEdit ? () => { setValue(expectedEndDate ? expectedEndDate.slice(0, 10) : ''); setEditing(true) } : undefined} disabled={!canEdit}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: canEdit ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: hasDate ? (isOverdue ? 'var(--danger)' : 'var(--text)') : 'var(--text-muted)', fontStyle: hasDate ? 'normal' : 'italic' }}>
            {hasDate ? displayDate : 'Definir prazo'}
          </span>
          {canEdit && <Pencil size={11} style={{ color: 'var(--text-light)' }} />}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="date" className="ds-input" autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            style={{ fontSize: 13, padding: '3px 6px', minWidth: 0, width: 130 }} />
          <button type="button" onClick={save} disabled={saving} className="ds-btn-primary" style={{ fontSize: 11, padding: '3px 8px' }}>{saving ? '…' : 'OK'}</button>
          <button type="button" onClick={() => setEditing(false)} className="ds-btn-ghost" style={{ fontSize: 11, padding: '3px 6px' }}>✕</button>
        </div>
      )}
      {hasDate && !editing && isOverdue && (
        <span style={{ fontSize: 10, color: 'var(--danger)' }}>{overdueDays} dia(s) em atraso</span>
      )}
    </div>
  )
}

// NÃO trunca: rótulos curtos e quebra de linha se faltar largura (nunca "...").
function MiniCard({ label, value, sub, tone = 'default', onClick, icon, bar }: {
  label: string; value: React.ReactNode; sub?: string
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success'; onClick?: () => void
  icon?: React.ReactNode; bar?: number
}) {
  const toneColor = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)'
    : tone === 'success' ? 'var(--success)' : tone === 'primary' ? 'var(--primary)' : 'var(--text)'
  const common = {
    flex: '1 1 0', minWidth: 96, padding: '6px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    textAlign: 'left' as const,
  }
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.02em', lineHeight: 1.1 }}>
        {icon && <span style={{ display: 'inline-flex', color: 'var(--text-light)', flexShrink: 0 }}>{icon}</span>}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: toneColor, lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      {typeof bar === 'number' && (
        <div style={{ height: 4, background: 'var(--surface-hover)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, bar))}%`, background: toneColor }} />
        </div>
      )}
      {sub && <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 2 }}>{sub}</div>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...common, cursor: 'pointer' }}>{inner}</button>
    : <div style={common}>{inner}</div>
}

function InternalCronogramaPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const isConsultor = user?.type === 'consultor'
  const canEdit = user?.type !== 'consultor' && user?.type !== 'cliente'
  const [executiveRaw, toggleExecutive] = useExecutiveMode()
  // Consultor nunca fica em modo executivo (toggle escondido); ignora valor preso no localStorage.
  const executive = executiveRaw && !isConsultor
  const [highlightUserId, setHighlightUserId] = useState<number | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)

  // Consultor só tem acesso à view Operação (kanban da própria atividade) — as outras (Planejamento,
  // Linha do Tempo) são de gestão. Força operacao independentemente de ?view= / localStorage.
  const view: ViewMode = isConsultor ? 'operacao' : (normalizeView(searchParams.get('view')) ?? 'operacao')

  const { isOperational, project, stages, projectWindow, holidays, executive: executiveSummary, alerts, teamLoad, lastMovement, loading, error, refetch } =
    useProjectSchedule(projectId)

  // Consultor: tela ÚNICA — puxa a Descrição do projeto (Visão Geral) pra exibir junto da Operação.
  const isConsultorView = user?.type === 'consultor'
  const { data: projMeta } = useApiQuery<{ description: string | null }>(
    isConsultorView ? `/projects/${projectId}` : null
  )

  // Saúde operacional resumida (badge) a partir do risco geral do executive summary.
  const saude = executiveSummary?.overall_risk === 'high'
    ? { text: 'Alto', color: 'var(--danger)' }
    : executiveSummary?.overall_risk === 'medium'
    ? { text: 'Médio', color: 'var(--warning)' }
    : { text: 'Baixo', color: 'var(--success)' }

  // Pós-mutação no cronograma: refaz o schedule E avisa o header (layout) pra
  // ele recarregar o projeto — o "Prazo de entrega" deriva da última data daqui.
  const refresh = () => { refetch(); notifyProjectUpdated(projectId) }

  // Horas do projeto pra faixa (Apontáveis = pool liberado à gestão; Consumidas/Saldo).
  const { data: projHours } = useApiQuery<{ consumed_hours?: number | string | null }>(
    !isConsultor && Number.isFinite(projectId) ? `/projects/${projectId}` : null
  )
  const appointableH = project ? cronogramaPoolHours(project) : 0
  const consumedH = Number(projHours?.consumed_hours ?? 0) || 0
  const saldoH = appointableH - consumedH
  const consumedPctH = appointableH > 0 ? Math.round((consumedH / appointableH) * 100) : 0

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
    if (isConsultor && v !== 'operacao') return // consultor fica preso na Operação
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
      else if (e.key === '4') { setView('indicadores'); e.preventDefault() }
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
  const [opMode, setOpMode] = useState<'kanban' | 'lista'>('kanban')
  // Consultor: alterna entre o board (Kanban/Lista) e a aba Apontamentos & Despesas (só deste projeto).
  const [consultorTab, setConsultorTab] = useState<'board' | 'apont'>('board')
  const [apontSub, setApontSub] = useState<'apontamentos' | 'despesas'>('apontamentos')
  const [showApontModal, setShowApontModal] = useState(false)
  const [showDespesaModal, setShowDespesaModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingActivity, setCreatingActivity] = useState(false)
  const [activityTitle, setActivityTitle] = useState('')
  const [activityStageId, setActivityStageId] = useState<number | null>(null)
  const [savingActivity, setSavingActivity] = useState(false)
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

  async function handleCreateActivity(e: React.FormEvent) {
    e.preventDefault()
    const title = activityTitle.trim()
    const stageId = activityStageId ?? stages[0]?.id
    if (!title || !stageId) return
    setSavingActivity(true)
    try {
      await api.post(`/stages/${stageId}/deliveries`, { title, status: 'backlog' })
      setActivityTitle(''); setCreatingActivity(false)
      refresh()
      toast.success('Atividade criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar atividade')
    } finally {
      setSavingActivity(false)
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
      {/* Faixa única de indicadores — cards aglutinados empilhados + Prazo + Equipe/Última (ajuste restaurado).
          Consultor: Descrição + Período entram NA MESMA faixa (mesma linha do Prazo/Atividades/Pendências). */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, overflowX: 'auto', paddingBottom: 2, alignItems: 'stretch' }}>
        {isConsultor && (
          <div style={{ flex: '1 1 200px', minWidth: 160, padding: '6px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 3 }}>Descrição</div>
            <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden' }}>{projMeta?.description || 'Sem descrição.'}</div>
          </div>
        )}
        {isConsultor && (
          <div style={{ flexShrink: 0, minWidth: 130, padding: '6px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 3 }}>Período</div>
            <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>Início: {fmtShortDate(project?.start_date)}<br />Previsto: {fmtShortDate(project?.expected_end_date)}</div>
          </div>
        )}
        <PrazoStackCard projectId={projectId} expectedEndDate={project?.expected_end_date} canEdit={canEdit} onChange={refetch} />
        {!isConsultor && (
          <StackCard title="Horas" rows={[
            { label: 'Apontáveis', value: `${Math.round(appointableH)}h` },
            { label: 'Consumidas', value: `${Math.round(consumedH)}h${appointableH > 0 ? ` · ${consumedPctH}%` : ''}`, tone: consumedPctH > 100 ? 'danger' : consumedPctH > 85 ? 'warning' : 'default' },
            { label: 'Saldo', value: `${Math.round(saldoH)}h`, tone: saldoH < 0 ? 'danger' : 'default' },
          ]} />
        )}
        <StackCard title="Atividades" rows={[
          { label: 'Etapas', value: stages.length },
          { label: 'Atividades', value: `${counts.totalActivities} · ${Math.round(counts.totalHoursPlanned)}h` },
          { label: 'Execução', value: counts.inProgressCount, tone: counts.inProgressCount > 0 ? 'primary' : 'default' },
        ]} />
        <StackCard title="Pendências" rows={[
          { label: 'Bloqueadas', value: counts.blockedCount, tone: counts.blockedCount > 0 ? 'danger' : 'default' },
          { label: 'Cliente', value: counts.waitingClientCount, tone: counts.waitingClientCount > 0 ? 'warning' : 'default' },
          { label: 'Atrasadas', value: counts.overdueCount, tone: counts.overdueCount > 0 ? 'danger' : 'default' },
        ]} />
        {!isConsultor && (
          <StackCard title="Time & status" rows={[
            { label: 'Equipe', value: `${teamLoad.length}` },
            { label: 'Saúde', value: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: saude.color }} />{saude.text}</span>) },
            { label: 'Alertas', value: alerts.length, tone: alerts.length === 0 ? 'default' : (alerts.some((a: any) => a.severity === 'danger' || a.severity === 'critical') ? 'danger' : 'warning'), onClick: alerts.length > 0 ? () => setAlertsOpen(o => !o) : undefined },
            { label: 'Prazo final', value: fmtShortDate(executiveSummary?.estimated_end_date ?? project?.expected_end_date) },
          ]} />
        )}
        {!isConsultor && (
          <div style={{ flex: '1 1 260px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 3 }}>Equipe · horas por consultor</div>
              {teamLoad.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem alocações.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 96, overflowY: 'auto', paddingRight: 2 }}>
                  {teamLoad.map(t => {
                    const actual = Number(t.actual_hours) || 0
                    const planned = Number(t.planned_hours) || 0
                    const pctP = planned > 0 ? (actual / planned) * 100 : (actual > 0 ? 101 : 0)
                    const barColor = pctP > 100 ? 'var(--danger)' : pctP > 85 ? 'var(--warning)' : 'var(--success)'
                    return (
                      <div key={t.user.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ flex: '1 1 90px', minWidth: 60, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.user.name}</span>
                        <div style={{ flex: '0 1 70px', height: 6, background: 'var(--surface-hover)', borderRadius: 3, overflow: 'hidden', minWidth: 30 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, pctP)}%`, background: barColor }} />
                        </div>
                        <span style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          Disp. <strong style={{ color: 'var(--text)' }}>{Math.round(planned)}h</strong> · Apont. <strong style={{ color: 'var(--text)' }}>{Math.round(actual)}h</strong> · Saldo <strong style={{ color: (planned - actual) < 0 ? 'var(--danger)' : 'var(--text)' }}>{Math.round(planned - actual)}h</strong>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, minWidth: 0 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span>Última movimentação</span>
                {lastMovement?.at && <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>· {timeAgo(lastMovement.at)}</span>}
              </div>
              {lastMovement ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{lastMovement.user ?? '—'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: lastMovement.kind === 'timesheet' ? 'var(--success)' : 'var(--primary)' }}>{fmtMovement(lastMovement)}</span>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem movimentações.</span>
              )}
            </div>
          </div>
        )}
      </div>
      {!isConsultor && alertsOpen && alerts.length > 0 && (
        <div style={{ marginBottom: 6 }}><CronogramaAlertsList alerts={alerts} /></div>
      )}

      {/* BLOCO 2 fixo — barra de abas + ações. Consultor tem VIEW ÚNICA (Operação): sem
          seletor de views nem ações de gestão. O toggle Kanban/Lista fica na própria Operação. */}
      {!isConsultor && (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg)',
        boxShadow: '0 6px 8px -6px rgba(0,0,0,.18)',
        paddingTop: 6, paddingBottom: 6,
      }}>
        <SegmentedControl current={view} onChange={setView} onlyOperacao={isConsultor} counts={{
          operacao: counts.inProgressCount,
          planejamento: counts.conflictsCount,
          timeline: counts.overdueCount,
          indicadores: 0,
          equipe: teamLoad.length,
          conversa: 0,
          diary: 0,
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* "Liberado à gestão" e "Modo executivo" removidos (a pedido). O pool liberado
              já aparece como "Apontáveis" na faixa de indicadores. */}
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
          {canEdit && stages.length > 0 && !creatingActivity && (
            <button
              type="button"
              className="ds-btn-primary"
              onClick={() => { setActivityStageId(stages[0]?.id ?? null); setActivityTitle(''); setCreatingActivity(true) }}
              style={{ fontSize: 13, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Nova atividade
            </button>
          )}
          {view === 'operacao' && stages.length > 0 && (
            <div style={{ display: 'inline-flex', gap: 4, marginLeft: 4 }}>
              {(['kanban', 'lista'] as const).map(m => {
                const active = opMode === m
                return (
                  <button key={m} type="button" onClick={() => setOpMode(m)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                      borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'var(--primary)' : 'transparent',
                      color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
                    }}>
                    {m === 'kanban' ? <LayoutGrid size={13} /> : <List size={13} />} {m === 'kanban' ? 'Kanban' : 'Lista'}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}

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

      {creatingActivity && (
        <form onSubmit={handleCreateActivity} className="ds-card ds-card-pad" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {stages.length > 1 && (
            <div style={{ width: 220 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Etapa</label>
              <select className="ds-input" value={activityStageId ?? ''} onChange={e => setActivityStageId(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ flex: '1 1 240px' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Título da atividade</label>
            <input autoFocus className="ds-input" value={activityTitle} onChange={e => setActivityTitle(e.target.value)} placeholder="Ex.: Levantamento de requisitos…" maxLength={200} style={{ width: '100%', marginTop: 4 }} />
          </div>
          <button type="submit" className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 14px' }} disabled={savingActivity || !activityTitle.trim()}>
            {savingActivity ? 'Salvando…' : 'Criar'}
          </button>
          <button type="button" className="ds-btn-ghost" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { setCreatingActivity(false); setActivityTitle('') }}>
            Cancelar
          </button>
        </form>
      )}


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

      {/* Consultor: tab-bar própria (sem toolbar de gestão) — Kanban/Lista + aba Apontamentos & Despesas (só deste projeto). */}
      {isConsultor && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['kanban', 'lista'] as const).map(m => {
            const active = consultorTab === 'board' && opMode === m
            return (
              <button key={m} type="button" onClick={() => { setOpMode(m); setConsultorTab('board') }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                  borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
                }}>
                {m === 'kanban' ? <LayoutGrid size={13} /> : <List size={13} />} {m === 'kanban' ? 'Kanban' : 'Lista'}
              </button>
            )
          })}
          <button type="button" onClick={() => setConsultorTab('apont')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600,
              borderRadius: 8, cursor: 'pointer', marginLeft: 'auto',
              border: `1px solid ${consultorTab === 'apont' ? 'var(--primary)' : 'var(--border)'}`,
              background: consultorTab === 'apont' ? 'var(--primary)' : 'transparent',
              color: consultorTab === 'apont' ? 'var(--primary-fg)' : 'var(--text-muted)',
            }}>
            <Clock size={13} /> Apontamentos & Despesas
          </button>
        </div>
      )}

      {/* View ativa — key força remontagem suave; CSS animation fade-in rápido */}
      <div key={view} className="cronograma-view-fade">
        {view === 'operacao' && (isConsultor && consultorTab === 'apont' ? (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {(['apontamentos', 'despesas'] as const).map(s => {
                  const active = apontSub === s
                  return (
                    <button key={s} type="button" onClick={() => setApontSub(s)}
                      style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        background: active ? 'var(--primary)' : 'transparent',
                        color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
                      }}>
                      {s === 'apontamentos' ? 'Apontamentos' : 'Despesas'}
                    </button>
                  )
                })}
              </div>
              {apontSub === 'apontamentos' ? (
                <button type="button" className="ds-btn-primary" onClick={() => setShowApontModal(true)}
                  style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> Novo Apontamento
                </button>
              ) : (
                <button type="button" className="ds-btn-primary" onClick={() => setShowDespesaModal(true)}
                  style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> Nova Despesa
                </button>
              )}
            </div>
            {apontSub === 'apontamentos'
              ? <ActivityGroups projectId={projectId} mode="view" />
              : <DespesasView projectId={projectId} />}
          </div>
        ) : (
          <OperacaoView projectId={projectId} stages={stages} onChanged={refresh} canEdit={canEdit} mode={opMode} />
        ))}
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
        {view === 'indicadores' && (
          <div className="flex flex-col gap-3">
            <CronogramaEvmPanel projectId={projectId} canEdit={canEdit} />
            <IndicadoresView project={project} stages={stages} executive={executiveSummary} teamLoad={teamLoad} />
          </div>
        )}
        {view === 'equipe' && <EquipeView projectId={projectId} />}
        {view === 'conversa' && <ProjectConversation projectId={projectId} mode="team" />}
        {view === 'diary' && <ProjectMessages projectId={projectId} userRole={user?.type} />}
        {view === 'documentos' && <ProjectDocsPanel projectId={projectId} />}
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

      <TimesheetFormModal
        open={showApontModal}
        onClose={() => setShowApontModal(false)}
        onSaved={() => { setShowApontModal(false); refresh() }}
        currentUser={user}
      />
      <ExpenseQuickModal
        open={showDespesaModal}
        onClose={() => setShowDespesaModal(false)}
        onSaved={() => { setShowDespesaModal(false); refresh() }}
        currentUser={user}
      />
    </div>
  )
}

type SegmentedCounts = Record<ViewMode, number>

function SegmentedControl({
  current, onChange, counts, onlyOperacao = false,
}: {
  current: ViewMode
  onChange: (v: ViewMode) => void
  counts: SegmentedCounts
  onlyOperacao?: boolean
}) {
  const allOpts: { value: ViewMode; label: string; hintBase: string; countSuffix: (n: number) => string; countTone: 'primary' | 'warning' | 'danger' }[] = [
    { value: 'planejamento', label: 'Planejamento',   hintBase: 'Atalho: 1', countSuffix: n => `${n} conflito${n === 1 ? '' : 's'}`, countTone: 'warning' },
    { value: 'timeline',     label: 'Linha do Tempo', hintBase: 'Atalho: 2', countSuffix: n => `${n} atrasada${n === 1 ? '' : 's'}`, countTone: 'danger' },
    { value: 'operacao',     label: 'Operação',       hintBase: 'Atalho: 3', countSuffix: n => `${n} em execução`,                  countTone: 'primary' },
    { value: 'indicadores',  label: 'Indicadores',    hintBase: 'Atalho: 4', countSuffix: n => `${n}`,                              countTone: 'primary' },
    { value: 'equipe',       label: 'Equipe',         hintBase: 'Alocação e apontamento por consultor', countSuffix: n => `${n}`,   countTone: 'primary' },
    { value: 'conversa',     label: 'Comentários',    hintBase: 'Comentários com o cliente', countSuffix: n => `${n}`,               countTone: 'danger' },
    { value: 'diary',        label: 'Diário do Projeto', hintBase: 'Diário interno — o cliente NÃO participa', countSuffix: n => `${n}`, countTone: 'primary' },
    { value: 'documentos',   label: 'Documentos',        hintBase: 'Documentos do projeto (coord/admin e relacionados)', countSuffix: n => `${n}`, countTone: 'primary' },
  ]
  // Consultor: só a Operação (as outras views são de gestão).
  const opts = onlyOperacao ? allOpts.filter(o => o.value === 'operacao') : allOpts
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--primary)',
      borderRadius: 9,
      overflow: 'hidden',
      background: 'var(--surface)',
      padding: 3,
      gap: 3,
    }}>
      {opts.map((opt) => {
        const active = current === opt.value
        const n = counts[opt.value] ?? 0
        // Comentários = participação do cliente → destaque em VERMELHO.
        const isComments = opt.value === 'conversa'
        return (
          <button
            key={opt.value}
            type="button"
            title={n > 0 ? `${opt.hintBase} · ${opt.countSuffix(n)}` : opt.hintBase}
            onClick={() => onChange(opt.value)}
            className={active ? 'ds-tab-active' : 'ds-tab-inactive'}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: active ? 700 : 600,
              background: active ? (isComments ? 'var(--danger)' : 'var(--primary)') : 'transparent',
              // No cyan (primary) o texto precisa ser ESCURO (contraste); só o vermelho de Comentários usa branco.
              color: active ? (isComments ? '#fff' : 'var(--primary-fg)') : (isComments ? 'var(--danger)' : 'var(--text)'),
              border: 'none',
              borderRadius: 7,
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
