// Helpers compartilhados das telas de Operações Protheus. Cores SEMPRE via tokens DS.
import type {
  ChangeType, FolderLevel, ServiceRow, ServiceStatus, SourceInvStatus,
} from '@/lib/operacoes/types'

// ── Serviços ────────────────────────────────────────────────────────────────
export const SERVICE_TYPE_LABELS: Record<ServiceRow['type'], string> = {
  broker: 'Broker', slave: 'Slave', rest: 'REST', schedule: 'Schedule',
  compiler: 'Compilador', exclusive: 'Exclusivo', extra: 'Extra',
}

export const STATUS_META: Record<ServiceStatus, { label: string; variant: string; dot: string }> = {
  Running: { label: 'Iniciado', variant: 'success', dot: 'var(--success)' },
  Stopped: { label: 'Parado', variant: 'danger', dot: 'var(--danger)' },
  Unknown: { label: 'Desconhecido', variant: 'default', dot: 'var(--text-light)' },
}

/** Serviço "degradado": Running com CPU alta. Fonte única = lib/operacoes/health. */
export { DEGRADED_CPU, isDegraded } from '@/lib/operacoes/health'

// ── Pasta System ────────────────────────────────────────────────────────────
export const FOLDER_LEVEL_META: Record<FolderLevel, { label: string; color: string }> = {
  green: { label: 'Normal', color: 'var(--success)' },
  yellow: { label: 'Atenção', color: 'var(--warning)' },
  red: { label: 'Crítico', color: 'var(--danger)' },
  error: { label: 'Sem acesso', color: 'var(--text-light)' },
}

// ── Inventário de fontes ─────────────────────────────────────────────────────
export const SOURCE_STATUS_META: Record<SourceInvStatus, { label: string; variant: string; color: string }> = {
  sincronizado: { label: 'Sincronizado', variant: 'success', color: 'var(--success)' },
  disco_mais_novo: { label: 'Disco mais novo', variant: 'warning', color: 'var(--warning)' },
  apenas_disco: { label: 'Apenas no disco', variant: 'primary', color: 'var(--info)' },
  apenas_rpo: { label: 'Apenas no RPO', variant: 'danger', color: 'var(--danger)' },
}

export const SOURCE_STATUS_ORDER: SourceInvStatus[] = [
  'sincronizado', 'disco_mais_novo', 'apenas_disco', 'apenas_rpo',
]

// ── Mudanças / Auditoria ─────────────────────────────────────────────────────
export const CHANGE_TYPE_META: Record<ChangeType, { label: string; variant: string }> = {
  compile: { label: 'Compilação', variant: 'primary' },
  'patch-apply': { label: 'Aplicação de Patch', variant: 'purple' },
  'promote-rpo': { label: 'Promoção de RPO', variant: 'success' },
  'rollback-rpo': { label: 'Rollback de RPO', variant: 'warning' },
}

// Ações de auditoria → rótulo humano + variante do badge.
export const AUDIT_ACTION_META: Record<string, { label: string; variant: string }> = {
  compile: { label: 'Compilação', variant: 'primary' },
  'patch-apply': { label: 'Aplicação de Patch', variant: 'purple' },
  'promote-rpo': { label: 'Promoção de RPO', variant: 'success' },
  'rollback-rpo': { label: 'Rollback de RPO', variant: 'warning' },
  'exclusive-activate': { label: 'Ativar Exclusivo', variant: 'danger' },
  'exclusive-deactivate': { label: 'Desativar Exclusivo', variant: 'default' },
  'debug-activate': { label: 'Ativar Debug', variant: 'warning' },
  'debug-deactivate': { label: 'Desativar Debug', variant: 'default' },
  'clean-system': { label: 'Limpeza System', variant: 'primary' },
  'clean-tsk': { label: 'Limpeza TSK', variant: 'primary' },
  'service-start': { label: 'Iniciar Serviço', variant: 'success' },
  'service-stop': { label: 'Parar Serviço', variant: 'danger' },
  'service-restart': { label: 'Reiniciar Serviço', variant: 'warning' },
  'start-all': { label: 'Iniciar Todos', variant: 'success' },
  'stop-all': { label: 'Parar Todos', variant: 'danger' },
}

export function auditActionMeta(action: string): { label: string; variant: string } {
  return AUDIT_ACTION_META[action] ?? { label: action, variant: 'default' }
}

// ── Formatação ───────────────────────────────────────────────────────────────
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtBytes(bytes: number): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function fmtCpu(cpu: number): string {
  return cpu ? `${cpu.toFixed(1)}%` : '—'
}

export function fmtInt(n: number): string {
  return n.toLocaleString('pt-BR')
}

// Paleta de gráficos (donut de extensões) — tokens semânticos do DS, sem hardcode.
export const CHART_PALETTE = [
  'var(--primary)', 'var(--purple)', 'var(--success)', 'var(--warning)',
  'var(--info)', 'var(--danger)', 'var(--text-muted)', 'var(--primary-hover)',
  'var(--text-light)',
]

export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)',
}
