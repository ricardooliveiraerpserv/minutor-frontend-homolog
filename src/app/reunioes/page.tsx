'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { MultiSelect, type MSOpt } from '@/components/notifications/multi-select'
import { Users, Plus, Trash2, Check, CalendarClock, MapPin, ArrowLeft, ClipboardList, ChevronRight, X } from 'lucide-react'

const MANAGERS = ['admin', 'coordenador']

const inputCls = 'w-full text-sm rounded-lg px-3 py-2 outline-none'
const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' } as const
const lblCls = 'text-xs font-medium mb-1 block'

interface MeetingRow { id: number; title: string; meeting_date: string | null; location: string | null; creator: string | null; participants: MSOpt[]; participants_count: number; tasks_count: number; open_tasks_count: number }
interface MTask { id: number; title: string; description: string | null; assigned_to: number; assignee_name: string | null; created_by: number; due_date: string | null; completed: boolean }
interface MeetingDetail { id: number; title: string; meeting_date: string | null; location: string | null; description: string | null; notes: string | null; creator: string | null; created_by_id: number; can_delete: boolean; participants: MSOpt[]; tasks: MTask[] }

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'sem data'
const toLocalInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

export default function ReunioesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [sel, setSel] = useState<MeetingDetail | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user && !MANAGERS.includes(user.type ?? '')) router.replace('/inicio') }, [user, router])

  const searchUsers = useCallback(async (q: string): Promise<MSOpt[]> => {
    try { const r = await api.get<{ data: MSOpt[] }>(`/tasks/users?search=${encodeURIComponent(q)}`); return r.data ?? [] } catch { return [] }
  }, [])

  const load = useCallback(() => { setLoading(true); api.get<{ data: MeetingRow[] }>('/meetings').then(r => setRows(r.data ?? [])).catch(() => {}).finally(() => setLoading(false)) }, [])
  useEffect(() => { load() }, [load])

  const open = (id: number) => api.get<{ data: MeetingDetail }>(`/meetings/${id}`).then(r => setSel(r.data)).catch(() => toast.error('Erro ao abrir reunião'))

  return (
    <AppLayout title="Central de Reunião">
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2.5">
          <ClipboardList size={22} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Central de Reunião</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>· Detalhes, participantes e tarefas</span>
        </div>

        {!sel ? (
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
        <div className="p-5 space-y-3 max-h-[70vh] overflow-auto">
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
  const [description, setDescription] = useState(detail.description ?? '')
  const [notes, setNotes] = useState(detail.notes ?? '')
  const [savingMeta, setSavingMeta] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  // nova tarefa
  const [tTitle, setTTitle] = useState('')
  const [tWho, setTWho] = useState<string>('')
  const [tDue, setTDue] = useState('')

  const saveMeta = async () => {
    setSavingMeta(true)
    try { const r = await api.put<{ data: MeetingDetail }>(`/meetings/${detail.id}`, { title: title.trim(), meeting_date: date || null, location: location || null, description: description || null }); setDetail(r.data); toast.success('Reunião atualizada') }
    catch { toast.error('Erro ao salvar') } finally { setSavingMeta(false) }
  }
  const saveNotes = async () => {
    setSavingNotes(true)
    try { const r = await api.put<{ data: MeetingDetail }>(`/meetings/${detail.id}`, { notes }); setDetail(r.data); toast.success('Anotações salvas') }
    catch { toast.error('Erro ao salvar anotações') } finally { setSavingNotes(false) }
  }
  const syncParticipants = async (next: MSOpt[]) => {
    try { const r = await api.put<{ data: MeetingDetail }>(`/meetings/${detail.id}/participants`, { participant_ids: next.map(p => p.id) }); setDetail(r.data) }
    catch { toast.error('Erro ao atualizar participantes') }
  }
  const addTask = async () => {
    if (!tTitle.trim() || !tWho) { toast.error('Informe a tarefa e o responsável'); return }
    try { const r = await api.post<{ data: MTask }>(`/meetings/${detail.id}/tasks`, { title: tTitle.trim(), assigned_to: Number(tWho), due_date: tDue || null }); setDetail({ ...detail, tasks: [...detail.tasks, r.data] }); setTTitle(''); setTWho(''); setTDue('') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao criar tarefa') }
  }
  const toggleTask = async (t: MTask) => {
    try { const r = await api.patch<{ data: MTask }>(`/meetings/${detail.id}/tasks/${t.id}/toggle`, {}); setDetail({ ...detail, tasks: detail.tasks.map(x => x.id === t.id ? r.data : x) }) }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Só o responsável conclui') }
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
        <div><label className={lblCls} style={{ color: 'var(--text-light)' }}>Pauta / descrição</label>
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 70 }} value={description} onChange={e => setDescription(e.target.value)} /></div>
        <button onClick={saveMeta} disabled={savingMeta} className="text-sm px-4 py-1.5 rounded-lg font-medium self-start" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{savingMeta ? 'Salvando…' : 'Salvar dados'}</button>
      </div>

      {/* Envolvidos */}
      <div className="ds-card p-4 space-y-2">
        <div className="flex items-center gap-2"><Users size={15} style={{ color: 'var(--primary)' }} /><span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Envolvidos</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· só eles têm acesso às anotações</span></div>
        <MultiSelect placeholder="Adicionar pessoas…" selected={detail.participants} onChange={syncParticipants} search={searchUsers} />
      </div>

      {/* Anotações */}
      <div className="ds-card p-4 space-y-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Anotações da reunião</span>
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 120 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="O que foi discutido, decisões, encaminhamentos…" />
        <button onClick={saveNotes} disabled={savingNotes} className="text-sm px-4 py-1.5 rounded-lg font-medium self-start" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{savingNotes ? 'Salvando…' : 'Salvar anotações'}</button>
      </div>

      {/* Tarefas */}
      <div className="ds-card p-4 space-y-2">
        <div className="flex items-center gap-2"><ClipboardList size={15} style={{ color: 'var(--primary)' }} /><span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tarefas</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· vão pro “Meu Dia” do responsável</span></div>
        {detail.tasks.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma tarefa ainda.</p>}
        {detail.tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => toggleTask(t)} title={t.assigned_to === meUserId ? 'Concluir/reabrir' : 'Só o responsável conclui'} className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${t.completed ? 'var(--success)' : 'var(--border)'}`, background: t.completed ? 'var(--success)' : 'transparent' }}>
              {t.completed && <Check size={13} color="#fff" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--text)', textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? .6 : 1 }}>{t.title}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>👤 {t.assignee_name ?? '—'}{t.due_date ? ` · até ${new Date(t.due_date + 'T00:00').toLocaleDateString('pt-BR')}` : ''}</p>
            </div>
            {(t.created_by === meUserId) && <button onClick={() => delTask(t)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>}
          </div>
        ))}
        {/* nova tarefa */}
        <div className="grid gap-2 pt-2" style={{ gridTemplateColumns: '1fr 160px 140px auto' }}>
          <input className={inputCls} style={inputStyle} value={tTitle} onChange={e => setTTitle(e.target.value)} placeholder="Nova tarefa…" onKeyDown={e => { if (e.key === 'Enter') addTask() }} />
          <select className={inputCls} style={inputStyle} value={tWho} onChange={e => setTWho(e.target.value)}>
            <option value="">Responsável…</option>
            {detail.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" className={inputCls} style={inputStyle} value={tDue} onChange={e => setTDue(e.target.value)} />
          <button onClick={addTask} className="px-3 rounded-lg text-sm font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /></button>
        </div>
      </div>
    </div>
  )
}
