'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Cofre de Ambientes — página principal (lista de clientes com cofre de ambientes).
// Reusa o unlock/cripto do Cofre de Senhas via useVault(). Segredos nunca trafegam
// aqui: só metadados; senha só via /reveal enforced (nas telas de ambiente).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { KeyRound, Lock, Plus, Server, Users, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { UnlockScreen } from '@/components/vault/unlock-screen'
import { generateKey32, rsaWrap } from '@/lib/vault-crypto'

interface ClientRow { customer_id: number; customer_name: string; vault_id: number; environments_count: number; role: string }
interface CustomerOpt { id: number; name: string }

export default function AmbientesPage() {
  const { status, publicKey, lock } = useVault()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setClients(await api.get<ClientRow[]>('/environments/clients'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unlocked') void load()
  }, [status, load])

  return (
    <AppLayout>
      <PageHeader
        icon={Server}
        title="Cofre de Ambientes"
        subtitle="Gestão de infraestrutura por cliente — zero-knowledge nos segredos"
        actions={status === 'unlocked' ? (
          <Button icon={Lock} onClick={lock}>Travar</Button>
        ) : undefined}
      />

      {status === 'loading' && <Skeleton className="h-64" />}

      {status === 'unconfigured' && (
        <Card className="max-w-md mx-auto text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
              <KeyRound className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Configure seu cofre primeiro</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              O Cofre de Ambientes usa a mesma chave-mestra do Cofre de Senhas. Configure seu perfil lá uma vez.
            </p>
            <Link href="/cofre"><Button variant="primary">Ir para o Cofre</Button></Link>
          </div>
        </Card>
      )}

      {status === 'locked' && <UnlockScreen />}

      {status === 'unlocked' && (
        <>
          <div className="flex justify-end mb-4">
            <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Novo cliente</Button>
          </div>
          {loading ? (
            <Skeleton className="h-40" />
          ) : clients.length === 0 ? (
            <Card><EmptyState icon={Server} title="Nenhum cliente com ambientes" description="Crie o primeiro com 'Novo cliente' — cada cliente vira um cofre dedicado." /></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {clients.map(c => (
                <Link key={c.customer_id} href={`/ambientes/${c.customer_id}`}>
                  <Card className="hover:opacity-90 transition-opacity cursor-pointer h-full">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
                        <Server className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{c.customer_name}</div>
                        <div className="text-sm flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <Users className="w-3.5 h-3.5" /> {c.environments_count} ambiente(s)
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <NewClientModal open={newOpen} onClose={() => setNewOpen(false)} publicKey={publicKey} existing={clients.map(c => c.customer_id)} onCreated={() => void load()} />
    </AppLayout>
  )
}

/** Cria o cofre de ambientes de um cliente: gera vaultKey e a wrapa pra própria pública. */
function NewClientModal({ open, onClose, publicKey, existing, onCreated }: {
  open: boolean; onClose: () => void; publicKey: string | null; existing: number[]; onCreated: () => void
}) {
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [pick, setPick] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPick('')
      void api.get<{ data: CustomerOpt[] }>('/customers?per_page=1000&order=name')
        .then(r => setCustomers((Array.isArray(r) ? r : r.data ?? []).map((c: CustomerOpt) => ({ id: c.id, name: c.name }))))
        .catch(() => setCustomers([]))
    }
  }, [open])

  const create = async () => {
    if (!publicKey || pick === '') return
    setBusy(true)
    try {
      const keyBytes = generateKey32()
      await api.post('/environments/clients', {
        customer_id: pick,
        encrypted_vault_key: await rsaWrap(publicKey, keyBytes),
      })
      toast.success('Cofre de ambientes criado para o cliente.')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao criar o cofre do cliente.')
    } finally {
      setBusy(false)
    }
  }

  const available = customers.filter(c => !existing.includes(c.id))

  return (
    <Modal open={open} onClose={onClose} title="Novo cliente no Cofre de Ambientes">
      <div className="flex flex-col gap-4">
        <SearchSelect label="Cliente" placeholder="Buscar cliente…" value={pick} onChange={v => setPick(v === '' ? '' : Number(v))} options={available} fullWidth />
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
          O cliente vira um cofre dedicado. Você entra como admin; os segredos dos ambientes serão cifrados com a chave deste cofre.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={ShieldCheck} loading={busy} disabled={pick === '' || !publicKey} onClick={create}>Criar cofre</Button>
        </div>
      </div>
    </Modal>
  )
}
