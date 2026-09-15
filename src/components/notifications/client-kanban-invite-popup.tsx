'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Mail, X } from 'lucide-react'
import { kanbanApi, type KMyInvite } from '@/lib/client-kanban'
import { ApiError } from '@/lib/api'

const POLL_MS = 30000   // rede de segurança — o convite aparece sem o usuário recarregar

/**
 * Pop-up exibido ao CLIENTE quando há convite(s) pendente(s) para quadro(s) de Meus Processos.
 * Espelha o comportamento do pop-up interno (checa ao montar + polling + ao focar a aba), mas
 * usa a fonte segura do cliente (`/client/kanban/my-invites`). Ao aceitar, libera o acesso e
 * abre o quadro. "Agora não" só dispensa nesta sessão — o convite continua listado em Comunicados.
 */
export function ClientKanbanInvitePopup() {
  const router = useRouter()
  const pathname = usePathname()
  const [invites, setInvites] = useState<KMyInvite[]>([])
  const [open, setOpen] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const dismissed = useRef<Set<string>>(new Set())   // tokens dispensados nesta sessão → não re-incomoda
  const openRef = useRef(false)
  openRef.current = open

  const check = useCallback(() => {
    // A tela de Meus Processos já trata o convite (modal próprio); não duplica o pop-up lá.
    if (openRef.current || pathname.startsWith('/portal-cliente/kanban')) return
    kanbanApi.myInvites()
      .then(r => {
        const list = (r.items ?? []).filter(i => !dismissed.current.has(i.token))
        if (list.length > 0) { setInvites(list); setOpen(true) }
      })
      .catch(() => {})
  }, [pathname])

  useEffect(() => {
    check()
    const t = setInterval(check, POLL_MS)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [check])

  if (!open || invites.length === 0) return null

  const top = invites[0]
  const rest = invites.length - 1

  const dismiss = () => { dismissed.current.add(top.token); setOpen(false) }
  const accept = async () => {
    setAccepting(true)
    try {
      const r = await kanbanApi.acceptInvite(top.token)
      const bid = r?.data?.board_id ?? top.board_id
      dismissed.current.add(top.token)
      setOpen(false)
      router.push(`/portal-cliente/kanban/${bid}?aceito=1`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Não foi possível aceitar o convite')
      setAccepting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
          <Mail size={18} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-bold flex-1" style={{ color: 'var(--primary)' }}>
            {invites.length === 1 ? 'Você tem um convite' : `Você tem ${invites.length} convites`}
          </span>
          <button onClick={dismiss} style={{ color: 'var(--primary)' }}><X size={16} /></button>
        </div>

        <div className="p-5 space-y-1.5">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {top.inviter_name ? <><b style={{ color: 'var(--text)' }}>{top.inviter_name}</b> convidou você</> : 'Você foi convidado(a)'} para o quadro{top.board_name ? <> <b style={{ color: 'var(--text)' }}>{top.board_name}</b></> : ''} em Meus Processos.
          </p>
          {rest > 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>+ {rest} outro{rest > 1 ? 's' : ''} convite{rest > 1 ? 's' : ''} pendente{rest > 1 ? 's' : ''}</p>}
        </div>

        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={dismiss} disabled={accepting} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Agora não</button>
          <button onClick={accept} disabled={accepting} className="ds-btn-primary text-sm px-5 py-2 rounded-lg font-medium">{accepting ? 'Aceitando…' : 'Aceitar e acessar'}</button>
        </div>
      </div>
    </div>
  )
}
