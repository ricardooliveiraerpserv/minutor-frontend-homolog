'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const passwordChanged = searchParams.get('senha_alterada') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { requiresPasswordChange } = await login(email, password)
      if (requiresPasswordChange) {
        router.replace('/alterar-senha')
      } else {
        router.replace('/dashboard')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white tracking-tight">Minutor</div>
          <p className="text-zinc-400 text-sm mt-1">Gestão de horas e despesas</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {passwordChanged && (
            <p className="text-green-400 text-xs bg-green-950/30 border border-green-900 rounded-md px-3 py-2">
              Senha alterada com sucesso! Faça login com a nova senha.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-zinc-300 text-xs">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-zinc-300 text-xs">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>

          <div className="text-center">
            <Link
              href="/esqueci-senha"
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Esqueceu a senha?
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
