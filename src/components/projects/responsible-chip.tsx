'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { UserCapacityRow } from '@/hooks/use-user-capacity'

interface UserMini {
  id: number
  name: string
  email?: string | null
  profile_photo_url?: string | null
}

interface Props {
  user: UserMini | null | undefined
  capacity?: UserCapacityRow | undefined
  size?: 'sm' | 'default'
  /** Se true, esconde o badge de horas livres / sobrealocada (só nome + avatar). */
  compact?: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar + nome do responsável com indicador de disponibilidade.
 * Reusa `useUserCapacityIndex()` (singleton já compartilhado) — passar `capacity` como prop.
 */
export function ResponsibleChip({ user, capacity, size = 'sm', compact = false }: Props) {
  if (!user) {
    return <span style={{ color: 'var(--text-light)', fontStyle: 'italic', fontSize: 12 }}>sem responsável</span>
  }

  const showBadge = !compact && capacity !== undefined
  const overloaded = capacity?.overload === true || (capacity?.remaining_hours ?? 0) < 0
  const remaining = Math.floor(Math.max(0, capacity?.remaining_hours ?? 0))
  const tight = !overloaded && remaining < 4

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <Avatar size={size}>
        {user.profile_photo_url && <AvatarImage src={user.profile_photo_url} alt={user.name} />}
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <span
        title={user.email ?? undefined}
        style={{
          fontSize: 12,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 140,
        }}
      >
        {user.name}
      </span>
      {showBadge && (
        <span
          title={overloaded ? 'Sobrealocada' : `${remaining}h livres no período`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 999,
            background: overloaded ? 'var(--danger-bg)' : tight ? 'var(--warning-bg)' : 'var(--success-bg)',
            color: overloaded ? 'var(--danger)' : tight ? 'var(--warning)' : 'var(--success)',
            border: `1px solid ${overloaded ? 'var(--danger-border)' : tight ? 'var(--warning-border)' : 'var(--success-border)'}`,
            whiteSpace: 'nowrap',
          }}
        >
          {overloaded ? 'Sobrealocada' : `${remaining}h livres`}
        </span>
      )}
    </span>
  )
}
