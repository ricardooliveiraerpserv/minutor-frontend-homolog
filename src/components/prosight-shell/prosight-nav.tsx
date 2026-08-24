'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ProsightNav — navegação unificada do shell "Gestão e Governança Técnica
// Protheus". DOIS níveis, persistente sobre os 3 domínios que já existem
// (Central de Fontes, Prosight, Operações Protheus).
//
//   Linha 1 (seções): Visão Geral · Fontes · Licenciamento · Operação ·
//                      Mudanças · Auditoria · Configuração.
//   Linha 2 (sub-abas): só quando a seção ativa tem filhos.
//                      Fontes → Acervo/Inventário/Busca/Impacto/Publicações
//                      Configuração → Prosight/Ambiente/Governança
//
// C1 = SÓ casca/navegação: cada item é um <Link> INTERNO para a rota EXISTENTE
// do mapa. Nada de rota nova/movida — os deep-links continuam intactos. DS puro
// (tokens; sem cor hardcoded), mesmo estilo dos <nav> atuais dos layouts.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Match = (p: string) => boolean

interface Leaf {
  href: string
  label: string
  match: Match
}

interface Section {
  href: string
  label: string
  match: Match
  children?: Leaf[]
}

// Rotas de Governança (subgrupo antigo da Central de Fontes) — alcançadas via
// Configuração › Governança. Ficam FORA da seção "Fontes".
const GOVERNANCA = [
  '/central-fontes/campanha',
  '/central-fontes/aprovacoes',
  '/central-fontes/solicitacoes',
  '/central-fontes/configuracoes',
  '/central-fontes/inativos',
]
const startsAny = (p: string, prefixes: string[]) =>
  prefixes.some((g) => p === g || p.startsWith(g + '/'))

// Governança para fins de SEÇÃO ativa (exclui Publicações, que é sub-aba de Fontes).
const GOV_SECTION = GOVERNANCA.filter((g) => g !== '/central-fontes/solicitacoes')

// Fontes é qualquer /central-fontes EXCETO as rotas de governança, + o Inventário (/prosight/inventario).
const isFontes: Match = (p) =>
  (p.startsWith('/central-fontes') && !startsAny(p, GOVERNANCA)) ||
  p === '/prosight/inventario' ||
  p.startsWith('/prosight/inventario/')

const SECTIONS: Section[] = [
  {
    href: '/prosight/visao-geral',
    label: 'Visão Geral',
    match: (p) => p === '/prosight' || p.startsWith('/prosight/visao-geral'),
  },
  {
    href: '/central-fontes',
    label: 'Fontes',
    match: isFontes,
    children: [
      { href: '/central-fontes', label: 'Acervo', match: (p) => p === '/central-fontes' || p.startsWith('/central-fontes/acervo') },
      { href: '/prosight/inventario', label: 'Inventário', match: (p) => p === '/prosight/inventario' || p.startsWith('/prosight/inventario/') },
      { href: '/central-fontes/busca', label: 'Busca', match: (p) => p.startsWith('/central-fontes/busca') },
      { href: '/central-fontes/impacto', label: 'Impacto', match: (p) => p.startsWith('/central-fontes/impacto') },
      { href: '/central-fontes/solicitacoes', label: 'Publicações', match: (p) => p.startsWith('/central-fontes/solicitacoes') },
    ],
  },
  {
    href: '/prosight/licenciamento',
    label: 'Licenciamento',
    match: (p) => p.startsWith('/prosight/licenciamento'),
  },
  {
    href: '/operacoes-protheus/visao-geral',
    label: 'Operação',
    // Domínio Operações menos as seções irmãs (Mudanças/Auditoria/Configuração).
    match: (p) =>
      p.startsWith('/operacoes-protheus') &&
      !p.startsWith('/operacoes-protheus/mudancas') &&
      !p.startsWith('/operacoes-protheus/auditoria') &&
      !p.startsWith('/operacoes-protheus/configuracao'),
  },
  {
    href: '/operacoes-protheus/mudancas',
    label: 'Mudanças',
    match: (p) => p.startsWith('/operacoes-protheus/mudancas'),
  },
  {
    href: '/operacoes-protheus/auditoria',
    label: 'Auditoria',
    match: (p) => p.startsWith('/operacoes-protheus/auditoria'),
  },
  {
    href: '/prosight/configuracao',
    label: 'Configuração',
    match: (p) =>
      p.startsWith('/prosight/configuracao') ||
      p.startsWith('/operacoes-protheus/configuracao') ||
      startsAny(p, GOV_SECTION),
    children: [
      { href: '/prosight/configuracao', label: 'Prosight', match: (p) => p.startsWith('/prosight/configuracao') },
      { href: '/operacoes-protheus/configuracao', label: 'Ambiente', match: (p) => p.startsWith('/operacoes-protheus/configuracao') },
      { href: '/central-fontes/configuracoes', label: 'Governança', match: (p) => startsAny(p, GOV_SECTION) },
    ],
  },
]

const topStyle = (active: boolean) =>
  active
    ? { borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }
    : { borderColor: 'transparent', color: 'var(--text-muted)', fontWeight: 500 }

export function ProsightNav({ rightSlot }: { rightSlot?: ReactNode }) {
  const pathname = usePathname() || ''
  const activeSection = SECTIONS.find((s) => s.match(pathname))
  const subTabs = activeSection?.children

  return (
    <div className="mb-6">
      {/* Linha 1 — seções */}
      <div
        className="flex flex-wrap items-end justify-between gap-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <nav className="flex flex-wrap gap-x-1 gap-y-0">
          {SECTIONS.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition"
              style={topStyle(s === activeSection)}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {rightSlot && <div className="pb-1.5">{rightSlot}</div>}
      </div>

      {/* Linha 2 — sub-abas (só quando a seção ativa tem filhos) */}
      {subTabs && (
        <nav className="mt-3 flex flex-wrap gap-1.5">
          {subTabs.map((t) => {
            const active = t.match(pathname)
            return (
              <Link
                key={t.label}
                href={t.href}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition"
                style={
                  active
                    ? { background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 600 }
                    : { color: 'var(--text-muted)', fontWeight: 500 }
                }
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
