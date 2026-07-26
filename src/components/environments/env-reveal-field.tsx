'use client'

// Senha de credencial: mascarada por padrão. O ciphertext SÓ é buscado quando o
// usuário clica em revelar/copiar (POST /reveal enforced) e decifrado no client.
// NÍVEL 4: item `critical` exige justificativa + step-up 2º fator (Microsoft/TOTP).

import { useState } from 'react'
import { Copy, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { aesGcmDecryptString } from '@/lib/vault-crypto'
import { requestMicrosoftStepUp, StepUpCancelled } from '@/lib/vault-stepup'

const CLIPBOARD_CLEAR_MS = 30_000

export function EnvRevealField({ secretId, critical = false }: { secretId: number; critical?: boolean }) {
  const { getVaultKey, profile } = useVault()
  const isMs = profile?.second_factor === 'microsoft'
  const [value, setValue] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  // fluxo crítico
  const [ask, setAsk] = useState<null | 'reveal' | 'copy'>(null)
  const [justification, setJustification] = useState('')
  const [totp, setTotp] = useState('')

  const applyPlain = async (data: string, vaultId: number): Promise<string | null> => {
    const key = getVaultKey(vaultId)
    if (!key) { toast.error('Cofre travado ou sem acesso à chave deste cliente.'); return null }
    const plain = await aesGcmDecryptString(key, data)
    setValue(plain)
    return plain
  }

  /** Reveal simples (não-crítico ou já cacheado). */
  const doFetch = async (action: 'reveal' | 'copy'): Promise<string | null> => {
    if (value !== null) return value
    const res = await api.post<{ data: string; vault_id: number }>(`/environments/secrets/${secretId}/reveal`, { action })
    return applyPlain(res.data, res.vault_id)
  }

  const afterGet = async (action: 'reveal' | 'copy', v: string | null) => {
    if (v === null) return
    if (action === 'reveal') { setShown(true); return }
    await navigator.clipboard.writeText(v)
    toast.success('Copiado — o clipboard será limpo em 30s.')
    window.setTimeout(() => {
      if (document.hasFocus()) navigator.clipboard.readText?.().then(cur => { if (cur === v) void navigator.clipboard.writeText('') }).catch(() => {})
    }, CLIPBOARD_CLEAR_MS)
  }

  const start = async (action: 'reveal' | 'copy') => {
    if (action === 'reveal' && shown) { setShown(false); return }
    if (value !== null) { await afterGet(action, value); return } // já revelado nesta sessão
    if (critical) { setAsk(action); setJustification(''); setTotp(''); return }
    setBusy(true)
    try { await afterGet(action, await doFetch(action)) }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao revelar.') }
    finally { setBusy(false) }
  }

  /** Confirmação do fluxo crítico: justificativa + step-up. */
  const confirmCritical = async () => {
    if (!ask) return
    if (justification.trim().length < 10) { toast.error('Justificativa de no mínimo 10 caracteres.'); return }
    setBusy(true)
    try {
      if (isMs) await requestMicrosoftStepUp() // popup grava o step-up server-side
      const body: Record<string, unknown> = { action: ask, justification: justification.trim() }
      if (!isMs) body.totp_code = totp
      const res = await api.post<{ data: string; vault_id: number }>(`/environments/secrets/${secretId}/reveal`, body)
      const plain = await applyPlain(res.data, res.vault_id)
      await afterGet(ask, plain)
      setAsk(null)
    } catch (err) {
      if (err instanceof StepUpCancelled) toast.info('Verificação Microsoft cancelada.')
      else toast.error(err instanceof ApiError ? err.message : 'Falha ao revelar item crítico.')
    } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {critical && <ShieldAlert className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />}
      <span className="font-mono text-sm select-all" style={{ color: 'var(--text)' }}>
        {shown && value !== null ? value : '••••••••'}
      </span>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title={shown ? 'Esconder' : 'Revelar'} onClick={() => start('reveal')} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Copiar" onClick={() => start('copy')} disabled={busy}>
        <Copy className="w-4 h-4" />
      </button>

      <Modal open={ask !== null} onClose={() => { setAsk(null); setBusy(false) }} title="Item crítico — justifique o acesso">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Este segredo é crítico. O acesso exige justificativa e verificação de 2º fator — tudo auditado.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Justificativa</label>
            <textarea className="ds-input w-full min-h-[70px]" placeholder="Motivo do acesso (ex.: atendimento chamado #1234)" value={justification} onChange={e => setJustification(e.target.value)} />
          </div>
          {!isMs && (
            <TextInput label="Código do autenticador" inputMode="numeric" placeholder="000000" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} />
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAsk(null)}>Cancelar</Button>
            <Button variant="danger" loading={busy} disabled={justification.trim().length < 10 || (!isMs && totp.length < 6)} onClick={confirmCritical}>
              {isMs ? 'Verificar com Microsoft e revelar' : 'Revelar'}
            </Button>
          </div>
        </div>
      </Modal>
    </span>
  )
}
