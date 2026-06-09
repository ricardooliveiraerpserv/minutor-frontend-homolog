'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { SearchSelect } from '@/components/ui/search-select'
import { toast } from 'sonner'
import { useActivityAllocations } from '@/hooks/use-activity-allocations'
import { useUserCapacityIndex } from '@/hooks/use-user-capacity'
import type { AllocationHealth, StageAllocationItem } from '@/lib/types/stage-allocation'

interface Props {
  deliveryId: number
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

export function ActivityTeamAllocation({ deliveryId, canEdit = true }: Props) {
  const { items, totals, loading, error, refetch } = useActivityAllocations(deliveryId)
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
      ? `${a.user?.name ?? 'Consultor'} possui ${formatHours(a.actual_hours)} apontadas nesta atividade.\n\nExcluir a alocação:\n- NÃO removerá os apontamentos (histórico preservado).\n- removerá apenas o planejamento operacional.\n\nDeseja continuar?`
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
          <Users size={11} /> Equipe alocada
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
        <div style={{ padding: '8px 10px', marginBottom: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
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
        <AddActivityAllocationForm
          deliveryId={deliveryId}
          existing={items.map(i => i.user_id)}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refetch() }}
        />
      )}

      {items.length === 0 && !adding ? (
        <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 6 }}>
          Sem consultores alocados. Clique em <strong>Adicionar</strong> pra começar.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(a => {
            const planned = Number(a.planned_hours) || 0
            const actual = Number(a.actual_hours) || 0
            const pct = planned > 0 ? Math.min(150, Math.round((actual / planned) * 100)) : 0
            const remaining = Number(a.remaining_hours) || 0
            const isEditing = editing === a.id

            return (
              <li key={a.id} className="ds-card" style={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      <HealthDot level={a.health} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user?.name ?? '—'}</span>
                      {a.is_primary && (
                        <span
                          title="Owner principal da atividade"
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            fontSize: 9, fontWeight: 600,
                            padding: '1px 6px', borderRadius: 4,
                            background: 'var(--primary-soft)', color: 'var(--primary)',
                            textTransform: 'uppercase', letterSpacing: 0.3,
                            flexShrink: 0,
                          }}
                        >
                          Principal
                        </span>
                      )}
                      {(a.allocation_start_at || a.allocation_end_at) && (
                        <span
                          title="Janela parcial de alocação"
                          style={{
                            fontSize: 10, color: 'var(--text-muted)',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}
                        >
                          {fmtDate(a.allocation_start_at)} → {fmtDate(a.allocation_end_at)}
                        </span>
                      )}
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
                    <div style={{ fontSize: 11, color: a.health === 'estourado' ? 'var(--danger)' : 'var(--text-muted)', marginTop: 3, fontWeight: a.health === 'estourado' ? 500 : 400 }}>
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
                <div style={{ marginTop: 6, height: 3, width: '100%', background: 'var(--surface-hover)', borderRadius: 2, overflow: 'hidden' }}>
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
  deliveryId: number
  existing: number[]
  onClose: () => void
  onAdded: () => void
}

function AddActivityAllocationForm({ deliveryId, existing, onClose, onAdded }: AddProps) {
  const [opts, setOpts] = useState<{ id: number; name: string }[]>([])
  const [userId, setUserId] = useState('')
  const [hours, setHours] = useState('8')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [saving, setSaving] = useState(false)

  // Mesmo cadastro do cronograma: consultores + coordenadores + executivos + clientes, com busca.
  useEffect(() => {
    const pick = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
    Promise.all([
      api.get<any>('/users?type=consultor,coordenador&minimal=true&pageSize=500').catch(() => null),
      api.get<any>('/executives?pageSize=200').catch(() => null),
      api.get<any>('/users?type=cliente&minimal=true&pageSize=500').catch(() => null),
    ]).then(([u, e, c]) => {
      const byId = new Map<number, { id: number; name: string }>()
      for (const x of [...pick(u), ...pick(e)]) if (x?.id && x?.name && !byId.has(x.id)) byId.set(x.id, { id: x.id, name: x.name })
      const users = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
      const clientes = pick(c).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: `${x.name} (cliente)` })).sort((a: any, b: any) => a.name.localeCompare(b.name))
      setOpts([...users, ...clientes].filter(o => !existing.includes(o.id)))
    })
  }, [existing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { toast.error('Escolha um usuário ou cliente'); return }
    const n = Number(hours)
    if (!Number.isFinite(n) || n < 0.5) { toast.error('Mínimo 0,5h'); return }
    setSaving(true)
    try {
      await api.post(`/activities/${deliveryId}/allocations`, {
        user_id: Number(userId),
        planned_hours: n,
        allocation_start_at: start || null,
        allocation_end_at: end || null,
        is_primary: isPrimary,
      })
      toast.success('Alocado')
      onAdded()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao alocar')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="ds-card ds-card-pad" style={{ marginBottom: 10, padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Usuário ou cliente</label>
          <SearchSelect value={userId} onChange={setUserId} options={opts} placeholder="Buscar por nome…" fullWidth />
        </div>
        <div style={{ width: 80 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Horas</label>
          <input type="number" min={0.5} step="0.5" className="ds-input" value={hours} onChange={e => setHours(e.target.value)}
            style={{ width: '100%', marginTop: 4, fontSize: 12 }} />
        </div>
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Início (opcional)</label>
          <input type="date" className="ds-input" value={start} onChange={e => setStart(e.target.value)}
            style={{ width: '100%', marginTop: 4, fontSize: 12 }} />
        </div>
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fim (opcional)</label>
          <input type="date" className="ds-input" value={end} onChange={e => setEnd(e.target.value)}
            style={{ width: '100%', marginTop: 4, fontSize: 12 }} />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
          Principal
        </label>
        <button type="submit" className="ds-btn-primary" disabled={saving || !userId}
          style={{ fontSize: 12, padding: '6px 12px' }}>
          {saving ? 'Salvando…' : 'Alocar'}
        </button>
        <button type="button" className="ds-btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '6px 12px' }}>Cancelar</button>
      </div>
    </form>
  )
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '?'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}`
}
