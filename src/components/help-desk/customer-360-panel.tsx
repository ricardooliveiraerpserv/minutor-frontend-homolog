'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { recordUsage } from '@/lib/usage'
import { Building2, FileText, FolderKanban, Ticket, TrendingUp, Clock, ChevronDown, AlertTriangle, Zap } from 'lucide-react'

interface Ref { type: string; id: number }
interface Atencao { severity: 'danger' | 'warning' | 'info' | 'ok'; code: string; message: string; suggested_playbook: { id: number; name: string } | null }
interface Ctx {
  financeiro_visivel: boolean
  atencoes: Atencao[]
  blocos: {
    cliente: { empresa: string; cnpj: string | null; segmento: string | null; classificacao: string | null; responsavel_comercial: string | null; responsavel_tecnico: string | null; solicitante: { nome: string; email: string | null } | null; ref: Ref }
    contrato: { tem_contrato: boolean; nome: string | null; tipo: string | null; situacao: string | null; data_vencimento: string | null; banco_horas: { contratadas: number; consumidas: number; saldo: number }; ref: Ref | null; financeiro?: { valor_hora: number | null; valor_projeto: number | null } }
    projetos: { projeto_do_chamado: { id: number; nome: string; status: string; evolucao_pct: number | null } | null; ativos: { id: number; nome: string; status: string; horas_consumidas: number; horas_contratadas: number; evolucao_pct: number | null; ref: Ref }[]; total: number }
    help_desk: { abertos: number; criticos: number; vencidos: number; tempo_medio_horas: number | null; ultimos: { id: number; numero: string | null; assunto: string; prioridade: string; status: { label: string; cor: string | null } | null; ref: Ref }[]; ref: Ref }
    comercial: { situacao_relacionamento: string | null; oportunidades_abertas: { id: number; titulo: string; etapa: string | null; financeiro?: { valor: number } }[]; oportunidades_total: number; ultima_proposta: { codigo: string | null; status: string | null; data: string | null; financeiro?: { valor: number } } | null; ultimo_contato_comercial: string | null }
    operacao: { ultimos_apontamentos: { data: string | null; consultor: string | null; projeto: string | null; horas: number }[]; consultores_envolvidos: string[]; total_horas: number }
  }
}

