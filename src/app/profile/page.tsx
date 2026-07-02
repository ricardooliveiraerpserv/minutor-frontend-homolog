'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect } from 'react'
import { api, ApiError, secureUrl } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { User, Lock, RefreshCw, Eye, EyeOff, Copy, Check, PenLine, Camera, Trash2 } from 'lucide-react'
import { SignatureEditor, type SignatureData } from '@/components/users/signature-editor'

// ─── Password mode ────────────────────────────────────────────────────────────

type PasswordMode = 'none' | 'auto' | 'manual'

// Redimensiona/comprime a foto no navegador (avatar não precisa ser grande) → sempre cabe no limite.
async function compressImage(file: File, maxDim = 512, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return file
    // Se mesmo comprimida passar de 2MB (raríssimo), mantém — o backend ainda valida.
    return new File([blob], (file.name.replace(/\.[^.]+$/, '') || 'foto') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file // navegador sem suporte → envia original (backend valida)
  }
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()

  // Info fields
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [savingInfo, setSavingInfo] = useState(false)

  // Assinatura + foto de perfil
  const [signature,   setSignature]   = useState<SignatureData>({})
  const [savingSig,   setSavingSig]   = useState(false)
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(null)
  const [photoBusy,   setPhotoBusy]   = useState(false)
  const userType = user?.type

  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setEmail(user.email ?? '')
      setPhotoUrl(user.profile_photo_url ?? null)
    }
  }, [user])

  // Carrega a assinatura salva. O cargo vem do vínculo Cargo × Perfil (admin) — não é editável aqui.
  useEffect(() => {
    api.get<{ signature?: SignatureData | null; default_cargo?: string; profile_photo_url?: string | null }>('/users/profile')
      .then(p => {
        const sig = (p.signature as SignatureData | null) ?? {}
        // Foto na assinatura: ligada por padrão quando há foto de perfil (a menos que já tenha sido desmarcada).
        setSignature({ ...sig, role: p.default_cargo || sig.role || 'Consultor', show_photo: sig.show_photo ?? !!p.profile_photo_url })
        if (p.profile_photo_url !== undefined) setPhotoUrl(p.profile_photo_url ?? null)
      })
      .catch(() => setSignature(s => ({ ...s, role: s.role || 'Consultor' })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const saveSignature = async () => {
    setSavingSig(true)
    try {
      // A foto da assinatura é a foto de perfil do sistema (não duplica) → envia sem photo.
      const { photo: _omit, ...rest } = signature
      void _omit
      await api.put('/users/profile', { signature: rest })
      toast.success('Assinatura salva')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar assinatura')
    } finally {
      setSavingSig(false)
    }
  }

  // ── Foto de perfil (avatar do sistema) — disponível para TODOS os perfis ──
  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('photo', compressed)
      const r = await api.post<{ photo_url?: string | null }>('/users/profile/photo', fd)
      if (r.photo_url) setPhotoUrl(r.photo_url)
      await refreshUser()
      toast.success('Foto de perfil atualizada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao enviar a foto')
    } finally {
      setPhotoBusy(false)
    }
  }

  const removePhoto = async () => {
    setPhotoBusy(true)
    try {
      await api.delete('/users/profile/photo')
      setPhotoUrl(null)
      await refreshUser()
      toast.success('Foto removida')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao remover a foto')
    } finally {
      setPhotoBusy(false)
    }
  }

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
      <div className="max-w-2xl space-y-6">

        {/* ── Dados pessoais ── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--primary-soft)]">
              <User size={14} className="text-[var(--primary)]" />
            </div>
            <h2 className="text-sm font-semibold text-white">Dados pessoais</h2>
          </div>

          {/* ── Foto de perfil (avatar do sistema) — todos os perfis, inclusive cliente ── */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[var(--surface-hover)] border border-[var(--border)]">
              {photoUrl
                ? <img src={secureUrl(photoUrl)} alt="" className="w-full h-full object-cover" />
                : <span className="text-lg font-bold text-[var(--text-muted)]">{(name || '?').trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>}
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] text-[var(--text-light)]">Aparece em todo o sistema (menu, topo). JPG/PNG até 2MB.</p>
              <div className="flex items-center gap-2">
                <label className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-xs font-medium cursor-pointer text-[var(--text)] hover:border-[var(--border-strong)] ${photoBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Camera size={13} /> {photoUrl ? 'Trocar foto' : 'Enviar foto'}
                  <input type="file" accept="image/*" className="hidden" disabled={photoBusy}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = '' }} />
                </label>
                {photoUrl && (
                  <button type="button" onClick={removePhoto} disabled={photoBusy}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-xs text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-red-500/50 disabled:opacity-60">
                    <Trash2 size={13} /> Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs text-[var(--text-muted)]">Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-[var(--text-muted)]">E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs" />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveInfo} disabled={savingInfo || !name || !email}
              className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary)] text-white">
              {savingInfo ? 'Salvando...' : 'Salvar dados'}
            </Button>
          </div>
        </section>

        {/* ── Assinatura de e-mail ── */}
        {userType !== 'cliente' && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--purple-bg)]">
                <PenLine size={14} className="text-[var(--purple)]" />
              </div>
              <h2 className="text-sm font-semibold text-white">Assinatura de e-mail</h2>
            </div>

            <SignatureEditor value={signature} onChange={setSignature} name={name} email={email} lockRole hidePhoto />

            <div className="flex justify-end">
              <Button onClick={saveSignature} disabled={savingSig}
                className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary)] text-white">
                {savingSig ? 'Salvando...' : 'Salvar assinatura'}
              </Button>
            </div>
          </section>
        )}

        {/* ── Senha ── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--warning-bg)]">
              <Lock size={14} className="text-[var(--warning)]" />
            </div>
            <h2 className="text-sm font-semibold text-white">Senha</h2>
          </div>

          {/* Modo selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => selectMode('auto')}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                passwordMode === 'auto'
                  ? 'bg-[var(--warning-bg)] border-yellow-500/50 text-[var(--warning)]'
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
                  ? 'bg-[var(--warning-bg)] border-yellow-500/50 text-[var(--warning)]'
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
                  className="w-full h-9 text-xs bg-[var(--warning-bg)] hover:bg-yellow-600 text-white gap-2">
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
                    className="bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs pr-9"
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
                    className="bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs pr-9"
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
                    className={`bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs pr-9 ${
                      confirmPassword && confirmPassword !== newPassword ? 'border-red-500' : ''
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
                  className="h-8 text-xs bg-[var(--warning-bg)] hover:bg-yellow-600 text-white">
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
