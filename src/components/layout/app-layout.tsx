'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { ModuleProvider } from '@/contexts/module-context'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { NotificationPopups } from '@/components/notifications/notification-popups'
import { NavConfigProvider } from '@/contexts/nav-config-context'
import { useDeniedActions } from '@/contexts/denied-actions-context'
import { Building2, User, Lock } from 'lucide-react'

// Banner de ambiente: cores distintas para evitar confundir DEV ↔ HOMOLOG ↔ PROD.
// Faixa de ambiente é única, no layout raiz (src/app/layout.tsx). Aqui não duplica.

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
}

export function AppLayout({ children, title, actions }: AppLayoutProps) {
  const { user, loading } = useAuth()
  const { isDenied } = useDeniedActions()
  const router = useRouter()
  const pathname = usePathname()
  // Guard CENTRAL de 'view': se o admin bloqueou a visualização desta tela p/ este usuário
  // (Configurador → Ações), a tela inteira fica travada — vale p/ TODAS as telas de uma vez.
  const viewBlocked = isDenied(pathname, 'view')
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
      <div className="flex items-center justify-center bg-[var(--bg)]" style={{ height: 'calc(100vh - var(--env-banner-h, 0px))' }}>
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const isCliente = user.type === 'cliente'
  const displayName = isCliente ? companyName : (user.name ?? null)

  return (
    <NavConfigProvider>
    <ModuleProvider>
    <div className="flex flex-col overflow-hidden" style={{ background: 'var(--bg)', height: 'calc(100vh - var(--env-banner-h, 0px))' }}>

      {/* Pop-ups globais da Central de Notificações (avisos / decisões / enquetes) — exceto cliente. */}
      {user.type !== 'cliente' && <NotificationPopups userId={user.id} />}

      <ModuleProvider>
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
            {viewBlocked ? (
              <div className="flex flex-col items-center justify-center text-center py-24">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  <Lock size={26} />
                </div>
                <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>Acesso não liberado</p>
                <p className="text-sm mt-1 max-w-md" style={{ color: 'var(--text-light)' }}>
                  Você não tem permissão para visualizar esta tela. Fale com um administrador.
                </p>
              </div>
            ) : children}
          </main>
        </div>
      </div>
      </ModuleProvider>
    </div>
    </ModuleProvider>
    </NavConfigProvider>
  )
}
