'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { ResumoOperacional } from '@/components/help-desk/resumo-operacional'
import { Customer360Drawer } from '@/components/help-desk/customer-360-drawer'
import { FinalizarAtendimentoModal } from '@/components/help-desk/finalizar-atendimento-modal'
import { ExecutarPlaybook } from '@/components/help-desk/executar-playbook'
import { InteracaoComposer } from '@/components/help-desk/interacao-composer'
import { TimeSelect5 } from '@/components/help-desk/time-select-5'
import { SolucaoModal, SolutionView, type Solution } from '@/components/help-desk/solucao-modal'
import { GmudModal, GmudView, type Gmud } from '@/components/help-desk/gmud-modal'
import { DynamicFormModal, DynamicFormView, type HdForm, type FormInstance, type FormTime } from '@/components/help-desk/dynamic-form'
import { ServiceTreeSelect } from '@/components/help-desk/service-tree-select'
import { AgentSelect, type AgentTeam } from '@/components/help-desk/agent-select'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { RichEditor, type RichEditorHandle } from '@/components/help-desk/rich-editor'
import { ModoAtendimentoBar, FilaConcluida, type SessionSummary } from '@/components/help-desk/modo-atendimento'
import { getSession, nextTicketId, queuePosition, queueHref } from '@/lib/help-desk-session'
import { wsActive, wsContains, wsNext, wsPrev, wsIncr, logEvent, endWorkSession, fetchSummary, wsSetIds, getWorkSession } from '@/lib/work-session'
import { ArrowLeft, Lock, Paperclip, Clock, UserCheck, CheckCircle2, ArrowRight, ListFilter, CheckSquare, X, Pencil, Search, Mail } from 'lucide-react'

interface Ref { id: number; name: string; email?: string | null }
interface StatusOpt { id: number; key: string; label: string; color: string | null; is_open: boolean; is_resolved: boolean; is_terminal: boolean; allows_scheduling?: boolean }
interface Sla {
  first_response_due_at: string | null; resolution_due_at: string | null
  first_responded_at: string | null; resolved_at: string | null
  first_response_breached: boolean; resolution_breached: boolean
  first_response_overdue: boolean; resolution_overdue: boolean
  resolution_minutes_left: number | null; first_response_minutes_left: number | null
  paused?: boolean; scheduled?: boolean; scheduled_until?: string | null; scheduled_all_day?: boolean
}
interface TicketDetail {
  id: number; ticket_number: string | null; subject: string; description: string | null
  priority: string; level: string | null; channel: string; reopen_count: number
  requester_name?: string | null; requester_email?: string | null; cc_emails?: string[] | null; can_edit_description?: boolean
  solicitante?: { name: string | null; email: string | null } | null
  customer?: Ref | null; contact?: Ref | null; assignee?: Ref | null; team?: Ref | null
  category?: { id: number; name: string } | null; status?: StatusOpt | null
  project?: { id: number; name: string } | null
  contract?: { id: number; categoria?: string | null; helpdesk_integration_enabled?: boolean } | null
  service?: { id: number; name: string; code: string | null } | null
  justification?: { id: number; name: string; status_id: number } | null
  slaPolicy?: Ref | null; created_at: string; sla?: Sla | null
}
interface JustificationOpt { id: number; status_id: number; name: string }
interface CommentAtt { id: number; original_name?: string; file_name?: string; human_size?: string; category?: string }
interface Comment { id: number; body: string; visibility: string; channel?: string | null; is_system: boolean; created_at: string; author?: Ref | null; contact?: Ref | null; attachments?: CommentAtt[]; can_edit?: boolean; worked_date?: string | null; start_time?: string | null; end_time?: string | null; effort_minutes?: number | null; timesheet_id?: number | null; no_charge?: boolean; solution?: Solution | Gmud | null; form_kind?: string | null }

