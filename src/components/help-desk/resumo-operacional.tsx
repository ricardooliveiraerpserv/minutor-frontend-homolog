'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { PanelRightOpen, Zap } from 'lucide-react'

// Resumo Operacional — faixa compacta (~140px) abaixo do cabeçalho do chamado.
// Reposiciona o Customer 360 como CONTEXTO: aqui só o essencial para atender (cliente,
// saldo de banco de horas, SLA, diagnósticos). O contexto completo abre no Drawer.
// Consome o MESMO endpoint do Customer 360 (sem alterá-lo); não grava telemetria de 360
// (o "viewed" só dispara quando o usuário abre o Drawer de fato).

interface Sla {
  first_response_breached: boolean; resolution_breached: boolean
  first_response_overdue: boolean; resolution_overdue: boolean
  resolution_minutes_left: number | null
  resolution_due_at?: string | null; first_response_due_at?: string | null
  paused?: boolean; scheduled?: boolean; scheduled_until?: string | null; scheduled_all_day?: boolean
}
interface Atencao { severity: 'danger' | 'warning' | 'info' | 'ok'; code: string; message: string; suggested_playbook: { id: number; name: string } | null }
interface Ctx {
  financeiro_visivel: boolean
  atencoes: Atencao[]
  blocos: {
    cliente: { empresa: string; classificacao: string | null }
    contrato: { banco_horas: { contratadas: number; consumidas: number; saldo: number }; financeiro?: { valor_hora: number | null } }
  }
}

