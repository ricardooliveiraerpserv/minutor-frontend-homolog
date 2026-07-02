'use client'

import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from './button'
import { useAsyncAction } from '@/hooks/use-async-action'
import { cn } from '@/lib/utils'

type ButtonProps = ComponentProps<typeof Button>

export interface AsyncButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Handler assíncrono. Enquanto roda: desabilita (anti-duplo-clique imediato) + spinner (após ~120ms). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  /** Ícone no estado idle (opcional). */
  icon?: ReactNode
  /** ms até voltar ao idle após success/error. Default 1500. */
  resetAfter?: number
  /** Mostra ✓/✕ momentâneo em success/error. Default true. */
  showResult?: boolean
  /**
   * Preserva 100% o visual de um botão existente (v1.0 congelada): renderiza um <button> cru
   * só com a `className` passada + a máquina de estado. Sem o cva do Button oficial.
   * Use ao migrar botões custom; para botões novos, prefira o Button oficial (variant/size).
   */
  unstyled?: boolean
}

/**
 * Fase 2 — botão oficial de ação. Estados idle / running / success / error (Regra 4), com
 * trava de duplo-clique (Regra 3/P4) e anti-flicker (Regra 5) herdados de useAsyncAction.
 * NÃO contém regra de negócio (Regra 3) — só o ciclo de vida visual.
 */
export function AsyncButton({
  onClick, icon, resetAfter = 1500, showResult = true, unstyled, disabled, children, className, ...props
}: AsyncButtonProps) {
  const { run, status, running, pending } = useAsyncAction(
    async (e: MouseEvent<HTMLButtonElement>) => { await onClick?.(e) },
    { resetAfter },
  )

  const lead: ReactNode =
    running ? <Loader2 className="animate-spin" />
    : showResult && status === 'success' ? <Check style={{ color: 'var(--success, #16a34a)' }} />
    : showResult && status === 'error' ? <AlertCircle style={{ color: 'var(--destructive)' }} />
    : (icon ?? null)

  const handle = (e: MouseEvent<HTMLButtonElement>) => { void run(e) }

  if (unstyled) {
    return (
      <button
        type="button"
        {...(props as ComponentProps<'button'>)}
        className={cn('inline-flex items-center', className)}
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={handle}
      >
        {lead}
        {children}
      </button>
    )
  }

  return (
    <Button
      {...props}
      className={cn(className)}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={handle}
    >
      {lead}
      {children}
    </Button>
  )
}
