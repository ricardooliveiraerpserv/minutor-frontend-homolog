'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { User as UserIcon, Search, ChevronRight } from 'lucide-react'

interface Respondent { id: number; name: string; type: string; email: string | null; empresa: string | null; last_at: string; evaluations: number }

const TYPE_LABEL: Record<string, string> = { internal: 'Interno', partner: 'Parceiro', candidate: 'Talento' }
const TYPE_CLASS: Record<string, string> = { internal: 'ds-status-info', partner: 'ds-status', candidate: 'ds-status-success' }
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export default function ProfissionaisPage() {
  const [rows, setRows] = useState<Respondent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState<string>('')

  useEffect(() => {
    api.get<{ respondents: Respondent[] }>('/competencias/profissionais')
      .then(r => setRows(r.respondents ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!type || r.type === type) &&
      (!q || r.name.toLowerCase().includes(q) || (r.empresa ?? '').toLowerCase().includes(q)))
  }, [rows, search, type])

  return (
    <AppLayout title="Profissionais">
      <div className="space-y-4">
        <div className="ds-card ds-card-pad flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1" style={{ minWidth: 0 }}>
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input className="ds-input" style={{ flex: 1 }} placeholder="Buscar por nome ou empresa…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1">
            {['', 'internal', 'partner', 'candidate'].map(t => (
              <button key={t} onClick={() => setType(t)} className={type === t ? 'ds-filter-active' : ''}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: type === t ? 'var(--primary-soft)' : 'transparent', color: type === t ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}>
                {t === '' ? 'Todos' : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div>}
        {!loading && filtered.length === 0 && <div className="ds-card ds-card-pad"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum profissional avaliado ainda.</p></div>}

        {!loading && filtered.map(r => (
          <Link key={r.id} href={`/competencias/profissionais/${r.id}`} className="block ds-card ds-card-pad ds-row-hover" style={{ textDecoration: 'none' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><UserIcon size={16} /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                    <span className={TYPE_CLASS[r.type]} style={{ fontSize: 10 }}>{TYPE_LABEL[r.type] ?? r.type}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.empresa || r.email || '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{r.evaluations} aval.</span>
                <span>{fmt(r.last_at)}</span>
                <ChevronRight size={16} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </AppLayout>
  )
}
