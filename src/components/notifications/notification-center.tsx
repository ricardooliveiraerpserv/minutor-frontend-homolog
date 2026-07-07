'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, ShieldAlert, Pencil, Megaphone, ChevronsDown } from 'lucide-react'
import { PollCard, type Poll } from '@/components/notifications/poll-card'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'

interface Notif {
  id: number; title: string; message: string; type: 'info' | 'action' | 'require_ack' | 'poll' | 'aviso' | 'formal'
  priority: 'low' | 'medium' | 'high' | 'critical'; requires_ack: boolean
  cta_label: string | null; cta_url: string | null; version: number; expires_at: string | null
  viewed: boolean; acked: boolean; pending_ack: boolean; ack_at: string | null
  poll: Poll | null; created_at?: string | null
  actions?: string[] | null; my_response?: string | null
}
interface ActionItem { key: string; title: string; message: string; cta_label: string; cta_url: string; priority: string; count: number }

const PRIO: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Crítico', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
  high:     { label: 'Alta',    color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  medium:   { label: 'Média',   color: 'var(--primary)', bg: 'var(--primary-soft)' },
  low:      { label: 'Baixa',   color: 'var(--text-muted)', bg: 'var(--surface-sunken)' },
}
const POLL_MS = 30000

/** Centro de Notificações: alertas (exige você), enquetes e informativos + gestão (admin). */
export function NotificationCenter() {
  const [items, setItems] = useState<Notif[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [ackTarget, setAckTarget] = useState<Notif | null>(null)
  const ackBodyRef = useRef<HTMLDivElement>(null)
  const [ackCanOk, setAckCanOk] = useState(true)
  useEffect(() => {
    const id = requestAnimationFrame(() => { const el = ackBodyRef.current; setAckCanOk(!el || el.scrollHeight <= el.clientHeight + 4) })
    return () => cancelAnimationFrame(id)
  }, [ackTarget?.id])
  const router = useRouter()

  const load = useCallback(() => {
    api.get<{ data: { notifications: Notif[] } }>('/notifications')
      .then(r => {
        const list = r?.data?.notifications ?? []
        setItems(list)
        list.filter(n => !n.viewed).forEach(n => api.post(`/notifications/${n.id}/view`, {}).catch(() => {}))
      }).catch(() => {})
    // Meu Dia "Para resolver" = ações DO DIA (após 17h, carrega p/ o dia seguinte). Lista completa fica na aba Ações.
    api.get<{ data: ActionItem[] }>('/notifications/actions?scope=today').then(r => setActions(r?.data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  const respond = async (n: Notif, action: string) => {
    setItems(p => p.map(x => x.id === n.id ? { ...x, my_response: action, pending_ack: false, acked: true } : x))
    try { await api.post(`/notifications/${n.id}/respond`, { action }); toast.success('Resposta registrada ✓') }
    catch { toast.error('Erro ao responder'); load() }
  }
  const confirmAck = async (n: Notif) => {
    try { await api.post(`/notifications/${n.id}/ack`, {}); toast.success('Leitura confirmada'); setAckTarget(null); load() }
    catch { toast.error('Erro ao confirmar') }
  }

  // SÓ AÇÃO (executável): leitura obrigatória, botões de decisão, ações com CTA + pendências de aprovação.
  // "Para resolver" = só os que exigem aceite e AINDA NÃO foram aceitos. Uma vez aceito, sai daqui.
  const importantes = items.filter(n => (n.type === 'require_ack' || n.requires_ack) && !n.acked)
  // Sem duplicar: o card agregado (homeActions, com a QUANTIDADE) manda. Notificações individuais que
  // levam à MESMA tela (rejeição/ajuste de apontamento, pendências de despesa) não repetem aqui — fica
  // só o card com a contagem (elas continuam aparecendo como pop-up). Cobre o card atual + telas conhecidas.
  const actionCtas = new Set(actions.map(a => a.cta_url).filter(Boolean))
  // Telas cobertas por um card agregado (apontamentos, despesas, aprovações, pagamento de despesas).
  const AGG_SCREENS = ['/timesheets?status=', '/expenses', '/approvals', '/pagamento-despesas']
  const isAggregated = (cta?: string | null) => !!cta && (actionCtas.has(cta) || AGG_SCREENS.some(s => cta.startsWith(s)))
  const acoes = items.filter(n => n.type === 'action' && !n.requires_ack && !isAggregated(n.cta_url))

  // NOTIFICAÇÕES DO DIA — informativos + enquetes criados/recebidos HOJE (inclui os criados por mim).
  // A lista completa de informativos continua no sino da topbar; aqui é só o do dia, com voto na enquete.
  const hoje = new Date().toDateString()
  const isHoje = (n: Notif) => !!n.created_at && new Date(n.created_at).toDateString() === hoje
  // "Notificações de hoje" = infos do dia + TODOS os avisos que exigiam aceite e já foram aceitos
  // (independente da data — pra não SUMIR ao aceitar). Não duplica com "Para resolver" (que só tem pendentes).
  const infosHoje = items.filter(n =>
    (n.type === 'info' || n.type === 'aviso' || n.type === 'formal')
    && (!n.requires_ack || n.acked)                     // fora os pendentes de aceite (esses em "Para resolver")
    && (isHoje(n) || (n.requires_ack && n.acked)))      // do dia OU aviso já aceito (não some)
  const enquetesHoje = items.filter(n => n.type === 'poll' && n.poll && isHoje(n))

  return (
    <div className="space-y-5">
      {/* ── PARA RESOLVER — tudo que exige sua ação ── */}
      <Block title="Para resolver" subtitle="O que exige sua ação agora" icon={<ShieldAlert size={16} style={{ color: 'var(--danger-border)' }} />} count={importantes.length + actions.length + acoes.length} tone="danger">
        {actions.map(a => <ActionCard key={a.key} a={a} router={router} />)}
        {importantes.map(n => <Card key={n.id} n={n} badge="Urgente" onAck={() => setAckTarget(n)} onRespond={a => respond(n, a)} router={router} />)}
        {acoes.map(n => <Card key={n.id} n={n} router={router} />)}
      </Block>

      {/* ── NOTIFICAÇÕES DE HOJE — informativos + enquetes do dia (inclui as que você criou) ── */}
      {(infosHoje.length + enquetesHoje.length) > 0 && (
        <Block title="Notificações de hoje" subtitle="Comunicados e enquetes do dia" icon={<Megaphone size={16} style={{ color: 'var(--primary)' }} />} count={infosHoje.length + enquetesHoje.length}>
          {enquetesHoje.map(n => <PollCard key={n.id} title={n.title} priority={n.priority} poll={n.poll!} />)}
          {infosHoje.map(n => <Card key={n.id} n={n} muted router={router} />)}
        </Block>
      )}

      {ackTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--danger-bg)' }}>
              <AlertTriangle size={18} style={{ color: 'var(--danger-border)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--danger-border)' }}>Leitura obrigatória</span>
            </div>
            <div className="p-5 space-y-3">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{ackTarget.title}</h2>
              <div ref={ackBodyRef} onScroll={e => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) setAckCanOk(true) }} className="text-sm max-h-60 overflow-auto" style={{ color: 'var(--text-muted)' }}>
                {isHtmlBody(ackTarget.message)
                  ? <div className="hd-rich" dangerouslySetInnerHTML={{ __html: sanitizeRich(ackTarget.message) }} />
                  : <p className="whitespace-pre-wrap">{ackTarget.message}</p>}
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              {!ackCanOk && <span className="text-[11px] mr-auto inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><ChevronsDown size={12} /> Role até o fim para confirmar</span>}
              <button onClick={() => confirmAck(ackTarget)} disabled={!ackCanOk} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"><CheckCircle2 size={15} /> Confirmar leitura</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ghostBtn = 'inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs whitespace-nowrap'

function ActionCard({ a, router }: { a: ActionItem; router: ReturnType<typeof useRouter> }) {
  const p = PRIO[a.priority] ?? PRIO.medium
  return (
    <div className="ds-card p-2.5 flex items-center gap-2.5" style={{ borderLeft: `3px solid ${p.color}` }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{a.title}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: p.bg, color: p.color }}>{a.count}</span>
        </div>
        <p className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{a.message}</p>
      </div>
      <button onClick={() => router.push(a.cta_url)} className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs whitespace-nowrap font-medium shrink-0" style={{ background: p.color, color: '#fff' }}>{a.cta_label}</button>
    </div>
  )
}

function Block({ title, subtitle, icon, count, tone = 'default', children }: { title: string; subtitle: string; icon: React.ReactNode; count: number; tone?: 'default' | 'danger' | 'muted'; children: React.ReactNode }) {
  const wrap = tone === 'danger' ? 'rounded-xl p-3 space-y-1.5' : 'space-y-1.5'
  const wrapStyle = tone === 'danger'
    ? { background: 'color-mix(in srgb, var(--danger-bg) 55%, transparent)', border: '1px solid var(--danger-border)' }
    : undefined
  return (
    <div className={wrap} style={wrapStyle}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold" style={{ color: tone === 'danger' ? 'var(--danger-border)' : 'var(--text)' }}>{title}</span>
        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {subtitle}</span>
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-light)' }}>{count}</span>
      </div>
      {count === 0 ? <p className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>Nada por aqui. 🎉</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

function Card({ n, onAck, onRespond, router, badge, muted }: { n: Notif; onAck?: () => void; onRespond?: (action: string) => void; router: ReturnType<typeof useRouter>; badge?: string; muted?: boolean }) {
  const p = PRIO[n.priority] ?? PRIO.medium
  const hasActions = !!n.actions?.length
  const expired = !!n.expires_at && new Date(n.expires_at) < new Date()
  const fmtPrazo = n.expires_at ? new Date(n.expires_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  const [editing, setEditing] = useState(false)
  return (
    <div className="ds-card p-2.5 flex items-center gap-2.5" style={{ borderLeft: `3px solid ${muted ? 'var(--border)' : p.color}` }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{n.title}</span>
          {badge
            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}>{badge}</span>
            : !muted && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: p.bg, color: p.color }}>{p.label}</span>}
          {n.acked && !hasActions && <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: 'var(--success-border)' }}><CheckCircle2 size={11} /> aceito</span>}
          {hasActions && n.my_response && <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: 'var(--success-border)' }}><CheckCircle2 size={11} /> {n.my_response}</span>}
        </div>
        {isHtmlBody(n.message)
          ? <div className="text-[13px] mt-0.5 hd-rich truncate" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(n.message) }} />
          : <p className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{n.message}</p>}
        {hasActions && (expired ? (
          <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-light)' }}>
            {n.my_response ? `Respondido: ${n.my_response}` : 'Sem resposta'} · prazo encerrado
          </div>
        ) : (!n.my_response || editing) ? (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {n.actions!.map(a => {
                const chosen = a === n.my_response
                return (
                  <button key={a} onClick={() => { onRespond?.(a); setEditing(false) }} className={ghostBtn}
                    style={chosen
                      ? { background: 'var(--primary)', color: '#fff', height: 30, border: '1px solid var(--primary)' }
                      : { border: '1px solid var(--primary)', color: 'var(--primary)', height: 30 }}>
                    {chosen && <CheckCircle2 size={12} className="mr-1" />}{a}
                  </button>
                )
              })}
              {n.my_response && <button onClick={() => setEditing(false)} className={ghostBtn} style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', height: 30 }}>Cancelar</button>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => setEditing(true)} className={ghostBtn} style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', height: 30 }}><Pencil size={12} className="mr-1" /> Editar resposta</button>
            <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>pode mudar até {fmtPrazo}</span>
          </div>
        ))}
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {!hasActions && n.pending_ack && <button onClick={onAck} className={ghostBtn} style={{ border: '1px solid var(--primary)', color: 'var(--primary)' }}>Confirmar leitura</button>}
        {!hasActions && n.type === 'action' && n.cta_label && n.cta_url && (
          <button onClick={() => { api.post(`/notifications/${n.id}/view`, {}).catch(() => {}); router.push(n.cta_url!) }} className={ghostBtn} style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{n.cta_label}</button>
        )}
      </div>
    </div>
  )
}
