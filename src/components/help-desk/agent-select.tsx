'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Users } from 'lucide-react'

// Seletor de Responsável (Agente) AGRUPADO POR EQUIPE — estilo Movidesk: cada equipe é um
// cabeçalho e seus membros aparecem abaixo, com busca por texto. Agente = membro de equipe.
export interface AgentTeam { id: number; name: string; members: { id: number; name: string }[] }

export function AgentSelect({ teams, value, onChange, placeholder = 'Não atribuído' }: { teams: AgentTeam[]; value: number | null; onChange: (id: number | null, teamId?: number) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const selectedName = useMemo(() => {
    for (const t of teams) { const m = t.members.find(x => x.id === value); if (m) return m.name }
    return null
  }, [teams, value])
  const pick = (id: number | null, teamId?: number) => { onChange(id, teamId); setOpen(false); setQuery('') }

  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none flex items-center justify-between gap-2"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: selectedName ? 'var(--text)' : 'var(--text-light)' }}>
        <span className="truncate">{selectedName ?? placeholder}</span>
        <ChevronDown size={14} style={{ color: 'var(--text-light)' }} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-lg shadow-xl max-h-72 overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: 'var(--surface-sunken)' }}>
              <Search size={13} style={{ color: 'var(--text-light)' }} />
              <input autoFocus className="bg-transparent outline-none text-sm flex-1 min-w-0" style={{ color: 'var(--text)' }} placeholder="Buscar agente…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="overflow-y-auto p-1">
            <button className="w-full text-left text-sm px-2 py-1.5 rounded ds-row-hover" style={{ color: 'var(--text-muted)' }} onClick={() => pick(null)}>— Selecione —</button>
            {teams.map(t => {
              const members = t.members.filter(m => !q || m.name.toLowerCase().includes(q))
              if (members.length === 0) return null
              return (
                <div key={t.id}>
                  <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    <Users size={12} /> {t.name}
                  </div>
                  {members.map(m => (
                    <button key={`${t.id}-${m.id}`} onClick={() => pick(m.id, t.id)} className="w-full text-left text-sm pl-7 pr-2 py-1.5 rounded ds-row-hover"
                      style={{ color: m.id === value ? 'var(--primary)' : 'var(--text)', fontWeight: m.id === value ? 600 : 400 }}>
                      {m.name}
                    </button>
                  ))}
                </div>
              )
            })}
            {teams.every(t => t.members.filter(m => !q || m.name.toLowerCase().includes(q)).length === 0) && (
              <div className="text-xs text-center py-3" style={{ color: 'var(--text-light)' }}>
                {teams.length === 0 ? 'Nenhuma equipe com membros. Cadastre equipes em Configurações.' : 'Nenhum agente encontrado.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
