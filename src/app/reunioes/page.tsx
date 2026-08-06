'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { MultiSelect, type MSOpt } from '@/components/notifications/multi-select'
import { Users, Plus, Trash2, Check, CalendarClock, MapPin, ArrowLeft, ClipboardList, ChevronRight, X, PenLine } from 'lucide-react'

const MANAGERS = ['admin', 'coordenador']

const inputCls = 'w-full text-sm rounded-lg px-3 py-2 outline-none'
const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' } as const
const lblCls = 'text-xs font-medium mb-1 block'

interface MeetingRow { id: number; title: string; meeting_date: string | null; location: string | null; creator: string | null; participants: MSOpt[]; participants_count: number; tasks_count: number; open_tasks_count: number }
interface MTask { id: number; title: string; description: string | null; assigned_to: number; assignee_name: string | null; assignees: { id: number; name: string }[]; assignee_ids: number[]; created_by: number; due_date: string | null; completed: boolean }
interface MeetingDetail { id: number; title: string; meeting_date: string | null; location: string | null; description: string | null; notes: string | null; creator: string | null; created_by_id: number; can_delete: boolean; participants: MSOpt[]; tasks: MTask[] }

// A data/hora da reunião é "wall-clock" (o horário digitado). O backend roda em UTC e
// grava o datetime-local literalmente como UTC; então lemos/exibimos SEMPRE em UTC (sem
// converter p/ o fuso do navegador), senão o horário aparecia −3h ao recarregar a página.
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : 'sem data'
const toLocalInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` }

export default function ReunioesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [sel, setSel] = useState<MeetingDetail | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'meetings' | 'pending'>('meetings')

  useEffect(() => { if (user && !MANAGERS.includes(user.type ?? '')) router.replace('/inicio') }, [user, router])

  const searchUsers = useCallback(async (q: string): Promise<MSOpt[]> => {
    try { const r = await api.get<{ data: MSOpt[] }>(`/tasks/users?search=${encodeURIComponent(q)}`); return r.data ?? [] } catch { return [] }
  }, [])

  const load = useCallback(() => { setLoading(true); api.get<{ data: MeetingRow[] }>('/meetings').then(r => setRows(r.data ?? [])).catch(() => {}).finally(() => setLoading(false)) }, [])
  useEffect(() => { load() }, [load])

  const open = (id: number) => api.get<{ data: MeetingDetail }>(`/meetings/${id}`).then(r => setSel(r.data)).catch(() => toast.error('Erro ao abrir reunião'))

  return (
    <AppLayout title="Central de Reunião">
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center gap-2.5">
          <ClipboardList size={22} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Central de Reunião</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>· Detalhes, participantes e tarefas</span>
        </div>

        {!sel && (
          <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-sunken)' }}>
            {([['meetings', 'Reuniões'], ['pending', 'Atividades pendentes']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="text-sm px-3 py-1.5 rounded-md font-medium"
                style={tab === k ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,.06)' } : { color: 'var(--text-muted)' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!sel && tab === 'pending' ? (
          <PendingTasksView openMeeting={open} meUserId={user?.id ?? 0} />
        ) : !sel ? (
          <>
            <button onClick={() => setShowNew(true)} className="text-sm px-3 py-2 rounded-lg font-medium inline-flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
              <Plus size={16} /> Nova reunião
            </button>
            <div className="ds-card p-4 space-y-2">
              {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
              {!loading && rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma reunião que você participa.</p>}
              {rows.map(m => (
                <div key={m.id} onClick={() => open(m.id)} className="flex items-center gap-3 py-2.5 border-t cursor-pointer ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{m.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                      <CalendarClock size={11} className="inline mr-1" />{fmtDate(m.meeting_date)}
                      {m.location ? <> · <MapPin size={11} className="inline mr-0.5" />{m.location}</> : null}
                      · {m.participants_count} envolvido(s)
                    </p>
                  </div>
                  {m.tasks_count > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: m.open_tasks_count ? 'var(--warning-bg)' : 'var(--success-bg)', color: m.open_tasks_count ? 'var(--warning)' : 'var(--success)' }}>
                      {m.open_tasks_count ? `${m.open_tasks_count} tarefa(s) aberta(s)` : 'tarefas concluídas'}
                    </span>
                  )}
                  <ChevronRight size={16} style={{ color: 'var(--text-light)' }} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <MeetingDetailView detail={sel} setDetail={setSel} onBack={() => { setSel(null); load() }} searchUsers={searchUsers} meUserId={user?.id ?? 0} />
        )}
      </div>

      {showNew && <NewMeetingModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); load(); open(id) }} searchUsers={searchUsers} />}
    </AppLayout>
  )
}

interface PendRow { task_id: number; title: string; due_date: string | null; completed: boolean; meeting_id: number; meeting_title: string; assignees: { id: number; name: string }[] }
interface PendGroup { user_id: number; user_name: string; tasks: PendRow[] }

/** Lista consolidada das atividades pendentes de TODAS as reuniões, agrupadas por responsável,
 *  com filtro por reunião e link p/ abrir a reunião de origem. */
function PendingTasksView({ openMeeting }: { openMeeting: (id: number) => void; meUserId: number }) {
  const [groups, setGroups] = useState<PendGroup[]>([])
  const [meetings, setMeetings] = useState<{ id: number; title: string }[]>([])
  const [meetingId, setMeetingId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const qs = meetingId ? `?meeting_id=${meetingId}` : ''
    api.get<{ data: { groups: PendGroup[]; meetings: { id: number; title: string }[] } }>(`/meetings/tasks/pending${qs}`)
      .then(r => { setGroups(r.data?.groups ?? []); setMeetings(r.data?.meetings ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [meetingId])
  useEffect(() => { load() }, [load])

  const totalTasks = groups.reduce((s, g) => s + g.tasks.length, 0)
  const overdue = (d: string | null) => !!d && d < new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Atividades pendentes</span>
        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· o que ficou pendente nas reuniões, por responsável</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Reunião:</span>
          <select className="text-sm rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle} value={meetingId} onChange={e => setMeetingId(e.target.value)}>
            <option value="">Todas as reuniões</option>
            {meetings.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
      {!loading && totalTasks === 0 && <div className="ds-card p-6 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma atividade pendente 🎉</p></div>}

      {!loading && groups.map(g => (
        <div key={g.user_id} className="ds-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Users size={14} style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{g.user_name}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>{g.tasks.length}</span>
          </div>
          {g.tasks.map(t => (
            <div key={t.task_id} className="flex items-start gap-2 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>{t.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: overdue(t.due_date) ? 'var(--danger-border)' : 'var(--text-light)' }}>
                  {t.due_date ? `até ${new Date(t.due_date + 'T00:00').toLocaleDateString('pt-BR')}${overdue(t.due_date) ? ' · atrasada' : ''}` : 'sem prazo'}
                  {t.assignees.length > 1 ? ` · 👥 ${t.assignees.map(a => a.name).join(', ')}` : ''}
                </p>
              </div>
              <button onClick={() => openMeeting(t.meeting_id)} title="Abrir reunião de origem" className="shrink-0 text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                {t.meeting_title} <ChevronRight size={13} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function NewMeetingModal({ onClose, onCreated, searchUsers }: { onClose: () => void; onCreated: (id: number) => void; searchUsers: (q: string) => Promise<MSOpt[]> }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [parts, setParts] = useState<MSOpt[]>([])
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (!title.trim()) { toast.error('Informe o assunto'); return }
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/meetings', { title: title.trim(), meeting_date: date || null, location: location || null, description: description || null, participant_ids: parts.map(p => p.id) })
      toast.success('Reunião criada'); onCreated(r.data.id)
    } catch { toast.error('Erro ao criar reunião') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => !saving && onClose()}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--primary-soft)', borderBottom: '1px solid var(--border)' }}>
          <ClipboardList size={18} style={{ color: 'var(--primary)' }} /><span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Nova reunião</span>
        </div>
        <div className="p-5 space-y-3">
          <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Assunto *</label>
            <input autoFocus className={inputCls} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Assunto da reunião" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Data e hora</label>
              <input type="datetime-local" className={inputCls} style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Local</label>
              <input className={inputCls} style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="Sala / Teams / …" /></div>
          </div>
          <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Pauta / descrição</label>
            <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Do que se trata a reunião" /></div>
          <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Envolvidos (só eles verão a reunião)</label>
            <MultiSelect placeholder="Buscar pessoas…" selected={parts} onChange={setParts} search={searchUsers} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Você é adicionado automaticamente.</p></div>
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={create} disabled={saving || !title.trim()} className="text-sm px-5 py-2 rounded-lg font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: (saving || !title.trim()) ? .5 : 1 }}>{saving ? 'Criando…' : 'Criar reunião'}</button>
        </div>
      </div>
    </div>
  )
}

function MeetingDetailView({ detail, setDetail, onBack, searchUsers, meUserId }: {
  detail: MeetingDetail; setDetail: (d: MeetingDetail) => void; onBack: () => void; searchUsers: (q: string) => Promise<MSOpt[]>; meUserId: number
}) {
  const [title, setTitle] = useState(detail.title)
  const [date, setDate] = useState(toLocalInput(detail.meeting_date))
  const [location, setLocation] = useState(detail.location ?? '')
  // Pauta/descrição não é mais editável na tela do detalhe; mantém o valor no payload.
  const [description] = useState(detail.description ?? '')
  const notesDraftKey = `meeting_notes_draft_${detail.id}`
  const [notes, setNotes] = useState(() => { try { const d = localStorage.getItem(notesDraftKey); return d != null ? d : (detail.notes ?? '') } catch { return detail.notes ?? '' } })
  const [saving, setSaving] = useState(false)
  // nova tarefa (múltiplos responsáveis)
  const [tTitle, setTTitle] = useState('')
  const [tWho, setTWho] = useState<MSOpt[]>([])
  const [tDue, setTDue] = useState('')
  // edição de tarefa existente
  const [editTaskId, setEditTaskId] = useState<number | null>(null)
  const [etTitle, setEtTitle] = useState('')
  const [etWho, setEtWho] = useState<MSOpt[]>([])
  const [etDue, setEtDue] = useState('')
  // responsáveis = restritos aos participantes da reunião (busca local nos envolvidos)
  const searchParticipants = useCallback(
    async (q: string): Promise<MSOpt[]> => detail.participants.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [detail.participants],
  )
  // Rascunho auto-salvo das anotações: sobrevive a reload/erro; limpa quando bate com o salvo.
  useEffect(() => {
    try { if (notes !== (detail.notes ?? '')) localStorage.setItem(notesDraftKey, notes); else localStorage.removeItem(notesDraftKey) } catch { /* ignore */ }
  }, [notes, notesDraftKey, detail.notes])

  // Um único save: grava dados da reunião + anotações de uma vez.
  const saveAll = async () => {
    setSaving(true)
    try { const r = await api.put<{ data: MeetingDetail }>(`/meetings/${detail.id}`, { title: title.trim(), meeting_date: date || null, location: location || null, description: description || null, notes }); setDetail(r.data); toast.success('Reunião salva') }
    catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  const syncParticipants = async (next: MSOpt[]) => {
    try { const r = await api.put<{ data: MeetingDetail }>(`/meetings/${detail.id}/participants`, { participant_ids: next.map(p => p.id) }); setDetail(r.data) }
    catch { toast.error('Erro ao atualizar participantes') }
  }
  const addTask = async () => {
    if (!tTitle.trim() || tWho.length === 0 || !tDue) { toast.error('Informe a tarefa, ao menos um responsável e o prazo'); return }
    try { const r = await api.post<{ data: MTask }>(`/meetings/${detail.id}/tasks`, { title: tTitle.trim(), assigned_to: tWho.map(w => w.id), due_date: tDue }); setDetail({ ...detail, tasks: [...detail.tasks, r.data] }); setTTitle(''); setTWho([]); setTDue('') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao criar tarefa') }
  }
  const startEditTask = (t: MTask) => { setEditTaskId(t.id); setEtTitle(t.title); setEtWho((t.assignees?.length ? t.assignees : (t.assignee_name ? [{ id: t.assigned_to, name: t.assignee_name }] : [])).map(a => ({ id: a.id, name: a.name }))); setEtDue(t.due_date ?? '') }
  const cancelEditTask = () => { setEditTaskId(null); setEtTitle(''); setEtWho([]); setEtDue('') }
  const saveEditTask = async () => {
    if (!etTitle.trim() || etWho.length === 0 || !etDue) { toast.error('Informe a tarefa, ao menos um responsável e o prazo'); return }
    try {
      const r = await api.put<{ data: MTask }>(`/meetings/${detail.id}/tasks/${editTaskId}`, { title: etTitle.trim(), assigned_to: etWho.map(w => w.id), due_date: etDue })
      setDetail({ ...detail, tasks: detail.tasks.map(x => x.id === editTaskId ? r.data : x) }); cancelEditTask()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar tarefa') }
  }
  const toggleTask = async (t: MTask) => {
    try { const r = await api.patch<{ data: MTask }>(`/meetings/${detail.id}/tasks/${t.id}/toggle`, {}); setDetail({ ...detail, tasks: detail.tasks.map(x => x.id === t.id ? r.data : x) }) }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Só um responsável conclui') }
  }
  const delTask = async (t: MTask) => {
    if (!confirm(`Remover a tarefa "${t.title}"?`)) return
    try { await api.delete(`/meetings/${detail.id}/tasks/${t.id}`); setDetail({ ...detail, tasks: detail.tasks.filter(x => x.id !== t.id) }) }
    catch { toast.error('Erro ao remover') }
  }
  const delMeeting = async () => {
    if (!confirm('Excluir esta reunião e suas tarefas?')) return
    try { await api.delete(`/meetings/${detail.id}`); toast.success('Reunião excluída'); onBack() } catch { toast.error('Erro ao excluir') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={18} /></button>
        <span className="text-sm" style={{ color: 'var(--text-light)' }}>Reunião · criada por {detail.creator ?? '—'}</span>
        {detail.can_delete && <button onClick={delMeeting} className="ml-auto text-[12px] inline-flex items-center gap-1" style={{ color: 'var(--danger-border)' }}><Trash2 size={13} /> excluir</button>}
      </div>

      {/* Dados da reunião */}
      <div className="ds-card p-4 space-y-3">
        <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Assunto</label>
          <input className={inputCls} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Data e hora</label>
            <input type="datetime-local" className={inputCls} style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Local</label>
            <input className={inputCls} style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} /></div>
        </div>
      </div>

      {/* Envolvidos */}
      <div className="ds-card p-4 space-y-2">
        <div className="flex items-center gap-2"><Users size={15} style={{ color: 'var(--primary)' }} /><span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Envolvidos</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· só eles têm acesso às anotações</span></div>
        <MultiSelect placeholder="Adicionar pessoas…" selected={detail.participants} onChange={syncParticipants} search={searchUsers} />
      </div>

      {/* Anotações */}
      <div className="ds-card p-4 space-y-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Anotações da reunião</span>
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 420, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="O que foi discutido, decisões, encaminhamentos…" />
      </div>

      {/* Único botão de salvar — grava dados + anotações juntos */}
      <button onClick={saveAll} disabled={saving} className="text-sm px-5 py-2.5 rounded-lg font-semibold inline-flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: saving ? .6 : 1 }}><Check size={16} /> {saving ? 'Salvando…' : 'Salvar reunião'}</button>

      {/* Tarefas */}
      <div className="ds-card p-4 space-y-2">
        <div className="flex items-center gap-2"><ClipboardList size={15} style={{ color: 'var(--primary)' }} /><span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tarefas</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· vão pro “Meu Dia” de cada responsável</span></div>
        {detail.tasks.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma tarefa ainda.</p>}
        {detail.tasks.map(t => (
          editTaskId === t.id ? (
            <div key={t.id} className="py-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 90 }} value={etTitle} onChange={e => setEtTitle(e.target.value)} placeholder="Descrição da tarefa…" />
              <MultiSelect placeholder="Responsáveis… (um ou mais)" selected={etWho} onChange={setEtWho} search={searchParticipants} />
              <div className="flex gap-2 items-center flex-wrap">
                <input type="date" className="text-sm rounded-lg px-3 py-2 outline-none" style={{ ...inputStyle, width: 160 }} value={etDue} onChange={e => setEtDue(e.target.value)} />
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>prazo obrigatório</span>
                <button onClick={saveEditTask} className="ml-auto px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Salvar</button>
                <button onClick={cancelEditTask} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>Cancelar</button>
              </div>
            </div>
          ) : (
          <div key={t.id} className="flex items-start gap-2 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => toggleTask(t)} title={t.assignee_ids?.includes(meUserId) ? 'Concluir/reabrir' : 'Só um responsável conclui'} className="w-5 h-5 mt-0.5 rounded flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${t.completed ? 'var(--success)' : 'var(--border)'}`, background: t.completed ? 'var(--success)' : 'transparent' }}>
              {t.completed && <Check size={13} color="#fff" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text)', textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? .6 : 1 }}>{t.title}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>👤 {(t.assignees?.length ? t.assignees.map(a => a.name).join(', ') : (t.assignee_name ?? '—'))}{t.due_date ? ` · até ${new Date(t.due_date + 'T00:00').toLocaleDateString('pt-BR')}` : ''}</p>
            </div>
            {(t.created_by === meUserId) && <button onClick={() => startEditTask(t)} title="Editar tarefa" className="mt-0.5"><PenLine size={14} style={{ color: 'var(--text-muted)' }} /></button>}
            {(t.created_by === meUserId) && <button onClick={() => delTask(t)} title="Remover tarefa" className="mt-0.5"><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>}
          </div>
          )
        ))}
        {/* nova tarefa — caixa de texto maior (aceita texto longo/colado) + múltiplos responsáveis */}
        <div className="pt-2 space-y-2">
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 90 }} value={tTitle} onChange={e => setTTitle(e.target.value)} placeholder="Nova tarefa… (pode colar pautas/listas longas)" />
          <MultiSelect placeholder="Responsáveis… (um ou mais)" selected={tWho} onChange={setTWho} search={searchParticipants} />
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" className="text-sm rounded-lg px-3 py-2 outline-none" style={{ ...inputStyle, width: 160 }} value={tDue} onChange={e => setTDue(e.target.value)} />
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>prazo obrigatório · conclusão vale p/ todos</span>
            <button onClick={addTask} className="ml-auto px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
