'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.toLowerCase().trim() })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao enviar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white tracking-tight">Minutor</div>
          <p className="text-zinc-400 text-sm mt-1">Recuperação de senha</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {success ? (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="text-green-400 text-sm font-medium">Email enviado!</div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Uma senha temporária foi enviada para <span className="text-white">{email}</span>.
                  Verifique sua caixa de entrada e use a senha para fazer login.
                </p>
              </div>
              <Link href="/login">
                <Button className="w-full h-9 bg-blue-600 hover:bg-blue-500 text-white text-sm">
                  Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-zinc-400 text-xs leading-relaxed">
                Digite seu e-mail cadastrado. Enviaremos uma senha temporária para você acessar o sistema.
              </p>

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
                {loading ? 'Enviando...' : 'Enviar senha temporária'}
              </Button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Voltar ao login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
