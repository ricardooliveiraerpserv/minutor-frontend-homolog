'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, GitMerge, Search, ArrowRight, Check } from 'lucide-react'

export interface TicketLite { id: number; ticket_number: string | null; subject: string; customer_id?: number | null; customer_nome?: string | null }

/**
 * Mesclar chamados: os `sources` (1+ chamados) são mesclados num chamado de DESTINO escolhido aqui
 * (busca por nº/assunto). Opções independentes: manter solicitantes / e-mails em cópia / tags.
 */
export function MesclarModal({ sources, onClose, onDone }: {
  sources: TicketLite[]
  onClose: () => void
  onDone: (targetId: number) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<TicketLite[]>([])
  const [target, setTarget] = useState<TicketLite | null>(null)
  const [opts, setOpts] = useState({ keep_requesters: true, keep_cc: true, keep_tags: true })
  const [saving, setSaving] = useState(false)
  const srcIds = new Set(sources.map(s => s.id))
  // Só se mescla dentro do MESMO cliente. Se as origens forem de um único cliente, escopamos a
  // busca do destino a ele; se houver mistura, avisamos e bloqueamos.
  const customerIds = Array.from(new Set(sources.map(s => s.customer_id ?? null)))
  const singleCustomer = customerIds.length === 1 ? customerIds[0] : null
  const customerName = sources.find(s => (s.customer_id ?? null) === singleCustomer)?.customer_nome ?? null
  const mixedCustomers = customerIds.length > 1

  // Carrega chamados candidatos a destino: sempre só ABERTOS e do MESMO cliente. Sem termo, lista os
  // abertos do cliente (quando há cliente definido); com termo, busca por nº/assunto.
  const load = async (term: string) => {
    if (!term.trim() && singleCustomer == null) { setResults([]); return } // sem cliente definido: só busca por termo
    try {
      const params = new URLSearchParams({ limit: '30', active: '1' }) // só abertos (encerrados/cancelados/resolvidos não entram)
      if (term.trim()) params.set('search', term.trim())
      if (singleCustomer != null) params.set('customer_id', String(singleCustomer)) // mesmo cliente das origens
      const r = await api.get<{ data: TicketLite[] }>(`/help-desk/tickets?${params.toString()}`)
      setResults((r?.data ?? []).filter(t => !srcIds.has(t.id)))
    } catch { setResults([]) }
  }
  const search = (term: string) => { setQ(term); load(term) }
  // Ao abrir, já traz a lista de abertos do cliente (evita começar vazio).
  useEffect(() => { if (!mixedCustomers) load('') }, [singleCustomer, mixedCustomers]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!target) return toast.error('Escolha o chamado de destino.')
    setSaving(true)
    try {
      await api.post('/help-desk/tickets/merge', { target_id: target.id, source_ids: sources.map(s => s.id), ...opts })
      toast.success('Chamados mesclados.')
      onDone(target.id)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mesclar')
    } finally { setSaving(false) }
  }

  const Opt = ({ k, label }: { k: keyof typeof opts; label: string }) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
      <input type="checkbox" checked={opts[k]} onChange={e => setOpts(o => ({ ...o, [k]: e.target.checked }))} />
      {label}
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card max-w-lg w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><GitMerge size={17} /> Mesclar chamados</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        {/* Origens */}
        <div>
          <div className="text-xs mb-1 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span>Chamado(s) a mesclar ({sources.length}):</span>
            {customerName && <span className="font-semibold" style={{ color: 'var(--text)' }}>· {customerName}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map(s => (
              <span key={s.id} className="text-[11px] font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{s.ticket_number ?? `#${s.id}`}</span>
            ))}
          </div>
        </div>

        {mixedCustomers && (
          <div className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
            Os chamados selecionados são de <strong>clientes diferentes</strong>. Só é possível mesclar chamados do mesmo cliente.
          </div>
        )}

        {/* Destino */}
        <div className="flex items-center gap-2 text-sm">
          <ArrowRight size={14} style={{ color: 'var(--text-light)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Mesclar no destino:</span>
        </div>
        {target ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
            <Check size={14} style={{ color: 'var(--primary)' }} />
            <span className="font-mono text-xs" style={{ color: 'var(--primary)' }}>{target.ticket_number ?? `#${target.id}`}</span>
            <span className="text-sm truncate flex-1" style={{ color: 'var(--text)' }}>{target.subject}</span>
            <button className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => setTarget(null)}>trocar</button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input autoFocus className="ds-input pl-8 w-full" placeholder="Buscar destino por nº ou assunto…" value={q} onChange={e => search(e.target.value)} />
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              {results.length > 0 ? `Chamados abertos${customerName ? ` de ${customerName}` : ''} (${results.length}):` : 'Nenhum chamado aberto disponível.'}
            </div>
            {results.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                {results.map(t => (
                  <button key={t.id} onClick={() => { setTarget(t); setResults([]); setQ('') }}
                    className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 ds-row-hover">
                    <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{t.ticket_number ?? `#${t.id}`}</span>
                    <span className="text-sm truncate" style={{ color: 'var(--text)' }}>{t.subject}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Opções */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Ao mesclar, manter:</div>
          <Opt k="keep_requesters" label="Todos os solicitantes (em cópia)" />
          <Opt k="keep_cc" label="Todos os e-mails em cópia (CC)" />
          <Opt k="keep_tags" label="Todas as tags" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" disabled={saving || !target || mixedCustomers} onClick={submit}>{saving ? 'Mesclando…' : 'Mesclar'}</button>
        </div>
      </div>
    </div>
  )
}
