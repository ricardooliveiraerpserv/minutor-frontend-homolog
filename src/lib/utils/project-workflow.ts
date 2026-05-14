/**
 * Espelha App\Services\ProjectWorkflowService do backend.
 *
 * Lifecycle único, projeções múltiplas — toda derivação de coluna passa por aqui.
 * Não usar `if (status === 'started')` solto. Ver ADR 0002.
 */
import type { ProjectStatus, OperationalColumn } from '@/lib/types/project-stage'

export const STATUS_TO_COLUMN: Record<ProjectStatus, OperationalColumn | null> = {
  awaiting_start:        null,           // pré-kanban — sem coord
  backlog:               'backlog',
  started:               'execution',
  liberado_para_testes:  'homologation',
  finished:              'closed',
  paused:                'paused',
  cancelled:             'cancelled',
}

export const COLUMN_TO_STATUS: Record<OperationalColumn, ProjectStatus> = {
  backlog:       'backlog',
  execution:     'started',
  homologation:  'liberado_para_testes',
  closed:        'finished',
  paused:        'paused',
  cancelled:     'cancelled',
}

export const COLUMN_LABEL: Record<OperationalColumn, string> = {
  backlog:      'Backlog',
  execution:    'Em Execução',
  homologation: 'Homologação',
  closed:       'Encerrado',
  paused:       'Pausado',
  cancelled:    'Cancelado',
}

export function getOperationalColumn(status: ProjectStatus | null | undefined): OperationalColumn | null {
  if (!status) return null
  return STATUS_TO_COLUMN[status] ?? null
}

export function getStatusForColumn(column: OperationalColumn): ProjectStatus {
  return COLUMN_TO_STATUS[column]
}

export const PIPELINE_STATUSES: ProjectStatus[] = [
  'awaiting_start', 'backlog', 'started', 'liberado_para_testes',
]

export const IN_EXECUTION_STATUSES: ProjectStatus[] = [
  'started', 'liberado_para_testes',
]

export const TERMINAL_STATUSES: ProjectStatus[] = [
  'finished', 'paused', 'cancelled',
]
