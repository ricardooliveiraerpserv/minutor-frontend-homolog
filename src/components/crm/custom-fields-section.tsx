'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SlidersHorizontal, Check } from 'lucide-react'

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
 * Carrega as definições + valores da entidade. A DEFINIÇÃO do campo (rótulo, tipo, obrigatório) é feita
 * só na tela Campos Personalizados; aqui a rotina apenas preenche os VALORES do registro.
 * Os valores salvam sozinhos junto com o registro — ao sair do campo (blur) ou ao alternar select/checkbox —,
 * sem botão "Salvar" separado. Não renderiza nada se o contexto não tiver campos definidos.
 *  - urlContext: 'customers' (empresas/leads) | 'opportunities' | 'contacts'
 *  - entityId: id da entidade (empresa/oportunidade/contato)
 */
export function CustomFieldsSection({ urlContext, entityId, title = 'Campos personalizados' }: {
  urlContext: string; entityId: number; title?: string
}) {
  const [items, setItems] = useState<Item[]>([])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saved = useRef<Record<string, string>>({}) // último mapa persistido — evita salvar sem mudança
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        saved.current = { ...m }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [urlContext, entityId])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  // Persiste o mapa completo de valores (endpoint faz upsert). Auto-save: sem toast de sucesso, só status.
  const persist = useCallback(async (next: Record<string, string>) => {
    setStatus('saving')
    try {
      await api.post(`/${urlContext}/${entityId}/custom-field-values`, { values: next })
      saved.current = { ...next }
      setStatus('saved')
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setStatus('idle'), 1600)
    } catch (e: any) {
      setStatus('idle')
      toast.error(e?.message ?? 'Erro ao salvar campos')
    }
  }, [urlContext, entityId])

  // text/number/date: edita em memória e salva ao sair do campo (só se mudou).
  const onEdit = (k: string, v: string) => setVals(m => ({ ...m, [k]: v }))
  const onBlurSave = (k: string) => { if ((vals[k] ?? '') !== (saved.current[k] ?? '')) persist(vals) }
  // select/checkbox: aplica e salva na hora (interação já é a decisão final).
  const onPick = (k: string, v: string) => { const next = { ...vals, [k]: v }; setVals(next); persist(next) }

  if (loading || items.length === 0) return null

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <SlidersHorizontal size={12} /> {title}
        </span>
        {status === 'saving' && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Salvando…</span>}
        {status === 'saved' && <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--success-border)' }}><Check size={12} /> Salvo</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ field: f }) => (
          <div key={f.id} className={f.type === 'boolean' ? 'col-span-2' : ''}>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}{f.required ? ' *' : ''}</label>
            {f.type === 'text' && <input value={vals[f.key] ?? ''} onChange={e => onEdit(f.key, e.target.value)} onBlur={() => onBlurSave(f.key)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />}
            {f.type === 'number' && <input type="number" value={vals[f.key] ?? ''} onChange={e => onEdit(f.key, e.target.value)} onBlur={() => onBlurSave(f.key)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />}
            {f.type === 'date' && <input type="date" value={vals[f.key] ?? ''} onChange={e => onEdit(f.key, e.target.value)} onBlur={() => onBlurSave(f.key)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />}
            {f.type === 'select' && (
              <select value={vals[f.key] ?? ''} onChange={e => onPick(f.key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.type === 'boolean' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={vals[f.key] === '1' || vals[f.key] === 'true'} onChange={e => onPick(f.key, e.target.checked ? '1' : '0')} style={{ accentColor: 'var(--primary)' }} />
                Sim
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
