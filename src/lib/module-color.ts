// Cor determinística por módulo (a key vem do nav-config; funciona p/ módulos
// customizados). Paleta curada — mesma key → sempre a mesma cor.
const PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ec4899', // pink
  '#f97316', // orange
  '#0ea5e9', // sky
  '#84cc16', // lime
]

export function moduleColor(key: string | null | undefined): string {
  if (!key) return PALETTE[0]
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/** Cor por ÍNDICE do módulo (sem colisão entre módulos adjacentes — ex.: Serviços × Administrativo). */
export function moduleColorByIndex(i: number): string {
  const n = ((i % PALETTE.length) + PALETTE.length) % PALETTE.length
  return PALETTE[n]
}
