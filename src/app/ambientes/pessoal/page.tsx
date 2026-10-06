'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Cofre Pessoal — itens pessoais (senhas/credenciais) do próprio usuário.
// ESCOPADO ao vault type='personal': privado, zero-knowledge, SEM membros
// (o servidor proíbe adicionar membros ao cofre pessoal). Os cofres de CLIENTE
// (compartilhados com a equipe) ficam na tela "Cofre" (/ambientes).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Globe, KeyRound, Lock, Pencil, Plus, Search, Settings, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useVault, type VaultSummary } from '@/contexts/vault-context'
import { decryptItem, type VaultItemData } from '@/lib/vault-crypto'
import { OnboardingWizard } from '@/components/vault/onboarding-wizard'
import { UnlockScreen } from '@/components/vault/unlock-screen'
import { ItemModal } from '@/components/vault/item-modal'
import { RevealField } from '@/components/vault/reveal-field'
import { TotpCell } from '@/components/vault/totp-cell'

interface ItemRow { id: number; type: string; name: string; data: string; key_version: number; updated_at: string }
interface DecryptedRow extends ItemRow { plain: VaultItemData | null }

export default function CofrePessoalPage() {
  const { status, vaults, lock, refreshVaults, getVaultKey } = useVault()
  const [items, setItems] = useState<DecryptedRow[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [search, setSearch] = useState('')
  const [itemModal, setItemModal] = useState<{ open: boolean; editing: { id: number; name: string; data: VaultItemData } | null }>({ open: false, editing: null })
  const [deleteItem, setDeleteItem] = useState<DecryptedRow | null>(null)

  // SÓ o cofre pessoal (privado). Nunca os cofres de cliente.
  const personal: VaultSummary | undefined = useMemo(
    () => vaults.find(v => v.type === 'personal'),
    [vaults],
  )
  const vaultKey = personal ? getVaultKey(personal.id) : undefined

  const loadItems = useCallback(async () => {
    if (!personal) return
    const key = getVaultKey(personal.id)
    setLoadingItems(true)
    try {
      const rows = await api.get<ItemRow[]>(`/vault/vaults/${personal.id}/items`)
      const out: DecryptedRow[] = []
      for (const r of rows) {
        let plain: VaultItemData | null = null
        if (key) {
          try { plain = await decryptItem(key, r.data) } catch { /* key_version antiga */ }
        }
        out.push({ ...r, plain })
      }
      setItems(out)
    } finally {
      setLoadingItems(false)
    }
  }, [personal, getVaultKey])

  useEffect(() => {
    if (status === 'unlocked' && personal) void loadItems()
  }, [status, personal?.id, personal?.key_version, loadItems, personal])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.name.toLowerCase().includes(q)
      || i.plain?.username?.toLowerCase().includes(q)
      || i.plain?.url?.toLowerCase().includes(q))
  }, [items, search])

  const confirmDelete = async () => {
    if (!deleteItem) return
    try {
      await api.delete(`/vault/items/${deleteItem.id}`)
      toast.success('Item movido para a lixeira.')
      setDeleteItem(null)
      await loadItems()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao excluir.')
    }
  }

  return (
    <AppLayout>
      <PageHeader
        icon={KeyRound}
        title="Cofre Pessoal"
        subtitle="Suas senhas pessoais — privado e zero-knowledge: ninguém, nem o admin, consegue ver."
        actions={status === 'unlocked' ? (
          <div className="flex gap-2">
            <Link href="/ambientes/configuracao"><Button icon={Settings}>Configuração</Button></Link>
            <Button icon={Lock} onClick={lock}>Travar</Button>
          </div>
        ) : undefined}
      />

      {status === 'loading' && <Skeleton className="h-64" />}
      {status === 'unconfigured' && <OnboardingWizard />}
      {status === 'locked' && <UnlockScreen />}

      {status === 'unlocked' && (
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <TextInput icon={Search} placeholder="Buscar por nome, usuário ou URL…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {personal && (
              <Button variant="primary" icon={Plus} onClick={() => setItemModal({ open: true, editing: null })}>Novo item</Button>
            )}
          </div>

          <Card padding="none" className="overflow-x-auto">
            {loadingItems ? (
              <div className="p-6"><Skeleton className="h-32" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={KeyRound}
                  title={search ? 'Nada encontrado' : 'Cofre pessoal vazio'}
                  description={search ? 'Tente outro termo.' : 'Crie seu primeiro item com o botão "Novo item". Só você consegue ver.'}
                />
              </div>
            ) : (
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Usuário</th>
                    <th>Senha</th>
                    <th>TOTP</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id}>
                      <td>
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{row.name}</div>
                        {row.plain?.url && (
                          <a href={row.plain.url.startsWith('http') ? row.plain.url : `https://${row.plain.url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
                            <Globe className="w-3 h-3" />{row.plain.url}
                          </a>
                        )}
                      </td>
                      <td>
                        {row.plain?.username ? (
                          <RevealField itemId={row.id} value={row.plain.username} mode="copy" masked="" reprompt={false} />
                        ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
                        {row.plain?.username && <span className="text-sm ml-1" style={{ color: 'var(--text)' }}>{row.plain.username}</span>}
                      </td>
                      <td>
                        {row.plain?.password ? (
                          <RevealField itemId={row.id} value={row.plain.password} mode="reveal" reprompt={row.plain.reprompt} />
                        ) : row.plain ? <span style={{ color: 'var(--text-light)' }}>—</span> : (
                          <Badge variant="warning">recifrar</Badge>
                        )}
                      </td>
                      <td>
                        {row.plain?.totp_seed ? <TotpCell itemId={row.id} seed={row.plain.totp_seed} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {row.plain && (
                          <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Editar"
                            onClick={() => setItemModal({ open: true, editing: { id: row.id, name: row.name, data: row.plain! } })}>
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={() => setDeleteItem(row)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {personal && (
        <ItemModal
          open={itemModal.open}
          onClose={() => setItemModal({ open: false, editing: null })}
          onSaved={() => { void loadItems(); void refreshVaults() }}
          vaultId={personal.id}
          vaultKey={vaultKey}
          keyVersion={personal.key_version}
          editing={itemModal.editing}
        />
      )}

      <Modal open={deleteItem !== null} onClose={() => setDeleteItem(null)} title="Excluir item">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Mover <b>{deleteItem?.name}</b> para a lixeira do seu cofre pessoal?
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleteItem(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
