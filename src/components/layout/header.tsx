'use client'

import { Bell, LogOut, User, MessageCircle, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { secureUrl, api } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'

interface HeaderProps {
  title?: string
  actions?: React.ReactNode
}

interface Notification {
  id: number
  project_id: number
  project_name: string
  project_code: string
  author_name: string
  preview: string
  created_at: string
}

export function Header({ title, actions }: HeaderProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = () => {
    if (!user || (user.type !== 'admin' && user.type !== 'coordenador')) return
    api.get<Notification[]>('/messages/notifications')
      .then(r => {
        const list = Array.isArray(r) ? r : []
        setNotifications(list)
        setUnread(list.length)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!user) return
    fetchNotifications()
    const id = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(id)
  }, [user])

  // Close bell panel on outside click
  useEffect(() => {
    if (!bellOpen) return
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bellOpen])

  const handleLogout = async () => {
    await logout()
    router.replace('/login')
  }

  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'U'

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b shrink-0" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
      <div className="flex items-center gap-3">
        {title && (
          <h1 className="text-sm font-semibold" style={{ color: 'var(--brand-text)', letterSpacing: '-0.01em' }}>{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        {/* Bell notification — visible for all logged-in users; content scoped server-side */}
        {user && (
          <div ref={bellRef} className="relative">
            <button
              onClick={() => { setBellOpen(v => !v); fetchNotifications() }}
              className="relative p-1.5 rounded-md transition-colors hover:bg-zinc-800"
              style={{ color: bellOpen ? '#00F5FF' : '#71717A' }}
            >
              <Bell size={16} />
              {unread > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center pointer-events-none"
                  style={{ background: '#00F5FF', color: '#0A0A0B' }}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {bellOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden"
                style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} style={{ color: '#00F5FF' }} />
                    <span className="text-xs font-bold" style={{ color: '#FAFAFA' }}>Mensagens não lidas</span>
                    {unread > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>
                        {unread}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setBellOpen(false)} className="p-0.5 rounded hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)' }}>
                    <X size={12} />
                  </button>
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-1">
                      <Bell size={20} style={{ color: 'var(--brand-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Sem mensagens não lidas</p>
                    </div>
                  ) : (
                    <>
                      {notifications.map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            setBellOpen(false)
                            window.location.href = `/gestao-projetos?messages=${n.project_id}`
                          }}
                          className="w-full flex flex-col px-4 py-3 hover:bg-white/5 transition-colors border-b text-left gap-0.5"
                          style={{ borderColor: 'var(--brand-border)' }}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-mono" style={{ color: '#00F5FF' }}>{n.project_code}</span>
                            <span className="text-[9px]" style={{ color: 'var(--brand-muted)' }}>
                              {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[10px] font-semibold truncate" style={{ color: '#71717A' }}>{n.author_name} · {n.project_name}</p>
                          <p className="text-xs truncate" style={{ color: '#FAFAFA' }}>{n.preview}</p>
                        </button>
                      ))}
                      <button
                        onClick={() => { setBellOpen(false); window.location.href = '/gestao-projetos' }}
                        className="w-full py-2 text-center text-[10px] font-semibold hover:bg-white/5 transition-colors"
                        style={{ color: '#00F5FF' }}
                      >
                        Ver todas as mensagens →
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors outline-none">
            <span className="flex items-center gap-2">
              <Avatar className="w-6 h-6">
                <AvatarImage src={secureUrl(user?.profile_photo_url)} />
                <AvatarFallback className="text-xs bg-blue-600 text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">
                {user?.name}
              </span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push('/profile')}>
              <User size={14} className="mr-2" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut size={14} className="mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
