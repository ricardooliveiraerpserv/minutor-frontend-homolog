'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Bell, Send, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'

interface HoursAlert {
  id: number
  band: number
  percentual: number | string
  available: number | string
  consumed: number | string
  approved: number | string | null
  balance: number | string
  basis: string | null
  classification: string | null
  recipients_to: string[] | null
  recipients_cc: string[] | null
  status: string
  error: string | null
  sent_at: string | null
  created_at: string
}

interface CurrentMetrics {
  available: number
  consumed: number
  approved: number
  balance: number
  percentual: number
  basis: string
}

interface Props {
  contractId: number | null
  contractLabel?: string
  isAdmin?: boolean
  onClose: () => void
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  sent:         { label: 'Enviado',          color: '#22C55E', icon: CheckCircle },
  failed:       { label: 'Falha no envio',   color: '#EF4444', icon: AlertTriangle },
  no_recipient: { label: 'Sem destinatário', color: '#F97316', icon: AlertTriangle },
  pending:      { label: 'Pendente',         color: '#94A3B8', icon: AlertTriangle },
}

const num = (v: number | string | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h'

const fmtDate = (s: string | null) =>
  !s ? '—' : new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function HoursAlertsModal({ contractId, contractLabel, isAdmin, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [current, setCurrent] = useState<CurrentMetrics | null>(null)
  const [alerts, setAlerts] = useState<HoursAlert[]>([])
  const [resendingId, setResendingId] = useState<number | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)

  const load = useCallback(async () => {
    if (!contractId) return
    setLoading(true)
    try {
      const r = await api.get<{ enabled: boolean; current: CurrentMetrics | null; alerts: HoursAlert[] }>(`/contracts/${contractId}/hours-alerts`)
      setEnabled(!!r.enabled)
      setCurrent(r.current)
      setAlerts(r.alerts ?? [])
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao carregar alertas'))
    } finally {
      setLoading(false)
    }
  }, [contractId])

  useEffect(() => { if (contractId) load() }, [contractId, load])

  const toggleFlag = async () => {
    setSavingFlag(true)
    try {
      const r = await api.put<{ enabled: boolean }>(`/contracts/hours-alerts/settings`, { enabled: !enabled })
      setEnabled(!!r.enabled)
      toast.success(r.enabled ? 'Alertas de consumo ativados' : 'Alertas de consumo desativados')
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao alterar configuração'))
    } finally {
      setSavingFlag(false)
    }
  }

  const resend = async (id: number) => {
    if (!contractId) return
    setResendingId(id)
    try {
      const r = await api.post<{ message: string; alert: HoursAlert }>(`/contracts/${contractId}/hours-alerts/${id}/resend`, {})
      toast[r.alert?.status === 'sent' ? 'success' : 'error'](r.message)
      await load()
    } catch (e) {
      toast.error(apiMessage(e, 'Erro ao reenviar'))
    } finally {
      setResendingId(null)
    }
  }

  if (!contractId) return null

  const pct = current ? Math.round(current.percentual) : null

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Bell size={18} style={{ color: '#F97316' }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Alertas de consumo de horas</h3>
              {contractLabel && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{contractLabel}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Master flag */}
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Envio automático de alertas</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Configuração geral do sistema. Destinatários e modelo do e-mail são definidos na Central de Workflows.
              </p>
            </div>
            <button
              disabled={!isAdmin || savingFlag}
              onClick={toggleFlag}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
              style={{ background: enabled ? '#22C55E' : 'var(--border)' }}
              title={isAdmin ? '' : 'Somente administrador'}>
              <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: enabled ? 'translateX(24px)' : 'translateX(4px)' }} />
            </button>
          </div>
          {!enabled && (
            <p className="text-xs" style={{ color: '#F97316' }}>
              Os alertas automáticos estão <b>desativados</b>. O reenvio manual abaixo continua funcionando.
            </p>
          )}

          {/* Current metrics */}
          {current && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: 'Limite', v: num(current.available) },
                { l: 'Consumidas', v: num(current.consumed) },
                { l: current.balance < 0 ? 'Excedente' : 'Saldo', v: num(Math.abs(current.balance)) },
                { l: '% Uso', v: pct != null ? `${pct}%` : '—' },
              ].map((k, idx) => (
                <div key={idx} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.l}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: k.l === 'Excedente' ? 'var(--danger-border)' : 'var(--text)' }}>{k.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Histórico de alertas</p>
            {loading ? (
              <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}><Loader2 className="animate-spin" size={18} /></div>
            ) : alerts.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum alerta registrado para este contrato.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => {
                  const sm = STATUS_META[a.status] ?? STATUS_META.pending
                  const Icon = sm.icon
                  const to = (a.recipients_to ?? [])
                  const cc = (a.recipients_cc ?? [])
                  return (
                    <div key={a.id} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(249,115,22,.12)', color: '#F97316' }}>{a.band}%</span>
                          <span className="text-xs" style={{ color: 'var(--text)' }}>{a.classification ?? '—'}</span>
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: sm.color }}>
                            <Icon size={13} /> {sm.label}
                          </span>
                        </div>
                        <button
                          disabled={resendingId === a.id}
                          onClick={() => resend(a.id)}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
                          style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {resendingId === a.id ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
                          {a.status === 'sent' ? 'Reenviar' : 'Enviar'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>Consumidas: <b style={{ color: 'var(--text)' }}>{num(a.consumed)}</b></span>
                        <span>Limite: <b style={{ color: 'var(--text)' }}>{num(a.available)}</b></span>
                        <span>%: <b style={{ color: 'var(--text)' }}>{Number(a.percentual).toFixed(0)}%</b></span>
                        <span>{a.sent_at ? `Enviado: ${fmtDate(a.sent_at)}` : `Registrado: ${fmtDate(a.created_at)}`}</span>
                      </div>
                      {(to.length > 0 || cc.length > 0) && (
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Para: {to.join(', ') || '—'}{cc.length ? ` · Cc: ${cc.join(', ')}` : ''}
                        </p>
                      )}
                      {a.error && <p className="mt-1 text-[11px]" style={{ color: 'var(--danger-border)' }}>{a.error}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
