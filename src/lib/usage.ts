// Telemetria de uso (Fase de Consolidação do Help Desk).
//
// Registra interações que o backend não enxerga sozinho (abrir o Customer 360, expandir
// blocos, tempo no painel). Best-effort: NUNCA bloqueia a UI nem propaga erro. Apenas
// coleta — sem dashboards. É a base de evidências para a futura Central Inteligente (IA).

import { api } from '@/lib/api'

export function recordUsage(
  feature: string,
  action: string,
  opts?: { entityType?: string; entityId?: number; workSessionId?: number; metadata?: Record<string, unknown> },
): void {
  try {
    api.post('/help-desk/usage', {
      feature,
      action,
      entity_type: opts?.entityType ?? null,
      entity_id: opts?.entityId ?? null,
      work_session_id: opts?.workSessionId ?? null,
      metadata: opts?.metadata ?? null,
    }).catch(() => { /* telemetria é best-effort */ })
  } catch { /* nunca quebra a UI */ }
}
