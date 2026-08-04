'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Briefcase, Building2, CornerDownLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

interface Negocio { id: number; title: string; empresa: string | null; valor: number | null; status: string; pipeline: string | null; stage: string | null; responsavel: string | null }
interface Empresa { id: number; name: string; crm_status: string | null; segmento: string | null; regiao: string | null; executivo: string | null }

const fmtBRL = (n: number | null) => n == null ? null : (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS: Record<string, { l: string; cor: string; bg: string }> = {
  ganho:   { l: 'Vendida', cor: '#16a34a', bg: 'rgba(34,197,94,0.16)' },
  perdido: { l: 'Perdida', cor: 'var(--danger-border)', bg: 'var(--danger-bg)' },
  parado:  { l: 'Pausada', cor: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
}

// Destaca o trecho que casa com a busca.
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <>{text}</>
  const i = text.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark style={{ background: 'var(--primary-soft)', color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>
}

export function GlobalSearch() {
  const router = useRouter()
  const { user } = useAuth()
  const habilitado = user?.type === 'admin' || user?.type === 'administrativo'

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [neg, setNeg] = useState<Negocio[]>([])
  const [emp, setEmp] = useState<Empresa[]>([])
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Lista achatada p/ navegação por teclado (negócios, depois empresas).
  const flat = useMemo(() => [
    ...neg.map(n => ({ kind: 'neg' as const, id: n.id })),
    ...emp.map(e => ({ kind: 'emp' as const, id: e.id })),
  ], [neg, emp])

  const go = useCallback((kind: 'neg' | 'emp', id: number) => {
    setOpen(false)
    router.push(kind === 'neg' ? `/crm/pipeline?opp=${id}` : `/empresas/${id}/360`)
  }, [router])

  // Atalho global Ctrl/Cmd+K abre; Esc fecha.
  useEffect(() => {
    if (!habilitado) return
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(v => !v) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [habilitado])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])
  useEffect(() => { if (!open) { setQ(''); setNeg([]); setEmp([]); setSel(0) } }, [open])

  // Busca com debounce.
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) { setNeg([]); setEmp([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.get<{ data: { negocios: Negocio[]; empresas: Empresa[] } }>(`/crm/search?q=${encodeURIComponent(term)}`)
        .then(r => { setNeg(r?.data?.negocios ?? []); setEmp(r?.data?.empresas ?? []); setSel(0) })
        .catch(() => { setNeg([]); setEmp([]) })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, open])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, Math.max(flat.length - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { const it = flat[sel]; if (it) go(it.kind, it.id) }
  }

  if (!habilitado) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Busca global"
        title="Busca global (Ctrl/Cmd + K)"
        className="p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <Search size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[10vh]" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '75vh' }} onClick={e => e.stopPropagation()}>
            {/* Campo de busca */}
            <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Buscar negócios e empresas…"
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: 'var(--text)' }}
              />
              {q && <button onClick={() => { setQ(''); inputRef.current?.focus() }} className="p-0.5 rounded hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-[var(--surface-hover)] text-[10px] font-semibold" style={{ color: 'var(--text-light)', border: '1px solid var(--border)' }}>ESC</button>
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-light)' }}>Digite ao menos 2 letras para buscar negócios e empresas.</p>
              ) : loading && flat.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-light)' }}>Buscando…</p>
              ) : flat.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-light)' }}>Nada encontrado para “{q.trim()}”.</p>
              ) : (
                <>
                  {neg.length > 0 && (
                    <div className="pt-2">
                      <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Negociações</p>
                      {neg.map((n, i) => { const st = STATUS[n.status]; const active = sel === i; return (
                        <button key={`n${n.id}`} onMouseEnter={() => setSel(i)} onClick={() => go('neg', n.id)}
                          className="w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors"
                          style={{ background: active ? 'var(--surface-hover)' : 'transparent' }}>
                          <Briefcase size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}><Highlight text={n.title} term={q.trim()} /></span>
                              {st && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: st.bg, color: st.cor }}>{st.l}</span>}
                            </div>
                            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {[n.empresa, fmtBRL(n.valor), n.pipeline, n.stage, n.responsavel].filter(Boolean).join(' • ')}
                            </p>
                          </div>
                        </button>
                      )})}
                    </div>
                  )}
                  {emp.length > 0 && (
                    <div className="pt-2 pb-2">
                      <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Empresas</p>
                      {emp.map((e, i) => { const idx = neg.length + i; const active = sel === idx; return (
                        <button key={`e${e.id}`} onMouseEnter={() => setSel(idx)} onClick={() => go('emp', e.id)}
                          className="w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors"
                          style={{ background: active ? 'var(--surface-hover)' : 'transparent' }}>
                          <Building2 size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate block" style={{ color: 'var(--text)' }}><Highlight text={e.name} term={q.trim()} /></span>
                            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {[e.crm_status, e.segmento, e.regiao, e.executivo].filter(Boolean).join(' • ') || '—'}
                            </p>
                          </div>
                        </button>
                      )})}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Rodapé com dicas */}
            <div className="flex items-center gap-4 px-4 py-2 border-t shrink-0 text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
              <span className="flex items-center gap-1"><CornerDownLeft size={12} /> abrir</span>
              <span>↑ ↓ navegar</span>
              <span className="ml-auto">Ctrl/Cmd + K</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
