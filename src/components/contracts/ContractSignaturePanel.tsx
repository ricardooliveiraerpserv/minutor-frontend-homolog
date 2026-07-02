'use client'

// Item 8 — Seção "Assinatura Eletrônica" da tela de contrato.
// Mostra: status operacional × status de assinatura (separados), documento oficial do contrato,
// origem (proposta + versão congelada), anexos (assinado/certificado/evidências) e histórico de eventos.
// A assinatura em si (Clicksign) entra na próxima fase; aqui é a consolidação/visibilidade.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { FileSignature, FileText, Download, ExternalLink, RefreshCw, Send, Plus, Trash2, Copy, CheckSquare, Square, Unlock, Lock, ShieldCheck } from 'lucide-react'

interface Anexo { url: string; size: number; em: string | null; versao: number }
interface ChecklistItem { item_key: string; label: string; obrigatorio: boolean; aplicavel: boolean; checked: boolean; checked_by: string | null; checked_at: string | null; auto: boolean }
interface Signer { name: string; email: string | null; sign_order: number; status: string; sign_url: string | null }
interface SigData {
  status_operacional: string
  status_assinatura: string
  status_assinatura_label: string
  clicksign_enabled: boolean
  clicksign_ambiente: string
  pode_enviar: boolean
  envelope_ativo: { id: number; status: string; environment: string; motivo_envio: string; sent_at: string | null; signers: Signer[] } | null
  documento: { id: number; versao: number; gerado_em: string | null; assinado_em: string | null; download_url: string } | null
  anexos: { assinado: Anexo | null; certificado: Anexo | null; evidencias: Anexo | null }
  captura: { status: string; em: string | null; erro: string | null } | null
  checklist: ChecklistItem[]
  pode_liberar: boolean
  liberacao: { liberado_por: string | null; liberado_em: string | null; observacao: string | null } | null
  bloqueio: { bloqueado_por: string | null; bloqueado_em: string | null; motivo: string | null } | null
  origem: { codigo: string; versao: number; proposal_document_hash: string | null; proposta_url: string; proposal_document_download: string | null } | null
  eventos: { tipo: string; em: string | null }[]
}
interface SignerForm { name: string; email: string; documentation: string; sign_order: number }

