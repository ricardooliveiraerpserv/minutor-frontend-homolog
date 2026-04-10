'use client'
import { AppLayout } from '@/components/layout/app-layout'
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <AppLayout title="Configurações">
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
        <Settings size={32} className="mb-3 opacity-30" />
        <p className="text-sm">Em breve</p>
      </div>
    </AppLayout>
  )
}
