'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { Building2, User } from 'lucide-react'

const IS_HOMOLOG = process.env.NEXT_PUBLIC_APP_ENV === 'homolog'

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
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--brand-bg)' }}>

      {/* ── Faixa HOMOLOG — só aparece quando NEXT_PUBLIC_APP_ENV=homolog ── */}
      {IS_HOMOLOG && (
        <div className="shrink-0 flex items-center justify-center gap-3 py-1.5 z-50"
          style={{ background: '#DC2626' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.25em',
            color: '#fff',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            ⚠ AMBIENTE DE HOMOLOGAÇÃO — NÃO USE DADOS REAIS ⚠
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar user={user} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header title={title} actions={actions} />

          {/* ── Faixa de identidade ── */}
          {displayName && (
            <div
              className="shrink-0 flex items-center gap-3 px-6 py-2 border-b"
              style={{
                borderColor: isCliente
                  ? 'color-mix(in srgb, var(--primary) 25%, transparent)'
                  : 'var(--brand-border)',
                background: isCliente
                  ? 'linear-gradient(to right, var(--primary-soft), transparent)'
                  : 'var(--surface)',
              }}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'var(--primary-soft)' }}
              >
                {isCliente
                  ? <Building2 size={13} style={{ color: 'var(--primary)' }} />
                  : <User size={13} style={{ color: 'var(--primary)' }} />}
              </div>
              <span
                className="text-sm font-bold truncate"
                style={{ color: isCliente ? 'var(--primary)' : 'var(--text)' }}
              >
                {displayName}
              </span>
              {!isCliente && (
                <span
                  className="text-[10px] uppercase tracking-wider font-semibold shrink-0"
                  style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}
                >
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
    </div>
  )
}
