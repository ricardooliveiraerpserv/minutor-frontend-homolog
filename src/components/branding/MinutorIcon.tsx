/**
 * Logo símbolo — multi-tenant.
 *
 * Renderiza AMBAS as marcas e deixa o CSS mostrar a do tenant ativo (via
 * `:root[data-tenant="conecta"]`, setado no <html> pelo layout raiz a partir do
 * Host). Assim é SSR-safe (sem flash / sem hydration mismatch).
 *
 *  - Grupo (Minutor): 4 barras verticais — cor `--brand-logo`.
 *  - CONECTA: setas convergentes ("ERP no centro de tudo") — cor `--brand-logo`
 *    (que a paleta do tenant define como o roxo #5f12d3).
 *
 * `variant="splash"` força `var(--primary)` (telas de fundo escuro fixo, ex.: login).
 */
type Variant = 'default' | 'splash'

interface Props {
  size?: number
  variant?: Variant
  className?: string
}

const BARS = [
  { x: 0,    h: 0.45, y: 0.55 },
  { x: 0.28, h: 0.75, y: 0.25 },
  { x: 0.56, h: 1.00, y: 0.00 },
  { x: 0.84, h: 0.60, y: 0.40 },
] as const

export function MinutorIcon({ size = 28, variant = 'default', className }: Props) {
  const fill = variant === 'splash' ? 'var(--primary)' : 'var(--brand-logo)'
  const common = { width: size, height: size, className, role: 'img' as const }

  return (
    <>
      {/* Grupo — Minutor */}
      <svg {...common} viewBox="0 0 28 28" fill="none" aria-label="Minutor" data-brand-mark="minutor">
        {BARS.map((b, i) => (
          <rect key={i} x={b.x * 28 * 0.9 + 2} y={b.y * 20 + 4} width={4.2} height={b.h * 20} rx={1.6} fill={fill} />
        ))}
      </svg>

      {/* CONECTA — setas convergentes ao centro */}
      <svg {...common} viewBox="0 0 32 32" fill="none" aria-label="Conecta ERP" data-brand-mark="conecta"
        stroke={fill} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6 L13 13 M13 8.2 L13 13 L8.2 13" />
        <path d="M26 6 L19 13 M19 8.2 L19 13 L23.8 13" />
        <path d="M6 26 L13 19 M8.2 19 L13 19 L13 23.8" />
        <path d="M26 26 L19 19 M23.8 19 L19 19 L19 23.8" />
      </svg>
    </>
  )
}
