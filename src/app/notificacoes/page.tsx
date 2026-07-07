'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { NotificationCenter } from '@/components/notifications/notification-center'

export default function NotificacoesPage() {
  const router = useRouter()
  const { user } = useAuth()
  useEffect(() => { if (user?.type === 'cliente') router.replace('/comunicados') }, [user?.type, router])
  return (
    <AppLayout title="Notificações">
      <NotificationCenter />
    </AppLayout>
  )
}
