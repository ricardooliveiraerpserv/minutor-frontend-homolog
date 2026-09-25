'use client'

// ds/ · Accordion — compacto, para ferramenta técnica (pouco espaçamento).
// Cada item é controlled (open + onToggle) OU uncontrolled (defaultOpen).

import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionItemProps {
  title: ReactNode
  icon?: LucideIcon
  badge?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** controlled: se fornecido, o item não gerencia estado interno */
  open?: boolean
  onToggle?: (open: boolean) => void
  className?: string
}

export function AccordionItem({ title, icon: Icon, badge, children, defaultOpen = false, open, onToggle, className }: AccordionItemProps) {
  const [internal, setInternal] = useState(defaultOpen)
  const isOpen = open ?? internal
  const toggle = () => {
    const next = !isOpen
    if (open === undefined) setInternal(next)
    onToggle?.(next)
  }
  return (
    <div className={cn('border-b border-[color:var(--border)] last:border-b-0', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-1 py-2 text-left text-sm font-medium text-[color:var(--fg)] hover:text-[color:var(--accent,#2563eb)]"
      >
        <ChevronDown size={15} className={cn('shrink-0 transition-transform', !isOpen && '-rotate-90')} aria-hidden />
        {Icon && <Icon size={15} className="shrink-0 text-[color:var(--muted-fg)]" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {badge != null && <span className="shrink-0 text-xs text-[color:var(--muted-fg)]">{badge}</span>}
      </button>
      {isOpen && <div className="px-1 pb-3 pt-0.5 text-sm text-[color:var(--muted-fg)]">{children}</div>}
    </div>
  )
}

export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-[color:var(--border)]', className)}>{children}</div>
}
