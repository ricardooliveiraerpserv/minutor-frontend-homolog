'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Cofre de Senhas — tela principal.
// Coluna esquerda: cofres (pessoal + compartilhados). Direita: itens do cofre
// selecionado. Tudo que é sensível chega/parte cifrado (ver lib/vault-crypto).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Globe, KeyRound, Layers, Lock, Pencil, Plus, RefreshCw, Search,
  Settings, ShieldCheck, Trash2, Users, Vault as VaultIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useDeniedActions } from '@/contexts/denied-actions-context'
import { useVault, type VaultSummary } from '@/contexts/vault-context'
import { decryptItem, rsaUnwrap, type VaultItemData } from '@/lib/vault-crypto'
import { OnboardingWizard } from '@/components/vault/onboarding-wizard'
import { UnlockScreen } from '@/components/vault/unlock-screen'
import { ItemModal } from '@/components/vault/item-modal'
import { RevealField } from '@/components/vault/reveal-field'
import { MembersModal } from '@/components/vault/members-modal'
import { RotationRunner } from '@/components/vault/rotation-runner'
import { TotpCell } from '@/components/vault/totp-cell'

interface ItemRow { id: number; type: string; name: string; data: string; key_version: number; updated_at: string }
interface DecryptedRow extends ItemRow { plain: VaultItemData | null }
interface ClientRowC { customer_id: number; customer_name: string; vault_id: number; environments_count: number }

