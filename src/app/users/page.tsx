'use client'
import { AppLayout } from '@/components/layout/app-layout'
import { Users } from 'lucide-react'

export default function UsersPage() {
  return (
    <AppLayout title="Usuários">
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
        <Users size={32} className="mb-3 opacity-30" />
        <p className="text-sm">Em breve</p>
      </div>
    </AppLayout>
  )
}
