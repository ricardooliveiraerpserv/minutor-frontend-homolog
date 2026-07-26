'use client'

// Upload/download de arquivo CIFRADO NO CLIENT (.pfx/.ovpn/.ini). Cifra com a vaultKey
// antes de subir (.enc); no download, baixa o ciphertext e decifra localmente.
// O servidor nunca vê o conteúdo em claro.

import { useRef, useState } from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { decryptEnc, encryptFileToEnc, fetchEncryptedAttachment, triggerDownload } from '@/lib/env-file-crypto'

interface Props {
  entityType: 'ENV_CERT_PFX' | 'ENV_VPN_OVPN' | 'ENV_APPSERVER_INI'
  entityId: number
  category: 'pfx' | 'ovpn' | 'ini'
  vaultKey: CryptoKey | undefined
  attachmentId: number | null       // arquivo já enviado (p/ baixar)
  originalName: string              // nome sugerido no download (ex.: cert.pfx)
  label?: string
  onChanged?: () => void
}

export function EnvEncryptedFile({ entityType, entityId, category, vaultKey, attachmentId, originalName, label, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo
    if (!file || !vaultKey) return
    setBusy(true)
    try {
      const enc = await encryptFileToEnc(vaultKey, await file.arrayBuffer())
      const fd = new FormData()
      fd.append('entity_type', entityType)
      fd.append('entity_id', String(entityId))
      fd.append('category', category)
      fd.append('visibility', 'restricted')
      // sobe o ciphertext como .enc; guardo o nome original no metadata
      fd.append('file', new File([enc], `${file.name}.enc`, { type: 'application/octet-stream' }))
      fd.append('metadata[original_name]', file.name)
      await api.post('/attachments', fd)
      toast.success('Arquivo cifrado e enviado.')
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha no upload cifrado.')
    } finally { setBusy(false) }
  }

  const download = async () => {
    if (!attachmentId || !vaultKey) return
    setBusy(true)
    try {
      const encBytes = await fetchEncryptedAttachment(attachmentId)
      const plain = await decryptEnc(vaultKey, encBytes)
      triggerDownload(plain, originalName)
      toast.success('Arquivo decifrado e baixado.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao baixar/decifrar.')
    } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {attachmentId ? (
        <Button size="sm" icon={busy ? undefined : Download} loading={busy} onClick={download}>
          {label ?? 'Baixar'}
        </Button>
      ) : (
        <Button size="sm" icon={busy ? undefined : Upload} loading={busy} disabled={!vaultKey} onClick={() => inputRef.current?.click()}>
          {label ?? 'Enviar arquivo'}
        </Button>
      )}
      {attachmentId && (
        <button type="button" className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }} onClick={() => inputRef.current?.click()} disabled={busy}>
          substituir
        </button>
      )}
      {busy && !attachmentId && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}
      <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
    </span>
  )
}
