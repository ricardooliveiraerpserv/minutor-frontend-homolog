'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores do Inventário RPO — Índice de Saúde (gauge) + Distribuição por Status
// (donut + legenda) + 7 cards (Total, 5 status, APIs REST). Compartilhado entre a
// Configuração (Inventário) e a Visão Geral. Cada card/status é opcionalmente clicável
// (onPick) para filtrar; sem onPick, é só indicador.
// ─────────────────────────────────────────────────────────────────────────────

import type { RpoInvStatus, RpoInvRow } from '@/lib/prosight/environments'

export type InvFilter = RpoInvStatus | 'all' | 'rest_api'
export interface RpoSummary {
  counts: Record<RpoInvStatus, number>
  total: number
  health_pct: number
  health_label: string
  rest_api_count: number
}

export const INV_COLOR: Record<RpoInvStatus, string> = {
  sincronizado: '#22c55e', recompilar: '#f59e0b', verificar_rpo: '#a855f7', nao_compilado: '#06b6d4', so_rpo: '#ef4444',
}
export const INV_LABEL: Record<RpoInvStatus, string> = {
  sincronizado: 'Sincronizado', recompilar: 'Recompilar', verificar_rpo: 'Verificar RPO', nao_compilado: 'Não compilado', so_rpo: 'Só no RPO',
}
const INV_SUB: Record<RpoInvStatus, string> = {
  sincronizado: 'em dia', recompilar: 'disco mais novo', verificar_rpo: 'RPO mais novo', nao_compilado: 'só no disco', so_rpo: 'sem fonte local',
}
export const INV_ORDER: RpoInvStatus[] = ['sincronizado', 'recompilar', 'verificar_rpo', 'nao_compilado', 'so_rpo']

export function healthColor(pct: number) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444'
}

// Exporta as linhas do inventário para CSV que abre direto no Excel (pt-BR): separador ';' + BOM UTF-8.
const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '')
function csvCell(v: string): string {
  const s = v ?? ''
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function exportRpoCsv(rows: RpoInvRow[], filename: string) {
  const headers = ['Programa', 'Situação', 'Fonte (Git)', 'RPO', 'Status RPO', 'REST']
  const lines = [headers.join(';')]
  for (const r of rows) {
    lines.push([r.program, INV_LABEL[r.status], fmtDay(r.disk_date), fmtDay(r.rpo_date), r.rpo_status ?? '', r.is_rest_api ? 'Sim' : 'Não'].map(csvCell).join(';'))
  }
  const csv = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function HealthGauge({ pct, label, sync, total }: { pct: number; label: string; sync: number; total: number }) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  const col = healthColor(pct)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Índice de saúde</div>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 70 70)" />
        <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill={col}>{pct}%</text>
        <text x="70" y="88" textAnchor="middle" fontSize="12" fill="var(--text-muted)">{label}</text>
      </svg>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{sync} sincronizados de {total} fontes</div>
    </div>
  )
}

function StatusDonut({ counts, total }: { counts: Record<RpoInvStatus, number>; total: number }) {
  const r = 52, sw = 22, c = 2 * Math.PI * r
  const fracs = INV_ORDER.map((k) => ({ k, v: counts[k] || 0, frac: total > 0 ? (counts[k] || 0) / total : 0 }))
  const segs = fracs.map((f, i) => {
    const prev = fracs.slice(0, i).reduce((a, x) => a + x.frac, 0)
    return { k: f.k, v: f.v, dash: f.frac * c, off: c * (1 - prev) }
  }).filter((s) => s.v > 0)
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
      {segs.map((s) => (
        <circle key={s.k} cx="70" cy="70" r={r} fill="none" stroke={INV_COLOR[s.k]} strokeWidth={sw}
          strokeDasharray={`${s.dash} ${c - s.dash}`} strokeDashoffset={s.off} transform="rotate(-90 70 70)" />
      ))}
    </svg>
  )
}

export function RpoDashboardIndicators({ summary, activeFilter, onPick }: {
  summary: RpoSummary
  activeFilter?: InvFilter
  onPick?: (f: InvFilter) => void
}) {
  const s = summary
  const active = activeFilter ?? 'all'
  const clickable = !!onPick
  const kpis: { key: InvFilter; label: string; value: number; sub: string; color: string }[] = [
    { key: 'all', label: 'Total de fontes', value: s.total, sub: 'disco + RPO', color: 'var(--text)' },
    ...INV_ORDER.map((k) => ({ key: k as InvFilter, label: INV_LABEL[k], value: s.counts[k] ?? 0, sub: INV_SUB[k], color: INV_COLOR[k] })),
    { key: 'rest_api' as InvFilter, label: 'APIs REST', value: s.rest_api_count, sub: 'programas', color: '#06b6d4' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl p-4 flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <HealthGauge pct={s.health_pct} label={s.health_label} sync={s.counts.sincronizado} total={s.total} />
        </div>
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <StatusDonut counts={s.counts} total={s.total} />
          <div className="flex flex-col gap-1.5 flex-1">
            {INV_ORDER.map((k) => {
              const v = s.counts[k] ?? 0, pct = s.total ? Math.round((v / s.total) * 1000) / 10 : 0
              return (
                <button key={k} disabled={!clickable} onClick={() => onPick?.(k)} className="flex items-center gap-2 text-sm rounded-md px-2 py-1 text-left"
                  style={{ background: active === k ? 'var(--surface-hover)' : 'transparent', cursor: clickable ? 'pointer' : 'default' }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: INV_COLOR[k] }} />
                  <span className="flex-1" style={{ color: 'var(--text)' }}>{INV_LABEL[k]}</span>
                  <b style={{ color: INV_COLOR[k] }}>{v}</b>
                  <span className="text-xs w-12 text-right" style={{ color: 'var(--text-light)' }}>{pct}%</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {kpis.map((k) => (
          <button key={k.key} disabled={!clickable} onClick={() => onPick?.(k.key === 'all' ? 'all' : k.key)}
            className="rounded-xl p-3 text-left transition"
            style={{ background: 'var(--surface)', border: `1px solid ${active === k.key ? k.color : 'var(--border)'}`, outline: active === k.key ? `1px solid ${k.color}` : 'none', cursor: clickable ? 'pointer' : 'default' }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>{k.label}</div>
            <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{k.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
