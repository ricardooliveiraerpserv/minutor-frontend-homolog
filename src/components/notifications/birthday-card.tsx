'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Cake, PartyPopper, X, Gift } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

interface Birthday { id: number; name: string; is_me: boolean; already_sent: boolean }
interface BirthdayMsg { id: number; from_name: string; message: string; created_at: string }

const SUGGESTIONS = [
  'Parabéns! 🎉 Muitas felicidades!',
  'Feliz aniversário! 🎂 Tudo de bom pra você!',
  'Parabéns pelo seu dia! 🥳 Saúde e sucesso!',
  '🎉🎂🎈 Felicidades!',
]

/** Card de aniversários na tela inicial: parabenizar a equipe + ler os próprios parabéns. */
export function BirthdayCard() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [isMyBirthday, setIsMyBirthday] = useState(false)
  const [received, setReceived] = useState(0)
  const [sendTo, setSendTo] = useState<Birthday | null>(null)
  const [reading, setReading] = useState(false)

  const load = useCallback(() => {
    api.get<{ data: { birthdays: Birthday[]; is_my_birthday: boolean; received_count: number } }>('/birthdays/today')
      .then(r => {
        setBirthdays(r.data?.birthdays ?? [])
        setIsMyBirthday(r.data?.is_my_birthday ?? false)
        setReceived(r.data?.received_count ?? 0)
      }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const others = birthdays.filter(b => !b.is_me)
  if (!isMyBirthday && others.length === 0) return null

  return (
    <>
      {/* Banner do próprio aniversário */}
      {isMyBirthday && (
        <div className="ds-card p-4 flex items-center gap-3" style={{ borderLeft: '3px solid var(--primary)', background: 'var(--primary-soft)' }}>
          <PartyPopper size={26} style={{ color: 'var(--primary)' }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>🎂 Hoje é seu aniversário!</p>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>🎉 Você recebeu {received} mensagem{received === 1 ? '' : 's'}</p>
          </div>
          {received > 0 && <button onClick={() => setReading(true)} className="ds-btn-primary text-xs px-3.5 py-1.5 rounded-lg whitespace-nowrap">Ver mensagens</button>}
        </div>
      )}

      {/* Aniversariantes da equipe */}
      {others.map(b => (
        <div key={b.id} className="ds-card p-3.5 flex items-center gap-3" style={{ borderLeft: '3px solid var(--primary)' }}>
          <Cake size={20} style={{ color: 'var(--primary)' }} />
          <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>🎂 Hoje é aniversário de <b>{b.name}</b></span>
          <button onClick={() => setSendTo(b)} disabled={b.already_sent}
            className="text-xs px-3.5 py-1.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1.5"
            style={b.already_sent
              ? { color: 'var(--success-border)', border: '1px solid var(--border)' }
              : { background: 'var(--primary)', color: 'var(--primary-fg)' }}>
            {b.already_sent ? <>✓ Enviado</> : <><PartyPopper size={13} /> Parabenizar</>}
          </button>
        </div>
      ))}

      {sendTo && <SendModal to={sendTo} onClose={() => setSendTo(null)} onSent={() => { setSendTo(null); load() }} />}
      {reading && <ReadModal onClose={() => setReading(false)} />}
    </>
  )
}

function SendModal({ to, onClose, onSent }: { to: Birthday; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const send = async () => {
    setSaving(true)
    try {
      await api.post(`/birthdays/${to.id}/message`, { message: text.trim() || null })
      toast.success('Parabéns enviado! 🎉'); onSent()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao enviar') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
          <PartyPopper size={18} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Parabenizar {to.name}</span>
          <button onClick={onClose} className="ml-auto" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 200))} rows={3} maxLength={200}
            placeholder="Escreva uma mensagem (ou mande só um emoji 🎉)…"
            className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setText(s)} className="text-[11px] px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{s}</button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{text.length}/200</span>
            <button onClick={send} disabled={saving} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg"><Gift size={15} /> Enviar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadModal({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<BirthdayMsg[]>([])
  const { user } = useAuth()
  useEffect(() => {
    if (!user?.id) return
    api.get<{ data: BirthdayMsg[] }>(`/birthdays/${user.id}/messages`).then(r => setMsgs(r.data ?? [])).catch(() => {})
  }, [user?.id])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
          <PartyPopper size={18} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Suas mensagens de aniversário 🎉</span>
          <button onClick={onClose} className="ml-auto" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-4 space-y-2 overflow-auto">
          {msgs.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma mensagem ainda.</p>}
          {msgs.map(m => (
            <div key={m.id} className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{m.from_name}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{new Date(m.created_at).toLocaleString('pt-BR')}</span>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{m.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
