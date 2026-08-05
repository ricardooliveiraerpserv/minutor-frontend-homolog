'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Users, Plus, Pencil, Trash2, Crown, X } from 'lucide-react'

interface Person { id: number; name: string }
interface Team { id: number; name: string; active: boolean; manager: Person | null; members: Person[] }
interface Data { teams: Team[]; candidatos: (Person & { type?: string })[] }

const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export default function CrmEquipesPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [editing, setEditing] = useState<Team | 'new' | null>(null)

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Data }>('/crm/sales-teams')
      .then(r => setD(r?.data ?? null))
      .catch((e: any) => { if (String(e?.message || '').match(/acesso|403/)) setDenied(true); else toast.error('Erro ao carregar equipes') })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (t: Team) => {
    if (!confirm(`Excluir a equipe "${t.name}"?`)) return
    try { await api.delete(`/crm/sales-teams/${t.id}`); toast.success('Equipe excluída'); load() }
    catch { toast.error('Erro ao excluir') }
  }

  return (
    <AppLayout title="Equipes de Vendas (CRM)">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Users size={20} style={{ color: 'var(--primary)' }} /> Equipes de Vendas</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>Defina gestor e membros. Alimenta o escopo <b>Equipe</b> da Política Comercial (metas, comissões, oportunidades).</p>
        </div>
        {d && <button onClick={() => setEditing('new')} className="text-sm rounded-lg px-4 py-2 font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova equipe</button>}
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Você não tem acesso à gestão de equipes.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : d && (
        d.teams.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ border: '1px dashed var(--border)', color: 'var(--text-light)' }}>
            Nenhuma equipe ainda. Crie a primeira para habilitar o escopo por equipe.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.teams.map(t => (
              <div key={t.id} className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)', opacity: t.active ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold truncate" style={{ color: 'var(--text)' }}>{t.name}{!t.active && <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>inativa</span>}</h3>
                    <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}><Crown size={11} style={{ color: 'var(--warning-border)' }} /> {t.manager?.name ?? 'Sem gestor'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditing(t)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}><Pencil size={13} /></button>
                    <button onClick={() => remove(t)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--danger-border)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>{t.members.length} membro(s)</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.members.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{initials(m.name)}</span>
                      {m.name.split(' ')[0]}
                    </span>
                  ))}
                  {t.members.length === 0 && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem membros</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {editing && d && <TeamEditor team={editing === 'new' ? null : editing} candidatos={d.candidatos} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </AppLayout>
  )
}

function TeamEditor({ team, candidatos, onClose, onSaved }: { team: Team | null; candidatos: Person[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team?.name ?? '')
  const [managerId, setManagerId] = useState(team?.manager?.id ? String(team.manager.id) : '')
  const [active, setActive] = useState(team?.active ?? true)
  const [members, setMembers] = useState<number[]>(team?.members.map(m => m.id) ?? [])
  const [saving, setSaving] = useState(false)

  const toggle = (id: number) => setMembers(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const save = async () => {
    if (!name.trim()) { toast.error('Informe o nome da equipe'); return }
    setSaving(true)
    const body = { name, manager_id: managerId ? Number(managerId) : null, active, member_ids: members }
    try {
      if (team) await api.put(`/crm/sales-teams/${team.id}`, body)
      else await api.post('/crm/sales-teams', body)
      toast.success('Equipe salva'); onSaved()
    } catch { toast.error('Erro ao salvar equipe') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{team ? 'Editar equipe' : 'Nova equipe'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button>
        </div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome</label>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Gestor</label>
        <select value={managerId} onChange={e => setManagerId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="">Sem gestor</option>
          {candidatos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Membros ({members.length})</label>
        <div className="rounded-lg max-h-56 overflow-y-auto mb-3" style={{ border: '1px solid var(--border)' }}>
          {candidatos.map(c => (
            <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" style={{ borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" checked={members.includes(c.id)} onChange={() => toggle(c.id)} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</span>
            </label>
          ))}
          {candidatos.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum responsável comercial cadastrado. Marque responsáveis na tela de Responsáveis.</p>}
        </div>
        {team && <label className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-muted)' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Equipe ativa</label>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
