'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Upload, Download, Check, X, Eye, KeyRound } from 'lucide-react'

export type DocPayload = {
  has_file: boolean
  original_name: string | null
  status: 'pending' | 'accepted' | 'rejected' | string
  reject_reason: string | null
  decided_by: string | null
  decided_at: string | null
  valor: number | null
  stale_reason?: string | null  // aviso: valor declarado ≠ recebimento atual (não trava nada)
}
export type NotasPayload = {
  nfse: DocPayload
  nota_debito: DocPayload
  upload_liberado: boolean
  liberado_por?: string | null
  liberado_em?: string | null
} | null

const DOCS = [
  { key: 'nfse', label: 'NFS-e' },
] as const

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Converte "1.234,56" (pt-BR) ou "1234.56" para number; NaN se vazio/inválido. */
function parseValor(raw: string): number {
  const s = raw.trim()
  if (!s) return NaN
  // pt-BR: ponto = milhar, vírgula = decimal. Remove milhares, troca vírgula por ponto.
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s
  return Number(normalized)
}

/**
 * Célula de notas fiscais PJ (NFS-e + Nota de débito) na linha do fechamento.
 * `type` = consultor|parceiro. Upload por quem pode (consultor próprio/parceiro/admin);
 * aceite/recusa só admin (`canDecide`). Recusa exige motivo; aceite vira flag "Aceita".
 */
