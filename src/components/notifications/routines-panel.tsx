'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Trash2, X, Play, BarChart3, Pencil, Users } from 'lucide-react'
import { MultiSelect, type MSOpt } from '@/components/notifications/multi-select'

interface RItem { id?: number; titulo: string; tipo: string; priority: string; recorrencia: string; recurrence_weekdays: number[]; hora_padrao: string | null }
interface Routine { id: number; nome: string; descricao: string | null; active: boolean; owner_name: string; users: MSOpt[]; items: RItem[] }

const TYPE_L: Record<string, string> = { pessoal: 'Pessoal', cliente: 'Cliente', 'follow-up': 'Follow-up', interno: 'Interno' }
const PRIO_L: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }
const RECUR_L: Record<string, string> = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal' }
const STATUS_L: Record<string, { l: string; c: string; bg: string }> = {
  concluido: { l: 'Concluído', c: 'var(--success-border)', bg: 'var(--success-bg)' },
  pendente: { l: 'Pendente', c: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  sem_tarefas: { l: 'Sem tarefas', c: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
}
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const inputStyle = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2 py-1.5 outline-none w-full'

export function RoutinesPanel() {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [tracking, setTracking] = useState<Routine | null>(null)

  const load = useCallback(() => { api.get<{ data: Routine[] }>('/task-groups').then(r => setRoutines(r.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const generate = async (r: Routine) => {
    try { const res = await api.post<{ data: { generated: number } }>(`/task-groups/${r.id}/generate`, {}); toast.success(`${res.data?.generated ?? 0} tarefa(s) geradas para hoje`) }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  const remove = async (r: Routine) => {
    if (!confirm(`Excluir a rotina "${r.nome}"?`)) return
    try { await api.delete(`/task-groups/${r.id}`); load() } catch { toast.error('Erro') }
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Rotinas que geram tarefas diárias para a equipe</span>
        <button onClick={() => setEditing('new')} className="ds-btn-primary inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg"><Plus size={13} /> Nova rotina</button>
      </div>

      {routines.length === 0 && <p className="text-xs px-1 py-2" style={{ color: 'var(--text-muted)' }}>Nenhuma rotina criada.</p>}
      {routines.map(r => (
        <div key={r.id} className="rounded-lg px-2.5 py-2" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>{r.nome}</span>
            {!r.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>inativa</span>}
            <button title="Gerar hoje" onClick={() => generate(r)}><Play size={14} style={{ color: 'var(--primary)' }} /></button>
            <button title="Acompanhar" onClick={() => setTracking(r)}><BarChart3 size={15} style={{ color: 'var(--primary)' }} /></button>
            <button title="Editar" onClick={() => setEditing(r)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button>
            <button title="Excluir" onClick={() => remove(r)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
          <div className="text-[11px] mt-0.5 inline-flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-light)' }}>
            <span className="inline-flex items-center gap-1"><Users size={11} /> {r.users.length} pessoa(s)</span>
            <span>· {r.items.length} tarefa(s)</span>
          </div>
        </div>
      ))}

      {editing && <RoutineModal routine={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {tracking && <TrackingModal routine={tracking} onClose={() => setTracking(null)} />}
    </div>
  )
}

function RoutineModal({ routine, onClose, onSaved }: { routine: Routine | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(routine?.nome ?? '')
  const [descricao, setDescricao] = useState(routine?.descricao ?? '')
  const [active, setActive] = useState(routine?.active ?? true)
  const [team, setTeam] = useState<MSOpt[]>(routine?.users ?? [])
  const [items, setItems] = useState<RItem[]>(routine?.items ?? [{ titulo: '', tipo: 'interno', priority: 'media', recorrencia: 'daily', recurrence_weekdays: [], hora_padrao: null }])
  const [saving, setSaving] = useState(false)

  const searchUsers = useCallback(async (q: string): Promise<MSOpt[]> => {
    const r = await api.get<{ data: MSOpt[] }>(`/tasks/users?search=${encodeURIComponent(q)}`)
    return r.data ?? []
  }, [])

  const setItem = (i: number, patch: Partial<RItem>) => setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const addItem = () => setItems(arr => [...arr, { titulo: '', tipo: 'interno', priority: 'media', recorrencia: 'daily', recurrence_weekdays: [], hora_padrao: null }])
  const removeItem = (i: number) => setItems(arr => arr.length <= 1 ? arr : arr.filter((_, idx) => idx !== i))
  const toggleDay = (i: number, d: number) => setItem(i, { recurrence_weekdays: (items[i].recurrence_weekdays.includes(d) ? items[i].recurrence_weekdays.filter(x => x !== d) : [...items[i].recurrence_weekdays, d]).sort((a, b) => a - b) })

  const save = async () => {
    if (!nome.trim()) return toast.error('Informe o nome da rotina.')
    const cleanItems = items.filter(it => it.titulo.trim() !== '')
    if (!team.length) return toast.error('Selecione ao menos um usuário na equipe.')
    if (!cleanItems.length) return toast.error('Adicione ao menos uma tarefa.')
    for (const it of cleanItems) if (it.recorrencia === 'weekly' && !it.recurrence_weekdays.length) return toast.error(`Selecione os dias da tarefa semanal "${it.titulo}".`)
    setSaving(true)
    const body = {
      nome: nome.trim(), descricao: descricao.trim() || null, active,
      user_ids: team.map(u => u.id),
      items: cleanItems.map(it => ({ titulo: it.titulo.trim(), tipo: it.tipo, priority: it.priority, recorrencia: it.recorrencia, recurrence_weekdays: it.recorrencia === 'monthly' ? [] : it.recurrence_weekdays, hora_padrao: it.hora_padrao || null })),
    }
    try {
      if (routine) await api.put(`/task-groups/${routine.id}`, body); else await api.post('/task-groups', body)
      toast.success(routine ? 'Rotina salva' : 'Rotina criada'); onSaved()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{routine ? 'Editar rotina' : 'Nova rotina'}</span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          <div><label className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-light)' }}>Nome</label>
            <input className={fieldCls} style={inputStyle} value={nome} onChange={e => setNome(e.target.value)} autoFocus /></div>
          <div><label className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-light)' }}>Descrição (opcional)</label>
            <input className={fieldCls} style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
          <div><label className="text-[11px] font-semibold block mb-0.5" style={{ color: 'var(--text-light)' }}>👥 Equipe</label>
            <MultiSelect placeholder="Buscar usuários…" selected={team} onChange={setTeam} search={searchUsers} /></div>

          <div>
            <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--text-light)' }}>Tarefas da rotina</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-lg p-2 space-y-1.5" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-1.5">
                    <input className={`${fieldCls} flex-1`} style={inputStyle} placeholder={`Tarefa ${i + 1}`} value={it.titulo} onChange={e => setItem(i, { titulo: e.target.value })} />
                    {items.length > 1 && <button onClick={() => removeItem(i)} title="Remover"><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <select className={fieldCls} style={inputStyle} value={it.tipo} onChange={e => setItem(i, { tipo: e.target.value })}>{Object.entries(TYPE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <select className={fieldCls} style={inputStyle} value={it.priority} onChange={e => setItem(i, { priority: e.target.value })}>{Object.entries(PRIO_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <select className={fieldCls} style={inputStyle} value={it.recorrencia} onChange={e => setItem(i, { recorrencia: e.target.value })}>{Object.entries(RECUR_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <input type="time" className={fieldCls} style={inputStyle} value={it.hora_padrao ?? ''} onChange={e => setItem(i, { hora_padrao: e.target.value || null })} />
                  </div>
                  {(it.recorrencia === 'weekly' || it.recorrencia === 'daily') && (
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAYS.map((d, di) => { const on = it.recurrence_weekdays.includes(di); return (
                        <button key={di} type="button" onClick={() => toggleDay(i, di)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>{d}</button>
                      ) })}
                      <span className="text-[9px] self-center" style={{ color: 'var(--text-light)' }}>{it.recorrencia === 'daily' ? '(vazio = todo dia)' : '(obrigatório)'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-xs mt-1.5 inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={12} /> Adicionar tarefa</button>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Rotina ativa (gera tarefas automaticamente)
          </label>
        </div>
        <div className="px-4 py-3 flex justify-end gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="ds-btn-primary text-sm px-4 py-1.5 rounded-lg">Salvar</button>
        </div>
      </div>
    </div>
  )
}

function TrackingModal({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const [rows, setRows] = useState<{ user_id: number; user_name: string; concluidas: number; pendentes: number; total: number; status: string }[]>([])
  useEffect(() => { api.get<{ data: { users: typeof rows } }>(`/task-groups/${routine.id}/tracking`).then(r => setRows(r.data?.users ?? [])).catch(() => {}) }, [routine.id])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Acompanhamento · {routine.nome}</span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-[12px]">
            <div className="font-semibold" style={{ color: 'var(--text-muted)' }}>Usuário</div>
            <div className="font-semibold text-center" style={{ color: 'var(--text-muted)' }}>Concl.</div>
            <div className="font-semibold text-center" style={{ color: 'var(--text-muted)' }}>Pend.</div>
            <div className="font-semibold text-center" style={{ color: 'var(--text-muted)' }}>Status</div>
            {rows.length === 0 && <div className="col-span-4 text-xs py-2" style={{ color: 'var(--text-muted)' }}>Sem dados de hoje (gere a rotina).</div>}
            {rows.map(u => { const s = STATUS_L[u.status] ?? STATUS_L.sem_tarefas; return (
              <div key={u.user_id} className="contents">
                <div className="truncate" style={{ color: 'var(--text)' }}>{u.user_name}</div>
                <div className="text-center" style={{ color: 'var(--success-border)' }}>{u.concluidas}</div>
                <div className="text-center" style={{ color: 'var(--warning-border)' }}>{u.pendentes}</div>
                <div className="text-center"><span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.c }}>{s.l}</span></div>
              </div>
            ) })}
          </div>
        </div>
      </div>
    </div>
  )
}
