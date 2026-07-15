'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { NAV_CATALOG, CATALOG_LABEL } from '@/lib/nav-catalog'
import { actionOptionsForScreen, SCREEN_ACTIONS_CATALOG, baseScreenKey } from '@/lib/permissions-catalog'
import { useNavConfig, type NavModuleConfig, type NavTreeNode, type NavScreen, type ScreenAbility, type ScreenActionDef } from '@/contexts/nav-config-context'
import {
  SlidersHorizontal, Plus, Trash2, ChevronUp, ChevronDown, Save, GripVertical, Eye, EyeOff, Users, X, Search, Check,
  AlertTriangle, MonitorPlay, ChevronRight, FolderPlus, Folder, Repeat, FileText, List, Network, FolderInput,
  FolderOpen, LayoutGrid, BarChart2, DollarSign, Database, Mail, Settings, Layers, Briefcase, Wrench, CreditCard,
  CalendarDays, Building2, Handshake, Clock, Receipt, TrendingUp, Star, Headphones, Home, LayoutDashboard, Contact,
  Ticket, Tag, Zap, Webhook, Box, Package, Bookmark, Flag, Heart, Bell, Calculator, ShieldCheck,
  Bot, Activity, MessageCircle, type LucideIcon,
} from 'lucide-react'

// Paleta de ícones (lucide) para pastas/módulos — nome → componente. Cobre os ícones já usados na nav.
const ICONS: Record<string, LucideIcon> = {
  Folder, FolderOpen, LayoutGrid, BarChart2, DollarSign, Database, Mail, Settings, Layers, FileText, Briefcase,
  Wrench, CreditCard, CalendarDays, Building2, Handshake, Clock, Receipt, TrendingUp, Star, Headphones, Home,
  LayoutDashboard, Contact, Ticket, Tag, Zap, Webhook, Network, Users, Box, Package, Bookmark, Flag, Heart, Bell,
  Calculator, ShieldCheck, Bot, Activity, MessageCircle,
}
const iconComp = (name?: string, fallback: LucideIcon = Folder): LucideIcon => (name && ICONS[name]) || fallback

const PROFILES: { key: string; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'coordenador_projetos', label: 'Coord. Projeto' },
  { key: 'coordenador_sustentacao', label: 'Coord. Sustentação' },
  { key: 'consultor', label: 'Consultor' },
  { key: 'consultor_horista', label: 'Horista' },
  { key: 'consultor_banco_de_horas', label: 'Banco de Horas' },
  { key: 'consultor_fixo', label: 'Fixo' },
  { key: 'parceiro_admin', label: 'Parceiro' },
  { key: 'parceiro_gestor', label: 'Parceiro Admin' },
  { key: 'parceiro_simples', label: 'Parceiro Simples' },
  { key: 'cliente', label: 'Cliente' },
]
const PREVIEW_PROFILES = ['admin', 'administrativo', 'coordenador_projetos', 'coordenador_sustentacao', 'consultor', 'parceiro_admin', 'cliente']
const ALL_INTERNAL = ['admin', 'administrativo', 'coordenador_projetos', 'coordenador_sustentacao', 'consultor', 'consultor_horista', 'consultor_banco_de_horas', 'consultor_fixo', 'parceiro_admin', 'parceiro_gestor', 'parceiro_simples']
const INDENT = 18 // px por nível

// Ações por rotina agora vêm do CATÁLOGO CENTRAL (screen_actions) via nav-config — sem hardcode aqui.

// Abas por PERFIL. Cada aba mostra os MÓDULOS daquele perfil (module.profiles inclui o perfil);
// Admin vê todos os módulos internos. Cria-se módulo por aba; telas podem ser reusadas de outras abas.
const SCOPE_TABS: { key: string; label: string; icon: LucideIcon; profile: string }[] = [
  { key: 'admin',                   label: 'Admin',           icon: ShieldCheck, profile: 'admin' },
  { key: 'administrativo',          label: 'Administrativo',  icon: Briefcase,   profile: 'administrativo' },
  { key: 'coordenador_projetos',    label: 'Coord. Projetos', icon: Layers,      profile: 'coordenador_projetos' },
  { key: 'coordenador_sustentacao', label: 'Coord. Sustent.', icon: Headphones,  profile: 'coordenador_sustentacao' },
  { key: 'consultor',               label: 'Consultor',       icon: Users,       profile: 'consultor' },
  { key: 'consultor_horista',       label: 'Horista',         icon: Users,       profile: 'consultor_horista' },
  { key: 'consultor_banco_de_horas',label: 'Banco de Horas',  icon: Users,       profile: 'consultor_banco_de_horas' },
  { key: 'consultor_fixo',          label: 'Fixo',            icon: Users,       profile: 'consultor_fixo' },
  { key: 'parceiro',                label: 'Parceiro',        icon: Handshake,   profile: 'parceiro_admin' },
  { key: 'parceiro_gestor',         label: 'Parceiro Admin',  icon: Handshake,   profile: 'parceiro_gestor' },
  { key: 'parceiro_simples',        label: 'Parceiro Simples',icon: Handshake,   profile: 'parceiro_simples' },
  { key: 'cliente',                 label: 'Cliente',         icon: Building2,   profile: 'cliente' },
]
const PROFILE_MOD_KEYS = ['cliente', 'consultor', 'parceiro', 'consultor_horista', 'consultor_banco_de_horas', 'consultor_fixo', 'parceiro_gestor', 'parceiro_simples']

let _seq = 0
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `nd_${Date.now()}_${_seq++}`)
const screenLabel = (s: NavScreen | undefined, key: string) => s?.label || CATALOG_LABEL[key] || key
// Valor p/ INPUT de edição: usa ?? (não ||) para PRESERVAR string vazia enquanto o usuário
// apaga — senão apagar a última letra faz o nome do catálogo "voltar" no campo.
const editLabel = (s: NavScreen | undefined, key: string) => s?.label ?? CATALOG_LABEL[key] ?? key
const noPerm = (s: NavScreen | undefined) => !s || (s.profiles.length === 0 && s.users.length === 0)

// ── helpers de árvore (puros) ──
function removeNode(nodes: NavTreeNode[], id: string): [NavTreeNode[], NavTreeNode | null] {
  let removed: NavTreeNode | null = null
  const out: NavTreeNode[] = []
  for (const n of nodes) {
    if (n.id === id) { removed = n; continue }
    if (n.children) { const [c, r] = removeNode(n.children, id); if (r) removed = r; out.push({ ...n, children: c }) }
    else out.push(n)
  }
  return [out, removed]
}
function insertBeforeId(nodes: NavTreeNode[], targetId: string, node: NavTreeNode): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) { nodes.splice(i, 0, node); return true }
    const ch = nodes[i].children
    if (ch && insertBeforeId(ch, targetId, node)) return true
  }
  return false
}
function appendToGroup(nodes: NavTreeNode[], groupId: string, node: NavTreeNode): boolean {
  for (const n of nodes) {
    if (n.id === groupId) { (n.children ??= []).push(node); return true }
    if (n.children && appendToGroup(n.children, groupId, node)) return true
  }
  return false
}
function findNode(nodes: NavTreeNode[], id: string): NavTreeNode | null {
  for (const n of nodes) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children, id); if (f) return f } }
  return null
}
function mapNode(nodes: NavTreeNode[], id: string, fn: (n: NavTreeNode) => NavTreeNode): NavTreeNode[] {
  return nodes.map(n => n.id === id ? fn(n) : (n.children ? { ...n, children: mapNode(n.children, id, fn) } : n))
}
/** Lista de irmãos que contém o nó `id` (o array pai). Usado p/ checar duplicidade no mesmo nível. */
function findParentList(nodes: NavTreeNode[], id: string): NavTreeNode[] | null {
  if (nodes.some(n => n.id === id)) return nodes
  for (const n of nodes) if (n.children) { const r = findParentList(n.children, id); if (r) return r }
  return null
}

export default function ConfiguradorPage() {
  return <AppLayout title="Configurador"><Inner /></AppLayout>
}

type Mod = NavModuleConfig
type Target = { type: 'before'; moduleId: number; nodeId: string } | { type: 'group'; moduleId: number; groupId: string } | { type: 'module'; moduleId: number }

