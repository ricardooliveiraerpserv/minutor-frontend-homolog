'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface Ref { id: number; name: string }
interface ServiceOpt { id: number; parent_id?: number | null; name: string }

interface Props {
  ids: number[]
  perms?: Record<string, boolean>
  agents: Ref[]
  categories: { id: number; name: string }[]
  services: ServiceOpt[]
  priorities?: string[]
  prioLabel?: (p: string) => string
  onClear: () => void
  onDone: () => void
}

const LEVELS = ['N1', 'N2', 'N3']
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const DEFAULT_PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Média', alta: 'Alta', urgente: 'Urgente' }

/** Barra de atualização em massa de chamados — reutilizada na lista e na fila do Help Desk. */
export function TicketBulkBar({ ids, perms, agents, categories, services, priorities, prioLabel, onClear, onDone }: Props) {
  const [action, setAction] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  if (!perms?.enabled || ids.length === 0) return null

  const apply = async () => {
    if (!action) return
    if (action === 'delete') { if (!confirm(`Excluir ${ids.length} chamado(s) selecionado(s)?`)) return }
    else if (action !== 'responsible' && !value) { toast.error('Selecione um valor para aplicar'); return }
    setBusy(true)
    try {
      const r = await api.post<{ data: { updated: number } }>('/help-desk/tickets/bulk', { action, ticket_ids: ids, value: value || null })
      toast.success(`${r?.data?.updated ?? 0} chamado(s) ${action === 'delete' ? 'excluído(s)' : 'atualizado(s)'}`)
      setAction(''); setValue(''); onDone()
    } catch (e: any) { toast.error(e?.message || 'Erro na ação em massa') } finally { setBusy(false) }
  }

  const prios = priorities?.length ? priorities : ['baixa', 'normal', 'alta', 'urgente']
  const label = (p: string) => prioLabel ? prioLabel(p) : (DEFAULT_PRIO_LABEL[p] ?? p)

  return (
    <div className="ds-card flex items-center gap-2 flex-wrap px-3 py-2" style={{ borderColor: 'var(--primary)' }}>
      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{ids.length} selecionado(s)</span>
      <span className="text-xs" style={{ color: 'var(--text-light)' }}>· Ação em massa:</span>
      <select className={fieldCls} style={inputStyle} value={action} onChange={e => { setAction(e.target.value); setValue('') }}>
        <option value="">Escolha a ação…</option>
        {perms.responsible && <option value="responsible">Responsável</option>}
        {perms.level && <option value="level">Nível de atendimento</option>}
        {perms.service && <option value="service">Serviço</option>}
        {perms.category && <option value="category">Categoria</option>}
        {perms.urgency && <option value="urgency">Urgência</option>}
        {perms.delete && <option value="delete">Excluir</option>}
      </select>

      {action === 'responsible' && (
        <select className={fieldCls} style={inputStyle} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">— Sem responsável (remover)</option>
          {agents.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select>
      )}
      {action === 'level' && (
        <select className={fieldCls} style={inputStyle} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Nível…</option>{LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      )}
      {action === 'service' && (
        <select className={fieldCls} style={inputStyle} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Serviço…</option>{services.map(s => <option key={s.id} value={String(s.id)}>{s.parent_id ? '— ' : ''}{s.name}</option>)}
        </select>
      )}
      {action === 'category' && (
        <select className={fieldCls} style={inputStyle} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Categoria…</option>{categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
      )}
      {action === 'urgency' && (
        <select className={fieldCls} style={inputStyle} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Urgência…</option>{prios.map(p => <option key={p} value={p}>{label(p)}</option>)}
        </select>
      )}

      {action && (
        <button onClick={apply} disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
          style={action === 'delete' ? { background: 'var(--danger-bg)', color: 'var(--danger-border)' } : { background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          {busy ? 'Aplicando…' : action === 'delete' ? 'Excluir selecionados' : 'Aplicar'}
        </button>
      )}
      <button onClick={() => { setAction(''); setValue(''); onClear() }} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Limpar seleção</button>
    </div>
  )
}
