"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

type ChipVariant = "neutral" | "info" | "success" | "warning" | "danger"

type ChipProps = {
  variant?: ChipVariant
  /** Estilo de contorno: fundo transparente + borda/texto na cor da variante. */
  outline?: boolean
  /** Ícone opcional à esquerda. */
  icon?: React.ReactNode
  /** Exibe botão de remover (X) e dispara o callback. */
  onRemove?: () => void
  /** Torna o chip clicável (com estados de hover/foco). */
  onClick?: () => void
  className?: string
  children: React.ReactNode
}

/** Fundo suave (padrão) por variante. */
const SOLID: Record<ChipVariant, string> = {
  neutral: "bg-[var(--neutral-bg)] text-[var(--text-muted)]",
  info: "bg-[var(--info-bg)] text-[var(--info)]",
  success: "bg-[var(--success-bg)] text-[var(--success)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
}

/** Contorno por variante. */
const OUTLINE: Record<ChipVariant, string> = {
  neutral: "border-[var(--border)] text-[var(--text-muted)]",
  info: "border-[var(--info-border)] text-[var(--info)]",
  success: "border-[var(--success-border)] text-[var(--success)]",
  warning: "border-[var(--warning-border)] text-[var(--warning)]",
  danger: "border-[var(--danger-border)] text-[var(--danger)]",
}

function Chip({
  variant = "neutral",
  outline = false,
  icon,
  onRemove,
  onClick,
  className,
  children,
}: ChipProps) {
  const clickable = typeof onClick === "function"

  const base = cn(
    "inline-flex h-5 max-w-full items-center gap-1 rounded-md border px-2 text-[11.5px] font-medium whitespace-nowrap outline-none transition-[background-color,border-color,box-shadow] duration-[.12s]",
    outline ? "bg-transparent" : "border-transparent",
    outline ? OUTLINE[variant] : SOLID[variant],
    clickable &&
      "cursor-pointer hover:brightness-[.97] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
    className
  )

  const content = (
    <>
      {icon && (
        <span className="flex shrink-0 items-center [&_svg]:size-3">{icon}</span>
      )}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remover"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 flex shrink-0 items-center justify-center rounded-sm opacity-70 outline-none transition-opacity duration-[.12s] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="size-3" />
        </button>
      )}
    </>
  )

  if (clickable) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {content}
      </button>
    )
  }

  return <span className={base}>{content}</span>
}

export { Chip }
export type { ChipProps, ChipVariant }
