/**
 * Pool de horas que o Cronograma pode distribuir entre etapas/aportes.
 *
 * Regra (horas do coordenador): as horas disponibilizadas no cronograma são as
 * LIBERADAS À GESTÃO — o banco de coordenação (coordination_hours). Só libera
 * 100% das horas vendidas quando coordination_hours está zerado ou não
 * preenchido. Espelha Project::cronogramaPoolHours() no backend.
 */
export function cronogramaPoolHours(
  project?: { sold_hours?: number | string | null; coordination_hours?: number | string | null } | null
): number {
  const coord = Number(project?.coordination_hours) || 0
  if (coord > 0) return coord
  return Number(project?.sold_hours) || 0
}
