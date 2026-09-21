'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X, ArrowLeftRight } from 'lucide-react'

type TransferTarget = { id: number; label: string; project_id: number | null }
type TransferInfo = {
  source: { contract_id: number; has_project: boolean; available_hours: number; rate: number }
  targets: TransferTarget[]
}

/**
 * Transfere horas de um contrato para OUTRO do MESMO cliente. Grava o log como par de aportes
 * (origem −X / destino +X). Move horas + valor (R$/h vigente da origem). Bloqueia se a origem
 * ficaria negativa. Só admin (a rota valida de novo no backend).
 */
export function TransferHoursModal({ contract, onClose, onDone }: {
  contract: any | null
  onClose: () => void
  onDone: () => void
}) {
  const [info, setInfo] = useState<TransferInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [toId, setToId] = useState('')
  const [hours, setHours] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!contract) { setInfo(null); setToId(''); setHours(''); setDesc(''); return }
    setLoading(true)
    api.get<TransferInfo>(`/contracts/${contract.id}/transfer-info`)
      .then(setInfo)
      .catch(() => { toast.error('Erro ao carregar dados da transferência'); setInfo(null) })
      .finally(() => setLoading(false))
  }, [contract])

  const available = info?.source.available_hours ?? 0
  const rate = info?.source.rate ?? 0
  const hoursNum = useMemo(() => parseFloat((hours || '').replace(',', '.')), [hours])
  const overBalance = Number.isFinite(hoursNum) && hoursNum > available
  const canApply = !!toId && Number.isFinite(hoursNum) && hoursNum > 0 && !overBalance && !saving

  const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const apply = async () => {
    if (!contract || !canApply) return
    setSaving(true)
    try {
      const r = await api.post<any>(`/contracts/${contract.id}/transfer-hours`, {
        to_contract_id: Number(toId),
        hours: hoursNum,
        description: desc.trim() || undefined,
      })
      toast.success(`Transferidas ${r?.hours ?? hoursNum}h — origem ficou com ${r?.from?.remaining_hours ?? '—'}h`)
      onDone()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao transferir horas')
    } finally { setSaving(false) }
  }

  if (!contract) return null

  const srcLabel = `${contract.customer?.name ?? ''}${contract.project?.code ? ' · ' + contract.project.code : ''}`

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-md mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <ArrowLeftRight size={16} style={{ color: 'var(--primary)' }} /> Transferir horas
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
        ) : !info?.source.has_project ? (
          <p className="text-sm py-4" style={{ color: 'var(--danger)' }}>Este contrato não tem projeto vinculado — não é possível transferir horas.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
              Origem: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{srcLabel}</span><br />
              Saldo disponível: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{available.toLocaleString('pt-BR')} h</span>
              {rate > 0 && <> · valor-hora <span style={{ color: 'var(--text)' }}>{money(rate)}</span></>}
            </div>

            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Contrato destino (mesmo cliente)</label>
              <select value={toId} onChange={e => setToId(e.target.value)}
                className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="">Selecionar contrato destino…</option>
                {(info?.targets ?? []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {info && info.targets.length === 0 && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--warning)' }}>Nenhum outro contrato deste cliente com projeto vinculado.</p>
              )}
            </div>

            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Horas a transferir</label>
              <input value={hours} onChange={e => setHours(e.target.value)} inputMode="decimal" placeholder="0"
                className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: `1px solid ${overBalance ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--text)' }} />
              {overBalance && <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>Acima do saldo disponível ({available.toLocaleString('pt-BR')} h).</p>}
              {rate > 0 && Number.isFinite(hoursNum) && hoursNum > 0 && !overBalance && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Move também o valor: {money(hoursNum * rate)}.</p>
              )}
            </div>

            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Motivo / observação (opcional)</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} maxLength={1000}
                className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-xs transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={apply} disabled={!canApply}
            className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
            {saving ? 'Transferindo…' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}
