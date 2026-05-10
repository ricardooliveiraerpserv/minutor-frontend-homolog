'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Evita hydration mismatch — renderiza só após montar no client
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'
  const next = isDark ? 'light' : 'dark'

  return (
    <button
      type="button"
      aria-label={mounted ? `Mudar para tema ${next === 'dark' ? 'escuro' : 'claro'}` : 'Mudar tema'}
      onClick={() => setTheme(next)}
      className="p-1.5 rounded-md transition-colors hover:bg-zinc-800/40"
      style={{ color: 'var(--brand-subtle)' }}
    >
      {/* Placeholder transparente até montar pra evitar flash de ícone errado */}
      {!mounted ? (
        <Sun size={16} style={{ opacity: 0 }} />
      ) : isDark ? (
        <Sun size={16} />
      ) : (
        <Moon size={16} />
      )}
    </button>
  )
}
