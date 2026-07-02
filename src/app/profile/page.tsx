'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { User, Lock, RefreshCw, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/loading'

// ─── Password mode ────────────────────────────────────────────────────────────

type PasswordMode = 'none' | 'auto' | 'manual'

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()

  // Info fields
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [savingInfo, setSavingInfo] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setEmail(user.email ?? '')
    }
  }, [user])

  // Password section
  const [passwordMode,     setPasswordMode]     = useState<PasswordMode>('none')
  const [currentPassword,  setCurrentPassword]  = useState('')
  const [newPassword,      setNewPassword]      = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [showCurrent,      setShowCurrent]      = useState(false)
  const [showNew,          setShowNew]          = useState(false)
  const [showConfirm,      setShowConfirm]      = useState(false)
  const [generatedPassword,setGeneratedPassword]= useState('')
  const [copied,           setCopied]           = useState(false)
  const [savingPassword,   setSavingPassword]   = useState(false)

  // ── Save name/email
  const saveInfo = async () => {
    setSavingInfo(true)
    try {
      await api.put('/users/profile', { name, email })
      toast.success('Perfil atualizado')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSavingInfo(false)
    }
  }

  // ── Auto-generate password
  const generatePassword = async () => {
    setSavingPassword(true)
    try {
      const r = await api.post<{ temporary_password: string }>('/users/profile/reset-password', {})
      setGeneratedPassword(r.temporary_password)
      toast.success('Nova senha gerada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao gerar senha')
    } finally {
      setSavingPassword(false)
    }
  }

  // ── Manual password change
  const saveManualPassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não conferem')
      return
    }
    if (newPassword.length < 8) {
      toast.error('A senha deve ter no mínimo 8 caracteres')
      return
    }
    setSavingPassword(true)
    try {
      await api.put('/users/profile', {
        current_password:      currentPassword,
        password:              newPassword,
        password_confirmation: confirmPassword,
      })
      toast.success('Senha alterada com sucesso')
      setPasswordMode('none')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao alterar senha')
    } finally {
      setSavingPassword(false)
    }
  }

  const copyGenerated = () => {
    navigator.clipboard.writeText(generatedPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectMode = (mode: PasswordMode) => {
    setPasswordMode(prev => prev === mode ? 'none' : mode)
    setGeneratedPassword('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Meu Perfil">
      <div className="max-w-lg space-y-6">

        {/* ── Dados pessoais ── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--primary-soft)]">
              <User size={14} className="text-[var(--primary)]" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Dados pessoais</h2>
          </div>

          {authLoading && !user ? (
            <div className="space-y-4">
              <div>
                <Skeleton className="h-3 w-12 mb-1.5" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div>
                <Skeleton className="h-3 w-14 mb-1.5" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)}
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">E-mail</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
              </div>

              <div className="flex justify-end">
                <Button onClick={saveInfo} disabled={savingInfo || !name || !email}
                  className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">
                  {savingInfo ? 'Salvando...' : 'Salvar dados'}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* ── Senha ── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--warning-bg)]">
              <Lock size={14} className="text-[var(--warning)]" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Senha</h2>
          </div>

          {/* Modo selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => selectMode('auto')}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                passwordMode === 'auto'
                  ? 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)]'
                  : 'bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
              }`}
            >
              <RefreshCw size={13} />
              Gerar automaticamente
            </button>
            <button
              onClick={() => selectMode('manual')}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                passwordMode === 'manual'
                  ? 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)]'
                  : 'bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
              }`}
            >
              <Lock size={13} />
              Definir manualmente
            </button>
          </div>

          {/* ── Auto-generate ── */}
          {passwordMode === 'auto' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-light)]">
                Uma nova senha segura será gerada. Copie e guarde antes de fechar.
              </p>
              {generatedPassword ? (
                <div className="flex items-center gap-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm text-[var(--warning)] font-mono tracking-wider">
                    {generatedPassword}
                  </code>
                  <button onClick={copyGenerated}
                    className="text-[var(--text-light)] hover:text-[var(--text)] transition-colors">
                    {copied ? <Check size={14} className="text-[var(--success)]" /> : <Copy size={14} />}
                  </button>
                </div>
              ) : (
                <Button onClick={generatePassword} disabled={savingPassword}
                  className="w-full h-9 text-xs bg-[var(--warning-bg)] hover:bg-[var(--warning-border)] text-[var(--primary-fg)] gap-2">
                  <RefreshCw size={13} className={savingPassword ? 'animate-spin' : ''} />
                  {savingPassword ? 'Gerando...' : 'Gerar nova senha'}
                </Button>
              )}
              {generatedPassword && (
                <Button onClick={generatePassword} disabled={savingPassword} variant="outline"
                  className="w-full h-8 text-xs border-[var(--border)] text-[var(--text-muted)] gap-1.5">
                  <RefreshCw size={12} /> Gerar outra
                </Button>
              )}
            </div>
          )}

          {/* ── Manual ── */}
          {passwordMode === 'manual' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Senha atual *</Label>
                <div className="relative mt-1">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs pr-9"
                  />
                  <button onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)] hover:text-[var(--text)]">
                    {showCurrent ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Nova senha * (mín. 8 caracteres)</Label>
                <div className="relative mt-1">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs pr-9"
                  />
                  <button onClick={() => setShowNew(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)] hover:text-[var(--text)]">
                    {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Confirmar nova senha *</Label>
                <div className="relative mt-1">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={`bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs pr-9 ${
                      confirmPassword && confirmPassword !== newPassword ? 'border-[var(--danger-border)]' : ''
                    }`}
                  />
                  <button onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)] hover:text-[var(--text)]">
                    {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[10px] text-[var(--danger)] mt-1">As senhas não conferem</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={saveManualPassword}
                  disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
                  className="h-8 text-xs bg-[var(--warning-bg)] hover:bg-[var(--warning-border)] text-[var(--primary-fg)]">
                  {savingPassword ? 'Salvando...' : 'Alterar senha'}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  )
}