const SIG_COLOR: Record<string, string> = {
  nao_enviado: '#94A3B8', enviado: '#0E7490', assinatura_pendente: '#D97706',
  parcialmente_assinado: '#D97706', assinado: '#16A34A', recusado: '#DC2626',
  cancelado: '#94A3B8', expirado: '#DC2626',
}
const EV_LABEL: Record<string, string> = {
  criado: '📄 Documento gerado', regenerado: '♻️ Documento regerado', baixado: '⬇ Baixado',
  assinatura_solicitada: '✉️ Enviado para assinatura', assinatura_iniciada: '✍️ Assinatura iniciada',
  assinatura_parcial: '◐ Parcialmente assinado', assinatura_concluida: '✅ Assinatura concluída',
  assinatura_recusada: '✗ Assinatura recusada', assinatura_cancelada: '⊘ Assinatura cancelada',
  assinatura_expirada: '⏰ Assinatura expirada',
}
const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtSize = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`
const apiFile = (url?: string | null) => url ? `/api/v1${url}` : '#'

export function ContractSignaturePanel({ contractId }: { contractId: number }) {
  const router = useRouter()
  const [d, setD] = useState<SigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [signers, setSigners] = useState<SignerForm[]>([{ name: '', email: '', documentation: '', sign_order: 1 }])

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: SigData }>(`/contracts/${contractId}/assinatura`).then(r => setD(r?.data ?? null)).catch(() => setD(null)).finally(() => setLoading(false))
  }, [contractId])
  useEffect(() => { load() }, [load])
  // Auto-atualiza enquanto aberto (reflete eventos de webhook sem acessar a Clicksign).
  useEffect(() => { const t = setInterval(() => load(), 12000); return () => clearInterval(t) }, [load])

  const gerar = async () => {
    setBusy(true)
    try { await api.post(`/contracts/${contractId}/gerar-documento`, {}); toast.success('Documento do contrato gerado'); load() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao gerar o documento') } finally { setBusy(false) }
  }
  const copy = (t: string) => { navigator.clipboard.writeText(t).then(() => toast.success('Link copiado')).catch(() => toast.error('Não foi possível copiar')) }
  const setSigner = (i: number, patch: Partial<SignerForm>) => setSigners(s => s.map((x, j) => j === i ? { ...x, ...patch } : x))
  const addSigner = () => setSigners(s => [...s, { name: '', email: '', documentation: '', sign_order: s.length + 1 }])
  const rmSigner = (i: number) => setSigners(s => s.filter((_, j) => j !== i).map((x, k) => ({ ...x, sign_order: k + 1 })))
  const marcarItem = async (item_key: string, checked: boolean) => {
    try { await api.post(`/contracts/${contractId}/checklist`, { item_key, checked }); load() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao marcar item') }
  }
  const liberar = async () => {
    const obs = window.prompt('Observação da liberação (opcional):') ?? ''
    setBusy(true)
    try { await api.post(`/contracts/${contractId}/liberar`, { observacao: obs }); toast.success('Contrato liberado para execução'); load() }
    catch (e: any) { toast.error(e?.message ?? 'Falha ao liberar') } finally { setBusy(false) }
  }
  const bloquear = async () => {
    const motivo = window.prompt('Motivo do bloqueio operacional:')
    if (!motivo?.trim()) return
    try { await api.post(`/contracts/${contractId}/bloquear`, { motivo: motivo.trim() }); toast.success('Contrato bloqueado'); load() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao bloquear') }
  }
  const desbloquear = async () => {
    if (!window.confirm('Remover o bloqueio operacional?')) return
    try { await api.post(`/contracts/${contractId}/desbloquear`, {}); toast.success('Bloqueio removido'); load() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao desbloquear') }
  }
  const enviar = async () => {
    const valid = signers.filter(s => s.name.trim())
    if (!valid.length) { toast.error('Informe ao menos um signatário com nome'); return }
    setSending(true)
    try {
      const r = await api.post<{ data: { stub: boolean; environment: string } }>(`/contracts/${contractId}/assinatura/enviar`, {
        signers: valid.map(s => ({ name: s.name.trim(), email: s.email.trim() || null, documentation: s.documentation.trim() || null, sign_order: s.sign_order, action: 'sign', auth: 'email' })),
      })
      toast.success(r?.data?.stub ? 'Envelope criado (modo simulação — Clicksign não configurado)' : 'Enviado para assinatura')
      load()
    } catch (e: any) { toast.error(e?.message ?? 'Falha ao enviar para assinatura') } finally { setSending(false) }
  }

  const lbl = 'text-[10px] font-semibold uppercase tracking-wider'
  const sigColor = d ? (SIG_COLOR[d.status_assinatura] ?? '#94A3B8') : '#94A3B8'

  return (
    <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className={lbl} style={{ color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileSignature size={12} /> Assinatura Eletrônica
        </p>
        <button onClick={load} title="Atualizar" className="p-1" style={{ color: 'var(--text-light)' }}><RefreshCw size={12} /></button>
      </div>

      {loading ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : !d ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>—</p> : (
        <div className="space-y-3">
          {/* Status: operacional × jurídico (separados) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className={lbl} style={{ color: 'var(--text-light)' }}>Operacional (contrato)</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{(d.status_operacional ?? '—').replace(/_/g, ' ')}</p>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: `1px solid ${sigColor}55` }}>
              <p className={lbl} style={{ color: 'var(--text-light)' }}>Assinatura (documento)</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: sigColor }}>{d.status_assinatura_label}</p>
            </div>
          </div>

          {/* Documento oficial do contrato */}
          <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            {d.documento ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} style={{ color: 'var(--primary)' }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>Documento do contrato · v{d.documento.versao}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>gerado {fmt(d.documento.gerado_em)}{d.documento.assinado_em ? ` · assinado ${fmt(d.documento.assinado_em)}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={apiFile(d.documento.download_url)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text)' }} title="Baixar"><Download size={13} /></a>
                  <button onClick={gerar} disabled={busy} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>{busy ? '…' : 'Regerar'}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Documento oficial ainda não gerado.</p>
                <button onClick={gerar} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{busy ? 'Gerando…' : 'Gerar Documento'}</button>
              </div>
            )}
          </div>

          {/* Enviar para Assinatura (Fase 4.2) */}
          {d.envelope_ativo ? (
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--primary)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Envelope ativo</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: d.envelope_ativo.environment === 'production' ? 'var(--success-bg)' : 'var(--warning-bg)', color: d.envelope_ativo.environment === 'production' ? 'var(--success)' : 'var(--warning)' }}>{d.envelope_ativo.environment === 'production' ? 'PRODUÇÃO' : 'SANDBOX'}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text)' }}>{d.envelope_ativo.status} · enviado {fmt(d.envelope_ativo.sent_at)}</p>
              <div className="mt-1.5 space-y-1">
                {d.envelope_ativo.signers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-center font-bold" style={{ color: 'var(--text-light)' }}>{s.sign_order}</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{s.name}{s.email ? <span style={{ color: 'var(--text-muted)' }}> · {s.email}</span> : null}</span>
                    <span className="text-[10px]" style={{ color: s.status === 'signed' ? 'var(--success)' : 'var(--text-muted)' }}>{s.status}</span>
                    {s.sign_url && <button onClick={() => copy(s.sign_url!)} title="Copiar link de assinatura" style={{ color: 'var(--text-light)' }}><Copy size={12} /></button>}
                  </div>
                ))}
              </div>
            </div>
          ) : d.pode_enviar ? (
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><Send size={11} /> Enviar para Assinatura</span>
                {!d.clicksign_enabled && <span className="text-[9px]" style={{ color: 'var(--warning)' }}>Clicksign não configurado (simulação)</span>}
              </div>
              <div className="space-y-2">
                {signers.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-4 text-center text-xs font-bold" style={{ color: 'var(--text-light)' }}>{s.sign_order}</span>
                    <input value={s.name} onChange={e => setSigner(i, { name: e.target.value })} placeholder="Nome" className="flex-1 text-xs rounded px-2 py-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <input value={s.email} onChange={e => setSigner(i, { email: e.target.value })} placeholder="E-mail" className="flex-1 text-xs rounded px-2 py-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <input value={s.documentation} onChange={e => setSigner(i, { documentation: e.target.value })} placeholder="CPF" className="w-24 text-xs rounded px-2 py-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    {signers.length > 1 && <button onClick={() => rmSigner(i)} style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <button onClick={addSigner} className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}><Plus size={12} /> Signatário</button>
                <button onClick={enviar} disabled={sending} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Send size={12} />{sending ? 'Enviando…' : 'Enviar para Assinatura'}</button>
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-light)' }}>A ordem (1, 2, 3…) define a assinatura sequencial.</p>
            </div>
          ) : null}

          {/* Origem (proposta + versão congelada) */}
          {d.origem && (
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className={lbl} style={{ color: 'var(--text-light)' }}>Origem</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-xs" style={{ color: 'var(--text)' }}>
                  Proposta <b>{d.origem.codigo}</b> V{d.origem.versao}{d.origem.proposal_document_hash ? <span style={{ color: 'var(--text-muted)' }}> · doc {d.origem.proposal_document_hash}</span> : null}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  {d.origem.proposal_document_download && <a href={apiFile(d.origem.proposal_document_download)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text)' }} title="PDF da proposta"><Download size={13} /></a>}
                  <button onClick={() => router.push(d.origem!.proposta_url)} className="p-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text)' }} title="Abrir proposta"><ExternalLink size={13} /></button>
                </div>
              </div>
            </div>
          )}

          {/* Downloads (artefatos jurídicos capturados) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Downloads</p>
              {d.captura && <span className="text-[10px]" style={{ color: d.captura.status === 'concluido' ? 'var(--success)' : d.captura.status === 'falha' ? 'var(--danger)' : 'var(--warning)' }}>
                {d.captura.status === 'concluido' ? `capturado ${fmt(d.captura.em)}` : d.captura.status === 'falha' ? 'captura falhou — retry' : 'capturando…'}
              </span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['PDF Assinado', d.anexos.assinado], ['Certificado', d.anexos.certificado], ['Evidências', d.anexos.evidencias]] as const).map(([label, a]) => (
                <a key={label} href={a ? apiFile(a.url) : undefined} target="_blank" rel="noreferrer"
                  className="rounded-lg px-2 py-2 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)', opacity: a ? 1 : 0.5, pointerEvents: a ? 'auto' : 'none' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{label}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: a ? 'var(--primary)' : 'var(--text-muted)' }}>{a ? 'Baixar' : '—'}</p>
                  {a && <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{fmtSize(a.size)} · v{a.versao}</p>}
                </a>
              ))}
            </div>
          </div>

          {/* Checklist de Liberação (Fase 4.5) */}
          {d.checklist.length > 0 && (
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}><ShieldCheck size={11} /> Checklist de Liberação</p>
              <div className="space-y-1">
                {d.checklist.map(it => (
                  <div key={it.item_key} className="flex items-center gap-2 text-xs">
                    <button onClick={() => !it.auto && !d.liberacao && marcarItem(it.item_key, !it.checked)} disabled={it.auto || !!d.liberacao}
                      style={{ color: it.checked ? 'var(--success)' : 'var(--text-light)', cursor: (it.auto || d.liberacao) ? 'default' : 'pointer' }}>
                      {it.checked ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                    <span className="flex-1" style={{ color: 'var(--text)' }}>
                      {it.label}{it.obrigatorio && <span style={{ color: 'var(--danger)' }}> *</span>}{it.auto && <span style={{ color: 'var(--text-muted)' }}> (auto)</span>}
                    </span>
                    {it.checked && it.checked_by && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{it.checked_by} · {fmt(it.checked_at)}</span>}
                  </div>
                ))}
              </div>

              {/* Liberação */}
              {d.liberacao ? (
                <div className="mt-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                  ✓ Liberado para execução por <b>{d.liberacao.liberado_por}</b> em {fmt(d.liberacao.liberado_em)}{d.liberacao.observacao ? ` · ${d.liberacao.observacao}` : ''}
                </div>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>* itens obrigatórios</span>
                  <button onClick={liberar} disabled={busy || !d.pode_liberar} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: 'var(--success)', color: '#fff' }} title={d.pode_liberar ? 'Liberar' : 'Conclua os itens obrigatórios'}>
                    <Unlock size={12} />{busy ? '…' : 'Liberar para Execução'}
                  </button>
                </div>
              )}

              {/* Bloqueio operacional (HOLD reversível — não altera o status) */}
              {d.bloqueio ? (
                <div className="mt-2 rounded-lg px-2.5 py-1.5 flex items-center justify-between" style={{ background: 'var(--danger-bg)' }}>
                  <span className="text-xs" style={{ color: 'var(--danger)' }}><Lock size={11} className="inline mr-1" /><b>Bloqueado</b> por {d.bloqueio.bloqueado_por}: {d.bloqueio.motivo}</span>
                  <button onClick={desbloquear} className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>Desbloquear</button>
                </div>
              ) : (
                <button onClick={bloquear} className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}><Lock size={11} /> Bloquear operacionalmente</button>
              )}
            </div>
          )}

          {/* Histórico jurídico */}
          {d.eventos.length > 0 && (
            <div>
              <p className={lbl} style={{ color: 'var(--text-light)', marginBottom: 4 }}>Histórico</p>
              <div className="space-y-1">
                {d.eventos.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0" style={{ color: 'var(--text-light)' }}>{fmt(ev.em)}</span>
                    <span style={{ color: 'var(--text)' }}>{EV_LABEL[ev.tipo] ?? ev.tipo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>A assinatura eletrônica (Clicksign) será habilitada na próxima fase, atuando sobre este documento.</p>
        </div>
      )}
    </div>
  )
}
