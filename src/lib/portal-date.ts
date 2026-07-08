/**
 * Filtro de data do Portal de Sustentação, repassado às telas embedded (Apontamentos/Despesas/
 * Aprovações/Auditoria) para que usem o filtro de cima e escondam o próprio — um único filtro na tela.
 */
export interface PortalDate {
  mode: 'month' | 'period'
  month: number | null   // 1-12 (null = sem mês)
  year: number | null
  from: string           // YYYY-MM-DD (modo período)
  to: string
}
