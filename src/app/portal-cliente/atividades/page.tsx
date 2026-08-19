'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/app-layout'
import { api, ApiError } from '@/lib/api'
import { ChevronRight, Layers } from 'lucide-react'

interface ClientActivity {
  id: number
  title: string
  description: string | null
  status: string
  planned_start_at: string | null
  due_date: string | null
  completed_at: string | null
  responsible_name: string | null
  stage_name: string | null
  project_name: string | null
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando cliente',
  review: 'Homologação',
  done: 'Concluída',
}

const STATUS_COLOR: Record<string, string> = {
  backlog: 'var(--text-muted)',
  in_progress: 'var(--primary)',
  waiting_client: 'var(--warning)',
  review: 'var(--primary)',
  done: 'var(--success)',
}

/**
 * Lista de atividades onde o cliente está envolvido (client_involved=true e
 * client_user_id=auth.id). View limitada — sem horas internas, alocações,
 * riscos, etc. Ver `ClientActivityController::index` no backend.
 */
export default function ClientActivitiesPage() {
  const [items, setItems] = useState<ClientActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get<{ items: ClientActivity[] }>('/client/activities')
      .then(r => setItems(r.items ?? []))
      .catch(e => setError(e instanceof ApiError ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1024 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Minhas atividades</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>
          Atividades onde você foi envolvido para homologação, validação ou retorno.
        </p>

        {loading && <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>}
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center',
            border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)',
          }}>
            <Layers size={24} style={{ marginBottom: 6, color: 'var(--text-light)' }} />
            <div>Nenhuma atividade vinculada a você no momento.</div>
          </div>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(a => (
            <li key={a.id}>
              <Link
                href={`/portal-cliente/atividades/${a.id}`}
                className="ds-card"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 8,
                  textDecoration: 'none', color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {a.project_name ? `${a.project_name} · ` : ''}{a.stage_name ?? '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {a.due_date && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Prazo {fmtDate(a.due_date)}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '3px 8px', borderRadius: 4,
                    background: 'var(--surface)',
                    color: STATUS_COLOR[a.status] ?? 'var(--text-muted)',
                    border: `1px solid ${STATUS_COLOR[a.status] ?? 'var(--border)'}`,
                  }}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppLayout>
  )
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}
