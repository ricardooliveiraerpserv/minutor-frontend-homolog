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
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
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
      >
        <TooltipProvider>
          <AuthProvider>
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
