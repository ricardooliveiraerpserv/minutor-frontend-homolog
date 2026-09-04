'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react'

interface Ref { id: number; name: string }
interface StatusOpt { id: number; key: string; label: string; color: string | null }
interface TicketRow {
  id: number; ticket_number: string | null; subject: string; priority: string
  customer?: Ref | null; assignee?: Ref | null; status?: StatusOpt | null
  dev_delivery_at?: string | null
}

// Data local YYYY-MM-DD (sem UTC).
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Dias corridos vencidos (hoje - data de entrega).
function diasVencido(dd: string): number {
  const [y, m, d] = dd.slice(0, 10).split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((now.getTime() - due.getTime()) / 86400000))
}

export default function EntregasVencidasPage() {
  const router = useRouter()
  const [rows, setRows] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: TicketRow[] }>('/help-desk/tickets?dev_overdue=1&limit=500')
      .then(r => {
        // Ordena pela entrega mais antiga primeiro (mais vencida no topo).
        const list = (r?.data ?? []).slice().sort((a, b) => (a.dev_delivery_at ?? '').localeCompare(b.dev_delivery_at ?? ''))
        setRows(list)
      })
      .catch(() => toast.error('Erro ao carregar entregas vencidas'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const today = todayStr()

  return (
    <AppLayout title="Entregas vencidas">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} style={{ color: 'var(--danger-border)' }} />
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Entregas vencidas</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Chamados em desenvolvimento com a previsão de entrega em homologação já vencida.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)', border: '1px solid var(--danger-border)' }}>
              {rows.length} vencida(s)
            </span>
            <button onClick={load} className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg">
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>

        <div className="ds-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Chamado</th>
                  <th className="px-3 py-2 font-medium">Assunto</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Consultor</th>
                  <th className="px-3 py-2 font-medium">Entrega prevista</th>
                  <th className="px-3 py-2 font-medium">Vencida há</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                    <Inbox size={28} className="mx-auto mb-2" style={{ color: 'var(--text-light)' }} />
                    Nenhuma entrega vencida. 🎉
                  </td></tr>
                ) : rows.map(t => {
                  const dd = (t.dev_delivery_at ?? '').slice(0, 10)
                  const dias = dd ? diasVencido(dd) : 0
                  return (
                    <tr key={t.id} className="ds-row-hover cursor-pointer border-t" style={{ borderColor: 'var(--border)' }}
                      onClick={() => router.push(`/help-desk/tickets/${t.id}`)}>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{t.ticket_number ?? `#${t.id}`}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{t.subject}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.customer?.name ?? '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.assignee?.name ?? <span style={{ color: 'var(--warning-border)' }}>—</span>}</td>
                      <td className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--danger-border)' }}>
                        🚧 {dd ? dd.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md"
                          style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)', border: '1px solid var(--danger-border)' }}>
                          {dias} dia{dias === 1 ? '' : 's'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Referência: {today.split('-').reverse().join('/')}</p>
      </div>
    </AppLayout>
  )
}
