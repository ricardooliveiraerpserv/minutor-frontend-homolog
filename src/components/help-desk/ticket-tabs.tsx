'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Headset, List } from 'lucide-react'

// Abas de chamados abertos (estilo Movidesk): alternar entre tickets sem voltar pra lista.
// Estado persistido em localStorage → sobrevive à navegação e sincroniza entre a fila e o detalhe.

export type TicketTab = { id: number; number: string | null; subject: string }
const KEY = 'hd_open_tickets'
const MAX = 12

function read(): TicketTab[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function write(tabs: TicketTab[]) {
  localStorage.setItem(KEY, JSON.stringify(tabs.slice(-MAX)))
  window.dispatchEvent(new Event('hd-tabs-changed')) // avisa componentes na MESMA aba do navegador
}

/** Registra (ou atualiza) um chamado como aba aberta. Chamar quando o detalhe carrega. */
export function addTicketTab(t: TicketTab) {
  if (typeof window === 'undefined') return
  const cur = read()
  const i = cur.findIndex(x => x.id === t.id)
  if (i >= 0) {
    if (cur[i].number === t.number && cur[i].subject === t.subject) return // sem mudança → não re-emite
    cur[i] = t; write(cur)
  } else {
    write([...cur, t])
  }
}

export function TicketTabs({ activeId }: { activeId?: number }) {
  const router = useRouter()
  const [tabs, setTabs] = useState<TicketTab[]>([])

  useEffect(() => {
    const sync = () => setTabs(read())
    sync()
    window.addEventListener('storage', sync)          // outras abas do navegador
    window.addEventListener('hd-tabs-changed', sync)  // mesma aba
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('hd-tabs-changed', sync) }
  }, [])

  if (tabs.length === 0) return null

  const close = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    const rest = read().filter(x => x.id !== id)
    write(rest)
    if (id === activeId) {
      const next = rest[rest.length - 1]
      router.push(next ? `/help-desk/tickets/${next.id}` : '/help-desk/fila')
    }
  }

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1 mb-2">
      <button onClick={() => router.push('/help-desk/fila')} title="Voltar para a fila"
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-t-lg shrink-0 ds-row-hover"
        style={{ border: '1px solid var(--border)', borderBottom: 'none', background: 'var(--surface)', color: 'var(--text-muted)' }}>
        <List size={13} /> Fila
      </button>
      {tabs.map(t => {
        const active = t.id === activeId
        return (
          <button key={t.id} onClick={() => router.push(`/help-desk/tickets/${t.id}`)}
            title={`${t.number ?? `#${t.id}`} · ${t.subject}`}
            className="group inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-t-lg shrink-0 max-w-[220px] transition-colors"
            style={active
              ? { border: '1px solid var(--primary)', borderBottom: '2px solid var(--primary)', background: 'var(--primary-soft)', color: 'var(--text)', fontWeight: 600 }
              : { border: '1px solid var(--border)', borderBottom: 'none', background: 'var(--surface)', color: 'var(--text-muted)' }}>
            <Headset size={13} className="shrink-0" style={{ color: active ? 'var(--primary)' : 'var(--text-light)' }} />
            <span className="truncate"><b className="font-mono">{t.number ?? `#${t.id}`}</b> · {t.subject}</span>
            <span onClick={e => close(e, t.id)} title="Fechar aba"
              className="shrink-0 rounded p-0.5 hover:bg-[var(--surface-hover)] opacity-60 group-hover:opacity-100" style={{ color: 'var(--text-muted)' }}>
              <X size={12} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
