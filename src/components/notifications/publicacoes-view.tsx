'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Megaphone, ChevronDown, Clock, ClipboardList, X, Download } from 'lucide-react'
import { sanitizeRich } from '@/lib/sanitize-html'

interface Comunicado {
  id: string; tipo: string; title: string; message: string
  sent_by: string | null; read?: boolean; expires_at: string | null; created_at: string | null
  customers?: string[]; recipients?: number   // só no modo admin (todas as publicações criadas)
  origem?: 'comunicado' | 'notificacao'        // em "Criadas": de onde veio
}
interface NotifRow { id: number; type: string; title: string; message: string; expires_at: string | null; created_at: string | null; is_template?: boolean; acks_count?: number }
const TIPO_L: Record<string, string> = {
  aviso: 'Aviso', formal: 'Comunicação formal', campanha: 'Campanha', marketing: 'Marketing',
  info: 'Informativo', action: 'Ação', require_ack: 'Leitura/decisão', poll: 'Enquete',
}
// Urgência (p/ ordenar). Depois, por data (mais recente primeiro).
const URG: Record<string, number> = { require_ack: 4, aviso: 3, action: 3, formal: 2, campanha: 1, poll: 1, info: 1, marketing: 0 }
const byUrgencyThenDate = (a: Comunicado, b: Comunicado) =>
  (URG[b.tipo] ?? 0) - (URG[a.tipo] ?? 0) || (b.created_at ?? '').localeCompare(a.created_at ?? '')

