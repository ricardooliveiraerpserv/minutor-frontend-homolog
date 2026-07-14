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

/** Texto legível sobre um fundo sólido `hex` — escuro p/ cores claras, branco p/ escuras. Serve nos 2 temas. */
export function readableText(hex: string | null | undefined): string {
  const h = (hex || '#64748b').replace('#', '')
  if (h.length < 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f2937' : '#ffffff'
}
