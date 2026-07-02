'use client'

/**
 * Status — camada inteligente do Minutor.
 *
 * Vai além de "cor + label": cada status carrega metadados que influenciam UI,
 * ações permitidas e recomendações automáticas.
 *
 *   const meta = getStatusMeta(project.status)
 *
 *   <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
 *   {meta.recommendation && <StatusRecommendation status={project.status} />}
 *   {isActionAllowed(project.status, 'pause') && <Button onClick={pause}>Pausar</Button>}
 *
 * Backward compat:
 *   - getStatusVariant(s) === getStatusMeta(s).variant
 */

import * as React from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'

export interface StatusMeta {
  /** Texto exibido (i18n PT-BR). */
  label: string
  /** Cor semântica (mapeia pros tokens --success/-bg/-border, etc). */
  variant: StatusVariant
  /** 0 = irrelevante, 10 = crítico. Útil pra ordenar listas por urgência. */
  priority: number
  /** Nível de risco operacional. Ajuda a destacar visualmente "o que precisa de atenção". */
  riskLevel?: 'low' | 'medium' | 'high'
  /** Sugestão de próxima ação em linguagem humana — exibida no hover ou abaixo do badge. */
  recommendation?: string
  /** Lista de chaves de ação permitidas nesse estado. Usar com isActionAllowed(). */
  allowedActions?: string[]
}

// ─── Registry ────────────────────────────────────────────────────────────────

const FALLBACK: StatusMeta = { label: '—', variant: 'neutral', priority: 0 }

export const STATUS_META: Record<string, StatusMeta> = {
  // ── Lifecycle de projetos ─────────────────────────────────────────────
  awaiting_start: {
    label: 'Aguardando Início',
    variant: 'info',
    priority: 2,
    recommendation: 'Confirmar pré-requisitos e liberar início',
    allowedActions: ['start', 'cancel'],
  },
  started: {
    label: 'Em Andamento',
    variant: 'primary',
    priority: 5,
    recommendation: 'Acompanhar saldo de horas e prazos',
    allowedActions: ['pause', 'finish', 'cancel'],
  },
  started_with_open_period: {
    label: 'Mês Aberto',
    variant: 'warning',
    priority: 7,
    riskLevel: 'medium',
    recommendation: 'Fechar período antes de novos apontamentos',
    allowedActions: ['close_period', 'pause'],
  },
  paused: {
    label: 'Pausado',
    variant: 'warning',
    priority: 4,
    riskLevel: 'medium',
    recommendation: 'Retomar ou alinhar com cliente sobre bloqueio',
    allowedActions: ['resume', 'cancel'],
  },
  finished: {
    label: 'Encerrado',
    variant: 'neutral',
    priority: 1,
    allowedActions: ['archive'],
  },
  cancelled: {
    label: 'Cancelado',
    variant: 'danger',
    priority: 0,
    allowedActions: ['archive'],
  },
  liberado_para_testes: {
    label: 'Em Testes',
    variant: 'warning',
    priority: 6,
    recommendation: 'Validar entrega com QA e cliente',
    allowedActions: ['finish', 'rollback'],
  },

  // ── Approval workflow (timesheets / expenses) ─────────────────────────
  pending: {
    label: 'Pendente',
    variant: 'warning',
    priority: 3,
    recommendation: 'Aguardando aprovação',
    allowedActions: ['approve', 'reject', 'request_adjustment'],
  },
  approved: {
    label: 'Aprovado',
    variant: 'success',
    priority: 1,
    allowedActions: ['reverse_approval'],
  },
  rejected: {
    label: 'Rejeitado',
    variant: 'danger',
    priority: 2,
    riskLevel: 'medium',
    recommendation: 'Verificar motivo e reenviar',
    allowedActions: ['edit', 'resubmit'],
  },
  adjustment_requested: {
    label: 'Ajuste Solicitado',
    variant: 'warning',
    priority: 4,
    riskLevel: 'low',
    recommendation: 'Ajustar conforme observação e reenviar',
    allowedActions: ['edit', 'resubmit'],
  },
  conflicted: {
    label: 'Conflito',
    variant: 'danger',
    priority: 7,
    riskLevel: 'high',
    recommendation: 'Resolver sobreposição de apontamentos',
    allowedActions: ['view', 'edit'],
  },
  released: {
    label: 'Liberado',
    variant: 'info',
    priority: 2,
    allowedActions: ['reverse_release'],
  },

  // ── Contract kanban ──────────────────────────────────────────────────
  novo_contrato: {
    label: 'Novo Contrato',
    variant: 'info',
    priority: 2,
    recommendation: 'Triagem inicial — validar escopo e cliente',
    allowedActions: ['move_to_ready', 'edit'],
  },
  pronto: {
    label: 'Pronto para Iniciar',
    variant: 'success',
    priority: 3,
    recommendation: 'Gerar projeto e alocar equipe',
    allowedActions: ['create_project', 'edit'],
  },
  projeto_ativo: {
    label: 'Projeto Ativo',
    variant: 'primary',
    priority: 5,
  },
  sustentacao: {
    label: 'Sustentação',
    variant: 'warning',
    priority: 4,
  },
  bizify: {
    label: 'Bizify',
    variant: 'info',
    priority: 3,
  },
  inicio_autorizado: {
    label: 'Início Autorizado',
    variant: 'success',
    priority: 4,
  },
  alocado: {
    label: 'Alocado',
    variant: 'info',
    priority: 3,
  },
  encerrado: {
    label: 'Encerrado',
    variant: 'neutral',
    priority: 1,
  },

  // ── Health (saúde de projeto) ─────────────────────────────────────────
  ok: {
    label: 'Saudável',
    variant: 'success',
    priority: 1,
    riskLevel: 'low',
  },
  warning: {
    label: 'Atenção',
    variant: 'warning',
    priority: 3,
    riskLevel: 'medium',
    recommendation: 'Monitorar consumo de horas',
    allowedActions: ['review_plan'],
  },
  critical: {
    label: 'Crítico',
    variant: 'danger',
    priority: 5,
    riskLevel: 'high',
    recommendation: 'Revisar cronograma e alocação imediatamente',
    allowedActions: ['replan', 'request_extension', 'escalate'],
  },
  closed: {
    label: 'Fechado',
    variant: 'neutral',
    priority: 0,
  },
  unknown: {
    label: 'Indefinido',
    variant: 'neutral',
    priority: 0,
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return FALLBACK
  return STATUS_META[status] ?? { ...FALLBACK, label: status }
}

/** Backward-compat: usado nos badges atuais. Retorna apenas a variant. */
export function getStatusVariant(status: string | null | undefined): StatusVariant {
  return getStatusMeta(status).variant
}

/** Checa se uma ação pode ser executada no status atual. */
export function isActionAllowed(status: string | null | undefined, action: string): boolean {
  return getStatusMeta(status).allowedActions?.includes(action) ?? false
}

/** Ordena array por priority desc (mais urgente primeiro). */
export function sortByStatusPriority<T extends { status?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => getStatusMeta(b.status).priority - getStatusMeta(a.status).priority)
}

