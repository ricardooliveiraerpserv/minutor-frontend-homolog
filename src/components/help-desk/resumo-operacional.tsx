'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Zap } from 'lucide-react'

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
    contrato: { tipo?: string | null; nome?: string | null; banco_horas: { contratadas: number; consumidas: number; saldo: number }; financeiro?: { valor_hora: number | null } }
  }
}

const SEV: Record<string, { dot: string; color: string }> = {
  danger: { dot: '🔴', color: 'var(--danger-border)' }, warning: { dot: '🟡', color: 'var(--warning-border)' },
  info: { dot: '🔵', color: 'var(--info-border)' }, ok: { dot: '🟢', color: 'var(--success-border)' },
}
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

export function ResumoOperacional({ ticketId, sla, assigneeName, requesterName, apontadoHoras, onRunPlaybook }: { ticketId: number; sla?: Sla | null; assigneeName?: string | null; requesterName?: string | null; apontadoHoras?: number; onRunPlaybook?: (playbookId: number) => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const load = useCallback(() => {
    api.get<{ data: Ctx | null }>(`/help-desk/tickets/${ticketId}/context`)
      .then(r => { if (r?.data) setCtx(r.data) }).catch(() => {})
  }, [ticketId])
  useEffect(() => { load() }, [load])

  const s = slaResumo(sla)

  // Chamado interno (sem cliente/contrato): mantém a barra com o essencial (SLA, consultor,
  // solicitante, horas); só as células de cliente/banco de horas e o botão de contexto ficam ocultos.
  const bh = ctx?.blocos.contrato.banco_horas
  const usado = bh && bh.contratadas > 0 ? Math.max(0, Math.min(100, Math.round(bh.consumidas / bh.contratadas * 100))) : 0
  // SLA já tem célula própria — não repetir como "atenção" (evita SLA duas vezes).
  const isSlaAtencao = (a: Atencao) => /sla/i.test(a.code) || /sla/i.test(a.message)
  const atencao = (ctx?.atencoes ?? []).find(a => a.severity !== 'ok' && !isSlaAtencao(a)) ?? null

  // Rótulo padrão (uniforme em todas as células).
  const lbl = 'text-[10px] uppercase tracking-wide font-semibold'
  const val = 'text-sm font-semibold leading-tight'
  const cell = 'pl-5 ml-1 border-l'   // divisória vertical entre as células
  const border = { borderColor: 'var(--border)' }

  return (
    <div className="ds-card px-4 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-stretch gap-y-2 flex-wrap">
          {/* Cliente — âncora do atendimento */}
          <div className="min-w-[150px] pr-2">
            <div className={lbl} style={{ color: 'var(--primary)' }}>Cliente</div>
            <div className="font-bold text-xl leading-tight truncate max-w-[220px]" style={{ color: 'var(--text)' }}>{ctx?.blocos.cliente.empresa ?? '—'}</div>
          </div>

          {/* Consultor */}
          <div className={`min-w-[140px] ${cell}`} style={border}>
            <div className={lbl} style={{ color: 'var(--text-light)' }}>Consultor</div>
            <div className={`${val} truncate max-w-[170px]`} style={{ color: assigneeName ? 'var(--text)' : 'var(--text-light)' }}>{assigneeName || 'Não atribuído'}</div>
          </div>

          {/* Solicitante */}
          <div className={`min-w-[140px] ${cell}`} style={border}>
            <div className={lbl} style={{ color: 'var(--text-light)' }}>Solicitante</div>
            <div className={`${val} truncate max-w-[170px]`} style={{ color: 'var(--text)' }}>{requesterName || '—'}</div>
          </div>

          {/* SLA — status + limite ou retomada */}
          <div className={`min-w-[150px] ${cell}`} style={border}>
            <div className={lbl} style={{ color: 'var(--text-light)' }}>SLA</div>
            <div className={val} style={{ color: sla?.paused ? 'var(--warning-border)' : s.color }}>{sla?.paused ? 'SLA pausado' : s.txt}</div>
            {sla?.scheduled && sla?.scheduled_until ? (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--warning-border)' }}>⏸️ retoma {sla.scheduled_all_day ? fmtDateOnly(sla.scheduled_until) : fmtDateTime(sla.scheduled_until)}</div>
            ) : sla?.resolution_due_at ? (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>limite {fmtDateTime(sla.resolution_due_at)}</div>
            ) : null}
          </div>

          {/* Horas apontadas */}
          <div className={`min-w-[110px] ${cell}`} style={border}>
            <div className={lbl} style={{ color: 'var(--text-light)' }}>Horas apontadas</div>
            <div className={val} style={{ color: 'var(--text)' }}>{(apontadoHoras ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h</div>
          </div>

          {/* Contrato — tipo (On Demand / Mensal / Banco de horas fixo…) + saldo + barra de horas */}
          {ctx?.blocos.contrato.tipo && (
            <div className={`min-w-[170px] max-w-[220px] ${cell}`} style={border}>
              <div className={lbl} style={{ color: 'var(--text-light)' }}>Contrato</div>
              <div className={`${val} truncate`} style={{ color: 'var(--text)' }}>{ctx.blocos.contrato.tipo}</div>
              {bh && (
                <>
                  <div className="flex items-center justify-between gap-2 text-[11px] mt-0.5">
                    <span style={{ color: 'var(--text-light)' }}>Saldo</span>
                    <span className="font-semibold" style={{ color: bh.saldo < 0 ? 'var(--danger-border)' : 'var(--text)' }}>{fmtH(bh.saldo)}</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-sunken)' }} title={`${bh.consumidas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}h de ${bh.contratadas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}h`}>
                    <div className="h-full rounded-full" style={{ width: `${usado}%`, background: usado >= 100 ? 'var(--danger-border)' : usado >= 80 ? 'var(--warning-border)' : 'var(--success-border)' }} />
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Atenção (diagnóstico não-SLA) numa faixa própria abaixo */}
      {atencao && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={border}>
          <span className="text-sm" style={{ color: SEV[atencao.severity]?.color }}>{SEV[atencao.severity]?.dot} {atencao.message}</span>
          {atencao.suggested_playbook && onRunPlaybook && (
            <button className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2 py-0.5 shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
              onClick={() => onRunPlaybook(atencao.suggested_playbook!.id)}><Zap size={11} /> {atencao.suggested_playbook.name}</button>
          )}
        </div>
      )}
    </div>
  )
}
