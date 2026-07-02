'use client'

import { useState } from 'react'
import { AlertTriangle, RefreshCw, Copy, ChevronDown, ChevronRight, Loader2, Check } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

/** Serializa qualquer erro (incl. ApiError { status, message, data }) em texto copiável. */
export function errorToText(error: unknown): string {
  if (!error) return ''
  if (error instanceof Error) {
    const anyErr = error as unknown as { status?: number; data?: unknown; stack?: string }
    const parts = [`${error.name}: ${error.message}`]
    if (typeof anyErr.status === 'number') parts.push(`HTTP ${anyErr.status}`)
    if (anyErr.data) { try { parts.push(JSON.stringify(anyErr.data, null, 2)) } catch { /* noop */ } }
    if (anyErr.stack) parts.push(anyErr.stack)
    return parts.join('\n')
  }
  try { return JSON.stringify(error, null, 2) } catch { return String(error) }
}

export interface ErrorStateProps {
  title?: string
  message?: string
  error?: unknown
  /** Se passado, mostra "Tentar novamente" com loading próprio durante o retry. */
  onRetry?: () => void | Promise<void>
  className?: string
}

/**
 * Fase 2 — componente OFICIAL de erro persistente (não some como toast).
 * Mensagem amigável + Tentar novamente (com loading) + detalhes técnicos recolhidos + copiar erro.
 */
export function ErrorState({ title = 'Algo deu errado', message, error, onRetry, className }: ErrorStateProps) {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [copied, setCopied] = useState(false)
  const technical = errorToText(error)
  const friendly = message ?? (error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.')

  const doRetry = async () => {
    if (!onRetry || retrying) return
    setRetrying(true)
    try { await onRetry() } finally { setRetrying(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(technical); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }

  return (
    <div
      className={cn('rounded-xl border p-4 flex flex-col gap-3', className)}
      style={{ borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)', background: 'color-mix(in srgb, var(--destructive) 6%, transparent)' }}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{title}</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{friendly}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {onRetry && (
          <Button size="sm" onClick={doRetry} disabled={retrying} aria-busy={retrying}>
            {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Tentar novamente
          </Button>
        )}
        {technical && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)}>
              {open ? <ChevronDown /> : <ChevronRight />} Detalhes
            </Button>
            <Button size="sm" variant="ghost" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copiado' : 'Copiar erro'}
            </Button>
          </>
        )}
      </div>
      {open && technical && (
        <pre
          className="text-xs overflow-auto max-h-48 rounded-lg p-2.5 whitespace-pre-wrap break-words"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >{technical}</pre>
      )}
    </div>
  )
}

/** Variante compacta inline (formulários, campos, linhas de tabela). */
export function InlineError({ message, error, onRetry, className }: Omit<ErrorStateProps, 'title'>) {
  const [retrying, setRetrying] = useState(false)
  const friendly = message ?? (error instanceof Error ? error.message : 'Falhou. Tente novamente.')
  const doRetry = async () => { if (!onRetry || retrying) return; setRetrying(true); try { await onRetry() } finally { setRetrying(false) } }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)} style={{ color: 'var(--destructive)' }}>
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{friendly}</span>
      {onRetry && (
        <button type="button" onClick={doRetry} disabled={retrying} className="underline underline-offset-2 disabled:opacity-50">
          {retrying ? '…' : 'tentar novamente'}
        </button>
      )}
    </span>
  )
}