function Inner() {
  const { modules: serverModules, screens: serverScreens, reload } = useNavConfig()
  const [mods, setMods] = useState<Mod[]>([])
  const [screens, setScreens] = useState<Record<string, NavScreen>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [drag, setDrag] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)   // nó alvo (linha de inserção "mesmo nível")
  const [overGroup, setOverGroup] = useState<string | null>(null) // grupo/módulo alvo (drop "dentro")
  const [permFor, setPermFor] = useState<string | null>(null)   // modal (visão Lista)
  const [permOpen, setPermOpen] = useState<string | null>(null) // accordion inline (visão Árvore) — node id
  const [locOpen, setLocOpen] = useState<string | null>(null)   // popover "onde mais essa tela aparece"
  const [preview, setPreview] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<'tree' | 'flat'>('tree')
  const [scope, setScope] = useState<string>('admin') // aba: um perfil por vez
  const [addModOpen, setAddModOpen] = useState(false)  // modal "adicionar módulo ao perfil"
  const [newModName, setNewModName] = useState('')
  const [cascade, setCascade] = useState<{ screenKey: string; moduleId: number; nodeId: string; label: string } | null>(null)  // Admin: ocultar em outros perfis?
  const [denyOpen, setDenyOpen] = useState<string | null>(null)  // painel "visibilidade por usuário" (nó da árvore)
  const [moving, setMoving] = useState<string | null>(null) // nó no fluxo "Mover para…"
  const [placeOrphan, setPlaceOrphan] = useState<{ key: string; label: string } | null>(null) // tela órfã no fluxo "onde colocar?"
  const [removedScreens, setRemovedScreens] = useState<{ key: string; label: string; moduleId: number }[]>([]) // telas excluídas → lista de restaurar
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())     // nós marcados (checkbox sempre visível)
  const [bulkMove, setBulkMove] = useState<'move' | 'copy' | null>(null)     // picker de destino em lote

  const collapseInit = useRef(false)
  useEffect(() => {
    setMods(serverModules.map(m => ({ ...m, items: structuredClone(m.items ?? []) })))
    // Ao ENTRAR na tela, a árvore vem fechada (colapsa módulos e pastas). Só na 1ª carga.
    if (!collapseInit.current && serverModules.length > 0) {
      collapseInit.current = true
      const c: Record<string, boolean> = {}
      const walk = (nodes: NavTreeNode[]) => nodes.forEach(n => { if (n.children) { c[n.id] = true; walk(n.children) } })
      serverModules.forEach(m => { c[`m${m.id}`] = true; walk(m.items ?? []) })
      setCollapsed(c)
    }
  }, [serverModules])
  useEffect(() => { setScreens(Object.fromEntries(serverScreens.map(s => [s.key, { ...s, profiles: [...s.profiles], users: [...s.users] }]))) }, [serverScreens])

  const touch = () => setDirty(true)

  const usageByScreen = useMemo(() => {
    const map: Record<string, string[]> = {}
    const walk = (nodes: NavTreeNode[], modLabel: string) => nodes.forEach(n => {
      if (n.screen) { (map[n.screen] ??= []); if (!map[n.screen].includes(modLabel)) map[n.screen].push(modLabel) }
      if (n.children) walk(n.children, modLabel)
    })
    mods.forEach(m => walk(m.items, m.label))
    return map
  }, [mods])


  const orphanRefs = useMemo(() => Object.keys(usageByScreen)
    .filter(k => noPerm(screens[k]))
    .map(k => ({ key: k, label: screenLabel(screens[k], k) })), [usageByScreen, screens])

  // ── mutações ──
  const patchMod = (id: number, p: Partial<Mod>) => { setMods(prev => prev.map(m => m.id === id ? { ...m, ...p } : m)); touch() }
  // Move um nó ↑/↓ dentro da sua própria lista de irmãos (raiz do módulo ou filhos de uma pasta).
  const reorderNode = (moduleId: number, nodeId: string, dir: -1 | 1) => {
    const swap = (nodes: NavTreeNode[]): NavTreeNode[] => {
      const i = nodes.findIndex(n => n.id === nodeId)
      if (i !== -1) {
        const j = i + dir
        if (j < 0 || j >= nodes.length) return nodes
        const copy = nodes.slice();[copy[i], copy[j]] = [copy[j], copy[i]]; return copy
      }
      return nodes.map(n => n.children ? { ...n, children: swap(n.children) } : n)
    }
    setMods(prev => prev.map(m => m.id === moduleId ? { ...m, items: swap(m.items) } : m)); touch()
  }
  const patchTreeNode = (moduleId: number, nodeId: string, fn: (n: NavTreeNode) => NavTreeNode) => {
    setMods(prev => prev.map(m => m.id === moduleId ? { ...m, items: mapNode(m.items, nodeId, fn) } : m)); touch()
  }
  // Captura as telas de uma subárvore excluída → alimenta a lista "Telas removidas" (restaurar).
  const captureRemoved = (node: NavTreeNode, moduleId: number): { key: string; label: string; moduleId: number }[] => {
    const found: { key: string; label: string; moduleId: number }[] = []
    const walk = (n: NavTreeNode) => { if (n.screen) found.push({ key: n.screen, label: screenLabel(screens[n.screen], n.screen), moduleId }); n.children?.forEach(walk) }
    walk(node)
    if (found.length) setRemovedScreens(prev => [...found.filter(f => !prev.some(p => p.key === f.key && p.moduleId === f.moduleId)), ...prev])
    return found
  }

  const removeTreeNode = (moduleId: number, nodeId: string) => {
    const mod = mods.find(m => m.id === moduleId)
    if (mod) {
      const removed = removeNode(mod.items, nodeId)[1]
      if (removed) {
        const found = captureRemoved(removed, moduleId)
        // Undo imediato no toast (além do painel "Telas removidas").
        if (found.length === 1) toast('Tela removida', { action: { label: 'Restaurar', onClick: () => restoreScreen(found[0]) } })
        else if (found.length > 1) toast(`${found.length} telas removidas`, { description: 'Restaure no painel "Telas removidas".' })
      }
    }
    setMods(prev => prev.map(m => m.id === moduleId ? { ...m, items: removeNode(m.items, nodeId)[0] } : m)); touch()
  }
  // Restaura uma tela excluída → readiciona no root do módulo de origem e tira da lista.
  const restoreScreen = (r: { key: string; moduleId: number }) => {
    addScreen(r.moduleId, null, r.key)
    setRemovedScreens(prev => prev.filter(x => !(x.key === r.key && x.moduleId === r.moduleId)))
  }
  const moveMod = (id: number, dir: -1 | 1) => {
    setMods(prev => { const i = prev.findIndex(m => m.id === id), j = i + dir; if (i < 0 || j < 0 || j >= prev.length) return prev; const n = [...prev];[n[i], n[j]] = [n[j], n[i]]; return n.map((m, idx) => ({ ...m, sort_order: idx + 1 })) }); touch()
  }
  // Tela nova nasce visível ao perfil da aba: abas internas → todos os internos; cliente/consultor/parceiro → só o próprio perfil.
  const seedProfiles = () => scope === 'admin' || !PROFILE_MOD_KEYS.includes(scope) ? [...ALL_INTERNAL] : [profile]
  const ensureScreen = (key: string) => setScreens(prev => prev[key] ? prev : ({ ...prev, [key]: { key, label: CATALOG_LABEL[key] ?? key, route: key, active: true, profiles: seedProfiles(), users: [] } }))
  const patchScreen = (key: string, p: Partial<NavScreen>) => { setScreens(prev => ({ ...prev, [key]: { ...prev[key], ...p } })); touch() }
  // Ocultar/mostrar um nó nesta cópia (independente por perfil)
  const setNodeHidden = (moduleId: number, nodeId: string, hidden: boolean) => { setMods(prev => prev.map(m => m.id === moduleId ? { ...m, items: mapNode(m.items, nodeId, g => ({ ...g, hidden })) } : m)); touch() }
  // Override de visibilidade por usuário no nó (pasta/tela): { users?, deny_users? }
  const setNodeUsers = (moduleId: number, nodeId: string, patch: { users?: number[]; deny_users?: number[] }) => patchTreeNode(moduleId, nodeId, g => ({ ...g, ...patch }))
  // Cascata do Admin: oculta a MESMA tela em todos os módulos (todos os perfis)
  const setScreenHiddenEverywhere = (screenKey: string, hidden: boolean) => {
    const walk = (nodes: NavTreeNode[]): NavTreeNode[] => nodes.map(n => { const nn = n.screen === screenKey ? { ...n, hidden } : n; return nn.children ? { ...nn, children: walk(nn.children) } : nn })
    setMods(prev => prev.map(m => ({ ...m, items: walk(m.items) }))); touch()
  }

  // Libera a tela "sem permissão" para o perfil da aba atual (cria o registro se faltar).
  // É o fix de 1 clique do aviso de telas órfãs.
  const grantScreenToProfile = (key: string) => {
    setScreens(prev => {
      const s = prev[key] ?? { key, label: CATALOG_LABEL[key] ?? key, route: key, active: true, profiles: [], users: [] }
      if (s.profiles.includes(profile)) return prev
      return { ...prev, [key]: { ...s, profiles: [...s.profiles, profile] } }
    })
    touch()
  }

  const addScreen = (moduleId: number, parentGroupId: string | null, key: string) => {
    const mod = mods.find(m => m.id === moduleId); if (!mod) return
    const siblings = parentGroupId ? (findNode(mod.items, parentGroupId)?.children ?? []) : mod.items
    if (siblings.some(n => n.screen === key)) { toast.error('Esta tela já está neste nível.'); return }
    ensureScreen(key)
    // tela reusada de outra aba: garante que o perfil desta aba passe a enxergá-la
    if (scope !== 'admin') setScreens(prev => { const s = prev[key]; if (!s || s.profiles.includes(profile)) return prev; return { ...prev, [key]: { ...s, profiles: [...s.profiles, profile] } } })
    const node: NavTreeNode = { id: newId(), screen: key }
    setMods(prev => prev.map(m => {
      if (m.id !== moduleId) return m
      if (!parentGroupId) return { ...m, items: [...m.items, node] }
      return { ...m, items: mapNode(m.items, parentGroupId, g => ({ ...g, children: [...(g.children ?? []), node] })) }
    })); touch()
    if (parentGroupId) setCollapsed(c => ({ ...c, [parentGroupId]: false }))
  }
  const addGroup = (moduleId: number, parentGroupId: string | null = null) => {
    const node: NavTreeNode = { id: newId(), label: 'Nova pasta', children: [] }
    setMods(prev => prev.map(m => {
      if (m.id !== moduleId) return m
      if (!parentGroupId) return { ...m, items: [...m.items, node] }
      return { ...m, items: mapNode(m.items, parentGroupId, g => ({ ...g, children: [...(g.children ?? []), node] })) }
    })); touch()
    if (parentGroupId) setCollapsed(c => ({ ...c, [parentGroupId]: false }))
  }

  const clearDrag = () => { setDrag(null); setOverId(null); setOverGroup(null) }
  // Move/reordena um nó. Bloqueia: soltar grupo dentro de si mesmo e tela DUPLICADA no mesmo nível
  // (reuso em OUTRO módulo/grupo continua permitido).
  const moveNode = (draggedId: string, target: Target) => {
    let moved: NavTreeNode | null = null
    const stripped = mods.map(m => { const [items, r] = removeNode(m.items, draggedId); if (r) moved = r; return { ...m, items } })
    if (!moved) { clearDrag(); return }
    const movedNode: NavTreeNode = moved
    const destId = target.type === 'before' ? target.nodeId : target.type === 'group' ? target.groupId : ''
    if (movedNode.children && destId && findNode([movedNode], destId)) { toast.error('Não dá pra mover um grupo para dentro dele mesmo.'); clearDrag(); return }
    const tm = stripped.find(m => m.id === target.moduleId); if (!tm) { clearDrag(); return }
    const destSiblings = target.type === 'module' ? tm.items
      : target.type === 'group' ? (findNode(tm.items, target.groupId)?.children ?? [])
        : (findParentList(tm.items, target.nodeId) ?? tm.items)
    if (movedNode.screen && destSiblings.some(s => s.id !== movedNode.id && s.screen === movedNode.screen)) {
      toast.error('Esta tela já está nesse nível.'); clearDrag(); return
    }
    if (target.type === 'before') { if (!insertBeforeId(tm.items, target.nodeId, movedNode)) tm.items.push(movedNode) }
    else if (target.type === 'group') { if (!appendToGroup(tm.items, target.groupId, movedNode)) tm.items.push(movedNode) }
    else tm.items.push(movedNode)
    grantProfileToScreens(movedNode, (tm.profiles ?? [])[0])
    setMods(stripped); touch(); clearDrag()
  }

  // Ao mover/colar para OUTRO PERFIL, garante ACESSO: adiciona o perfil do módulo destino às
  // telas movidas (senão a tela aparece no menu do perfil mas o AccessControl bloqueia).
  const grantProfileToScreens = (node: NavTreeNode, profileKey?: string) => {
    if (!profileKey) return
    const keys: string[] = []
    const collect = (ns: NavTreeNode[]) => ns.forEach(n => { if (n.screen) keys.push(n.screen); if (n.children) collect(n.children) })
    collect([node])
    if (!keys.length) return
    setScreens(prev => {
      const next = { ...prev }
      keys.forEach(k => { const sc = next[k]; if (sc && !sc.profiles.includes(profileKey)) next[k] = { ...sc, profiles: [...sc.profiles, profileKey] } })
      return next
    })
  }

  // COPIA um módulo existente para o perfil da aba (cópia independente: ids de nó novos, árvore própria).
  const cloneNodes = (nodes: NavTreeNode[]): NavTreeNode[] => nodes.map(n => ({ ...n, id: newId(), children: n.children ? cloneNodes(n.children) : undefined }))

  // ── Seleção múltipla (mover/copiar em lote) ──
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const clearSelection = () => { setSelectedIds(new Set()); setBulkMove(null) }
  // ids selecionados que NÃO são descendentes de outro selecionado (evita duplicar pai+filho)
  const topLevelSelected = (): string[] => {
    const desc = new Set<string>()
    const mark = (n: NavTreeNode) => n.children?.forEach(c => { desc.add(c.id); mark(c) })
    mods.forEach(m => { const walk = (ns: NavTreeNode[]) => ns.forEach(n => { if (selectedIds.has(n.id)) mark(n); walk(n.children ?? []) }); walk(m.items) })
    return [...selectedIds].filter(id => !desc.has(id))
  }
  // subárvores selecionadas — o destino não pode estar dentro delas
  const selectedExcludeIds = (): Set<string> => {
    const s = new Set<string>(); const add = (n: NavTreeNode) => { s.add(n.id); n.children?.forEach(add) }
    mods.forEach(m => { const walk = (ns: NavTreeNode[]) => ns.forEach(n => { if (selectedIds.has(n.id)) add(n); else walk(n.children ?? []) }); walk(m.items) })
    return s
  }
  // aplica mover/copiar em lote no destino escolhido
  const bulkApply = (target: Target) => {
    const mode = bulkMove; const ids = topLevelSelected()
    const targetProfile = (mods.find(m => m.id === target.moduleId)?.profiles ?? [])[0]
    const collected: NavTreeNode[] = []
    ids.forEach(id => { for (const m of mods) { const f = findNode(m.items, id); if (f) { collected.push(f); break } } })
    setMods(prev => {
      let next = prev
      if (mode === 'move') ids.forEach(id => { next = next.map(m => ({ ...m, items: removeNode(m.items, id)[0] })) })
      const toAdd = mode === 'copy' ? collected.map(n => cloneNodes([n])[0]) : collected
      if (target.type === 'group') next = next.map(m => m.id === target.moduleId ? { ...m, items: mapNode(m.items, target.groupId, g => ({ ...g, children: [...(g.children ?? []), ...toAdd] })) } : m)
      else if (target.type === 'module') next = next.map(m => m.id === target.moduleId ? { ...m, items: [...m.items, ...toAdd] } : m)
      return next
    })
    // Mover para outro perfil: garante acesso às telas no perfil destino.
    collected.forEach(n => grantProfileToScreens(n, targetProfile))
    touch(); setBulkMove(null); clearSelection()
  }

  // COPIAR para VÁRIOS locais de uma vez (multi-seleção de destinos).
  const bulkApplyMulti = (targets: Target[]) => {
    if (targets.length === 0) return
    const ids = topLevelSelected()
    const collected: NavTreeNode[] = []
    ids.forEach(id => { for (const m of mods) { const f = findNode(m.items, id); if (f) { collected.push(f); break } } })
    setMods(prev => {
      let next = prev
      for (const t of targets) {
        const toAdd = collected.map(n => cloneNodes([n])[0])   // clones NOVOS por destino (ids únicos)
        if (t.type === 'group') next = next.map(m => m.id === t.moduleId ? { ...m, items: mapNode(m.items, t.groupId, g => ({ ...g, children: [...(g.children ?? []), ...toAdd] })) } : m)
        else if (t.type === 'module') next = next.map(m => m.id === t.moduleId ? { ...m, items: [...m.items, ...toAdd] } : m)
      }
      return next
    })
    // Garante acesso das telas em cada perfil de destino.
    targets.forEach(t => { const tp = (mods.find(m => m.id === t.moduleId)?.profiles ?? [])[0]; collected.forEach(n => grantProfileToScreens(n, tp)) })
    touch()
    toast.success(`Copiado para ${targets.length} ${targets.length === 1 ? 'local' : 'locais'}`)
    setBulkMove(null); clearSelection()
  }
  // Exclusão em massa — remove do menu os nós selecionados (as telas continuam
  // existindo no catálogo e podem ser readicionadas). Mesma semântica do delete unitário.
  const bulkDelete = () => {
    const ids = topLevelSelected()
    if (ids.length === 0) return
    // Protege telas ESPECÍFICAS do perfil (não estão no Admin e só há 1 ocorrência aqui) — só ocultáveis.
    const protectedIds = new Set<string>()
    if (scope !== 'admin') {
      ids.forEach(id => {
        let node: NavTreeNode | null = null
        for (const m of mods) { const f = findNode(m.items, id); if (f) { node = f; break } }
        if (node?.screen && !adminScreenKeys.has(node.screen) && (locationsByScreen[node.screen]?.length ?? 0) <= 1) protectedIds.add(id)
      })
    }
    const removable = ids.filter(id => !protectedIds.has(id))
    const skipped = ids.length - removable.length
    if (removable.length === 0) { toast.error('Itens específicos deste perfil não podem ser removidos — só ocultados (👁).'); return }
    const note = skipped > 0 ? `\n\n${skipped} item(ns) específico(s) do perfil serão mantidos (não podem ser removidos).` : ''
    if (!confirm(`Remover ${removable.length} ${removable.length === 1 ? 'item' : 'itens'} do menu? As telas continuam existindo e podem ser readicionadas depois.${note}`)) return
    removable.forEach(id => { for (const m of mods) { const f = findNode(m.items, id); if (f) { captureRemoved(f, m.id); break } } })
    setMods(prev => prev.map(m => {
      let items = m.items
      removable.forEach(id => { items = removeNode(items, id)[0] })
      return { ...m, items }
    }))
    touch(); setBulkMove(null); clearSelection()
  }
  // contexto do "mover" de UM item (exclui a própria subárvore como destino)
  const moveContext = (id: string): { excludeIds: Set<string>; title: string } => {
    let node: NavTreeNode | null = null
    for (const m of mods) { const f = findNode(m.items, id); if (f) { node = f; break } }
    const s = new Set<string>(); const c = (n: NavTreeNode) => { s.add(n.id); n.children?.forEach(c) }; if (node) c(node)
    const label = node?.screen ? screenLabel(screens[node.screen], node.screen) : (node?.label ?? 'item')
    return { excludeIds: s, title: `Mover "${label}" para…` }
  }
  const attachModule = async (m: Mod) => {
    try {
      await api.post('/nav-modules', { label: m.label, icon: m.icon, profiles: [profile], items: cloneNodes(m.items ?? []) })
      toast.success(`"${m.label}" copiado para ${tab.label}`); setAddModOpen(false); reload()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  // Cria um módulo novo (vazio) já vinculado ao perfil da aba.
  const createModule = async (label: string) => {
    const name = label.trim(); if (!name) return
    try { await api.post('/nav-modules', { label: name, profiles: [profile] }); toast.success('Módulo criado'); setAddModOpen(false); setNewModName(''); reload() } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  const removeModule = async (m: Mod) => {
    if (m.is_system) { toast.error('Módulo de sistema não pode ser excluído.'); return }
    if (!confirm(`Excluir o módulo "${m.label}"? (as telas continuam existindo)`)) return
    try { await api.delete(`/nav-modules/${m.id}`); toast.success('Excluído'); reload() } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  const saveAll = async () => {
    const refKeys = new Set<string>()
    const collect = (nodes: NavTreeNode[]) => nodes.forEach(n => { if (n.screen) refKeys.add(n.screen); if (n.children) collect(n.children) })
    mods.forEach(m => collect(m.items))
    const orphan = [...refKeys].filter(k => noPerm(screens[k]))
    if (orphan.length > 0) {
      const lista = orphan.slice(0, 8).map(k => `• ${screenLabel(screens[k], k)}`).join('\n')
      const extra = orphan.length > 8 ? `\n… e mais ${orphan.length - 8}` : ''
      if (!confirm(`Atenção: ${orphan.length} tela(s) sem perfil nem usuário ficarão OCULTAS no menu:\n\n${lista}${extra}\n\nSalvar mesmo assim?`)) return
    }
    setSaving(true)
    try {
      const payload = [...refKeys].map(k => screens[k] ?? { key: k, label: CATALOG_LABEL[k] ?? k, route: k, active: true, profiles: [...ALL_INTERNAL], users: [] })
      await api.put('/nav-screens', { screens: payload })
      await Promise.all(mods.map(m => api.put(`/nav-modules/${m.id}`, { label: m.label, icon: m.icon, active: m.active, sort_order: m.sort_order, profiles: m.profiles ?? [], items: m.items })))
      toast.success('Configuração salva ✓'); setDirty(false); reload()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar') } finally { setSaving(false) }
  }

  const usedKeys = useMemo(() => new Set(Object.keys(usageByScreen)), [usageByScreen])
  // Aba Interno × Cliente: filtra os módulos exibidos (o módulo 'cliente' fica só na aba Cliente).
  const tab = SCOPE_TABS.find(t => t.key === scope) ?? SCOPE_TABS[0]
  const profile = tab.profile
  // Filtro de usuários do editor de acessos = usuários do perfil da aba.
  const profileFilter = useMemo(() => profile === 'coordenador_projetos' ? { type: 'coordenador', coord: 'projetos' }
    : profile === 'coordenador_sustentacao' ? { type: 'coordenador', coord: 'sustentacao' }
    : { type: profile, coord: '' }, [profile])
  // Menus independentes: cada aba mostra os módulos do SEU perfil (module.profiles inclui o perfil da aba).
  const scopedMods = useMemo(() => mods.filter(m => (m.profiles ?? []).includes(profile)), [mods, profile])

  // Visibilidade da tela POR PERFIL (não global). "Ocultar/reativar" no perfil = hidden nos nós
  // deste perfil — NÃO mexe em screen.active (que é global e afetaria os outros perfis).
  const screenHiddenInProfile = (key: string): boolean => {
    let any = false, allHidden = true
    const walk = (nodes: NavTreeNode[]) => nodes.forEach(n => { if (n.screen === key) { any = true; if (!n.hidden) allHidden = false } if (n.children) walk(n.children) })
    scopedMods.forEach(m => walk(m.items))
    return any && allHidden
  }
  const setScreenHiddenInProfile = (key: string, hidden: boolean) => {
    const mapH = (nodes: NavTreeNode[]): NavTreeNode[] => nodes.map(n => n.screen === key ? { ...n, hidden: hidden ? true : undefined } : (n.children ? { ...n, children: mapH(n.children) } : n))
    setMods(prev => prev.map(m => (m.profiles ?? []).includes(profile) ? { ...m, items: mapH(m.items) } : m))
    touch()
  }
  // Lista: off = inativa GLOBAL (legado) OU oculta NESTE perfil. Toggle reativa a global, senão alterna por-perfil.
  const flatOff = (key: string): boolean => screens[key]?.active === false || screenHiddenInProfile(key)
  const flatToggle = (key: string) => {
    if (screens[key]?.active === false) { patchScreen(key, { active: true }); return }
    setScreenHiddenInProfile(key, !screenHiddenInProfile(key))
  }

  // Candidatos a copiar: qualquer módulo existente que não seja deste perfil (serve de modelo).
  const attachCandidates = useMemo(() => mods.filter(m => !(m.profiles ?? []).includes(profile)), [mods, profile])
  // Telas que existem no menu do ADMIN (módulos com 'admin' em profiles). Regra de exclusão:
  // numa aba NÃO-admin, tela que está no Admin PODE ser removida (é compartilhada, continua no
  // Admin); tela ESPECÍFICA do perfil (não está no Admin) NÃO pode (senão some do perfil).
  const adminScreenKeys = useMemo(() => {
    const set = new Set<string>()
    const walk = (nodes: NavTreeNode[]) => nodes.forEach(n => { if (n.screen) set.add(n.screen); if (n.children) walk(n.children) })
    mods.filter(m => (m.profiles ?? []).includes('admin')).forEach(m => walk(m.items))
    return set
  }, [mods])
  const scopedUsage = useMemo(() => {
    const map: Record<string, string[]> = {}
    const walk = (nodes: NavTreeNode[], modLabel: string) => nodes.forEach(n => {
      if (n.screen) { (map[n.screen] ??= []); if (!map[n.screen].includes(modLabel)) map[n.screen].push(modLabel) }
      if (n.children) walk(n.children, modLabel)
    })
    scopedMods.forEach(m => walk(m.items, m.label))
    return map
  }, [scopedMods])

  // Onde cada tela aparece DENTRO DESTE PERFIL — caminho completo (Módulo › Pasta › …), deduplicado.
  // Base do indicador "existe em outra pasta" e da regra de exclusão (só exclui se houver outra cópia
  // NO MESMO PERFIL). Cada aba/perfil é avaliada separadamente (usa scopedMods, não mods).
  const locationsByScreen = useMemo(() => {
    const map: Record<string, { path: string; moduleId: number; nodeId: string }[]> = {}
    const walk = (nodes: NavTreeNode[], moduleId: number, trail: string[]) => nodes.forEach(n => {
      if (n.screen) {
        (map[n.screen] ??= []).push({ path: trail.join(' › '), moduleId, nodeId: n.id })
        if (n.children) walk(n.children, moduleId, [...trail, screenLabel(screens[n.screen], n.screen)])
      } else if (n.children) walk(n.children, moduleId, [...trail, n.label ?? ''])
    })
    scopedMods.forEach(m => walk(m.items, m.id, [m.label]))
    return map
  }, [scopedMods, screens])

  // ── render recursivo com guias de árvore ──
  // guides[a] = true se o ancestral de nível `a` ainda tem irmão depois dele (desenha linha vertical contínua).
  // Qualquer nó (grupo OU tela) pode ter filhos → tela com filhos = SUBMENU (pai/filhos).
  function renderNodes(nodes: NavTreeNode[], moduleId: number, guides: boolean[]): React.ReactNode {
    const depth = guides.length
    return nodes.map((n, i) => {
      const isLast = i === nodes.length - 1
      const isOver = overId === n.id
      const overIn = overGroup === n.id
      const isCol = collapsed[n.id]
      const isGroup = !n.screen
      const hasKids = (n.children?.length ?? 0) > 0
      const dragProps = {
        draggable: true,
        onDragStart: (e: React.DragEvent) => { e.stopPropagation(); setDrag(n.id) },
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setOverId(n.id); setOverGroup(null) },
        onDragLeave: () => setOverId(o => o === n.id ? null : o),
        onDrop: (e: React.DragEvent) => { e.stopPropagation(); if (drag && drag !== n.id) moveNode(drag, { type: 'before', moduleId, nodeId: n.id }) },
        onDragEnd: clearDrag,
      }

      const rail = (
        <div className="flex shrink-0 self-stretch">
          {guides.map((cont, a) => (
            <span key={a} className="relative" style={{ width: INDENT }}>
              {cont && <span style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />}
            </span>
          ))}
          <span className="relative" style={{ width: INDENT }}>
            <span style={{ position: 'absolute', left: 9, top: 0, height: isLast ? '50%' : '100%', width: 1, background: 'var(--border)' }} />
            <span style={{ position: 'absolute', left: 9, top: '50%', width: 9, height: 1, background: 'var(--border)' }} />
          </span>
        </div>
      )

      // seta: grupos sempre; telas só quando viram submenu (têm filhos); senão espaçador
      const chevron = (isGroup || hasKids)
        ? <button onClick={() => setCollapsed(c => ({ ...c, [n.id]: !c[n.id] }))} className="shrink-0" style={{ color: 'var(--text-muted)' }}>{isCol ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
        : <span className="shrink-0" style={{ width: 14 }} />

      // bloco de filhos (animado). Grupo sempre tem área (mesmo vazia); tela só quando tem filhos.
      const childArea = (isGroup || hasKids) ? (
        <div className="grid transition-all duration-200 ease-out" style={{ gridTemplateRows: isCol ? '0fr' : '1fr', opacity: isCol ? 0 : 1 }}>
          <div className="overflow-hidden">
            <div onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOverGroup(n.id); setOverId(null) }}
              onDragLeave={() => setOverGroup(o => o === n.id ? null : o)}
              onDrop={e => { e.stopPropagation(); if (drag) moveNode(drag, { type: 'group', moduleId, groupId: n.id }) }}>
              {hasKids
                ? renderNodes(n.children ?? [], moduleId, [...guides, !isLast])
                : (isGroup ? <p className="text-[11px] py-1.5" style={{ paddingLeft: (depth + 2) * INDENT, color: 'var(--text-light)' }}>pasta vazia — arraste telas aqui ou use +</p> : null)}
            </div>
          </div>
        </div>
      ) : null

      if (n.screen) {
        const s = screens[n.screen]
        const usage = usageByScreen[n.screen] ?? []
        const locs = locationsByScreen[n.screen] ?? []
        const inOtherFolders = locs.length > 1   // mesma tela em mais de uma pasta distinta
        const hiddenHere = !!n.hidden   // oculto nesta cópia (independente por perfil)
        return (
          <div key={n.id}>
            <div {...dragProps} className="relative flex items-stretch group" style={{ opacity: hiddenHere ? 0.45 : 1 }}>
              {isOver && <span style={{ position: 'absolute', left: (depth + 1) * INDENT, right: 4, top: -1, height: 2, background: 'var(--primary)', borderRadius: 2, zIndex: 5 }} />}
              {rail}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 rounded-md my-[1px] mr-1 px-2 cursor-grab active:cursor-grabbing"
                style={{ height: 30, background: (isOver || overIn) ? 'var(--primary-soft)' : 'transparent', border: overIn ? '1px dashed var(--primary)' : '1px solid transparent' }}>
                {chevron}
                <span className="flex flex-col shrink-0" style={{ marginRight: 1 }}>
                  <button onClick={() => reorderNode(moduleId, n.id, -1)} title="Mover para cima" style={{ lineHeight: 0, color: 'var(--text-light)' }}><ChevronUp size={11} /></button>
                  <button onClick={() => reorderNode(moduleId, n.id, 1)} title="Mover para baixo" style={{ lineHeight: 0, color: 'var(--text-light)' }}><ChevronDown size={11} /></button>
                </span>
                <input type="checkbox" checked={selectedIds.has(n.id)} onChange={() => toggleSelect(n.id)} onClick={e => e.stopPropagation()} className="shrink-0" style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} title="Selecionar" />
                <button onClick={() => setPermOpen(permOpen === n.id ? null : n.id)} className="shrink-0" title="Acessos por usuário">
                  <FileText size={13} style={{ color: permOpen === n.id ? 'var(--primary)' : hasKids ? 'var(--primary)' : 'var(--text-light)' }} />
                </button>
                <input value={editLabel(s, n.screen)} onChange={e => patchScreen(n.screen!, { label: e.target.value })}
                  className="flex-1 bg-transparent text-[13px] outline-none min-w-0" style={{ color: 'var(--text)', fontWeight: hasKids ? 600 : 400 }} />
                {hasKids && <span title="Submenu (pai)" className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{n.children!.length}</span>}
                {inOtherFolders && (
                  <button onClick={() => setLocOpen(locOpen === n.id ? null : n.id)}
                    title={`Neste perfil, esta tela também está em ${locs.length - 1} outra(s) pasta(s) — clique para ver onde`}
                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)', border: '1px solid var(--warning-border)' }}>
                    <Repeat size={10} /> {locs.length}× {locOpen === n.id ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                )}
                <button onClick={() => setPermOpen(permOpen === n.id ? null : n.id)} title="Acessos por usuário"
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 transition-opacity"
                  style={permOpen === n.id ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : { color: 'var(--text-light)', opacity: 0.7 }}>
                  <Users size={11} /> {s?.users.length ?? 0}
                  {permOpen === n.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
                {/* ocultar/mostrar nesta cópia (independente). No Admin, pergunta se cascateia p/ outros perfis. */}
                <button onClick={() => { const willHide = !n.hidden; if (scope === 'admin' && willHide) { setCascade({ screenKey: n.screen!, moduleId, nodeId: n.id, label: screenLabel(s, n.screen!) }); return } setNodeHidden(moduleId, n.id, willHide) }}
                  title={hiddenHere ? 'Oculto neste perfil — clique p/ mostrar' : 'Visível — clique p/ ocultar'} className="shrink-0">
                  {hiddenHere ? <EyeOff size={14} style={{ color: 'var(--text-light)' }} /> : <Eye size={14} style={{ color: 'var(--success-border)' }} />}
                </button>
                {/* visibilidade por USUÁRIO específico (liberar/bloquear só esta tela p/ ele) */}
                <button onClick={() => setDenyOpen(denyOpen === n.id ? null : n.id)} title="Visibilidade por usuário específico" className="shrink-0 inline-flex items-center gap-0.5 text-[10px]"
                  style={{ color: denyOpen === n.id ? 'var(--primary)' : ((n.users?.length ?? 0) + (n.deny_users?.length ?? 0) > 0 ? 'var(--text)' : 'var(--text-light)') }}>
                  <Users size={13} />{((n.users?.length ?? 0) + (n.deny_users?.length ?? 0)) || ''}
                </button>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                  <span title="Adicionar tela-filha (submenu)"><AddScreen usedKeys={usedKeys} onAdd={k => addScreen(moduleId, n.id, k)} compact childMode /></span>
                  <button onClick={() => setMoving(n.id)} title="Mover para…"><FolderInput size={13} style={{ color: 'var(--text-muted)' }} /></button>
                  {(() => {
                    // Existe no Admin? (aba não-admin) → pode excluir mesmo sendo única aqui.
                    const inAdmin = scope !== 'admin' && !!n.screen && adminScreenKeys.has(n.screen)
                    const canDelete = inOtherFolders || inAdmin
                    if (!canDelete) {
                      return <button disabled title="Tela específica deste perfil — não pode excluir (senão some do perfil). Use o 👁 para apenas OCULTAR."
                        style={{ opacity: 0.3, cursor: 'not-allowed' }}><Trash2 size={13} style={{ color: 'var(--text-light)' }} /></button>
                    }
                    const msg = inOtherFolders
                      ? `Excluir "${screenLabel(s, n.screen!)}" desta pasta?\n\nEla continua neste perfil em ${locs.length - 1} outra(s) pasta(s):\n${locs.map(l => l.path).join('\n')}`
                      : `Excluir "${screenLabel(s, n.screen!)}" deste perfil?\n\nEla existe no Admin — continua disponível lá e pode ser readicionada.`
                    return <button onClick={() => { if (confirm(msg)) removeTreeNode(moduleId, n.id) }}
                      title={inOtherFolders ? 'Excluir desta pasta (há outra cópia neste perfil)' : 'Excluir deste perfil (existe no Admin)'}><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
                  })()}
                </div>
              </div>
            </div>
            {/* popover: onde mais essa tela aparece (pastas distintas) */}
            {locOpen === n.id && (
              <div className="mr-1 mb-1.5 rounded-lg overflow-hidden" style={{ marginLeft: (depth + 1) * INDENT, border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' }}>
                <div className="p-3">
                  <p className="text-[11px] font-semibold mb-1.5 inline-flex items-center gap-1.5" style={{ color: 'var(--warning-border)' }}><Repeat size={12} /> Neste perfil, esta tela está em {locs.length} pastas:</p>
                  <ul className="space-y-1">
                    {locs.map((l, i) => {
                      const isCurrent = l.nodeId === n.id
                      return (
                        <li key={i} className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                          <Folder size={12} style={{ color: 'var(--warning-border)', flexShrink: 0 }} />
                          <span className="flex-1 min-w-0 truncate">{l.path}{isCurrent && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>(esta)</span>}</span>
                          {locs.length > 1 && (
                            <button onClick={() => { if (confirm(`Excluir "${screenLabel(s, n.screen!)}" de:\n${l.path}\n\nContinua neste perfil em ${locs.length - 1} outra(s) pasta(s).`)) removeTreeNode(l.moduleId, l.nodeId) }}
                              title="Excluir a tela desta pasta" className="shrink-0"><Trash2 size={12} style={{ color: 'var(--danger-border)' }} /></button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>É a mesma tela reutilizada — o 🗑 remove só daquela pasta; enquanto houver ≥2, dá pra excluir de qualquer uma. Editar rótulo/permissões afeta todas.</p>
                </div>
              </div>
            )}
            {/* accordion inline de acessos (perfis + usuários esporádicos) */}
            {permOpen === n.id && s && (
              <div className="mr-1 mb-1.5 rounded-lg overflow-hidden" style={{ marginLeft: (depth + 1) * INDENT, border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                <div className="p-3"><ScreenPermBody screen={s} usage={usageByScreen[n.screen] ?? []} onChange={p => patchScreen(n.screen!, p)} filter={profileFilter} profileLabel={tab.label} profile={profile} /></div>
              </div>
            )}
            {denyOpen === n.id && (
              <div className="mr-1 mb-1.5 rounded-lg overflow-hidden" style={{ marginLeft: (depth + 1) * INDENT, border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                <div className="p-3">
                  <NodeVisPanel node={n} isFolder={false} onHidden={h => setNodeHidden(moduleId, n.id, h)} onUsers={patch => setNodeUsers(moduleId, n.id, patch)} filter={profileFilter} />
                </div>
              </div>
            )}
            {childArea}
          </div>
        )
      }

      // ── grupo (subnível, label-only) ──
      return (
        <div key={n.id}>
          <div {...dragProps} className="relative flex items-stretch group" style={{ opacity: n.hidden ? 0.45 : 1 }}>
            {isOver && <span style={{ position: 'absolute', left: (depth + 1) * INDENT, right: 4, top: -1, height: 2, background: 'var(--primary)', borderRadius: 2, zIndex: 5 }} />}
            {rail}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 rounded-md my-[1px] mr-1 px-2 cursor-grab active:cursor-grabbing"
              style={{ height: 32, background: overIn ? 'var(--primary-soft)' : 'var(--surface-sunken)', border: overIn ? '1px dashed var(--primary)' : '1px solid var(--border)' }}>
              {chevron}
              <span className="flex flex-col shrink-0" style={{ marginRight: 1 }}>
                <button onClick={() => reorderNode(moduleId, n.id, -1)} title="Mover pasta para cima" style={{ lineHeight: 0, color: 'var(--text-light)' }}><ChevronUp size={11} /></button>
                <button onClick={() => reorderNode(moduleId, n.id, 1)} title="Mover pasta para baixo" style={{ lineHeight: 0, color: 'var(--text-light)' }}><ChevronDown size={11} /></button>
              </span>
              <input type="checkbox" checked={selectedIds.has(n.id)} onChange={() => toggleSelect(n.id)} onClick={e => e.stopPropagation()} className="shrink-0" style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} title="Selecionar" />
              <IconPicker value={n.icon} onPick={name => patchTreeNode(moduleId, n.id, g => ({ ...g, icon: name }))} />
              <input value={n.label ?? ''} onChange={e => patchTreeNode(moduleId, n.id, g => ({ ...g, label: e.target.value }))}
                className="flex-1 bg-transparent text-[13px] font-semibold outline-none min-w-0" style={{ color: 'var(--text)' }} />
              <span className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{(n.children ?? []).length}</span>
              {/* desabilitar a PASTA inteira: some com todos os filhos no menu deste perfil */}
              <button onClick={() => setNodeHidden(moduleId, n.id, !n.hidden)}
                title={n.hidden ? 'Pasta oculta (esconde todos os filhos) — clique p/ mostrar' : 'Visível — clique p/ ocultar a pasta inteira (todos os filhos somem)'} className="shrink-0">
                {n.hidden ? <EyeOff size={14} style={{ color: 'var(--text-light)' }} /> : <Eye size={14} style={{ color: 'var(--success-border)' }} />}
              </button>
              {/* visibilidade por USUÁRIO específico: bloquear a pasta (e filhos) só p/ ele */}
              <button onClick={() => setDenyOpen(denyOpen === n.id ? null : n.id)} title="Visibilidade por usuário específico (esconde a pasta e os filhos)" className="shrink-0 inline-flex items-center gap-0.5 text-[10px]"
                style={{ color: denyOpen === n.id ? 'var(--primary)' : ((n.users?.length ?? 0) + (n.deny_users?.length ?? 0) > 0 ? 'var(--text)' : 'var(--text-light)') }}>
                <Users size={13} />{((n.users?.length ?? 0) + (n.deny_users?.length ?? 0)) || ''}
              </button>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                <AddScreen usedKeys={usedKeys} onAdd={k => addScreen(moduleId, n.id, k)} compact />
                <button onClick={() => addGroup(moduleId, n.id)} title="Nova pasta dentro"><FolderPlus size={13} style={{ color: 'var(--text-muted)' }} /></button>
                <button onClick={() => setMoving(n.id)} title="Mover para…"><FolderInput size={13} style={{ color: 'var(--text-muted)' }} /></button>
                <button onClick={() => { if (hasKids && !confirm(`Excluir a pasta "${n.label ?? ''}" e tudo que está dentro dela do menu? (as telas continuam existindo e podem ser readicionadas)`)) return; removeTreeNode(moduleId, n.id) }} title="Excluir pasta"><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
              </div>
            </div>
          </div>
          {denyOpen === n.id && (
            <div className="mr-1 mb-1.5 rounded-lg overflow-hidden" style={{ marginLeft: (depth + 1) * INDENT, border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
              <div className="p-3">
                <NodeVisPanel node={n} isFolder={true} onHidden={h => setNodeHidden(moduleId, n.id, h)} onUsers={patch => setNodeUsers(moduleId, n.id, patch)} filter={profileFilter} />
              </div>
            </div>
          )}
          {childArea}
        </div>
      )
    })
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <SlidersHorizontal size={18} style={{ color: 'var(--primary)', marginTop: 2 }} />
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Configurador de Menus</h1>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>A árvore é o menu real. Telas são únicas (permissões compartilhadas) e podem ser reutilizadas em vários módulos.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={saveAll} disabled={saving || !dirty} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg"><Save size={15} /> {saving ? 'Salvando…' : 'Salvar tudo'}</button>
        </div>
      </div>

      {/* Abas por PERFIL */}
      <div className="inline-flex rounded-lg overflow-hidden flex-wrap" style={{ border: '1px solid var(--border)' }}>
        {SCOPE_TABS.map(t => {
          const Ic = t.icon
          return <button key={t.key} onClick={() => setScope(t.key)} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5" style={scope === t.key ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><Ic size={14} /> {t.label}</button>
        })}
      </div>
      <p className="text-[12px] rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
        {scope === 'admin'
          ? <>Todos os módulos internos (Admin vê tudo). Use <b>+ Adicionar módulo</b> e monte a árvore; nas abas de cada perfil você define o que ele enxerga.</>
          : <><b>{tab.label}</b>: módulos deste perfil. Adicione módulos e <b>inclua telas</b> (podem ser reusadas de outras abas). No selo <span style={{ color: 'var(--success-border)' }}>✓/✗</span> você libera/retira a tela para o perfil; ajustes por usuário no editor de acessos (ícone da tela).</>}
      </p>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--text-muted)' }}><MonitorPlay size={15} /> Visualizar como:</span>
          {PREVIEW_PROFILES.map(p => (
            <button key={p} onClick={() => setPreview(p)} className="px-2.5 py-1 rounded-lg text-xs" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {PROFILES.find(x => x.key === p)?.label ?? p}
            </button>
          ))}
        </div>
        {/* toggle árvore / lista */}
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button onClick={() => setView('tree')} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5" style={view === 'tree' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><Network size={13} /> Árvore</button>
          <button onClick={() => setView('flat')} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5" style={view === 'flat' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><List size={13} /> Lista</button>
        </div>
      </div>

      {(() => {
        const removedHere = removedScreens.filter(r => scopedMods.some(m => m.id === r.moduleId))
        if (removedHere.length === 0) return null
        return (
          <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5 text-[13px] sticky top-2 z-20 shadow-lg" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--primary)' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <Trash2 size={15} /> <b>Telas removidas</b> — clique para <b>restaurar</b> no menu de {tab.label}:
            </div>
            <div className="flex flex-wrap gap-1.5 pl-6">
              {removedHere.map(r => (
                <button key={`${r.moduleId}:${r.key}`} onClick={() => restoreScreen(r)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold hover:bg-[var(--surface-hover)]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                  title={`Restaurar "${r.label}"`}>
                  <Repeat size={11} /> {r.label}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {orphanRefs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5 text-[13px]" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning-border)' }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span><b>{orphanRefs.length} tela{orphanRefs.length > 1 ? 's' : ''} sem permissão</b> — não aparecer{orphanRefs.length > 1 ? 'ão' : 'á'} no menu. <b>Clique</b> em cada uma e <b>escolha onde colocar</b> no menu de {tab.label}:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {orphanRefs.map(o => (
              <button key={o.key} onClick={() => setPlaceOrphan(o)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold hover:bg-[var(--surface-hover)]"
                style={{ background: 'var(--surface)', border: '1px solid var(--warning-border)', color: 'var(--warning-border)' }}
                title={`Escolher onde colocar "${o.label || o.key}" no menu de ${tab.label}`}>
                <FolderInput size={11} /> {o.label || o.key}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'flat'
        ? <FlatView usage={scopedUsage} screens={screens} onPerm={setPermFor} onToggle={flatToggle} hiddenOf={flatOff} onLabel={(k, v) => patchScreen(k, { label: v })} />
        : (
          <div className="space-y-3">
            {scopedMods.map((m, mi) => {
              const mc = collapsed[`m${m.id}`]
              const overRoot = overGroup === `m${m.id}`
              return (
                <div key={m.id} className="ds-card p-0 overflow-hidden" style={{ borderLeft: `3px solid ${m.active ? 'var(--primary)' : 'var(--border)'}` }}>
                  {/* MÓDULO — maior, bold, bg */}
                  <div className="flex items-center gap-2 px-3 py-3 cursor-pointer" style={{ background: 'var(--surface-sunken)' }}
                    onClick={e => { if ((e.target as HTMLElement).closest('input,button')) return; setCollapsed(c => ({ ...c, [`m${m.id}`]: !c[`m${m.id}`] })) }}>
                    <button onClick={() => setCollapsed(c => ({ ...c, [`m${m.id}`]: !c[`m${m.id}`] }))} className="shrink-0" style={{ color: 'var(--text-muted)' }}>{mc ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => moveMod(m.id, -1)} disabled={mi === 0} className="disabled:opacity-30"><ChevronUp size={12} /></button>
                      <button onClick={() => moveMod(m.id, 1)} disabled={mi === scopedMods.length - 1} className="disabled:opacity-30"><ChevronDown size={12} /></button>
                    </div>
                    <IconPicker value={m.icon} onPick={name => patchMod(m.id, { icon: name })} fallback={LayoutGrid} />
                    <input value={m.label} onChange={e => patchMod(m.id, { label: e.target.value })} className="ds-input flex-1 text-[15px] font-bold px-2 py-1" />
                    <button onClick={() => patchMod(m.id, { active: !m.active })} title={m.active ? 'Ativo' : 'Inativo'}>{m.active ? <Eye size={16} style={{ color: 'var(--success-border)' }} /> : <EyeOff size={16} style={{ color: 'var(--text-light)' }} />}</button>
                    {m.is_system ? <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-light)' }}>sistema</span> : <button onClick={() => removeModule(m)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>}
                  </div>
                  <div className="grid transition-all duration-200 ease-out" style={{ gridTemplateRows: mc ? '0fr' : '1fr', opacity: mc ? 0 : 1 }}>
                    <div className="overflow-hidden">
                      <div className="p-2 pt-1" style={{ background: overRoot ? 'var(--primary-soft)' : 'transparent' }}
                        onDragOver={e => { e.preventDefault(); setOverGroup(`m${m.id}`); setOverId(null) }}
                        onDragLeave={() => setOverGroup(o => o === `m${m.id}` ? null : o)}
                        onDrop={() => { if (drag) moveNode(drag, { type: 'module', moduleId: m.id }) }}>
                        {/* barra de ações sempre visível — criar pasta / tela na raiz do módulo */}
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                          <button onClick={() => addGroup(m.id)} className="text-[12px] font-medium inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><FolderPlus size={14} /> Nova pasta</button>
                          <AddScreen usedKeys={usedKeys} onAdd={k => addScreen(m.id, null, k)} prominent />
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>na raiz de {m.label}</span>
                        </div>
                        {m.items.length === 0 && <p className="text-[12px] text-center py-3" style={{ color: 'var(--text-light)' }}>Vazio. Crie uma pasta ou adicione uma tela.</p>}
                        {renderNodes(m.items, m.id, [])}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {scopedMods.length === 0 && (
              <p className="text-[13px] text-center py-6" style={{ color: 'var(--text-light)' }}>Nenhum módulo neste perfil ainda.</p>
            )}
            {/* adicionar módulo direto na aba do perfil */}
            <button onClick={() => { setNewModName(''); setAddModOpen(true) }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
              <Plus size={16} /> Adicionar módulo {scope !== 'admin' && `a "${tab.label}"`}
            </button>
          </div>
        )}

      {permFor && screens[permFor] && (
        <PermModal screen={screens[permFor]} usage={usageByScreen[permFor] ?? []}
          onChange={p => patchScreen(permFor, p)} onClose={() => setPermFor(null)} filter={profileFilter} profileLabel={tab.label} profile={profile} />
      )}
      {addModOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setAddModOpen(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><LayoutGrid size={15} style={{ color: 'var(--primary)' }} /> Adicionar módulo{scope !== 'admin' ? ` a "${tab.label}"` : ''}</div>
              <button onClick={() => setAddModOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div className="p-3 max-h-[60vh] overflow-auto space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Módulos existentes</p>
              {attachCandidates.length === 0 && <p className="text-[12px] py-1.5" style={{ color: 'var(--text-light)' }}>Nenhum módulo existente para adicionar.</p>}
              {attachCandidates.map(m => (
                <button key={m.id} onClick={() => attachModule(m)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px]" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <LayoutGrid size={15} style={{ color: 'var(--primary)' }} /> <span className="flex-1 truncate">{m.label}</span>
                  {(m.profiles?.length ?? 0) > 0 && <span className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>em {m.profiles!.length} perfil{m.profiles!.length === 1 ? '' : 's'}</span>}
                  <Plus size={14} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                </button>
              ))}
              <div className="pt-2.5 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-light)' }}>Ou criar novo</p>
                <div className="flex gap-2">
                  <input value={newModName} onChange={e => setNewModName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createModule(newModName) }} placeholder="Nome do módulo" className="ds-input flex-1 text-[13px] px-2 py-1.5" autoFocus />
                  <button onClick={() => createModule(newModName)} disabled={!newModName.trim()} className="ds-btn-primary text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-40">Criar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {cascade && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setCascade(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><EyeOff size={15} style={{ color: 'var(--primary)' }} /> Ocultar &quot;{cascade.label}&quot;</div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Ocultar essa tela também nos <b>outros perfis</b>, ou só aqui no Admin?</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => { setScreenHiddenEverywhere(cascade.screenKey, true); setCascade(null) }} className="ds-btn-primary text-sm px-3 py-2 rounded-lg">Ocultar em todos os perfis</button>
                <button onClick={() => { setNodeHidden(cascade.moduleId, cascade.nodeId, true); setCascade(null) }} className="ds-btn-secondary text-sm px-3 py-2 rounded-lg">Só no Admin</button>
                <button onClick={() => setCascade(null)} className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {preview && <PreviewModal mods={mods} screens={screens} profile={preview} onClose={() => setPreview(null)} />}
      {moving && (() => { const ctx = moveContext(moving); return <MovePicker mods={mods} currentProfile={profile} excludeIds={ctx.excludeIds} title={ctx.title} onPick={t => { moveNode(moving, t); setMoving(null) }} onClose={() => setMoving(null)} /> })()}
      {placeOrphan && (
        <MovePicker mods={mods} currentProfile={profile} excludeIds={new Set()}
          title={`Colocar "${placeOrphan.label}" no menu de ${tab.label} — escolha o módulo/pasta`}
          onPick={t => { addScreen(t.moduleId, t.type === 'group' ? t.groupId : null, placeOrphan.key); grantScreenToProfile(placeOrphan.key); setPlaceOrphan(null) }}
          onClose={() => setPlaceOrphan(null)} />
      )}
      {selectedIds.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[75] flex flex-col items-center gap-2" style={{ bottom: 20, width: 'min(560px, 92vw)' }}>
          {/* destino INLINE (não modal): escolhe a pasta ali mesmo */}
          {bulkMove && (
            <div className="w-full rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[12px] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>{bulkMove === 'copy' ? <Repeat size={13} /> : <FolderInput size={13} />} {bulkMove === 'copy' ? `Copiar ${selectedIds.size} ${selectedIds.size === 1 ? 'item' : 'itens'} para… (marque vários)` : `Mover ${selectedIds.size} ${selectedIds.size === 1 ? 'item' : 'itens'} para…`}</span>
                <button onClick={() => setBulkMove(null)} style={{ color: 'var(--text-muted)' }}><X size={15} /></button>
              </div>
              <FolderPickerBody mods={mods} currentProfile={profile} excludeIds={selectedExcludeIds()} onPick={bulkApply} multi={bulkMove === 'copy'} onConfirm={bulkApplyMulti} />
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 rounded-full shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-[12px] font-semibold px-1" style={{ color: 'var(--text)' }}>{selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'}</span>
            <button onClick={() => setBulkMove(bulkMove === 'move' ? null : 'move')} className="text-[12px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={bulkMove === 'move' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { border: '1px solid var(--border)', color: 'var(--text)' }}><FolderInput size={13} /> Mover para…</button>
            <button onClick={() => setBulkMove(bulkMove === 'copy' ? null : 'copy')} className="text-[12px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={bulkMove === 'copy' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { border: '1px solid var(--border)', color: 'var(--text)' }}><Repeat size={13} /> Copiar para…</button>
            <button onClick={bulkDelete} className="text-[12px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={{ border: '1px solid var(--danger-border)', color: 'var(--danger-border)' }}><Trash2 size={13} /> Excluir</button>
            <button onClick={() => { setSelectedIds(new Set()); setBulkMove(null) }} className="text-[12px] px-2 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Limpar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Corpo do seletor de PASTA. `multi` = escolher VÁRIOS destinos (copiar) e confirmar de uma vez. */
function FolderPickerBody({ mods, excludeIds, onPick, currentProfile, multi, onConfirm }: { mods: Mod[]; excludeIds: Set<string>; onPick: (t: Target) => void; currentProfile?: string; multi?: boolean; onConfirm?: (targets: Target[]) => void }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Target[]>([])
  const query = q.trim().toLowerCase()
  const tkey = (t: Target) => t.type === 'group' ? `g:${t.moduleId}:${t.groupId}` : `m:${t.moduleId}`
  const isSel = (t: Target) => selected.some(s => tkey(s) === tkey(t))
  const handle = (t: Target) => multi
    ? setSelected(prev => prev.some(s => tkey(s) === tkey(t)) ? prev.filter(s => tkey(s) !== tkey(t)) : [...prev, t])
    : onPick(t)
  const folders = useMemo(() => {
    const out: { id: string; moduleId: number; label: string; depth: number }[] = []
    const walk = (nodes: NavTreeNode[], moduleId: number, depth: number) => nodes.forEach(n => {
      if (excludeIds.has(n.id)) return
      if (!n.screen) { out.push({ id: n.id, moduleId, label: n.label ?? '', depth }); walk(n.children ?? [], moduleId, depth + 1) }
      else walk(n.children ?? [], moduleId, depth)
    })
    mods.forEach(m => walk(m.items, m.id, 0))
    return out
  }, [mods, excludeIds])
  return (
    <>
      <div className="px-3 pt-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-light)' }} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pasta…" className="ds-input w-full block" style={{ fontSize: 12, height: 32, paddingTop: 0, paddingBottom: 0, paddingLeft: 28, paddingRight: 8 }} />
        </div>
      </div>
      <div className="p-2 max-h-[45vh] overflow-auto">
        {(() => {
          const renderMod = (m: Mod) => {
            const mFolders = folders.filter(f => f.moduleId === m.id && (!query || f.label.toLowerCase().includes(query)))
            const rootMatch = !query || m.label.toLowerCase().includes(query)
            if (!rootMatch && mFolders.length === 0) return null
            const modT: Target = { type: 'module', moduleId: m.id }
            return (
              <div key={m.id} className="mb-1">
                <button onClick={() => handle(modT)} className="flex items-center gap-1.5 w-full text-left py-1.5 px-2 text-[13px] font-semibold rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)', background: multi && isSel(modT) ? 'var(--primary-soft)' : undefined }}>
                  {multi && <Check size={12} style={{ color: 'var(--primary)', opacity: isSel(modT) ? 1 : 0.2 }} />}
                  <Network size={13} style={{ color: 'var(--text-muted)' }} /> {m.label} <span className="text-[10px] font-normal" style={{ color: 'var(--text-light)' }}>(raiz)</span>
                </button>
                {mFolders.map(f => {
                  const fT: Target = { type: 'group', moduleId: f.moduleId, groupId: f.id }
                  return (
                    <button key={f.id} onClick={() => handle(fT)} className="flex items-center gap-1.5 w-full text-left py-1.5 text-[12px] rounded-md hover:bg-[var(--surface-hover)]" style={{ paddingLeft: 12 + (query ? 1 : f.depth + 1) * 16, paddingRight: 8, color: 'var(--text)', background: multi && isSel(fT) ? 'var(--primary-soft)' : undefined }}>
                      {multi && <Check size={11} style={{ color: 'var(--primary)', opacity: isSel(fT) ? 1 : 0.2 }} />}
                      <Folder size={13} style={{ color: 'var(--primary)' }} /> {f.label}
                    </button>
                  )
                })}
              </div>
            )
          }
          // Agrupa os módulos por PERFIL — perfil atual primeiro, depois os OUTROS PERFIS rotulados.
          const byProfile = new Map<string, Mod[]>()
          mods.forEach(m => { const pk = (m.profiles ?? [])[0] ?? '—'; const arr = byProfile.get(pk); if (arr) arr.push(m); else byProfile.set(pk, [m]) })
          const order = Array.from(byProfile.keys()).sort((a, b) => {
            if (a === currentProfile) return -1
            if (b === currentProfile) return 1
            const ia = PROFILES.findIndex(p => p.key === a), ib = PROFILES.findIndex(p => p.key === b)
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
          })
          return order.map(pk => {
            const rendered = byProfile.get(pk)!.map(renderMod).filter(Boolean)
            if (rendered.length === 0) return null
            const label = PROFILES.find(p => p.key === pk)?.label ?? pk
            const isCurrent = pk === currentProfile
            return (
              <div key={pk} className="mb-2">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: isCurrent ? 'var(--primary)' : 'var(--text-light)' }}>
                  {isCurrent ? `Este perfil · ${label}` : label}
                </div>
                {rendered}
              </div>
            )
          })
        })()}
        {query && !folders.some(f => f.label.toLowerCase().includes(query)) && !mods.some(m => m.label.toLowerCase().includes(query)) && (
          <p className="text-[12px] text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhuma pasta encontrada.</p>
        )}
      </div>
      {multi && (
        <div className="px-3 py-2.5 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{selected.length} destino{selected.length === 1 ? '' : 's'} marcado{selected.length === 1 ? '' : 's'}</span>
          <button disabled={selected.length === 0} onClick={() => onConfirm?.(selected)} className="ds-btn-primary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={selected.length === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
            <Repeat size={13} /> Copiar para {selected.length || ''} {selected.length === 1 ? 'local' : 'locais'}
          </button>
        </div>
      )}
    </>
  )
}

/** "Mover para…" de UM item (modal). Escolhe um destino (raiz de módulo ou pasta). */
function MovePicker({ mods, excludeIds, title, onPick, onClose, currentProfile }: { mods: Mod[]; excludeIds: Set<string>; title: string; onPick: (t: Target) => void; onClose: () => void; currentProfile?: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold inline-flex items-center gap-2 min-w-0" style={{ color: 'var(--text)' }}><FolderInput size={15} style={{ color: 'var(--primary)' }} className="shrink-0" /> <span className="truncate">{title}</span></div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="shrink-0"><X size={16} /></button>
        </div>
        <FolderPickerBody mods={mods} currentProfile={currentProfile} excludeIds={excludeIds} onPick={onPick} />
        <div className="px-4 py-2.5 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
          Só <b>pastas</b> (e a raiz do módulo) como destino. O item vai para o fim do destino.
        </div>
      </div>
    </div>
  )
}

/** Visão LISTA (flat) — todas as telas referenciadas, sem hierarquia; foco em escanear permissões. */
function FlatView({ usage, screens, onPerm, onToggle, onLabel, hiddenOf }: { usage: Record<string, string[]>; screens: Record<string, NavScreen>; onPerm: (k: string) => void; onToggle: (k: string) => void; onLabel: (k: string, v: string) => void; hiddenOf: (k: string) => boolean }) {
  const keys = Object.keys(usage).sort((a, b) => screenLabel(screens[a], a).localeCompare(screenLabel(screens[b], b)))
  return (
    <div className="ds-card p-0 overflow-hidden">
      {keys.length === 0 && <p className="text-[12px] text-center py-6" style={{ color: 'var(--text-light)' }}>Nenhuma tela na estrutura.</p>}
      {keys.map((k, i) => {
        const s = screens[k]; const off = hiddenOf(k); const mods = usage[k] ?? []
        return (
          <div key={k} className="flex items-center gap-2 px-3 group" style={{ height: 38, borderTop: i ? '1px solid var(--border)' : 'none', opacity: off ? 0.55 : 1 }}>
            <FileText size={13} className="shrink-0" style={{ color: 'var(--text-light)' }} />
            <input value={editLabel(s, k)} onChange={e => onLabel(k, e.target.value)} className="bg-transparent text-[13px] outline-none min-w-0" style={{ color: 'var(--text)', width: 220 }} />
            <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0">
              {mods.map(mod => <span key={mod} className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{mod}</span>)}
              {mods.length > 1 && <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-light)' }}><Repeat size={10} /></span>}
            </div>
            <button onClick={() => onPerm(k)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={noPerm(s) ? { background: 'var(--warning-bg)', color: 'var(--warning-border)' } : { background: 'var(--primary-soft)', color: 'var(--primary)' }}><Users size={11} /> {s?.profiles.length ?? 0}{s?.users.length ? `+${s.users.length}` : ''}</button>
            <button onClick={() => onToggle(k)} title={off ? 'Oculto neste perfil — clique para reativar' : 'Visível — clique para ocultar (só neste perfil)'} className="shrink-0">{off ? <EyeOff size={14} style={{ color: 'var(--text-light)' }} /> : <Eye size={14} style={{ color: 'var(--success-border)' }} />}</button>
          </div>
        )
      })}
    </div>
  )
}

// perfis que escolhem módulos (admin = bypass; cliente usa portal) — definidos AQUI no Configurador
/** Seletor visual de ícone (lucide) para pasta/módulo. */
function IconPicker({ value, onPick, fallback }: { value?: string; onPick: (name: string) => void; fallback?: LucideIcon }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const Cur = iconComp(value, fallback ?? Folder)
  const toggle = () => {
    if (!open && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800
      const H = 240, W = 250
      // posição fixed: abre pra cima quando não cabe embaixo (evita corte no fim da lista)
      const top = (r.bottom + H > vh) ? Math.max(8, r.top - H - 4) : r.bottom + 4
      const left = Math.max(8, Math.min(r.left, vw - W - 8))
      setPos({ top, left })
    }
    setOpen(o => !o)
  }
  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button onClick={toggle} title="Escolher ícone" className="p-0.5 rounded hover:bg-[var(--surface-hover)]"><Cur size={15} style={{ color: 'var(--primary)' }} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed z-40 p-2 grid grid-cols-8 gap-0.5 rounded-lg shadow-xl" style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, background: 'var(--surface)', border: '1px solid var(--border)', width: 250 }}>
            {Object.entries(ICONS).map(([name, C]) => (
              <button key={name} onClick={() => { onPick(name); setOpen(false) }} title={name} className="p-1.5 rounded hover:bg-[var(--surface-hover)]" style={{ color: value === name ? 'var(--primary)' : 'var(--text-muted)' }}><C size={16} /></button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Picker do catálogo → cria REFERÊNCIA. Mostra reuso (🔁) sem impedir. childMode = tela-filha (submenu); prominent = botão preenchido. */
function AddScreen({ usedKeys, onAdd, compact, childMode, prominent }: { usedKeys: Set<string>; onAdd: (key: string) => void; compact?: boolean; childMode?: boolean; prominent?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const term = q.trim().toLowerCase()
  const results = term
    ? NAV_CATALOG.filter(c => c.label.toLowerCase().includes(term) || c.group.toLowerCase().includes(term) || c.key.toLowerCase().includes(term))
    : NAV_CATALOG
  const close = () => { setOpen(false); setQ('') }
  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button onClick={() => { if (!open && wrapRef.current) { const r = wrapRef.current.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: Math.min(r.left, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 296) }) } setOpen(o => !o) }} title="Inserir no menu uma tela já existente do sistema (referência)"
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg ${prominent ? 'text-[12px] font-medium py-1.5 px-3' : `text-[12px] border border-dashed ${compact ? 'px-2 py-1' : 'py-1.5 px-3'}`}`}
        style={prominent ? { background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <Plus size={prominent ? 14 : 12} /> {childMode ? 'filho' : (prominent ? 'Adicionar tela' : 'tela')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="fixed z-[90] w-72 rounded-lg shadow-xl" style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-2 sticky top-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-light)' }} />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tela do sistema…" className="ds-input w-full block" style={{ fontSize: 12, lineHeight: '20px', height: 32, paddingTop: 0, paddingBottom: 0, paddingLeft: 28, paddingRight: 8 }} />
              </div>
            </div>
            <div className="max-h-64 overflow-auto">
              {results.length === 0 && <p className="px-3 py-3 text-[12px] text-center" style={{ color: 'var(--text-light)' }}>Nenhuma tela encontrada.</p>}
              {results.map(c => {
                const used = usedKeys.has(c.key)
                return (
                  <button key={c.key} onClick={() => { onAdd(c.key); close() }} className="flex items-center w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)' }}>
                    <span className="text-[9px] uppercase mr-1.5 shrink-0" style={{ color: 'var(--text-light)' }}>{c.group}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {used && <span title="Reuso — vira nova referência" className="inline-flex items-center gap-0.5 text-[9px] ml-1 shrink-0" style={{ color: 'var(--text-light)' }}><Repeat size={9} /></span>}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Preview — menu resolvido (árvore) que o perfil enxerga. */
function PreviewModal({ mods, screens, profile, onClose }: { mods: Mod[]; screens: Record<string, NavScreen>; profile: string; onClose: () => void }) {
  const label = PROFILES.find(p => p.key === profile)?.label ?? profile
  const renderTree = (nodes: NavTreeNode[], depth: number): React.ReactNode[] => nodes.flatMap(n => {
    if (n.hidden) return []   // oculto nesta cópia
    if (n.screen) {
      const s = screens[n.screen]
      if (s && s.active === false) return []
      return [<div key={n.id} className="py-1 rounded-md text-[13px] flex items-center gap-1.5" style={{ paddingLeft: 8 + depth * 16, color: 'var(--text)' }}><FileText size={12} style={{ color: 'var(--text-light)' }} />{screenLabel(s, n.screen)}</div>]
    }
    const kids = renderTree(n.children ?? [], depth + 1)
    if (kids.length === 0) return []
    const Ico = iconComp(n.icon)
    return [<div key={n.id}><p className="text-[10px] font-bold uppercase tracking-wide py-1 flex items-center gap-1" style={{ paddingLeft: 8 + depth * 16, color: 'var(--text-light)' }}><Ico size={11} />{n.label}</p>{kids}</div>]
  })
  // Menu do perfil = os MÓDULOS dele (module.profiles inclui o perfil), exatamente como a sidebar monta.
  const visible = mods.filter(m => m.active && (m.profiles ?? []).includes(profile)).map(m => ({ label: m.label, body: renderTree(m.items, 0) })).filter(m => m.body.length > 0)
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><MonitorPlay size={15} style={{ color: 'var(--primary)' }} /> Menu do perfil <span className="px-1.5 py-0.5 rounded-md text-xs" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{label}</span></div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="p-3 max-h-[70vh] overflow-auto" style={{ background: 'var(--surface-sunken)' }}>
          {visible.length === 0 && <p className="text-[12px] text-center py-6" style={{ color: 'var(--text-light)' }}>Nenhum item visível para este perfil.</p>}
          {visible.map(m => (
            <div key={m.label} className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wide px-2 mb-1" style={{ color: 'var(--primary)' }}>{m.label}</p>
              {m.body}
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
          Preview do menu deste perfil (a árvore da <b>cópia dele</b>). Itens ocultos não aparecem.
        </div>
      </div>
    </div>
  )
}

/** Permissões da TELA (compartilhadas por todas as ocorrências na árvore). */
/** Corpo do editor de permissões da tela (perfis + permissões por ação com override por usuário). */
function ScreenPermBody({ screen, usage, onChange, filter, profileLabel, profile }: { screen: NavScreen; usage: string[]; onChange: (p: Partial<NavScreen>) => void; filter: { type: string; coord: string }; profileLabel: string; profile: string }) {
  return (
    <div className="space-y-3">
      {usage.length > 1 && (
        <p className="text-[11px] inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <Repeat size={12} /> Tela em <b>{usage.length} módulos</b> ({usage.join(', ')}) — os overrides por usuário valem para todas as ocorrências.
        </p>
      )}
      <p className="text-[11px] px-1" style={{ color: 'var(--text-muted)' }}>
        A visibilidade no menu vem da <b>árvore deste perfil</b>. Aqui só ajustes por <b>usuário</b> de <b>{profileLabel}</b> (liberar ou bloquear ações).
      </p>
      <ScreenActionsEditor screen={screen} onChange={onChange} filter={filter} profile={profile} profileLabel={profileLabel} />
    </div>
  )
}

/** Ações da tela: catálogo editável (admin adiciona/remove) + override por USUÁRIO. */
function ScreenActionsEditor({ screen, onChange, filter, profile, profileLabel }: { screen: NavScreen; onChange: (p: Partial<NavScreen>) => void; filter: { type: string; coord: string }; profile: string; profileLabel: string }) {
  const { screenActions, setScreenActionsFor } = useNavConfig()
  const [openAction, setOpenAction] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [pickQ, setPickQ] = useState('')
  const [busy, setBusy] = useState(false)
  const actions = screenActions[screen.key] ?? []
  const get = (a: string): ScreenAbility => screen.abilities?.[a] ?? { profiles: [], users: [], deny_users: [], deny_profiles: [] }
  const setA = (a: string, patch: Partial<ScreenAbility>) =>
    onChange({ abilities: { ...(screen.abilities ?? {}), [a]: { ...get(a), ...patch } } })
  // Olho: desabilita/reabilita a AÇÃO só neste perfil (abilities.deny_profiles). onChange → "Salvar tudo".
  const toggleActionProfile = (a: string, ab: ScreenAbility, disable: boolean) => {
    const dp = new Set(ab.deny_profiles ?? [])
    if (disable) dp.add(profile); else dp.delete(profile)
    setA(a, { deny_profiles: [...dp] })
  }

  // AÇÕES REAIS da tela (igual prod) — ou permissões scopadas se a tela não tiver catálogo.
  // Sempre dá pra criar AÇÃO PERSONALIZADA (texto livre) pro que não estiver listado.
  const options = actionOptionsForScreen(screen.key, screen.label ?? undefined)
  const hasCatalog = !!SCREEN_ACTIONS_CATALOG[baseScreenKey(screen.key)]
  const takenKeys = new Set(actions.map(a => a.action_key))
  const takenLabels = new Set(actions.map(a => a.label.toLowerCase()))
  const available = options.filter(o => (!o.key || !takenKeys.has(o.key)) && !takenLabels.has(o.label.toLowerCase()))
  const q = pickQ.trim().toLowerCase()
  const filtered = available.filter(o => !q || o.label.toLowerCase().includes(q) || o.note.toLowerCase().includes(q))
  // criar ação personalizada quando o texto não bate com nenhuma opção nem com ação já existente
  const canCreateCustom = q.length >= 2 && !options.some(o => o.label.toLowerCase() === q) && !takenLabels.has(q)

  const addAction = async (label: string, actionKey: string) => {
    if (!label.trim() || busy) return
    setBusy(true)
    try { const r = await api.post<{ data: ScreenActionDef[] }>('/nav-screen-actions', { screen_key: screen.key, label: label.trim(), action_key: actionKey || undefined }); setScreenActionsFor(screen.key, r.data ?? []); setPickOpen(false); setPickQ(''); toast.success('Ação adicionada') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setBusy(false) }
  }
  // 🗑 = excluir do CATÁLOGO (global — afeta TODOS os perfis). Avisa explicitamente.
  const removeAction = async (ak: string, label: string) => {
    if (!confirm(`Excluir "${label}" do catálogo desta tela?\n\n⚠️ É GLOBAL — some de TODOS os perfis. Para tirar só de ${profileLabel}, use o botão Habilitada/Desabilitada (não exclua).`)) return
    try { const r = await api.delete<{ data: ScreenActionDef[] }>(`/nav-screen-actions?screen_key=${encodeURIComponent(screen.key)}&action_key=${encodeURIComponent(ak)}`); setScreenActionsFor(screen.key, r.data ?? []) }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }

  return (
    <div className="rounded-xl p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-2 inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><ShieldCheck size={12} /> Ações — override por usuário</p>
      <div className="space-y-1.5">
        {actions.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem ações ainda — adicione abaixo tudo que esta tela oferece.</p>}
        {actions.map(def => {
          const a = def.action_key
          const ab = get(a)
          const open = openAction === a
          const ov = ab.users.length + ab.deny_users.length
          // Olho: ação desabilitada p/ ESTE perfil? (abilities.deny_profiles). Universal — vale p/ toda ação.
          const denied = (ab.deny_profiles ?? []).includes(profile)
          return (
            <div key={a} className="rounded-lg p-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', opacity: denied ? 0.55 : 1 }}>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--text)', textDecoration: denied ? 'line-through' : undefined }} title={def.description ?? undefined}>{def.label}</span>
                {/* 👁 Ocultar/mostrar a ação SÓ neste perfil — em TODA linha, sempre clicável. */}
                <button onClick={() => toggleActionProfile(a, ab, !denied)}
                  title={denied ? `Oculta em ${profileLabel} — clique p/ mostrar` : `Visível — clique p/ ocultar em ${profileLabel}`} className="shrink-0">
                  {denied ? <EyeOff size={14} style={{ color: 'var(--danger-border)' }} /> : <Eye size={14} style={{ color: 'var(--success-border)' }} />}
                </button>
                <button onClick={() => setOpenAction(open ? null : a)} title="Override por usuário"
                  className="text-[11px] inline-flex items-center gap-1.5 shrink-0"
                  style={{ color: open ? 'var(--primary)' : ov > 0 ? 'var(--text)' : 'var(--text-light)' }}>
                  <Users size={12} /> {ov} {ov === 1 ? 'usuário' : 'usuários'}
                  {ov > 0 && <span className="inline-flex items-center gap-1">
                    <span style={{ color: 'var(--success-border)' }}>✔{ab.users.length}</span>
                    <span style={{ color: 'var(--danger-border)' }}>✖{ab.deny_users.length}</span>
                  </span>}
                  {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
                <button onClick={() => removeAction(a, def.label)} title="Excluir do catálogo (TODOS os perfis)" className="shrink-0"><Trash2 size={12} style={{ color: 'var(--text-light)' }} /></button>
              </div>
              {open && <ActionUsers ab={ab} onChange={patch => setA(a, patch)} filter={filter} />}
            </div>
          )
        })}
      </div>
      {/* adicionar AÇÃO da tela (lista inline: ações reais + criar personalizada) */}
      <div className="mt-2">
        <button onClick={() => setPickOpen(o => !o)} disabled={busy} className="ds-input w-full text-left text-[12px] px-2 py-1.5 flex items-center justify-between disabled:opacity-40">
          <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}><Plus size={13} /> Adicionar ação…</span>
          <ChevronDown size={13} style={{ color: 'var(--text-muted)', transform: pickOpen ? 'rotate(180deg)' : undefined }} />
        </button>
        {pickOpen && (
          <div className="mt-1 rounded-lg overflow-hidden" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--primary)' }}>
            <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <input autoFocus value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="Buscar ou digitar nova ação…" className="ds-input w-full text-[12px] px-2 py-1.5" />
            </div>
            <div className="max-h-[300px] overflow-auto p-1">
              {filtered.length > 0 && (
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{hasCatalog ? 'Ações desta tela' : 'Permissões relacionadas'}</div>
              )}
              {filtered.map(o => (
                <button key={o.label} onClick={() => addAction(o.label, o.key)} className="w-full text-left px-2 py-1.5 rounded-md text-[12px] hover:bg-[var(--surface-hover)] flex items-center justify-between gap-2" style={{ color: 'var(--text)' }}>
                  <span className="truncate">{o.label}</span>
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{o.key ? o.note : 'ação da tela'}</span>
                </button>
              ))}
              {/* criar AÇÃO PERSONALIZADA (texto livre) — p/ ações que não estão na lista (ex.: reenviar boas-vindas) */}
              {canCreateCustom && (
                <button onClick={() => addAction(pickQ.trim(), '')} className="w-full text-left px-2 py-1.5 mt-1 rounded-md text-[12px] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5" style={{ color: 'var(--primary)', borderTop: filtered.length ? '1px solid var(--border)' : undefined }}>
                  <Plus size={12} /> Criar ação: <b>&quot;{pickQ.trim()}&quot;</b>
                </button>
              )}
              {filtered.length === 0 && !canCreateCustom && (
                <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>{available.length === 0 ? 'Todas as ações desta tela já foram adicionadas.' : 'Digite para criar uma ação personalizada.'}</p>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--text-light)' }}>As <b>ações reais da tela</b> (ex.: Reenviar boas-vindas) — escolha da lista ou <b>crie uma personalizada</b>. Por usuário: ✓ libera, ✕ bloqueia.</p>
    </div>
  )
}

/** Override por usuário (lista auditável): cada usuário ✔ permitido (verde) ou ✖ bloqueado (vermelho). */
/**
 * Painel de visibilidade do NÓ por usuário, com MODO explícito:
 *  - "Todos do perfil"  → nó visível a todos (hidden=false); use ✕ p/ esconder de alguém.
 *  - "Somente estes"    → nó OCULTO por padrão (hidden=true); SÓ os ✓ permitidos veem (whitelist).
 * Resolve o caso "quero a tela só p/ 1-2 usuários" sem ter que bloquear todo mundo.
 */
function NodeVisPanel({ node, isFolder, onHidden, onUsers, filter }: { node: NavTreeNode; isFolder: boolean; onHidden: (h: boolean) => void; onUsers: (p: Partial<ScreenAbility>) => void; filter: { type: string; coord: string } }) {
  const only = !!node.hidden
  const thing = isFolder ? 'pasta' : 'tela'
  return (
    <>
      <div className="inline-flex rounded-lg overflow-hidden mb-2" style={{ border: '1px solid var(--border)' }}>
        <button onClick={() => onHidden(false)} className="px-2.5 py-1 text-[11px] font-medium transition-colors" style={!only ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}>Todos do perfil</button>
        <button onClick={() => onHidden(true)} className="px-2.5 py-1 text-[11px] font-medium transition-colors" style={only ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}>Somente estes usuários</button>
      </div>
      <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {only
          ? <>Esta {thing} fica <b>oculta</b> para o perfil — <b>só</b> os usuários <b>permitidos (✓)</b> abaixo{isFolder ? ' (e os filhos)' : ''} a veem. Adicione quem pode ver.</>
          : <>Visível a <b>todos do perfil</b> — use <b>✕</b> para esconder de usuários específicos.</>}
      </p>
      <ActionUsers ab={{ profiles: [], users: node.users ?? [], deny_users: node.deny_users ?? [] }} onChange={onUsers} filter={filter} />
    </>
  )
}

function ActionUsers({ ab, onChange, filter }: { ab: ScreenAbility; onChange: (p: Partial<ScreenAbility>) => void; filter: { type: string; coord: string } }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ id: number; name: string; email: string }[]>([])
  const [picked, setPicked] = useState<Record<number, string>>({})
  const [open, setOpen] = useState(false)

  const search = useCallback((term: string) => {
    if (!filter.type && term.trim().length < 2) { setHits([]); return }
    const params = new URLSearchParams()
    if (term.trim()) params.set('search', term.trim())
    if (filter.type) params.set('type', filter.type)
    if (filter.coord) params.set('coordinator_type', filter.coord)
    api.get<{ data: { id: number; name: string; email: string }[] }>(`/notifications/users?${params.toString()}`)
      .then(r => { const data = r.data ?? []; setHits(data); setPicked(p => { const n = { ...p }; data.forEach(u => { n[u.id] = u.name }); return n }) }).catch(() => {})
  }, [filter.type, filter.coord])
  useEffect(() => { const t = setTimeout(() => search(q), 250); return () => clearTimeout(t) }, [q, search])

  // adiciona já como PERMITIDO (verde); pode bloquear depois. NÃO fecha a lista (permite vários).
  const add = (u: { id: number; name: string }) => {
    setPicked(p => ({ ...p, [u.id]: u.name }))
    if (!ab.users.includes(u.id) && !ab.deny_users.includes(u.id)) onChange({ users: [...ab.users, u.id] })
  }
  const setBlocked = (id: number, blocked: boolean) => blocked
    ? onChange({ deny_users: [...new Set([...ab.deny_users, id])], users: ab.users.filter(x => x !== id) })
    : onChange({ users: [...new Set([...ab.users, id])], deny_users: ab.deny_users.filter(x => x !== id) })
  const remove = (id: number) => onChange({ users: ab.users.filter(x => x !== id), deny_users: ab.deny_users.filter(x => x !== id) })

  const rows = [...ab.users.map(id => ({ id, blocked: false })), ...ab.deny_users.map(id => ({ id, blocked: true }))]
  const availHits = hits.filter(u => !ab.users.includes(u.id) && !ab.deny_users.includes(u.id))

  return (
    <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: '1px dashed var(--border)' }}>
      {rows.length === 0
        ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum override — busque um usuário para permitir ou bloquear.</p>
        : rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ background: r.blocked ? 'var(--danger-bg)' : 'var(--success-bg)', border: `1px solid ${r.blocked ? 'var(--danger-border)' : 'var(--success-border)'}` }}>
            <span style={{ color: r.blocked ? 'var(--danger-border)' : 'var(--success-border)' }}>{r.blocked ? <X size={13} /> : <Check size={13} />}</span>
            <span className="flex-1 text-[12px] min-w-0 truncate" style={{ color: 'var(--text)' }}>{picked[r.id] ?? `Usuário #${r.id}`}</span>
            <span className="text-[10px]" style={{ color: r.blocked ? 'var(--danger-border)' : 'var(--success-border)' }}>{r.blocked ? 'bloqueado' : 'permitido'}</span>
            {/* toggle permitir / bloquear */}
            <div className="inline-flex rounded-md overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
              <button onClick={() => setBlocked(r.id, false)} title="Permitir" className="px-1.5 py-0.5" style={!r.blocked ? { background: 'var(--success-border)', color: '#fff' } : { color: 'var(--text-muted)' }}><Check size={11} /></button>
              <button onClick={() => setBlocked(r.id, true)} title="Bloquear" className="px-1.5 py-0.5" style={r.blocked ? { background: 'var(--danger-border)', color: '#fff' } : { color: 'var(--text-muted)' }}><X size={11} /></button>
            </div>
            <button onClick={() => remove(r.id)} title="Remover override" className="shrink-0"><Trash2 size={12} style={{ color: 'var(--text-light)' }} /></button>
          </div>
        ))}
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-light)' }} />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Adicionar usuário (override)…" className="ds-input w-full block" style={{ fontSize: 12, height: 30, paddingTop: 0, paddingBottom: 0, paddingLeft: 26, paddingRight: 8 }} />
      </div>
      {/* lista ANCORADA abaixo do campo (no fluxo, empurra o conteúdo — não flutua) */}
      {open && availHits.length > 0 && (
        <div className="max-h-52 overflow-auto rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {availHits.map(u => <button key={u.id} type="button" onMouseDown={e => { e.preventDefault(); add(u) }} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)' }}>{u.name} <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{u.email}</span></button>)}
        </div>
      )}

    </div>
  )
}

function PermModal({ screen, usage, onChange, onClose, filter, profileLabel, profile }: { screen: NavScreen; usage: string[]; onChange: (p: Partial<NavScreen>) => void; onClose: () => void; filter: { type: string; coord: string }; profileLabel: string; profile: string }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold inline-flex items-center gap-2 min-w-0" style={{ color: 'var(--text)' }}><Users size={15} style={{ color: 'var(--primary)' }} className="shrink-0" /> <span className="truncate">Permissões · {screen.label || screen.key}</span></div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="shrink-0"><X size={16} /></button>
        </div>
        <div className="p-4"><ScreenPermBody screen={screen} usage={usage} onChange={onChange} filter={filter} profileLabel={profileLabel} profile={profile} /></div>
        <div className="px-4 py-3 flex justify-end border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="ds-btn-primary text-sm px-4 py-1.5 rounded-lg">Pronto</button>
        </div>
      </div>
    </div>
  )
}
