'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal, Select, TextInput } from '@/components/ds'
import { CopyableInput } from '@/components/environments/env-copyable-input'
import { api, ApiError } from '@/lib/api'

const KINDS: { v: string; label: string }[] = [
  { v: 'fluig', label: 'Fluig' }, { v: 'tss', label: 'TSS' }, { v: 'portal', label: 'Portal TOTVS' },
  { v: 'powerbi', label: 'Power BI' }, { v: 'rdp', label: 'RDP' }, { v: 'sharepoint', label: 'SharePoint' },
  { v: 'azure', label: 'Azure' }, { v: 'aws', label: 'AWS' }, { v: 'other', label: 'Outro' },
]

export function EnvLinkModal({ open, onClose, onSaved, envId }: { open: boolean; onClose: () => void; onSaved: () => void; envId: number }) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('portal')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setLabel(''); setUrl(''); setKind('portal') } }, [open])

  const save = async () => {
    if (!label.trim() || !url.trim()) return
    setBusy(true)
    try {
      await api.post(`/environments/environments/${envId}/links`, { label: label.trim(), url: url.trim(), kind })
      toast.success('Link adicionado.'); onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo link">
      <div className="flex flex-col gap-4">
        <TextInput label="Rótulo" placeholder="Portal Fluig" value={label} onChange={e => setLabel(e.target.value)} />
        <CopyableInput label="URL" placeholder="https://…" value={url} onChange={setUrl} />
        <Select label="Tipo" value={kind} onChange={e => setKind(e.target.value)}>
          {KINDS.map(k => <option key={k.v} value={k.v}>{k.label}</option>)}
        </Select>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!label.trim() || !url.trim()} onClick={save}>Salvar link</Button>
        </div>
      </div>
    </Modal>
  )
}
