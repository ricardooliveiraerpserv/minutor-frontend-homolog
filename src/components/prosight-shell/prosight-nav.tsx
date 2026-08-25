'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ProsightNav — navegação unificada do shell "Gestão e Governança Técnica
// Protheus". DOIS níveis, persistente sobre os 3 domínios (Central de Fontes,
// Prosight, Operações Protheus).
//
// C1.1 — GATE POR PERMISSÃO: cada seção/sub-aba só aparece se o usuário JÁ tinha
// acesso à capacidade correspondente. NÃO eleva acesso (Inventário/Licenciamento/
// Operação/Mudanças/Auditoria/Publicações/Governança eram admin-only → seguem
// gateados). A ocultação é UX; o BACKEND continua sendo autoridade (rotas/APIs
// checam permissão). Coordenador (source_docs.view) vê só Visão Geral + Fontes
// (Acervo/Busca/Impacto). Admin ('*') vê tudo. Cliente não recebe o shell.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'

type Match = (p: string) => boolean
// Capacidade: recebe hasPermission + isAdmin e diz se o item é visível.
type Cap = (has: (perm: string) => boolean, isAdmin: boolean) => boolean

// Predicados (não elevam: derivam da permissão real do usuário).
const FONTES: Cap = (has) => has('source_docs.view') || has('source_docs.quality.view')
const ADMIN_ONLY: Cap = (_has, isAdmin) => isAdmin
const GMUD: Cap = (has) => has('source_docs.gmud_publish')
const OPERACAO: Cap = (has, isAdmin) => isAdmin || has('operacoes_protheus.view')
const GOV: Cap = (has, isAdmin) =>
  isAdmin || has('source_docs.cost_settings.view') || has('source_docs.semantic_campaign') || has('source_docs.cost_approval.view')
// Quem enxerga o shell (Visão Geral): qualquer acesso a capacidade consolidada.
const SHELL: Cap = (has, isAdmin) =>
  isAdmin || has('source_docs.view') || has('source_docs.quality.view') || has('operacoes_protheus.view')
// Atividade & Auditoria (C4.2, transversal): quem acessa QUALQUER família de evento.
const ATIVIDADE: Cap = (has, isAdmin) =>
  isAdmin || has('source_docs.view') || has('source_docs.quality.view') || has('operacoes_protheus.view') || has('source_docs.gmud_publish')

interface Leaf { href: string; label: string; match: Match; can: Cap }
interface Section { href: string; label: string; match: Match; can: Cap; children?: Leaf[] }

const GOVERNANCA = [
  '/central-fontes/campanha', '/central-fontes/aprovacoes', '/central-fontes/solicitacoes',
  '/central-fontes/configuracoes', '/central-fontes/inativos',
]
const startsAny = (p: string, prefixes: string[]) => prefixes.some((g) => p === g || p.startsWith(g + '/'))
const GOV_SECTION = GOVERNANCA.filter((g) => g !== '/central-fontes/solicitacoes')
// Sub-rotas da seção OPERAÇÃO: AppServers/Compilação/Patches/RPO. Ambientes é seção
// PRÓPRIA. C4.4: /operacoes-protheus/visao-geral e /fontes viraram REDIRECT (removidas
// daqui). Mudanças/Auditoria saíram da hierarquia principal (drill-down por CTA/deep-link).
const OPERACAO_ROUTES = [
  '/operacoes-protheus/appservers', '/operacoes-protheus/compilacao',
  '/operacoes-protheus/patches', '/operacoes-protheus/rpo',
  '/operacoes-protheus/preview',
]
const isFontes: Match = (p) =>
  (p.startsWith('/central-fontes') && !startsAny(p, GOVERNANCA)) ||
  p === '/prosight/inventario' || p.startsWith('/prosight/inventario/')

