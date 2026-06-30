'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Wallet, X } from 'lucide-react'

interface ActionItem { key: string; title: string; message: string; cta_label: string; cta_url: string; count: number }

const TWO_HOURS = 2 * 60 * 60 * 1000
const CHECK_MS = 10 * 60 * 1000           // verifica a cada 10 min, mas só exibe se passou 2h
const LS = (uid: number) => `pay_remind_last_${uid}`

/**
 * Lembrete recorrente (a cada 2h) de DESPESAS PARA PAGAR — só para o administrativo.
 * Gated por localStorage: ao exibir, marca o horário; só reaparece 2h depois. Roda enquanto
 * o app está aberto (verifica no mount, a cada 10 min e ao focar a aba).
 */
export function PayExpensesReminder({ userId, userType }: { userId: number; userType: string }) {
  const router = useRouter()
  const [action, setAction] = useState<ActionItem | null>(null)
  const enabled = userType === 'administrativo'

  const check = useCallback(async () => {
    if (!enabled) return
    const last = Number(localStorage.getItem(LS(userId)) || 0)
    if (Date.now() - last < TWO_HOURS) return
    try {
      const r = await api.get<{ data: ActionItem[] }>('/notifications/actions')
      const pay = (r.data ?? []).find(a => a.key === 'pay_exp')
      if (pay && pay.count > 0) {
        setAction(pay)
        localStorage.setItem(LS(userId), String(Date.now()))
      }
    } catch { /* nunca trava a UI */ }
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled) return
    check()
    const t = setInterval(check, CHECK_MS)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [enabled, check])

  if (!action) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-[popIn_.18s_ease-out]" style={{ background: 'var(--surface)', border: '1px solid var(--warning-border)' }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--warning-bg)' }}>
          <Wallet size={18} style={{ color: 'var(--warning-border)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--warning-border)' }}>Despesas para pagar</span>
          <button onClick={() => setAction(null)} className="ml-auto" style={{ color: 'var(--warning-border)' }} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-5">
          <p className="text-sm" style={{ color: 'var(--text)' }}>{action.message}</p>
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setAction(null)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Ver depois</button>
          <button onClick={() => { const url = action.cta_url; setAction(null); router.push(url) }} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg"><Wallet size={15} /> {action.cta_label}</button>
        </div>
      </div>
    </div>
  )
}
