'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Server } from 'lucide-react'

/**
 * Seleção dos ambientes do cofre em que o projeto está sendo desenvolvido.
 * Gerenciado pelo card de Demandas e Projetos (admin/coordenador).
 */
interface EnvRow { id: number; name: string; type: string; is_support_base: boolean; selected: boolean }

export function ProjectEnvironmentsManager({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<EnvRow[]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ items: EnvRow[] }>(`/projects/${projectId}/environments`)
      .then(r => {
        const its = r.items ?? []
        setItems(its)
        setSel(new Set(its.filter(e => e.selected).map(e => e.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const toggle = (id: number) => setSel(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function save() {
    setSaving(true)
    try {
      await api.post(`/projects/${projectId}/environments`, { environment_ids: [...sel] })
      toast.success('Ambientes do projeto atualizados')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        <Server size={12} /> Ambiente(s) do cofre em desenvolvimento
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum ambiente cadastrado no cofre para este cliente.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {items.map(env => {
              const on = sel.has(env.id)
              return (
                <button key={env.id} type="button" onClick={() => toggle(env.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: on ? 'var(--primary)' : 'var(--border)', background: on ? 'var(--primary-soft)' : 'var(--surface-hover)', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {on ? '✓ ' : ''}{env.name} <span style={{ opacity: 0.6 }}>· {env.type}</span>{env.is_support_base ? ' 🛟' : ''}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={save} disabled={saving} className="ds-btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
              {saving ? 'Salvando…' : 'Salvar ambientes'}
            </button>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>🛟 = base usada pela sustentação. O vínculo aparece no cofre e avisa a sustentação nos chamados.</p>
        </>
      )}
    </div>
  )
}
