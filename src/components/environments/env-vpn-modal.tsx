'use client'

// VPN (Fortinet/OpenVPN). Senha cifrada no client (arquivo .ovpn cifrado entra na F1c).
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, Select, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { aesGcmEncrypt } from '@/lib/vault-crypto'

export function EnvVpnModal({ open, onClose, onSaved, envId, vaultKey }: {
  open: boolean; onClose: () => void; onSaved: () => void; envId: number; vaultKey: CryptoKey | undefined
}) {
  const [f, setF] = useState({ provider: 'fortinet', server: '', port: '', group: '', username: '' })
  const [password, setPassword] = useState('')
  const [critical, setCritical] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ provider: 'fortinet', server: '', port: '', group: '', username: '' }); setPassword(''); setCritical(false); setShowPw(false) } }, [open])
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!vaultKey) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        provider: f.provider, server: f.server || null, port: f.port ? Number(f.port) : null,
        group: f.group || null, username: f.username || null, critical,
      }
      if (password) body.password_data = await aesGcmEncrypt(vaultKey, password)
      await api.post(`/environments/environments/${envId}/vpns`, body)
      toast.success('VPN cadastrada.'); onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova VPN" width="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Provedor" value={f.provider} onChange={e => set('provider', e.target.value)}>
            <option value="fortinet">Fortinet</option><option value="openvpn">OpenVPN</option><option value="other">Outro</option>
          </Select>
          <TextInput label="Servidor" placeholder="vpn.cliente.com" value={f.server} onChange={e => set('server', e.target.value)} />
          <TextInput label="Porta" inputMode="numeric" value={f.port} onChange={e => set('port', e.target.value.replace(/\D/g, ''))} />
          <TextInput label="Grupo" value={f.group} onChange={e => set('group', e.target.value)} />
          <TextInput label="Usuário" autoComplete="off" value={f.username} onChange={e => set('username', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Senha</label>
          <div className="relative">
            <input className="ds-input w-full pr-10 font-mono" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--text-muted)' }} onClick={() => setShowPw(v => !v)}>{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} /> Crítico</label>
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>O arquivo .ovpn (cifrado no client) entra na próxima fase.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!vaultKey} onClick={save}>Salvar VPN</Button>
        </div>
      </div>
    </Modal>
  )
}