/** Publicações. scope='mine' (recebidas) | 'feed' (mural: tudo que posso ler) | 'all' (todas criadas, admin). */
export function PublicacoesView({ scope = 'mine' }: { scope?: 'mine' | 'feed' | 'all' } = {}) {
  const { user } = useAuth()
  const { resolvedTheme } = useTheme()
  const [rows, setRows] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [logTarget, setLogTarget] = useState<Comunicado | null>(null)
  const isAdmin = user?.type === 'admin'

  useEffect(() => {
    if (!resolvedTheme) return
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light'
    setLoading(true)
    if (scope === 'all') {
      // Criadas = comunicados (Central de Comunicação) + notificações/avisos/decisões (Central de Notificações).
      Promise.all([
        api.get<{ data: (Omit<Comunicado, 'id' | 'origem'> & { id: number })[] }>(`/communications?theme=${theme}`).catch(() => ({ data: [] })),
        api.get<{ data: NotifRow[] }>('/notifications/manage').catch(() => ({ data: [] })),
      ]).then(([cs, ns]) => {
        const comms: Comunicado[] = (cs.data ?? []).map(c => ({ ...c, id: `c${c.id}`, origem: 'comunicado' as const }))
        const notifs: Comunicado[] = (ns.data ?? []).filter(n => !n.is_template).map(n => ({
          id: `n${n.id}`, tipo: n.type, title: n.title, message: n.message ?? '',
          sent_by: null, expires_at: n.expires_at ?? null, created_at: n.created_at ?? null,
          recipients: n.acks_count, origem: 'notificacao' as const,
        }))
        const merged = [...comms, ...notifs]
        setRows(merged); setOpen(merged.length ? merged[0].id : null)
      }).finally(() => setLoading(false))
    } else if (scope === 'feed') {
      // Mural = tudo que posso ler: broadcast/endereçadas + notificações informativas (info/aviso/formal).
      Promise.all([
        api.get<{ data: (Omit<Comunicado, 'id' | 'origem'> & { id: number })[] }>(`/communications/feed?theme=${theme}`).catch(() => ({ data: [] })),
        api.get<{ data: { notifications: NotifRow[] } }>('/notifications').catch(() => ({ data: { notifications: [] } })),
      ]).then(([cs, ns]) => {
        const comms: Comunicado[] = (cs.data ?? []).map(c => ({ ...c, id: `c${c.id}`, origem: 'comunicado' as const }))
        const notifs: Comunicado[] = ((ns.data?.notifications) ?? []).filter(n => ['info', 'aviso', 'formal'].includes(n.type)).map(n => ({
          id: `n${n.id}`, tipo: n.type, title: n.title, message: n.message ?? '',
          sent_by: null, expires_at: n.expires_at ?? null, created_at: n.created_at ?? null, origem: 'notificacao' as const,
        }))
        const merged = [...comms, ...notifs]
        setRows(merged); setOpen(merged.length ? merged[0].id : null)
      }).finally(() => setLoading(false))
    } else {
      api.get<{ data: (Omit<Comunicado, 'id'> & { id: number })[] }>(`/communications/mine?theme=${theme}`)
        .then(r => { const d = (r.data ?? []).map(c => ({ ...c, id: `c${c.id}` })); setRows(d); setOpen(d.length ? d[0].id : null) })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [resolvedTheme, scope])

  const dt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

  return (
    <div className="space-y-4 max-w-3xl">
      {loading ? (
        <div className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="ds-card p-8 text-center">
          <Megaphone size={32} className="mx-auto mb-2" style={{ color: 'var(--text-light)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma publicação no momento.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...rows].sort(byUrgencyThenDate).map(c => {
            const isOpen = open === c.id
            return (
              <div key={c.id} className="ds-card overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : c.id)} className="w-full flex items-center gap-3 p-3 text-left">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{TIPO_L[c.tipo] ?? c.tipo}</span>
                  {c.origem === 'notificacao' && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>notificação</span>}
                  <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{c.title}</span>
                  <span className="text-[11px] shrink-0 inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Clock size={12} /> {dt(c.created_at)}</span>
                  <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="comunicado-body text-sm" style={{ color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(c.message) }} />
                    {(c.sent_by || c.expires_at || c.customers?.length || c.recipients != null) && (
                      <div className="mt-3 pt-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
                        {c.sent_by && <span>Enviado por {c.sent_by}</span>}
                        {!!c.customers?.length && <span>Para: {c.customers.join(', ')}</span>}
                        {c.recipients != null && <span>{c.recipients} {c.origem === 'notificacao' ? 'aceite(s)/resposta(s)' : 'destinatário(s)'}</span>}
                        {c.expires_at && <span>Disponível até {dt(c.expires_at)}</span>}
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => setLogTarget(c)} className="mt-2 text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--primary)' }}>
                        <ClipboardList size={12} /> Log de leitura{c.origem === 'notificacao' ? ' / decisão' : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <style jsx global>{`
        .comunicado-body img { max-width: 100%; height: auto; border-radius: 8px; }
        .comunicado-body a { color: var(--primary); text-decoration: underline; }
        .comunicado-body p { margin: 0 0 .6em; line-height: 1.55; }
        .comunicado-body ul, .comunicado-body ol { padding-left: 1.4em; margin: 0 0 .6em; }
      `}</style>

      {logTarget && <PubLog item={logTarget} onClose={() => setLogTarget(null)} />}
    </div>
  )
}

interface LogRow { user_id: number | null; user_name: string; user_email: string; is_client?: boolean; viewed_at: string | null; response: string | null; responded_at: string | null }
interface LogData { recipients: LogRow[]; summary: { total: number; viewed: number; responded: number; actions: string[]; by_action: Record<string, number> } }

/** Log de leitura/decisão de uma publicação (comunicado ou notificação) — inclui clientes. */
function PubLog({ item, onClose }: { item: Comunicado; onClose: () => void }) {
  const [data, setData] = useState<LogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'viewed' | 'pending'>('all')
  const [respFilter, setRespFilter] = useState<string>('all') // 'all' | 'none' | <rótulo da resposta>
  const realId = item.id.slice(1)
  const url = item.origem === 'notificacao' ? `/notifications/${realId}/log` : `/communications/${realId}/log`

  useEffect(() => {
    api.get<{ data: LogData }>(url).then(r => setData(r.data ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [url])

  const dt = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR') : '—'
  const hasActions = (data?.summary.actions.length ?? 0) > 0
  const rows = (data?.recipients ?? []).filter(r => {
    const okView = filter === 'all' ? true : filter === 'viewed' ? !!r.viewed_at : !r.viewed_at
    const okResp = respFilter === 'all' ? true : respFilter === 'none' ? !r.response : r.response === respFilter
    return okView && okResp
  })

  // Exporta as linhas FILTRADAS em CSV (abre no Excel; BOM + ';' p/ pt-BR e acentos).
  const exportCsv = () => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Destinatário', 'E-mail', item.origem === 'notificacao' ? 'Visualizou' : 'Leu', 'Resposta']
    const lines = rows.map(r => [r.user_name, r.user_email, r.viewed_at ? dt(r.viewed_at) : '', r.response ?? ''])
    const csv = '﻿' + [header, ...lines].map(l => l.map(esc).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `log-${(item.title || 'comunicado').replace(/[^\w]+/g, '_').slice(0, 40)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
          <ClipboardList size={17} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-bold flex-1 truncate" style={{ color: 'var(--primary)' }}>Log · {item.title}</span>
          <button onClick={onClose} style={{ color: 'var(--primary)' }}><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
          {data && (
            <>
              <div className="flex flex-wrap gap-2 text-[12px]">
                <span className="px-2 py-1 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><b>{data.summary.viewed}</b>/{data.summary.total} {item.origem === 'notificacao' ? 'visualizaram' : 'leram'}</span>
                {hasActions && <span className="px-2 py-1 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><b>{data.summary.responded}</b> responderam</span>}
                {data.summary.actions.map(a => <span key={a} className="px-2 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{a}: <b>{data.summary.by_action[a] ?? 0}</b></span>)}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                {([['all', 'Todos'], ['viewed', item.origem === 'notificacao' ? 'Viram' : 'Leram'], ['pending', 'Não leram']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className="px-2.5 py-1 rounded-md font-medium" style={{ background: filter === k ? 'var(--primary-soft)' : 'transparent', color: filter === k ? 'var(--primary)' : 'var(--text-muted)' }}>{l}</button>
                ))}
                <div className="flex-1" />
                <button onClick={exportCsv} title="Exportar em Excel (CSV)" className="ds-btn-secondary inline-flex items-center gap-1 px-2.5 py-1 whitespace-nowrap"><Download size={12} /> Exportar Excel</button>
              </div>

              {/* Filtro por RESPOSTA (só quando há botões de decisão) */}
              {hasActions && (
                <div className="flex items-center gap-1 text-[11px] flex-wrap">
                  <span className="mr-0.5" style={{ color: 'var(--text-light)' }}>Resposta:</span>
                  {([['all', 'Todas'], ...data.summary.actions.map(a => [a, a] as [string, string]), ['none', 'Não respondida']] as [string, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setRespFilter(k)} className="px-2.5 py-1 rounded-md font-medium"
                      style={{ background: respFilter === k ? 'var(--primary-soft)' : 'transparent', color: respFilter === k ? 'var(--primary)' : 'var(--text-muted)' }}>{l}</button>
                  ))}
                </div>
              )}
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)' }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Destinatário</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>{item.origem === 'notificacao' ? 'Visualizou' : 'Leu'}</th>
                      {hasActions && <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Resposta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum destinatário.</td></tr>}
                    {rows.map((r, i) => (
                      <tr key={r.user_id ?? `e${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{r.user_name} {r.is_client && <span className="text-[9px] px-1 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>cliente</span>}<div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{r.user_email}</div></td>
                        <td className="px-3 py-2" style={{ color: r.viewed_at ? 'var(--text-muted)' : 'var(--text-light)' }}>{r.viewed_at ? dt(r.viewed_at) : '—'}</td>
                        {hasActions && <td className="px-3 py-2">{r.response ? <span className="px-1.5 py-0.5 rounded-full text-[11px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{r.response}</span> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