const fmtH = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const CLASSIF: Record<string, { label: string; color: string; bg: string }> = {
  cliente:     { label: 'Cliente',      color: 'var(--success-border)', bg: 'var(--success-bg)' },
  prospect:    { label: 'Prospect',     color: 'var(--info-border)',    bg: 'var(--info-bg)' },
  lead:        { label: 'Lead',         color: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  em_renovacao:{ label: 'Em renovação', color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  inativo:     { label: 'Inativo',      color: 'var(--danger-border)',  bg: 'var(--danger-bg)' },
}
const SEV: Record<string, { dot: string; color: string }> = {
  danger:  { dot: '🔴', color: 'var(--danger-border)' },
  warning: { dot: '🟡', color: 'var(--warning-border)' },
  info:    { dot: '🔵', color: 'var(--info-border)' },
  ok:      { dot: '🟢', color: 'var(--success-border)' },
}

/** Bloco colapsável com preferência memorizada por usuário (localStorage). */
function Block({ id, icon, title, action, defaultOpen = true, children }: { id: string; icon: React.ReactNode; title: string; action?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean>(() => { try { const v = localStorage.getItem(`hd360_${id}`); return v === null ? defaultOpen : v === '1' } catch { return defaultOpen } })
  const toggle = () => setOpen(o => {
    const n = !o
    try { localStorage.setItem(`hd360_${id}`, n ? '1' : '0') } catch { /* */ }
    recordUsage('customer_360', 'block_toggled', { metadata: { block: id, open: n } }) // quais blocos são realmente usados
    return n
  })
  return (
    <div className="ds-card p-3 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <button className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }} onClick={toggle}>
          <ChevronDown size={13} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .12s', color: 'var(--text-light)' }} />{icon}{title}
        </button>
        {open && action}
      </div>
      {open && <div className="space-y-1.5 text-sm flex-1 mt-1">{children}</div>}
    </div>
  )
}
function Line({ k, v, danger }: { k: string; v: React.ReactNode; danger?: boolean }) {
  return <div className="flex items-center justify-between gap-2"><span style={{ color: 'var(--text-light)' }}>{k}</span><span className="text-right truncate" style={{ color: danger ? 'var(--danger-border)' : 'var(--text)' }}>{v}</span></div>
}

/** Painel Customer 360: vinculado a um chamado (ticketId) OU ao cliente direto (customerId, torre de operações). */
export function Customer360Panel({ ticketId, customerId, onRunPlaybook }: { ticketId?: number; customerId?: number; onRunPlaybook?: (playbookId: number) => void }) {
  const router = useRouter()
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const url = ticketId != null ? `/help-desk/tickets/${ticketId}/context` : `/help-desk/customers/${customerId}/context`
  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Ctx | null }>(url)
      .then(r => { if (r?.data) setCtx(r.data); else setEmpty(true) })
      .catch(() => setEmpty(true)).finally(() => setLoading(false))
  }, [url])
  useEffect(() => { load() }, [load])

  // Telemetria: abertura do Customer 360 + tempo dentro do painel (viewed → closed na saída).
  const openedAt = useRef<number>(0)
  useEffect(() => {
    const ent = ticketId != null ? { entityType: 'helpdesk_ticket', entityId: ticketId, source: 'ticket' } : { entityType: 'customer', entityId: customerId, source: 'customer' }
    openedAt.current = Date.now()
    recordUsage('customer_360', 'viewed', { entityType: ent.entityType, entityId: ent.entityId, metadata: { source: ent.source } })
    return () => { recordUsage('customer_360', 'closed', { entityType: ent.entityType, entityId: ent.entityId, metadata: { duration_ms: Date.now() - openedAt.current } }) }
  }, [ticketId, customerId])

  if (loading) return <div className="ds-card p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Carregando contexto do cliente…</div>
  if (empty || !ctx) return null
  const b = ctx.blocos
  const bh = b.contrato.banco_horas
  const saldoPct = bh.contratadas > 0 ? Math.max(0, Math.min(100, Math.round(bh.consumidas / bh.contratadas * 100))) : 0
  const classif = b.cliente.classificacao ? (CLASSIF[b.cliente.classificacao] ?? null) : null

  return (
    <div className="space-y-2">
      {/* Atenções — sempre o primeiro bloco. Diagnósticos (não dados). */}
      <div className="ds-card p-3 space-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}><AlertTriangle size={13} /> Atenções</span>
        {ctx.atencoes.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-sm" style={{ color: SEV[a.severity]?.color ?? 'var(--text)' }}>{SEV[a.severity]?.dot} {a.message}</span>
            {a.suggested_playbook && onRunPlaybook && (
              <button className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2 py-0.5 shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                onClick={() => onRunPlaybook(a.suggested_playbook!.id)}><Zap size={11} /> {a.suggested_playbook.name}</button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        <Block id="cliente" icon={<Building2 size={13} />} title="Cliente">
          <div className="flex items-center justify-between">
            <span className="font-semibold" style={{ color: 'var(--text)' }}>{b.cliente.empresa}</span>
            {classif && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ color: classif.color, background: classif.bg }}>{classif.label}</span>}
          </div>
          <Line k="Solicitante" v={b.cliente.solicitante?.nome ?? '—'} />
          <Line k="Resp. comercial" v={b.cliente.responsavel_comercial ?? '—'} />
          <Line k="Resp. técnico" v={b.cliente.responsavel_tecnico ?? '—'} />
          {b.cliente.segmento && <Line k="Segmento" v={b.cliente.segmento} />}
        </Block>

        <Block id="contrato" icon={<FileText size={13} />} title="Contrato">
          {b.contrato.tem_contrato ? <>
            <Line k="Contrato" v={b.contrato.nome} />
            <Line k="Tipo" v={b.contrato.tipo ?? '—'} />
            <Line k="Vencimento" v={fmtDate(b.contrato.data_vencimento)} />
            {b.contrato.financeiro?.valor_hora ? <Line k="Valor/hora" v={fmtBRL(b.contrato.financeiro.valor_hora)} /> : null}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-light)' }}><span>Banco de horas</span><span>{fmtH(bh.consumidas)} / {fmtH(bh.contratadas)}</span></div>
              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                <div className="h-full rounded-full" style={{ width: `${saldoPct}%`, background: saldoPct >= 100 ? 'var(--danger-border)' : saldoPct >= 80 ? 'var(--warning-border)' : 'var(--success-border)' }} />
              </div>
              <Line k="Saldo" v={fmtH(bh.saldo)} danger={bh.saldo < 0} />
            </div>
          </> : <span style={{ color: 'var(--text-muted)' }}>Sem contrato vinculado.</span>}
        </Block>

        <Block id="projetos" icon={<FolderKanban size={13} />} title={`Projetos (${b.projetos.ativos.length} ativos)`}>
          {b.projetos.projeto_do_chamado && <div className="rounded-md px-2 py-1 mb-1" style={{ background: 'var(--primary-soft)' }}>
            <div className="text-[10px]" style={{ color: 'var(--primary)' }}>Projeto do chamado</div>
            <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>{b.projetos.projeto_do_chamado.nome}{b.projetos.projeto_do_chamado.evolucao_pct != null ? ` · ${b.projetos.projeto_do_chamado.evolucao_pct}%` : ''}</div>
          </div>}
          {b.projetos.ativos.slice(0, 4).map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate" style={{ color: 'var(--text)' }}>{p.nome}</span>
              <span className="text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{p.evolucao_pct != null ? `${p.evolucao_pct}%` : fmtH(p.horas_consumidas)}</span>
            </div>
          ))}
          {b.projetos.ativos.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Nenhum projeto ativo.</span>}
        </Block>

        <Block id="help_desk" icon={<Ticket size={13} />} title="Histórico de chamados"
          action={<button className="text-[11px] ds-link" style={{ color: 'var(--primary)' }} onClick={() => router.push(`/help-desk/tickets?customer_id=${b.help_desk.ref.id}`)}>ver todos</button>}>
          <div className="grid grid-cols-3 gap-1 text-center mb-1">
            {[['Abertos', b.help_desk.abertos, 'var(--text)'], ['Críticos', b.help_desk.criticos, 'var(--warning-border)'], ['Vencidos', b.help_desk.vencidos, 'var(--danger-border)']].map(([l, n, c]) => (
              <div key={l as string} className="rounded-md py-1" style={{ background: 'var(--surface-sunken)' }}>
                <div className="text-base font-semibold" style={{ color: c as string }}>{n as number}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{l as string}</div>
              </div>
            ))}
          </div>
          <Line k="Tempo médio" v={b.help_desk.tempo_medio_horas != null ? fmtH(b.help_desk.tempo_medio_horas) : '—'} />
          {b.help_desk.ultimos.slice(0, 3).map(t => (
            <button key={t.id} onClick={() => router.push(`/help-desk/tickets/${t.id}`)} className="flex items-center justify-between gap-2 w-full text-left ds-row-hover rounded px-1">
              <span className="truncate" style={{ color: 'var(--text)' }}>{t.assunto}</span>
              {t.status && <span className="text-[10px] shrink-0" style={{ color: t.status.cor ?? 'var(--text-muted)' }}>{t.status.label}</span>}
            </button>
          ))}
        </Block>

        <Block id="comercial" icon={<TrendingUp size={13} />} title="Comercial" defaultOpen={false}>
          <Line k="Relacionamento" v={classif?.label ?? b.comercial.situacao_relacionamento ?? '—'} />
          <Line k="Oportunidades" v={`${b.comercial.oportunidades_abertas.length} aberta(s) / ${b.comercial.oportunidades_total}`} />
          {b.comercial.oportunidades_abertas.slice(0, 2).map(o => (
            <div key={o.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-xs" style={{ color: 'var(--text)' }}>{o.titulo}</span>
              {o.financeiro?.valor != null && <span className="text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{fmtBRL(o.financeiro.valor)}</span>}
            </div>
          ))}
          {b.comercial.ultima_proposta && <Line k="Última proposta" v={`${b.comercial.ultima_proposta.codigo ?? '—'} (${b.comercial.ultima_proposta.status ?? '—'})`} />}
          <Line k="Último contato" v={fmtDate(b.comercial.ultimo_contato_comercial)} />
        </Block>

        <Block id="operacao" icon={<Clock size={13} />} title="Operação" defaultOpen={false}>
          <Line k="Horas totais" v={fmtH(b.operacao.total_horas)} />
          <Line k="Consultores" v={b.operacao.consultores_envolvidos.length} />
          {b.operacao.ultimos_apontamentos.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>{a.consultor ?? '—'}</span>
              <span className="shrink-0" style={{ color: 'var(--text-light)' }}>{fmtDate(a.data)} · {fmtH(a.horas)}</span>
            </div>
          ))}
          {b.operacao.ultimos_apontamentos.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Sem apontamentos.</span>}
        </Block>
      </div>
    </div>
  )
}
