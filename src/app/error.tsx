'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6">
      <div className="max-w-xl w-full space-y-4">
        <div className="rounded-lg border border-red-800 bg-[var(--danger-bg)] p-4">
          <p className="text-sm font-semibold text-[var(--danger)] mb-2">Erro na aplicação</p>
          <p className="text-xs text-[var(--danger)] font-mono break-all">{error.message}</p>
          {error.digest && (
            <p className="text-[11px] text-[var(--danger)] mt-1">digest: {error.digest}</p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 overflow-auto max-h-64">
          <p className="text-[11px] text-[var(--text-light)] mb-2 font-medium uppercase tracking-wide">Stack trace</p>
          <pre className="text-[10px] text-[var(--text-muted)] whitespace-pre-wrap break-all leading-relaxed">
            {error.stack}
          </pre>
        </div>

        <button
          onClick={reset}
          className="w-full py-2 rounded-md bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--text)] text-sm transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
