'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { Plus, Trash2, Pencil, Save, X } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'

interface Ref { id: number; name: string }
interface Dept { id: number; customer_id: number; name: string; active: boolean }

// Cadastro de Departamentos do Help Desk — escopo POR CLIENTE. Escolha o cliente,
// gerencie os departamentos dele. Uma pessoa (usuário cliente) recebe o departamento
// na aba "Pessoas".
export function Departments() {
  const [customers, setCustomers] = useState<Ref[]>([])
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [deps, setDeps] = useState<Dept[]>([])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ data?: Ref[] }>('/help-desk/integration-customers').then(r => setCustomers(r?.data ?? [])).catch(() => {})
  }, [])

  const load = useCallback(() => {
    if (!customerId) { setDeps([]); return }
    api.get<{ data: Dept[] }>(`/help-desk/departments?customer_id=${customerId}`).then(r => setDeps(r?.data ?? [])).catch(() => {})
  }, [customerId])
  useEffect(() => { load(); setEditing(null); setNewName('') }, [load])

  const add = async () => {
    const name = newName.trim()
    if (!customerId) { toast.error('Selecione um cliente primeiro'); return }
    if (!name) return
    setSaving(true)
    try {
      await api.post('/help-desk/departments', { customer_id: customerId, name })
      setNewName(''); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao criar departamento') }
    finally { setSaving(false) }
  }

  const saveEdit = async () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) return
    setSaving(true)
    try {
      await api.put(`/help-desk/departments/${editing.id}`, { name })
      setEditing(null); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao renomear') }
    finally { setSaving(false) }
  }

  const toggleActive = async (d: Dept) => {
    try {
      await api.put(`/help-desk/departments/${d.id}`, { active: !d.active })
      setDeps(ds => ds.map(x => x.id === d.id ? { ...x, active: !x.active } : x))
    } catch { toast.error('Erro ao alterar status') }
  }

  const del = async (d: Dept) => {
    if (!confirm(`Excluir o departamento "${d.name}"? As pessoas vinculadas ficarão sem departamento.`)) return
    try { await api.delete(`/help-desk/departments/${d.id}`); load() } catch { toast.error('Erro ao excluir') }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Departamentos são por cliente. Escolha um cliente para gerenciar os departamentos dele. O departamento de cada pessoa é definido na aba <strong>Pessoas</strong>.
      </p>

      <div className="max-w-sm">
        <SearchSelect
          value={customerId}
          onChange={(v: string) => setCustomerId(v === '' ? '' : Number(v))}
          options={[{ id: '', name: '— selecione o cliente —' }, ...customers]}
          placeholder="Buscar cliente…"
          fullWidth
        />
      </div>

      {customerId !== '' && (
        <>
          {/* Novo departamento */}
          <div className="flex items-center gap-2 max-w-md">
            <input
              className={`${fieldCls} flex-1`} style={inputStyle}
              placeholder="Nome do departamento (ex.: Financeiro)"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
            />
            <button onClick={add} disabled={saving || !newName.trim()} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg">
              <Plus size={14} /> Adicionar
            </button>
          </div>

          <div className="ds-card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
                <th className="px-3 py-2">Departamento</th><th className="px-3 py-2 w-24">Ativo</th><th className="px-3 py-2 w-24"></th>
              </tr></thead>
              <tbody>
                {deps.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum departamento para este cliente.</td></tr>}
                {deps.map(d => (
                  <tr key={d.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>
                      {editing?.id === d.id ? (
                        <div className="flex items-center gap-1.5">
                          <input className={`${fieldCls} flex-1`} style={inputStyle} value={editing.name} autoFocus
                            onChange={e => setEditing({ id: d.id, name: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }} />
                          <button onClick={saveEdit} disabled={saving} title="Salvar" style={{ color: 'var(--primary)' }}><Save size={15} /></button>
                          <button onClick={() => setEditing(null)} title="Cancelar" style={{ color: 'var(--text-muted)' }}><X size={15} /></button>
                        </div>
                      ) : d.name}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleActive(d)} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: d.active ? 'var(--success-bg)' : 'var(--surface-sunken)', color: d.active ? 'var(--success)' : 'var(--text-muted)' }}>
                        {d.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {editing?.id !== d.id && (
                        <div className="flex items-center gap-2.5">
                          <button onClick={() => setEditing({ id: d.id, name: d.name })} title="Renomear" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                          <button onClick={() => del(d)} title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
