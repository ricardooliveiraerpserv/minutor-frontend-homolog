// Fase 2 — Dashboard de adoção da fundação assíncrona.
// Mede, sem precisar de grep manual: adoção de cada peça, cobertura da fundação e quanto
// LOADING MANUAL ainda resta. Base = arquivos que fazem api.(post|patch|put|delete).
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

const mut = c => /api\.(post|patch|put|delete)\b/.test(c)
const mutationFiles = entries.filter(mut)
const N = mutationFiles.length || 1

const FOUND = [/\buseAsyncAction\b/, /\buseCrudActions\b/, /\buseOptimisticList\b/, /\bAsyncButton\b/]
// Loading MANUAL de mutação ainda presente (exclui setLoading de lista/Fase 1).
const MANUAL = /set(Saving|Deleting|Submitting|Creating)\s*\(|set[A-Z][a-zA-Z]*Saving\s*\(/

const pctOf = re => Math.min(100, Math.round(entries.filter(c => re.test(c)).length / N * 100))
const countFiles = re => entries.filter(c => re.test(c)).length
const bar = pct => { const n = Math.round(pct / 5); return '█'.repeat(n) + '░'.repeat(20 - n) }

// Ações migradas = nº de call-sites de useAsyncAction( + useCrudActions(
const callSites = re => entries.reduce((a, c) => a + (c.match(re)?.length ?? 0), 0)
const acoesMigradas = callSites(/useAsyncAction\(/g) + callSites(/useCrudActions\(/g)

const coberturaAny = pctOf(new RegExp(FOUND.map(r => r.source).join('|')))
const manualFiles = mutationFiles.filter(c => MANUAL.test(c)).length

const row = (label, cur, meta, showBar = true) =>
  `  ${label.padEnd(26)} ${showBar ? bar(typeof cur === 'number' && String(cur).includes('%') === false && cur <= 100 ? cur : 0) : ' '.repeat(20)}  ${String(cur).padStart(6)}   ${String(meta).padStart(5)}`

console.log(`\n  FASE 2 — DASHBOARD  ·  base: ${N} arquivos com mutação\n`)
console.log(`  ${'Indicador'.padEnd(26)} ${'Progresso'.padEnd(20)}  ${'Atual'.padStart(6)}   ${'Meta'.padStart(5)}`)
console.log('  ' + '-'.repeat(64))
console.log(row('Adoção useAsyncAction', pctOf(FOUND[0]) + '%', '20%'))
console.log(row('Adoção useCrudActions', pctOf(FOUND[1]) + '%', '20%'))
console.log(row('Adoção useOptimisticList', pctOf(FOUND[2]) + '%', '—'))
console.log(row('Adoção AsyncButton', pctOf(FOUND[3]) + '%', '—'))
console.log(row('Cobertura da fundação', coberturaAny + '%', '80%'))
console.log('  ' + '-'.repeat(64))
console.log(`  ${'Ações migradas (call-sites)'.padEnd(26)} ${' '.repeat(20)}  ${String(acoesMigradas).padStart(6)}   ${'—'.padStart(5)}`)
console.log(`  ${'Loading MANUAL restante'.padEnd(26)} ${' '.repeat(20)}  ${String(manualFiles).padStart(6)}   ${'0'.padStart(5)}  (arquivos)`)
console.log('\n  Congela a fundação aos 50% · Fase 2 concluída aos 80% de cobertura.\n')
