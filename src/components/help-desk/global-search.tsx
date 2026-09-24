'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { Search, X } from 'lucide-react'

// Busca GLOBAL do Help Desk (lupa estilo Movidesk): pesquisa QUALQUER chamado por número, assunto,
// cliente, pessoas e conteúdo das interações — inclusive fora da fila do agente. Abrir → assumir.

interface Hit {
  id: number
  ticket_number: string | null
  subject: string
  customer: string | null
  person: string | null
  assignee: string | null
  status: { label: string; color: string | null } | null
  snippet: string | null
}

// Realça o termo no texto (case-insensitive), sem depender de HTML da origem.
function highlight(text: string, term: string) {
  if (!term) return text
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx < 0) return text
  const parts: ReactNode[] = []
  let i = 0; const t = term.toLowerCase(); const lower = text.toLowerCase()
  while (true) {
    const p = lower.indexOf(t, i)
    if (p < 0) { parts.push(text.slice(i)); break }
    parts.push(text.slice(i, p))
    parts.push(<mark key={p} style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)', borderRadius: 3, padding: '0 2px' }}>{text.slice(p, p + term.length)}</mark>)
    i = p + term.length
  }
  return parts
}

export function HelpDeskGlobalSearch({ onOpen }: { onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Foca o input ao abrir; Esc fecha.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open])

  // Busca com debounce (≥2 caracteres).
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    const h = setTimeout(() => {
      api.get<{ data: Hit[] }>(`/help-desk/tickets/search?q=${encodeURIComponent(term)}`)
        .then(r => setHits(r?.data ?? [])).catch(() => setHits([])).finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(h)
  }, [q, open])

  const pick = (id: number) => { setOpen(false); setQ(''); setHits([]); onOpen(id) }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Busca global — pesquisa em TODOS os chamados, mesmo fora da sua fila"
        className="inline-flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg w-full"
        style={{ border: '1px dashed var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)' }}>
        <Search size={16} />
        <span className="font-semibold">Busca global</span>
        <span className="truncate" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— por nº, cliente, pessoa ou conteúdo da conversa (todos os chamados)</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setOpen(false)}>
          <div className="ds-card w-full max-w-2xl overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <Search size={18} style={{ color: 'var(--text-light)' }} />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="hd-global-search" data-1p-ignore data-lpignore="true" data-form-type="other" type="search"
                placeholder="Buscar por nº, assunto, cliente, pessoa ou conteúdo da conversa…"
                className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text)' }} />
              <button onClick={() => setOpen(false)}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-light)' }}>Digite ao menos 2 caracteres para buscar.</p>
              ) : loading ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Buscando…</p>
              ) : hits.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhum chamado encontrado.</p>
              ) : (
                hits.map(h => (
                  <button key={h.id} onClick={() => pick(h.id)}
                    className="w-full text-left px-4 py-3 border-b ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h.ticket_number ?? `#${h.id}`}</span>
                      {h.status && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: h.status.color ?? 'var(--text)', background: (h.status.color ?? '').startsWith('#') ? `${h.status.color}22` : 'var(--surface-sunken)', border: `1px solid ${h.status.color ?? 'var(--border)'}` }}>{h.status.label}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{highlight(h.subject || '(sem assunto)', q.trim())}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                      {[h.customer, h.person].filter(Boolean).join(' » ') || '—'}
                      {h.assignee ? ` · resp.: ${h.assignee}` : ' · não atribuído'}
                    </div>
                    {h.snippet && <div className="text-[12px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{highlight(h.snippet, q.trim())}</div>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
