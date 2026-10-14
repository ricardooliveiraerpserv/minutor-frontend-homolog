'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/auth-context'
import { DeniedActionsProvider } from '@/contexts/denied-actions-context'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'
import { ChatNotifier } from '@/components/inbox/chat-notifier'
import { MeetingAlerts } from '@/components/notifications/meeting-alerts'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Abas de chamados abertos só valem DENTRO do Help Desk: ao navegar p/ fora de /help-desk,
// limpa as chaves hd_open_tickets_*. Fica no Providers (persiste entre rotas → confiável).
function HdTabsGuard() {
  const pathname = usePathname()
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname || pathname.startsWith('/help-desk')) return
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('hd_open_tickets_')) window.localStorage.removeItem(k)
      }
      window.dispatchEvent(new Event('hd-tabs-changed'))
    } catch { /* noop */ }
  }, [pathname])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }))

  // Popup do step-up Microsoft do Cofre: ao retornar com ?vault=..., a própria
  // janela do popup se fecha (a janela principal conclui por polling em
  // /vault/ms/status). Fora do popup, não faz nada.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.name === 'minutor-vault-ms' && new URLSearchParams(window.location.search).has('vault')) {
      window.close()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          <AuthProvider>
            <HdTabsGuard />
            <PresenceHeartbeat />
            <ChatNotifier />
            <MeetingAlerts />
            <DeniedActionsProvider>
              {children}
            </DeniedActionsProvider>
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
