"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<SwitchPrimitive.Root.Props, "className"> & {
  className?: string
  /** Rótulo clicável exibido ao lado do controle. */
  label?: React.ReactNode
  /** Texto auxiliar em `--text-muted` (some quando há erro). */
  helper?: React.ReactNode
  /** Mensagem de erro; ativa o estado `aria-invalid`. */
  error?: string
  /** Exibe spinner e bloqueia interação. */
  loading?: boolean
}

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch(
  { className, label, helper, error, loading, disabled, id, ...props },
  ref
) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const helperId = `${fieldId}-helper`
  const errorId = `${fieldId}-error`
  const describedBy = error ? errorId : helper ? helperId : undefined
  const isDisabled = disabled || loading

  const control = (
    <SwitchPrimitive.Root
      ref={ref}
      id={fieldId}
      data-slot="switch"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-sunken)] outline-none transition-[background-color,border-color,box-shadow] duration-[.12s]",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "data-[checked]:border-[var(--primary)] data-[checked]:bg-[var(--primary)]",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        "aria-invalid:border-[var(--danger-border)] aria-invalid:hover:border-[var(--danger-border)]",
        loading && "cursor-wait",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="flex size-4 translate-x-0.5 items-center justify-center rounded-full bg-[white] shadow-sm transition-transform duration-[.12s] data-[checked]:translate-x-[18px]">
        {loading && (
          <Loader2 className="size-2.5 animate-spin text-[var(--text-muted)]" />
        )}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )

  if (!label && !helper && !error) {
    return control
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {control}
        {label && (
          <label
            htmlFor={fieldId}
            className={cn(
              "text-sm leading-none font-medium text-[var(--text)] select-none",
              isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
          >
            {label}
          </label>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        helper && (
          <p id={helperId} className="text-xs text-[var(--text-muted)]">
            {helper}
          </p>
        )
      )}
    </div>
  )
})
Switch.displayName = "Switch"

export { Switch }
export type { SwitchProps }
