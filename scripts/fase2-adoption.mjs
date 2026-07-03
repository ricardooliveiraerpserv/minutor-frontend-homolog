// Fase 2 — Adoção da fundação assíncrona.
// Mede quantos arquivos-de-mutação já usam cada peça da fundação (useAsyncAction, useCrudActions,
// AsyncButton, ErrorState, useOptimisticList). Base = arquivos que fazem api.(post|patch|put|delete).
// Uso: npm run fase2:adoption
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = []
;(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e); const s = statSync(p)
    if (s.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p) }
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
})('src')

// Ignora os próprios arquivos de definição da fundação (senão contam como "adoção").
const DEFS = /(use-async-action|use-crud-actions|use-optimistic-list|async-button|error-state)\.tsx?$/
const entries = files.filter(f => !DEFS.test(f)).map(f => { try { return readFileSync(f, 'utf8') } catch { return '' } })

const mutationFiles = entries.filter(c => /api\.(post|patch|put|delete)\b/.test(c)).length || 1

const tools = [
  ['useAsyncAction',   /\buseAsyncAction\b/],
  ['useCrudActions',   /\buseCrudActions\b/],
  ['AsyncButton',      /\bAsyncButton\b/],
  ['ErrorState',       /\bErrorState\b|\bInlineError\b/],
  ['useOptimisticList',/\buseOptimisticList\b/],
]

const bar = pct => { const n = Math.round(pct / 5); return '█'.repeat(n) + '░'.repeat(20 - n) }

console.log(`\n  FASE 2 — ADOÇÃO DA FUNDAÇÃO  ·  base: ${mutationFiles} arquivos com mutação\n`)
for (const [name, re] of tools) {
  const used = entries.filter(c => re.test(c)).length
  const pct = Math.min(100, Math.round((used / mutationFiles) * 100))
  console.log(`  ${name.padEnd(18)} ${bar(pct)} ${String(pct).padStart(3)}%   (${used}/${mutationFiles} arq.)`)
}
console.log('\n  % = arquivos-de-mutação que já usam a peça / total de arquivos-de-mutação.\n')
