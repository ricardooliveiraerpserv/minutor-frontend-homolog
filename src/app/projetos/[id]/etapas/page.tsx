'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { StageCard } from '@/components/projects/stage-card'
import { useProjectStages } from '@/hooks/use-project-stages'
import type { ProjectStage } from '@/lib/types/project-stage'

export default function EtapasPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const { stages, loading, error, refetch } = useProjectStages(projectId)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.post<ProjectStage>(`/projects/${projectId}/stages`, {
        name: name.trim(),
        hours_planned: hours ? Number(hours) : 0,
      })
      setName('')
      setHours('')
      setCreating(false)
      refetch()
      toast.success('Etapa criada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar etapa')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Carregando etapas…</div>
  }

  if (error) {
    return <div style={{ color: 'var(--danger)' }}>{error}</div>
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Etapas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {stages.length}</span>
        </h2>
        {!creating && (
          <button
            type="button"
            className="ds-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px' }}
            onClick={() => setCreating(true)}
          >
            <Plus size={14} /> Nova etapa
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="ds-card ds-card-pad"
          style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div style={{ flex: '1 1 240px' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Nome
            </label>
            <input
              autoFocus
              className="ds-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Fiscal, Compras, Integrações…"
              maxLength={100}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
          <div style={{ width: 120 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Horas previstas
            </label>
            <input
              className="ds-input"
              type="number"
              min={0}
              step="0.5"
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="0"
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
          <button
            type="submit"
            className="ds-btn-primary"
            style={{ fontSize: 13, padding: '8px 14px' }}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Salvando…' : 'Criar'}
          </button>
          <button
            type="button"
            className="ds-btn-ghost"
            style={{ fontSize: 13, padding: '8px 14px' }}
            onClick={() => { setCreating(false); setName(''); setHours('') }}
          >
            Cancelar
          </button>
        </form>
      )}

      {stages.length === 0 ? (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
            Nenhuma etapa ainda
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            Crie a primeira frente do projeto (ex: Fiscal, Compras, Integrações).
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {stages.map(stage => (
            <StageCard key={stage.id} stage={stage} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  )
}
