'use client'

// Detalhe do cliente: lista de ambientes (Produção/Homolog/Dev) como cards.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, Server } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton, TextInput, Select } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { UnlockScreen } from '@/components/vault/unlock-screen'

interface EnvRow { id: number; name: string; type: string; status: string; credentials_count: number; vault_id: number }

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }
const STATUS_VARIANT: Record<string, string> = { online: 'success', offline: 'danger', maintenance: 'warning', unknown: 'default' }
const STATUS_LABEL: Record<string, string> = { online: 'Online', offline: 'Offline', maintenance: 'Manutenção', unknown: '—' }

export default function ClienteAmbientesPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const { status } = useVault()
  const [envs, setEnvs] = useState<EnvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ vault_id: number; environments: EnvRow[] }>(`/environments/clients/${customerId}/environments`)
      setEnvs(res.environments)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error('Cliente sem cofre ou sem acesso.')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    if (status === 'unlocked') void load()
  }, [status, load])

  if (status === 'locked') return <AppLayout><UnlockScreen /></AppLayout>
  if (status !== 'unlocked') return <AppLayout><Skeleton className="h-64" /></AppLayout>

  return (
    <AppLayout>
      <PageHeader
        icon={Server}
        title="Ambientes do cliente"
        actions={
          <div className="flex gap-2">
            <Link href="/ambientes"><Button icon={ArrowLeft}>Voltar</Button></Link>
            <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Novo ambiente</Button>
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-40" />
      ) : envs.length === 0 ? (
        <Card><EmptyState icon={Server} title="Nenhum ambiente" description="Crie Produção, Homologação e Desenvolvimento com 'Novo ambiente'." /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {envs.map(e => (
            <Link key={e.id} href={`/ambientes/environments/${e.id}`}>
              <Card className="hover:opacity-90 transition-opacity cursor-pointer h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{e.name}</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{TYPE_LABEL[e.type] ?? e.type}</div>
                  </div>
                  <Badge variant={STATUS_VARIANT[e.status] ?? 'default'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                </div>
                <div className="text-xs mt-3" style={{ color: 'var(--text-light)' }}>{e.credentials_count} credencial(is)</div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewEnvModal open={newOpen} onClose={() => setNewOpen(false)} customerId={Number(customerId)} onCreated={() => void load()} />
    </AppLayout>
  )
}

function NewEnvModal({ open, onClose, customerId, onCreated }: { open: boolean; onClose: () => void; customerId: number; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('prod')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setName(''); setType('prod') } }, [open])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api.post(`/environments/clients/${customerId}/environments`, { name: name.trim(), type })
      toast.success('Ambiente criado.')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao criar ambiente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo ambiente">
      <div className="flex flex-col gap-4">
        <TextInput label="Nome" autoFocus placeholder="Ex.: Produção ERP" value={name} onChange={e => setName(e.target.value)} />
        <Select label="Tipo" value={type} onChange={e => setType(e.target.value)}>
          <option value="prod">Produção</option>
          <option value="homolog">Homologação</option>
          <option value="dev">Desenvolvimento</option>
          <option value="dr">DR</option>
        </Select>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>Criar ambiente</Button>
        </div>
      </div>
    </Modal>
  )
}
