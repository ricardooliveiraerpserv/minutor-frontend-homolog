'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { MODULES, modulesForUser, writeStoredModule, type ModuleId } from '@/lib/modules'
import { MinutorIcon } from '@/components/branding/MinutorIcon'

// Página inicial dentro de cada módulo ao escolher no launcher.
const MODULE_HOME: Record<ModuleId, string> = {
  servicos: '/timesheets',
  administrativo: '/dashboard',
  crm: '/crm/pipeline',
}

export default function AppsLauncherPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const allowed = modulesForUser(user)

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    // Sem módulos (ex.: cliente) → segue o fluxo normal (portal próprio).
    if (allowed.length === 0) router.replace('/dashboard')
  }, [loading, user, allowed.length, router])

  const pick = (m: ModuleId) => { writeStoredModule(m); router.replace(MODULE_HOME[m]) }

  const tiles = MODULES.filter(m => allowed.includes(m.id))
  if (tiles.length === 0) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-3 mb-1">
        <MinutorIcon size={40} />
        <span className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>Minutor</span>
      </div>
      <p className="text-sm mb-10" style={{ color: 'var(--text-muted)' }}>Escolha um aplicativo</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {tiles.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => pick(m.id)}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl p-10 transition-all hover:scale-[1.02]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="text-5xl" aria-hidden>{m.emoji}</span>
            <span className="text-xl font-bold" style={{ color: 'var(--text)' }}>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
