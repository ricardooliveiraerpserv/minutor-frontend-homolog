'use client'

import type { PresenceStatusValue } from '@/types/inbox'

const COLOR: Record<PresenceStatusValue, string> = {
  online:  'bg-emerald-500',
  away:    'bg-amber-500',
  offline: 'bg-zinc-600',
}

export function PresenceDot({
  status,
  size = 8,
  className = '',
}: {
  status: PresenceStatusValue
  size?: number
  className?: string
}) {
  return (
    <span
      className={`inline-block rounded-full ring-2 ring-zinc-950 ${COLOR[status]} ${className}`}
      style={{ width: size, height: size }}
      title={status}
    />
  )
}
