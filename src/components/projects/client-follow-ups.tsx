'use client'

import { useState } from 'react'
import { useApiQuery } from '@/hooks/use-query'
import { ListChecks, CalendarDays } from 'lucide-react'
import { ClientFollowUpDetail } from './client-follow-up-detail'

/**
 * Follow Ups na visão do CLIENTE — só os que ele participa (client_involved),
 * read-only, em dias. Fonte: GET /client/projects/{id}/follow-ups.
 */
interface ClientFollowUp {
  id: number
  title: string
  description: string | null
  status: string
  due_date: string | null
  responsible: string | null
  author: string | null
  created_at: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aberto', in_progress: 'Aberto', waiting_third: 'Aberto',
  completed: 'Concluído', cancelled: 'Cancelado',
}
const STATUS_TONE: Record<string, string> = {
  pending: 'var(--warning)',
  in_progress: 'var(--primary)',
  waiting_third: 'var(--info)',
  completed: 'var(--success)',
  cancelled: 'var(--text-muted)',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function ClientFollowUps({ projectId }: { projectId: number }) {
  const { data, loading, error, refetch } = useApiQuery<{ items: ClientFollowUp[] }>(`/client/projects/${projectId}/follow-ups`)
  const [openId, setOpenId] = useState<number | null>(null)

  if (loading && !data) return <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
        <ListChecks size={20} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13 }}>Nenhum acompanhamento envolvendo você neste projeto.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(f => {
        const tone = STATUS_TONE[f.status] ?? 'var(--text-muted)'
        return (
          <div key={f.id} className="ds-card ds-row-hover" style={{ padding: 12, cursor: 'pointer' }} onClick={() => setOpenId(f.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{f.title}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: tone, background: 'var(--surface)', padding: '2px 8px', borderRadius: 10, border: `1px solid ${tone}` }}>
                {STATUS_LABEL[f.status] ?? f.status}
              </span>
            </div>
            {f.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{f.description}</div>}
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              {f.author && <span>Enviado por <strong style={{ color: 'var(--text)' }}>{f.author}</strong></span>}
              <span style={{ color: f.status === 'completed' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{STATUS_LABEL[f.status] ?? f.status}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarDays size={11} /> Prazo {fmtDate(f.due_date)}</span>
              {f.responsible && <span>Responsável: {f.responsible}</span>}
            </div>
          </div>
        )
      })}

      {openId != null && (
        <ClientFollowUpDetail followUpId={openId} onClose={() => setOpenId(null)} onChanged={refetch} />
      )}
    </div>
  )
}
