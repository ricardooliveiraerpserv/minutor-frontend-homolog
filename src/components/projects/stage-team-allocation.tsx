'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useStageAllocations } from '@/hooks/use-stage-allocations'
import { useUserCapacityIndex } from '@/hooks/use-user-capacity'
import type { AllocationHealth, StageAllocationItem } from '@/lib/types/stage-allocation'

interface Props {
  stageId: number
  projectId: number
  canEdit?: boolean
}

interface ConsultantOption {
  id: number
  name: string
  email?: string
}

const HEALTH_COLOR: Record<AllocationHealth, string> = {
  ok: 'var(--success)',
  atencao: 'var(--warning)',
  estourado: 'var(--danger)',
  unknown: 'var(--border)',
}
const HEALTH_LABEL: Record<AllocationHealth, string> = {
  ok: 'Saudável',
  atencao: 'Atenção',
  estourado: 'Estourado',
  unknown: '—',
}

function formatHours(n: number): string {
  const v = Number(n) || 0
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

function HealthDot({ level }: { level: AllocationHealth }) {
  return (
    <span
      title={HEALTH_LABEL[level]}
      style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: HEALTH_COLOR[level], flexShrink: 0,
      }}
    />
  )
}

export function StageTeamAllocation({ stageId, projectId, canEdit = true }: Props) {
  const { items, totals, loading, error, refetch } = useStageAllocations(stageId)
  const { byUserId: capacityByUserId } = useUserCapacityIndex()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [editHours, setEditHours] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando equipe…</div>
  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>

  async function handleSave(id: number) {
    const n = Number(editHours)
    if (!Number.isFinite(n) || n < 0.5) { toast.error('Mínimo 0,5h'); return }
    setSaving(true)
    try {
      await api.patch(`/allocations/${id}`, { planned_hours: n })
      setEditing(null); setEditHours(''); refetch()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleDelete(a: StageAllocationItem) {
    const hasActual = (a.actual_hours ?? 0) > 0
    const msg = hasActual
      ? `${a.user?.name ?? 'Consultor'} possui ${formatHours(a.actual_hours)} apontadas nesta etapa.\n\nExcluir a alocação:\n- NÃO removerá os apontamentos (histórico preservado).\n- removerá apenas o planejamento operacional.\n\nDeseja continuar?`
      : `Remover alocação de ${a.user?.name ?? 'Consultor'}?`
    if (!confirm(msg)) return
    try {
      await api.delete(`/allocations/${a.id}`)
      refetch(); toast.success('Alocação removida')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao remover')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <Users size={11} /> Equipe Alocada
          <span style={{ opacity: .6 }}>· {items.length}</span>
          {totals.overrun_count > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 6px', fontSize: 10, fontWeight: 600, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 999 }}>
              {totals.overrun_count} estourado{totals.overrun_count > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {canEdit && !adding && (
          <button type="button" className="ds-btn-secondary" onClick={() => setAdding(true)}
            style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} /> Adicionar
          </button>
        )}
      </div>

      {(totals.planned_hours > 0 || totals.actual_hours > 0) && (
        <div style={{ padding: '10px 12px', marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', gap: 16, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>{formatHours(totals.planned_hours)}</strong> planejadas
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>{formatHours(totals.actual_hours)}</strong> consumidas
          </span>
          <span style={{ color: totals.remaining_hours < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            <strong style={{ color: totals.remaining_hours < 0 ? 'var(--danger)' : 'var(--text)' }}>
              {totals.remaining_hours < 0 ? 'Estourado' : formatHours(totals.remaining_hours)}
            </strong>
            {totals.remaining_hours >= 0 ? ' restantes' : ''}
          </span>
        </div>
      )}

      {adding && (
        <AddAllocationForm
          projectId={projectId}
          stageId={stageId}
          existing={items.map(i => i.user_id)}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refetch() }}
        />
      )}

      {items.length === 0 && !adding ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
          Sem consultores alocados. Clique em <strong>Adicionar</strong> pra começar.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(a => {
            const planned = Number(a.planned_hours) || 0
            const actual = Number(a.actual_hours) || 0
            const pct = planned > 0 ? Math.min(150, Math.round((actual / planned) * 100)) : 0
            const remaining = Number(a.remaining_hours) || 0
            const isEditing = editing === a.id

            return (
              <li key={a.id} className="ds-card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      <HealthDot level={a.health} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user?.name ?? '—'}</span>
                      {a.user_id && capacityByUserId[a.user_id]?.overload && (
                        <span
                          title={capacityByUserId[a.user_id].overload_reasons.join(' · ') || 'Sobrecarregado'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 600,
                            padding: '1px 6px', borderRadius: 4,
                            background: 'var(--danger-bg)', color: 'var(--danger)',
                            border: '1px solid var(--danger)',
                            textTransform: 'uppercase', letterSpacing: 0.3,
                            flexShrink: 0,
                          }}
                        >
                          Sobrecarregado
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: a.health === 'estourado' ? 'var(--danger)' : 'var(--text-muted)', marginTop: 4, fontWeight: a.health === 'estourado' ? 500 : 400 }}>
                      {a.health === 'estourado'
                        ? `Estourado · ${formatHours(actual)} / ${formatHours(planned)}`
                        : `${formatHours(actual)} / ${formatHours(planned)} · ${formatHours(remaining)} restantes`}
                    </div>
                  </div>
                  {canEdit && !isEditing && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button type="button" onClick={() => { setEditing(a.id); setEditHours(String(planned)) }} aria-label="Editar"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Pencil size={12} />
                      </button>
                      <button type="button" onClick={() => handleDelete(a)} aria-label="Remover"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, height: 4, width: '100%', background: 'var(--surface-hover)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: HEALTH_COLOR[a.health], transition: 'width .2s ease' }} />
                </div>
                {isEditing && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input type="number" min={0.5} step="0.5" autoFocus className="ds-input"
                      value={editHours} onChange={e => setEditHours(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(a.id); if (e.key === 'Escape') { setEditing(null); setEditHours('') } }}
                      style={{ width: 80, fontSize: 13, padding: '4px 8px' }}
                    />
                    <button type="button" className="ds-btn-primary" disabled={saving} onClick={() => handleSave(a.id)}
                      style={{ fontSize: 12, padding: '4px 10px' }}>Salvar</button>
                    <button type="button" className="ds-btn-ghost" onClick={() => { setEditing(null); setEditHours('') }}
                      style={{ fontSize: 12, padding: '4px 10px' }}>Cancelar</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

interface AddProps {
  projectId: number
  stageId: number
  existing: number[]
  onClose: () => void
  onAdded: () => void
}

function AddAllocationForm({ projectId, stageId, existing, onClose, onAdded }: AddProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ConsultantOption[]>([])
  const [selected, setSelected] = useState<ConsultantOption | null>(null)
  const [hours, setHours] = useState('8')
  const [saving, setSaving] = useState(false)

  async function searchUsers(q: string) {
    if (!q.trim()) { setResults([]); return }
    try {
      const data = await api.get<{ items?: ConsultantOption[]; data?: ConsultantOption[] }>(
        `/users?minimal=true&search=${encodeURIComponent(q)}&pageSize=10`
      )
      const items = (data.items ?? data.data ?? []).filter(u => !existing.includes(u.id))
      setResults(items)
    } catch { setResults([]) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) { toast.error('Escolha um consultor'); return }
    const n = Number(hours)
    if (!Number.isFinite(n) || n < 0.5) { toast.error('Mínimo 0,5h'); return }
    setSaving(true)
    try {
      await api.post(`/stages/${stageId}/allocations`, { user_id: selected.id, planned_hours: n })
      toast.success('Consultor alocado')
      onAdded()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao alocar')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="ds-card ds-card-pad" style={{ marginBottom: 12, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Consultor</label>
          {selected ? (
            <div style={{ marginTop: 4, padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{selected.name}</span>
              <button type="button" onClick={() => { setSelected(null); setSearch(''); setResults([]) }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>×</button>
            </div>
          ) : (
            <>
              <input autoFocus className="ds-input" value={search}
                onChange={e => { setSearch(e.target.value); searchUsers(e.target.value) }}
                placeholder="Buscar por nome ou email…"
                style={{ width: '100%', marginTop: 4 }}
              />
              {results.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {results.map(u => (
                    <li key={u.id} onClick={() => { setSelected(u); setSearch(''); setResults([]) }}
                      style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      {u.name}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div style={{ width: 100 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Horas previstas</label>
          <input type="number" min={0.5} step="0.5" className="ds-input" value={hours} onChange={e => setHours(e.target.value)}
            style={{ width: '100%', marginTop: 4 }} />
        </div>
        <button type="submit" className="ds-btn-primary" disabled={saving || !selected}
          style={{ fontSize: 13, padding: '6px 14px' }}>
          {saving ? 'Salvando…' : 'Alocar'}
        </button>
        <button type="button" className="ds-btn-ghost" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px' }}>Cancelar</button>
      </div>
    </form>
  )
}
