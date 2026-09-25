'use client'

// ds/ · Breadcrumb — muitos níveis, trunca o meio preservando primeiro e último,
// itens clicáveis, path longo NÃO quebra o layout (colapso do meio + truncamento por item).

import { Fragment } from 'react'
import Link from 'next/link'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  href?: string
  onClick?: () => void
  title?: string
}

interface BreadcrumbProps {
  items: Crumb[]
  /** Máximo de itens antes de colapsar o meio (default 5). Sempre preserva o 1º e o último. */
  maxItems?: number
  className?: string
}

export function Breadcrumb({ items, maxItems = 5, className }: BreadcrumbProps) {
  const collapsed = items.length > maxItems
  // preserva 1º + últimos (maxItems-2); colapsa o miolo num "…"
  const shown: (Crumb | 'ellipsis')[] = collapsed
    ? [items[0], 'ellipsis', ...items.slice(items.length - (maxItems - 2))]
    : items

  return (
    <nav
      aria-label="breadcrumb"
      className={cn('flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm', className)}
    >
      {shown.map((it, i) => {
        const last = i === shown.length - 1
        if (it === 'ellipsis') {
          const hidden = items.slice(1, items.length - (maxItems - 2)).map((c) => c.label).join(' / ')
          return (
            <Fragment key={`e-${i}`}>
              <span
                className="inline-flex items-center px-1 text-[color:var(--muted-fg)]"
                title={hidden}
                aria-label={`níveis ocultos: ${hidden}`}
              >
                <MoreHorizontal size={15} />
              </span>
              <Sep />
            </Fragment>
          )
        }
        const content = (
          <span className="max-w-[220px] truncate align-middle" title={it.title ?? it.label}>
            {it.label}
          </span>
        )
        return (
          <Fragment key={i}>
            {last || (!it.href && !it.onClick) ? (
              <span
                aria-current={last ? 'page' : undefined}
                className={cn(
                  'min-w-0 px-1',
                  last ? 'font-medium text-[color:var(--fg)]' : 'text-[color:var(--muted-fg)]',
                )}
              >
                {content}
              </span>
            ) : it.href ? (
              <Link href={it.href} className="min-w-0 rounded px-1 text-[color:var(--muted-fg)] hover:text-[color:var(--fg)] hover:underline">
                {content}
              </Link>
            ) : (
              <button type="button" onClick={it.onClick} className="min-w-0 rounded px-1 text-[color:var(--muted-fg)] hover:text-[color:var(--fg)] hover:underline">
                {content}
              </button>
            )}
            {!last && <Sep />}
          </Fragment>
        )
      })}
    </nav>
  )
}

function Sep() {
  return <ChevronRight size={14} className="shrink-0 text-[color:var(--muted-fg)] opacity-60" aria-hidden />
}
