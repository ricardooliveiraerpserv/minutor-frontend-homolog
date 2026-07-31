'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SlidersHorizontal } from 'lucide-react'

interface FieldDef {
  id: number
  label: string
  key: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'select'
  required: boolean
  options: string[] | null
}
interface Item { field: FieldDef; value: string | null }

/**
 * Seção reutilizável de CAMPOS PERSONALIZADOS (definidos em Configurações CRM → Campos Personalizados).
 * Carrega as definições + valores da entidade e salva os valores. Não renderiza nada se o contexto
 * não tiver campos definidos.
 *  - urlContext: 'customers' (empresas/leads) | 'opportunities' | 'contacts'
 *  - entityId: id da entidade (empresa/oportunidade/contato)
 */
export function CustomFieldsSection({ urlContext, entityId, title = 'Campos personalizados' }: {
  urlContext: string; entityId: number; title?: string
}) {
  const [items, setItems] = useState<Item[]>([])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!entityId) { setItems([]); setLoading(false); return }
    setLoading(true)
    api.get<{ items: Item[] }>(`/${urlContext}/${entityId}/custom-field-values`)
      .then(r => {
        const its = r?.items ?? []
        setItems(its)
        const m: Record<string, string> = {}
        its.forEach(it => { m[it.field.key] = it.value ?? '' })
        setVals(m)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [urlContext, entityId])
  useEffect(() => { load() }, [load])

  const set = (k: string, v: string) => setVals(m => ({ ...m, [k]: v }))

  const save = async () => {
    const missing = items.filter(it => it.field.required && !String(vals[it.field.key] ?? '').trim())
    if (missing.length) { toast.error(`Preencha: ${missing.map(m => m.field.label).join(', ')}`); return }
    setSaving(true)
    try {
      await api.post(`/${urlContext}/${entityId}/custom-field-values`, { values: vals })
      toast.success('Campos personalizados salvos')
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar campos') } finally { setSaving(false) }
  }

  if (loading || items.length === 0) return null

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <SlidersHorizontal size={12} /> {title}
        </span>
        <button onClick={save} disabled={saving} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          {saving ? 'Salvando…' : 'Salvar campos'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ field: f }) => (
          <div key={f.id} className={f.type === 'boolean' ? 'col-span-2' : ''}>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}{f.required ? ' *' : ''}</label>
            {f.type === 'text' && <input value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />}
            {f.type === 'number' && <input type="number" value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />}
            {f.type === 'date' && <input type="date" value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />}
            {f.type === 'select' && (
              <select value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.type === 'boolean' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={vals[f.key] === '1' || vals[f.key] === 'true'} onChange={e => set(f.key, e.target.checked ? '1' : '0')} style={{ accentColor: 'var(--primary)' }} />
                Sim
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
