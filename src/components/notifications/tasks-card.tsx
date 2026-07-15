'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Trash2, Plus, Repeat, X, Link2, Pencil, ChevronRight, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { RoutinesPanel } from '@/components/notifications/routines-panel'

const CAN_DELEGATE = ['admin', 'coordenador', 'administrativo']

interface Task {
  id: number; title: string; description: string | null
  due_date: string | null; due_time: string | null; completed: boolean
  type: string; priority: string; entity_type: string | null; entity_id: number | null; entity_label: string | null
  recurrence_type: string; recurrence_interval: number; recurrence_weekdays: number[]; recurrence_end_date: string | null
  created_by: number | null; created_name: string | null; assigned_to: number | null; assigned_name: string | null
  completed_name: string | null; completed_at: string | null
  is_creator: boolean | null; is_assignee: boolean | null; delegated: boolean
}
interface EntOpt { id: number; name: string }
const FILTERS = [{ k: 'mine', l: 'Minhas' }, { k: 'by_me', l: 'Delegadas por mim' }, { k: 'to_me', l: 'Delegadas para mim' }, { k: 'rotinas', l: 'Rotinas' }]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']   // índice 0..6 (0=domingo)

const TYPE_L: Record<string, string> = { pessoal: 'Pessoal', cliente: 'Cliente', 'follow-up': 'Follow-up', interno: 'Interno' }
const PRIO_L: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }
const PRIO_COLOR: Record<string, string> = { baixa: 'var(--text-light)', media: 'var(--warning-border)', alta: 'var(--danger-border)' }
const RECUR_L: Record<string, string> = { none: 'Não repetir', daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal' }
const ENT_L: Record<string, string> = { customer: 'Cliente', project: 'Projeto', contract: 'Contrato' }
const inputStyle = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none w-full'
const lbl = 'text-[11px] font-semibold block mb-0.5'

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
function recurLabel(t: Task): string {
  const wd = t.recurrence_weekdays ?? []
  if (t.recurrence_type === 'daily') return wd.length >= 5 ? 'Diária (dias úteis)' : 'Diária'
  if (t.recurrence_type === 'weekly') return wd.length ? `Semanal · ${wd.map(d => WEEKDAYS[d]).join(', ')}` : 'Semanal'
  if (t.recurrence_type === 'monthly') return t.recurrence_interval > 1 ? `A cada ${t.recurrence_interval} meses` : 'Mensal'
  return ''
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const isOverdue = (t: Task) => {
  if (t.completed || !t.due_date) return false
  if (t.due_date < todayStr()) return true
  if (t.due_date === todayStr() && t.due_time) return t.due_time < new Date().toTimeString().slice(0, 5)
  return false
}

/** 📝 Tarefas do dia (Smart To-Do) — pessoais. ENTER cria; clicar abre edição completa. */
export function TasksCard({ onChanged }: { onChanged?: () => void } = {}) {
  const [items, setItems] = useState<Task[]>([])
  const [done, setDone] = useState<Task[]>([])
  const [showDone, setShowDone] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [filter, setFilter] = useState('mine')
  const { user } = useAuth()
  const canDelegate = CAN_DELEGATE.includes(user?.type ?? '')
  const alerted = useRef<Set<string>>(new Set())

  // Confirmação in-app (substitui o confirm() nativo).
  const [confirmData, setConfirmData] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null)
  const ask = useCallback((message: string) => new Promise<boolean>(resolve => setConfirmData({ message, resolve })), [])
  const onConfirmResult = (ok: boolean) => { confirmData?.resolve(ok); setConfirmData(null) }

  const load = useCallback(() => {
    api.get<{ data: Task[] }>(`/tasks?filter=${filter}`).then(r => setItems(r.data ?? [])).catch(() => {})
    api.get<{ data: Task[] }>(`/tasks?filter=${filter}&completed=1`).then(r => setDone(r.data ?? [])).catch(() => {})
  }, [filter])
  useEffect(() => { load() }, [load])

  // Tarefa com hora → notificação (toast) quando o horário chega.
  useEffect(() => {
    const check = () => {
      const hhmm = new Date().toTimeString().slice(0, 5)
      items.forEach(t => {
        if (t.completed || !t.due_time) return
        if (t.due_date && t.due_date !== todayStr()) return
        const key = `${t.id}@${todayStr()}`
        if (t.due_time <= hhmm && !alerted.current.has(key)) { alerted.current.add(key); toast(`🔔 Tarefa: ${t.title}`, { duration: 8000 }) }
      })
    }
    check(); const i = setInterval(check, 60000); return () => clearInterval(i)
  }, [items])

  const add = async () => {
    const title = draft.trim(); if (!title) return
    setDraft('')
    try { const r = await api.post<{ data: Task }>('/tasks', { title }); setItems(p => [r.data, ...p]); onChanged?.() }
    catch { toast.error('Erro ao criar tarefa'); load() }
  }
  const toggle = async (t: Task) => {
    // Concluir pede confirmação; estornar não.
    if (!t.completed && !(await ask(`Concluir a tarefa "${t.title}"?`))) return
    // concluir → some da lista ativa; estornar → some das concluídas (otimista)
    if (!t.completed) setItems(p => p.filter(x => x.id !== t.id))
    else setDone(p => p.filter(x => x.id !== t.id))
    try { await api.put(`/tasks/${t.id}`, { completed: !t.completed }) }
    catch { toast.error('Erro') } finally { load(); onChanged?.() }
  }
  // Tarefa "vazia" p/ o modal de criação (todas as configs).
  const newTask = (): Task => ({
    id: 0, title: draft.trim(), description: null, due_date: null, due_time: null, completed: false,
    type: 'pessoal', priority: 'media', entity_type: null, entity_id: null, entity_label: null,
    recurrence_type: 'none', recurrence_interval: 1, recurrence_weekdays: [], recurrence_end_date: null,
    created_by: user?.id ?? null, created_name: user?.name ?? null, assigned_to: user?.id ?? null, assigned_name: user?.name ?? '',
    completed_name: null, completed_at: null, is_creator: true, is_assignee: true, delegated: false,
  })
  const remove = async (id: number) => {
    if (!(await ask('Excluir esta tarefa?'))) return
    setItems(p => p.filter(x => x.id !== id)); setDone(p => p.filter(x => x.id !== id))
    try { await api.delete(`/tasks/${id}`); onChanged?.() } catch { load() }
  }
  const patchTitle = async (id: number, title: string) => {
    setItems(p => p.map(x => x.id === id ? { ...x, title } : x))
    try { await api.put(`/tasks/${id}`, { title }); onChanged?.() } catch { toast.error('Erro'); load() }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">📝</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tarefas do dia</span>
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-light)' }}>{items.length}</span>
      </div>

      <div className="rounded-xl p-2 space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        {/* Filtros de delegação */}
        <div className="flex items-center gap-1 px-0.5 flex-wrap">
          {FILTERS.filter(f => canDelegate || (f.k !== 'by_me' && f.k !== 'rotinas')).map(f => {
            const on = filter === f.k
            return (
              <button key={f.k} type="button" onClick={() => setFilter(f.k)} className="text-[11px] px-2 py-1 rounded-lg"
                style={{ background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}>{f.l}</button>
            )
          })}
        </div>

        {filter === 'rotinas' ? (
          <RoutinesPanel />
        ) : (
          <>
            {filter === 'mine' && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)' }}>
                <button type="button" onClick={() => setEditing(newTask())} title="Nova tarefa com todas as opções" className="shrink-0"><Plus size={16} style={{ color: 'var(--primary)' }} /></button>
                <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
                  placeholder="Nova tarefa… (Enter cria rápido, ou clique no + p/ opções)" className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text)' }} />
              </div>
            )}

            <div className="mt-1">
              {items.length === 0 && <p className="text-xs px-2 py-2" style={{ color: 'var(--text-muted)' }}>Nenhuma tarefa por aqui.</p>}
              {items.map(t => <Row key={t.id} t={t} onToggle={() => toggle(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t.id)} onRename={(title) => patchTitle(t.id, title)} />)}
            </div>

            {/* Concluídas — some da lista ativa, ficam aqui com opção de estornar */}
            {done.length > 0 && (
              <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--border)' }}>
                <button type="button" onClick={() => setShowDone(s => !s)} className="text-[11px] inline-flex items-center gap-1 px-2 py-1" style={{ color: 'var(--text-muted)' }}>
                  <ChevronRight size={12} style={{ transform: showDone ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} /> Concluídas ({done.length})
                </button>
                {showDone && done.map(t => <DoneRow key={t.id} t={t} onEstornar={() => toggle(t)} onDelete={() => remove(t.id)} />)}
              </div>
            )}
          </>
        )}
      </div>

      {editing && <EditModal task={editing} canDelegate={canDelegate} ask={ask} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged?.() }} />}
      <ConfirmDialog data={confirmData} onResult={onConfirmResult} />
    </div>
  )
}

