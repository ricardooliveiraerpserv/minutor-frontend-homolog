/**
 * Logo símbolo do Minutor — 4 barras verticais.
 *
 * Por padrão usa `var(--primary)` (theme-aware): cyan vibrante (#00F5FF) no
 * dark, cyan reforçado (#06B6D4) no light. Permite passar `color` explícita
 * quando o componente é usado em fundo escuro fixo (ex: splash de login).
 */
interface Props {
  size?: number
  /** Sobrescreve a cor das barras. Default: `var(--primary)`. */
  color?: string
  className?: string
}

const BARS = [
  { x: 0,    h: 0.45, y: 0.55 },
  { x: 0.28, h: 0.75, y: 0.25 },
  { x: 0.56, h: 1.00, y: 0.00 },
  { x: 0.84, h: 0.60, y: 0.40 },
] as const

export function MinutorIcon({ size = 28, color = 'var(--primary)', className }: Props) {
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
          fill={color}
        />
      ))}
    </svg>
  )
}
