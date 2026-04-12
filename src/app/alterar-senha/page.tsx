'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AlterarSenhaPage() {
  const router = useRouter()
  const { logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('A confirmação da senha não confere')
      return
    }

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/change-temporary-password', {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      })
      // Após trocar senha, todos os tokens são revogados — fazer logout limpo
      await logout()
      router.replace('/login?senha_alterada=1')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao alterar senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white tracking-tight">Minutor</div>
          <p className="text-zinc-400 text-sm mt-1">Alterar senha</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-md px-3 py-2 leading-relaxed">
            Você está usando uma senha temporária. Defina uma nova senha para continuar.
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="current" className="text-zinc-300 text-xs">Senha temporária</Label>
            <div className="relative">
              <Input
                id="current"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-9 pr-9"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)} tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors">
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new" className="text-zinc-300 text-xs">Nova senha</Label>
            <div className="relative">
              <Input
                id="new"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-9 pr-9"
              />
              <button type="button" onClick={() => setShowNew(v => !v)} tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-zinc-300 text-xs">Confirmar nova senha</Label>
            <Input
              id="confirm"
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-9"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-950/30 border border-red-900 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-9 bg-blue-600 hover:bg-blue-500 text-white text-sm"
          >
            {loading ? 'Alterando...' : 'Definir nova senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