export default function CofrePage() {
  const { status, vaults, lock, refreshVaults, getVaultKey, getPrivateKey } = useVault()
  const { isDenied } = useDeniedActions()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [items, setItems] = useState<DecryptedRow[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [search, setSearch] = useState('')
  const [itemModal, setItemModal] = useState<{ open: boolean; editing: { id: number; name: string; data: VaultItemData } | null }>({ open: false, editing: null })
  const [membersOpen, setMembersOpen] = useState(false)
  const [rotationOpen, setRotationOpen] = useState(false)
  const [newVaultOpen, setNewVaultOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<DecryptedRow | null>(null)
  // Empresas (client-vaults) — cada uma vira um CARD na landing do Cofre (ambientes + acessos dentro).
  const [clients, setClients] = useState<ClientRowC[]>([])

  const dCreate = isDenied('/cofre', 'create')
  const dEdit = isDenied('/cofre', 'edit')
  const dDelete = isDenied('/cofre', 'delete')

  const selected: VaultSummary | undefined = useMemo(
    () => vaults.find(v => v.id === selectedId) ?? vaults[0],
    [vaults, selectedId],
  )
  const vaultKey = selected ? getVaultKey(selected.id) : undefined
  const canWrite = !!selected && selected.role !== 'read' && !dEdit
  const personalVault = useMemo(() => vaults.find(v => v.type === 'personal'), [vaults])
  const showingPersonal = selected?.type === 'personal'

  // Carrega as empresas (client-vaults) uma vez ao destravar → cards da landing.
  useEffect(() => {
    if (status !== 'unlocked') return
    void api.get<ClientRowC[]>('/environments/clients').then(setClients).catch(() => setClients([]))
  }, [status])

  const loadItems = useCallback(async () => {
    if (!selected) return
    const key = getVaultKey(selected.id)
    setLoadingItems(true)
    try {
      const rows = await api.get<ItemRow[]>(`/vault/vaults/${selected.id}/items`)
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
  }, [selected, getVaultKey])

  useEffect(() => {
    if (status === 'unlocked' && selected) void loadItems()
  }, [status, selected?.id, selected?.key_version, loadItems, selected])

  /** Bytes da vault key sob demanda (wrap p/ novos membros) — re-unwrap com a privada. */
  const getVaultKeyBytes = useCallback(async () => {
    const priv = getPrivateKey()
    if (!priv || !selected) return null
    try { return await rsaUnwrap(priv, selected.encrypted_vault_key) } catch { return null }
  }, [getPrivateKey, selected])

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
        icon={VaultIcon}
        title="Cofre de Senhas"
        subtitle="Zero-knowledge: nem o servidor consegue ler suas credenciais"
        actions={status === 'unlocked' ? (
          <div className="flex gap-2">
            <Link href="/cofre/configuracao"><Button icon={Settings}>Configuração</Button></Link>
            <Button icon={Lock} onClick={lock}>Travar</Button>
          </div>
        ) : undefined}
      />

      {status === 'loading' && <Skeleton className="h-64" />}
      {status === 'unconfigured' && <OnboardingWizard />}
      {status === 'locked' && <UnlockScreen />}

      {status === 'unlocked' && (
        <div className="flex flex-col gap-4">
          {/* migração: o Cofre de Ambientes antigo segue em /ambientes até validar este */}
          <div className="text-xs px-3 py-2 rounded" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
            Cada empresa é um card com seus <b>ambientes e acessos</b>. O Cofre de Ambientes antigo continua em <Link href="/ambientes" className="underline">/ambientes</Link> até validarmos este.
          </div>

          {/* Cards: Cofre Pessoal + empresas ativas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {personalVault && (
              <button type="button" onClick={() => setSelectedId(personalVault.id)} className="text-left rounded-2xl p-4 transition-colors"
                style={{ background: 'var(--surface)', border: `1px solid ${showingPersonal ? 'var(--primary)' : 'var(--border)'}` }}>
                <div className="flex items-center gap-2 mb-1"><KeyRound className="w-4 h-4" style={{ color: 'var(--primary)' }} /><span className="font-semibold" style={{ color: 'var(--text)' }}>Cofre Pessoal</span></div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{personalVault.items_count} credencial(is) pessoal(is)</div>
              </button>
            )}
            {clients.map(c => (
              <Link key={c.customer_id} href={`/ambientes/${c.customer_id}`} className="block rounded-2xl p-4 transition-colors"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-1"><Layers className="w-4 h-4" style={{ color: 'var(--primary)' }} /><span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{c.customer_name}</span></div>
                <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Users className="w-3.5 h-3.5" /> {c.environments_count} ambiente(s) · acessos e ambientes</div>
              </Link>
            ))}
            {!dCreate && (
              <button type="button" onClick={() => setNewVaultOpen(true)} className="rounded-2xl p-4 flex items-center justify-center gap-2 text-sm"
                style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                <Plus className="w-4 h-4" /> Novo cofre compartilhado
              </button>
            )}
          </div>

          {/* Painel do Cofre Pessoal (credenciais) — só quando selecionado */}
          {showingPersonal && selected && (
          <div className="flex flex-col gap-3 min-w-0">
            {selected?.pending_rotation && (
              <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">Rotação de chave pendente — um ex-membro conheceu a chave atual.</span>
                {selected.role === 'admin' && (
                  <Button size="sm" icon={RefreshCw} onClick={() => setRotationOpen(true)}>Rotacionar</Button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <TextInput icon={Search} placeholder="Buscar por nome, usuário ou URL…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {selected?.type === 'shared' && (
                <Button icon={Users} onClick={() => setMembersOpen(true)}>Membros ({selected.members_count})</Button>
              )}
              {canWrite && (
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
                    title={search ? 'Nada encontrado' : 'Cofre vazio'}
                    description={search ? 'Tente outro termo.' : canWrite ? 'Crie o primeiro item com o botão "Novo item".' : 'Sem itens neste cofre.'}
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
                          {canWrite && row.plain && (
                            <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Editar"
                              onClick={() => setItemModal({ open: true, editing: { id: row.id, name: row.name, data: row.plain! } })}>
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canWrite && !dDelete && (
                            <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={() => setDeleteItem(row)}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
          )}
        </div>
      )}

      {/* ── Modais ── */}
      {selected && (
        <ItemModal
          open={itemModal.open}
          onClose={() => setItemModal({ open: false, editing: null })}
          onSaved={() => { void loadItems(); void refreshVaults() }}
          vaultId={selected.id}
          vaultKey={vaultKey}
          keyVersion={selected.key_version}
          editing={itemModal.editing}
        />
      )}
      {selected && selected.type === 'shared' && (
        <MembersModal
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          vaultId={selected.id}
          vaultName={selected.name}
          getVaultKeyBytes={getVaultKeyBytes}
          isVaultAdmin={selected.role === 'admin'}
          onChanged={() => void refreshVaults()}
        />
      )}
      {selected && (
        <RotationRunner
          open={rotationOpen}
          onClose={() => setRotationOpen(false)}
          vaultId={selected.id}
          vaultName={selected.name}
          keyVersion={selected.key_version}
          oldVaultKey={vaultKey}
          onDone={() => { void refreshVaults() }}
        />
      )}
      <NewVaultModal open={newVaultOpen} onClose={() => setNewVaultOpen(false)} onCreated={() => void refreshVaults()} />

      <Modal open={deleteItem !== null} onClose={() => setDeleteItem(null)} title="Excluir item">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Mover <b>{deleteItem?.name}</b> para a lixeira do cofre?
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

/** Criar cofre compartilhado: gera a vault key aqui e a wrapa pra própria pública. */
function NewVaultModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { publicKey } = useVault()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!publicKey || !name.trim()) return
    setBusy(true)
    try {
      const { generateKey32, rsaWrap } = await import('@/lib/vault-crypto')
      const keyBytes = generateKey32()
      await api.post('/vault/vaults', {
        name: name.trim(),
        encrypted_vault_key: await rsaWrap(publicKey, keyBytes),
      })
      toast.success('Cofre criado.')
      setName('')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao criar cofre.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo cofre compartilhado">
      <div className="flex flex-col gap-4">
        <TextInput label="Nome do cofre" autoFocus placeholder="Ex.: Infra ERPSERV, Cliente ACME…" value={name} onChange={e => setName(e.target.value)} />
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
          Você entra como admin. Depois adicione membros — cada um recebe a chave cifrada com a própria chave pública.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={ShieldCheck} loading={busy} disabled={!name.trim()} onClick={create}>Criar cofre</Button>
        </div>
      </div>
    </Modal>
  )
}
