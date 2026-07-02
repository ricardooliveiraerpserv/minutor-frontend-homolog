#!/usr/bin/env node
/**
 * ds-guard — governança do Design System v1.0 (tema claro congelado).
 * Falha (exit 1) se encontrar padrões PROIBIDOS no src.
 * Uso: node scripts/ds-guard.mjs [--warn]   (--warn = não falha, só lista)
 * Ver docs/DESIGN_SYSTEM_TEMA_CLARO_v1.md §6.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const SKIP = new Set(['globals.css']) // fonte dos tokens
const WARN_ONLY = process.argv.includes('--warn')

// [rótulo, regex, severidade]
const RULES = [
  ['bg-white puro (use --surface)',            /\bbg-white(?![/\w-])/g,                      'error'],
  ['cyan estrutural (use --primary)',          /\b(bg|text|border)-cyan-\d{2,3}/g,          'error'],
  ['#00F5FF neon (use var(--primary))',        /#00[fF]5[fF][fF]/g,                          'error'],
  ['rgba cyan neon (use --primary-soft)',      /rgba\(\s*0\s*,\s*245\s*,\s*255/g,            'error'],
  ['bg-*-950/900 dark leftover',               /\bbg-(amber|yellow|green|emerald|red|rose|blue|cyan|sky|purple|violet|orange|zinc|slate|indigo)-9(00|50)\b/g, 'error'],
  ['zinc/slate estrutural (use tokens)',       /\b(bg|text|border|divide|ring)-(zinc|slate)-\d{2,3}/g, 'error'],
  ['token antigo --brand-* (use --*)',         /var\(--brand-(bg|panel|surface|text|muted|subtle|border|primary|primary-strong|primary-dim|success|warning|danger)\)/g, 'error'],
  ['text-white (revisar: só sobre cor/ação)',  /\btext-white\b/g,                            'warn'],
  ['hex semântico hardcoded (use --success/--danger/...)', /#(22C55E|EF4444|F59E0B|8B5CF6|0EA5E9)\b/gi, 'warn'],
  ['radius hardcoded (use rounded-lg/md)',     /rounded-\[\d+px\]/g,                         'warn'],
  ['shadow Tailwind (prefira token --shadow-*)', /\bshadow-(2xl|xl|lg|md|sm)\b/g,            'warn'],
  ['box-shadow inline com rgba cru (use var(--shadow-*))', /box-shadow:\s*[^;'"`]*rgba\(/g,  'warn'],
]
// tokens de marca MANTIDOS (não são violação): --brand-logo, --brand-purple, --brand-card-shadow(-md)

function walk(dir) {
  let files = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) files = files.concat(walk(p))
    else if (/\.(tsx?|jsx?)$/.test(e) && !SKIP.has(e)) files.push(p)
  }
  return files
}

const found = { error: [], warn: [] }
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [label, rx, sev] of RULES) {
      rx.lastIndex = 0
      if (rx.test(line)) found[sev].push({ file, line: i + 1, label, code: line.trim().slice(0, 100) })
    }
  })
}

const box = (t) => console.log('\n  ' + t + '\n  ' + '-'.repeat(t.length))
box('DS-GUARD — governança do Design System v1.0')
for (const sev of ['error', 'warn']) {
  const items = found[sev]
  console.log(`\n  ${sev === 'error' ? '❌ ERROS (proibidos)' : '⚠️  AVISOS (revisar manualmente)'}: ${items.length}`)
  const byLabel = {}
  for (const it of items) (byLabel[it.label] ??= []).push(it)
  for (const [label, list] of Object.entries(byLabel)) {
    console.log(`    · ${label} — ${list.length}`)
    for (const it of list.slice(0, 6)) console.log(`        ${it.file}:${it.line}`)
    if (list.length > 6) console.log(`        … +${list.length - 6}`)
  }
}
console.log('')
if (found.error.length && !WARN_ONLY) {
  console.error(`  ✖ ${found.error.length} violações do DS. Corrija ou rode com --warn. Ver docs/DESIGN_SYSTEM_TEMA_CLARO_v1.md §6.\n`)
  process.exit(1)
}
console.log(`  ✓ Sem erros bloqueantes${found.warn.length ? ` (${found.warn.length} avisos)` : ''}.\n`)
