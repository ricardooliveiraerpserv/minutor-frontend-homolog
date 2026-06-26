'use client'

import { Bell, LogOut, User, MessageCircle, X, Menu } from 'lucide-react'
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
import { ThemeToggle } from './ThemeToggle'
import { MentionsBell } from './mentions-bell'

interface HeaderProps {
  title?: string
  actions?: React.ReactNode
  onMenuClick?: () => void
}

interface Notification {
  id: number
  project_id?: number
  contract_id?: number
  project_name: string
  project_code?: string
  customer_name?: string
  author_name: string
  preview: string
  created_at: string
  is_unread?: boolean
}

export function Header({ title, actions, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  // Modal "Ver todas as mensagens" — tabela do histórico completo, na própria tela.
  const [allOpen, setAllOpen] = useState(false)
  const [allItems, setAllItems] = useState<Notification[]>([])
  const [allLoading, setAllLoading] = useState(false)

  const notifEndpoint = user?.type === 'cliente' ? '/contract-messages/notifications' : '/messages/notifications'

  const hrefForNotif = (n: Notification): string | undefined =>
    n.contract_id ? `/contratos/pipeline?chat_contract_id=${n.contract_id}`
    : n.project_id ? `/gestao-projetos?messages=${n.project_id}`
    : undefined

  const fetchNotifications = () => {
    if (!user) return
    api.get<any>(`${notifEndpoint}?limit=10`)
      .then(r => {
        const items: Notification[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : []
        setNotifications(items)
        setUnread(typeof r?.unread === 'number' ? r.unread : items.length)
      })
      .catch(() => {})
  }

  const openAllMessages = () => {
    setBellOpen(false)
    setAllOpen(true)
    setAllLoading(true)
    api.get<any>(`${notifEndpoint}?limit=100`)
      .then(r => setAllItems(Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : []))
      .catch(() => setAllItems([]))
      .finally(() => setAllLoading(false))
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
    <header className="flex items-center justify-between h-14 px-4 md:px-6 border-b shrink-0" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            aria-label="Abrir menu"
            className="md:hidden p-1.5 rounded-md transition-colors hover:bg-zinc-800 shrink-0"
            style={{ color: 'var(--brand-text)' }}
          >
            <Menu size={18} />
          </button>
        )}
        {title && (
          <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)', letterSpacing: '-0.01em' }}>{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">

        {actions}

        {/* Theme toggle — sun/moon */}
        <ThemeToggle />

        {/* Mentions bell — todos os perfis (cliente também, pra fases que ele recebe mensagens:
            chat de requisição até req_decided_at + chat de contrato com visibility=client).
            Backend /me/mentions filtra mentions de chat de projeto pro cliente (regra ADR cards). */}
        {user && <MentionsBell />}

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
                  style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
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
                      <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Sem mensagens</p>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const href = hrefForNotif(n)
                      return (
                        <div
                          key={n.id}
                          onClick={() => { setBellOpen(false); if (href) router.push(href) }}
                          className="flex gap-2 px-4 py-3 hover:bg-white/5 transition-colors border-b cursor-pointer"
                          style={{ borderColor: 'var(--brand-border)' }}
                        >
                          {/* Indicador de não-lida */}
                          <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full" style={{ background: n.is_unread ? '#00F5FF' : 'transparent' }} title={n.is_unread ? 'Não lida' : 'Lida'} />
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[10px] font-mono truncate" style={{ color: '#00F5FF' }}>
                                {[n.project_code, n.customer_name].filter(Boolean).join(' · ')}
                              </span>
                              <span className="text-[9px] shrink-0 ml-2" style={{ color: 'var(--brand-muted)' }}>
                                {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[10px] font-semibold truncate" style={{ color: '#71717A' }}>{n.author_name} · {n.project_name}</p>
                            <p className="text-xs truncate" style={{ color: n.is_unread ? '#FAFAFA' : '#A1A1AA' }}>{n.preview}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <button
                    onClick={openAllMessages}
                    className="block w-full py-2 text-center text-[10px] font-semibold hover:bg-white/5 transition-colors"
                    style={{ color: '#00F5FF' }}
                  >
                    Ver todas as mensagens →
                  </button>
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
                <AvatarFallback
                  className="text-xs"
                  style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
                >
                  {initials}
                </AvatarFallback>
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

      {/* Modal "Ver todas as mensagens" — tabela do histórico, na própria tela (não navega). */}
      {allOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setAllOpen(false)}>
          <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl flex flex-col overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={16} style={{ color: '#00F5FF' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Todas as mensagens</span>
                {unread > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>{unread} não lida(s)</span>}
              </div>
              <button onClick={() => setAllOpen(false)} className="p-1 rounded hover:bg-white/5"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
            <div className="flex-1 overflow-auto">
              {allLoading ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Carregando…</p>
              ) : allItems.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Sem mensagens.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
                    <tr style={{ color: 'var(--brand-muted)' }}>
                      <th className="px-3 py-2 w-6"></th>
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Código · Cliente</th>
                      <th className="text-left font-semibold px-3 py-2">Projeto</th>
                      <th className="text-left font-semibold px-3 py-2">Autor</th>
                      <th className="text-left font-semibold px-3 py-2">Mensagem</th>
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Data</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map(n => {
                      const href = hrefForNotif(n)
                      return (
                        <tr key={n.id} className="border-t hover:bg-white/5" style={{ borderColor: 'var(--brand-border)' }}>
                          <td className="px-3 py-2 align-top"><span className="inline-block w-2 h-2 rounded-full" style={{ background: n.is_unread ? '#00F5FF' : 'transparent' }} title={n.is_unread ? 'Não lida' : 'Lida'} /></td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap align-top" style={{ color: '#00F5FF' }}>{[n.project_code, n.customer_name].filter(Boolean).join(' · ')}</td>
                          <td className="px-3 py-2 align-top" style={{ color: 'var(--brand-muted)' }}>{n.project_name}</td>
                          <td className="px-3 py-2 align-top whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{n.author_name}</td>
                          <td className="px-3 py-2 align-top max-w-xs truncate" style={{ color: n.is_unread ? 'var(--brand-text)' : 'var(--brand-muted)' }} title={n.preview}>{n.preview}</td>
                          <td className="px-3 py-2 align-top whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>{new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-3 py-2 align-top">{href && <button onClick={() => { setAllOpen(false); router.push(href) }} className="font-semibold whitespace-nowrap" style={{ color: '#00F5FF' }}>Acessar →</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
