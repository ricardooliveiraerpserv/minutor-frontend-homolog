// Cripto de ARQUIVOS do Cofre de Ambientes (aditiva — não toca vault-crypto.ts).
// O arquivo (.pfx/.ovpn/.ini) é cifrado no navegador com a vaultKey do cliente ANTES
// do upload; sobe como .enc (ciphertext). O servidor nunca vê o conteúdo/chave privada.
// Formato do .enc: [ IV (12 bytes) || ciphertext AES-GCM ].

/** Cifra bytes do arquivo → Blob .enc pronto p/ upload. */
export async function encryptFileToEnc(key: CryptoKey, bytes: ArrayBuffer): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv, 0)
  out.set(ct, 12)
  return new Blob([out as BlobPart], { type: 'application/octet-stream' })
}

/** Decifra os bytes .enc → conteúdo original. Lança se a chave errada (tag GCM). */
export async function decryptEnc(key: CryptoKey, encBytes: ArrayBuffer): Promise<Uint8Array> {
  const buf = new Uint8Array(encBytes)
  const iv = buf.slice(0, 12)
  const ct = buf.slice(12)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource))
}

/** Dispara o download de bytes já decifrados como um arquivo local. */
export function triggerDownload(bytes: Uint8Array, filename: string, mime = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Baixa o ciphertext (.enc) de um anexo, com auth, como ArrayBuffer. */
export async function fetchEncryptedAttachment(attachmentId: number): Promise<ArrayBuffer> {
  const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_token') : null
  const res = await fetch(`/api/v1/attachments/${attachmentId}/download`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(typeof window !== 'undefined' ? { 'X-Screen-Path': window.location.pathname } : {}),
    },
  })
  if (!res.ok) throw new Error(`Falha no download (${res.status})`)
  return res.arrayBuffer()
}
