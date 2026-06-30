'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { api } from '@/lib/api'
import { Megaphone, X } from 'lucide-react'

interface UnreadItem { id: number; tipo: string; title: string; excerpt: string; created_at: string | null }

const TIPO_L: Record<string, string> = { aviso: 'Aviso', formal: 'Comunicação formal', marketing: 'Marketing', campanha: 'Campanha' }
const POLL_MS = 30000   // rede de segurança (igual ao popup interno) — aparece sem o usuário recarregar

/**
 * Popup de prévia exibido ao cliente quando há comunicado novo (não lido). Aparece em TEMPO REAL
 * (checagem ao montar + polling + ao focar a aba), sem precisar recarregar. Não fecha ao clicar fora.
 */
export function ClientCommunicationPopup() {
  const router = useRouter()
  const pathname = usePathname()
  const [items, setItems] = useState<UnreadItem[]>([])
  const [open, setOpen] = useState(false)
  const shownIds = useRef<Set<number>>(new Set())   // ids já exibidos → não re-incomoda; um comunicado NOVO reaparece
  const openRef = useRef(false)
  openRef.current = open

  const check = useCallback(() => {
    if (pathname === '/comunicados' || openRef.current) return   // a aba Comunicados marca como lido
    api.get<{ data: { count: number; items: UnreadItem[] } }>('/communications/unread')
      .then(r => {
        const list = r.data?.items ?? []
        const fresh = list.filter(it => !shownIds.current.has(it.id))
        if (fresh.length > 0) {
          list.forEach(it => shownIds.current.add(it.id))
          setItems(list)
          setOpen(true)
        }
      })
      .catch(() => {})
  }, [pathname])

  // Tempo real: checa ao montar/navegar + polling + ao focar a aba (mesma lógica do popup interno).
  useEffect(() => {
    check()
    const t = setInterval(check, POLL_MS)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [check])

  if (!open || items.length === 0) return null

  const top = items[0]
  const rest = items.length - 1
  const dt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

  const close = () => setOpen(false)
  const readAll = () => { setOpen(false); router.push('/comunicados') }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
          <Megaphone size={18} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-bold flex-1" style={{ color: 'var(--primary)' }}>
            {items.length === 1 ? 'Você tem um comunicado novo' : `Você tem ${items.length} comunicados novos`}
          </span>
          <button onClick={close} style={{ color: 'var(--primary)' }}><X size={16} /></button>
        </div>

        <div className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{TIPO_L[top.tipo] ?? top.tipo}</span>
            <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>{top.title}</span>
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{dt(top.created_at)}</span>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{top.excerpt}</p>
          {rest > 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>+ {rest} outro{rest > 1 ? 's' : ''} comunicado{rest > 1 ? 's' : ''}</p>}
        </div>

        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={close} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Depois</button>
          <button onClick={readAll} className="ds-btn-primary text-sm px-5 py-2 rounded-lg font-medium">Ler comunicados</button>
        </div>
      </div>
    </div>
  )
}
