// FASE 11.2.FE — Camada FE única de anexos do Minutor.
//
// Espelha o domínio do BE (app/Attachments/). NUNCA chamar /api/v1/attachments
// com ad-hoc — usa-se o hook useAttachments + os componentes shared. Esse
// arquivo é a fonte única dos tipos + helpers de download / signed URL.

import { api, toRelativePath } from '@/lib/api'

// Os 11 entity_types registrados no BE (AttachableEntitiesRegistry::knownTypes).
// String literal para autocomplete + lint nas chamadas; o BE valida via CHECK
// constraint + registry, então uma string fora dessa lista vira 422 — manter
// sincronizado com o registry é responsabilidade conjunta.
export type AttachmentEntityType =
  | 'FOLLOW_UP'
  | 'USER'
  | 'PROJECT'
  | 'CONTRACT'
  | 'EXPENSE'
  | 'TIMESHEET'
  | 'HOUR_CONTRIBUTION'
  | 'STAGE_ACTIVITY_EVENT'
  | 'PROJECT_MESSAGE'
  | 'CONTRACT_MESSAGE'
  | 'REQUEST_MESSAGE'
  | 'FECHAMENTO_NOTA'

export type AttachmentVisibility = 'internal' | 'customer' | 'restricted'

// Payload retornado por GET /api/v1/attachments — espelha
// AttachmentController::present().
export interface Attachment {
  id: number
  entity_type: AttachmentEntityType
  entity_id: number
  category: string
  original_name: string
  mime_type: string
  extension: string
  size_bytes: number
  human_size: string
  visibility: AttachmentVisibility
  uploaded_by: number
  created_at: string | null
  deleted_at: string | null
}

// ─── Helpers de download (substituem fetchAndOpenFile/fetchReceipt) ─────────
//
// Antes da 11.2.FE existiam 5 cópias quase idênticas espalhadas (meu-painel,
// ExpensesScreen, expense-view-modal, approvals, ApprovalsScreen). Tudo deve
// passar por este módulo daqui pra frente.

/**
 * Download autenticado de uma URL legada (ex.: `/storage/receipts/foo.pdf`)
 * e abre em nova aba (download=false) ou força save (download=true).
 *
 * Usado pra endpoints LEGADOS do tipo receipt_url, attachment_url, profile_photo_url.
 * Quando a FASE 11.4 deprecar essas colunas, este helper sai de cena — as
 * telas passam a chamar `downloadAttachment(id)` direto.
 *
 * @param url      URL do arquivo (absoluta ou relativa; passa por toRelativePath)
 * @param download true = força save, false (default) = abre em nova aba
 */
export async function fetchAndOpenLegacyUrl(url: string, download = false): Promise<void> {
  const res = await fetch(toRelativePath(url), { credentials: 'same-origin' })
  if (!res.ok) throw new Error('not_found')
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') ?? ''
  // RFC 5987 (filename*) e fallback simples.
  const matchStar = cd.match(/filename\*=(?:UTF-8'')?"?([^";]+)"?/i)
  const matchSimple = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'pdf'
  const filenameRaw = matchStar?.[1] ?? matchSimple?.[1] ?? `arquivo.${ext}`
  const filename = decodeURIComponent(filenameRaw.replace(/['"]/g, ''))
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  if (download) { a.download = filename } else { a.target = '_blank'; a.rel = 'noopener noreferrer' }
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}

/**
 * Variante que devolve {blobUrl, filename} sem disparar download/abertura.
 * Usado por aprovações pra abrir o blob em dialog/preview controlado.
 */
export async function fetchAsBlob(url: string): Promise<{ blobUrl: string; filename: string }> {
  const res = await fetch(toRelativePath(url), { credentials: 'same-origin' })
  if (!res.ok) throw new Error('not_found')
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') ?? ''
  const matchStar = cd.match(/filename\*=(?:UTF-8'')?"?([^";]+)"?/i)
  const matchSimple = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'pdf'
  const filenameRaw = matchStar?.[1] ?? matchSimple?.[1] ?? `arquivo.${ext}`
  const filename = decodeURIComponent(filenameRaw.replace(/['"]/g, ''))
  return { blobUrl: URL.createObjectURL(blob), filename }
}

/**
 * Faz download autenticado de um anexo via /attachments/{id}/download e abre
 * em nova aba ou força o save dependendo de `download`.
 */
export async function downloadAttachment(id: number, opts: { download?: boolean } = {}): Promise<void> {
  const url = `/api/v1/attachments/${id}/download`
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) {
    throw new Error(`Falha no download (HTTP ${res.status})`)
  }
  // Filename do Content-Disposition (preserva o original_name do BE).
  const cd = res.headers.get('Content-Disposition') ?? ''
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const filename = match ? decodeURIComponent(match[1]) : `anexo_${id}`
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)

  if (opts.download) {
    // Force save.
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } else {
    // Abre inline em nova aba; navegador decide se exibe (PDF/imagem) ou salva.
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
  }

  // Libera o blob após dar tempo do navegador iniciar.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}

/**
 * Obtém uma signed URL com TTL — útil pra anexar em e-mail, gerar link
 * compartilhável temporário, embed em iframe, etc.
 */
export async function getSignedUrl(id: number, ttlSeconds: number = 300): Promise<string> {
  const r = await api.get<{ url: string; ttl_seconds: number }>(`/attachments/${id}/url?ttl=${ttlSeconds}`)
  return r.url
}

// ─── CRUD direto (uso interno do hook; chamadas avulsas devem passar pelo hook) ─

export async function listAttachments(
  entityType: AttachmentEntityType,
  entityId: number,
  category?: string,
): Promise<Attachment[]> {
  const qs = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
  })
  if (category) qs.set('category', category)
  const r = await api.get<{ data: Attachment[] }>(`/attachments?${qs}`)
  return r.data
}

export async function uploadAttachment(input: {
  entityType: AttachmentEntityType
  entityId: number
  category: string
  file: File
  visibility?: AttachmentVisibility
}): Promise<Attachment> {
  const fd = new FormData()
  fd.append('entity_type', input.entityType)
  fd.append('entity_id', String(input.entityId))
  fd.append('category', input.category)
  fd.append('file', input.file, input.file.name)
  if (input.visibility) fd.append('visibility', input.visibility)

  const res = await fetch('/api/v1/attachments', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    body: fd,
  })
  const json = (await res.json().catch(() => ({}))) as { data?: Attachment; message?: string; errors?: Record<string, string[]> }
  if (!res.ok) {
    const firstErr = json.errors
      ? Object.values(json.errors).flat().find(m => typeof m === 'string')
      : undefined
    throw new Error(firstErr || json.message || `Erro ${res.status}`)
  }
  if (!json.data) throw new Error('Resposta inválida do servidor.')
  return json.data
}

export async function deleteAttachment(id: number): Promise<void> {
  await api.delete(`/attachments/${id}`)
}

export async function restoreAttachment(id: number): Promise<Attachment> {
  const r = await api.post<{ data: Attachment }>(`/attachments/${id}/restore`, {})
  return r.data
}
