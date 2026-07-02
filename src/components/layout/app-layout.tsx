'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { Building2, User } from 'lucide-react'

// Banner de ambiente: cores distintas para evitar confundir DEV ↔ HOMOLOG ↔ PROD.
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV
const ENV_BANNER =
  APP_ENV === 'dev'
    ? { bg: '#FACC15', fg: '#000', text: '⚠ AMBIENTE DE DESENVOLVIMENTO — DADOS DESCARTÁVEIS ⚠' }
    : APP_ENV === 'homolog'
    ? { bg: '#DC2626', fg: '#fff', text: '⚠ AMBIENTE DE HOMOLOGAÇÃO — NÃO USE DADOS REAIS ⚠' }
    : null

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
}

export function AppLayout({ children, title, actions }: AppLayoutProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [companyName, setCompanyName] = useState<string | null>(null)
  // Drawer de navegação no mobile (sidebar off-canvas).
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Fecha o drawer ao trocar de rota.
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

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
      <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const isCliente = user.type === 'cliente'
  const displayName = isCliente ? companyName : (user.name ?? null)

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Faixa de ambiente — só aparece em DEV ou HOMOLOG ── */}
      {ENV_BANNER && (
        <div className="shrink-0 flex items-center justify-center gap-3 py-1.5 z-50"
          style={{ background: ENV_BANNER.bg }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.25em',
            color: ENV_BANNER.fg,
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            {ENV_BANNER.text}
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar user={user} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header title={title} actions={actions} onMenuClick={() => setMobileNavOpen(true)} />

          {/* ── Faixa de identidade ── */}
          {displayName && (
            <div
              className="shrink-0 flex items-center gap-3 px-4 md:px-6 py-2 border-b"
              style={{
                borderColor: isCliente
                  ? 'color-mix(in srgb, var(--primary) 25%, transparent)'
                  : 'var(--border)',
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
                    : user.type === 'parceiro_admin'
                      ? ((user as any).is_executive ? 'Parceiro Gestor' : 'Parceiro')
                    : 'Consultor'}
                </span>
              )}
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
