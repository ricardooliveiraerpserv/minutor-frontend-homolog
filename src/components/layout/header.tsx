'use client'

import { Bell, LogOut, User, MessageCircle, X, Menu, Check, CheckCheck, ExternalLink } from 'lucide-react'
import { ProjectMessages } from '@/components/shared/ProjectMessages'
import { ProjectViewModal } from '@/components/projects/project-view-modal'
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
import { ChatBell } from './chat-bell'
import { NotificationBell } from './notification-bell'
import { AppsMenu } from './apps-menu'

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
  const [allTab, setAllTab] = useState<'all' | 'unread'>('all')  // aba do modal: Todas / Não lidas
  const [msgProjectId, setMsgProjectId] = useState<number | null>(null)  // chat aberto em overlay (sem sair da tela)
  const [cardProjectId, setCardProjectId] = useState<number | null>(null)  // card do projeto em overlay (acima do chat)

  const notifEndpoint = user?.type === 'cliente' ? '/contract-messages/notifications' : '/messages/notifications'

  const hrefForNotif = (n: Notification): string | undefined =>
    n.contract_id ? `/contratos/pipeline?chat_contract_id=${n.contract_id}`
    : n.project_id ? `/gestao-projetos?messages=${n.project_id}`
    : undefined

  // Abre a mensagem em OVERLAY, sem trocar de tela, e marca como LIDA (abrir = ler).
  const openMessage = (n: Notification) => {
    if (n.is_unread) markNotifRead(n)
    if (n.project_id) { setMsgProjectId(n.project_id); return }
    if (n.contract_id) window.open(`/contratos/pipeline?chat_contract_id=${n.contract_id}`, '_blank')
  }

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

  // Marcar lido: mark-read é por projeto/contrato (marca todas as mensagens dele). Update OTIMISTA
  // e SEM refetch — o refetch reverteria a leitura recém-feita por eventual consistency (read replica).
  const markNotifRead = (n: Notification) => {
    const url = n.contract_id ? `/contracts/${n.contract_id}/messages/mark-read`
      : n.project_id ? `/projects/${n.project_id}/messages/mark-read` : null
    if (!url) return
    const same = (x: Notification) => n.contract_id ? x.contract_id === n.contract_id : x.project_id === n.project_id
    const freed = allItems.filter(x => same(x) && x.is_unread).length || 1
    setAllItems(items => items.map(x => same(x) ? { ...x, is_unread: false } : x))
    setNotifications(items => items.map(x => same(x) ? { ...x, is_unread: false } : x))
    setUnread(u => Math.max(0, u - freed))
    api.post(url, {}).catch(() => {})
  }

  const markAllRead = () => {
    const urls = new Set<string>()
    allItems.filter(x => x.is_unread).forEach(n => {
      const url = n.contract_id ? `/contracts/${n.contract_id}/messages/mark-read`
        : n.project_id ? `/projects/${n.project_id}/messages/mark-read` : null
      if (url && !urls.has(url)) { urls.add(url); api.post(url, {}).catch(() => {}) }
    })
    setAllItems(items => items.map(x => ({ ...x, is_unread: false })))
    setNotifications(items => items.map(x => ({ ...x, is_unread: false })))
    setUnread(0)
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
    <header className="flex items-center justify-between h-14 px-4 md:px-6 border-b shrink-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            aria-label="Abrir menu"
            className="md:hidden p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hover)] shrink-0"
            style={{ color: 'var(--text)' }}
          >
            <Menu size={18} />
          </button>
        )}
        {title && (
          <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">

        {actions}

        {/* Launcher de módulos (Administrativo / Serviços) */}
        {user && user.type !== 'cliente' && <AppsMenu />}

        {/* Theme toggle — sun/moon */}
        <ThemeToggle />

        {/* Mentions bell — todos os perfis (cliente também, pra fases que ele recebe mensagens:
            chat de requisição até req_decided_at + chat de contrato com visibility=client).
            Backend /me/mentions filtra mentions de chat de projeto pro cliente (regra ADR cards). */}
        {user && <MentionsBell />}
        {user && <ChatBell />}

        {/* Sino do Meu Dia — notificações informativas + enquetes (sem execução) */}
        {user && user.type !== 'cliente' && <NotificationBell />}

        {/* Ícone de mensagens (chat de projeto/contrato) REMOVIDO — não é usado. */}
        {false && user && (
          <div ref={bellRef} className="relative">
            <button
              onClick={() => { setBellOpen(v => !v); fetchNotifications() }}
              className="relative p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: bellOpen ? 'var(--primary)' : '#71717A' }}
            >
              <MessageCircle size={16} />
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
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} style={{ color: 'var(--primary)' }} />
                    <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>Mensagens não lidas</span>
                    {unread > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        {unread}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setBellOpen(false)} className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                    <X size={12} />
                  </button>
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-1">
                      <MessageCircle size={20} style={{ color: 'var(--text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--text-light)' }}>Sem mensagens</p>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const href = hrefForNotif(n)
                      return (
                        <div
                          key={n.id}
                          onClick={() => { setBellOpen(false); openMessage(n) }}
                          className="flex gap-2 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors border-b cursor-pointer"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          {/* Indicador de não-lida */}
                          <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full" style={{ background: n.is_unread ? 'var(--primary)' : 'transparent' }} title={n.is_unread ? 'Não lida' : 'Lida'} />
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[10px] font-mono truncate" style={{ color: 'var(--primary)' }}>
                                {[n.project_code, n.customer_name].filter(Boolean).join(' · ')}
                              </span>
                              <span className="text-[9px] shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                                {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[10px] font-semibold truncate" style={{ color: 'var(--text-muted)' }}>{n.author_name} · {n.project_name}</p>
                            <p className="text-xs truncate" style={{ color: n.is_unread ? 'var(--text)' : 'var(--text-muted)' }}>{n.preview}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <button
                    onClick={openAllMessages}
                    className="block w-full py-2 text-center text-[10px] font-semibold hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ color: 'var(--primary)' }}
                  >
                    Ver todas as mensagens →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors outline-none">
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
              <span className="text-xs text-[var(--text-muted)] dark:text-[var(--text)] max-w-[120px] truncate">
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
            <DropdownMenuItem onClick={handleLogout} className="text-[var(--danger)]">
              <LogOut size={14} className="mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modal "Ver todas as mensagens" — tabela do histórico, na própria tela (não navega). */}
      {allOpen && (() => {
        const unreadCount = allItems.filter(x => x.is_unread).length
        const shown = allTab === 'unread' ? allItems.filter(x => x.is_unread) : allItems
        return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setAllOpen(false)}>
          <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl flex flex-col overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={16} style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Todas as mensagens</span>
              </div>
              <button onClick={() => setAllOpen(false)} className="p-1 rounded hover:bg-[var(--surface-hover)]"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            {/* Abas Todas / Não lidas + marcar todas como lidas */}
            <div className="flex items-center justify-between px-5 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
                {([['all', 'Todas'], ['unread', `Não lidas${unreadCount ? ` (${unreadCount})` : ''}`]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setAllTab(id)} className="px-3 py-1 font-medium transition-colors"
                    style={{ background: allTab === id ? 'var(--primary)' : 'transparent', color: allTab === id ? 'var(--primary-fg)' : 'var(--text-muted)' }}>{label}</button>
                ))}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs font-semibold flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--primary)' }}>
                  <CheckCheck size={13} /> Marcar todas como lidas
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {allLoading ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Carregando…</p>
              ) : shown.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>{allTab === 'unread' ? 'Nenhuma mensagem não lida. 🎉' : 'Sem mensagens.'}</p>
              ) : (
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col style={{ width: '23%' }} />
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th className="text-left font-semibold px-3 py-2">Código · Cliente</th>
                      <th className="text-left font-semibold px-3 py-2">Projeto</th>
                      <th className="text-left font-semibold px-3 py-2">Autor</th>
                      <th className="text-left font-semibold px-3 py-2">Mensagem</th>
                      <th className="text-left font-semibold px-3 py-2">Data</th>
                      <th className="text-right font-semibold px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(n => {
                      const codigo = [n.project_code, n.customer_name].filter(Boolean).join(' · ')
                      return (
                        <tr key={n.id} onClick={() => openMessage(n)} className="border-t hover:bg-[var(--surface-hover)] cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <span className="mt-1 shrink-0 w-2 h-2 rounded-full" style={{ background: n.is_unread ? 'var(--primary)' : 'transparent' }} title={n.is_unread ? 'Não lida' : 'Lida'} />
                              <span className="font-mono truncate" style={{ color: 'var(--primary)' }} title={codigo}>{codigo}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top truncate" style={{ color: 'var(--text-muted)' }} title={n.project_name}>{n.project_name}</td>
                          <td className="px-3 py-2 align-top truncate" style={{ color: 'var(--text-muted)' }} title={n.author_name}>{n.author_name}</td>
                          <td className="px-3 py-2 align-top truncate" style={{ color: n.is_unread ? 'var(--text)' : 'var(--text-muted)' }} title={n.preview}>{n.preview}</td>
                          <td className="px-3 py-2 align-top truncate" style={{ color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center justify-end gap-1">
                              {n.is_unread && (
                                <button onClick={(e) => { e.stopPropagation(); markNotifRead(n) }} title="Marcar como lida" className="p-1 rounded hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}>
                                  <Check size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        )
      })()}

      {/* Chat da mensagem — overlay global (NÃO troca de tela). Fica ACIMA do modal "Todas" (z-80),
          então ao fechar volta pro "Ver todos" se veio de lá, ou pra tela atual se veio do sino. */}
      {msgProjectId != null && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMsgProjectId(null)}>
          <div className="w-full max-w-2xl h-[85vh] rounded-2xl flex flex-col overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={16} style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Mensagens</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setCardProjectId(msgProjectId)} className="text-xs font-semibold flex items-center gap-1 hover:underline" style={{ color: 'var(--primary)' }}>
                  <ExternalLink size={13} /> Ver card
                </button>
                <button onClick={() => setMsgProjectId(null)} className="p-1 rounded hover:bg-[var(--surface-hover)]"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectMessages projectId={msgProjectId} userRole={user?.type ?? undefined} />
            </div>
          </div>
        </div>
      )}

      {/* Card do projeto em overlay — z-100 (acima do chat z-90). Ao fechar volta pro chat.
          O ProjectViewModal é z-60; o container z-100 cria stacking context p/ ficar por cima. */}
      {cardProjectId != null && (
        <div className="fixed inset-0 z-[100]">
          <ProjectViewModal projectId={cardProjectId} onClose={() => setCardProjectId(null)} userRole={user?.type ?? undefined} initialTab="overview" />
        </div>
      )}
    </header>
  )
}
