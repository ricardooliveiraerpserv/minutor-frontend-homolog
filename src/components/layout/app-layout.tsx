'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { Building2, User } from 'lucide-react'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
}

export function AppLayout({ children, title, actions }: AppLayoutProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (user?.type === 'cliente' && user.customer_id) {
      api.get<any>(`/customers/${user.customer_id}`)
        .then(r => setCompanyName(r?.name ?? null))
        .catch(() => {})
    } else {
      setCompanyName(null)
    }
  }, [user?.type, user?.customer_id])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const isCliente = user.type === 'cliente'
  const displayName = isCliente ? companyName : (user.name ?? null)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--brand-bg)' }}>
      <Sidebar user={user} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} actions={actions} />

        {/* ── Faixa de identidade ── */}
        {displayName && (
          <div className={`shrink-0 flex items-center gap-3 px-6 py-2 border-b ${
            isCliente
              ? 'border-[#00F5FF]/20 bg-gradient-to-r from-[#00F5FF]/10 to-transparent'
              : 'border-zinc-800 bg-zinc-900/60'
          }`}>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
              isCliente ? 'bg-[#00F5FF]/15' : 'bg-zinc-700/60'
            }`}>
              {isCliente
                ? <Building2 size={13} className="text-[#00F5FF]" />
                : <User size={13} className="text-zinc-400" />}
            </div>
            <span className={`text-sm font-bold truncate ${
              isCliente ? 'text-[#00F5FF]' : 'text-white'
            }`}>
              {displayName}
            </span>
            {!isCliente && (
              <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium shrink-0">
                {user.type === 'admin' ? 'Admin'
                  : user.type === 'administrativo' ? 'Administrativo'
                  : user.type === 'coordenador' ? 'Coordenador'
                  : user.type === 'parceiro' ? 'Parceiro'
                  : 'Consultor'}
              </span>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
