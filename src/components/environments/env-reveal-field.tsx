'use client'

// Senha de credencial: mascarada por padrão. O ciphertext SÓ é buscado quando o
// usuário clica em revelar/copiar (POST /reveal enforced no servidor) e decifrado
// no client com a vaultKey do cliente. Nunca vem na listagem.

import { useState } from 'react'
import { Copy, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { aesGcmDecryptString } from '@/lib/vault-crypto'

const CLIPBOARD_CLEAR_MS = 30_000

export function EnvRevealField({ secretId }: { secretId: number }) {
  const { getVaultKey } = useVault()
  const [value, setValue] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchSecret = async (action: 'reveal' | 'copy'): Promise<string | null> => {
    if (value !== null) return value
    const res = await api.post<{ data: string; vault_id: number }>(`/environments/secrets/${secretId}/reveal`, { action })
    const key = getVaultKey(res.vault_id)
    if (!key) { toast.error('Cofre travado ou sem acesso à chave deste cliente.'); return null }
    const plain = await aesGcmDecryptString(key, res.data)
    setValue(plain)
    return plain
  }

  const toggle = async () => {
    if (shown) { setShown(false); return }
    setBusy(true)
    try {
      const v = await fetchSecret('reveal')
      if (v !== null) setShown(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao revelar.')
    } finally { setBusy(false) }
  }

  const copy = async () => {
    setBusy(true)
    try {
      const v = await fetchSecret('copy')
      if (v === null) return
      await navigator.clipboard.writeText(v)
      toast.success('Copiado — o clipboard será limpo em 30s.')
      window.setTimeout(() => {
        if (document.hasFocus()) navigator.clipboard.readText?.().then(cur => { if (cur === v) void navigator.clipboard.writeText('') }).catch(() => {})
      }, CLIPBOARD_CLEAR_MS)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao copiar.')
    } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm select-all" style={{ color: 'var(--text)' }}>
        {shown && value !== null ? value : '••••••••'}
      </span>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title={shown ? 'Esconder' : 'Revelar'} onClick={toggle} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Copiar" onClick={copy} disabled={busy}>
        <Copy className="w-4 h-4" />
      </button>
    </span>
  )
}
