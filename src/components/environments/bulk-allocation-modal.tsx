'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Alocação em massa de acesso aos cofres de CLIENTE.
// Zero-knowledge: pra ADICIONAR, re-cifra a chave de cada cofre (que o admin
// destrava com a própria privada) com a chave pública de cada alvo — tudo no
// navegador. REMOVER revoga a membership (o gate do reveal corta na hora).
// Só funciona com o cofre DESTRAVADO (precisa das chaves em memória).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users, UserPlus, UserMinus, Building2, CheckSquare, Square, ShieldCheck, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Modal, Badge, TextInput } from '@/components/ds'
import { api } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { rsaUnwrap, rsaWrap } from '@/lib/vault-crypto'

interface Person { user_id: number; name: string; email: string; public_key: string | null; configured: boolean }
interface Team { id: number; name: string; members: Person[]; total: number; not_configured: number }
interface Client { customer_id: number; customer_name: string | null; vault_id: number; role: 'admin' | 'write' | 'read' | null }

type Role = 'read' | 'write' | 'admin'
const ROLE_LABEL: Record<Role, string> = { read: 'Ler', write: 'Escrever', admin: 'Admin' }

interface Props {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export function BulkAllocationModal({ open, onClose, onChanged }: Props) {
  const { vaults, getPrivateKey } = useVault()
  const [people, setPeople] = useState<Person[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)