const SECTIONS: Section[] = [
  { href: '/prosight/visao-geral', label: 'Visão Geral', can: SHELL,
    match: (p) => p === '/prosight' || p.startsWith('/prosight/visao-geral') },
  { href: '/operacoes-protheus/ambientes', label: 'Ambientes', can: OPERACAO,
    match: (p) => p.startsWith('/operacoes-protheus/ambientes') },
  { href: '/central-fontes', label: 'Fontes', can: FONTES, match: isFontes,
    children: [
      { href: '/central-fontes', label: 'Acervo', can: FONTES, match: (p) => p === '/central-fontes' || p.startsWith('/central-fontes/acervo') },
      { href: '/prosight/inventario', label: 'Inventário', can: ADMIN_ONLY, match: (p) => p === '/prosight/inventario' || p.startsWith('/prosight/inventario/') },
      { href: '/central-fontes/busca', label: 'Busca', can: FONTES, match: (p) => p.startsWith('/central-fontes/busca') },
      { href: '/central-fontes/impacto', label: 'Impacto', can: FONTES, match: (p) => p.startsWith('/central-fontes/impacto') },
      { href: '/central-fontes/solicitacoes', label: 'Publicações', can: GMUD, match: (p) => p.startsWith('/central-fontes/solicitacoes') },
    ],
  },
  { href: '/prosight/licenciamento', label: 'Licenciamento', can: ADMIN_ONLY, match: (p) => p.startsWith('/prosight/licenciamento') },
  { href: '/operacoes-protheus/appservers', label: 'Operação', can: OPERACAO,
    match: (p) => startsAny(p, OPERACAO_ROUTES),
    children: [
      { href: '/operacoes-protheus/appservers', label: 'AppServers', can: OPERACAO, match: (p) => p.startsWith('/operacoes-protheus/appservers') },
      { href: '/operacoes-protheus/compilacao', label: 'Compilação', can: OPERACAO, match: (p) => p.startsWith('/operacoes-protheus/compilacao') },
      { href: '/operacoes-protheus/patches', label: 'Patches', can: OPERACAO, match: (p) => p.startsWith('/operacoes-protheus/patches') },
      { href: '/operacoes-protheus/rpo', label: 'RPO', can: OPERACAO, match: (p) => p.startsWith('/operacoes-protheus/rpo') },
    ],
  },
  // C4.4: Atividade & Auditoria fica APÓS Operação. Mudanças/Auditoria de Operações
  // (drill-down especializado) saíram da hierarquia principal — as páginas seguem
  // existindo (deep-link + CTAs como "Ver mudanças"), fora do nav de topo.
  { href: '/prosight/atividade', label: 'Atividade & Auditoria', can: ATIVIDADE,
    match: (p) => p.startsWith('/prosight/atividade') },
  { href: '/prosight/configuracao', label: 'Configuração', can: GOV,
    match: (p) => p.startsWith('/prosight/configuracao') || p.startsWith('/operacoes-protheus/configuracao') || startsAny(p, GOV_SECTION),
    children: [
      { href: '/prosight/configuracao', label: 'Prosight', can: ADMIN_ONLY, match: (p) => p.startsWith('/prosight/configuracao') },
      { href: '/operacoes-protheus/configuracao', label: 'Ambiente', can: ADMIN_ONLY, match: (p) => p.startsWith('/operacoes-protheus/configuracao') },
      { href: '/central-fontes/configuracoes', label: 'Governança', can: GOV, match: (p) => startsAny(p, GOV_SECTION) },
    ],
  },
]

const topStyle = (active: boolean) =>
  active
    ? { borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }
    : { borderColor: 'transparent', color: 'var(--text-muted)', fontWeight: 500 }

export function ProsightNav({ rightSlot }: { rightSlot?: ReactNode }) {
  const pathname = usePathname() || ''
  const { user, hasPermission } = useAuth()
  const isAdmin = user?.type === 'admin'
  const can = (c: Cap) => c(hasPermission, isAdmin)

  // Filtra por permissão: seção aparece se seu gate passa E (sem filhos OU ao
  // menos 1 filho visível). Backend continua autoridade sobre as rotas.
  const visibleSections = SECTIONS
    .map((s) => ({ ...s, children: s.children?.filter((c) => can(c.can)) }))
    .filter((s) => can(s.can) && (!s.children || s.children.length > 0))

  const activeSection = visibleSections.find((s) => s.match(pathname))
  const subTabs = activeSection?.children

  if (visibleSections.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <nav className="flex flex-wrap gap-x-1 gap-y-0">
          {visibleSections.map((s) => (
            <Link key={s.label} href={s.href}
              className="-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition"
              style={topStyle(s === activeSection)}>
              {s.label}
            </Link>
          ))}
        </nav>
        {rightSlot && <div className="pb-1.5">{rightSlot}</div>}
      </div>

      {subTabs && subTabs.length > 0 && (
        <nav className="mt-3 flex flex-wrap gap-1.5">
          {subTabs.map((t) => {
            const active = t.match(pathname)
            return (
              <Link key={t.label} href={t.href}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition"
                style={active
                  ? { background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 600 }
                  : { color: 'var(--text-muted)', fontWeight: 500 }}>
                {t.label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
