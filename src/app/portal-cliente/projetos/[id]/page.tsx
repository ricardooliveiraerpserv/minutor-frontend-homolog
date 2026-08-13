'use client'

import { useParams, useRouter } from 'next/navigation'
import { Calendar, Clock, TrendingUp, Activity, ArrowLeft } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Skeleton } from '@/components/ui/loading'
import { ClientProjectSchedule } from '@/components/portal-cliente/client-project-schedule'
import {
  useClientProjectSummary,
  type HealthLevel,
  type ActivityItem,
} from '@/hooks/use-client-project-summary'

const HEALTH: Record<HealthLevel, { color: string; label: string }> = {
  ok:         { color: 'var(--success)', label: 'Saudável' },
  atencao:    { color: 'var(--warning)', label: 'Atenção' },
  atrasado:   { color: 'var(--danger)',  label: 'Atrasado' },
  estourando: { color: 'var(--danger)',  label: 'Horas estourando' },
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function KPI({
  label, value, icon: Icon, sub,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ size?: number }>
  sub?: string
}) {
  return (
    <div style={{
      padding: 16,
      borderRadius: 8,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '.04em',
      }}>
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--text)',
        marginTop: 4,
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <li style={{
      display: 'flex',
      gap: 12,
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: item.type === 'delivery_completed' ? 'var(--success)' : 'var(--primary)',
        marginTop: 8,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          <strong style={{ fontWeight: 500 }}>{item.label}</strong>
          {item.who && <span style={{ color: 'var(--text-muted)' }}> · {item.who}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {item.value} · {timeAgo(item.when)}
        </div>
      </div>
    </li>
  )
}

export default function VisaoClienteProjetoPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const router = useRouter()
  const { data, loading, error } = useClientProjectSummary(
    Number.isFinite(projectId) ? projectId : null
  )

  return (
    <AppLayout title={data?.project?.name ?? 'Projeto'}>
      <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
        <button onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 mb-4 ds-row-hover"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          <ArrowLeft size={15} /> Voltar
        </button>
        {loading && !data && (
          <>
            <div style={{ marginBottom: 24 }}>
              <Skeleton className="h-3 w-40 mb-2" />
              <Skeleton className="h-7 w-64" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ padding: 16, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </>
        )}
        {error && (
          <div style={{ color: 'var(--danger)' }}>{error}</div>
        )}
        {data && (
          <>
            <header style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {data.project.customer?.name ?? 'Cliente'}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: '4px 0 8px' }}>
                {data.project.name}
              </h1>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: HEALTH[data.health].color,
                }} />
                {data.status_macro}
              </div>
            </header>

            <section style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}>
              <KPI
                label="Progresso"
                value={`${Math.round(data.progress_pct)}%`}
                icon={TrendingUp}
              />
              <KPI
                label="Horas"
                value={`${Math.round(data.consumed_hours)}h`}
                sub={data.sold_hours > 0 ? `de ${Math.round(data.sold_hours)}h contratadas` : undefined}
                icon={Clock}
              />
              <KPI
                label="Prazo"
                value={formatDate(data.expected_end_date)}
                icon={Calendar}
              />
              <KPI
                label="Saúde"
                value={HEALTH[data.health].label}
                icon={Activity}
                sub={data.health !== 'ok' ? 'Equipe acompanhando' : undefined}
              />
            </section>

            {data.sold_hours > 0 && (
              <section style={{ marginBottom: 24 }}>
                <div style={{
                  height: 6,
                  width: '100%',
                  background: 'var(--surface-hover)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (data.consumed_hours / data.sold_hours) * 100)}%`,
                    background: HEALTH[data.health].color,
                    transition: 'width .3s ease',
                  }} />
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}>
                  <span>Consumo de horas</span>
                  <span>{Math.round((data.consumed_hours / data.sold_hours) * 100)}%</span>
                </div>
              </section>
            )}

            <section style={{ marginBottom: 24 }}>
              <h2 style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                margin: '0 0 8px',
              }}>
                Cronograma
              </h2>
              <ClientProjectSchedule projectId={projectId} />
            </section>

            <section>
              <h2 style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                margin: '0 0 8px',
              }}>
                Atualizações recentes
              </h2>
              {data.recent_activity.length === 0 ? (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  border: '1px dashed var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                }}>
                  Nenhuma atualização recente. Quando a equipe registrar horas ou concluir entregas, elas aparecem aqui.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {data.recent_activity.map((item, i) => (
                    <ActivityRow key={`${item.type}-${i}-${item.when}`} item={item} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  )
}
