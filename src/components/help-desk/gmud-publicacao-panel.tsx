'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { Table, Thead, Tbody, Tr, Th, Td, Badge } from '@/components/ds'
import { toast } from 'sonner'
import { UploadCloud, RefreshCw, FileCode, ExternalLink, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * GMUD — Publicação Governada de Fontes (wizard) · G0-G2.
 * Recebe o ZIP (RECEBIMENTO/evidência), mostra o manifesto e o resultado do matching determinístico.
 * NÃO publica nada no Git: a publicação é uma etapa POSTERIOR, ainda em construção (G7). O envio de
 * um ZIP jamais gera commit — a garantia é reforçada visualmente no rodapé do painel.
 */

type MatchStatus = 'existing' | 'new' | 'ambiguous' | 'identical' | null

type PackageFile = {
  id: number
  path_in_zip: string
  filename: string
  extension: string | null
  size_bytes: number
  sha256: string | null
  git_blob_sha: string | null
  mtime: string | null
  is_source: boolean
  match_status: MatchStatus
  matched_source_doc_id: number | null
  matched_git_path: string | null
  match_candidates: Array<{ path: string; blob_sha: string; source_doc_id: number | null }> | null
  match_evidence: Record<string, unknown> | null
}

type Manifest = {
  id: number
  ticket_id: number
  customer_id: number | null
  original_name: string
  size_bytes: number
  sha256: string | null
  status: string
  error: string | null
  uploaded_by_name: string | null
  received_at: string | null
  files_count: number
  committed: boolean
}

type PackageDetail = Manifest & { files: PackageFile[] }

const MATCH_META: Record<Exclude<MatchStatus, null> | 'unknown', { label: string; variant: string }> = {
  existing:  { label: 'Existente (alterado)', variant: 'warning' },
  new:       { label: 'Novo',                 variant: 'primary' },
  identical: { label: 'Idêntico',             variant: 'default' },
  ambiguous: { label: 'Ambíguo',              variant: 'danger' },
  unknown:   { label: '—',                    variant: 'default' },
}

const IN_PROGRESS = new Set(['received', 'extracting', 'analyzing'])

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmt(dt: string | null): string {
  if (!dt) return '—'
  const d = new Date(dt)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function GmudPublicacaoPanel({ ticketId, customerId, gmudActive = true }: { ticketId: number; customerId?: number | null; gmudActive?: boolean }) {
  const [packages, setPackages] = useState<Manifest[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadList = useCallback(async () => {
    try {
      const res = await api.get<{ data: Manifest[] }>(`/help-desk/tickets/${ticketId}/gmud/packages`)
      setPackages(res.data)
      if (res.data.length && openId === null) setOpenId(res.data[0].id)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) { setForbidden(true); return }
      setPackages([])
    }
  }, [ticketId, openId])

  useEffect(() => { void loadList() }, [loadList])

  const onUpload = async (file: File) => {
    if (!/\.zip$/i.test(file.name)) { toast.error('Envie um arquivo .zip'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<{ data: Manifest }>(`/help-desk/tickets/${ticketId}/gmud/packages`, fd)
      toast.success('Pacote recebido — analisando (nenhum commit é feito).')
      setOpenId(res.data.id)
      await loadList()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Falha ao enviar o pacote')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (forbidden) return null
  // Fora de um chamado GMUD e sem nenhum pacote recebido → não polui o chamado.
  if (!gmudActive && (!packages || packages.length === 0)) return null

  return (
    <div className="ds-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FileCode size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Publicação de Fontes (GMUD)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadList()}
            className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            title="Atualizar"
          ><RefreshCw size={13} /></button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="ds-btn-primary inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-60"
          >
            <UploadCloud size={14} /> {uploading ? 'Enviando…' : 'Enviar ZIP'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f) }}
          />
        </div>
      </div>

      {packages === null ? (
        <div className="text-xs" style={{ color: 'var(--text-light)' }}>Carregando…</div>
      ) : packages.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--text-light)' }}>
          Nenhum pacote recebido. Envie o ZIP da GMUD para extrair, conferir e casar os fontes com o acervo — sem publicar nada.
        </div>
      ) : (
        <div className="space-y-2">
          {packages.map((p) => (
            <PackageRow
              key={p.id}
              manifest={p}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
              customerId={customerId ?? p.customer_id}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
        <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
        <span>O envio do ZIP <b>não publica nada</b> no Git — é apenas recebimento e análise. A publicação é uma etapa posterior, governada e com aceite explícito (em construção).</span>
      </div>
    </div>
  )
}

function PackageRow({ manifest, open, onToggle, customerId }: { manifest: Manifest; open: boolean; onToggle: () => void; customerId: number | null }) {
  const [detail, setDetail] = useState<PackageDetail | null>(null)
  const [status, setStatus] = useState(manifest.status)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: PackageDetail }>(`/gmud/packages/${manifest.id}`)
      setDetail(res.data)
      setStatus(res.data.status)
      return res.data.status
    } catch {
      return null
    }
  }, [manifest.id])

  // Enquanto aberto e ainda processando, faz polling (o worker source-doc conclui em segundo plano).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const tick = async () => {
      const st = await load()
      if (cancelled) return
      if (st && IN_PROGRESS.has(st)) pollRef.current = setTimeout(tick, 2500)
    }
    void tick()
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [open, load])

  const files = detail?.files ?? []

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        {open ? <ChevronDown size={14} style={{ color: 'var(--text-light)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-light)' }} />}
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{manifest.original_name}</span>
        <PackageStatusBadge status={status} />
        <span className="ml-auto text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{human(manifest.size_bytes)} · {fmt(manifest.received_at)}</span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>Enviado por: <b style={{ color: 'var(--text)' }}>{manifest.uploaded_by_name ?? '—'}</b></span>
            <span>Arquivos: <b style={{ color: 'var(--text)' }}>{manifest.files_count}</b></span>
            <span className="col-span-2 font-mono break-all">SHA-256: {manifest.sha256 ?? '—'}</span>
          </div>

          {status === 'failed' && (
            <div className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              Falha na análise: {manifest.error ?? detail?.error ?? 'erro'}
            </div>
          )}

          {IN_PROGRESS.has(status) ? (
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Extraindo e casando fontes… atualiza automaticamente.</div>
          ) : files.length === 0 ? (
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum fonte reconhecido no pacote.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr><Th>Arquivo</Th><Th>Data original</Th><Th>Situação</Th><Th>Git / candidatos</Th><Th></Th></Tr>
                </Thead>
                <Tbody>
                  {files.map((f) => {
                    const meta = MATCH_META[f.match_status ?? 'unknown']
                    return (
                      <Tr key={f.id}>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <FileCode size={12} style={{ color: f.is_source ? 'var(--primary)' : 'var(--text-light)' }} />
                            <span className="font-mono text-xs" title={f.path_in_zip}>{f.filename}</span>
                          </div>
                        </Td>
                        <Td><span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmt(f.mtime)}</span></Td>
                        <Td><Badge variant={meta.variant}>{meta.label}</Badge></Td>
                        <Td>
                          {f.match_status === 'ambiguous' ? (
                            <span className="text-[11px]" style={{ color: 'var(--danger)' }}>{(f.match_candidates?.length ?? 0)} ocorrências — requer decisão</span>
                          ) : f.matched_git_path ? (
                            <span className="font-mono text-[11px] break-all" style={{ color: 'var(--text-muted)' }}>{f.matched_git_path}</span>
                          ) : (
                            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>—</span>
                          )}
                        </Td>
                        <Td>
                          {f.matched_source_doc_id ? (
                            <Link
                              href={`/central-fontes/acervo?${new URLSearchParams({ ...(customerId ? { customer_id: String(customerId) } : {}), doc: String(f.matched_source_doc_id) }).toString()}`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold"
                              style={{ color: 'var(--primary)' }}
                            >
                              <ExternalLink size={11} /> Abrir no Acervo
                            </Link>
                          ) : null}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PackageStatusBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; variant: string }> = {
    received:   { label: 'Recebido',   variant: 'default' },
    extracting: { label: 'Extraindo',  variant: 'primary' },
    analyzing:  { label: 'Analisando', variant: 'primary' },
    analyzed:   { label: 'Analisado',  variant: 'success' },
    failed:     { label: 'Falha',      variant: 'danger' },
  }
  const s = m[status] ?? { label: status, variant: 'default' }
  return <Badge variant={s.variant}>{s.label}</Badge>
}
