"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxProps = Omit<CheckboxPrimitive.Root.Props, "className"> & {
  className?: string
  /** Rótulo clicável exibido ao lado do controle. */
  label?: React.ReactNode
  /** Texto auxiliar em `--text-muted` (some quando há erro). */
  helper?: React.ReactNode
  /** Mensagem de erro; ativa o estado `aria-invalid`. */
  error?: string
}

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox(
  { className, label, helper, error, indeterminate, id, ...props },
  ref
) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const helperId = `${fieldId}-helper`
  const errorId = `${fieldId}-error`
  const describedBy = error ? errorId : helper ? helperId : undefined

  const control = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={fieldId}
      data-slot="checkbox"
      indeterminate={indeterminate}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--field)] outline-none transition-[background-color,border-color,box-shadow] duration-[.12s]",
        "hover:border-[var(--primary)]",
        "focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "data-[checked]:border-[var(--primary)] data-[checked]:bg-[var(--primary)]",
        "data-[indeterminate]:border-[var(--primary)] data-[indeterminate]:bg-[var(--primary)]",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        "data-[readonly]:cursor-default",
        "aria-invalid:border-[var(--danger-border)] aria-invalid:hover:border-[var(--danger-border)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--primary-fg)]">
        {indeterminate ? (
          <MinusIcon className="size-3" strokeWidth={3} />
        ) : (
          <CheckIcon className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (!label && !helper && !error) {
    return control
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {control}
        {label && (
          <label
            htmlFor={fieldId}
            className={cn(
              "text-sm leading-tight font-medium text-[var(--text)] select-none",
              props.disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer"
            )}
          >
            {label}
          </label>
        )}
      </div>
      {error ? (
        <p id={errorId} className="pl-6 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        helper && (
          <p id={helperId} className="pl-6 text-xs text-[var(--text-muted)]">
            {helper}
          </p>
        )
      )}
    </div>
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
export type { CheckboxProps }