const SEV: Record<string, { dot: string; color: string }> = {
  danger: { dot: '🔴', color: 'var(--danger-border)' }, warning: { dot: '🟡', color: 'var(--warning-border)' },
  info: { dot: '🔵', color: 'var(--info-border)' }, ok: { dot: '🟢', color: 'var(--success-border)' },
}
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtH = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} h`
const fmtDateTime = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const fmtDateOnly = (s: string) => new Date(s).toLocaleDateString('pt-BR')

function slaResumo(sla?: Sla | null): { txt: string; color: string } {
  if (!sla) return { txt: '—', color: 'var(--text-muted)' }
  if (sla.resolution_breached || sla.first_response_breached) return { txt: 'SLA estourado', color: 'var(--danger-border)' }
  if (sla.resolution_overdue || sla.first_response_overdue) return { txt: 'SLA vencido', color: 'var(--danger-border)' }
  if (sla.resolution_minutes_left != null && sla.resolution_minutes_left > 0 && sla.resolution_minutes_left < 120) return { txt: 'SLA vencendo', color: 'var(--warning-border)' }
  return { txt: 'Dentro do prazo', color: 'var(--success-border)' }
}

export function ResumoOperacional({ ticketId, sla, assigneeName, requesterName, apontadoHoras, onOpenContext, onRunPlaybook }: { ticketId: number; sla?: Sla | null; assigneeName?: string | null; requesterName?: string | null; apontadoHoras?: number; onOpenContext: () => void; onRunPlaybook?: (playbookId: number) => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [empty, setEmpty] = useState(false)
  const load = useCallback(() => {
    api.get<{ data: Ctx | null }>(`/help-desk/tickets/${ticketId}/context`)
      .then(r => { if (r?.data) setCtx(r.data); else setEmpty(true) }).catch(() => setEmpty(true))
  }, [ticketId])
  useEffect(() => { load() }, [load])

  const s = slaResumo(sla)

  // Chamado interno (sem cliente) → resumo mínimo, apenas o botão de contexto fica oculto.
  if (empty) return null

  const bh = ctx?.blocos.contrato.banco_horas
  const usado = bh && bh.contratadas > 0 ? Math.max(0, Math.min(100, Math.round(bh.consumidas / bh.contratadas * 100))) : 0
  const valorHora = ctx?.financeiro_visivel ? ctx?.blocos.contrato.financeiro?.valor_hora : null
  // SLA já tem célula própria — não repetir como "atenção" (evita SLA duas vezes).
  const isSlaAtencao = (a: Atencao) => /sla/i.test(a.code) || /sla/i.test(a.message)
  const atencao = (ctx?.atencoes ?? []).find(a => a.severity !== 'ok' && !isSlaAtencao(a)) ?? null

  return (
    <div className="ds-card flex items-center gap-x-6 gap-y-2 px-4 py-3 flex-wrap" style={{ minHeight: 120 }}>
      {/* Cliente — destaque (é a informação-âncora do atendimento) */}
      <div className="min-w-[150px]">
        <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--primary)' }}>Cliente</div>
        <div className="font-bold text-xl leading-tight truncate max-w-[240px]" style={{ color: 'var(--text)' }}>{ctx?.blocos.cliente.empresa ?? '—'}</div>
      </div>

      {/* Banco de horas — saldo ABAIXO do rótulo (como as demais células) + barra */}
      <div className="min-w-[200px] flex-1 max-w-[280px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Banco de horas</div>
        {bh && <div className="text-sm font-medium" style={{ color: bh.saldo < 0 ? 'var(--danger-border)' : 'var(--text)' }}>Saldo: {fmtH(bh.saldo)}</div>}
        <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
          <div className="h-full rounded-full" style={{ width: `${usado}%`, background: usado >= 100 ? 'var(--danger-border)' : usado >= 80 ? 'var(--warning-border)' : 'var(--success-border)' }} />
        </div>
      </div>

      {/* Consultor alocado */}
      <div className="min-w-[120px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Consultor</div>
        <div className="text-sm font-medium truncate max-w-[160px]" style={{ color: assigneeName ? 'var(--text)' : 'var(--text-light)' }}>{assigneeName || 'Não atribuído'}</div>
      </div>

      {/* Solicitante */}
      <div className="min-w-[120px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Solicitante</div>
        <div className="text-sm font-medium truncate max-w-[160px]" style={{ color: 'var(--text)' }}>{requesterName || '—'}</div>
      </div>

      {/* SLA — status + data limite (ou "retoma em" quando pausado por agendamento) */}
      <div className="min-w-[150px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>SLA</div>
        <div className="text-sm font-medium" style={{ color: sla?.paused ? 'var(--warning-border)' : s.color }}>{sla?.paused ? 'SLA pausado' : s.txt}</div>
        {sla?.scheduled && sla?.scheduled_until ? (
          <div className="text-[11px]" style={{ color: 'var(--warning-border)' }}>⏸️ retoma {sla.scheduled_all_day ? fmtDateOnly(sla.scheduled_until) : fmtDateTime(sla.scheduled_until)}</div>
        ) : sla?.resolution_due_at ? (
          <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>limite {fmtDateTime(sla.resolution_due_at)}</div>
        ) : null}
      </div>

      {/* Horas apontadas no chamado (soma dos apontamentos) */}
      <div className="min-w-[100px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Horas apontadas</div>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{(apontadoHoras ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h</div>
      </div>

      {/* Valor/hora — somente coordenador/admin/administrativo (financeiro_visivel) */}
      {valorHora != null && (
        <div className="min-w-[90px]">
          <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Valor/hora</div>
          <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{fmtBRL(valorHora)}</div>
        </div>
      )}

      {/* Atenção (diagnóstico) + ação 1-clique se houver playbook sugerido */}
      {atencao && (
        <div className="flex items-center gap-1.5 min-w-[180px] flex-1 basis-full lg:basis-auto">
          <span className="text-sm" style={{ color: SEV[atencao.severity]?.color }}>{SEV[atencao.severity]?.dot} {atencao.message}</span>
          {atencao.suggested_playbook && onRunPlaybook && (
            <button className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2 py-0.5 shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
              onClick={() => onRunPlaybook(atencao.suggested_playbook!.id)}><Zap size={11} /> {atencao.suggested_playbook.name}</button>
          )}
        </div>
      )}

      {/* Ver contexto completo → Drawer */}
      <button onClick={onOpenContext} className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ml-auto shrink-0">
        <PanelRightOpen size={15} /> Ver contexto completo
      </button>
    </div>
  )
}
