const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** R$ 1.234,56 */
export function formatBRL(value: number): string {
  return BRL.format(value)
}

/** 1.234,56 (sem símbolo) */
export function formatNumber(value: number): string {
  return NUM.format(value)
}