// Data local (evita UTC empurrar p/ o dia seguinte à noite no Brasil).
function localTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// HH:MM a partir de início→fim; '' se inválido/incompleto.
function deriveTotalHHMM(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  if (!Number.isFinite(mins) || mins <= 0) return ''
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}
function minutesToHHMM(m?: number | null): string {
  if (!m || m <= 0) return ''
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
interface Event { id: number; event_type: string; field: string | null; from_value: string | null; to_value: string | null; created_at: string; triggered_by?: number | null; triggeredBy?: Ref | null }
interface Att { id: number; original_name?: string; file_name?: string; human_size?: string; created_at?: string }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Média', alta: 'Alta', urgente: 'Urgente' }
const EVENT_LABEL: Record<string, string> = {
  created: 'Chamado aberto', status_changed: 'Status alterado', assigned: 'Atribuído', team_changed: 'Fila alterada',
  priority_changed: 'Prioridade alterada', resolved: 'Resolvido', reopened: 'Reaberto', closed: 'Fechado',
  comment: 'Interação', first_response: 'Primeira resposta', attachment_added: 'Anexo adicionado',
  scheduled: 'Agendado (SLA pausado)', schedule_resumed: 'Agendamento retomado (SLA)',
}

function minsLabel(m: number | null): string {
  if (m == null) return '—'
  const past = m < 0; const a = Math.abs(m)
  const txt = a >= 1440 ? `${Math.floor(a / 1440)}d` : a >= 60 ? `${Math.floor(a / 60)}h${a % 60 ? ` ${a % 60}m` : ''}` : `${a}m`
  return past ? `${txt} atrás` : `em ${txt}`
}

export default function HelpDeskTicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const id = Number(params?.id)

  const [t, setT] = useState<TicketDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [justifications, setJustifications] = useState<JustificationOpt[]>([])
  const [pendingStatus, setPendingStatus] = useState<string | null>(null) // status escolhido aguardando justificativa
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [services, setServices] = useState<{ id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }[]>([])
  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [editCommentId, setEditCommentId] = useState<number | null>(null)
  const commentEditorRef = useRef<RichEditorHandle>(null)
  // Tempo trabalhado na EDIÇÃO da interação (mesmos campos do composer).
  const [editTime, setEditTime] = useState({ worked_date: '', start_time: '', end_time: '', total_hours: '', no_charge: false })
  const openEditComment = (c: Comment) => {
    setEditCommentId(c.id)
    setEditTime({
      worked_date: c.worked_date ? c.worked_date.slice(0, 10) : localTodayStr(),
      start_time: c.start_time ?? '',
      end_time: c.end_time ?? '',
      // Se tinha intervalo, deixa vazio p/ o total DERIVAR (auto-soma); se era manual, pré-preenche.
      total_hours: (c.start_time && c.end_time) ? '' : minutesToHHMM(c.effort_minutes),
      no_charge: !!c.no_charge,
    })
  }
  const [editDesc, setEditDesc] = useState(false)
  const descEditorRef = useRef<RichEditorHandle>(null)
  const saveEditComment = async (cid: number) => {
    const body = commentEditorRef.current?.getHtml() ?? ''
    const files = commentEditorRef.current?.getFiles() ?? []
    const derived = deriveTotalHHMM(editTime.start_time, editTime.end_time)
    if (editTime.start_time && editTime.end_time && !derived) {
      toast.error('A hora de fim deve ser maior que a de início.'); return
    }
    try {
      const payload: Record<string, unknown> = {
        body,
        worked_date: editTime.worked_date || null,
        start_time: editTime.start_time || null,
        end_time: editTime.end_time || null,
        no_charge: editTime.no_charge,
      }
      // Com início/fim, o BE deriva o total; sem eles, manda o total manual.
      if (!derived && editTime.total_hours) payload.total_hours = editTime.total_hours
      const resp = await api.patch<{ data?: { apontamento_warning?: string } }>(`/help-desk/tickets/${id}/comments/${cid}`, payload)
      for (const f of files) { const fd = new FormData(); fd.append('file', f); await api.post(`/help-desk/tickets/${id}/comments/${cid}/attachments`, fd) }
      setEditCommentId(null); loadComments(); loadTs(); toast.success('Interação atualizada')
      if (resp?.data?.apontamento_warning) toast.warning(resp.data.apontamento_warning)
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao editar') }
  }
  const [events, setEvents] = useState<Event[]>([])
  const [atts, setAtts] = useState<Att[]>([])
  const [tab, setTab] = useState<'conversa' | 'timeline'>('conversa')

  const [finalizing, setFinalizing] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [checklist, setChecklist] = useState<string[]>([])
  const [finalizeDefaults, setFinalizeDefaults] = useState<{ reply: string | null; status_id: number | null } | null>(null)
  const [final, setFinal] = useState<SessionSummary | 'loading' | null>(null)
  const modoAtivo = wsActive() && wsContains(id)
  const [apontamentos, setApontamentos] = useState<{ id: number; data: string | null; consultor: string | null; horas: number; status: string; observacao: string | null }[]>([])
  // Drawer do Customer 360 — contexto a um clique; memoriza a preferência do usuário.
  const [ctxOpen, setCtxOpen] = useState(false)
  useEffect(() => { try { setCtxOpen(localStorage.getItem('hd_ctx_drawer') === '1') } catch { /* */ } }, [])
  const openCtx = () => { setCtxOpen(true); try { localStorage.setItem('hd_ctx_drawer', '1') } catch { /* */ } }
  const closeCtx = () => { setCtxOpen(false); try { localStorage.setItem('hd_ctx_drawer', '0') } catch { /* */ } }

  const loadTicket = useCallback(() => {
    if (!id) return
    api.get<{ data: TicketDetail }>(`/help-desk/tickets/${id}`)
      .then(r => { setT(r?.data ?? null); setNotFound(false) })
      .catch(e => {
        // ModelNotFound vira 404 ou 422 ("No query results") no handler da API → tela de não encontrado.
        const nf = e instanceof ApiError && (e.status === 404 || (e.status === 422 && /No query results/i.test(e.message)))
        if (nf) setNotFound(true)
        else toast.error(e instanceof ApiError ? e.message : 'Erro ao carregar chamado')
      })
  }, [id])
  const loadComments = useCallback(() => { if (id) api.get<{ data: Comment[] }>(`/help-desk/tickets/${id}/comments`).then(r => setComments(r?.data ?? [])).catch(() => {}) }, [id])
  const loadEvents = useCallback(() => { if (id) api.get<{ data: Event[] }>(`/help-desk/tickets/${id}/timeline`).then(r => setEvents(r?.data ?? [])).catch(() => {}) }, [id])
  const loadAtts = useCallback(() => { if (id) api.get<{ data: Att[] }>(`/help-desk/tickets/${id}/attachments`).then(r => setAtts(r?.data ?? [])).catch(() => {}) }, [id])
  const loadTs = useCallback(() => { if (id) api.get<{ data: typeof apontamentos }>(`/help-desk/tickets/${id}/timesheets`).then(r => setApontamentos(r?.data ?? [])).catch(() => {}) }, [id])

  useEffect(() => { loadTicket(); loadComments(); loadEvents(); loadAtts(); loadTs() }, [loadTicket, loadComments, loadEvents, loadAtts, loadTs])

  // Ao trocar de chamado, reseta o estado da tela de trabalho.
  useEffect(() => { setConcluido(false); setFinalizing(false); setChecklist([]); setFinalizeDefaults(null); setFinal(null) }, [id])

  // ── Modo Atendimento ──────────────────────────────────────────────────────
  const openFinal = async () => { setFinal('loading'); const sum = await fetchSummary(); setFinal((sum as SessionSummary) ?? null) }
  const skipTicket = () => { logEvent('ticket_skipped', { entityId: id }); wsIncr('pulados'); const n = wsNext(id); if (n) router.push(`/help-desk/tickets/${n}`); else openFinal() }
  const prevTicket = () => { const p = wsPrev(id); if (p) router.push(`/help-desk/tickets/${p}`) }
  const refreshFila = async () => {
    const s = getWorkSession(); if (!s) return
    const p = new URLSearchParams({ limit: '500' })
    Object.entries(s.filters).forEach(([k, v]) => { if (v === true) p.set(k, '1'); else if (typeof v === 'string' && v) p.set(k, v) })
    try {
      const r = await api.get<{ data: { id: number }[] }>(`/help-desk/tickets?${p}`)
      const ids = (r?.data ?? []).map(x => x.id)
      wsSetIds(ids)
      if (ids.length) { setFinal(null); router.push(`/help-desk/tickets/${ids[0]}`) } else toast('Nenhum chamado novo na fila.')
    } catch { toast.error('Erro ao atualizar fila') }
  }
  const encerrarSessao = async () => { const src = getWorkSession()?.source; await endWorkSession(); setFinal(null); router.push(src === 'kanban' ? '/help-desk/fila' : '/help-desk/tickets') }

  const onFinalized = () => {
    setFinalizing(false); setFinalizeDefaults(null); loadTicket(); loadComments(); loadEvents(); loadTs(); setRefreshKey(k => k + 1)
    if (modoAtivo) {
      logEvent('ticket_finalized', { entityId: id }); wsIncr('atendidos')
      const n = wsNext(id)
      if (n) { toast.success('Atendimento finalizado'); router.push(`/help-desk/tickets/${n}`) } else openFinal()
    } else {
      setConcluido(true)
    }
  }

  // Playbook aplicado no servidor (sem finalizar): recarrega e mostra o checklist (se houver).
  const onPlaybookApplied = (cl: string[]) => { loadTicket(); loadComments(); loadEvents(); setRefreshKey(k => k + 1); setChecklist(cl) }
  const onPlaybookFinalize = (defaults: { reply: string | null; status_id: number | null }, cl: string[]) => { setFinalizeDefaults(defaults); setChecklist(cl); setFinalizing(true) }
  const runPlaybook = async (playbookId: number) => {
    try {
      const r = await api.post<{ data: { start_finalize: boolean; checklist?: string[]; defaults?: { reply: string | null; status_id: number | null } } }>(`/help-desk/tickets/${id}/playbooks/${playbookId}/execute`, {})
      if (modoAtivo) logEvent('playbook_executed', { entityId: id, metadata: { playbook_id: playbookId } })
      if (r.data.start_finalize) onPlaybookFinalize(r.data.defaults ?? { reply: null, status_id: null }, r.data.checklist ?? [])
      else { toast.success('Playbook executado'); onPlaybookApplied(r.data.checklist ?? []) }
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao executar playbook') }
  }
  useEffect(() => {
    api.get<{ data: { statuses: StatusOpt[]; justifications?: JustificationOpt[]; categories?: { id: number; name: string }[]; services?: { id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }[]; channels?: string[] } }>('/help-desk/meta')
      .then(r => {
        setStatuses(r?.data?.statuses ?? []); setJustifications(r?.data?.justifications ?? [])
        setCategories(r?.data?.categories ?? []); setServices(r?.data?.services ?? [])
      }).catch(() => {})
  }, [])
  useEffect(() => { api.get<{ data: AgentTeam[] }>('/help-desk/teams?all=1').then(r => setTeams(r?.data ?? [])).catch(() => {}) }, [])

  const changeStatus = async (statusId: string, justificationId?: number | null) => {
    try { await api.patch(`/help-desk/tickets/${id}/status`, { status_id: Number(statusId), justification_id: justificationId ?? null }); loadTicket(); loadEvents() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao mudar status') }
  }
  // Formulários dinâmicos (construtor) vinculados a status. Legado: solution/gmud (comentários antigos).
  const [forms, setForms] = useState<HdForm[]>([])
  const [solucaoOpen, setSolucaoOpen] = useState(false)
  const [gmudOpen, setGmudOpen] = useState(false)
  const [dynOpen, setDynOpen] = useState(false)
  const [dynForm, setDynForm] = useState<HdForm | null>(null)
  const [dynEdit, setDynEdit] = useState<{ commentId: number; instance: FormInstance; time?: FormTime | null } | null>(null)
  const [resolveStatusId, setResolveStatusId] = useState<string | null>(null)
  const [editSolution, setEditSolution] = useState<{ commentId: number; solution: Solution } | null>(null)
  const [editGmud, setEditGmud] = useState<{ commentId: number; gmud: Gmud } | null>(null)

  useEffect(() => { api.get<{ data: HdForm[] }>('/help-desk/forms').then(r => setForms(r?.data ?? [])).catch(() => {}) }, [])

  // Status SEM formulário: aplica direto (com justificativa se houver).
  const onStatusSelect = (statusId: string) => {
    if (justifications.some(j => j.status_id === Number(statusId))) setPendingStatus(statusId)
    else changeStatus(statusId)
  }

  // Status COM formulário (do construtor) → abre o modal dinâmico.
  const openDynamicForm = (statusId: string) => {
    const form = forms.find(f => String(f.status_id) === statusId)
    if (!form) { onStatusSelect(statusId); return }
    setDynEdit(null); setDynForm(form); setResolveStatusId(statusId); setDynOpen(true)
  }

  const submitDynForm = async (inst: FormInstance, body: string, time: FormTime) => {
    // Tempo da interação → vira apontamento quando o contrato tem a integração ligada.
    const timeFields: Record<string, unknown> = { worked_date: time.worked_date, no_charge: time.no_charge }
    if (time.start_time) timeFields.start_time = time.start_time
    if (time.end_time) timeFields.end_time = time.end_time
    if (time.total_hours) timeFields.total_hours = time.total_hours
    try {
      if (dynEdit) {
        const resp = await api.patch<{ data?: { apontamento_warning?: string } }>(`/help-desk/tickets/${id}/comments/${dynEdit.commentId}`, { body, solution: inst, form_kind: 'dynamic', ...timeFields })
        if (resp?.data?.apontamento_warning) toast.warning(resp.data.apontamento_warning)
        toast.success('Formulário atualizado')
      } else {
        const resp = await api.post<{ data?: { apontamento_warning?: string } }>(`/help-desk/tickets/${id}/comments`, { body, visibility: 'customer', solution: inst, form_kind: 'dynamic', ...timeFields })
        if (resp?.data?.apontamento_warning) toast.warning(resp.data.apontamento_warning)
        if (resolveStatusId) await changeStatus(resolveStatusId)
        toast.success('Chamado atualizado')
      }
      setDynOpen(false); setDynForm(null); setDynEdit(null); setResolveStatusId(null)
      loadComments(); loadEvents(); loadTicket()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar o formulário') }
  }

  const openFormEdit = (c: Comment) => {
    if (c.form_kind === 'dynamic' && c.solution) {
      const inst = c.solution as unknown as FormInstance
      const form = forms.find(f => f.id === inst.form_id)
      const mins = c.effort_minutes ?? 0
      const time: FormTime = {
        worked_date: c.worked_date ?? '',
        start_time: (c.start_time ?? '').slice(0, 5),
        end_time: (c.end_time ?? '').slice(0, 5),
        total_hours: mins ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : '',
        no_charge: !!c.no_charge,
      }
      if (form) { setDynEdit({ commentId: c.id, instance: inst, time }); setDynForm(form); setResolveStatusId(null); setDynOpen(true) }
    }
    else if (c.form_kind === 'gmud' && c.solution) { setEditGmud({ commentId: c.id, gmud: c.solution as Gmud }); setResolveStatusId(null); setGmudOpen(true) }
    else if (c.solution) { setEditSolution({ commentId: c.id, solution: c.solution as Solution }); setResolveStatusId(null); setSolucaoOpen(true) }
  }

  const submitSolucao = async (s: Solution, body: string) => {
    try {
      if (editSolution) {
        await api.patch(`/help-desk/tickets/${id}/comments/${editSolution.commentId}`, { body, solution: s, form_kind: 'solution' })
        toast.success('Solução atualizada')
      } else {
        await api.post(`/help-desk/tickets/${id}/comments`, { body, visibility: 'customer', solution: s, form_kind: 'solution' })
        if (resolveStatusId) await changeStatus(resolveStatusId)
        toast.success('Chamado resolvido')
      }
      setSolucaoOpen(false); setEditSolution(null); setResolveStatusId(null)
      loadComments(); loadEvents(); loadTicket()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar a solução') }
  }

  const submitGmud = async (gm: Gmud, body: string) => {
    try {
      if (editGmud) {
        await api.patch(`/help-desk/tickets/${id}/comments/${editGmud.commentId}`, { body, solution: gm, form_kind: 'gmud' })
        toast.success('GMUD atualizada')
      } else {
        await api.post(`/help-desk/tickets/${id}/comments`, { body, visibility: 'customer', solution: gm, form_kind: 'gmud' })
        if (resolveStatusId) await changeStatus(resolveStatusId)
        toast.success('Chamado resolvido com GMUD')
      }
      setGmudOpen(false); setEditGmud(null); setResolveStatusId(null)
      loadComments(); loadEvents(); loadTicket()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar a GMUD') }
  }

  // Edição inline dos campos de classificação do chamado (categoria, serviço, prioridade, canal).
  const updateField = async (patch: Record<string, unknown>) => {
    try { await api.put(`/help-desk/tickets/${id}`, patch); loadTicket() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar') }
  }

  // Liga/desliga a chave de integração de horas do CONTRATO do chamado (substitui o Movidesk).
  const [savingIntegration, setSavingIntegration] = useState(false)
  const toggleIntegration = async (contractId: number, enabled: boolean) => {
    setSavingIntegration(true)
    try {
      await api.patch(`/contracts/${contractId}/helpdesk-integration`, { enabled })
      toast.success(enabled ? 'Integração de horas ligada' : 'Integração de horas desligada')
      loadTicket()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao alterar integração') }
    finally { setSavingIntegration(false) }
  }

  // Agendamento: define data (obrigatória) + hora (opcional). Ao agendar, o SLA pausa.
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const scheduleTicket = async () => {
    if (!schedDate) { toast.error('Informe a data.'); return }
    setSavingSchedule(true)
    try {
      await api.post(`/help-desk/tickets/${id}/schedule`, { date: schedDate, time: schedTime || null })
      toast.success('Chamado agendado — SLA pausado')
      setSchedDate(''); setSchedTime(''); loadTicket()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao agendar') }
    finally { setSavingSchedule(false) }
  }
  const unscheduleTicket = async () => {
    setSavingSchedule(true)
    try {
      await api.delete(`/help-desk/tickets/${id}/schedule`)
      toast.success('Agendamento cancelado — SLA retomado')
      loadTicket()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao cancelar agendamento') }
    finally { setSavingSchedule(false) }
  }

  // Atribui o agente e, se ele veio de uma equipe, leva o chamado AUTOMATICAMENTE para a fila dessa equipe.
  const assign = async (assigneeId: number | null, teamId?: number) => {
    const body: Record<string, unknown> = { assignee_id: assigneeId }
    if (teamId != null) body.team_id = teamId
    try { await api.patch(`/help-desk/tickets/${id}/assign`, body); loadTicket(); loadEvents() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao atribuir') }
  }


  if (notFound) return <AppLayout title="Chamado"><div className="py-16 text-center space-y-3">
    <p className="text-base font-medium" style={{ color: 'var(--text)' }}>Chamado não encontrado</p>
    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>O chamado #{id} não existe (pode ter sido removido ou reprocessado).</p>
    <a href="/help-desk/tickets" className="inline-block ds-btn-primary text-sm px-4 py-1.5 rounded-lg">← Voltar para Chamados</a>
  </div></AppLayout>
  if (!t) return <AppLayout title="Chamado"><div className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div></AppLayout>

  const sla = t.sla
  const lbl = 'text-[11px] font-semibold' as const
  const proximoId = concluido ? nextTicketId(id) : null
  const qpos = queuePosition(id)

  return (
    <AppLayout title={t.ticket_number ?? `Chamado #${t.id}`}>
      <div className="space-y-4">
        {/* Modo Atendimento — barra de controles contínua */}
        {modoAtivo && final === null && <ModoAtendimentoBar currentId={id} onPrev={prevTicket} onSkip={skipTicket} onEnd={openFinal} />}

        {/* Pós-finalização fora do Modo Atendimento (fluido, sem modal) */}
        {concluido && (
          <div className="ds-card flex items-center justify-between gap-3 p-3 flex-wrap" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
            <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--success-border)' }}>
              <CheckCircle2 size={16} /> Atendimento finalizado com sucesso.{qpos ? ` · ${qpos.pos}/${qpos.total} da fila` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={() => setConcluido(false)}>Permanecer</button>
              {proximoId
                ? <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => { setConcluido(false); router.push(`/help-desk/tickets/${proximoId}`) }}>Próximo chamado <ArrowRight size={15} /></button>
                : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fim da fila</span>}
              <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => router.push(queueHref(getSession()?.source))}><ListFilter size={14} /> Voltar para fila</button>
            </div>
          </div>
        )}

        {/* Checklist do Playbook (guia operacional) */}
        {checklist.length > 0 && (
          <div className="ds-card p-3" style={{ borderColor: 'var(--primary)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--primary)' }}><CheckSquare size={13} /> Checklist do playbook</span>
              <button onClick={() => setChecklist([])}><X size={15} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <ul className="space-y-0.5">
              {checklist.map((it, i) => <li key={i} className="text-sm flex items-start gap-1.5" style={{ color: 'var(--text)' }}><span style={{ color: 'var(--text-light)' }}>•</span>{it}</li>)}
            </ul>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <button onClick={() => router.push(queueHref(getSession()?.source))} className="mt-0.5"><ArrowLeft size={18} style={{ color: 'var(--text-muted)' }} /></button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs" style={{ color: 'var(--text-light)' }}>{t.ticket_number ?? `#${t.id}`}</span>
                {t.status && <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: t.status.color ?? 'var(--text)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: t.status.color ?? 'var(--text-muted)' }} />{t.status.label}</span>}
              </div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t.subject}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status é INFORMATIVO aqui — a mudança acontece ao enviar a interação (compositor). */}
            <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }} title="O status muda ao enviar uma interação">
              <span style={{ width: 8, height: 8, borderRadius: 999, background: t.status?.color ?? 'var(--text-light)', display: 'inline-block' }} />
              {t.status?.label ?? '—'}
            </span>
            <ExecutarPlaybook onExec={runPlaybook} />
            <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => { setFinalizeDefaults(null); setFinalizing(true) }}>
              <CheckCircle2 size={16} /> Finalizar atendimento
            </button>
          </div>
        </div>

        {/* Resumo Operacional — o essencial para atender; contexto completo no Drawer */}
        <ResumoOperacional key={refreshKey} ticketId={id} sla={t.sla}
          assigneeName={t.assignee?.name} requesterName={t.solicitante?.name ?? t.requester_name ?? t.contact?.name}
          apontadoHoras={apontamentos.reduce((s, a) => s + (a.horas || 0), 0)}
          onOpenContext={openCtx} onRunPlaybook={runPlaybook} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-4">
            {/* Descrição não é mais bloco fixo no topo: entra como a interação MAIS ANTIGA,
                no fim da Conversa (lista é sempre mais novo primeiro). */}

            {/* Abas conversa/timeline */}
            <div className="ds-card overflow-hidden">
              <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                {(['conversa', 'timeline'] as const).map(x => (
                  <button key={x} onClick={() => setTab(x)} className="px-4 py-2 text-sm font-medium"
                    style={{ color: tab === x ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === x ? '2px solid var(--primary)' : '2px solid transparent' }}>
                    {x === 'conversa' ? `Conversa (${comments.length + (t.description ? 1 : 0)})` : `Timeline (${events.length})`}
                  </button>
                ))}
              </div>

              {tab === 'conversa' ? (
                <div className="p-4 space-y-3">
                  {/* Compositor no TOPO — nova interação sempre em cima */}
                  <InteracaoComposer ticketId={id} onSent={() => { loadComments(); loadEvents(); loadTicket() }}
                    statuses={statuses.map(s => ({ id: s.id, label: s.label, is_resolved: s.is_resolved, allows_scheduling: s.allows_scheduling }))}
                    currentStatusId={t.status?.id}
                    onApplyStatus={(sid) => onStatusSelect(String(sid))}
                    onSchedule={async (date, time) => { await api.post(`/help-desk/tickets/${id}/schedule`, { date, time: time || null }) }}
                    formStatusIds={forms.filter(f => f.status_id).map(f => f.status_id as number)}
                    onFormStatus={(sid) => openDynamicForm(String(sid))} />
                  <div className="border-b" style={{ borderColor: 'var(--border)' }} />
                  {comments.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Sem interações ainda.</p>}
                  {/* Mais recente em cima, mais antiga embaixo */}
                  {comments.slice().reverse().map(c => (
                    <div key={c.id} className="rounded-lg p-3" style={{ background: c.visibility === 'internal' ? 'var(--warning-bg)' : 'var(--surface-sunken)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          {c.author?.name ?? c.contact?.name ?? 'Sistema'}
                          {c.visibility === 'internal' && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--warning-border)' }}><Lock size={10} /> nota interna</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          {c.can_edit && editCommentId !== c.id && (
                            <button title={c.solution ? (c.form_kind === 'gmud' ? 'Editar GMUD' : 'Editar solução') : 'Editar interação'} onClick={() => c.solution ? openFormEdit(c) : openEditComment(c)}><Pencil size={12} style={{ color: 'var(--text-light)' }} /></button>
                          )}
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDate(c.created_at)}</span>
                        </div>
                      </div>
                      {typeof c.effort_minutes === 'number' && c.effort_minutes > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                            <Clock size={11} /> {Math.floor(c.effort_minutes / 60)}:{String(c.effort_minutes % 60).padStart(2, '0')}
                            {c.start_time && c.end_time ? ` · ${c.start_time}–${c.end_time}` : ''}
                            {c.worked_date ? ` · ${c.worked_date.slice(8, 10)}/${c.worked_date.slice(5, 7)}` : ''}
                          </span>
                          {c.timesheet_id && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                              <CheckCircle2 size={11} /> apontamento gerado
                            </span>
                          )}
                          {c.no_charge && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                              sem cobrança
                            </span>
                          )}
                        </div>
                      )}
                      {editCommentId === c.id ? (
                        <div className="space-y-2">
                          <RichEditor ref={commentEditorRef} initialHtml={c.body} minHeight={80} />
                          {/* Tempo — total soma automaticamente ao informar início e fim. A 1ª hora
                              tem "Sem apontamento" no topo → trava os demais campos. */}
                          <div className="rounded-lg px-2.5 py-2 text-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Clock size={13} /> Tempo</span>
                              <input type="date" value={editTime.worked_date} max={localTodayStr()} disabled={editTime.no_charge} onChange={e => setEditTime(t => ({ ...t, worked_date: e.target.value }))} className="ds-input" style={{ height: 30, fontSize: 12, width: 140, padding: '0 8px', opacity: editTime.no_charge ? 0.5 : 1 }} />
                              <span style={{ color: 'var(--text-light)' }}>·</span>
                              <TimeSelect5 value={editTime.start_time} ariaLabel="Hora início"
                                maxBefore={editTime.end_time}
                                onChange={v => setEditTime(t => ({ ...t, start_time: v, no_charge: false }))}
                                topOption={{ label: 'Sem apontamento', active: editTime.no_charge, onSelect: () => setEditTime(t => ({ ...t, no_charge: true, start_time: '', end_time: '', total_hours: '' })) }} />
                              <span style={{ color: 'var(--text-light)' }}>→</span>
                              <TimeSelect5 value={editTime.end_time} disabled={editTime.no_charge} onChange={v => setEditTime(t => ({ ...t, end_time: v }))} ariaLabel="Hora fim" minAfter={editTime.start_time} />
                              <span style={{ color: 'var(--text-muted)' }}>Total</span>
                              {(() => {
                                const d = deriveTotalHHMM(editTime.start_time, editTime.end_time)
                                return <input type="text" value={editTime.no_charge ? '' : (d || editTime.total_hours)} readOnly={!!d} disabled={editTime.no_charge} onChange={e => setEditTime(t => ({ ...t, total_hours: e.target.value }))} placeholder="0:00" className="ds-input" style={{ height: 30, fontSize: 12, width: 64, padding: '0 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: editTime.no_charge ? 0.5 : 1 }} />
                              })()}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEditComment(c.id)} className="ds-btn-primary text-xs px-3 py-1 rounded-lg">Salvar</button>
                            <button onClick={() => setEditCommentId(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : c.solution && c.form_kind === 'dynamic' ? (
                        <DynamicFormView instance={c.solution as unknown as FormInstance} />
                      ) : c.solution && c.form_kind === 'gmud' ? (
                        <GmudView gmud={c.solution as Gmud} />
                      ) : c.solution ? (
                        <SolutionView solution={c.solution as Solution} />
                      ) : c.body && (c.channel === 'email' && isHtmlBody(c.body)
                        ? <EmailFrame html={c.body} />
                        : isHtmlBody(c.body)
                        ? <div className="text-sm hd-rich" style={{ color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(c.body) }} />
                        : <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{c.body}</p>)}
                      {/* Anexos da interação (estilo e-mail) — preview de imagem inline + arquivos */}
                      {c.attachments && c.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {c.attachments.map(a => {
                            const url = `/api/v1/help-desk/tickets/${id}/comments/${c.id}/attachments/${a.id}/download`
                            const nome = a.original_name ?? a.file_name ?? `Anexo #${a.id}`
                            const isImg = a.category === 'image' || /\.(png|jpe?g|webp|gif)$/i.test(nome)
                            return isImg
                              ? <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                  <img src={url} alt={nome} className="max-h-48 object-contain" />
                                </a>
                              : <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5" style={{ border: '1px solid var(--border)', color: 'var(--primary)' }}>
                                  <Paperclip size={12} /> {nome} {a.human_size ? `· ${a.human_size}` : ''}
                                </a>
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Descrição = interação MAIS ANTIGA, sempre no fim da lista. */}
                  {t.description && (
                    <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          {t.requester_name ?? 'Solicitante'}
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>descrição inicial</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {t.can_edit_description && !editDesc && (
                            <button title="Editar descrição" onClick={() => setEditDesc(true)}><Pencil size={12} style={{ color: 'var(--text-light)' }} /></button>
                          )}
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDate(t.created_at)}</span>
                        </div>
                      </div>
                      {editDesc ? (
                        <div className="space-y-2 mt-1">
                          <RichEditor ref={descEditorRef} initialHtml={t.description ?? ''} minHeight={100} />
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              await updateField({ description: descEditorRef.current?.getHtml() ?? t.description })
                              for (const f of (descEditorRef.current?.getFiles() ?? [])) { const fd = new FormData(); fd.append('file', f); await api.post(`/help-desk/tickets/${id}/attachments`, fd) }
                              setEditDesc(false); loadAtts()
                            }} className="ds-btn-primary text-xs px-3 py-1 rounded-lg">Salvar</button>
                            <button onClick={() => setEditDesc(false)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : isHtmlBody(t.description)
                        ? <div className="mt-1"><EmailFrame html={t.description} /></div>
                        : <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{t.description}</p>}
                      {atts.length > 0 && (
                        <div className="mt-2 pt-2 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
                          {atts.map(a => (
                            <a key={a.id} href={`/api/v1/help-desk/tickets/${id}/attachments/${a.id}/download`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--primary)' }}>
                              <Paperclip size={12} /> <span className="max-w-[180px] truncate">{a.original_name ?? a.file_name ?? `Anexo #${a.id}`}</span>{a.human_size ? ` · ${a.human_size}` : ''}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {events.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Sem eventos.</p>}
                  {events.map(e => (
                    <div key={e.id} className="flex items-start gap-2 text-sm">
                      <Clock size={13} className="mt-1" style={{ color: 'var(--text-light)' }} />
                      <div>
                        <span style={{ color: 'var(--text)' }}>{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                        {(e.from_value || e.to_value) && <span style={{ color: 'var(--text-muted)' }}> — {e.from_value ?? '∅'} → {e.to_value ?? '∅'}</span>}
                        <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-light)' }}>· {fmtDate(e.created_at)}{e.triggeredBy ? ` · ${e.triggeredBy.name}` : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar de propriedades */}
          <div className="space-y-4">
            {/* SLA */}
            <div className="ds-card p-4 space-y-2">
              <div className={lbl} style={{ color: 'var(--text-light)' }}>SLA</div>
              <Row label="1ª resposta" value={sla?.first_responded_at ? `Respondido ${fmtDate(sla.first_responded_at)}` : minsLabel(sla?.first_response_minutes_left ?? null)}
                danger={!!(sla?.first_response_breached || sla?.first_response_overdue)} />
              <Row label="Resolução" value={sla?.resolved_at ? `Resolvido ${fmtDate(sla.resolved_at)}` : minsLabel(sla?.resolution_minutes_left ?? null)}
                danger={!!(sla?.resolution_breached || sla?.resolution_overdue)} />
              {t.slaPolicy && <Row label="Política" value={t.slaPolicy.name} />}
            </div>

            {/* Atribuição */}
            <div className="ds-card p-4 space-y-2">
              <div className={lbl} style={{ color: 'var(--text-light)' }}>Atendimento</div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span style={{ color: 'var(--text-light)' }}>Agente</span>
                <div className="w-[60%]"><AgentSelect teams={teams} value={t.assignee?.id ?? null} onChange={(aid, teamId) => assign(aid, teamId)} /></div>
              </div>
              <Row label="Equipe" value={t.team?.name ?? '—'} />
              {user && t.assignee?.id !== user.id && (
                <div className="pt-1">
                  <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" onClick={() => assign(user.id)}>
                    <UserCheck size={13} /> Assumir
                  </button>
                </div>
              )}
            </div>

            {/* Propriedades */}
            <div className="ds-card p-4 space-y-2">
              <div className={lbl} style={{ color: 'var(--text-light)' }}>Detalhes</div>
              <Row label="Cliente" value={t.customer?.name ?? '— (interno)'} />
              <RequesterField name={t.solicitante?.name ?? t.contact?.name ?? t.requester_name} email={t.solicitante?.email ?? t.requester_email ?? t.contact?.email}
                onPick={cid => updateField({ customer_contact_id: cid })} />
              <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <CcField emails={t.cc_emails ?? []} onSave={list => updateField({ cc_emails: list })} />
              </div>
              <SelectRow label="Categoria" value={t.category?.id ? String(t.category.id) : ''} placeholder="—"
                options={categories.map(c => ({ value: String(c.id), label: c.name }))}
                onChange={v => updateField({ category_id: v ? Number(v) : null })} />
              <div className="flex items-center justify-between gap-2 text-sm">
                <span style={{ color: 'var(--text-light)' }}>Serviço</span>
                <div className="w-[62%]"><ServiceTreeSelect services={services} value={t.service?.id ?? null} onChange={sid => updateField({ service_id: sid })} /></div>
              </div>
              {t.justification && <Row label="Justificativa" value={t.justification.name} />}
              <SelectRow label="Urgência" value={t.priority}
                options={['baixa', 'normal', 'alta', 'urgente'].map(p => ({ value: p, label: PRIO_LABEL[p] }))}
                onChange={v => updateField({ priority: v })} />
              <SelectRow label="Nível" value={t.level ?? ''} placeholder="—"
                options={['N1', 'N2', 'N3'].map(n => ({ value: n, label: n }))}
                onChange={v => updateField({ level: v || null })} />
              <Row label="Reaberturas" value={String(t.reopen_count)} />
              <Row label="Aberto em" value={fmtDate(t.created_at)} />
            </div>

            {/* Agendamento — pausa o SLA até a data/hora definida (hora opcional) */}
            <div className="ds-card p-4 space-y-2">
              <div className="flex items-center gap-1.5"><Clock size={13} style={{ color: 'var(--text-light)' }} /><span className={lbl} style={{ color: 'var(--text-light)' }}>Agendamento</span></div>
              {t.sla?.scheduled ? (
                <>
                  <div className="text-sm rounded-lg px-2.5 py-2" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>
                    ⏸️ SLA pausado — retoma em <strong>{t.sla.scheduled_all_day && t.sla.scheduled_until ? new Date(t.sla.scheduled_until).toLocaleDateString('pt-BR') : fmtDate(t.sla.scheduled_until ?? null)}</strong>
                  </div>
                  <button onClick={unscheduleTicket} disabled={savingSchedule} className="ds-btn-secondary text-xs px-3 py-1.5 rounded-lg">Cancelar agendamento (retomar SLA)</button>
                </>
              ) : (
                <>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Defina uma data (hora opcional) para revisar o chamado. Enquanto agendado, o SLA fica pausado.</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={schedDate} min={new Date().toLocaleDateString('en-CA')} onChange={e => setSchedDate(e.target.value)} className="ds-input" style={{ height: 30, fontSize: 12, width: 140, padding: '0 8px' }} />
                    <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} aria-label="Hora (opcional)" className="ds-input" style={{ height: 30, fontSize: 12, width: 96, padding: '0 8px' }} />
                    <button onClick={scheduleTicket} disabled={savingSchedule || !schedDate} className="ds-btn-primary text-xs px-3 py-1.5 rounded-lg">Agendar</button>
                  </div>
                </>
              )}
            </div>

            {/* Chave de integração de horas do CONTRATO (substitui o Movidesk) */}
            {t.contract && (
              <div className="ds-card p-4 space-y-2">
                <div className={lbl} style={{ color: 'var(--text-light)' }}>Integração de horas</div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Com a chave ligada, as interações com tempo viram apontamento no contrato
                    {t.contract.categoria === 'sustentacao' ? ' de sustentação' : ''} — movimenta horas como o Movidesk.
                  </p>
                  <button type="button" role="switch" aria-checked={!!t.contract.helpdesk_integration_enabled}
                    disabled={savingIntegration}
                    onClick={() => toggleIntegration(t.contract!.id, !t.contract!.helpdesk_integration_enabled)}
                    className="relative shrink-0 rounded-full transition-colors"
                    style={{ width: 40, height: 22, background: t.contract.helpdesk_integration_enabled ? 'var(--primary)' : 'var(--border)', opacity: savingIntegration ? 0.6 : 1, cursor: savingIntegration ? 'default' : 'pointer' }}>
                    <span className="absolute rounded-full bg-white transition-all" style={{ width: 18, height: 18, top: 2, left: t.contract.helpdesk_integration_enabled ? 20 : 2 }} />
                  </button>
                </div>
                <div className="text-[11px]" style={{ color: t.contract.helpdesk_integration_enabled ? 'var(--success)' : 'var(--text-light)' }}>
                  {t.contract.helpdesk_integration_enabled ? 'Ligada — movimentando horas' : 'Desligada — sem movimentação'}
                </div>
              </div>
            )}

            {/* Apontamentos (registrados pela finalização do atendimento) */}
            <div className="ds-card p-4 space-y-2">
              <div className={lbl} style={{ color: 'var(--text-light)' }}><Clock size={12} className="inline -mt-0.5 mr-1" />Apontamentos ({apontamentos.length})</div>
              {apontamentos.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma hora registrada.</p> : apontamentos.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--text)' }}>{a.horas}h · {a.consultor ?? '—'}</span>
                  <span style={{ color: a.status === 'approved' ? 'var(--success-border)' : 'var(--text-light)' }}>{a.status === 'approved' ? 'aprovado' : 'pendente'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {finalizing && t && (
        <FinalizarAtendimentoModal
          ticketId={id}
          statuses={statuses}
          defaultProjectId={t.project?.id ?? null}
          defaultReply={finalizeDefaults?.reply ?? undefined}
          defaultStatusId={finalizeDefaults?.status_id ?? undefined}
          onClose={() => { setFinalizing(false); setFinalizeDefaults(null) }}
          onDone={onFinalized}
        />
      )}

      {solucaoOpen && (
        <SolucaoModal
          initial={editSolution?.solution ?? null}
          submitLabel={editSolution ? 'Salvar' : 'Salvar e resolver'}
          onClose={() => { setSolucaoOpen(false); setEditSolution(null); setResolveStatusId(null) }}
          onSubmit={submitSolucao}
        />
      )}

      {gmudOpen && (
        <GmudModal
          initial={editGmud?.gmud ?? null}
          submitLabel={editGmud ? 'Salvar' : 'Salvar e resolver (GMUD)'}
          onClose={() => { setGmudOpen(false); setEditGmud(null); setResolveStatusId(null) }}
          onSubmit={submitGmud}
        />
      )}

      {dynOpen && dynForm && (
        <DynamicFormModal
          form={dynForm}
          initial={dynEdit?.instance ?? null}
          initialTime={dynEdit?.time ?? null}
          tokens={{
            'ticket.creator.name': t.solicitante?.name ?? t.requester_name ?? '',
            'ticket.creator.email': t.solicitante?.email ?? t.requester_email ?? '',
            'ticket.number': t.ticket_number ?? '',
            'ticket.subject': t.subject ?? '',
            'cliente': t.customer?.name ?? '',
            'consultor': t.assignee?.name ?? '',
            'contato': t.contact?.name ?? '',
            'usuario': user?.name ?? '',
            'data': new Date().toLocaleDateString('pt-BR'),
          }}
          currentUserName={user?.name}
          submitLabel={dynEdit ? 'Salvar' : `Salvar e mover para: ${dynForm.status?.label ?? ''}`}
          onClose={() => { setDynOpen(false); setDynForm(null); setDynEdit(null); setResolveStatusId(null) }}
          onSubmit={submitDynForm}
        />
      )}

      {final !== null && <FilaConcluida summary={final === 'loading' ? null : final} onRefresh={refreshFila} onEnd={encerrarSessao} />}

      {/* Justificativa ao mudar para um status que a exige */}
      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setPendingStatus(null)}>
          <div className="ds-card max-w-sm w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Justificativa</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Selecione o motivo para mudar o status do chamado.</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {justifications.filter(j => j.status_id === Number(pendingStatus)).map(j => (
                <button key={j.id} className="w-full text-left text-sm px-3 py-2 rounded-lg ds-row-hover" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  onClick={() => { changeStatus(pendingStatus, j.id); setPendingStatus(null) }}>{j.name}</button>
              ))}
            </div>
            <div className="flex justify-between pt-1">
              <button className="text-xs" style={{ color: 'var(--text-muted)' }} onClick={() => { changeStatus(pendingStatus); setPendingStatus(null) }}>Mudar sem justificativa</button>
              <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={() => setPendingStatus(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Customer 360 completo — Drawer lateral (não recarrega, mantém o chamado visível) */}
      <Customer360Drawer open={ctxOpen} ticketId={id} onClose={closeCtx} onRunPlaybook={runPlaybook} />
    </AppLayout>
  )
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span style={{ color: 'var(--text-light)' }}>{label}</span>
      <span className="text-right" style={{ color: danger ? 'var(--danger-border)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}

interface EmailHit { name: string; email: string; source: string }
/** CC do chamado — envolve e-mails (chips), autocomplete dos cadastrados + e-mail livre. */
function CcField({ emails, onSave }: { emails: string[]; onSave: (list: string[]) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<EmailHit[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => {
      api.get<{ data: EmailHit[] }>(`/help-desk/email-suggestions?search=${encodeURIComponent(q)}`).then(r => setHits(r?.data ?? [])).catch(() => {})
    }, 200)
    return () => clearTimeout(h)
  }, [q, open])

  const add = (email: string) => {
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { if (e) toast.error('E-mail inválido'); return }
    if (emails.some(x => x.toLowerCase() === e)) { setQ(''); return }
    onSave([...emails, e]); setQ('')
  }
  const remove = (email: string) => onSave(emails.filter(x => x !== email))

  return (
    <div className="text-sm">
      <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-light)' }}>
        <Mail size={12} /> <span>CC (envolvidos)</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-1">
        {emails.map(e => (
          <span key={e} className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            {e}<button onClick={() => remove(e)}><X size={11} /></button>
          </span>
        ))}
        {emails.length === 0 && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum</span>}
      </div>
      <div className="relative">
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(q) } }}
          placeholder="Adicionar e-mail (cadastrado ou novo)…" className={`${'text-sm rounded-lg px-2 py-1 outline-none'} w-full`} style={inputStyle} />
        {open && (q || hits.length > 0) && (
          <div className="absolute z-10 mt-1 w-full max-h-52 overflow-auto rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            {hits.filter(h => !emails.some(x => x.toLowerCase() === h.email.toLowerCase())).map(h => (
              <button key={h.email} onMouseDown={() => add(h.email)} className="block w-full text-left px-2 py-1.5 ds-row-hover">
                <div style={{ color: 'var(--text)' }}>{h.name} <span className="text-[10px] px-1 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{h.source}</span></div>
                <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{h.email}</div>
              </button>
            ))}
            {q && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim()) && (
              <button onMouseDown={() => add(q)} className="block w-full text-left px-2 py-1.5 ds-row-hover" style={{ color: 'var(--primary)' }}>+ adicionar &quot;{q.trim()}&quot;</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface ContactHit { id: number; name: string; email: string | null; customer_id: number | null }
/** Solicitante EDITÁVEL — clica e busca contato por nome/e-mail (estilo "Buscar solicitante"). */
function RequesterField({ name, email, onPick }: { name?: string | null; email?: string | null; onPick: (contactId: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  useEffect(() => {
    if (!editing) return
    const h = setTimeout(() => {
      api.get<{ data: ContactHit[] }>(`/help-desk/contacts?search=${encodeURIComponent(q)}`).then(r => setHits(r?.data ?? [])).catch(() => {})
    }, 250)
    return () => clearTimeout(h)
  }, [q, editing])

  if (!editing) return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span style={{ color: 'var(--text-light)' }}>Solicitante</span>
      <div className="text-right">
        <button onClick={() => { setEditing(true); setQ('') }} className="inline-flex items-center gap-1 group" style={{ color: 'var(--text)' }}>
          <span>{name ?? email ?? '—'}</span><Pencil size={12} style={{ color: 'var(--text-light)' }} />
        </button>
        {name && email && <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{email}</div>}
      </div>
    </div>
  )
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: 'var(--text-light)' }}>Solicitante</span>
        <button onClick={() => setEditing(false)} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>cancelar</button>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1" style={inputStyle}>
        <Search size={13} style={{ color: 'var(--text-light)' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="bg-transparent outline-none w-full text-sm" style={{ color: 'var(--text)' }} />
      </div>
      <div className="mt-1 max-h-52 overflow-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        {hits.map(c => (
          <button key={c.id} onClick={() => { onPick(c.id); setEditing(false) }} className="block w-full text-left px-2 py-1.5 ds-row-hover">
            <div style={{ color: 'var(--text)' }}>{c.name}</div>
            {c.email && <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{c.email}</div>}
          </button>
        ))}
        {hits.length === 0 && <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--text-light)' }}>{q ? 'Nenhum contato encontrado.' : 'Digite para buscar…'}</div>}
      </div>
    </div>
  )
}

/** Linha de Detalhe EDITÁVEL — select inline que salva ao mudar (PUT no chamado). */
function SelectRow({ label, value, options, onChange, placeholder }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span style={{ color: 'var(--text-light)' }}>{label}</span>
      <select className="text-sm rounded-lg px-2 py-1 outline-none w-[62%] shrink-0 capitalize" style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
