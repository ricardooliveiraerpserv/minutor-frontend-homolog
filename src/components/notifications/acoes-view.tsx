'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { ShieldAlert, BellRing, ChevronDown } from 'lucide-react'
import { ActionRemindersPanel } from '@/components/notifications/action-reminders-panel'

interface ActionItem { key: string; title: string; message: string; cta_label: string; cta_url: string; priority: string; count: number }

const PRIO: Record<string, { color: string; bg: string }> = {
  critical: { color: 'var(--danger-border)', bg: 'var(--danger-bg)' },   // vermelho
  high:     { color: 'var(--warning-border)', bg: 'var(--warning-bg)' },  // amarelo
  medium:   { color: 'var(--primary)', bg: 'var(--primary-soft)' },
  low:      { color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
}
const POLL_MS = 30000

/**
 * Central de Ações — pendências de ação do perfil (persistem até resolver):
 * consultor → apontamentos rejeitados/ajustes + despesas; coordenador → aprovações;
 * administrativo → despesas a aprovar/pagar. Mesma fonte do "Para resolver" do Meu Dia.
 */
export function AcoesView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [actions, setActions] = useState<ActionItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const router = useRouter()

  const load = useCallback(() => {
    api.get<{ data: ActionItem[] }>('/notifications/actions')
      .then(r => setActions(r?.data ?? [])).catch(() => {}).finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  if (!loaded) return <div className="ds-card p-6 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div className="space-y-2 max-w-3xl">
      {/* Cabeçalho — sempre visível; admin tem o atalho da recorrência aqui. */}
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} style={{ color: 'var(--danger-border)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Ações</span>
        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· pendências que exigem você (ficam aqui até resolver)</span>
        {isAdmin && (
          <button onClick={() => setShowConfig(s => !s)} className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            style={{ border: '1px solid var(--border)', color: showConfig ? 'var(--primary)' : 'var(--text-muted)' }}>
            <BellRing size={13} /> Recorrência dos lembretes
            <ChevronDown size={13} style={{ transform: showConfig ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        )}
      </div>

      {/* Painel admin de recorrência (colapsável) */}
      {isAdmin && showConfig && (
        <div className="ds-card p-3"><ActionRemindersPanel /></div>
      )}

      {/* Lista de pendências ou estado vazio */}
      {actions.length === 0 ? (
        <div className="ds-card p-8 text-center space-y-1">
          <ShieldAlert size={24} className="mx-auto" style={{ color: 'var(--success-border)' }} />
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nada pendente 🎉</div>
          <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Você não tem ações aguardando no momento.</div>
        </div>
      ) : actions.map(a => {
        const p = PRIO[a.priority] ?? PRIO.medium
        return (
          <div key={a.key} className="ds-card p-3 flex items-center gap-3" style={{ borderLeft: `4px solid ${p.color}` }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{a.title}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: p.bg, color: p.color }}>{a.count}</span>
              </div>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.message}</p>
            </div>
            <button onClick={() => router.push(a.cta_url)} className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm whitespace-nowrap font-medium shrink-0" style={{ background: p.color, color: '#fff' }}>{a.cta_label}</button>
          </div>
        )
      })}
    </div>
  )
}
