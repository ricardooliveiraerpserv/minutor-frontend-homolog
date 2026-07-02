'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet } from '@/types'
import { PageHeader, Badge, Skeleton } from '@/components/ds'
import {
  ArrowLeft, Clock, Calendar, User, FolderOpen, Ticket,
  Globe, Webhook, Building2, Hash, FileText, CheckCircle, Paperclip,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitize'
import { useAuth } from '@/hooks/use-auth'
import { TimesheetLogsList, type TimesheetLog } from '@/components/timesheet/TimesheetLogsList'

function AttachmentLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)
  const open = async () => {
    setLoading(true)
    try {
      const res = await fetch(url, { credentials: 'same-origin' })
      if (!res.ok) { alert('Anexo não encontrado no servidor'); return }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch { alert('Erro ao abrir anexo') }
    finally { setLoading(false) }
  }
  return (
    <button type="button" onClick={open} disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
      style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }}>
      <Paperclip size={12} />
      {loading ? 'Abrindo...' : 'Visualizar Anexo'}
    </button>
  )
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function InfoRow({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ElementType
  label: string
  value?: string | null
  children?: React.ReactNode
}) {
  return (
    <div
      className="flex items-start gap-4 py-4"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span
        className="mt-0.5 shrink-0 p-2 rounded-lg"
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
      >
        <Icon size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-light)' }}>
          {label}
        </p>
        {children ?? (
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {value ?? '—'}
          </p>
        )}
      </div>
    </div>
  )
}

function OriginChip({ origin }: { origin?: string }) {
  if (origin === 'webhook') return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
    >
      <Webhook size={11} /> Auto (Movidesk)
    </span>
  )
  if (origin === 'movidesk_fallback') return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}
      title="Sincronizado do Movidesk, mas o agente não casou com nenhum consultor — atribuído ao Usuário Padrão pra triagem manual"
    >
      <Webhook size={11} /> Movidesk (triagem)
    </span>
  )
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
    >
      <Globe size={11} /> Web (manual)
    </span>
  )
}

export default function TimesheetDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { user } = useAuth()
  const { data: raw, loading, error } = useApiQuery<{ success: boolean; data: Timesheet }>(`/timesheets/${id}`)
  const ts = raw?.data ?? (raw as unknown as Timesheet | null)

  const canSeeLogs = user?.type === 'admin' || user?.type === 'coordenador'
  const { data: logsResp, loading: logsLoading } = useApiQuery<{ data: TimesheetLog[] }>(
    canSeeLogs ? `/timesheets/${id}/logs?per_page=50` : null,
  )
  const logs = logsResp?.data ?? []

  return (
    <AppLayout title="Apontamento">
      <div className="max-w-2xl mx-auto">
        <PageHeader
          icon={Clock}
          title="Detalhe do Apontamento"
          subtitle={ts ? `#${ts.id} · ${formatDate(ts.date)}` : 'Carregando...'}
          actions={
            <Link href="/timesheets">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                <ArrowLeft size={12} /> Voltar
              </span>
            </Link>
          }
        />

        {loading && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm py-4" style={{ color: 'var(--danger-border)' }}>{error}</p>
        )}

        {!loading && ts && (
          <div className="space-y-5">
            {/* Status + origem */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={ts.status}>{ts.status_display ?? ts.status}</Badge>
              <OriginChip origin={ts.origin} />
              {ts.rejection_reason && (
                <span className="text-xs" style={{ color: 'var(--danger-border)' }}>
                  {ts.rejection_reason}
                </span>
              )}
            </div>

            {/* Card principal */}
            <div
              className="rounded-2xl px-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <InfoRow icon={Calendar} label="Data" value={formatDate(ts.date)} />
              <InfoRow icon={Clock} label="Período">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {ts.start_time} – {ts.end_time}
                  <span
                    className="ml-2 px-2 py-0.5 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                  >
                    {ts.effort_hours}
                  </span>
                </p>
              </InfoRow>
              <InfoRow icon={User} label="Colaborador" value={ts.user?.name} />
              <InfoRow icon={Building2} label="Cliente" value={ts.customer?.name ?? ts.project?.customer?.name} />
              <InfoRow icon={FolderOpen} label="Projeto">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {ts.project?.name ?? '—'}
                  {ts.project?.contract_type_display && (
                    <span
                      className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-light)' }}
                    >
                      {ts.project.contract_type_display}
                    </span>
                  )}
                </p>
              </InfoRow>
              {ts.ticket && (
                <InfoRow icon={Ticket} label="Ticket">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    <span style={{ color: 'var(--primary)' }}>#{ts.ticket}</span>
                    {ts.ticket_subject && (
                      <span className="ml-2" style={{ color: 'var(--text-muted)' }}>— {ts.ticket_subject}</span>
                    )}
                  </p>
                </InfoRow>
              )}
              {ts.movidesk_appointment_id && (
                <InfoRow icon={Hash} label="ID Movidesk" value={String(ts.movidesk_appointment_id)} />
              )}
              {(ts as any).attachment_url && (
                <InfoRow icon={Paperclip} label="Anexo">
                  <AttachmentLink url={(ts as any).attachment_url} />
                </InfoRow>
              )}
              {/* sem last border */}
            </div>

            {/* Observação */}
            {ts.observation && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div
                  className="flex items-center gap-2 px-6 py-3"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <FileText size={13} style={{ color: 'var(--primary)' }} />
                  <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-light)' }}>
                    Observação
                  </span>
                </div>
                <div
                  className="
                    px-6 py-4 text-sm leading-relaxed
                    [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2
                    [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
                    [&_th]:border [&_th]:border-[var(--border)] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:bg-[var(--bg)]
                    [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top
                    [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5
                    [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
                    [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                    [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1
                    [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                    [&_a]:underline [&_a]:text-[var(--primary)]
                    [&_hr]:my-3 [&_hr]:border-[var(--border)]
                  "
                  style={{ color: 'var(--text-muted)' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(ts.observation) }}
                />
              </div>
            )}

            {/* Revisão */}
            {ts.reviewedBy && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
                style={{ background: 'var(--primary-soft)', border: '1px solid var(--border)', color: 'var(--text-light)' }}
              >
                <CheckCircle size={13} style={{ color: 'var(--primary)' }} />
                Revisado por <strong style={{ color: 'var(--text-muted)' }}>{ts.reviewedBy.name}</strong>
                {ts.reviewed_at && ` em ${formatDate(ts.reviewed_at.slice(0, 10))}`}
              </div>
            )}

            {/* Histórico de alterações (admin/coord) */}
            {canSeeLogs && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <FileText size={14} style={{ color: 'var(--primary)' }} />
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    Histórico de alterações
                  </h2>
                </div>
                <TimesheetLogsList logs={logs} loading={logsLoading} empty="Sem alterações registradas até agora." />
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