  const [selUsers, setSelUsers] = useState<Set<number>>(new Set())
  const [selTeams, setSelTeams] = useState<Set<number>>(new Set())
  const [selClients, setSelClients] = useState<Set<number>>(new Set()) // por customer_id
  const [role, setRole] = useState<Role>('read')
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [peopleQ, setPeopleQ] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      api.get<Person[]>('/vault/allocatable-users').catch(() => []),
      api.get<Team[]>('/vault/teams').catch(() => []),
      api.get<Client[]>('/environments/clients').catch(() => []),
    ]).then(([p, t, c]) => {
      setPeople(p ?? [])
      setTeams(t ?? [])
      setClients(c ?? [])
    }).finally(() => setLoading(false))
  }, [open])

  // só clientes onde SOU admin (preciso da chave p/ re-cifrar / gerir membros)
  const adminClients = useMemo(() => clients.filter(c => c.role === 'admin'), [clients])

  // alvos resolvidos: usuários escolhidos + membros das equipes escolhidas (dedup por user_id, com chave pública)
  const targets = useMemo(() => {
    const map = new Map<number, Person>()
    for (const p of people) if (selUsers.has(p.user_id) && p.public_key) map.set(p.user_id, p)
    for (const t of teams) if (selTeams.has(t.id)) for (const m of t.members) if (m.public_key) map.set(m.user_id, m)
    return [...map.values()]
  }, [people, teams, selUsers, selTeams])

  const targetClients = useMemo(
    () => adminClients.filter(c => selClients.has(c.customer_id)),
    [adminClients, selClients],
  )

  const filteredPeople = useMemo(() => {
    const q = peopleQ.trim().toLowerCase()
    const base = q ? people.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) : people
    // configurados primeiro (selecionáveis), depois os sem cofre
    return [...base].sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [people, peopleQ])

  const vaultKeyB64 = useCallback((vaultId: number) => vaults.find(v => v.id === vaultId)?.encrypted_vault_key ?? null, [vaults])

  const toggle = (set: Set<number>, id: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); setter(next)
  }
  const allClients = () => setSelClients(new Set(adminClients.map(c => c.customer_id)))
  const noneClients = () => setSelClients(new Set())

  const reset = () => { setSelUsers(new Set()); setSelTeams(new Set()); setSelClients(new Set()); setProgress(null) }

  const apply = async () => {
    if (targets.length === 0) { toast.error('Selecione ao menos uma pessoa ou equipe.'); return }
    if (targetClients.length === 0) { toast.error('Selecione ao menos um cliente (onde você é admin).'); return }
    const priv = getPrivateKey()
    if (!priv) { toast.error('Cofre travado — destrave antes.'); return }

    setBusy(true)
    let ok = 0, fail = 0
    try {
      // Monta as operações (uma por cliente × pessoa)
      type Op = () => Promise<void>
      const ops: Op[] = []

      for (const c of targetClients) {
        if (mode === 'add') {
          const wrapped = vaultKeyB64(c.vault_id)
          if (!wrapped) { fail += targets.length; continue }
          let keyBytes: Uint8Array
          try { keyBytes = await rsaUnwrap(priv, wrapped) } catch { fail += targets.length; continue }
          for (const p of targets) {
            ops.push(async () => {
              const encrypted_vault_key = await rsaWrap(p.public_key!, keyBytes) // targets só tem configurados (public_key != null)
              await api.post(`/vault/vaults/${c.vault_id}/members`, { user_id: p.user_id, role, encrypted_vault_key })
            })
          }
        } else {
          for (const p of targets) {
            ops.push(async () => { await api.delete(`/vault/vaults/${c.vault_id}/members/${p.user_id}`) })
          }
        }
      }

      const total = ops.length + fail
      setProgress({ done: fail, total })
      for (const batch of chunk(ops, 6)) {
        const res = await Promise.allSettled(batch.map(fn => fn()))
        for (const r of res) r.status === 'fulfilled' ? ok++ : fail++
        setProgress({ done: ok + fail, total })
      }

      const skipped = clients.filter(c => selClients.has(c.customer_id) && c.role !== 'admin').length
      toast[fail ? 'warning' : 'success'](
        `${mode === 'add' ? 'Alocação' : 'Remoção'}: ${ok} ok${fail ? `, ${fail} falha(s)` : ''}` +
        (skipped ? ` · ${skipped} cliente(s) pulado(s) (sem admin)` : ''),
      )
      onChanged?.()
      reset()
      onClose()
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const Row = ({ checked, onClick, children, sub, disabled }: { checked: boolean; onClick: () => void; children: React.ReactNode; sub?: React.ReactNode; disabled?: boolean }) => (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled}
      className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-opacity disabled:cursor-not-allowed"
      style={{ background: checked ? 'var(--primary-soft)' : 'transparent', color: checked ? 'var(--primary)' : 'var(--text)', opacity: disabled ? 0.45 : 1 }}>
      {checked ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" style={{ color: 'var(--text-light)' }} />}
      <span className="flex-1 truncate">{children}</span>
      {sub}
    </button>
  )

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Alocar acesso em massa">
      <div className="flex flex-col gap-4" style={{ minWidth: 'min(80vw, 760px)' }}>
        {/* modo */}
        <div className="flex gap-2">
          <Button variant={mode === 'add' ? 'primary' : 'secondary'} icon={UserPlus} onClick={() => setMode('add')}>Adicionar</Button>
          <Button variant={mode === 'remove' ? 'primary' : 'secondary'} icon={UserMinus} onClick={() => setMode('remove')}>Remover</Button>
          {mode === 'add' && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Papel:</span>
              {(['read', 'write', 'admin'] as Role[]).map(r => (
                <Button key={r} size="sm" variant={role === r ? 'primary' : 'secondary'} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</Button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Equipes */}
            <Card padding="sm" className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-1 pb-1" style={{ color: 'var(--text-light)' }}>
                <Users className="w-3.5 h-3.5" /> Equipes
              </div>
              {teams.length === 0 && <span className="text-xs px-2 py-1" style={{ color: 'var(--text-light)' }}>Nenhuma equipe.</span>}
              {teams.map(t => (
                <Row key={t.id} checked={selTeams.has(t.id)} onClick={() => toggle(selTeams, t.id, setSelTeams)}
                  sub={<Badge variant="neutral">{t.members.length}{t.not_configured ? `/${t.total}` : ''}</Badge>}>
                  {t.name}
                </Row>
              ))}
            </Card>

            {/* Pessoas */}
            <Card padding="sm" className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-1 pb-1" style={{ color: 'var(--text-light)' }}>
                <ShieldCheck className="w-3.5 h-3.5" /> Pessoas
              </div>
              <div className="px-1 pb-1 sticky top-0">
                <TextInput icon={Search} placeholder="Buscar por nome ou e-mail…" value={peopleQ} onChange={e => setPeopleQ(e.target.value)} className="!py-1.5 text-xs" />
              </div>
              {filteredPeople.length === 0 && <span className="text-xs px-2 py-1" style={{ color: 'var(--text-light)' }}>Nenhuma pessoa encontrada.</span>}
              {filteredPeople.map(p => (
                <Row key={p.user_id} checked={selUsers.has(p.user_id)} disabled={!p.configured}
                  onClick={() => toggle(selUsers, p.user_id, setSelUsers)}
                  sub={!p.configured ? <Badge variant="neutral">sem cofre</Badge> : undefined}>
                  {p.name}
                </Row>
              ))}
            </Card>

            {/* Clientes */}
            <Card padding="sm" className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
                  <Building2 className="w-3.5 h-3.5" /> Clientes
                </div>
                <div className="flex gap-1">
                  <button type="button" className="text-[11px] hover:underline" style={{ color: 'var(--primary)' }} onClick={allClients}>Todos</button>
                  <span style={{ color: 'var(--text-light)' }}>·</span>
                  <button type="button" className="text-[11px] hover:underline" style={{ color: 'var(--text-muted)' }} onClick={noneClients}>Nenhum</button>
                </div>
              </div>
              {adminClients.length === 0 && <span className="text-xs px-2 py-1" style={{ color: 'var(--text-light)' }}>Nenhum cliente onde você é admin.</span>}
              {adminClients.map(c => (
                <Row key={c.customer_id} checked={selClients.has(c.customer_id)} onClick={() => toggle(selClients, c.customer_id, setSelClients)}>
                  {c.customer_name ?? `Cliente ${c.customer_id}`}
                </Row>
              ))}
            </Card>
          </div>
        )}

        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
          {targets.length} pessoa(s) × {targetClients.length} cliente(s) = <b>{targets.length * targetClients.length}</b> operação(ões).
          {mode === 'add' && ' Alvos sem cofre configurado são ignorados.'}
        </p>

        <div className="flex items-center justify-end gap-2">
          {progress && <span className="text-xs mr-auto" style={{ color: 'var(--text-muted)' }}>Aplicando {progress.done}/{progress.total}…</span>}
          <Button onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" icon={mode === 'add' ? UserPlus : UserMinus} loading={busy}
            disabled={targets.length === 0 || targetClients.length === 0}
            onClick={apply}>
            {mode === 'add' ? 'Alocar' : 'Remover'} ({targets.length * targetClients.length})
          </Button>
        </div>
      </div>
    </Modal>
  )
}
