'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet } from '@/types'
import { PageHeader, Badge, Skeleton } from '@/components/ds'
import {
  ArrowLeft, Clock, Calendar, User, FolderOpen, Ticket,
  Globe, Webhook, Building2, Hash, FileText, CheckCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

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
      style={{ borderBottom: '1px solid var(--brand-border)' }}
    >
      <span
        className="mt-0.5 shrink-0 p-2 rounded-lg"
        style={{ background: 'rgba(0,245,255,0.06)', color: 'var(--brand-primary)' }}
      >
        <Icon size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--brand-subtle)' }}>
          {label}
        </p>
        {children ?? (
          <p className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
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
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}
    >
      <Globe size={11} /> Web (manual)
    </span>
  )
}

export default function TimesheetDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { data: raw, loading, error } = useApiQuery<{ success: boolean; data: Timesheet }>(`/timesheets/${id}`)
  const ts = raw?.data ?? (raw as unknown as Timesheet | null)

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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-colors hover:bg-white/5"
                style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}
              >
                <ArrowLeft size={12} /> Voltar
              </span>
            </Link>
          }
        />

        {loading && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm py-4" style={{ color: 'var(--brand-danger)' }}>{error}</p>
        )}

        {!loading && ts && (
          <div className="space-y-5">
            {/* Status + origem */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={ts.status}>{ts.status_display ?? ts.status}</Badge>
              <OriginChip origin={ts.origin} />
              {ts.rejection_reason && (
                <span className="text-xs" style={{ color: 'var(--brand-danger)' }}>
                  {ts.rejection_reason}
                </span>
              )}
            </div>

            {/* Card principal */}
            <div
              className="rounded-2xl px-6"
              style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
            >
              <InfoRow icon={Calendar} label="Data" value={formatDate(ts.date)} />
              <InfoRow icon={Clock} label="Período">
                <p className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
                  {ts.start_time} – {ts.end_time}
                  <span
                    className="ml-2 px-2 py-0.5 rounded-lg text-xs font-bold"
                    style={{ background: 'rgba(0,245,255,0.1)', color: 'var(--brand-primary)' }}
                  >
                    {ts.effort_hours}
                  </span>
                </p>
              </InfoRow>
              <InfoRow icon={User} label="Colaborador" value={ts.user?.name} />
              <InfoRow icon={Building2} label="Cliente" value={ts.customer?.name ?? ts.project?.customer?.name} />
              <InfoRow icon={FolderOpen} label="Projeto">
                <p className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
                  {ts.project?.name ?? '—'}
                  {ts.project?.contract_type_display && (
                    <span
                      className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}
                    >
                      {ts.project.contract_type_display}
                    </span>
                  )}
                </p>
              </InfoRow>
              {ts.ticket && (
                <InfoRow icon={Ticket} label="Ticket">
                  <p className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
                    <span style={{ color: 'var(--brand-primary)' }}>#{ts.ticket}</span>
                    {ts.ticket_subject && (
                      <span className="ml-2" style={{ color: 'var(--brand-muted)' }}>— {ts.ticket_subject}</span>
                    )}
                  </p>
                </InfoRow>
              )}
              {ts.movidesk_appointment_id && (
                <InfoRow icon={Hash} label="ID Movidesk" value={String(ts.movidesk_appointment_id)} />
              )}
              {/* sem last border */}
            </div>

            {/* Observação */}
            {ts.observation && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
              >
                <div
                  className="flex items-center gap-2 px-6 py-3"
                  style={{ borderBottom: '1px solid var(--brand-border)' }}
                >
                  <FileText size={13} style={{ color: 'var(--brand-primary)' }} />
                  <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--brand-subtle)' }}>
                    Observação
                  </span>
                </div>
                <div
                  className="px-6 py-4 text-sm leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
                  style={{ color: 'var(--brand-muted)' }}
                  dangerouslySetInnerHTML={{ __html: ts.observation }}
                />
              </div>
            )}

            {/* Revisão */}
            {ts.reviewedBy && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
                style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)' }}
              >
                <CheckCircle size={13} style={{ color: 'var(--brand-primary)' }} />
                Revisado por <strong style={{ color: 'var(--brand-muted)' }}>{ts.reviewedBy.name}</strong>
                {ts.reviewed_at && ` em ${formatDate(ts.reviewed_at.slice(0, 10))}`}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
