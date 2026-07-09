'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { Plus, Trash2, Save, Pencil, Search } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

interface Ref { id: number; name: string }
interface Rule {
  id: number; domain: string; classification: string | null; enabled: boolean
  customer_id: number | null; access_profile_id: number | null
  customer?: Ref | null; access_profile?: Ref | null
}

export function AssociationRules() {
  const [rows, setRows] = useState<Rule[]>([])
  const [customers, setCustomers] = useState<Ref[]>([])
  const [profiles, setProfiles] = useState<Ref[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Rule | null>(null)
  const [domain, setDomain] = useState(''); const [customerId, setCustomerId] = useState(''); const [profileId, setProfileId] = useState(''); const [classification, setClassification] = useState(''); const [enabled, setEnabled] = useState(true)

  const load = useCallback(() => { api.get<{ data: Rule[] }>('/help-desk/association-rules').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    // Só clientes com contrato de sustentação + chave de integração ligada.
    api.get<{ data?: Ref[] }>('/help-desk/integration-customers').then(r => {
      const list = r?.data ?? []
      setCustomers(list.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
    }).catch(() => {})
    api.get<{ data: Ref[] }>('/help-desk/access-profiles?all=1&kind=cliente').then(r => setProfiles(r?.data ?? [])).catch(() => {})
  }, [])

  const reset = () => { setEditing(null); setDomain(''); setCustomerId(''); setProfileId(''); setClassification(''); setEnabled(true) }
  const startEdit = (r: Rule) => { setEditing(r); setDomain(r.domain); setCustomerId(r.customer_id ? String(r.customer_id) : ''); setProfileId(r.access_profile_id ? String(r.access_profile_id) : ''); setClassification(r.classification ?? ''); setEnabled(r.enabled) }
  const save = async () => {
    if (!domain.trim()) return toast.error('Informe o domínio.')
    const body = { domain: domain.trim(), customer_id: customerId ? Number(customerId) : null, access_profile_id: profileId ? Number(profileId) : null, classification: classification.trim() || null, enabled }
    try {
      if (editing) await api.put(`/help-desk/association-rules/${editing.id}`, body); else await api.post('/help-desk/association-rules', body)
      reset(); toast.success('Regra salva'); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') }
  }
  const toggle = async (r: Rule) => { try { await api.put(`/help-desk/association-rules/${r.id}`, { enabled: !r.enabled }); load() } catch { toast.error('Erro') } }
  const del = async (r: Rule) => { if (!confirm(`Excluir "${r.domain}"?`)) return; try { await api.delete(`/help-desk/association-rules/${r.id}`); if (editing?.id === r.id) reset(); load() } catch { toast.error('Erro') } }

  const filtered = rows.filter(r => r.domain.toLowerCase().includes(q.trim().toLowerCase()) || (r.customer?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Vincula um domínio de e-mail a uma Organização + Perfil de acesso. E-mails de abertura desse domínio são identificados ao cliente certo.</p>
      <div className="ds-card p-3 flex items-end gap-2 flex-wrap" style={{ border: editing ? '1px solid var(--primary)' : undefined }}>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>{editing ? 'Editando regra' : 'Domínio'}</label>
          <div className="flex items-center">
            <span className="text-[11px] px-2 py-1.5 rounded-l-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)', border: '1px solid var(--border)', borderRight: 'none' }}>todos-os-e-mails-de@</span>
            <input className={`${fieldCls} w-48 rounded-l-none`} style={inputStyle} placeholder="agroamazonia.com.br" value={domain} onChange={e => setDomain(e.target.value)} />
          </div>
        </div>
        <div className="w-56"><label className={lbl} style={{ color: 'var(--text-light)' }}>Organização</label>
          <SearchSelect value={customerId} onChange={setCustomerId} options={[{ id: '', name: '—' }, ...customers]} placeholder="Buscar cliente…" fullWidth /></div>
        <div className="w-52"><label className={lbl} style={{ color: 'var(--text-light)' }}>Perfil de acesso</label>
          <SearchSelect value={profileId} onChange={setProfileId} options={[{ id: '', name: '—' }, ...profiles]} placeholder="Perfil…" fullWidth /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Classificação</label><input className={`${fieldCls} w-36`} style={inputStyle} value={classification} onChange={e => setClassification(e.target.value)} /></div>
        <label className="flex items-center gap-1.5 text-sm mb-1.5" style={{ color: 'var(--text)' }}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Habilitado</label>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={save}>{editing ? <><Save size={15} /> Salvar</> : <><Plus size={15} /> Adicionar</>}</button>
        {editing && <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={reset}>Cancelar</button>}
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
        <input className={`${fieldCls} pl-8 w-full`} style={inputStyle} placeholder="Buscar domínio ou organização…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="ds-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
            <th className="px-3 py-2">Domínio</th><th className="px-3 py-2">Perfil de acesso</th><th className="px-3 py-2">Classificação</th><th className="px-3 py-2">Organização</th><th className="px-3 py-2">Habilitado</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhuma regra.</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} className="border-t ds-row-hover" style={{ borderColor: 'var(--border)', background: editing?.id === r.id ? 'var(--primary-soft)' : undefined }}>
                <td className="px-3 py-2"><button className="text-left font-mono text-[12px]" style={{ color: editing?.id === r.id ? 'var(--primary)' : 'var(--text)' }} onClick={() => startEdit(r)}>{r.domain}</button></td>
                <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{r.access_profile?.name ?? '—'}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-light)' }}>{r.classification ?? '—'}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{r.customer?.name ?? '—'}</td>
                <td className="px-3 py-2"><button onClick={() => toggle(r)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: r.enabled ? 'var(--success-bg)' : 'var(--surface-sunken)', color: r.enabled ? 'var(--success-border)' : 'var(--text-muted)' }}>{r.enabled ? 'Sim' : 'Não'}</button></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><button className="mr-2" title="Editar" onClick={() => startEdit(r)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button><button title="Excluir" onClick={() => del(r)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{filtered.length} regra(s){rows.length >= 1000 ? ' (limite 1000 — refine a busca)' : ''}</p>
    </div>
  )
}
