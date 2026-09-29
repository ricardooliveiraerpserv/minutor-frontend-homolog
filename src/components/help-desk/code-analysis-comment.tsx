'use client'

// Comentário de CodeAnalysis no chamado: resumo (nota/score) SEMPRE visível + botão
// "expandir" que abre as críticas/recomendações como cards (mesmo visual da aba Qualidade
// da Central de Fontes). Os dados vêm embutidos no corpo do comentário (base64 JSON) —
// ver GmudSourceQualityJob::resultBody no backend.

import { useState } from 'react'
import { Badge, Button } from '@/components/ds'

export interface CaFinding {
  severity: string
  category?: string
  rule?: string
  title?: string
  description?: string
  line?: number | null
  start_line?: number | null
  snippet?: string
  count?: number
  recommendation?: string
}
export interface CaData {
  file?: string
  grade?: string | null
  score?: number | null
  findings: CaFinding[]
}

function sevVariant(sev: string): 'danger' | 'warning' | 'default' {
  const s = (sev || '').toUpperCase()
  if (s === 'BLOCKER' || s === 'CRITICAL') return 'danger'
  if (s === 'MAJOR') return 'warning'
  return 'default'
}
function sevLabel(sev: string): string {
  const s = (sev || '').toUpperCase()
  if (s === 'BLOCKER' || s === 'CRITICAL') return 'Crítico'
  if (s === 'MAJOR') return 'Alerta'
  if (s === 'MINOR') return 'Recomendação'
  return s || '—'
}
export function gradeColor(grade?: string | null): string {
  const g = (grade || '').toUpperCase()
  if (g === 'A' || g === 'B') return 'var(--success, #059669)'
  if (g === 'C') return 'var(--warning, #d97706)'
  return 'var(--danger, #dc2626)'
}

// Cards dos achados (críticas/recomendações) — reutilizado no comentário e no painel GMUD.
export function FindingCards({ findings }: { findings: CaFinding[] }) {
  return (
    <div className="space-y-2 mt-2">
      {findings.map((f, i) => {
        const line = f.line ?? f.start_line ?? null
        return (
          <div key={i} className="rounded-xl p-3" style={{ background: 'var(--bg, var(--surface))', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={sevVariant(f.severity)}>{sevLabel(f.severity)}</Badge>
              {f.category && <span className="text-xs" style={{ color: 'var(--text-light)' }}>{f.category}</span>}
              {f.rule && <span className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{f.rule}</span>}
              {f.count && f.count > 1 ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>×{f.count}</span> : null}
            </div>
            <div className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>{f.title || f.rule || 'Achado'}</div>
            {f.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.description}</p>}
            {line != null && (
              <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-light)' }}>
                <span>Linha {line}</span>
              </div>
            )}
            {f.snippet && (
              <pre className="text-xs mt-2 p-2 rounded-lg overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{f.snippet}</pre>
            )}
            {f.recommendation && <p className="text-xs mt-1.5" style={{ color: 'var(--text-light)' }}><b>Sugestão:</b> {f.recommendation}</p>}
          </div>
        )
      })}
    </div>
  )
}

// base64 (UTF-8) embutido no corpo -> CaData. Retorna null se não houver/for inválido.
export function parseCaComment(body: string | null | undefined): CaData | null {
  if (!body) return null
  const m = /<pre[^>]*class="ca-json"[^>]*>([\s\S]*?)<\/pre>/i.exec(body)
  if (!m) return null
  try {
    const b64 = m[1].replace(/\s+/g, '')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const json = new TextDecoder('utf-8').decode(bytes)
    const data = JSON.parse(json)
    if (!data || !Array.isArray(data.findings)) return null
    return data as CaData
  } catch {
    return null
  }
}

export function CodeAnalysisComment({ data }: { data: CaData }) {
  const [open, setOpen] = useState(false)
  const findings = data.findings || []
  const n = findings.length

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Resumo */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>📊 CodeAnalysis</span>
        {data.file && <span className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{data.file}</span>}
      </div>
      <div className="flex items-center gap-2 mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        <span>Nota:</span>
        <span style={{ color: gradeColor(data.grade), fontWeight: 700, fontSize: 16 }}>{data.grade || '—'}</span>
        {data.score != null && <span>· <b>{data.score}</b>/100</span>}
        <span>· {n} achado(s)</span>
      </div>

      {n > 0 ? (
        <>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
              {open ? 'Ocultar críticas e recomendações' : `Ver críticas e recomendações (${n})`}
            </Button>
          </div>

          {open && (
            <div className="space-y-2 mt-2">
              {findings.map((f, i) => {
                const line = f.line ?? f.start_line ?? null
                return (
                  <div key={i} className="rounded-xl p-3" style={{ background: 'var(--bg, var(--surface))', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={sevVariant(f.severity)}>{sevLabel(f.severity)}</Badge>
                      {f.category && <span className="text-xs" style={{ color: 'var(--text-light)' }}>{f.category}</span>}
                      {f.rule && <span className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{f.rule}</span>}
                      {f.count && f.count > 1 ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>×{f.count}</span> : null}
                    </div>
                    <div className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>{f.title || f.rule || 'Achado'}</div>
                    {f.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.description}</p>}
                    {line != null && (
                      <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-light)' }}>
                        <span>Linha {line}</span>
                      </div>
                    )}
                    {f.snippet && (
                      <pre className="text-xs mt-2 p-2 rounded-lg overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{f.snippet}</pre>
                    )}
                    {f.recommendation && <p className="text-xs mt-1.5" style={{ color: 'var(--text-light)' }}><b>Sugestão:</b> {f.recommendation}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm mt-1" style={{ color: 'var(--success, #059669)' }}>Nenhuma correção sugerida. ✅</p>
      )}

      <p className="mt-2" style={{ fontSize: 11, color: 'var(--text-light)' }}>Legenda: A/B verde · C amarelo · D/E/F vermelho</p>
    </div>
  )
}
