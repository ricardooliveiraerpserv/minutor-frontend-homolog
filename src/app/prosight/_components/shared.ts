// Helpers compartilhados das telas do Prosight. Cores SEMPRE via tokens do DS.
import type { InventoryStatus, HealthLabel } from '@/lib/prosight/types'

export const STATUS_META: Record<
  InventoryStatus,
  { label: string; variant: string; color: string; sub: string }
> = {
  sincronizado:  { label: 'Sincronizado',  variant: 'success', color: 'var(--success)', sub: 'em dia' },
  recompilar:    { label: 'Recompilar',    variant: 'warning', color: 'var(--warning)', sub: 'disco mais novo' },
  verificar_rpo: { label: 'Verificar RPO', variant: 'purple',  color: 'var(--purple)',  sub: 'RPO mais novo' },
  nao_compilado: { label: 'Não compilado', variant: 'primary', color: 'var(--info)',    sub: 'só no disco' },
  so_rpo:        { label: 'Só no RPO',     variant: 'danger',  color: 'var(--danger)',  sub: 'sem fonte local' },
}

export const STATUS_ORDER: InventoryStatus[] = [
  'sincronizado', 'recompilar', 'verificar_rpo', 'nao_compilado', 'so_rpo',
]

export const HEALTH_META: Record<HealthLabel, { label: string; color: string }> = {
  Critico:  { label: 'Crítico',  color: 'var(--danger)' },
  Alerta:   { label: 'Alerta',   color: 'var(--warning)' },
  Regular:  { label: 'Regular',  color: 'var(--info)' },
  Saudavel: { label: 'Saudável', color: 'var(--success)' },
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

/** Diferença disco − RPO em unidade legível (positivo = disco mais novo). */
export function fmtDiff(diskDate: string | null, rpoDate: string | null): string {
  if (!diskDate || !rpoDate) return '—'
  const diff = Math.round((new Date(diskDate).getTime() - new Date(rpoDate).getTime()) / 1000)
  const abs = Math.abs(diff)
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  if (abs < 60) return `${sign}${Math.abs(Math.round(diff))}s`
  if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`
  if (abs < 86400) return `${sign}${Math.round(abs / 3600)}h`
  return `${sign}${Math.round(abs / 86400)}d`
}

/** 'YYYYMMDD' → 'DD/MM/YYYY' (customs.ultimaExecucao). */
export function fmtYmd(ymd: string): string {
  if (!ymd || ymd.length !== 8) return '—'
  return `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`
}

/** dd/mm/yyyy ↔ yyyy-mm-dd (contrato do licensing usa dd/mm/yyyy nos parâmetros). */
export function inputToPt(yyyy_mm_dd: string): string {
  const [y, m, d] = yyyy_mm_dd.split('-')
  return `${d}/${m}/${y}`
}

export function toInputVal(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Paleta para gráficos multi-série (módulos/atividade) — tokens semânticos do DS.
export const CHART_PALETTE = [
  'var(--primary)',
  'var(--purple)',
  'var(--success)',
  'var(--warning)',
  'var(--info)',
  'var(--danger)',
]

// Estilo de tooltip padrão do Minutor (recharts).
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)',
}
