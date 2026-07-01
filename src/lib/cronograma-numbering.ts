import type { ScheduleStage } from '@/hooks/use-project-schedule'

/**
 * Numeração hierárquica visual do Cronograma (Fase 7).
 *
 * Etapas viram 1, 2, 3... pela posição no array já ordenado por `order_index`.
 * Atividades viram 1.1, 1.2... pela posição dentro da etapa pai.
 * NÃO é id técnico nem chave — é índice operacional visual.
 *
 * Recalcula em todo render (pure function), espelhando sempre a ordem visual.
 */

export interface CronogramaCodes {
  stageCode: (stageId: number) => string
  activityCode: (deliveryId: number) => string
}

export function buildCronogramaCodes(stages: ScheduleStage[]): CronogramaCodes {
  const stageMap = new Map<number, string>()
  const activityMap = new Map<number, string>()

  const byOrder = (a: ScheduleStage, b: ScheduleStage) => (a.order_index ?? 0) - (b.order_index ?? 0)
  const topStages = stages.filter(s => s.parent_stage_id == null).sort(byOrder)
  const childrenOf = (id: number) => stages.filter(s => s.parent_stage_id === id).sort(byOrder)

  topStages.forEach((etapa, i) => {
    const etapaCode = String(i + 1)
    stageMap.set(etapa.id, etapaCode)

    // Numeração de 2º nível compartilhada entre atividades diretas e sub-etapas
    // (garante unicidade quando a etapa tem os dois).
    let second = 0
    ;(etapa.deliveries ?? []).forEach(d => {
      second++
      activityMap.set(d.id, `${etapaCode}.${second}`)
    })
    childrenOf(etapa.id).forEach(sub => {
      second++
      const subCode = `${etapaCode}.${second}`
      stageMap.set(sub.id, subCode)
      ;(sub.deliveries ?? []).forEach((d, k) => {
        activityMap.set(d.id, `${subCode}.${k + 1}`)
      })
    })
  })

  return {
    stageCode: (id: number) => stageMap.get(id) ?? '',
    activityCode: (id: number) => activityMap.get(id) ?? '',
  }
}
