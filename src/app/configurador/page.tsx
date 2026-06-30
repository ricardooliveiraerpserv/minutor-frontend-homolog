'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { NAV_CATALOG } from '@/lib/nav-catalog'
import { useNavConfig, type NavModuleConfig } from '@/contexts/nav-config-context'
import { SlidersHorizontal, Plus, Trash2, ChevronUp, ChevronDown, Save, GripVertical } from 'lucide-react'

export default function ConfiguradorPage() {
  return (
    <AppLayout title="Configurador">
      <ConfiguradorInner />
    </AppLayout>
  )
}

function ConfiguradorInner() {
  const { modules: serverModules, reload } = useNavConfig()
  const [mods, setMods] = useState<NavModuleConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setMods(serverModules.map(m => ({ ...m, items: [...(m.items ?? [])] }))) }, [serverModules])

  // Qual módulo contém cada item (item pertence a no máx. 1 módulo).
  const itemModule = useMemo(() => {
    const map: Record<string, number> = {}
    mods.forEach(m => (m.items ?? []).forEach(k => { map[k] = m.id }))
    return map
  }, [mods])

  const assign = (itemKey: string, moduleId: number | null) => {
    setMods(prev => prev.map(m => {
      const has = (m.items ?? []).includes(itemKey)
      if (m.id === moduleId) return has ? m : { ...m, items: [...(m.items ?? []), itemKey] }
      return has ? { ...m, items: (m.items ?? []).filter(k => k !== itemKey) } : m
    }))
    setDirty(true)
  }

  const patchMod = (id: number, p: Partial<NavModuleConfig>) => { setMods(prev => prev.map(m => m.id === id ? { ...m, ...p } : m)); setDirty(true) }

  const moveMod = (id: number, dir: -1 | 1) => {
    setMods(prev => {
      const i = prev.findIndex(m => m.id === id); const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev];[next[i], next[j]] = [next[j], next[i]]
      return next.map((m, idx) => ({ ...m, sort_order: idx + 1 }))
    })
    setDirty(true)
  }

  const addModule = async () => {
    const label = window.prompt('Nome do novo módulo:')?.trim()
    if (!label) return
    try { await api.post('/nav-modules', { label }); toast.success('Módulo criado'); reload() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  const removeModule = async (m: NavModuleConfig) => {
    if (m.is_system) { toast.error('Módulo de sistema não pode ser excluído.'); return }
    if (!confirm(`Excluir o módulo "${m.label}"?`)) return
    try { await api.delete(`/nav-modules/${m.id}`); toast.success('Excluído'); reload() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      await Promise.all(mods.map(m => api.put(`/nav-modules/${m.id}`, {
        label: m.label, icon: m.icon, active: m.active, sort_order: m.sort_order, items: m.items ?? [],
      })))
      toast.success('Configuração salva ✓'); setDirty(false); reload()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <SlidersHorizontal size={18} style={{ color: 'var(--primary)', marginTop: 2 }} />
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Configurador de Menus</h1>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Crie módulos e defina quais telas aparecem em cada um. Camada de navegação (não muda permissões).</p>
          </div>
        </div>
        <button onClick={saveAll} disabled={saving || !dirty} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg shrink-0">
          <Save size={15} /> {saving ? 'Salvando…' : 'Salvar tudo'}
        </button>
      </div>

      {/* ── MÓDULOS ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Módulos</h2>
          <button onClick={addModule} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"><Plus size={13} /> Novo módulo</button>
        </div>
        {mods.map((m, i) => (
          <div key={m.id} className="ds-card p-3 flex items-center gap-3" style={{ borderLeft: `3px solid ${m.active ? 'var(--primary)' : 'var(--border)'}` }}>
            <div className="flex flex-col">
              <button onClick={() => moveMod(m.id, -1)} disabled={i === 0} className="disabled:opacity-30"><ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /></button>
              <button onClick={() => moveMod(m.id, 1)} disabled={i === mods.length - 1} className="disabled:opacity-30"><ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <input value={m.label} onChange={e => patchMod(m.id, { label: e.target.value })} className="ds-input flex-1 text-sm px-2.5 py-1.5" />
            <input value={m.icon} onChange={e => patchMod(m.id, { icon: e.target.value })} title="Ícone (nome lucide)" className="ds-input w-36 text-xs px-2 py-1.5" placeholder="ícone (lucide)" />
            <label className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={m.active} onChange={e => patchMod(m.id, { active: e.target.checked })} disabled={m.is_system} /> ativo
            </label>
            {m.is_system
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>sistema</span>
              : <button onClick={() => removeModule(m)} title="Excluir"><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>}
          </div>
        ))}
      </section>

      {/* ── ITENS DE MENU → MÓDULO ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Itens de menu</h2>
        <p className="text-[12px]" style={{ color: 'var(--text-light)' }}>Cada tela aparece no módulo escolhido (na ordem em que for atribuída). &quot;— nenhum —&quot; esconde do menu.</p>
        <div className="ds-card divide-y" style={{ borderColor: 'var(--border)' }}>
          {NAV_CATALOG.map((item, idx) => {
            const showHeader = idx === 0 || NAV_CATALOG[idx - 1].group !== item.group
            return (
              <div key={item.key}>
                {showHeader && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{item.group}</div>
                )}
                <div className="flex items-center gap-3 px-3 py-2">
                  <GripVertical size={14} style={{ color: 'var(--text-light)' }} />
                  <span className="flex-1 text-[14px]" style={{ color: 'var(--text)' }}>{item.label}</span>
                  <select
                    value={itemModule[item.key] ?? ''}
                    onChange={e => assign(item.key, e.target.value ? Number(e.target.value) : null)}
                    className="ds-input text-[13px] px-2 py-1.5 min-w-[170px]">
                    <option value="">— nenhum —</option>
                    {mods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
