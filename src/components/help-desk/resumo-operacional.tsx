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

function slaResumo(sla?: Sla | null): { txt: string; color: string } {
  if (!sla) return { txt: '—', color: 'var(--text-muted)' }
  if (sla.resolution_breached || sla.first_response_breached) return { txt: 'SLA estourado', color: 'var(--danger-border)' }
  if (sla.resolution_overdue || sla.first_response_overdue) return { txt: 'SLA vencido', color: 'var(--danger-border)' }
  if (sla.resolution_minutes_left != null && sla.resolution_minutes_left > 0 && sla.resolution_minutes_left < 120) return { txt: 'SLA vencendo', color: 'var(--warning-border)' }
  return { txt: 'Dentro do prazo', color: 'var(--success-border)' }
}

export function ResumoOperacional({ ticketId, sla, onOpenContext, onRunPlaybook }: { ticketId: number; sla?: Sla | null; onOpenContext: () => void; onRunPlaybook?: (playbookId: number) => void }) {
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
  const atencao = (ctx?.atencoes ?? []).find(a => a.severity !== 'ok') ?? null

  return (
    <div className="ds-card flex items-center gap-x-6 gap-y-2 px-4 py-3 flex-wrap" style={{ minHeight: 120 }}>
      {/* Cliente */}
      <div className="min-w-[140px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Cliente</div>
        <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{ctx?.blocos.cliente.empresa ?? '—'}</div>
      </div>

      {/* Banco de horas */}
      <div className="min-w-[200px] flex-1 max-w-[280px]">
        <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-light)' }}>
          <span>Banco de horas</span>
          {bh && <span style={{ color: bh.saldo < 0 ? 'var(--danger-border)' : 'var(--text)' }}>Saldo: {fmtH(bh.saldo)}</span>}
        </div>
        <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
          <div className="h-full rounded-full" style={{ width: `${usado}%`, background: usado >= 100 ? 'var(--danger-border)' : usado >= 80 ? 'var(--warning-border)' : 'var(--success-border)' }} />
        </div>
      </div>

      {/* SLA */}
      <div className="min-w-[100px]">
        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>SLA</div>
        <div className="text-sm font-medium" style={{ color: s.color }}>{s.txt}</div>
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
