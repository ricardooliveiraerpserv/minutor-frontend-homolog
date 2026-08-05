'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X } from 'lucide-react'

export const META_TIPOS: { v: string; l: string; qtd?: boolean }[] = [
  { v: 'receita', l: 'Receita (R$)' },
  { v: 'margem', l: 'Margem (R$)' },
  { v: 'quantidade', l: 'Qtd. de negócios', qtd: true },
  { v: 'novos_clientes', l: 'Novos clientes', qtd: true },
  { v: 'receita_recorrente', l: 'Receita recorrente' },
  { v: 'receita_projeto', l: 'Receita projeto' },
  { v: 'receita_sustentacao', l: 'Receita sustentação' },
]
export const tipoLabel = (v: string | null) => META_TIPOS.find(t => t.v === v)?.l ?? (v ?? 'Receita')

interface Resp { id: number; name: string; meta?: number }

export function MetaModal({ comp, responsaveis, initialUserId, onClose, onSaved }: {
  comp: string; responsaveis: Resp[]; initialUserId?: number; onClose: () => void; onSaved: () => void
}) {
  const [uid, setUid] = useState(initialUserId ? String(initialUserId) : '')
  const [competencia, setCompetencia] = useState(comp)
  const [tipo, setTipo] = useState('receita')
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [modo, setModo] = useState<'substituir' | 'somar'>('substituir')
  const [replicar, setReplicar] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => { const r = responsaveis.find(x => String(x.id) === uid); if (r?.meta) setValor(String(r.meta)) }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const isQtd = META_TIPOS.find(t => t.v === tipo)?.qtd
  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }

  const save = async () => {
    if (!uid) { toast.error('Escolha o responsável'); return }
    const v = Number(valor.replace(/\./g, '').replace(',', '.'))
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return }
    setSaving(true)
    try {
      const r = await api.put<{ data: { periodos: string[] } }>('/crm/metas', {
        user_id: Number(uid), competencia, valor_meta: v, tipo,
        observacao: obs || null, modo, replicar_meses: Number(replicar) || 0,
      })
      const n = r?.data?.periodos?.length ?? 1
      toast.success(n > 1 ? `Meta aplicada a ${n} competências` : 'Meta salva'); onSaved()
    } catch { toast.error('Erro ao salvar meta') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Definir meta</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Responsável</label>
            <select value={uid} onChange={e => setUid(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}>
              <option value="">Selecione…</option>
              {responsaveis.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Competência</label>
            <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de meta</label>
            <div className="flex flex-wrap gap-1.5">
              {META_TIPOS.map(t => (
                <button key={t.v} onClick={() => setTipo(t.v)} className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium" style={tipo === t.v ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{t.l}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isQtd ? 'Quantidade' : 'Valor da meta (R$)'}</label>
            <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Observação</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Ex.: Meta revisada após reunião comercial." className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={inp} />
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Atualização:</span>
            {(['substituir', 'somar'] as const).map(mo => (
              <label key={mo} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                <input type="radio" checked={modo === mo} onChange={() => setModo(mo)} /> {mo === 'substituir' ? 'Substituir' : 'Somar ao atual'}
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Replicar</label>
            <select value={replicar} onChange={e => setReplicar(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}>
              <option value="0">Somente esta competência</option>
              <option value="2">Aplicar aos próximos 3 meses</option>
              <option value="5">Aplicar aos próximos 6 meses</option>
              <option value="11">Aplicar aos próximos 12 meses</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
