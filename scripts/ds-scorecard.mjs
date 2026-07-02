#!/usr/bin/env node
/**
 * ds-scorecard.mjs — Placar de aderência ao Design System do Minutor.
 *
 * SÓ LEITURA. Não altera nada. Varre `src/` e conta padrões que violam a
 * Linguagem Visual (docs/LINGUAGEM_VISUAL.md) e o Design System (docs/DESIGN_SYSTEM.md),
 * imprimindo a tabela Atual → Meta. Use a cada sprint para medir a evolução objetivamente.
 *
 * Uso:  node scripts/ds-scorecard.mjs [dir]      (default: src)
 *       node scripts/ds-scorecard.mjs --top 20   (nº de arquivos no ranking)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const args = process.argv.slice(2)
const topN = (() => { const i = args.indexOf('--top'); return i >= 0 ? Number(args[i + 1]) : 15 })()
const ROOT = args.find(a => !a.startsWith('--') && a !== String(topN)) || 'src'
const EXT = new Set(['.ts', '.tsx', '.css', '.js', '.jsx'])

// Padrões de cor/token hardcoded (violam a paleta por tokens)
const P = {
  hex:        /#[0-9a-fA-F]{3,8}\b/g,             // #fff, #06B6D4 literais
  rgba:       /\brgba?\(/g,                        // rgba(...) / rgb(...) manuais
  zinc:       /\bzinc-\d{2,3}\b/g,                 // bg/text/border-zinc-*
  slate:      /\bslate-\d{2,3}\b/g,               // slate-*
  bgWhiteX:   /\bbg-white\/\d{1,3}\b/g,           // bg-white/5, bg-white/10
  bgBlackX:   /\bbg-black\/\d{1,3}\b/g,           // bg-black/20 (fora de overlay)
  textWhite:  /\btext-white\b/g,                  // text-white sem contexto escuro
  fixedInset: /fixed inset-0/g,                    // proxy de modal/overlay inline
  tokenVar:   /var\(--[a-z0-9-]+\)/g,             // uso correto de token
  dsClass:    /\bds-[a-z-]+/g,                     // uso de classe .ds-*
}

function walk(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.git')) continue
    const full = join(dir, e)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) out.push(...walk(full))
    else if (EXT.has(extname(full))) out.push(full)
  }
  return out
}

const files = walk(ROOT)
const totals = Object.fromEntries(Object.keys(P).map(k => [k, 0]))
const perFileHardcode = [] // {file, count}

// Arquivos que DEFINEM os tokens/tema — hex/rgba ali é legítimo (fonte da verdade).
const TOKEN_SOURCES = /(globals\.css|tailwind\.config\.|theme\.|tokens\.)/
const HARD_KEYS = ['hex', 'rgba', 'zinc', 'slate', 'bgWhiteX', 'bgBlackX', 'textWhite']

for (const f of files) {
  let src
  try { src = readFileSync(f, 'utf8') } catch { continue }
  const isTokenSource = TOKEN_SOURCES.test(f)
  let fileHard = 0
  for (const [k, re] of Object.entries(P)) {
    const n = (src.match(re) || []).length
    // não penaliza cor nos arquivos que definem os próprios tokens
    if (isTokenSource && HARD_KEYS.includes(k)) continue
    totals[k] += n
    if (HARD_KEYS.includes(k)) fileHard += n
  }
  if (fileHard > 0) perFileHardcode.push({ file: relative(process.cwd(), f), count: fileHard })
}

const hardcodeTotal = totals.hex + totals.rgba + totals.zinc + totals.slate + totals.bgWhiteX + totals.bgBlackX + totals.textWhite
const quebramLight = totals.zinc + totals.slate + totals.bgWhiteX + totals.textWhite
const tokenUses = totals.tokenVar + totals.dsClass
const aderencia = tokenUses + hardcodeTotal > 0 ? Math.round((tokenUses / (tokenUses + hardcodeTotal)) * 100) : 100

const rows = [
  ['Aderência a tokens (var/.ds vs hardcode)', `${aderencia}%`, '100%'],
  ['Hardcodes de cor (total)', hardcodeTotal, 0],
  ['  ↳ que quebram o tema claro', quebramLight, 0],
  ['  ↳ hex literais (#...)', totals.hex, 0],
  ['  ↳ rgb/rgba() manuais', totals.rgba, 0],
  ['  ↳ zinc-*', totals.zinc, 0],
  ['  ↳ slate-*', totals.slate, 0],
  ['  ↳ bg-white/x', totals.bgWhiteX, 0],
  ['  ↳ bg-black/x', totals.bgBlackX, 0],
  ['  ↳ text-white', totals.textWhite, 0],
  ['Overlays inline (fixed inset-0)', totals.fixedInset, 1],
  ['Arquivos com hardcode de cor', perFileHardcode.length, 0],
]

const ok = (a, m) => {
  const an = typeof a === 'string' ? Number(a.replace('%', '')) : a
  const mn = typeof m === 'string' ? Number(m.replace('%', '')) : m
  if (String(m).includes('%')) return an >= mn ? 'OK' : an >= 85 ? '~' : 'X'
  return an <= mn ? 'OK' : an <= mn * 3 ? '~' : 'X'
}

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)
console.log('\n  DESIGN SYSTEM — SCORECARD DE ADERÊNCIA (' + ROOT + ')')
console.log('  ' + new Date().toISOString().slice(0, 10) + '  ·  ' + files.length + ' arquivos analisados\n')
console.log('  ' + pad('Métrica', 44) + padL('Atual', 10) + padL('Meta', 8) + '   Status')
console.log('  ' + '-'.repeat(74))
for (const [label, atual, meta] of rows) {
  console.log('  ' + pad(label, 44) + padL(atual, 10) + padL(meta, 8) + '   ' + ok(atual, meta))
}

console.log('\n  TOP ' + topN + ' ARQUIVOS OFENSORES (hardcode de cor)')
console.log('  ' + '-'.repeat(74))
perFileHardcode.sort((a, b) => b.count - a.count)
for (const { file, count } of perFileHardcode.slice(0, topN)) {
  console.log('  ' + padL(count, 6) + '  ' + file)
}
console.log('\n  Metas em docs/LINGUAGEM_VISUAL.md · componentes canônicos em docs/DESIGN_SYSTEM.md\n')
