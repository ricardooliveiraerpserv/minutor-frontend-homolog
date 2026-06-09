'use client'

import { useParams } from 'next/navigation'
import { FollowUpsBoard } from '@/components/follow-ups/follow-ups-board'
import { ClientFollowUps } from '@/components/projects/client-follow-ups'
import { useAuth } from '@/hooks/use-auth'

/**
 * Aba "Follow Ups" do projeto: kanban + lista + indicadores, somente dos Follow Ups
 * vinculados ao projeto (project_id denormalizado cobre os de etapa/atividade).
 * Criação herda o vínculo do projeto (origin=project).
 * Cliente: lista read-only só dos Follow Ups onde ele está envolvido.
 */
export default function ProjectFollowUpsPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const { user } = useAuth()
  if (!Number.isFinite(projectId)) return null

  if (user?.type === 'cliente') return <ClientFollowUps projectId={projectId} />

  return (
    <FollowUpsBoard
      scope={{ project_id: projectId }}
      originDefaults={{ project_id: projectId }}
    />
  )
}
