'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/auth-context'
import { DeniedActionsProvider } from '@/contexts/denied-actions-context'
import { VaultProvider } from '@/contexts/vault-context'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'
import { ChatNotifier } from '@/components/inbox/chat-notifier'
import { useState } from 'react'

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
        nonce={nonce}
      >
        <TooltipProvider>
          <AuthProvider>
            <PresenceHeartbeat />
            <ChatNotifier />
            {/* VaultProvider app-wide: unlock persiste na navegação (Cofre ↔ Ambientes ↔ Config) — só
                fetcha quando há user; auto-lock por timeout mantém a segurança. */}
            <VaultProvider>
              <DeniedActionsProvider>
                {children}
              </DeniedActionsProvider>
            </VaultProvider>
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
