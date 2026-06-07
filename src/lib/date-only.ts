/**
 * Helpers para campos DATE-ONLY (sem hora) — ex.: expected_end_date, due_date,
 * planned_start_at, contributed_at. O backend os serializa como meia-noite UTC
 * ("2026-07-04T00:00:00Z"); `new Date(...)` joga pro dia anterior no fuso BR
 * (UTC−3), causando off-by-one. Estes helpers tratam só a parte YYYY-MM-DD.
 */

/** Formata uma data-only como DD/MM/AAAA, sem deslocar o dia pelo fuso. */
export function fmtDateBR(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

/** Interpreta uma data-only como meia-noite LOCAL (para comparações / diff de dias). */
export function parseDateLocal(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
