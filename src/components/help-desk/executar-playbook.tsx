'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Zap, ChevronDown } from 'lucide-react'

interface PlaybookItem { id: number; name: string; category: string | null; color: string | null; icon: string | null; start_finalize: boolean }

/**
 * Executar Playbook — menu de procedimentos. A execução em si é delegada ao detalhe
 * (onExec) para compartilhar a mesma lógica com as sugestões do bloco "Atenções".
 */
export function ExecutarPlaybook({ onExec }: { onExec: (playbookId: number) => void }) {
  const [items, setItems] = useState<PlaybookItem[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => { api.get<{ data: PlaybookItem[] }>('/help-desk/playbooks').then(r => setItems(r?.data ?? [])).catch(() => {}) }, [])

  if (items.length === 0) return null
  return (
    <div className="relative">
      <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setOpen(o => !o)}>
        <Zap size={15} /> Executar Macro <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-64 ds-card p-1 max-h-80 overflow-y-auto" style={{ boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
            {items.map(pb => (
              <button key={pb.id} onClick={() => { setOpen(false); onExec(pb.id) }}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded ds-row-hover text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pb.color ?? 'var(--text-muted)' }} />
                <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{pb.name}</span>
                {pb.category && <span className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{pb.category}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
