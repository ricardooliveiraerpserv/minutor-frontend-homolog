'use client'

import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from './button'
import { useAsyncAction } from '@/hooks/use-async-action'
import { cn } from '@/lib/utils'

type ButtonProps = ComponentProps<typeof Button>

export interface AsyncButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Handler assíncrono. Enquanto roda, o botão fica desabilitado (anti-duplo-clique) + spinner. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  /** Ícone no estado idle (opcional). */
  icon?: ReactNode
  /** ms até voltar ao idle após success/error. Default 1500. */
  resetAfter?: number
  /** Mostra ✓/✕ momentâneo em success/error. Default true. */
  showResult?: boolean
}

/**
 * Fase 2 — botão oficial de ação. Estados idle / running / success / error (não só "loading"):
 * running → spinner + desabilitado (impede dupla execução); success → ✓; error → ✕.
 */
export function AsyncButton({
  onClick, icon, resetAfter = 1500, showResult = true, disabled, children, className, ...props
}: AsyncButtonProps) {
  const { run, status, running } = useAsyncAction(
    async (e: MouseEvent<HTMLButtonElement>) => { await onClick?.(e) },
    { resetAfter },
  )

  const lead: ReactNode =
    status === 'running' ? <Loader2 className="animate-spin" />
    : showResult && status === 'success' ? <Check style={{ color: 'var(--success, #16a34a)' }} />
    : showResult && status === 'error' ? <AlertCircle style={{ color: 'var(--destructive)' }} />
    : (icon ?? null)

  return (
    <Button
      {...props}
      className={cn(className)}
      disabled={disabled || running}
      aria-busy={running}
      onClick={(e: MouseEvent<HTMLButtonElement>) => { void run(e) }}
    >
      {lead}
      {children}
    </Button>
  )
}
