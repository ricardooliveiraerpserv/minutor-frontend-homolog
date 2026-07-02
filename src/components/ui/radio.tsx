"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"

import { cn } from "@/lib/utils"

type RadioGroupProps = Omit<RadioGroupPrimitive.Props, "className"> & {
  className?: string
  /** Rótulo do grupo. */
  label?: React.ReactNode
  /** Texto auxiliar em `--text-muted` (some quando há erro). */
  helper?: React.ReactNode
  /** Mensagem de erro; ativa o estado `aria-invalid`. */
  error?: string
  /** Direção dos itens. */
  orientation?: "vertical" | "horizontal"
}

const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive>,
  RadioGroupProps
>(function RadioGroup(
  { className, label, helper, error, orientation = "vertical", children, ...props },
  ref
) {
  const generatedId = React.useId()
  const helperId = `${generatedId}-helper`
  const errorId = `${generatedId}-error`
  const describedBy = error ? errorId : helper ? helperId : undefined

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-sm leading-none font-medium text-[var(--text)]">
          {label}
        </span>
      )}
      <RadioGroupPrimitive
        ref={ref}
        data-slot="radio-group"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "flex",
          orientation === "horizontal"
            ? "flex-row flex-wrap gap-x-5 gap-y-2"
            : "flex-col gap-2",
          className
        )}
        {...props}
      >
        {children}
      </RadioGroupPrimitive>
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
RadioGroup.displayName = "RadioGroup"

type RadioProps = Omit<RadioPrimitive.Root.Props, "className"> & {
  className?: string
  /** Rótulo clicável exibido ao lado do controle. */
  label?: React.ReactNode
}

const Radio = React.forwardRef<
  React.ComponentRef<typeof RadioPrimitive.Root>,
  RadioProps
>(function Radio({ className, label, id, ...props }, ref) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId

  const control = (
    <RadioPrimitive.Root
      ref={ref}
      id={fieldId}
      data-slot="radio"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--field)] outline-none transition-[background-color,border-color,box-shadow] duration-[.12s]",
        "hover:border-[var(--primary)]",
        "focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "data-[checked]:border-[var(--primary)] data-[checked]:bg-[var(--primary)]",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="flex items-center justify-center">
        <span className="size-1.5 rounded-full bg-[var(--primary-fg)]" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )

  if (!label) {
    return control
  }

  return (
    <div className="flex items-center gap-2">
      {control}
      <label
        htmlFor={fieldId}
        className={cn(
          "text-sm leading-none font-medium text-[var(--text)] select-none",
          props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        )}
      >
        {label}
      </label>
    </div>
  )
})
Radio.displayName = "Radio"

export { Radio, RadioGroup }
export type { RadioProps, RadioGroupProps }
