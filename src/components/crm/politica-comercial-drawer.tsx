'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X, ShieldCheck, RotateCcw, ChevronDown } from 'lucide-react'

interface Cap { key: string; label: string; control: 'scope' | 'toggle'; options?: string[]; danger?: boolean; sensitive?: boolean; help?: string }
interface Block { id: string; label: string; caps: Cap[] }
interface Role { id: number; name: string; is_system: boolean; people: number }
interface UserPolicy {
  user: { id: number; name: string; type: string; is_admin: boolean }
  role_id: number | null
  overrides: Record<string, unknown>
  effective: Record<string, unknown>
}

const SCOPE_LABEL: Record<string, string> = { all: 'Todos', team: 'Equipe', own: 'Próprios', assigned: 'Atribuídos', none: 'Nenhum' }
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export function PoliticaComercialDrawer({ userId, userName, onClose }: { userId: number; userName: string; onClose: () => void }) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [pol, setPol] = useState<UserPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    return api.get<{ data: UserPolicy }>(`/policies/crm/users/${userId}`).then(r => setPol(r?.data ?? null)).catch(() => toast.error('Erro ao carregar política'))
  }, [userId])

  useEffect(() => {
    Promise.all([
      api.get<{ data: { blocks: Block[] } }>('/policies/crm/catalog').then(r => { setBlocks(r?.data?.blocks ?? []); setOpen(new Set((r?.data?.blocks ?? []).slice(0, 2).map(b => b.id))) }).catch(() => {}),
      api.get<{ data: Role[] }>('/policies/crm/roles').then(r => setRoles(r?.data ?? [])).catch(() => {}),
      load(),
    ]).finally(() => setLoading(false))
  }, [load])

  const isAdmin = pol?.user.is_admin
  const ov = pol?.overrides ?? {}
  const eff = pol?.effective ?? {}

  const setRole = async (roleId: string) => {
    setSaving(true)
    try { await api.put(`/policies/crm/users/${userId}/assignment`, { role_id: roleId ? Number(roleId) : null }); await load(); toast.success('Perfil aplicado') }
    catch { toast.error('Erro ao aplicar perfil') } finally { setSaving(false) }
  }
  const setCap = async (key: string, value: unknown) => {
    setSaving(true)
    try { await api.put(`/policies/crm/users/${userId}/overrides`, { overrides: { [key]: value } }); await load() }
    catch { toast.error('Erro ao salvar exceção') } finally { setSaving(false) }
  }
  const resetCap = (key: string) => setCap(key, null)
  const clearAll = async () => {
    const keys = Object.keys(ov)
    if (!keys.length) return
    setSaving(true)
    try { await api.put(`/policies/crm/users/${userId}/overrides`, { overrides: Object.fromEntries(keys.map(k => [k, null])) }); await load(); toast.success('Exceções removidas') }
    catch { toast.error('Erro') } finally { setSaving(false) }
  }

  const overrideCount = Object.keys(ov).length

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card h-full w-full max-w-lg rounded-none rounded-l-2xl overflow-y-auto p-0 animate-in slide-in-from-right duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-4 border-b flex items-center justify-between" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>Política Comercial</h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-light)' }}>{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-hover)]"><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
            <>
              {/* Perfil */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Perfil comercial</label>
                <select value={pol?.role_id ?? ''} onChange={e => setRole(e.target.value)} disabled={saving || isAdmin} className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60" style={inputStyle}>
                  <option value="">— Sem perfil (usa padrões seguros)</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>
                  {overrideCount > 0 ? <>Herda do perfil · <b style={{ color: 'var(--warning-border)' }}>{overrideCount} exceção(ões)</b> · <button onClick={clearAll} className="underline" style={{ color: 'var(--primary)' }}>limpar</button></> : 'Herda todos os padrões do perfil'}
                </p>
              </div>

              {isAdmin && (
                <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--success-bg)', color: 'var(--success-border)', border: '1px solid var(--success-border)' }}>
                  <b>Administrador</b> — acesso total (bypass). As opções abaixo não se aplicam a este usuário.
                </div>
              )}

              {/* Blocos */}
              {blocks.map(b => {
                const isOpen = open.has(b.id)
                const persist = b.caps.filter(c => c.key in ov).length
                return (
                  <div key={b.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <button onClick={() => setOpen(s => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n })}
                      className="w-full flex items-center justify-between px-3.5 py-2.5" style={{ background: 'var(--surface-sunken)' }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{b.label}</span>
                      <span className="flex items-center gap-2">
                        {persist > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>{persist} personaliz.</span> : <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>herdado</span>}
                        <ChevronDown size={14} style={{ color: 'var(--text-light)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-3.5 space-y-3" style={{ opacity: isAdmin ? 0.55 : 1, pointerEvents: isAdmin ? 'none' : 'auto' }}>
                        {b.caps.map(c => {
                          const val = eff[c.key]
                          const overridden = c.key in ov
                          return (
                            <div key={c.key}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                                  {c.label}
                                  {c.danger && <span title="Ação destrutiva">⚠</span>}
                                  {c.sensitive && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>sensível</span>}
                                </span>
                                {overridden && <button onClick={() => resetCap(c.key)} title="Voltar ao padrão do perfil" className="text-[10px] flex items-center gap-1" style={{ color: 'var(--primary)' }}><RotateCcw size={11} /> reset</button>}
                              </div>
                              {c.control === 'scope' ? (
                                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                  {(c.options ?? ['all', 'team', 'own', 'none']).map(o => {
                                    const active = val === o
                                    return <button key={o} disabled={saving} onClick={() => setCap(c.key, o)}
                                      className="flex-1 text-[11px] font-semibold py-1.5 transition-colors disabled:opacity-60"
                                      style={active ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', color: 'var(--text-muted)' }}>{SCOPE_LABEL[o] ?? o}</button>
                                  })}
                                </div>
                              ) : (
                                <div className="flex rounded-lg overflow-hidden w-40" style={{ border: '1px solid var(--border)' }}>
                                  {[['off', false, 'Não'], ['on', true, 'Sim']].map(([id, v, lbl]) => {
                                    const active = !!val === (v as boolean)
                                    return <button key={id as string} disabled={saving} onClick={() => setCap(c.key, v)}
                                      className="flex-1 text-[11px] font-semibold py-1.5 transition-colors disabled:opacity-60"
                                      style={active ? (v ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }) : { background: 'var(--surface)', color: 'var(--text-light)' }}>{lbl as string}</button>
                                  })}
                                </div>
                              )}
                              {c.help && <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>{c.help}</p>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>As mudanças salvam automaticamente. Nesta fase a política é <b>informativa</b> — a aplicação (bloqueios) entra no próximo incremento.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