// ─── StatusBadge component ───────────────────────────────────────────────────

const STYLES: Record<StatusVariant, { bg: string; border: string; fg: string }> = {
  success: { bg: 'var(--success-bg)', border: 'var(--success-border)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-bg)', border: 'var(--warning-border)', fg: 'var(--warning)' },
  danger:  { bg: 'var(--danger-bg)',  border: 'var(--danger-border)',  fg: 'var(--danger)'  },
  info:    { bg: 'var(--info-bg)',    border: 'var(--info-border)',    fg: 'var(--info)'    },
  neutral: { bg: 'var(--surface-hover)', border: 'var(--border)',       fg: 'var(--text-muted)' },
  primary: { bg: 'var(--info-bg)',       border: 'var(--info-border)',   fg: 'var(--info)' },
}

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusVariant
  size?: 'sm' | 'md'
  borderless?: boolean
}

export function StatusBadge({ variant = 'neutral', size = 'sm', borderless, className = '', style, children, ...props }: StatusBadgeProps) {
  const s = STYLES[variant]
  const fontClass = size === 'md' ? 'text-[12px]' : 'text-[11px]'
  return (
    <span
      data-slot="status-badge"
      data-variant={variant}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${fontClass} ${className}`}
      style={{ background: s.bg, color: s.fg, border: borderless ? 'none' : `1px solid ${s.border}`, ...style }}
      {...props}
    >
      {children}
    </span>
  )
}

// ─── StatusRecommendation ───────────────────────────────────────────────────

/**
 * Renderiza a recomendação textual do status (se houver).
 * Use abaixo do badge para sugerir a próxima ação ao usuário.
 */
export function StatusRecommendation({
  status, className = '', prefix = '↪',
}: {
  status: string | null | undefined
  className?: string
  prefix?: string
}) {
  const meta = getStatusMeta(status)
  if (!meta.recommendation) return null
  return (
    <div
      className={`text-[11px] inline-flex items-start gap-1 ${className}`}
      style={{ color: 'var(--text-muted)' }}
    >
      <span aria-hidden style={{ color: 'var(--text-light)' }}>{prefix}</span>
      <span>{meta.recommendation}</span>
    </div>
  )
}

// ─── StatusActions (render prop) ─────────────────────────────────────────────

/**
 * Renderiza ações permitidas pelo status. O caller fornece `render(action)`
 * pra controlar o visual de cada botão. Para fallback, passe `onAction`.
 */
export function StatusActions({
  status, onAction, render,
}: {
  status: string | null | undefined
  onAction?: (action: string) => void
  render?: (action: string) => React.ReactNode
}) {
  const meta = getStatusMeta(status)
  if (!meta.allowedActions?.length) return null
  return (
    <div className="flex items-center gap-1">
      {meta.allowedActions.map(a => (
        render
          ? <React.Fragment key={a}>{render(a)}</React.Fragment>
          : <button key={a} type="button" onClick={() => onAction?.(a)} className="ds-btn-secondary text-[12px]">
              {a}
            </button>
      ))}
    </div>
  )
}
