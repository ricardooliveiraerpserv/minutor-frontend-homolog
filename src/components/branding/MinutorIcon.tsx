/**
 * Logo símbolo do Minutor — 4 barras verticais.
 *
 * Cor controlada pelo token `--brand-logo` (definido em globals.css):
 *   - light: #06B6D4 (cyan reforçado)
 *   - dark:  var(--primary) (Electric Cyan)
 *
 * O token é INDEPENDENTE de `--primary` (UI). Mudar paleta de UI
 * não afeta marca; rebrand de cor não afeta UI.
 *
 * Variantes:
 *   - "default" (padrão) — usa `var(--brand-logo)`. Adapta ao tema do app.
 *   - "splash"           — força cyan vibrante (var(--primary)). Para fundos
 *                          escuros fixos onde o app não segue o tema
 *                          (ex: tela de login).
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

const SPLASH_COLOR = 'var(--primary)'

export function MinutorIcon({ size = 28, variant = 'default', className }: Props) {
  const fill = variant === 'splash' ? SPLASH_COLOR : 'var(--brand-logo)'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      role="img"
      aria-label="Minutor"
    >
      {BARS.map((b, i) => (
        <rect
          key={i}
          x={b.x * 28 * 0.9 + 2}
          y={b.y * 20 + 4}
          width={4.2}
          height={b.h * 20}
          rx={1.6}
          fill={fill}
        />
      ))}
    </svg>
  )
}
