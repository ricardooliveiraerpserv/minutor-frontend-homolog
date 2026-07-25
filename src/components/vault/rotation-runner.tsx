'use client'

// Rotação de chave do cofre (pós-remoção de membro): TUDO client-side —
// gera nova vault key, decifra cada item com a antiga e recifra com a nova,
// re-wrapa a nova key p/ cada membro atual e envia numa transação única.

import { useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { requestMicrosoftStepUp, StepUpCancelled } from '@/lib/vault-stepup'
import { aesGcmDecryptString, aesGcmEncrypt, generateKey32, importAesKey, rsaWrap } from '@/lib/vault-crypto'

interface RotationRunnerProps {
  open: boolean
  onClose: () => void
  vaultId: number
  vaultName: string
  keyVersion: number
  oldVaultKey: CryptoKey | undefined
  onDone: () => void
}

export function RotationRunner({ open, onClose, vaultId, vaultName, keyVersion, oldVaultKey, onDone }: RotationRunnerProps) {
  const { profile } = useVault()
  const isMs = profile?.second_factor === 'microsoft'
  const [totp, setTotp] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const run = async () => {
    if (!oldVaultKey) { toast.error('Cofre travado — destrave antes de rotacionar.'); return }
    setBusy(true)
    try {
      // step-up ANTES do trabalho pesado (o token vale 5 min, cobre a recifragem)
      let stepup: Record<string, string> = {}
      if (isMs) await requestMicrosoftStepUp(); else stepup = { totp_code: totp }
      setProgress('Baixando itens…')
      const items = await api.get<{ id: number; data: string }[]>(`/vault/vaults/${vaultId}/items`)
      const members = await api.get<{ user_id: number; name: string }[]>(`/vault/vaults/${vaultId}/members`)
      const pubkeys = await api.get<{ user_id: number; public_key: string }[]>(
        `/vault/public-keys?user_ids=${members.map(m => m.user_id).join(',')}`,
      )
      const pubByUser = new Map(pubkeys.map(p => [p.user_id, p.public_key]))
      if (members.some(m => !pubByUser.has(m.user_id))) {
        throw new Error('Membro sem chave pública — não é possível rotacionar.')
      }

      const newKeyBytes = generateKey32()
      const newKey = await importAesKey(newKeyBytes)

      const reencrypted: { id: number; data: string }[] = []
      for (let i = 0; i < items.length; i++) {
        setProgress(`Recifrando itens… ${i + 1}/${items.length}`)
        const plain = await aesGcmDecryptString(oldVaultKey, items[i].data)
        reencrypted.push({ id: items[i].id, data: await aesGcmEncrypt(newKey, plain) })
      }

      setProgress('Recifrando chaves dos membros…')
      const wrapped = await Promise.all(members.map(async m => ({
        user_id: m.user_id,
        encrypted_vault_key: await rsaWrap(pubByUser.get(m.user_id)!, newKeyBytes),
      })))

      setProgress('Aplicando rotação…')
      await api.post(`/vault/vaults/${vaultId}/rotate`, {
        ...stepup,
        new_key_version: keyVersion + 1,
        members: wrapped,
        items: reencrypted,
      })
      toast.success('Chave rotacionada — o cofre está seguro novamente.')
      onDone()
      onClose()
    } catch (err) {
      if (err instanceof StepUpCancelled) toast.info('Verificação Microsoft cancelada.')
      else toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Falha na rotação.')
    } finally {
      setBusy(false)
      setProgress(null)
      setTotp('')
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose() }} title={`Rotacionar chave — ${vaultName}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Um ex-membro conheceu a chave atual deste cofre. A rotação gera uma chave nova e recifra
          todos os itens — tudo no seu navegador. Não feche esta janela durante o processo.
        </p>
        {progress ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--primary)' }} />
            {progress}
          </div>
        ) : !isMs ? (
          <TextInput label="Código do autenticador" icon={ShieldCheck} inputMode="numeric" placeholder="000000" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Você confirmará sua identidade na Microsoft ao iniciar.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>Depois</Button>
          <Button variant="primary" icon={RefreshCw} loading={busy} disabled={!isMs && totp.length < 6} onClick={run}>
            Rotacionar agora
          </Button>
        </div>
      </div>
    </Modal>
  )
}
