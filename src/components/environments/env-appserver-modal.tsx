'use client'

// AppServer (Protheus) — só metadados em CLARO (arquivo .ini cifrado entra na F1c).
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

export function EnvAppserverModal({ open, onClose, onSaved, envId }: {
  open: boolean; onClose: () => void; onSaved: () => void; envId: number
}) {
  const [f, setF] = useState({ name: '', version: '', build: '', patch: '', root_path: '', port: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ name: '', version: '', build: '', patch: '', root_path: '', port: '' }) }, [open])
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.name.trim()) return
    setBusy(true)
    try {
      await api.post(`/environments/environments/${envId}/appservers`, {
        name: f.name.trim(), version: f.version || null, build: f.build || null,
        patch: f.patch || null, root_path: f.root_path || null, port: f.port ? Number(f.port) : null,
      })
      toast.success('AppServer cadastrado.'); onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo AppServer" width="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Nome" placeholder="APPSERVER01" value={f.name} onChange={e => set('name', e.target.value)} />
          <TextInput label="Versão" placeholder="12.1.2410" value={f.version} onChange={e => set('version', e.target.value)} />
          <TextInput label="Build" value={f.build} onChange={e => set('build', e.target.value)} />
          <TextInput label="Patch" value={f.patch} onChange={e => set('patch', e.target.value)} />
          <TextInput label="RootPath" value={f.root_path} onChange={e => set('root_path', e.target.value)} />
          <TextInput label="Porta" inputMode="numeric" value={f.port} onChange={e => set('port', e.target.value.replace(/\D/g, ''))} />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>Os arquivos appserver.ini/topconnect.ini (cifrados) entram na próxima fase.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={save}>Salvar AppServer</Button>
        </div>
      </div>
    </Modal>
  )
}