/** Confirmação central do app (substitui o confirm() nativo do browser). */
function ConfirmDialog({ data, onResult }: { data: { message: string } | null; onResult: (ok: boolean) => void }) {
  if (!data) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }} onClick={() => onResult(false)}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-[popIn_.16s_ease-out]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="p-5"><p className="text-sm" style={{ color: 'var(--text)' }}>{data.message}</p></div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={() => onResult(false)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={() => onResult(true)} autoFocus className="ds-btn-primary text-sm px-5 py-2 rounded-lg">Confirmar</button>
        </div>
      </div>
    </div>
  )
}

function Row({ t, onToggle, onEdit, onDelete, onRename }: { t: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void; onRename: (title: string) => void }) {
  const [title, setTitle] = useState(t.title)
  useEffect(() => { setTitle(t.title) }, [t.title])
  const commit = () => { const v = title.trim(); if (v && v !== t.title) onRename(v); else if (!v) setTitle(t.title) }

  // Estado por data: concluído / atrasado / hoje / futuro.
  const today = todayStr()
  const overdue = isOverdue(t)
  const isToday = !t.completed && t.due_date === today && !overdue
  const isFuture = !t.completed && !!t.due_date && t.due_date > today
  const entKind = t.entity_type ? ENT_L[t.entity_type] : null

  return (
    <div className="group flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors"
      style={overdue ? { background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger-border)', paddingLeft: 8 } : { borderLeft: '3px solid transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = overdue ? 'var(--danger-bg)' : 'var(--surface-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = overdue ? 'var(--danger-bg)' : 'transparent')}>
      <button type="button" onClick={t.is_assignee ? onToggle : undefined} disabled={!t.is_assignee}
        title={t.is_assignee ? (t.completed ? 'Reabrir' : 'Marcar como concluída') : 'Apenas o responsável pode concluir'}
        className="shrink-0 mt-0.5 inline-flex items-center justify-center transition-transform active:scale-90 hover:border-[var(--primary)]"
        style={{ width: 18, height: 18, borderRadius: 999, border: `1.5px solid ${t.completed ? 'var(--success-border)' : 'var(--border)'}`, background: t.completed ? 'var(--success-border)' : 'transparent', cursor: t.is_assignee ? 'pointer' : 'not-allowed', opacity: t.is_assignee ? 1 : 0.5, transition: 'background .15s, border-color .15s' }}>
        {t.completed
          ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ animation: 'taskPop .22s ease-out' }}><path d="M2.5 6.5L5 9L9.5 3.5" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <span className="opacity-0 group-hover:opacity-100" style={{ transition: 'opacity .15s' }}><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9L9.5 3.5" stroke="var(--text-light)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
      </button>

      <div className="flex-1 min-w-0" style={{ opacity: t.completed ? 0.6 : 1 }}>
        {/* Título editável inline + badge de estado */}
        <div className="flex items-center gap-1.5">
          <span className="shrink-0" title={`Importância: ${PRIO_L[t.priority] ?? 'Média'}`} style={{ width: 7, height: 7, borderRadius: 999, background: PRIO_COLOR[t.priority] ?? PRIO_COLOR.media }} />
          <input
            value={title} onChange={e => setTitle(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--text)', textDecoration: t.completed ? 'line-through' : 'none' }} />
          {overdue && <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--danger-border)' }} title="Atrasada">atrasada</span>}
          {isToday && <span className="text-[10px] shrink-0" style={{ color: 'var(--primary)' }}>hoje</span>}
        </div>

        {/* Delegação: Responsável (criei p/ outro) ou Criado por (recebi) */}
        {t.delegated && t.is_creator && t.assigned_name && <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>Responsável: {t.assigned_name}</div>}
        {t.delegated && t.is_assignee && t.created_name && <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>Criado por: {t.created_name}</div>}

        {/* Vínculo: Cliente: Nome / Projeto: Nome */}
        {entKind && t.entity_label && <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{entKind}: {t.entity_label}</div>}

        {/* Tipo • Data • Hora (data muted se futuro) */}
        <div className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>
          {TYPE_L[t.type] ?? t.type}
          {t.due_date && <span style={{ color: isFuture ? 'var(--text-muted)' : 'var(--text-light)' }}> • {ddmm(t.due_date)}</span>}
          {t.due_time && <span> • {t.due_time}</span>}
        </div>

        {t.recurrence_type !== 'none' && <div className="text-[10px] inline-flex items-center gap-0.5" style={{ color: 'var(--primary)' }}><Repeat size={9} /> {recurLabel(t)}</div>}

        {/* Auditoria de conclusão */}
        {t.completed && t.completed_name && <div className="text-[10px]" style={{ color: 'var(--success-border)' }}>✓ Concluído por {t.completed_name}{t.completed_at ? ` às ${hhmm(t.completed_at)}` : ''}</div>}
      </div>

      <div className="shrink-0 flex items-center gap-1.5 mt-0.5 opacity-0 group-hover:opacity-100">
        <button type="button" onClick={onEdit} title="Editar detalhes"><Pencil size={13} style={{ color: 'var(--primary)' }} /></button>
        <button type="button" onClick={onDelete} title="Excluir"><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
      </div>
    </div>
  )
}

function DoneRow({ t, onEstornar, onDelete }: { t: Task; onEstornar: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span className="flex-1 min-w-0">
        <span className="text-[13px] truncate block" style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{t.title}</span>
        {t.completed_name && <span className="text-[10px]" style={{ color: 'var(--success-border)' }}>✓ Concluído por {t.completed_name}{t.completed_at ? ` às ${hhmm(t.completed_at)}` : ''}</span>}
      </span>
      {t.is_assignee && (
        <button type="button" onClick={onEstornar} title="Estornar conclusão" className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <RotateCcw size={12} /> Estornar
        </button>
      )}
      <button type="button" onClick={onDelete} className="shrink-0 opacity-0 group-hover:opacity-100" title="Excluir"><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
    </div>
  )
}

function EditModal({ task, canDelegate, ask, onClose, onSaved }: { task: Task; canDelegate: boolean; ask: (m: string) => Promise<boolean>; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [date, setDate] = useState(task.due_date ?? '')
  const [time, setTime] = useState(task.due_time ?? '')
  const [type, setType] = useState(task.type)
  const [priority, setPriority] = useState(task.priority || 'media')
  const [recur, setRecur] = useState(task.recurrence_type)
  const [interval, setIntervalV] = useState(task.recurrence_interval || 1)
  const [weekdays, setWeekdays] = useState<number[]>(task.recurrence_type === 'weekly' ? (task.recurrence_weekdays ?? []) : [])
  const [businessOnly, setBusinessOnly] = useState<boolean>(task.recurrence_type === 'daily' && (task.recurrence_weekdays?.length ?? 0) >= 5)
  const [recurEnd, setRecurEnd] = useState(task.recurrence_end_date ?? '')
  const toggleWeekday = (i: number) => setWeekdays(w => w.includes(i) ? w.filter(x => x !== i) : [...w, i].sort((a, b) => a - b))
  const [entType, setEntType] = useState(task.entity_type ?? '')
  const [entId, setEntId] = useState<number | null>(task.entity_id)
  const [entLabel, setEntLabel] = useState(task.entity_label ?? '')
  // Vínculo com projeto: filtra pelo cliente primeiro
  const [entCustId, setEntCustId] = useState<number | null>(null)
  const [entCustLabel, setEntCustLabel] = useState('')
  const [assignedTo, setAssignedTo] = useState<number | null>(task.assigned_to)
  const [assignedName, setAssignedName] = useState(task.assigned_name ?? '')
  const [completedState, setCompletedState] = useState(task.completed)
  const [saving, setSaving] = useState(false)

  const isNew = !task.id
  const save = async () => {
    if (!title.trim()) return toast.error('Informe o título.')
    if (recur === 'weekly' && weekdays.length === 0) return toast.error('Selecione ao menos um dia da semana.')
    const weekdaysPayload = recur === 'weekly' ? weekdays : recur === 'daily' && businessOnly ? [1, 2, 3, 4, 5] : []
    const body = {
      title: title.trim(), due_date: date || null, due_time: time || null, type, priority,
      recurrence_type: recur, recurrence_interval: recur === 'monthly' ? (Number(interval) || 1) : 1,
      recurrence_weekdays: weekdaysPayload,
      recurrence_end_date: recur !== 'none' ? (recurEnd || null) : null,
      entity_type: entType || null, entity_id: entType ? entId : null,
      assigned_to: assignedTo,
      ...(!isNew && task.is_assignee ? { completed: completedState } : {}),
    }
    setSaving(true)
    try {
      if (isNew) await api.post('/tasks', body)
      else await api.put(`/tasks/${task.id}`, body)
      toast.success(isNew ? 'Tarefa criada' : 'Tarefa salva'); onSaved()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }
  // Concluir pela modal: botão + confirmação.
  const concluir = async () => {
    if (!(await ask(`Concluir a tarefa "${task.title}"?`))) return
    setSaving(true)
    try { await api.put(`/tasks/${task.id}`, { completed: true }); toast.success('Tarefa concluída'); onSaved() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{isNew ? 'Nova tarefa' : 'Editar tarefa'}</span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Título</label>
            <input className={fieldCls} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} autoFocus={isNew} /></div>

          {/* Concluir: botão com confirmação (só na edição de tarefa que é minha e ainda pendente) */}
          {!isNew && task.is_assignee && !task.completed && (
            <button type="button" onClick={concluir} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 text-sm rounded-lg px-3 py-2 font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
              ✓ Concluir tarefa
            </button>
          )}
          {!isNew && task.is_assignee && task.completed && (
            <button type="button" onClick={() => setCompletedState(false)} className="w-full text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>↩ Estornar conclusão (salve para confirmar)</button>
          )}

          {canDelegate && (
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>👤 Responsável</label>
              <UserPicker value={assignedName} onPick={(o) => { setAssignedTo(o.id); setAssignedName(o.name) }} /></div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Data</label>
              <input type="date" className={fieldCls} style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Hora</label>
              <input type="time" className={fieldCls} style={inputStyle} value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Tipo</label>
              <select className={fieldCls} style={inputStyle} value={type} onChange={e => setType(e.target.value)}>
                {Object.entries(TYPE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>⚑ Importância</label>
              <select className={fieldCls} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                {Object.entries(PRIO_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
          </div>

          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>🔁 Recorrência</label>
            <select className={fieldCls} style={inputStyle} value={recur} onChange={e => setRecur(e.target.value)}>
              {Object.entries(RECUR_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>

          {recur === 'monthly' && (
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>A cada quantos meses</label>
              <input type="number" min={1} className={fieldCls} style={inputStyle} value={interval} onChange={e => setIntervalV(Number(e.target.value))} /></div>
          )}

          {/* DIÁRIA: todo dia, com opção de só dias úteis */}
          {recur === 'daily' && (
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={businessOnly} onChange={e => setBusinessOnly(e.target.checked)} /> Somente dias úteis <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>(seg–sex)</span>
            </label>
          )}

          {/* SEMANAL: escolher os dias (obrigatório ao menos 1) */}
          {recur === 'weekly' && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Dias da semana <span className="text-[10px]">(apenas para recorrência semanal)</span></label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => {
                  const on = weekdays.includes(i)
                  return (
                    <button key={i} type="button" onClick={() => toggleWeekday(i)} className="text-[11px] px-2 py-1 rounded-lg"
                      style={{ border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>{d}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Término da recorrência (opcional) */}
          {recur !== 'none' && (
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Repetir até <span className="text-[10px]">(opcional)</span></label>
              <input type="date" min={date || todayStr()} className={fieldCls} style={inputStyle} value={recurEnd} onChange={e => setRecurEnd(e.target.value)} /></div>
          )}

          {/* Vinculação */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>🔗 Vincular a</label>
              <select className={fieldCls} style={inputStyle} value={entType} onChange={e => { setEntType(e.target.value); setEntId(null); setEntLabel(''); setEntCustId(null); setEntCustLabel('') }}>
                <option value="">Nenhum</option>
                {Object.entries(ENT_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            {/* Projeto: cliente primeiro; outros tipos: picker direto */}
            {entType === 'project' ? (
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cliente</label>
                <EntityPicker type="customer" value={entCustLabel} onPick={(o) => { setEntCustId(o.id); setEntCustLabel(o.name); setEntId(null); setEntLabel('') }} /></div>
            ) : entType && (
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>{ENT_L[entType]}</label>
                <EntityPicker type={entType} value={entLabel} onPick={(o) => { setEntId(o.id); setEntLabel(o.name) }} /></div>
            )}
          </div>
          {entType === 'project' && (
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Projeto</label>
              <EntityPicker type="project" customerId={entCustId} value={entLabel} onPick={(o) => { setEntId(o.id); setEntLabel(o.name) }} /></div>
          )}
        </div>
        <div className="px-4 py-3 flex justify-end gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="ds-btn-primary text-sm px-4 py-1.5 rounded-lg">Salvar</button>
        </div>
      </div>
    </div>
  )
}

function UserPicker({ value, onPick }: { value: string; onPick: (o: EntOpt) => void }) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<EntOpt[]>([])
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => {
    if (!open) return
    const term = q === value ? '' : q   // valor inalterado = lista TODOS; só filtra ao digitar
    const t = setTimeout(() => {
      api.get<{ data: EntOpt[] }>(`/tasks/users?search=${encodeURIComponent(term)}`).then(r => setOpts(r.data ?? [])).catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [q, open, value])
  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-lg px-2" style={inputStyle}>
        <input className="text-sm py-1.5 bg-transparent outline-none w-full" style={{ color: 'var(--text)' }} value={q}
          onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true) }} placeholder="Buscar usuário…" />
      </div>
      {open && opts.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden shadow-lg max-h-48 overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {opts.map(o => (
            <button key={o.id} type="button" onClick={() => { onPick(o); setQ(o.name); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-sm" style={{ color: 'var(--text)' }}>{o.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function EntityPicker({ type, value, onPick, customerId }: { type: string; value: string; onPick: (o: EntOpt) => void; customerId?: number | null }) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<EntOpt[]>([])
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => {
    if (!open) return
    const term = q === value ? '' : q   // valor inalterado = lista TODOS; só filtra ao digitar
    const t = setTimeout(() => {
      const cust = customerId ? `&customer_id=${customerId}` : ''
      api.get<{ data: EntOpt[] }>(`/tasks/entities?type=${type}&search=${encodeURIComponent(term)}${cust}`).then(r => setOpts(r.data ?? [])).catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [q, open, type, value, customerId])
  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-lg px-2" style={inputStyle}>
        <Link2 size={12} style={{ color: 'var(--text-light)' }} />
        <input className="text-sm py-1.5 bg-transparent outline-none w-full" style={{ color: 'var(--text)' }} value={q}
          onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true) }} placeholder="Buscar…" />
      </div>
      {open && opts.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg overflow-hidden shadow-lg max-h-48 overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {opts.map(o => (
            <button key={o.id} type="button" onClick={() => { onPick(o); setQ(o.name); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-sm leading-snug whitespace-normal break-words" style={{ color: 'var(--text)' }}>{o.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}
