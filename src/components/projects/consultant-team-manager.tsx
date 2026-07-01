'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { UserPlus, X, Users } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { SearchSelect } from '@/components/ui/search-select'

/**
 * Consultores do projeto (definidos na Visão Geral). As atividades do cronograma
 * e os acompanhamentos só oferecem esses consultores nos seletores de Responsável/
 * alocação. Coordenador/admin gerencia.
 */
interface Member { id: number; name: string; email?: string | null }

export function ConsultantTeamManager({ projectId }: { projectId: number }) {
  const { user } = useAuth()
  const canManage = user?.type === 'admin' || user?.type === 'coordenador'
  const [members, setMembers] = useState<Member[]>([])
  const [opts, setOpts] = useState<{ id: number; name: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await api.get<{ items: Member[] }>(`/projects/${projectId}/consultants`)
      setMembers(r.items ?? [])
    } catch { /* */ }
  }
  useEffect(() => { load() }, [projectId])

  useEffect(() => {
    if (!canManage) return
    api.get<{ items: { id: number; name: string }[] }>(`/projects/${projectId}/consultants/available`)
      .then(r => setOpts((r.items ?? []).map(x => ({ id: x.id, name: x.name })))).catch(() => {})
  }, [canManage, projectId, members.length])

  async function add(uid: string) {
    if (!uid) return
    setBusy(true)
    try {
      const r = await api.post<{ item: Member }>(`/projects/${projectId}/consultants`, { user_id: Number(uid) })
      setMembers(v => v.some(x => x.id === r.item.id) ? v : [...v, r.item].sort((a, b) => a.name.localeCompare(b.name)))
      setPick(''); setAdding(false)
      toast.success('Consultor adicionado ao projeto')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao adicionar') }
    finally { setBusy(false) }
  }

  async function remove(uid: number) {
    if (!confirm('Remover este consultor da equipe do projeto?')) return
    try {
      await api.delete(`/projects/${projectId}/consultants/${uid}`)
      setMembers(v => v.filter(x => x.id !== uid))
      toast.success('Consultor removido')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao remover') }
  }

  return (
    <div className="ds-card ds-card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        <Users size={12} /> Consultores do projeto
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 8 }}>
        Só estes consultores aparecem nos seletores de Responsável/alocação das atividades.
      </div>

      {members.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Nenhum consultor definido. {canManage && 'Adicione os consultores que vão trabalhar no projeto.'}
        </div>
      )}

      {members.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map(m => (
            <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              <span style={{ flex: 1 }}>{m.name}{m.email ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {m.email}</span> : null}</span>
              {canManage && (
                <button onClick={() => remove(m.id)} title="Remover" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
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
                <SearchSelect value={pick} onChange={v => { setPick(v); add(v) }} options={opts} placeholder="Buscar consultor/coordenador…" fullWidth />
              </div>
              <button onClick={() => { setAdding(false); setPick('') }} className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} disabled={busy} className="ds-btn-ghost"
              style={{ fontSize: 12, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}>
              <UserPlus size={13} /> Adicionar consultor
            </button>
          )}
        </div>
      )}
    </div>
  )
}
