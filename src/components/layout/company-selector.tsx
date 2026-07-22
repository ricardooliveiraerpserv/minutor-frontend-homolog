'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Check, ChevronDown, Loader2 } from 'lucide-react'

interface CompanyItem {
  id: number
  name: string
  slug: string
  color: string | null
  type: string
  role: string
  active: boolean
}

/**
 * Seletor de empresa ativa (multi-empresa). Troca sem logout: POST /set-company
 * e recarrega — reset total de estado/cache na nova empresa. Só aparece quando o
 * usuário tem mais de uma empresa.
 */
export function CompanySelector() {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['my-companies'],
    queryFn: () => api.get<{ data: CompanyItem[] }>('/my-companies'),
    staleTime: 60_000,
  })
  const companies = data?.data ?? []
  const active = companies.find(c => c.active)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (companies.length <= 1) return null

  const switchTo = async (id: number) => {
    if (id === active?.id) { setOpen(false); return }
    setSwitching(id)
    try {
      await api.post('/set-company', { company_id: id })
      // Reset total: recarrega tudo já na nova empresa (limpa cache/estado).
      window.location.reload()
    } catch {
      setSwitching(null)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-semibold transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text)', border: `1.5px solid ${active?.color || 'var(--border)'}` }}
      >
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: active?.color || 'var(--primary)' }} />
        <span className="hidden sm:inline truncate max-w-[120px]">{active?.name ?? 'Empresa'}</span>
        <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-60 rounded-lg shadow-lg z-50 py-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
            Trocar empresa
          </p>
          {companies.map(c => (
            <button
              key={c.id}
              onClick={() => switchTo(c.id)}
              disabled={switching !== null}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-60"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color || 'var(--primary)' }} />
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                  <p className="text-[11px] capitalize" style={{ color: 'var(--text-muted)' }}>{c.role}</p>
                </div>
              </div>
              {switching === c.id
                ? <Loader2 size={15} className="animate-spin" style={{ color: 'var(--primary)' }} />
                : c.active && <Check size={15} style={{ color: 'var(--primary)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
