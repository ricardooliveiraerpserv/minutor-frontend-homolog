'use client'

// Criar/editar credencial. A SENHA é cifrada AQUI com a vaultKey do cliente antes de
// ir pra API (formato v1.); username/URL vão em claro. Servidor nunca vê a senha.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal, Select, TextInput } from '@/components/ds'
import { CopyableInput } from '@/components/environments/env-copyable-input'
import { api, ApiError } from '@/lib/api'
import { aesGcmEncrypt } from '@/lib/vault-crypto'

const CATEGORIES: { v: string; label: string }[] = [
  { v: 'win_admin', label: 'Administrador Windows' },
  { v: 'sql', label: 'Administrador SQL' },
  { v: 'protheus', label: 'Administrador Protheus' },
  { v: 'fluig', label: 'Administrador Fluig' },
  { v: 'totvs_license', label: 'TOTVS License' },
  { v: 'smtp', label: 'SMTP' },
  { v: 'ftp', label: 'FTP' },
  { v: 'azure', label: 'Azure' },
  { v: 'aws', label: 'AWS' },
  { v: 'gcp', label: 'Google Cloud' },
  { v: 'o365', label: 'Office 365' },
  { v: 'portal', label: 'Portal' },
]

export interface EnvCredentialEditing { id: number; category: string; label: string; username: string | null; url: string | null; critical: boolean }

export function EnvCredentialModal({ open, onClose, onSaved, envId, vaultKey }: {
  open: boolean; onClose: () => void; onSaved: () => void; envId: number; vaultKey: CryptoKey | undefined
  editing?: EnvCredentialEditing | null
}) {
  const [category, setCategory] = useState('win_admin')
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [critical, setCritical] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setCategory('win_admin'); setLabel(''); setUsername(''); setUrl(''); setPassword(''); setCritical(false) }
  }, [open])

  const save = async () => {
    if (!vaultKey || !label.trim()) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        category, label: label.trim(),
        username: username.trim() || null,
        url: url.trim() || null,
        critical,
      }
      if (password) body.password_data = await aesGcmEncrypt(vaultKey, password)
      await api.post(`/environments/environments/${envId}/credentials`, body)
      toast.success('Credencial criada.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar credencial.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova credencial" width="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Categoria" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
          </Select>
          <TextInput label="Rótulo" placeholder="Ex.: sa / administrador" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CopyableInput label="Usuário" value={username} onChange={setUsername} />
          <CopyableInput label="URL (opcional)" placeholder="https://…" value={url} onChange={setUrl} />
        </div>
        <CopyableInput label="Senha" password value={password} onChange={setPassword} />
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} />
          Item crítico (SQL admin, root, etc. — reforço de auditoria)
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!label.trim() || !vaultKey} onClick={save}>Criar credencial</Button>
        </div>
      </div>
    </Modal>
  )
}
