'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'

function LoginForm() {
  const { login } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const passwordChanged = searchParams.get('senha_alterada') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
          onChange={e => setEmail(e.target.value.toLowerCase())}
          placeholder="seu@email.com"
          required
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-zinc-300 text-xs">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-9 pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
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
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="Minutor" width={160} height={64} className="object-contain" priority />
          </div>
          <p className="text-zinc-400 text-sm mt-1">Gestão de horas e despesas</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
