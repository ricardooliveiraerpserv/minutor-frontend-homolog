'use client'

// Prosight — Visão Geral (placeholder leve C1). O painel executivo real chega na
// C3; aqui só o cabeçalho, um aviso de consolidação e atalhos para os domínios
// já existentes. Zero dado real — usa o AppLayout via o layout do /prosight.

import Link from 'next/link'
import { LayoutDashboard, FolderGit2, Boxes, Server } from 'lucide-react'
import { PageHeader, Card } from '@/components/ds'

const ATALHOS = [
  { href: '/central-fontes', label: 'Acervo', desc: 'Empresa → Repositório → Fonte', icon: FolderGit2 },
  { href: '/prosight/inventario', label: 'Inventário', desc: 'Git × RPO por ambiente', icon: Boxes },
  { href: '/operacoes-protheus/visao-geral', label: 'Operação', desc: 'AppServers · RPO · Fontes', icon: Server },
]

export default function ProsightVisaoGeralPage() {
  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Prosight — Visão Geral"
        subtitle="Gestão e Governança Técnica Protheus"
      />

      <Card className="mb-6">
        <div className="ds-text-body" style={{ color: 'var(--text)' }}>
          Painel executivo em consolidação (C3)
        </div>
        <p className="ds-text-body-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Os indicadores consolidados dos três domínios (Fontes, Inventário e
          Operação) aparecerão aqui. Por enquanto, use os atalhos abaixo.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ATALHOS.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="ds-row-hover h-full">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'var(--primary-soft)' }}
                >
                  <Icon size={16} color="var(--primary)" />
                </div>
                <div className="min-w-0">
                  <div className="ds-text-body" style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {label}
                  </div>
                  <p className="ds-text-body-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {desc}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
