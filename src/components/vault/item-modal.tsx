'use client'

// Criar/editar item do cofre. O JSON completo (username/senha/url/notas/TOTP seed/
// reprompt) é cifrado AQUI com a vault key antes de ir pra API — só `name` fica claro.

import { useEffect, useState } from 'react'
import { Dices, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import {
  encryptItem, generatePassword, PASSWORD_DEFAULTS, passwordEntropy, passwordStrength,
  type PasswordOptions, type VaultItemData,
} from '@/lib/vault-crypto'

const STRENGTH_LABEL = ['Fraca', 'Razoável', 'Forte', 'Excelente'] as const
const STRENGTH_COLOR = ['var(--danger)', 'var(--warning)', 'var(--success)', 'var(--success)'] as const

export interface ItemModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  vaultId: number
  vaultKey: CryptoKey | undefined
  keyVersion: number
  /** null = criar */
  editing: { id: number; name: string; data: VaultItemData } | null
}

export function ItemModal({ open, onClose, onSaved, vaultId, vaultKey, keyVersion, editing }: ItemModalProps) {
  const [name, setName] = useState('')
  const [form, setForm] = useState<VaultItemData>({})
  const [showPw, setShowPw] = useState(false)
  const [genOpts, setGenOpts] = useState<PasswordOptions>(PASSWORD_DEFAULTS)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setForm(editing?.data ?? {})
      setShowPw(false)
    }
  }, [open, editing])

  const set = (patch: Partial<VaultItemData>) => setForm(f => ({ ...f, ...patch }))

  const roll = () => {
    set({ password: generatePassword(genOpts) })
    setShowPw(true)
  }

  const save = async () => {
    if (!vaultKey || !name.trim()) return
    setBusy(true)
    try {
      const data = await encryptItem(vaultKey, form)
      if (editing) {
        await api.put(`/vault/items/${editing.id}`, { name: name.trim(), data, key_version: keyVersion })
      } else {
        await api.post(`/vault/vaults/${vaultId}/items`, { name: name.trim(), data, key_version: keyVersion })
      }
      toast.success(editing ? 'Item atualizado.' : 'Item criado.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar o item.')
    } finally {
      setBusy(false)
    }
  }

  const s = passwordStrength(form.password ?? '')

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar item' : 'Novo item'} width="max-w-xl">
      <div className="flex flex-col gap-4">
        <TextInput label="Nome do item" autoFocus placeholder="Ex.: AWS produção — conta root" value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Usuário / e-mail" autoComplete="off" value={form.username ?? ''} onChange={e => set({ username: e.target.value })} />
          <TextInput label="URL" placeholder="https://…" value={form.url ?? ''} onChange={e => set({ url: e.target.value })} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Senha</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="ds-input w-full pr-10 font-mono"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password ?? ''}
                onChange={e => set({ password: e.target.value })}
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--text-muted)' }} onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button icon={Dices} onClick={roll} title="Gerar senha forte">Gerar</Button>
          </div>
          {form.password && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: STRENGTH_COLOR[s] }}>{STRENGTH_LABEL[s]} · ~{passwordEntropy(form.password)} bits</span>
              <label className="flex items-center gap-1 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input
                  type="range" min={12} max={40} value={genOpts.length}
                  onChange={e => setGenOpts(o => ({ ...o, length: Number(e.target.value) }))}
                  className="w-24"
                />
                {genOpts.length} chars
              </label>
            </div>
          )}
        </div>

        <TextInput
          label="Seed TOTP (opcional — gera código 2FA do serviço)"
          placeholder="Base32 do serviço (ex.: JBSWY3DP…)"
          autoComplete="off"
          value={form.totp_seed ?? ''}
          onChange={e => set({ totp_seed: e.target.value })}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Notas</label>
          <textarea
            className="ds-input w-full min-h-[70px]"
            value={form.notes ?? ''}
            onChange={e => set({ notes: e.target.value })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={form.reprompt ?? false} onChange={e => set({ reprompt: e.target.checked })} />
          Exigir master password novamente para revelar/copiar este item
        </label>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim() || !vaultKey} onClick={save}>
            {editing ? 'Salvar' : 'Criar item'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
