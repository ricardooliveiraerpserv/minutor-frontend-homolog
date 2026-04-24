'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { User, Lock, RefreshCw, Eye, EyeOff, Copy, Check, Building2 } from 'lucide-react'

// ─── Password mode ────────────────────────────────────────────────────────────

type PasswordMode = 'none' | 'auto' | 'manual'

export default function ProfilePage() {
  const { user } = useAuth()

  // Info fields
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [savingInfo,  setSavingInfo]  = useState(false)
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setEmail(user.email ?? '')
      if (user.customer_id) {
        api.get<any>(`/customers/${user.customer_id}`)
          .then(r => setCompanyName(r?.name ?? null))
          .catch(() => {})
      }
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

        {/* ── Empresa (apenas para clientes) ── */}
        {companyName && (
          <div className="rounded-xl border border-[#00F5FF]/25 bg-gradient-to-br from-[#00F5FF]/10 to-[#00F5FF]/5 px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,245,255,0.15)' }}>
              <Building2 size={20} className="text-[#00F5FF]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#00F5FF]/60 mb-0.5">Empresa</p>
              <p className="text-xl font-bold text-white leading-tight">{companyName}</p>
            </div>
          </div>
        )}

        {/* ── Dados pessoais ── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-600/20">
              <User size={14} className="text-blue-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">Dados pessoais</h2>
          </div>

          <div>
            <Label className="text-xs text-zinc-400">Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveInfo} disabled={savingInfo || !name || !email}
              className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
              {savingInfo ? 'Salvando...' : 'Salvar dados'}
            </Button>
          </div>
        </section>

        {/* ── Senha ── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-yellow-500/15">
              <Lock size={14} className="text-yellow-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">Senha</h2>
          </div>

          {/* Modo selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => selectMode('auto')}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                passwordMode === 'auto'
                  ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <RefreshCw size={13} />
              Gerar automaticamente
            </button>
            <button
              onClick={() => selectMode('manual')}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                passwordMode === 'manual'
                  ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <Lock size={13} />
              Definir manualmente
            </button>
          </div>

          {/* ── Auto-generate ── */}
          {passwordMode === 'auto' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                Uma nova senha segura será gerada. Copie e guarde antes de fechar.
              </p>
              {generatedPassword ? (
                <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm text-yellow-300 font-mono tracking-wider">
                    {generatedPassword}
                  </code>
                  <button onClick={copyGenerated}
                    className="text-zinc-500 hover:text-zinc-200 transition-colors">
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              ) : (
                <Button onClick={generatePassword} disabled={savingPassword}
                  className="w-full h-9 text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white gap-2">
                  <RefreshCw size={13} className={savingPassword ? 'animate-spin' : ''} />
                  {savingPassword ? 'Gerando...' : 'Gerar nova senha'}
                </Button>
              )}
              {generatedPassword && (
                <Button onClick={generatePassword} disabled={savingPassword} variant="outline"
                  className="w-full h-8 text-xs border-zinc-700 text-zinc-400 gap-1.5">
                  <RefreshCw size={12} /> Gerar outra
                </Button>
              )}
            </div>
          )}

          {/* ── Manual ── */}
          {passwordMode === 'manual' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Senha atual *</Label>
                <div className="relative mt-1">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white h-9 text-xs pr-9"
                  />
                  <button onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showCurrent ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Nova senha * (mín. 8 caracteres)</Label>
                <div className="relative mt-1">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white h-9 text-xs pr-9"
                  />
                  <button onClick={() => setShowNew(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Confirmar nova senha *</Label>
                <div className="relative mt-1">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={`bg-zinc-800 border-zinc-700 text-white h-9 text-xs pr-9 ${
                      confirmPassword && confirmPassword !== newPassword ? 'border-red-500' : ''
                    }`}
                  />
                  <button onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[10px] text-red-400 mt-1">As senhas não conferem</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={saveManualPassword}
                  disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
                  className="h-8 text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white">
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
