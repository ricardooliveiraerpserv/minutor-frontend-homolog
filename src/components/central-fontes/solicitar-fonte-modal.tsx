'use client'

// Modal ÚNICO de solicitação de fonte — usado na ficha, na lista de empresas e no diretório
// do Acervo (múltiplas fontes ou a pasta). Campos: prioridade, chamado aberto, observação.

import { useEffect, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button, Modal, Select, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

export interface SolicitarItem { path: string; label: string }
export interface SolicitarCtx {
  title: string
  customerId?: number | null
  repository?: string
  scopeType: 'source' | 'folder' | 'repository'
  items?: SolicitarItem[]   // fontes selecionadas (scope=source) — exibidas
  folderPath?: string       // caminho da pasta (scope=folder)
}

export function SolicitarFonteModal({ ctx, onClose }: { ctx: SolicitarCtx; onClose: () => void }) {
  const items = ctx.items ?? []
  const [repository, setRepository] = useState(ctx.repository ?? '')
  const [priority, setPriority] = useState('media')
  const [hasTicket, setHasTicket] = useState(false)
  const [ticket, setTicket] = useState('')
  const [tickets, setTickets] = useState<{ id: number; ticket_number: string; subject: string }[] | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!hasTicket || !ctx.customerId) { setTickets(null); return }
    let a = true
    api.get<{ data: { id: number; ticket_number: string; subject: string }[] }>(`/source-docs/open-tickets?customer_id=${ctx.customerId}`)
      .then((r) => { if (a) setTickets(r.data) })
      .catch(() => { if (a) setTickets([]) })
    return () => { a = false }
  }, [hasTicket, ctx.customerId])

  const alvo = ctx.scopeType === 'folder' ? 'esta pasta' : items.length > 1 ? `${items.length} fontes` : items.length === 1 ? 'esta fonte' : 'este repositório'

  const submit = async () => {
    setSaving(true)
    try {
      const paths = ctx.scopeType === 'folder' && ctx.folderPath ? [ctx.folderPath] : items.map((i) => i.path)
      await api.post('/source-docs/source-requests', {
        customer_id: ctx.customerId ?? null,
        repository: repository.trim() || null,
        ticket: hasTicket ? (ticket.trim() || null) : null,
        priority,
        scope_type: ctx.scopeType,
        paths: paths.length ? paths : null,
        note: note.trim() || null,
      })
      toast.success('Solicitação registrada.')
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Falha ao registrar a solicitação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={ctx.title}>
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Registra um pedido para obter/provisionar {alvo} na Central.</p>

        {ctx.scopeType === 'folder' && ctx.folderPath && (
          <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>📂 {ctx.folderPath} (pasta + descendentes)</div>
        )}
        {items.length > 0 && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Fontes ({items.length})</label>
            <div className="mt-1 max-h-32 overflow-auto rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
              {items.map((i) => <div key={i.path} className="truncate"><span style={{ color: 'var(--text)' }}>{i.label}</span> <span style={{ color: 'var(--text-light)' }}>· {i.path}</span></div>)}
            </div>
          </div>
        )}

        <TextInput label="Repositório" value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repositorio" />

        <Select label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
        </Select>

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={hasTicket} onChange={(e) => setHasTicket(e.target.checked)} /> Já existe chamado aberto?
        </label>
        {hasTicket && (
          tickets === null ? <div className="text-xs" style={{ color: 'var(--text-light)' }}>Carregando chamados abertos…</div>
            : tickets.length === 0 ? <div className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum chamado aberto para esta empresa.</div>
              : <Select label="Chamado aberto" value={ticket} onChange={(e) => setTicket(e.target.value)}>
                  <option value="">Selecione o chamado…</option>
                  {tickets.map((t) => <option key={t.id} value={t.ticket_number}>#{t.ticket_number} — {t.subject}</option>)}
                </Select>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Observação (opcional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="Contexto, prioridade, quem pediu…" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button size="sm" variant="primary" icon={FilePlus2} loading={saving} onClick={submit}>Registrar solicitação</Button>
        </div>
      </div>
    </Modal>
  )
}
