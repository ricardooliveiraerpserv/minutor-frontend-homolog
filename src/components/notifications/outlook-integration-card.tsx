'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { RefreshCw, Link2, Unplug, Check } from 'lucide-react'

interface Status {
  configured: boolean; connected: boolean
  account_email: string | null; connected_at: string | null; last_sync_at: string | null
}

const hhmm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'

/** Card compacto de integração com o Microsoft 365 / Outlook (OAuth delegado por usuário). */
export function OutlookIntegrationCard({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const handledParam = useRef(false)

  const load = useCallback(() => {
    api.get<{ data: Status }>('/integrations/microsoft/status').then(r => setStatus(r.data ?? null)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  // Feedback após o redirect do OAuth (?outlook=connected|error) + sync automático ao conectar.
  useEffect(() => {
    if (handledParam.current) return
    handledParam.current = true
    const p = new URLSearchParams(window.location.search).get('outlook')
    if (!p) return
    if (p === 'connected') {
      toast.success('Outlook conectado com sucesso! 🎉')
      api.post('/integrations/microsoft/sync', {}).catch(() => {}).finally(() => { load(); onChange?.() })
    } else if (p === 'error') {
      toast.error('Não foi possível conectar ao Outlook. Tente novamente.')
    }
    // limpa o parâmetro da URL
    const url = new URL(window.location.href); url.searchParams.delete('outlook')
    window.history.replaceState({}, '', url.toString())
  }, [load, onChange])

  const connect = async () => {
    setBusy(true)
    try {
      const r = await api.post<{ data: { authorize_url: string } }>('/integrations/microsoft/connect', {})
      if (r.data?.authorize_url) window.location.href = r.data.authorize_url
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Integração indisponível no momento.') } finally { setBusy(false) }
  }

  const sync = async () => {
    setBusy(true)
    try {
      const r = await api.post<{ data: { synced: number } }>('/integrations/microsoft/sync', {})
      toast.success(`Agenda sincronizada (${r.data?.synced ?? 0} evento${r.data?.synced === 1 ? '' : 's'})`)
      load(); onChange?.()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Falha ao sincronizar.') } finally { setBusy(false) }
  }

  const disconnect = async () => {
    if (!confirm('Desconectar sua conta Microsoft?')) return
    setBusy(true)
    try {
      await api.post('/integrations/microsoft/disconnect', {})
      toast.success('Outlook desconectado'); load(); onChange?.()
    } catch { toast.error('Falha ao desconectar.') } finally { setBusy(false) }
  }

  if (!status) return null

  const btn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs'

  return (
    <div className="ds-card p-3">
      {!status.connected ? (
        // ESTADO 1 — não conectado
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px]">📅</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Conectar ao Outlook</span>
          </div>
          <p className="text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            Sincronize sua agenda para visualizar reuniões e compromissos no Minutor.
          </p>
          <button onClick={connect} disabled={busy || !status.configured} className={btn}
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: status.configured ? 1 : 0.55 }}>
            <Link2 size={13} /> Conectar conta Microsoft
          </button>
          {!status.configured && <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Integração indisponível no momento.</p>}
        </div>
      ) : (
        // ESTADO 2 — conectado
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Check size={15} style={{ color: 'var(--success-border)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Outlook conectado</span>
          </div>
          {status.account_email && <p className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>{status.account_email}</p>}
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Última sincronização: {hhmm(status.last_sync_at)}</p>
          <div className="flex items-center gap-1.5">
            <button onClick={sync} disabled={busy} className={btn} style={{ border: '1px solid var(--primary)', color: 'var(--primary)' }}>
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Atualizar agora
            </button>
            <button onClick={disconnect} disabled={busy} className={btn} style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Unplug size={13} /> Desconectar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
