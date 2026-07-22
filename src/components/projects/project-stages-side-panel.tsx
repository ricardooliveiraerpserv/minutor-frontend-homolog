'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X, ExternalLink, Layers, Eye } from 'lucide-react'
import { useProjectStages } from '@/hooks/use-project-stages'
import { useApiQuery } from '@/hooks/use-query'
import { useAuth } from '@/hooks/use-auth'

interface Props {
  projectId: number
  projectName: string
  customerName?: string | null
  onClose: () => void
  /** "Visualizar card" — abre o modal do projeto (o mesmo card usado em produção). */
  onViewCard?: () => void
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function formatHours(v: number): string {
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

/**
 * Side panel simplificado (Fase 1 do board consolidado / ADR 0004).
 * Não duplica a lista detalhada de etapas — só dá pulo rápido pro workspace.
 */
export function ProjectStagesSidePanel({
  projectId, projectName, customerName, onClose, onViewCard,
}: Props) {
  const { user } = useAuth()
  const isClient = user?.type === 'cliente'
  const { stages } = useProjectStages(projectId)
  // Cliente: dados em DIAS (sem horas) via endpoint do cliente.
  const { data: clientSched } = useApiQuery<{ stages: { progress_pct: number; deliveries: { status: string }[] }[] }>(
    isClient ? `/client/projects/${projectId}/schedule` : null,
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const csStages = clientSched?.stages ?? []
  const total = isClient ? csStages.length : stages.length
  // "Planejadas" = valor efetivo da etapa (hours_planned se preenchido, senão a soma das
  // horas das atividades) — mesmo critério da tabela do cronograma. Usar hours_planned cru
  // mostrava 0h quando as horas estão nas atividades e não no campo manual da etapa.
  const planned = stages.reduce((s, st) => s + n(st.effective_hours_planned ?? st.deliveries_hours_planned_sum ?? st.hours_planned), 0)
  const totalDeliv = isClient
    ? csStages.reduce((s, st) => s + st.deliveries.length, 0)
    : stages.reduce((s, st) => s + (st.deliveries_count ?? 0), 0)
  const doneDeliv = isClient
    ? csStages.reduce((s, st) => s + st.deliveries.filter(d => d.status === 'done').length, 0)
    : stages.reduce((s, st) => s + (st.deliveries_done_count ?? 0), 0)
  const pct = totalDeliv > 0 ? Math.round((doneDeliv / totalDeliv) * 100) : 0

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(420px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.2)',
          zIndex: 70,
          display: 'flex', flexDirection: 'column',
          animation: 'slideInPanel .18s ease',
        }}
      >
        <style>{`@keyframes slideInPanel { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {customerName && (
              <div style={{
                fontSize: 11, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '.04em',
              }}>
                {customerName}
              </div>
            )}
            <div style={{
              fontSize: 15, fontWeight: 600, color: 'var(--text)',
              marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {projectName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, flex: 1, overflowY: 'auto' }}>
          <div style={{
            padding: '12px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 14,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '.04em',
              marginBottom: 8,
            }}>
              <Layers size={11} /> Resumo
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span><strong>{total}</strong> etapa{total !== 1 ? 's' : ''}</span>
              {!isClient && <span><strong>{formatHours(planned)}</strong> planejadas</span>}
              <span><strong>{doneDeliv}/{totalDeliv}</strong> atividades concluídas{totalDeliv > 0 ? ` · ${pct}%` : ''}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onViewCard && (
              <button
                type="button"
                onClick={onViewCard}
                className="ds-btn-secondary"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 13, padding: '10px 16px',
                  width: '100%', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <Eye size={14} /> Visualizar card
              </button>
            )}
            <Link
              href={`/projetos/${projectId}/cronograma?from=pipeline`}
              className="ds-btn-primary"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, padding: '10px 16px', textDecoration: 'none',
                width: '100%', justifyContent: 'center',
              }}
            >
              <ExternalLink size={14} /> Gestão de projetos
            </Link>
          </div>

          <p style={{
            marginTop: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
          }}>
            {isClient
              ? 'Acompanhe o cronograma do projeto em dias: etapas, atividades e o que aguarda a sua aprovação.'
              : 'O workspace mostra todas as etapas com seus consultores alocados, horas e kanban operacional num único board.'}
          </p>
        </div>
      </aside>
    </>
  )
}
