'use client'

// Certificado A1. Senha do PFX cifrada no client (env_secrets). O ARQUIVO .pfx é
// enviado depois, também cifrado no client (componente EnvEncryptedFile na tabela).
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, Select, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { aesGcmEncrypt } from '@/lib/vault-crypto'

export function EnvCertificateModal({ open, onClose, onSaved, envId, vaultKey }: {
  open: boolean; onClose: () => void; onSaved: () => void; envId: number; vaultKey: CryptoKey | undefined
}) {
  const [f, setF] = useState({ name: '', type: 'A1', issuer: '', valid_from: '', valid_to: '' })
  const [pfxPass, setPfxPass] = useState('')
  const [critical, setCritical] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ name: '', type: 'A1', issuer: '', valid_from: '', valid_to: '' }); setPfxPass(''); setCritical(false); setShowPw(false) } }, [open])
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!vaultKey || !f.name.trim()) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        name: f.name.trim(), type: f.type, issuer: f.issuer || null,
        valid_from: f.valid_from || null, valid_to: f.valid_to || null, critical,
      }
      if (pfxPass) body.pfx_pass_data = await aesGcmEncrypt(vaultKey, pfxPass)
      await api.post(`/environments/environments/${envId}/certificates`, body)
      toast.success('Certificado cadastrado. Agora envie o arquivo .pfx na tabela.')
      onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo certificado" width="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Nome" placeholder="Certificado Receita" value={f.name} onChange={e => set('name', e.target.value)} />
          <Select label="Tipo" value={f.type} onChange={e => set('type', e.target.value)}>
            <option value="A1">A1</option><option value="A3">A3</option>
          </Select>
          <TextInput label="Emissor (opcional)" value={f.issuer} onChange={e => set('issuer', e.target.value)} />
          <div />
          <TextInput label="Validade (início)" type="date" value={f.valid_from} onChange={e => set('valid_from', e.target.value)} />
          <TextInput label="Validade (fim)" type="date" value={f.valid_to} onChange={e => set('valid_to', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Senha do PFX</label>
          <div className="relative">
            <input className="ds-input w-full pr-10 font-mono" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pfxPass} onChange={e => setPfxPass(e.target.value)} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--text-muted)' }} onClick={() => setShowPw(v => !v)}>{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} /> Crítico (ex.: cert Receita)</label>
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>O arquivo .pfx é enviado depois pela tabela — cifrado no seu navegador antes do upload.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!f.name.trim() || !vaultKey} onClick={save}>Salvar certificado</Button>
        </div>
      </div>
    </Modal>
  )
}
