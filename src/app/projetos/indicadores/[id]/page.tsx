'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useProjectSchedule } from '@/hooks/use-project-schedule'
import { IndicadoresView } from '../../[id]/cronograma/views/indicadores'
import { CronogramaEvmPanel } from '@/components/projects/cronograma-evm-panel'
import { ArrowLeft, CalendarRange } from 'lucide-react'

/**
 * Tela DEDICADA de indicadores de um projeto (EVM + operacional), FORA do layout do Cronograma
 * (sem o cabeçalho do projeto / abas / kanban / gantt). Fica sob a pasta do portfólio (/projetos/indicadores/[id])
 * de propósito, para NÃO herdar o layout de projeto ([id]/layout.tsx) que duplicava o menu e fixava o header.
 */
export default function ProjetoIndicadoresDedicadoPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const router = useRouter()
  const { user } = useAuth()
  const canEdit = user?.type !== 'consultor' && user?.type !== 'cliente'

  const { project, stages, executive, teamLoad, loading } = useProjectSchedule(projectId)

  return (
    <AppLayout title={project?.name ? `Indicadores — ${project.name}` : 'Indicadores do Projeto'}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={() => router.push('/projetos/indicadores')}
            className="inline-flex items-center gap-1.5 text-sm ds-row-hover rounded-lg px-2.5 py-1.5"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <ArrowLeft size={15} /> Todos os projetos
          </button>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{project?.name ?? 'Projeto'}</h1>
          <button onClick={() => router.push(`/projetos/${projectId}/cronograma`)}
            className="inline-flex items-center gap-1.5 text-sm ds-btn-secondary rounded-lg px-3 py-1.5">
            <CalendarRange size={15} /> Abrir Cronograma
          </button>
        </div>

        {loading ? (
          <div className="ds-card p-6 text-sm text-center" style={{ color: 'var(--text-light)' }}>Carregando indicadores…</div>
        ) : (
          <div className="flex flex-col gap-3">
            <CronogramaEvmPanel projectId={projectId} canEdit={canEdit} />
            <IndicadoresView project={project} stages={stages} executive={executive} teamLoad={teamLoad} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
