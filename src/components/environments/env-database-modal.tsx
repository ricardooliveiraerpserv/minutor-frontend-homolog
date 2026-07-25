'use client'

// Banco de dados. Senha cifrada no client com a vaultKey antes de ir pra API.
import { useEffect, useState } from 'react'
import { Dices, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, Select, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { aesGcmEncrypt, generatePassword, PASSWORD_DEFAULTS } from '@/lib/vault-crypto'

export function EnvDatabaseModal({ open, onClose, onSaved, envId, vaultKey }: {
  open: boolean; onClose: () => void; onSaved: () => void; envId: number; vaultKey: CryptoKey | undefined
}) {
  const [f, setF] = useState({ engine: 'sqlserver', server: '', port: '', instance: '', database: '', username: '' })
  const [password, setPassword] = useState('')
  const [alwaysOn, setAlwaysOn] = useState(false)
  const [critical, setCritical] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setF({ engine: 'sqlserver', server: '', port: '', instance: '', database: '', username: '' }); setPassword(''); setAlwaysOn(false); setCritical(false); setShowPw(false) } }, [open])
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!vaultKey || !f.server.trim()) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        engine: f.engine, server: f.server.trim(),
        port: f.port ? Number(f.port) : null, instance: f.instance || null,
        database: f.database || null, username: f.username || null,
        always_on: alwaysOn, critical,
      }
      if (password) body.password_data = await aesGcmEncrypt(vaultKey, password)
      await api.post(`/environments/environments/${envId}/databases`, body)
      toast.success('Banco cadastrado.'); onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo banco de dados" width="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Engine" value={f.engine} onChange={e => set('engine', e.target.value)}>
            <option value="sqlserver">SQL Server</option><option value="postgres">PostgreSQL</option>
            <option value="oracle">Oracle</option><option value="mysql">MySQL</option>
          </Select>
          <TextInput label="Servidor" placeholder="SRVSQL01" value={f.server} onChange={e => set('server', e.target.value)} />
          <TextInput label="Porta" inputMode="numeric" placeholder="1433" value={f.port} onChange={e => set('port', e.target.value.replace(/\D/g, ''))} />
          <TextInput label="Instância" value={f.instance} onChange={e => set('instance', e.target.value)} />
          <TextInput label="Database" value={f.database} onChange={e => set('database', e.target.value)} />
          <TextInput label="Usuário" autoComplete="off" value={f.username} onChange={e => set('username', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Senha</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input className="ds-input w-full pr-10 font-mono" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--text-muted)' }} onClick={() => setShowPw(v => !v)}>{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            <Button icon={Dices} onClick={() => { setPassword(generatePassword(PASSWORD_DEFAULTS)); setShowPw(true) }}>Gerar</Button>
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}><input type="checkbox" checked={alwaysOn} onChange={e => setAlwaysOn(e.target.checked)} /> AlwaysOn</label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} /> Crítico</label>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!f.server.trim() || !vaultKey} onClick={save}>Salvar banco</Button>
        </div>
      </div>
    </Modal>
  )
}
