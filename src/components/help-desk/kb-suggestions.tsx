'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { BookOpen, Lock, ArrowRight } from 'lucide-react'

// Sugestão de artigos da Base de Conhecimento na abertura do chamado: conforme o usuário digita o
// assunto, propõe artigos publicados que já podem resolver — deflexão. Silencioso quando não há nada.

interface Article { id: number; title: string; excerpt: string | null; visibility: string }

export function KbSuggestions({ query }: { query: string }) {
  const [arts, setArts] = useState<Article[]>([])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setArts([]); return }
    let active = true // guarda: só a última query pinta o resultado
    const t = setTimeout(() => {
      api.get<{ data: Article[] }>(`/help-desk/kb/suggest?q=${encodeURIComponent(q)}`)
        .then(r => { if (active) setArts(r?.data ?? []) }).catch(() => {})
    }, 350)
    return () => { active = false; clearTimeout(t) }
  }, [query])

  if (!arts.length) return null

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--primary-soft)', background: 'var(--primary-soft)' }}>
      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
        <BookOpen size={12} /> Talvez isto já resolva
      </div>
      <div style={{ background: 'var(--surface)' }}>
        {arts.map(a => (
          <Link key={a.id} href={`/help-desk/kb?article=${a.id}`} target="_blank"
            className="flex items-center gap-2 px-3 py-2 border-t ds-row-hover group" style={{ borderColor: 'var(--border)' }}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                {a.visibility === 'internal' && <Lock size={11} style={{ color: 'var(--warning-border)' }} />}{a.title}
              </div>
              {a.excerpt && <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{a.excerpt}</div>}
            </div>
            <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--primary)' }} />
          </Link>
        ))}
      </div>
    </div>
  )
}
