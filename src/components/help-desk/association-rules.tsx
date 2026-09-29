'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  const [tab, setTab] = useState<'vinc' | 'nao'>('vinc')
  const [editing, setEditing] = useState<Rule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [domain, setDomain] = useState(''); const [customerId, setCustomerId] = useState(''); const [profileId, setProfileId] = useState(''); const [classification, setClassification] = useState(''); const [enabled, setEnabled] = useState(true)
  const domainRef = useRef<HTMLInputElement>(null)

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
  const closeForm = () => { setFormOpen(false); reset() }
  const startEdit = (r: Rule) => { setEditing(r); setDomain(r.domain); setCustomerId(r.customer_id ? String(r.customer_id) : ''); setProfileId(r.access_profile_id ? String(r.access_profile_id) : ''); setClassification(r.classification ?? ''); setEnabled(r.enabled); setFormOpen(true) }
  const save = async () => {
    if (!domain.trim()) return toast.error('Informe o domínio.')
    const body = { domain: domain.trim(), customer_id: customerId ? Number(customerId) : null, access_profile_id: profileId ? Number(profileId) : null, classification: classification.trim() || null, enabled }
    try {
      if (editing) await api.put(`/help-desk/association-rules/${editing.id}`, body); else await api.post('/help-desk/association-rules', body)
      closeForm(); toast.success('Regra salva'); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') }
  }
  const toggle = async (r: Rule) => { try { await api.put(`/help-desk/association-rules/${r.id}`, { enabled: !r.enabled }); load() } catch { toast.error('Erro') } }
  const del = async (r: Rule) => { if (!confirm(`Excluir "${r.domain}"?`)) return; try { await api.delete(`/help-desk/association-rules/${r.id}`); if (editing?.id === r.id) closeForm(); load() } catch { toast.error('Erro') } }
  // Clicar num cliente (não-vinculado ou "+domínio") abre o modal já com o cliente selecionado.
  const linkClient = (cid: number) => { reset(); setCustomerId(String(cid)); setFormOpen(true); setTimeout(() => domainRef.current?.focus(), 60) }

  // Agrupa as regras por cliente. Vinculados = clientes com ≥1 domínio; Não vinculados =
  // clientes elegíveis (contrato+integração) ainda sem domínio.
  const term = q.trim().toLowerCase()
  const byCustomer = new Map<number, Rule[]>()
  const noOrg: Rule[] = []
  for (const r of rows) { if (r.customer_id) { const a = byCustomer.get(r.customer_id) ?? []; a.push(r); byCustomer.set(r.customer_id, a) } else noOrg.push(r) }
  const linkedIds = new Set(byCustomer.keys())
  const vinculados = Array.from(byCustomer.entries())
    .map(([id, rs]) => ({ id, name: rs[0].customer?.name ?? `#${id}`, rules: rs }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const naoVinculados = customers.filter(c => !linkedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  const vincF = vinculados.filter(g => !term || g.name.toLowerCase().includes(term) || g.rules.some(r => r.domain.toLowerCase().includes(term)))
  const naoF = naoVinculados.filter(c => !term || c.name.toLowerCase().includes(term))

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Vincula um domínio de e-mail a um cliente. Clique num cliente para vincular um domínio (um cliente pode ter vários).</p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 border-b flex-1" style={{ borderColor: 'var(--border)' }}>
          {([['vinc', `Vinculados (${vinculados.length})`], ['nao', `Não vinculados (${naoVinculados.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="px-3 py-1.5 text-sm"
              style={{ color: tab === id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === id ? 'var(--primary)' : 'transparent'}`, fontWeight: tab === id ? 600 : 400 }}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
          <input className={`${fieldCls} pl-8 w-full`} style={inputStyle} placeholder="Buscar cliente ou domínio…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {tab === 'vinc' ? (
        <div className="space-y-2">
          {vincF.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum cliente com domínio vinculado.</p>}
          {vincF.map(g => (
            <div key={g.id} className="ds-card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--surface-sunken)' }}>
                <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{g.name} <span className="text-[11px] font-normal" style={{ color: 'var(--text-light)' }}>· {g.rules.length} domínio(s)</span></span>
                <button onClick={() => linkClient(g.id)} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={13} /> domínio</button>
              </div>
              {g.rules.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t ds-row-hover" style={{ borderColor: 'var(--border)', background: editing?.id === r.id ? 'var(--primary-soft)' : undefined }}>
                  <button className="font-mono text-[12px] flex-1 text-left" style={{ color: editing?.id === r.id ? 'var(--primary)' : 'var(--text)' }} onClick={() => startEdit(r)}>{r.domain}</button>
                  <span className="text-[12px] w-28 truncate" style={{ color: 'var(--text-muted)' }}>{r.access_profile?.name ?? '—'}</span>
                  <span className="text-[12px] w-24 truncate" style={{ color: 'var(--text-light)' }}>{r.classification ?? '—'}</span>
                  <button onClick={() => toggle(r)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: r.enabled ? 'var(--success-bg)' : 'var(--surface-sunken)', color: r.enabled ? 'var(--success-border)' : 'var(--text-muted)' }}>{r.enabled ? 'Sim' : 'Não'}</button>
                  <button title="Editar" onClick={() => startEdit(r)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button>
                  <button title="Excluir" onClick={() => del(r)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
                </div>
              ))}
            </div>
          ))}
          {noOrg.length > 0 && (
            <div className="ds-card p-0 overflow-hidden">
              <div className="px-3 py-2 text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Sem organização</div>
              {noOrg.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                  <button className="font-mono text-[12px] flex-1 text-left" style={{ color: 'var(--text)' }} onClick={() => startEdit(r)}>{r.domain}</button>
                  <button title="Excluir" onClick={() => del(r)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="ds-card overflow-hidden">
          <p className="px-3 py-2 text-[11px]" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>Clientes com contrato de sustentação + integração ligada, ainda sem domínio. Clique para vincular.</p>
          {naoF.length === 0 && <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Todos os clientes elegíveis já têm domínio.</div>}
          {naoF.map(c => (
            <button key={c.id} onClick={() => linkClient(c.id)} className="w-full flex items-center justify-between px-3 py-2.5 border-t ds-row-hover text-left" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</span>
              <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={12} /> vincular domínio</span>
            </button>
          ))}
        </div>
      )}

      {/* Modal de vincular/editar domínio */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={closeForm}>
          <div className="ds-card p-4 w-full max-w-md space-y-3" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
            <div className="font-semibold" style={{ color: 'var(--text)' }}>{editing ? 'Editar domínio' : 'Vincular domínio'}</div>
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Domínio</label>
              <div className="flex items-center">
                <span className="text-[11px] px-2 py-1.5 rounded-l-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)', border: '1px solid var(--border)', borderRight: 'none' }}>todos-os-e-mails-de@</span>
                <input ref={domainRef} className={`${fieldCls} flex-1 rounded-l-none`} style={inputStyle} placeholder="agroamazonia.com.br" value={domain} onChange={e => setDomain(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
              </div>
            </div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Organização (cliente)</label>
              <SearchSelect value={customerId} onChange={setCustomerId} options={[{ id: '', name: '—' }, ...customers]} placeholder="Buscar cliente…" fullWidth /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Perfil de acesso</label>
              <SearchSelect value={profileId} onChange={setProfileId} options={[{ id: '', name: '—' }, ...profiles]} placeholder="Perfil…" fullWidth /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Classificação</label><input className={`${fieldCls} w-full`} style={inputStyle} value={classification} onChange={e => setClassification(e.target.value)} /></div>
            <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Habilitado</label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={closeForm}>Cancelar</button>
              <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={save}><Save size={15} /> Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