export function NotasPjCell({
  type, id, yearMonth, notas, canDecide, canUpload, expectedValue, selfService = true, onChanged,
}: {
  type: 'consultor' | 'parceiro'
  id: number
  yearMonth: string
  notas: NotasPayload
  canDecide: boolean
  canUpload: boolean
  expectedValue?: number | null
  // Tela do próprio funcionário (consultor/parceiro): mostra a parte de emissão (valor da nota,
  // legenda do valor exato, dados da ERPSERV, Enviar/Substituir). No fechamento admin = false
  // (admin só revisa: visualizar/baixar/aceitar/rejeitar/liberar).
  selfService?: boolean
  onChanged: (n: NotasPayload) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reasonAction, setReasonAction] = useState<'rejected' | 'revoke'>('rejected')
  const [motivo, setMotivo] = useState('')
  // Valor digitado por documento (nfse / nota_debito), enquanto não enviado.
  const [valores, setValores] = useState<Record<string, string>>({})
  const nfseRef = useRef<HTMLInputElement>(null)
  const notaRef = useRef<HTMLInputElement>(null)
  const refFor = (k: string) => (k === 'nfse' ? nfseRef : notaRef)

  // Entidade não-PJ (ou sem bloco de notas): nada a mostrar.
  if (!notas) return <span className="text-[var(--text-muted)]">—</span>

  // Prazo: notas não são aceitas após o dia 15 do mês SEGUINTE à competência
  // (ex: competência 05/2026 → prazo 15/06/2026), salvo liberação do administrativo
  // (upload_liberado). Admin (canDecide) sempre pode enviar.
  const [dlY, dlM] = yearMonth.split('-').map(Number)
  const deadlineDate = new Date(dlY, dlM, 15, 23, 59, 59, 999) // dlM (1-12) como índice 0-based = mês seguinte
  const pastDeadline = new Date() > deadlineDate
  const bloqueado = pastDeadline && !notas.upload_liberado

  async function doUpload(tipo: string, file: File) {
    const valorNum = parseValor(valores[tipo] ?? '')
    if (!(valorNum > 0)) {
      toast.error('Informe o valor da nota')
      return
    }
    setBusy(tipo)
    try {
      const fd = new FormData()
      fd.append('tipo', tipo)
      fd.append('file', file)
      fd.append('valor', String(valorNum))
      const r = await api.post<{ notas: NotasPayload }>(`/fechamento/notas/${type}/${id}/${yearMonth}`, fd)
      onChanged(r.notas)
      setValores(v => ({ ...v, [tipo]: '' }))
      toast.success('Nota enviada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar a nota')
    } finally { setBusy(null) }
  }

  async function download(tipo: string, name: string | null) {
    setBusy(tipo)
    try {
      const res = await fetch(`/api/v1/fechamento/notas/${type}/${id}/${yearMonth}/${tipo}/download`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Falha ao baixar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name ?? `${tipo}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao baixar')
    } finally { setBusy(null) }
  }

  async function view(tipo: string) {
    setBusy(tipo)
    try {
      const res = await fetch(`/api/v1/fechamento/notas/${type}/${id}/${yearMonth}/${tipo}/download`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Falha ao abrir')
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao abrir')
    } finally { setBusy(null) }
  }

  async function decide(tipo: string, decisao: 'accepted' | 'rejected' | 'revoke', mot?: string) {
    setBusy(tipo)
    try {
      const r = await api.post<{ notas: NotasPayload }>(
        `/fechamento/notas/${type}/${id}/${yearMonth}/${tipo}/decisao`,
        { decisao, motivo: mot },
      )
      onChanged(r.notas)
      setRejecting(null); setMotivo('')
      toast.success(decisao === 'accepted' ? 'Nota aceita' : decisao === 'revoke' ? 'Aprovação revogada' : 'Nota recusada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na decisão')
    } finally { setBusy(null) }
  }

  async function liberar() {
    setBusy('__liberar')
    try {
      const r = await api.post<{ notas: NotasPayload }>(`/fechamento/notas/${type}/${id}/${yearMonth}/liberar`, {})
      onChanged(r.notas)
      toast.success('Envio liberado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao liberar o envio')
    } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {/* Avisos no topo (valor exato + prazo), antes da linha da nota. */}
      {canUpload && selfService && (
        <div className="rounded-lg px-3 py-1.5 text-xs font-bold leading-snug"
          style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
          Informe o valor exato da nota — deve ser igual ao recebimento do fechamento
          {expectedValue != null && <> (<span className="tabular-nums">{fmtBRL(expectedValue)}</span>)</>}.
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {selfService && (
          <p className="text-xs font-bold leading-snug rounded-lg px-3 py-1.5"
            style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>
            As notas não serão aceitas após o dia {deadlineDate.toLocaleDateString('pt-BR')} (dia 15 do mês seguinte à competência).
          </p>
        )}
        {bloqueado && (
          <span className="text-xs font-bold" style={{ color: 'var(--warning)' }}>
            Prazo encerrado — fale com o setor financeiro.
          </span>
        )}
        {notas.upload_liberado && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1"
            style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
            title={notas.liberado_por ? `Liberado por ${notas.liberado_por}` : 'Envio liberado'}>
            <KeyRound size={11} /> Envio liberado pelo administrativo
          </span>
        )}
        {canDecide && bloqueado && (
          <button disabled={busy === '__liberar'} onClick={liberar}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors disabled:opacity-50 shrink-0"
            style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' }}
            title="Liberar o envio de notas deste mês para este consultor/parceiro">
            <KeyRound size={13} /> Liberar envio
          </button>
        )}
      </div>

      {DOCS.map(({ key, label }) => {
        const d = notas[key]
        const raw = valores[key] ?? ''
        const parsed = parseValor(raw)
        const hasValor = parsed > 0
        const mismatch = hasValor && expectedValue != null && Math.abs(parsed - expectedValue) > 0.01
        // Bloqueado pelo prazo (dia 15) trava o envio para não-admin; admin (canDecide) passa.
        const uploadDisabled = busy === key || !hasValor || mismatch || (bloqueado && !canDecide)
        return (
          <div key={key} className="flex flex-col gap-0.5">
           <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
            <span className="text-[var(--text-muted)] w-[78px] shrink-0">{label}</span>

            {d.status === 'accepted' && (
              <span className="px-2 py-1 rounded text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)]">✓ Nota aceita</span>
            )}
            {d.status === 'rejected' && (
              <span className="px-2 py-1 rounded text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger)]">✗ Recusada</span>
            )}
            {d.status === 'pending' && d.has_file && (
              <span className="px-2 py-1 rounded text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)]">Pendente</span>
            )}
            {!d.has_file && (
              <span className="text-[var(--text-muted)] text-xs">sem anexo</span>
            )}

            {d.valor != null && (
              <span className="px-2 py-1 rounded text-xs font-semibold tabular-nums"
                style={d.stale_reason
                  ? { background: 'var(--warning-bg)', color: 'var(--warning)' }
                  : { background: 'var(--primary-soft)', color: 'var(--primary)' }}
                title={d.stale_reason ?? 'Valor declarado da nota'}>
                {fmtBRL(d.valor)}
              </span>
            )}

            {d.has_file && (
              <>
                <button disabled={busy === key} onClick={() => view(key)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 shrink-0"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  title="Visualizar anexo"><Eye size={15} /> Visualizar</button>
                <button disabled={busy === key} onClick={() => download(key, d.original_name)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 shrink-0"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  title={d.original_name ?? 'Baixar'}><Download size={15} /> Baixar</button>
              </>
            )}

            {canUpload && selfService && (
              <>
                <input
                  value={raw}
                  onChange={e => setValores(v => ({ ...v, [key]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Valor da nota"
                  title="Valor da nota — deve ser igual ao recebimento do fechamento"
                  className="px-3 py-1.5 rounded-lg text-sm tabular-nums w-[130px] shrink-0 border outline-none"
                  style={{ background: 'var(--surface)', borderColor: mismatch ? 'var(--danger)' : 'var(--border)', color: 'var(--text)' }}
                />
                <input ref={refFor(key)} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(key, f); e.currentTarget.value = '' }} />
                <button disabled={uploadDisabled} onClick={() => refFor(key).current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  title={d.has_file ? 'Substituir anexo' : 'Enviar anexo'}><Upload size={15} /> {d.has_file ? 'Substituir' : 'Enviar'}</button>
                {mismatch && expectedValue != null && (
                  <span className="text-[10px] font-medium" style={{ color: 'var(--danger)' }}>
                    deve ser igual ao recebimento: {fmtBRL(expectedValue)}
                  </span>
                )}
              </>
            )}

            {canDecide && d.has_file && d.status === 'pending' && rejecting !== key && (
              <>
                <button disabled={busy === key} onClick={() => decide(key, 'accepted')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors disabled:opacity-50 shrink-0"
                  style={{ background: 'var(--success-bg)', borderColor: 'var(--success)', color: 'var(--success)' }}
                  title="Aceitar nota"><Check size={13} /> Aceitar</button>
                <button disabled={busy === key} onClick={() => { setRejecting(key); setReasonAction('rejected'); setMotivo('') }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors disabled:opacity-50 shrink-0"
                  style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  title="Recusar nota"><X size={13} /> Rejeitar</button>
              </>
            )}

            {canDecide && d.has_file && d.status === 'accepted' && rejecting !== key && (
              <button disabled={busy === key} onClick={() => { setRejecting(key); setReasonAction('revoke'); setMotivo('') }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors disabled:opacity-50 shrink-0"
                style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                title="Revogar aprovação da nota (volta para pendente)"><X size={13} /> Revogar aprovação</button>
            )}

            {canDecide && rejecting === key && (
              <span className="flex items-center gap-1">
                <input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder={reasonAction === 'revoke' ? 'Motivo da revogação' : 'Motivo da recusa'}
                  className="px-1 py-0.5 rounded bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-[10px] w-32" />
                <button disabled={busy === key || !motivo.trim()} onClick={() => decide(key, reasonAction, motivo.trim())}
                  className="text-[var(--danger)] font-semibold disabled:opacity-40">OK</button>
                <button onClick={() => { setRejecting(null); setMotivo('') }} className="text-[var(--text-light)]">cancelar</button>
              </span>
            )}

           </div>

            {/* Motivo (recusa/revogação) — linha própria, texto inteiro. */}
            {((d.status === 'rejected') || (d.status === 'pending' && d.reject_reason)) && d.reject_reason && rejecting !== key && (
              <span className="text-[11px] font-medium" title={d.reject_reason}
                style={{ color: d.status === 'pending' ? 'var(--warning)' : 'var(--danger)' }}>
                {d.status === 'rejected' && '— '}{d.reject_reason}
              </span>
            )}

            {/* Aviso (não trava nada): valor declarado ≠ recebimento atual. Texto inteiro, em linha própria. */}
            {d.stale_reason && rejecting !== key && (
              <span className="text-[11px] font-medium" style={{ color: 'var(--warning)' }}>
                {d.stale_reason}
              </span>
            )}
          </div>
        )
      })}

      {/* Dados da ERPSERV para o consultor/parceiro emitir a NF (tomador) — só na tela do funcionário */}
      {selfService && (
        <div className="mt-1.5 rounded-lg px-3 py-2 text-[11px] leading-relaxed"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <p className="font-semibold mb-0.5" style={{ color: 'var(--text)' }}>Informações da ERPSERV para emissão da NF</p>
          <p>ERPSERV CONSULTORIA DE SISTEMAS LTDA</p>
          <p>CNPJ: 23.870.826/0001-07</p>
        </div>
      )}
    </div>
  )
}
