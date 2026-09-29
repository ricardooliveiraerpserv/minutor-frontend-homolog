'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { X, Users, ArrowRight } from 'lucide-react'

interface Agent { id: number; name: string; type: string }
interface Row { id: number; ticket_number: string | null; subject: string; priority: string }

/**
 * Redistribuir chamados — ação direta da Central de Operações sobre consultor sobrecarregado.
 * Reúsa o endpoint oficial de atribuição em lote (POST /help-desk/tickets/redistribute).
 */
export function RedistribuirModal({ fromUserId, fromName, onClose, onDone }: { fromUserId: number; fromName?: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [target, setTarget] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ data: Row[] }>(`/help-desk/tickets?assignee_id=${fromUserId}&open=1&limit=200`)
      .then(r => { const d = r?.data ?? []; setRows(d); setSel(new Set(d.map(t => t.id))) })
      .catch(() => toast.error('Erro ao carregar chamados'))
    api.get<{ data: Agent[] }>('/help-desk/agents').then(r => setAgents((r?.data ?? []).filter(a => a.id !== fromUserId))).catch(() => {})
  }, [fromUserId])

  const toggle = (id: number) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const submit = async () => {
    if (sel.size === 0) return toast.error('Selecione ao menos um chamado.')
    setSaving(true)
    try {
      const body: { ticket_ids: number[]; assignee_id?: number } = { ticket_ids: [...sel] }
      if (target) body.assignee_id = Number(target)
      const r = await api.post<{ data: { reassigned: number } }>('/help-desk/tickets/redistribute', body)
      toast.success(`${r?.data?.reassigned ?? 0} chamado(s) redistribuído(s).`)
      onDone()
    } catch { toast.error('Erro ao redistribuir') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card max-w-lg w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><Users size={17} /> Redistribuir chamados</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button>
        </div>
        {fromName && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chamados em atendimento de <strong>{fromName}</strong>.</p>}

        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>Atribuir para</span>
          <ArrowRight size={14} style={{ color: 'var(--text-light)' }} />
          <div className="flex-1"><SearchSelect value={target} onChange={setTarget} options={[{ id: '', name: 'Fila (remover atribuição)' }, ...agents]} placeholder="Buscar agente…" fullWidth /></div>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg p-1" style={{ border: '1px solid var(--border)' }}>
          {rows.length === 0 && <div className="text-sm text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum chamado aberto.</div>}
          {rows.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded ds-row-hover cursor-pointer">
              <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
              <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{t.ticket_number ?? `#${t.id}`}</span>
              <span className="text-sm truncate flex-1" style={{ color: 'var(--text)' }}>{t.subject}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sel.size} selecionado(s)</span>
          <div className="flex gap-2">
            <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
            <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" disabled={saving || sel.size === 0} onClick={submit}>{saving ? 'Redistribuindo…' : 'Redistribuir'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
