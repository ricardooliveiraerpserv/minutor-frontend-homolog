'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { UserPlus, X, Eye } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { SearchSelect } from '@/components/ui/search-select'

/**
 * Clientes com VISÃO GLOBAL do projeto (nível projeto). Coordenador/admin
 * adiciona/remove. O cliente vinculado enxerga o projeto inteiro em dias,
 * mantendo as restrições de card (abre só os seus; conversa/anexos só se responsável).
 */
interface Viewer { id: number; name: string; email?: string | null }

export function ClientViewersManager({ projectId }: { projectId: number }) {
  const { user } = useAuth()
  const canManage = user?.type === 'admin' || user?.type === 'coordenador'
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [clientOpts, setClientOpts] = useState<{ id: number; name: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await api.get<{ items: Viewer[] }>(`/projects/${projectId}/client-viewers`)
      setViewers(r.items ?? [])
    } catch { /* */ }
  }
  useEffect(() => { load() }, [projectId])

  // Só clientes do MESMO customer do projeto (BE filtra por customer_id).
  useEffect(() => {
    if (!canManage) return
    api.get<{ items: { id: number; name: string }[] }>(`/projects/${projectId}/client-viewers/available`)
      .then(r => setClientOpts((r.items ?? []).map(x => ({ id: x.id, name: x.name }))))
      .catch(() => {})
  }, [canManage, projectId, viewers.length])

  async function add(uid: string) {
    if (!uid) return
    setBusy(true)
    try {
      const r = await api.post<{ item: Viewer }>(`/projects/${projectId}/client-viewers`, { user_id: Number(uid) })
      setViewers(v => v.some(x => x.id === r.item.id) ? v : [...v, r.item].sort((a, b) => a.name.localeCompare(b.name)))
      setPick(''); setAdding(false)
      toast.success('Cliente vinculado ao projeto')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao vincular')
    } finally { setBusy(false) }
  }

  async function remove(uid: number) {
    if (!confirm('Remover a visão global deste cliente?')) return
    try {
      await api.delete(`/projects/${projectId}/client-viewers/${uid}`)
      setViewers(v => v.filter(x => x.id !== uid))
      toast.success('Vínculo removido')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao remover')
    }
  }

  const available = clientOpts.filter(c => !viewers.some(v => v.id === c.id))

  return (
    <div className="ds-card ds-card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        <Eye size={12} /> Clientes com visão do projeto
      </div>

      {viewers.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Nenhum cliente com visão global. {canManage && 'Adicione um cliente para ele acompanhar o projeto (em dias).'}
        </div>
      )}

      {viewers.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {viewers.map(v => (
            <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              <span style={{ flex: 1 }}>{v.name}{v.email ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {v.email}</span> : null}</span>
              {canManage && (
                <button onClick={() => remove(v.id)} title="Remover" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div style={{ marginTop: 10 }}>
          {adding ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, maxWidth: 320 }}>
                <SearchSelect value={pick} onChange={v => { setPick(v); add(v) }} options={available} placeholder="Buscar cliente…" fullWidth />
              </div>
              <button onClick={() => { setAdding(false); setPick('') }} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} disabled={busy} className="ds-btn-ghost"
              style={{ fontSize: 12, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}>
              <UserPlus size={13} /> Adicionar cliente
            </button>
          )}
        </div>
      )}
    </div>
  )
}
