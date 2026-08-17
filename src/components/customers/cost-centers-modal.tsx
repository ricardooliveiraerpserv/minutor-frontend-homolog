'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X, Plus, Pencil, Trash2, Upload, Download, Check } from 'lucide-react'

interface CostCenter { id: number; code: string; description: string; active: boolean }

/** URLs que o gestor de centros de custo usa — variam entre admin (por cliente) e portal (cliente logado). */
export interface CostCenterEndpoints {
  list: string
  create: string
  update: (id: number) => string
  remove: (id: number) => string
  import: string
  template: string   // caminho ABSOLUTO (/api/v1/...) — baixado via fetch
}

/** Endpoints do ADMIN (cadastro por cliente na tela de Clientes). */
export function adminCostCenterEndpoints(customerId: number): CostCenterEndpoints {
  return {
    list:     `/customers/${customerId}/cost-centers`,
    create:   `/customers/${customerId}/cost-centers`,
    update:   (id) => `/cost-centers/${id}`,
    remove:   (id) => `/cost-centers/${id}`,
    import:   `/customers/${customerId}/cost-centers/import`,
    template: `/api/v1/cost-centers/template`,
  }
}

/** Endpoints do PORTAL (o próprio cliente gerencia os seus). */
export const portalCostCenterEndpoints: CostCenterEndpoints = {
  list:     `/client/portal/my-cost-centers`,
  create:   `/client/portal/my-cost-centers`,
  update:   (id) => `/client/portal/my-cost-centers/${id}`,
  remove:   (id) => `/client/portal/my-cost-centers/${id}`,
  import:   `/client/portal/my-cost-centers/import`,
  template: `/api/v1/client/portal/my-cost-centers/template`,
}

/** Gestor de centros de custo (lista + criar/editar/excluir + importar Excel + baixar modelo). */
export function CostCentersManager({ endpoints, canEdit }: { endpoints: CostCenterEndpoints; canEdit: boolean }) {
  const [rows, setRows] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState<CostCenter | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    api.get<{ data: CostCenter[] }>(endpoints.list)
      .then(r => setRows(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar centros de custo'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [endpoints.list])

  const resetForm = () => { setCode(''); setDescription(''); setEditing(null) }

  const salvar = async () => {
    const c = code.trim(); const d = description.trim()
    if (!c || !d) { toast.error('Informe código e descrição.'); return }
    setSaving(true)
    try {
      if (editing) await api.put(endpoints.update(editing.id), { code: c, description: d, active: editing.active })
      else await api.post(endpoints.create, { code: c, description: d })
      toast.success(editing ? 'Centro de custo atualizado' : 'Centro de custo criado')
      resetForm(); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const startEdit = (cc: CostCenter) => { setEditing(cc); setCode(cc.code); setDescription(cc.description) }

  const excluir = async (cc: CostCenter) => {
    if (!confirm(`Excluir o centro de custo "${cc.code} — ${cc.description}"?`)) return
    try { await api.delete(endpoints.remove(cc.id)); toast.success('Centro de custo excluído'); if (editing?.id === cc.id) resetForm(); load() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao excluir') }
  }

  const importar = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post<{ message: string }>(endpoints.import, fd)
      toast.success(r?.message ?? 'Importação concluída'); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro na importação') }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const baixarModelo = async () => {
    try {
      const res = await fetch(endpoints.template, { credentials: 'same-origin' })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'modelo_centro_custo.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao baixar o modelo') }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-[110px]">
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Código</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Ex.: CC001"
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="flex-[2] min-w-[160px]">
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Descrição</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: WMS" onKeyDown={e => { if (e.key === 'Enter') salvar() }}
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <button type="button" onClick={salvar} disabled={saving} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
            {editing ? <Check size={14} /> : <Plus size={14} />}{editing ? 'Salvar' : 'Adicionar'}
          </button>
          {editing && <button type="button" onClick={resetForm} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>Cancelar edição</button>}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importar(f) }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium disabled:opacity-50" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Upload size={14} /> {importing ? 'Importando…' : 'Importar Excel'}
          </button>
          <button type="button" onClick={baixarModelo} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Download size={14} /> Baixar modelo
          </button>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Colunas: <b>codigo</b>, <b>descricao</b></span>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-hover)' }}>
              <th className="text-left px-3 py-2 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Código</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Descrição</th>
              {canEdit && <th className="px-3 py-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={canEdit ? 3 : 2} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={canEdit ? 3 : 2} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-light)' }}>Nenhum centro de custo cadastrado.</td></tr>}
            {rows.map(cc => (
              <tr key={cc.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text)' }}>{cc.code}</td>
                <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{cc.description}</td>
                {canEdit && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(cc)} title="Editar" className="p-1 rounded hover:bg-[var(--surface-hover)]"><Pencil size={13} style={{ color: 'var(--primary)' }} /></button>
                    <button type="button" onClick={() => excluir(cc)} title="Excluir" className="p-1 rounded hover:bg-[var(--surface-hover)]"><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Modal (admin) — gestão dos centros de custo de um cliente na tela de Clientes. */
export function CostCentersModal({ customerId, customerName, canEdit, onClose }: {
  customerId: number; customerName: string; canEdit: boolean; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Centros de Custo</span>
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{customerName}</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto">
          <CostCentersManager endpoints={adminCostCenterEndpoints(customerId)} canEdit={canEdit} />
        </div>
      </div>
    </div>
  )
}
