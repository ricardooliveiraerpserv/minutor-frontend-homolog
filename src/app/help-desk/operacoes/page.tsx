'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { RedistribuirModal } from '@/components/help-desk/redistribuir-modal'
import { Radar, AlertTriangle, TrendingUp, Users, KanbanSquare, Building2, PlayCircle, RefreshCw, ArrowUpRight } from 'lucide-react'

// ── Tipos (espelham a saída estruturada do OperationsDiagnostics/Service — IA-swappable) ──
type Sev = 'danger' | 'warning' | 'info' | 'ok'
interface Action { kind: string; ticket_id?: number; query?: Record<string, string | number>; team_id?: number | null; customer_id?: number; assignee_id?: number; label?: string }
interface Atencao { severity: Sev; code: string; message: string; action: Action | null }
interface Tendencia { severity: Sev; message: string; action: Action | null }
interface EquipeRow { user_id: number; nome: string; tipo: string; sessao_ativa: boolean; em_atendimento: number; vencidos: number; sla: string; tempo_medio_seg: number | null; horas_hoje: number; ultima_atividade: string | null }
interface FilaCard { team_id: number | null; nome: string; cor: string | null; aguardando: number; em_atendimento: number; aguardando_cliente: number; vencidos: number; consultores_ativos: number; parada_min: number | null; total: number }
interface ClienteRisco { customer_id: number; nome: string; severity: Sev; motivos: { code: string; label: string; sev: Sev }[]; abertos: number }
interface Sessao { session_id: number; user_id: number; nome: string; label: string; duracao_seg: number; atendidos: number; resolvidos: number; horas_apontadas: number; playbooks: number; tempo_medio_seg: number | null; ultimo_evento: string | null }
interface Ops { atencoes: Atencao[]; tendencias: Tendencia[]; equipe: EquipeRow[]; filas: FilaCard[]; clientes: ClienteRisco[]; sessoes: Sessao[]; gerado_em: string }

const SEV: Record<Sev, { dot: string; color: string; bg: string }> = {
  danger:  { dot: '🔴', color: 'var(--danger-border)',  bg: 'var(--danger-bg)' },
  warning: { dot: '🟡', color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  info:    { dot: '🔵', color: 'var(--info-border)',     bg: 'var(--info-bg)' },
  ok:      { dot: '🟢', color: 'var(--success-border)',  bg: 'var(--success-bg)' },
}
const fmtDur = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m` }
const fmtAgo = (iso: string | null) => { if (!iso) return '—'; const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h` }

