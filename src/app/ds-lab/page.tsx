'use client'

// F1 · Composição isolada de validação dos primitives ds/ (Tree, SplitPanel, Accordion,
// Breadcrumb). DADOS FICTÍCIOS — sem API, sem dados reais, sem lógica da Central.
// Rota /ds-lab (fora do menu). Serve só para o gate visual da F1.

import { useCallback, useState } from 'react'
import { Building2, FileCode2, Folder, FolderGit2, GitBranch } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Accordion, AccordionItem, Breadcrumb, Card, PageHeader, SplitPanel, Tree } from '@/components/ds'
import type { Crumb, TreeNode } from '@/components/ds'

// árvore fictícia Empresa → Repo → Diretório → Fonte (o nó "Fiscal" é LAZY)
const INITIAL: TreeNode[] = [
  {
    id: 'auster', label: 'AUSTER', icon: Building2, badge: 652,
    children: [
      {
        id: 'auster/protheus', label: 'Protheus', icon: FolderGit2, badge: 652,
        children: [
          {
            id: 'auster/protheus/fat', label: 'Faturamento', icon: Folder, badge: 83,
            children: [
              {
                id: 'auster/protheus/fat/pedidos', label: 'Pedidos', icon: Folder, badge: 12,
                children: [
                  { id: 'auster/.../TMKR03.PRX', label: 'TMKR03.PRX', icon: FileCode2, badge: 'Parcial' },
                  { id: 'auster/.../PEDVEN.PRW', label: 'PEDVEN.PRW', icon: FileCode2, badge: 'Doc' },
                ],
              },
              { id: 'auster/protheus/fat/notas', label: 'Notas', icon: Folder, badge: 41, hasChildren: true },
            ],
          },
          // LAZY: sem children, carrega no expand
          { id: 'auster/protheus/fiscal', label: 'Fiscal (lazy)', icon: Folder, badge: 41, hasChildren: true },
          { id: 'auster/protheus/util', label: 'Utilitários (disabled)', icon: Folder, disabled: true, badge: 7 },
        ],
      },
      { id: 'auster/integr', label: 'integracoes', icon: FolderGit2, badge: 18, hasChildren: true },
    ],
  },
  { id: 'promax', label: 'PROMAX BARDAHL', icon: Building2, badge: 473, hasChildren: true },
  { id: 'konecta', label: 'KONECTA', icon: Building2, badge: 298, hasChildren: true },
]

const LONG_PATH: Crumb[] = [
  { label: 'AUSTER', onClick: () => {} },
  { label: 'protheus-custom', onClick: () => {} },
  { label: 'Rdmake_PRD', onClick: () => {} },
  { label: 'Backups Fontes', onClick: () => {} },
  { label: 'V33_bkp_VP_07032023', onClick: () => {} },
  { label: 'WMS', onClick: () => {} },
  { label: 'Fontes', onClick: () => {} },
  { label: 'Atualizações', onClick: () => {} },
  { label: 'JNGWMS4_BKP_VP_03032023.PRW' },
]

export default function DsLabPage() {
  const [nodes, setNodes] = useState<TreeNode[]>(INITIAL)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['auster', 'auster/protheus', 'auster/protheus/fat']))
  const [selected, setSelected] = useState<string>('auster/.../TMKR03.PRX')

  // mutação imutável por id (helper do demo)
  const patch = useCallback((id: string, fn: (n: TreeNode) => TreeNode) => {
    const walk = (list: TreeNode[]): TreeNode[] => list.map((n) => n.id === id ? fn(n) : (n.children ? { ...n, children: walk(n.children) } : n))
    setNodes((prev) => walk(prev))
  }, [])

  const onToggle = useCallback((node: TreeNode, willExpand: boolean) => {
    setExpanded((prev) => { const s = new Set(prev); willExpand ? s.add(node.id) : s.delete(node.id); return s })
    // LAZY: expandindo um nó com hasChildren e sem children → loading + carrega
    if (willExpand && node.hasChildren && !node.children?.length) {
      patch(node.id, (n) => ({ ...n, loading: true }))
      setTimeout(() => {
        patch(node.id, (n) => ({
          ...n, loading: false, hasChildren: false,
          children: [
            { id: n.id + '/A.PRW', label: 'ARQA.PRW', icon: FileCode2, badge: 'Doc' },
            { id: n.id + '/B.PRW', label: 'ARQB.PRW', icon: FileCode2, badge: 'Pendente' },
          ],
        }))
      }, 900)
    }
  }, [patch])

  return (
    <AppLayout>
      <PageHeader icon={FolderGit2} title="ds/ · Lab de primitives (F1)" subtitle="Validação isolada: Tree · SplitPanel · Accordion · Breadcrumb. Dados fictícios." />
      <Card padding="none" className="overflow-hidden">
        <div className="h-[560px]">
          <SplitPanel
            storageKey="ds-lab-split"
            className="h-full"
            left={
              <div className="h-full border-r border-[color:var(--border)] p-2">
                <div className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Navegador (Tree)</div>
                <Tree
                  nodes={nodes}
                  expandedIds={expanded}
                  onToggle={onToggle}
                  selectedId={selected}
                  onSelect={(n) => setSelected(n.id)}
                />
              </div>
            }
            right={
              <div className="flex h-full flex-col gap-4 p-4">
                <Breadcrumb items={LONG_PATH} maxItems={5} />
                <div className="text-sm text-[color:var(--muted-fg)]">Selecionado: <span className="font-medium text-[color:var(--fg)]">{selected}</span></div>
                <Card>
                  <Accordion>
                    <AccordionItem title="Documentação" icon={FileCode2} defaultOpen badge="high">
                      Objetivo, fluxo e responsabilidade da fonte (conteúdo fictício).
                    </AccordionItem>
                    <AccordionItem title="Regras de negócio" icon={GitBranch} badge={3}>
                      RN01 · RN02 · RN03 (fictícias).
                    </AccordionItem>
                    <AccordionItem title="Dependências" icon={FolderGit2} badge={2}>
                      U_XPTO · SA1 (fictícias).
                    </AccordionItem>
                  </Accordion>
                </Card>
                <p className="text-xs text-[color:var(--muted-fg)]">Arraste a divisória (280–500px, persiste). Expanda “Fiscal (lazy)” para ver o loading por nó. Teclado: ↑↓ navegam, →/← expandem/colapsam, Enter seleciona.</p>
              </div>
            }
          />
        </div>
      </Card>
    </AppLayout>
  )
}
