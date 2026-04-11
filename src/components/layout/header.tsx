'use client'

import { Bell, LogOut, User } from 'lucide-react'
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
import { secureUrl } from '@/lib/api'

interface HeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  const { user, logout } = useAuth()
  const router = useRouter()

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
          <h1 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        <button className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <Bell size={16} />
        </button>

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
            <DropdownMenuItem>
              <User size={14} className="mr-2" />
              Perfil
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
