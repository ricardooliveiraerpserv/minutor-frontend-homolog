'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Search, TrendingUp, X, CalendarClock, CheckCircle, Mail } from 'lucide-react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'

interface Preview {
  indice: string
  percentual: number
  percentual_total?: number
  meses_utilizados: number
  valor_atual: number
  valor_novo: number
  cliente_emails?: string[]
  periodo_inicio: string
  periodo_fim: string
  periodo_formatado: string
  periodo: { inicio: string; fim: string; label: string }
}

export interface ReajusteTarget {
  id: number
  label: string
  periodo?: { inicio: string; fim: string; label: string } | null
  manual?: boolean
}

const brl = (v: number | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Lin({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={accent ? 'font-bold' : 'font-medium'} style={{ color: accent ? 'var(--primary)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}

/**
 * Modal de reajuste sob demanda (2 passos):
 *  1) escolhe índice → busca acumulado no BCB p/ o período explícito → aplica (manual);
 *  2) após aplicar, comunica o cliente por e-mail (opcional, com revisão do destinatário).
 */
export function ReajusteModal({ target, onClose, onApplied }: {
  target: ReajusteTarget
  onClose: () => void
  onApplied?: () => void
}) {
  const [idx, setIdx] = useState<'IGPM' | 'IPCA'>('IGPM')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  // Passo 2 — comunicação ao cliente após aplicar.
  const [aplicado, setAplicado] = useState<{ valorAtual: number; valorNovo: number } | null>(null)
  const [emails, setEmails] = useState<string[]>([])
  const [novoEmail, setNovoEmail] = useState('')
  const [salvar, setSalvar] = useState(true)
  const [comunicando, setComunicando] = useState(false)
  // Renovar sem reajuste: só avança o vencimento +1 ano (não mexe no valor).
  const [renovando, setRenovando] = useState(false)
  // Prévia + corpo editável do e-mail.
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [emailMensagem, setEmailMensagem] = useState('')
  const [mensagemSeeded, setMensagemSeeded] = useState(false)

  // Base dos endpoints: contrato vs inclusão manual (sem contrato).
  const base = target.manual ? `/contracts/reajustes/manual/${target.id}` : `/contracts/${target.id}`

  const addEmail = () => {
    const e = novoEmail.trim().toLowerCase()
    if (!e) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    if (emails.includes(e)) { setNovoEmail(''); return }
    setEmails(prev => [...prev, e])
    setNovoEmail('')
  }
  const removeEmail = (e: string) => setEmails(prev => prev.filter(x => x !== e))

  const busy = aplicando || comunicando || renovando
  const close = () => { if (!busy) onClose() }

  const buscarIndice = async () => {
    setBuscando(true)
    setPreview(null)
    try {
      const res = await api.get<Preview>(`${base}/adjustment-preview?index_type=${idx}`)
      setPreview(res)
      setEmails(res.cliente_emails ?? [])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao buscar o índice no Banco Central')
    } finally {
      setBuscando(false)
    }
  }

  const aplicarReajuste = async () => {
    if (!preview) return
    setAplicando(true)
    try {
      await api.post(`${base}/apply-adjustment`, {
        indice: preview.indice,
        percentual: preview.percentual_total ?? preview.percentual,
        periodo_inicio: preview.periodo_inicio ?? preview.periodo.inicio,
        periodo_fim: preview.periodo_fim ?? preview.periodo.fim,
      })
      toast.success(`Reajuste aplicado: ${brl(preview.valor_atual)} → ${brl(preview.valor_novo)} (+${preview.percentual}%)`)
      setAplicado({ valorAtual: preview.valor_atual, valorNovo: preview.valor_novo })
      onApplied?.() // recarrega a tela por trás; o modal segue no passo "comunicar cliente"
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aplicar o reajuste')
    } finally {
      setAplicando(false)
    }
  }

  // Renova o contrato por +1 ano sem aplicar reajuste (só avança o vencimento).
  const renovarSemReajuste = async () => {
    setRenovando(true)
    try {
      await api.post(`/contracts/${target.id}/renew-no-adjustment`, {})
      toast.success('Contrato renovado por +1 ano (sem reajuste)')
      onApplied?.()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao renovar o contrato')
    } finally {
      setRenovando(false)
    }
  }

  const comunicarCliente = async () => {
    if (!emails.length) { toast.error('Informe ao menos um e-mail'); return }
    setComunicando(true)
    try {
      const res = await api.post<{ emails: string[] }>(`${base}/notify-client-adjustment`,
        { emails, salvar, mensagem: mensagemSeeded ? emailMensagem : undefined })
      toast.success(`Comunicado enviado (${res.emails.length} destinatário${res.emails.length !== 1 ? 's' : ''})${salvar ? ' · e-mails salvos' : ''}`)
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar o comunicado')
    } finally {
      setComunicando(false)
    }
  }

  const verPrevia = async () => {
    setPreviewLoading(true)
    try {
      const q = mensagemSeeded ? `?mensagem=${encodeURIComponent(emailMensagem)}` : ''
      const res = await api.get<{ subject: string; html: string; mensagem_padrao?: string }>(`${base}/adjustment-email-preview${q}`)
      setEmailPreview({ subject: res.subject, html: res.html })
      // Primeira prévia: semeia o editor com o texto padrão do corpo.
      if (!mensagemSeeded) { setEmailMensagem(res.mensagem_padrao ?? ''); setMensagemSeeded(true) }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar a prévia do e-mail')
    } finally {
      setPreviewLoading(false)
    }
  }

  const periodoLabel = preview?.periodo_formatado ?? target.periodo?.label ?? '—'
  const st = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <Modal open onClose={close} size="md" closeOnOverlay={!busy} closeOnEscape={!busy}>
      <ModalHeader icon={TrendingUp} title="Reajuste de contrato" subtitle={target.label} onClose={close} />
      <ModalBody>
        {!aplicado ? (
          <div className="space-y-4">
            {/* Índice */}
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Índice</label>
              <div className="flex gap-2 mt-1.5">
                {(['IGPM', 'IPCA'] as const).map(opt => (
                  <button key={opt} onClick={() => { setIdx(opt); setPreview(null) }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: idx === opt ? 'var(--primary-soft)' : 'var(--surface)', border: `1px solid ${idx === opt ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text)' }}>
                    {opt === 'IGPM' ? 'IGP-M' : 'IPCA'}
                  </button>
                ))}
              </div>
            </div>

            {/* Período de cálculo (explícito, read-only) */}
            <div className="rounded-lg px-3 py-2.5" style={st}>
              <div className="flex items-center gap-2 text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                <CalendarClock size={14} /> Período de cálculo
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{periodoLabel}</div>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                Do último reajuste (ou assinatura) até o último mês fechado.
              </p>
            </div>

            <button onClick={buscarIndice} disabled={buscando}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <Search size={15} /> {buscando ? 'Consultando Banco Central…' : 'Buscar índice'}
            </button>

            {preview && (
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Reajuste encontrado</p>
                <Lin label="Índice" value={preview.indice === 'IGPM' ? 'IGP-M' : 'IPCA'} />
                <Lin label="Período" value={`${periodoLabel} (${preview.meses_utilizados} meses)`} />
                <Lin label="Percentual" value={`+${preview.percentual}%`} accent />
                <div className="h-px my-1.5" style={{ background: 'var(--border)' }} />
                <Lin label="Valor atual" value={brl(preview.valor_atual)} />
                <Lin label="Novo valor" value={brl(preview.valor_novo)} accent />
              </div>
            )}
          </div>
        ) : (
          /* Passo 2 — reajuste aplicado + comunicar cliente */
          <div className="space-y-4">
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--success-bg)', border: '1px solid var(--success)' }}>
              <CheckCircle size={22} style={{ color: 'var(--success)' }} className="shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Reajuste aplicado</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{brl(aplicado.valorAtual)} → <b style={{ color: 'var(--success)' }}>{brl(aplicado.valorNovo)}</b></div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                <Mail size={14} /> Comunicar o cliente — e-mails de destino
              </label>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {emails.map(e => (
                    <span key={e} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                      {e}
                      <button onClick={() => removeEmail(e)} title="Remover" style={{ color: 'var(--success)', lineHeight: 0 }}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                  placeholder="adicionar e-mail…" className="flex-1 rounded-lg px-3 py-2 text-sm" style={st} />
                <button onClick={addEmail} className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  Adicionar
                </button>
              </div>
              <label className="flex items-start gap-2 mt-2.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={salvar} onChange={e => setSalvar(e.target.checked)} className="mt-0.5" />
                <span>Salvar estes e-mails {target.manual ? 'nesta inclusão manual' : 'no cadastro do cliente'} para os próximos reajustes. <b>Desmarque para envio avulso</b> (não salva).</span>
              </label>

              {/* Prévia do e-mail */}
              <div className="mt-3">
                <button onClick={verPrevia} disabled={previewLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <Mail size={14} /> {previewLoading ? 'Gerando prévia…' : (emailPreview ? 'Atualizar prévia' : 'Prévia do e-mail')}
                </button>
                {mensagemSeeded && (
                  <div className="mt-2">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Corpo do e-mail (editável)</label>
                    <textarea value={emailMensagem} onChange={e => setEmailMensagem(e.target.value)} rows={5}
                      className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={{ ...st, resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder="Texto do comunicado…" />
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>
                      Edite o texto e clique em <b>Atualizar prévia</b>. O quadro de valores e a saudação são fixos.
                    </p>
                  </div>
                )}
                {emailPreview && (
                  <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      Assunto: <span style={{ color: 'var(--text)' }}>{emailPreview.subject}</span>
                    </div>
                    <iframe title="Prévia do e-mail" srcDoc={emailPreview.html}
                      style={{ width: '100%', height: 320, border: 'none', background: '#fff' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {!aplicado ? (
          <>
            <button onClick={close} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <X size={15} /> Cancelar
            </button>
            {!target.manual && (
              <button onClick={renovarSemReajuste} disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                title="Não reajustar: apenas avança o vencimento do contrato em +1 ano">
                <CalendarClock size={15} /> {renovando ? 'Renovando…' : 'Renovar sem reajuste (+1 ano)'}
              </button>
            )}
            <button onClick={aplicarReajuste} disabled={!preview || busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
              <TrendingUp size={15} /> {aplicando ? 'Aplicando…' : 'Aplicar reajuste'}
            </button>
          </>
        ) : (
          <>
            <button onClick={close} disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              Concluir sem enviar
            </button>
            <button onClick={comunicarCliente} disabled={busy || !emails.length}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
              <Mail size={15} /> {comunicando ? 'Enviando…' : 'Enviar comunicado'}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  )
}
