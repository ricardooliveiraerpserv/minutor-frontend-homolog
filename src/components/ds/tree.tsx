'use client'

// ds/ · Tree — árvore lazy para o Acervo. Nós expansíveis, loading por nó, selected/
// disabled, ícone+badge opcionais, expansão controlável externamente, teclado + a11y.
// SEM lógica de negócio: só estrutura/estado. Os dados (Empresa→Repo→Path) vêm na F2.

import { type KeyboardEvent, type ReactNode, useCallback, useMemo, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TreeNode {
  id: string
  label: ReactNode
  icon?: LucideIcon
  badge?: ReactNode
  children?: TreeNode[]
  /** lazy: possui filhos ainda não carregados (mostra chevron sem children[]) */
  hasChildren?: boolean
  loading?: boolean
  disabled?: boolean
}

interface TreeProps {
  nodes: TreeNode[]
  selectedId?: string
  onSelect?: (node: TreeNode) => void
  /** controlled: se fornecido, a expansão é gerida externamente */
  expandedIds?: Set<string>
  onToggle?: (node: TreeNode, willExpand: boolean) => void
  defaultExpandedIds?: string[]
  className?: string
  ariaLabel?: string
}

export function Tree({ nodes, selectedId, onSelect, expandedIds, onToggle, defaultExpandedIds, className, ariaLabel = 'Acervo' }: TreeProps) {
  const [internal, setInternal] = useState<Set<string>>(() => new Set(defaultExpandedIds ?? []))
  const controlled = expandedIds !== undefined
  const expanded = controlled ? expandedIds! : internal
  const [focusId, setFocusId] = useState<string | undefined>(undefined)

  const isExpandable = (n: TreeNode) => !!(n.children?.length || n.hasChildren)

  const toggle = useCallback((n: TreeNode) => {
    if (!isExpandable(n)) return
    const willExpand = !expanded.has(n.id)
    onToggle?.(n, willExpand)
    if (!controlled) {
      setInternal((prev) => {
        const next = new Set(prev)
        willExpand ? next.add(n.id) : next.delete(n.id)
        return next
      })
    }
  }, [expanded, controlled, onToggle])

  // lista achatada dos nós VISÍVEIS (respeita expansão) para navegação por teclado
  const visible = useMemo(() => {
    const out: { node: TreeNode; level: number }[] = []
    const walk = (list: TreeNode[], level: number) => {
      for (const n of list) {
        out.push({ node: n, level })
        if (expanded.has(n.id) && n.children?.length) walk(n.children, level + 1)
      }
    }
    walk(nodes, 1)
    return out
  }, [nodes, expanded])

  const focusIdx = visible.findIndex((v) => v.node.id === focusId)

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible.length) return
    const idx = focusIdx < 0 ? 0 : focusIdx
    const cur = visible[idx]?.node
    const move = (to: number) => { e.preventDefault(); setFocusId(visible[Math.max(0, Math.min(visible.length - 1, to))].node.id) }
    switch (e.key) {
      case 'ArrowDown': return move(idx + 1)
      case 'ArrowUp': return move(idx - 1)
      case 'Home': return move(0)
      case 'End': return move(visible.length - 1)
      case 'ArrowRight':
        e.preventDefault()
        if (cur && isExpandable(cur) && !expanded.has(cur.id)) toggle(cur)
        else if (cur && expanded.has(cur.id) && visible[idx + 1]) setFocusId(visible[idx + 1].node.id)
        return
      case 'ArrowLeft':
        e.preventDefault()
        if (cur && isExpandable(cur) && expanded.has(cur.id)) toggle(cur)
        else {
          // sobe para o pai (primeiro nó anterior com nível menor)
          for (let i = idx - 1; i >= 0; i--) { if (visible[i].level < visible[idx].level) { setFocusId(visible[i].node.id); break } }
        }
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (cur && !cur.disabled) { onSelect?.(cur); if (isExpandable(cur)) toggle(cur) }
        return
    }
  }, [visible, focusIdx, expanded, toggle, onSelect])

  return (
    <div role="tree" aria-label={ariaLabel} className={cn('select-none text-sm', className)} onKeyDown={onKeyDown}>
      {nodes.map((n) => (
        <TreeItem
          key={n.id} node={n} level={1}
          expanded={expanded} selectedId={selectedId} focusId={focusId}
          onToggle={toggle} onSelect={(node) => { onSelect?.(node); setFocusId(node.id) }} setFocusId={setFocusId}
          isExpandable={isExpandable}
        />
      ))}
    </div>
  )
}

function TreeItem({ node, level, expanded, selectedId, focusId, onToggle, onSelect, setFocusId, isExpandable }: {
  node: TreeNode; level: number; expanded: Set<string>; selectedId?: string; focusId?: string
  onToggle: (n: TreeNode) => void; onSelect: (n: TreeNode) => void; setFocusId: (id: string) => void
  isExpandable: (n: TreeNode) => boolean
}) {
  const open = expanded.has(node.id)
  const expandable = isExpandable(node)
  const selected = selectedId === node.id
  const focused = focusId === node.id
  const Icon = node.icon

  return (
    <div role="none">
      <div
        role="treeitem"
        aria-level={level}
        aria-expanded={expandable ? open : undefined}
        aria-selected={selected}
        aria-disabled={node.disabled || undefined}
        tabIndex={focused || (!focusId && level === 1 && selectedId === node.id) ? 0 : focused ? 0 : -1}
        onClick={(e) => { e.stopPropagation(); if (node.disabled) return; setFocusId(node.id); onSelect(node) }}
        className={cn(
          'group flex items-center gap-1.5 rounded-md py-1 pr-2 outline-none',
          node.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
          selected ? 'bg-[color:var(--accent-bg,#eff6ff)] text-[color:var(--accent,#2563eb)]' : 'text-[color:var(--fg)] hover:bg-[color:var(--muted-bg,#f1f5f9)]',
          focused && 'ring-1 ring-[color:var(--accent,#2563eb)]',
        )}
        style={{ paddingLeft: 6 + (level - 1) * 14 }}
      >
        {/* chevron / spinner / spacer alinhado */}
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--muted-fg)]"
          onClick={(e) => { if (expandable && !node.loading) { e.stopPropagation(); setFocusId(node.id); onToggle(node) } }}
        >
          {node.loading ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : expandable ? (
            <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} aria-hidden />
          ) : null}
        </span>
        {Icon && <Icon size={15} className="shrink-0 text-[color:var(--muted-fg)]" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {node.badge != null && (
          <span className="shrink-0 text-xs tabular-nums text-[color:var(--muted-fg)]">{node.badge}</span>
        )}
      </div>
      {open && node.children?.length ? (
        <div role="group">
          {node.children.map((c) => (
            <TreeItem
              key={c.id} node={c} level={level + 1}
              expanded={expanded} selectedId={selectedId} focusId={focusId}
              onToggle={onToggle} onSelect={onSelect} setFocusId={setFocusId} isExpandable={isExpandable}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