export default function CentralOperacoesPage() {
  const router = useRouter()
  const [ops, setOps] = useState<Ops | null>(null)
  const [loading, setLoading] = useState(true)
  const [redistrib, setRedistrib] = useState<{ userId: number; nome?: string } | null>(null)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get<{ data: Ops }>('/help-desk/ops').then(r => { if (r?.data) setOps(r.data) })
      .catch(() => toast.error('Erro ao carregar a Central de Operações')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  // Torre viva: atualiza discretamente a cada 60s.
  useEffect(() => { const id = setInterval(() => load(true), 60000); return () => clearInterval(id) }, [load])

  // Despacha a AÇÃO de qualquer item (atenção/tendência/linha/card). Nenhum indicador sem ação.
  const runAction = useCallback((a: Action | null) => {
    if (!a) return
    switch (a.kind) {
      case 'open_ticket': router.push(`/help-desk/tickets/${a.ticket_id}`); break
      case 'open_tickets': { const qs = new URLSearchParams(Object.entries(a.query ?? {}).map(([k, v]) => [k, String(v)])).toString(); router.push(`/help-desk/tickets${qs ? `?${qs}` : ''}`); break }
      case 'open_queue': router.push(`/help-desk/fila${a.team_id ? `?team_id=${a.team_id}` : ''}`); break
      case 'open_customer360': router.push(`/help-desk/clientes/${a.customer_id}`); break
      case 'redistribute': setRedistrib({ userId: a.assignee_id!, nome: ops?.equipe.find(e => e.user_id === a.assignee_id)?.nome }); break
    }
  }, [router, ops])

  if (loading && !ops) return <AppLayout title="Central de Operações"><div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Carregando a operação…</div></AppLayout>
  if (!ops) return <AppLayout title="Central de Operações"><div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sem dados.</div></AppLayout>

  return (
    <AppLayout title="Central de Operações">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Radar size={20} style={{ color: 'var(--primary)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Central de Operações</h1>
          </div>
          <button onClick={() => load()} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={13} /> Atualizado {fmtAgo(ops.gerado_em)}
          </button>
        </div>

        {/* 1 + 6 — Atenções (onde agir primeiro) + Tendências (frases) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Section icon={<AlertTriangle size={14} />} title="Atenções">
            {ops.atencoes.map((a, i) => (
              <ItemLinha key={i} sev={a.severity} message={a.message} action={a.action} onAct={runAction} />
            ))}
          </Section>
          <Section icon={<TrendingUp size={14} />} title="Tendências">
            {ops.tendencias.map((t, i) => (
              <ItemLinha key={i} sev={t.severity} message={t.message} action={t.action} onAct={runAction} />
            ))}
          </Section>
        </div>

        {/* 3 — Equipe */}
        <Section icon={<Users size={14} />} title={`Equipe (${ops.equipe.length} atuando)`}>
          {ops.equipe.length === 0 ? <Vazio t="Ninguém em atendimento agora." /> : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead><tr style={{ color: 'var(--text-light)' }} className="text-[11px] uppercase tracking-wide text-left">
                  <th className="px-2 py-1 font-medium">Consultor</th><th className="px-2 py-1 font-medium">Sessão</th>
                  <th className="px-2 py-1 font-medium text-center">Em atend.</th><th className="px-2 py-1 font-medium text-center">SLA</th>
                  <th className="px-2 py-1 font-medium text-center">Tempo médio</th><th className="px-2 py-1 font-medium text-center">Horas hoje</th>
                  <th className="px-2 py-1 font-medium">Últ. atividade</th><th className="px-2 py-1 font-medium text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {ops.equipe.map(e => (
                    <tr key={e.user_id} className="ds-row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-2 py-1.5" style={{ color: 'var(--text)' }}>{e.nome}</td>
                      <td className="px-2 py-1.5">{e.sessao_ativa ? <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--success-border)' }}>● ativa</span> : <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>—</span>}</td>
                      <td className="px-2 py-1.5 text-center font-semibold" style={{ color: e.em_atendimento >= 8 ? 'var(--warning-border)' : 'var(--text)' }}>{e.em_atendimento}</td>
                      <td className="px-2 py-1.5 text-center">{e.vencidos > 0 ? <span style={{ color: 'var(--danger-border)' }}>🔴 {e.vencidos}</span> : <span style={{ color: 'var(--text-light)' }}>🟢</span>}</td>
                      <td className="px-2 py-1.5 text-center" style={{ color: 'var(--text-muted)' }}>{e.tempo_medio_seg ? fmtDur(e.tempo_medio_seg) : '—'}</td>
                      <td className="px-2 py-1.5 text-center" style={{ color: 'var(--text-muted)' }}>{e.horas_hoje}h</td>
                      <td className="px-2 py-1.5 text-[12px]" style={{ color: 'var(--text-light)' }}>{fmtAgo(e.ultima_atividade)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <BtnMini onClick={() => runAction({ kind: 'open_tickets', query: { assignee_id: e.user_id } })}>chamados</BtnMini>
                        <BtnMini onClick={() => runAction({ kind: 'redistribute', assignee_id: e.user_id })}>redistribuir</BtnMini>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 4 — Filas */}
        <Section icon={<KanbanSquare size={14} />} title="Filas">
          {ops.filas.length === 0 ? <Vazio t="Nenhum chamado aberto." /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {ops.filas.map((f, i) => (
                <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-sm" style={{ color: 'var(--text)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: f.cor ?? 'var(--text-muted)' }} />{f.nome}
                    </span>
                    {f.vencidos > 0 && <span className="text-[11px] font-semibold" style={{ color: 'var(--danger-border)' }}>🔴 {f.vencidos}</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[['Aguardando', f.aguardando], ['Em atend.', f.em_atendimento], ['Aguard. cliente', f.aguardando_cliente]].map(([l, n]) => (
                      <div key={l as string} className="rounded-md py-1" style={{ background: 'var(--surface-sunken)' }}>
                        <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>{n as number}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{l as string}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{f.consultores_ativos} consultor(es) ativo(s)</span>
                    {f.parada_min != null && f.aguardando > 0 && <span style={{ color: f.parada_min >= 30 ? 'var(--warning-border)' : 'var(--text-light)' }}>parada há {f.parada_min} min</span>}
                  </div>
                  <button onClick={() => runAction({ kind: 'open_queue', team_id: f.team_id })} className="ds-btn-secondary w-full text-xs py-1.5 rounded-lg inline-flex items-center justify-center gap-1">
                    <ArrowUpRight size={13} /> Entrar na fila
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 5 — Clientes em risco (exceções) */}
        <Section icon={<Building2 size={14} />} title="Clientes em risco">
          {ops.clientes.length === 0 ? <Vazio t="Nenhum cliente em risco. 🟢" /> : (
            <div className="space-y-1.5">
              {ops.clientes.map(c => (
                <div key={c.customer_id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{SEV[c.severity].dot}</span>
                      <span className="font-medium truncate" style={{ color: 'var(--text)' }}>{c.nome}</span>
                      <span className="text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{c.abertos} aberto(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.motivos.map((m, i) => (
                        <span key={i} className="text-[10px] font-medium rounded-full px-1.5 py-0.5" style={{ color: SEV[m.sev].color, background: SEV[m.sev].bg }}>{m.label}</span>
                      ))}
                    </div>
                  </div>
                  <BtnMini onClick={() => runAction({ kind: 'open_customer360', customer_id: c.customer_id })}>Customer 360</BtnMini>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2 — Sessões de Atendimento */}
        <Section icon={<PlayCircle size={14} />} title={`Sessões de atendimento (${ops.sessoes.length})`}>
          {ops.sessoes.length === 0 ? <Vazio t="Nenhuma sessão ativa." /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {ops.sessoes.map(s => (
                <div key={s.session_id} className="rounded-lg p-3 space-y-1.5" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{s.nome}</span>
                    <span className="text-[11px]" style={{ color: 'var(--success-border)' }}>● {fmtDur(s.duracao_seg)}</span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{s.label}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{s.atendidos} atendidos</span><span>{s.resolvidos} resolvidos</span><span>{s.horas_apontadas}h</span>
                    {s.playbooks > 0 && <span>{s.playbooks} macros</span>}
                    {s.tempo_medio_seg && <span>média {fmtDur(s.tempo_medio_seg)}</span>}
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>últ. {fmtAgo(s.ultimo_evento)}</span>
                    <BtnMini onClick={() => runAction({ kind: 'open_tickets', query: { assignee_id: s.user_id } })}>ver chamados</BtnMini>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {redistrib && <RedistribuirModal fromUserId={redistrib.userId} fromName={redistrib.nome} onClose={() => setRedistrib(null)} onDone={() => { setRedistrib(null); load() }} />}
    </AppLayout>
  )
}

// ── Blocos auxiliares ──
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="ds-card p-3.5 space-y-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{icon}{title}</span>
      {children}
    </div>
  )
}
function ItemLinha({ sev, message, action, onAct }: { sev: Sev; message: string; action: Action | null; onAct: (a: Action | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm" style={{ color: SEV[sev].color }}>{SEV[sev].dot} {message}</span>
      {action && <BtnMini onClick={() => onAct(action)} primary>{action.label ?? 'Abrir'}</BtnMini>}
    </div>
  )
}
function BtnMini({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className="text-[11px] font-semibold rounded-lg px-2 py-0.5 ml-1 shrink-0 whitespace-nowrap"
      style={primary ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : { border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
      {children}
    </button>
  )
}
function Vazio({ t }: { t: string }) { return <div className="text-sm text-center py-3" style={{ color: 'var(--text-light)' }}>{t}</div> }
