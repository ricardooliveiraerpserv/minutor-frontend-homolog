'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Trash2, UserPlus, Mail, Users, Loader2 } from 'lucide-react'

type Envolvido = {
  id: number
  side: 'internal' | 'client'
  user_id: number | null
  external_email: string | null
  display_name: string
  email: string | null
  user_type: string | null
  added_by_name: string | null
  added_at: string
}

type UserOption = {
  id: number
  name: string
  email: string
  type: string
}

type Props = {
  cardType: 'contract-requests' | 'projects'
  cardId: number
  /** desabilita controles de edição se o usuário atual não pode gerenciar */
  readOnly?: boolean
  /** quando preenchido, mostra badge "BLOQUEADA" no lado cliente */
  clientBlocked?: boolean
}

export default function CardEnvolvidos({ cardType, cardId, readOnly = false, clientBlocked = false }: Props) {
  const [items, setItems] = useState<Envolvido[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<'internal' | 'client' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<Envolvido[]>(`/${cardType}/${cardId}/envolvidos`)
      setItems(Array.isArray(r) ? r : [])
    } finally {
      setLoading(false)
    }
  }, [cardType, cardId])

  useEffect(() => { load() }, [load])

  const remove = async (id: number) => {
    if (!confirm('Remover este envolvido do card?')) return
    await api.delete(`/${cardType}/${cardId}/envolvidos/${id}`)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const internal = items.filter(i => i.side === 'internal')
  const client = items.filter(i => i.side === 'client')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2" style={{ color: 'var(--text)' }}>
        <Users size={16} />
        <h3 className="font-semibold text-[15px]">Envolvidos no card</h3>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Apenas envolvidos podem ser citados via @ no chat e recebem emails de notificação.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <>
          <SideBlock
            label="ERPServ · interno"
            accent="#22D3EE"
            items={internal}
            onAdd={readOnly ? undefined : () => setAdding('internal')}
            onRemove={readOnly ? undefined : remove}
          />

          <SideBlock
            label="Cliente"
            accent="#FBBF24"
            items={client}
            onAdd={readOnly ? undefined : () => setAdding('client')}
            onRemove={readOnly ? undefined : remove}
            warningBadge={clientBlocked ? 'BLOQUEADA' : null}
            warningText={clientBlocked ? 'Cliente está bloqueado no chat após a decisão. Continua recebendo movimentação de fase.' : null}
          />
        </>
      )}

      {adding && (
        <AddDialog
          cardType={cardType}
          cardId={cardId}
          side={adding}
          onClose={() => setAdding(null)}
          onAdded={(e) => { setItems(prev => [...prev, e]); setAdding(null) }}
        />
      )}
    </div>
  )
}

function SideBlock({
  label, accent, items, onAdd, onRemove, warningBadge, warningText,
}: {
  label: string
  accent: string
  items: Envolvido[]
  onAdd?: () => void
  onRemove?: (id: number) => void
  warningBadge?: string | null
  warningText?: string | null
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>
          {label}
        </div>
        {warningBadge && (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
            style={{ background: '#7F1D1D', color: '#FEE2E2' }}>
            {warningBadge}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-xs italic py-2" style={{ color: 'var(--text-muted)' }}>
          Nenhum envolvido ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(e => (
            <div key={e.id} className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: 'var(--surface-hover)', color: 'var(--text)' }}
              >
                {e.user_id ? initials(e.display_name) : <Mail size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>
                  {e.display_name}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {e.user_id ? roleLabel(e.user_type) : 'Convidado por email'}
                  {e.added_by_name && ` · adicionado por ${e.added_by_name}`}
                </div>
              </div>
              {onRemove && (
                <button
                  onClick={() => onRemove(e.id)}
                  className="p-1 rounded hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {warningText && (
        <div className="mt-3 text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
          {warningText}
        </div>
      )}

      {onAdd && (
        <button
          onClick={onAdd}
          className="mt-3 text-[12px] font-semibold flex items-center gap-1.5"
          style={{ color: accent }}
        >
          <UserPlus size={14} />
          Adicionar
        </button>
      )}
    </div>
  )
}

function AddDialog({
  cardType, cardId, side, onClose, onAdded,
}: {
  cardType: string
  cardId: number
  side: 'internal' | 'client'
  onClose: () => void
  onAdded: (e: Envolvido) => void
}) {
  const [mode, setMode] = useState<'user' | 'email'>(side === 'internal' ? 'user' : 'user')
  const [users, setUsers] = useState<UserOption[]>([])
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ items: UserOption[] }>(`/users?pageSize=500`).then(r => {
      const list = Array.isArray((r as any).items) ? (r as any).items : Array.isArray(r) ? (r as any) : []
      const filtered = list.filter((u: UserOption) =>
        side === 'internal' ? u.type !== 'cliente' : u.type === 'cliente'
      )
      setUsers(filtered)
    }).catch(() => {})
  }, [side])

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50)

  const submit = async () => {
    setError('')
    setSaving(true)
    try {
      const payload = mode === 'user' ? { user_id: selectedUserId, side } : { external_email: email, side }
      if (mode === 'user' && !selectedUserId) { setError('Selecione um usuário.'); return }
      if (mode === 'email' && !email) { setError('Informe um email.'); return }
      const created = await api.post<Envolvido>(`/${cardType}/${cardId}/envolvidos`, payload)
      onAdded(created)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao adicionar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg p-5 shadow-2xl"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Adicionar envolvido — {side === 'internal' ? 'ERPServ' : 'Cliente'}
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {side === 'internal'
            ? 'Selecione um usuário do cadastro Minutor.'
            : 'Use um usuário Minutor do cliente OU convide via email.'}
        </p>

        {side === 'client' && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setMode('user')}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{
                background: mode === 'user' ? 'var(--primary-soft)' : 'var(--surface)',
                color: mode === 'user' ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              Usuário Minutor
            </button>
            <button
              onClick={() => setMode('email')}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{
                background: mode === 'email' ? 'var(--primary-soft)' : 'var(--surface)',
                color: mode === 'email' ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              Convidar por email
            </button>
          </div>
        )}

        {mode === 'user' ? (
          <>
            <input
              type="text"
              placeholder="Buscar por nome ou email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ds-input w-full mb-2"
              autoFocus
            />
            <div className="max-h-[260px] overflow-y-auto rounded border" style={{ borderColor: 'var(--border)' }}>
              {filtered.length === 0 ? (
                <div className="text-xs italic p-3" style={{ color: 'var(--text-muted)' }}>
                  Nenhum usuário encontrado.
                </div>
              ) : filtered.map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                  style={{
                    background: selectedUserId === u.id ? 'var(--primary-soft)' : 'transparent',
                    color: 'var(--text)',
                  }}
                >
                  <span>
                    <span className="font-medium">{u.name}</span>
                    <span className="text-[11px] ml-2" style={{ color: 'var(--text-muted)' }}>{u.email}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {roleLabel(u.type)}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <input
            type="email"
            placeholder="email@cliente.com.br"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="ds-input w-full"
            autoFocus
          />
        )}

        {error && <div className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="ds-btn-secondary text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} className="ds-btn-primary text-sm">
            {saving ? <Loader2 size={14} className="animate-spin inline" /> : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function roleLabel(type: string | null): string {
  switch (type) {
    case 'admin': return 'Admin'
    case 'coordenador': return 'Coordenador'
    case 'consultor': return 'Consultor'
    case 'cliente': return 'Cliente'
    case 'parceiro_admin': return 'Parceiro'
    case 'administrativo': return 'Administrativo'
    default: return type ?? '—'
  }
}
