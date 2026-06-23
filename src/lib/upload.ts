// Upload de arquivos DIRETO no backend, contornando o limite de body (~4.5MB) da
// borda da Vercel — o caminho /api/v1 passa por middleware (edge) + rewrite e barra
// arquivos grandes ANTES de chegar no Laravel (que aceita 20MB). O backend é
// acessível pelo browser (api.minutor.com.br) e o CORS já libera o app + credenciais.
//
// Diferença crítica vs. o fetch antigo: ESTE checa a resposta e LANÇA em falha —
// nunca falha em silêncio (era a causa do "anexo some sem erro").

async function getCreds(): Promise<{ token: string; apiBase: string }> {
  const res = await fetch('/api/upload-credentials', { credentials: 'same-origin' })
  if (!res.ok) {
    throw new Error('Sessão expirada — entre novamente para anexar arquivos.')
  }
  return res.json()
}

/**
 * POST multipart direto no backend. `path` começa com '/' (ex.: '/contracts/5/attachments').
 * Retorna o JSON da resposta. LANÇA Error com mensagem amigável em qualquer falha.
 */
export async function uploadDirect<T = any>(path: string, fd: FormData): Promise<T> {
  const { token, apiBase } = await getCreds()

  let res: Response
  try {
    res = await fetch(`${apiBase}/api/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: fd,
    })
  } catch {
    throw new Error('Falha de rede ao enviar o anexo. Tente novamente.')
  }

  if (!res.ok) {
    let msg = `Falha ao enviar anexo (HTTP ${res.status}).`
    if (res.status === 413) msg = 'Arquivo muito grande para o servidor (limite 20MB).'
    else {
      try { const j = await res.json(); if (j?.message) msg = j.message } catch { /* ignore */ }
    }
    throw new Error(msg)
  }

  return res.json().catch(() => ({} as T))
}

/** Download autenticado DIRETO no backend (mesma origem/credencial dos uploads). Retorna o Blob. */
export async function downloadDirect(path: string): Promise<Blob> {
  const { token, apiBase } = await getCreds()
  const res = await fetch(`${apiBase}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Falha ao baixar arquivo (HTTP ${res.status}).`)
  return res.blob()
}
