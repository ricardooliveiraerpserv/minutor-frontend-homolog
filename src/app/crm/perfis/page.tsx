'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ShieldCheck, Table2, SlidersHorizontal, Users } from 'lucide-react'

interface Cap { key: string; label: string; control: 'scope' | 'toggle'; options?: string[]; danger?: boolean; sensitive?: boolean; help?: string }
interface Block { id: string; label: string; caps: Cap[] }
interface Role { id: number; name: string; is_system: boolean; people: number; defaults: Record<string, unknown> }

const SCOPE_LABEL: Record<string, string> = { all: 'Todos', team: 'Equipe', own: 'Próprios', assigned: 'Atribuídos', none: 'Nenhum' }
const scopePill = (v: unknown): { l: string; c: string; b: string } => {
  const s = String(v ?? 'none')
  if (s === 'all') return { l: 'Todos', c: '#17914e', b: 'rgba(34,197,94,.15)' }
  if (s === 'team') return { l: 'Equipe', c: 'var(--warning-border)', b: 'var(--warning-bg)' }
  if (s === 'assigned') return { l: 'Atribuídos', c: 'var(--warning-border)', b: 'var(--warning-bg)' }
  if (s === 'own') return { l: 'Próprios', c: 'var(--info-border)', b: 'var(--info-bg)' }
  return { l: 'Nenhum', c: 'var(--danger-border)', b: 'var(--danger-bg)' }
}
const boolPill = (v: unknown) => v ? { l: 'Sim', c: '#17914e', b: 'rgba(34,197,94,.15)' } : { l: 'Não', c: 'var(--text-light)', b: 'var(--surface-sunken)' }

export default function PerfisComerciaisPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'editor' | 'matriz'>('editor')
  const [selId, setSelId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([
    api.get<{ data: { blocks: Block[] } }>('/policies/crm/catalog').then(r => setBlocks(r?.data?.blocks ?? [])).catch(() => {}),
    api.get<{ data: Role[] }>('/policies/crm/roles').then(r => { const rs = r?.data ?? []; setRoles(rs); if (rs[0] && selId === null) { setSelId(rs[0].id); setDraft({ ...(rs[0].defaults ?? {}) }) } }).catch(() => toast.error('Erro ao carregar')),
  ])
  useEffect(() => { load().finally(() => setLoading(false)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = roles.find(r => r.id === selId) ?? null
  const pickRole = (r: Role) => { setSelId(r.id); setDraft({ ...(r.defaults ?? {}) }) }
  const setCap = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }))
  const dirty = sel ? JSON.stringify(draft) !== JSON.stringify(sel.defaults ?? {}) : false
  const save = async () => {
    if (!sel) return
    setSaving(true)
    try {
      const r = await api.put<{ data: Role }>(`/policies/crm/roles/${sel.id}`, { defaults: draft })
      setRoles(rs => rs.map(x => x.id === sel.id ? { ...x, defaults: r.data.defaults ?? draft } : x))
      toast.success('Perfil atualizado')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const allCaps: Cap[] = blocks.flatMap(b => b.caps)

  return (
    <AppLayout title="Perfis Comerciais (CRM)">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Perfis Comerciais</h1>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {([['editor', 'Editor', SlidersHorizontal], ['matriz', 'Matriz', Table2]] as const).map(([v, l, Ic]) => (
            <button key={v} onClick={() => setView(v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
              style={view === v ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><Ic size={14} /> {l}</button>
          ))}
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Padrões de cada perfil comercial. Aplicados a quem recebe o perfil em Cadastros › Responsáveis; exceções por pessoa não alteram o perfil.</p>

      {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : view === 'editor' ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(200px, 260px) 1fr' }}>
          {/* Lista de perfis */}
          <div className="rounded-xl overflow-hidden self-start" style={{ border: '1px solid var(--border)' }}>
            {roles.map(r => (
              <button key={r.id} onClick={() => pickRole(r)} className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2"
                style={{ borderTop: '1px solid var(--border)', background: selId === r.id ? 'var(--primary-soft)' : 'transparent' }}>
                <span className="text-sm font-medium" style={{ color: selId === r.id ? 'var(--primary)' : 'var(--text)' }}>{r.name}</span>
                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Users size={11} /> {r.people}</span>
              </button>
            ))}
          </div>

          {/* Editor do perfil selecionado */}
          <div>
            {sel && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{sel.name}</h2>
                    <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{sel.is_system ? 'Perfil de sistema' : 'Perfil personalizado'} · {sel.people} pessoa(s)</p>
                  </div>
                  <button onClick={save} disabled={!dirty || saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : dirty ? 'Salvar' : 'Salvo'}</button>
                </div>
                <div className="space-y-4">
                  {blocks.map(b => (
                    <div key={b.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="px-3.5 py-2 text-xs font-bold uppercase tracking-wide" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{b.label}</div>
                      <div className="p-3.5 space-y-3">
                        {b.caps.map(c => (
                          <div key={c.key}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.label}</span>
                              {c.danger && <span title="Ação destrutiva">⚠</span>}
                              {c.sensitive && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>sensível</span>}
                            </div>
                            {c.control === 'scope' ? (
                              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                {(c.options ?? ['all', 'team', 'own', 'none']).map(o => {
                                  const active = draft[c.key] === o
                                  return <button key={o} onClick={() => setCap(c.key, o)} className="flex-1 text-[11px] font-semibold py-1.5"
                                    style={active ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', color: 'var(--text-muted)' }}>{SCOPE_LABEL[o] ?? o}</button>
                                })}
                              </div>
                            ) : (
                              <div className="flex rounded-lg overflow-hidden w-40" style={{ border: '1px solid var(--border)' }}>
                                {[[false, 'Não'], [true, 'Sim']].map(([v, lbl]) => {
                                  const active = !!draft[c.key] === (v as boolean)
                                  return <button key={String(v)} onClick={() => setCap(c.key, v)} className="flex-1 text-[11px] font-semibold py-1.5"
                                    style={active ? (v ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }) : { background: 'var(--surface)', color: 'var(--text-light)' }}>{lbl as string}</button>
                                })}
                              </div>
                            )}
                            {c.help && <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>{c.help}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Matriz comparativa */
        <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm whitespace-nowrap">
            <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
              <th className="text-left px-3 py-2.5 text-xs font-semibold sticky left-0" style={{ background: 'var(--surface-sunken)' }}>Recurso</th>
              {roles.map(r => <th key={r.id} className="px-3 py-2.5 text-xs font-semibold text-center">{r.name}</th>)}
            </tr></thead>
            <tbody>
              {allCaps.map(c => (
                <tr key={c.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-medium sticky left-0" style={{ color: 'var(--text)', background: 'var(--surface)' }}>{c.label}</td>
                  {roles.map(r => {
                    const v = r.defaults?.[c.key]
                    const p = c.control === 'toggle' ? boolPill(v) : scopePill(v)
                    return <td key={r.id} className="px-3 py-2 text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ color: p.c, background: p.b }}>{p.l}</span></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  )
}
