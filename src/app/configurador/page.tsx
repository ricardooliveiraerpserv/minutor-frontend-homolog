'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { NAV_CATALOG, CATALOG_LABEL } from '@/lib/nav-catalog'
import { useNavConfig, type NavModuleConfig, type NavTreeNode, type NavScreen, type ScreenAbility, type ScreenActionDef } from '@/contexts/nav-config-context'
import {
  SlidersHorizontal, Plus, Trash2, ChevronUp, ChevronDown, Save, GripVertical, Eye, EyeOff, Users, X, Search, Check,
  AlertTriangle, MonitorPlay, ChevronRight, FolderPlus, Folder, Repeat, FileText, List, Network, FolderInput,
  FolderOpen, LayoutGrid, BarChart2, DollarSign, Database, Mail, Settings, Layers, Briefcase, Wrench, CreditCard,
  CalendarDays, Building2, Handshake, Clock, Receipt, TrendingUp, Star, Headphones, Home, LayoutDashboard, Contact,
  Ticket, Tag, Zap, Webhook, Box, Package, Bookmark, Flag, Heart, Bell, Calculator, ShieldCheck, type LucideIcon,
} from 'lucide-react'

// Paleta de ícones (lucide) para pastas/módulos — nome → componente. Cobre os ícones já usados na nav.
const ICONS: Record<string, LucideIcon> = {
  Folder, FolderOpen, LayoutGrid, BarChart2, DollarSign, Database, Mail, Settings, Layers, FileText, Briefcase,
  Wrench, CreditCard, CalendarDays, Building2, Handshake, Clock, Receipt, TrendingUp, Star, Headphones, Home,
  LayoutDashboard, Contact, Ticket, Tag, Zap, Webhook, Network, Users, Box, Package, Bookmark, Flag, Heart, Bell,
  Calculator, ShieldCheck,
}
const iconComp = (name?: string, fallback: LucideIcon = Folder): LucideIcon => (name && ICONS[name]) || fallback

const PROFILES: { key: string; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'coordenador_projetos', label: 'Coord. Projeto' },
  { key: 'coordenador_sustentacao', label: 'Coord. Sustentação' },
  { key: 'consultor', label: 'Consultor' },
  { key: 'parceiro_admin', label: 'Parceiro' },
  { key: 'cliente', label: 'Cliente' },
]
const PREVIEW_PROFILES = ['admin', 'administrativo', 'coordenador_projetos', 'coordenador_sustentacao', 'consultor', 'parceiro_admin', 'cliente']
const ALL_INTERNAL = ['admin', 'administrativo', 'coordenador_projetos', 'coordenador_sustentacao', 'consultor', 'parceiro_admin']
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
  { key: 'parceiro',                label: 'Parceiro',        icon: Handshake,   profile: 'parceiro_admin' },
  { key: 'cliente',                 label: 'Cliente',         icon: Building2,   profile: 'cliente' },
]
const PROFILE_MOD_KEYS = ['cliente', 'consultor', 'parceiro']

let _seq = 0
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `nd_${Date.now()}_${_seq++}`)
const screenLabel = (s: NavScreen | undefined, key: string) => s?.label || CATALOG_LABEL[key] || key
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
  const [preview, setPreview] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<'tree' | 'flat'>('tree')
  const [scope, setScope] = useState<string>('admin') // aba: um perfil por vez
  const [addModOpen, setAddModOpen] = useState(false)  // modal "adicionar módulo ao perfil"
  const [newModName, setNewModName] = useState('')
  const [cascade, setCascade] = useState<{ screenKey: string; moduleId: number; nodeId: string; label: string } | null>(null)  // Admin: ocultar em outros perfis?
  const [denyOpen, setDenyOpen] = useState<string | null>(null)  // painel "visibilidade por usuário" (nó da árvore)
  const [moving, setMoving] = useState<string | null>(null) // nó no fluxo "Mover para…"

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
  const patchTreeNode = (moduleId: number, nodeId: string, fn: (n: NavTreeNode) => NavTreeNode) => {
    setMods(prev => prev.map(m => m.id === moduleId ? { ...m, items: mapNode(m.items, nodeId, fn) } : m)); touch()
  }
  const removeTreeNode = (moduleId: number, nodeId: string) => {
    setMods(prev => prev.map(m => m.id === moduleId ? { ...m, items: removeNode(m.items, nodeId)[0] } : m)); touch()
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
    setMods(stripped); touch(); clearDrag()
  }

  // COPIA um módulo existente para o perfil da aba (cópia independente: ids de nó novos, árvore própria).
  const cloneNodes = (nodes: NavTreeNode[]): NavTreeNode[] => nodes.map(n => ({ ...n, id: newId(), children: n.children ? cloneNodes(n.children) : undefined }))
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
  // Candidatos a copiar: qualquer módulo existente que não seja deste perfil (serve de modelo).
  const attachCandidates = useMemo(() => mods.filter(m => !(m.profiles ?? []).includes(profile)), [mods, profile])
  const scopedUsage = useMemo(() => {
    const map: Record<string, string[]> = {}
    const walk = (nodes: NavTreeNode[], modLabel: string) => nodes.forEach(n => {
      if (n.screen) { (map[n.screen] ??= []); if (!map[n.screen].includes(modLabel)) map[n.screen].push(modLabel) }
      if (n.children) walk(n.children, modLabel)
    })
    scopedMods.forEach(m => walk(m.items, m.label))
    return map
  }, [scopedMods])

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
        const dup = usage.length > 1
        const hiddenHere = !!n.hidden   // oculto nesta cópia (independente por perfil)
        return (
          <div key={n.id}>
            <div {...dragProps} className="relative flex items-stretch group" style={{ opacity: hiddenHere ? 0.45 : 1 }}>
              {isOver && <span style={{ position: 'absolute', left: (depth + 1) * INDENT, right: 4, top: -1, height: 2, background: 'var(--primary)', borderRadius: 2, zIndex: 5 }} />}
              {rail}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 rounded-md my-[1px] mr-1 px-2 cursor-grab active:cursor-grabbing"
                style={{ height: 30, background: (isOver || overIn) ? 'var(--primary-soft)' : 'transparent', border: overIn ? '1px dashed var(--primary)' : '1px solid transparent' }}>
                {chevron}
                <button onClick={() => setPermOpen(permOpen === n.id ? null : n.id)} className="shrink-0" title="Acessos por usuário">
                  <FileText size={13} style={{ color: permOpen === n.id ? 'var(--primary)' : hasKids ? 'var(--primary)' : 'var(--text-light)' }} />
                </button>
                <input value={screenLabel(s, n.screen)} onChange={e => patchScreen(n.screen!, { label: e.target.value })}
                  className="flex-1 bg-transparent text-[13px] outline-none min-w-0" style={{ color: 'var(--text)', fontWeight: hasKids ? 600 : 400 }} />
                {hasKids && <span title="Submenu (pai)" className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{n.children!.length}</span>}
                {dup && (
                  <span title={`Reutilizada em ${usage.length} módulos: ${usage.join(', ')}`} className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded shrink-0" style={{ color: 'var(--text-light)' }}>
                    <Repeat size={10} /> {usage.length}
                  </span>
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
                </div>
              </div>
            </div>
            {/* accordion inline de acessos (perfis + usuários esporádicos) */}
            {permOpen === n.id && s && (
              <div className="mr-1 mb-1.5 rounded-lg overflow-hidden" style={{ marginLeft: (depth + 1) * INDENT, border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                <div className="p-3"><ScreenPermBody screen={s} usage={usageByScreen[n.screen] ?? []} onChange={p => patchScreen(n.screen!, p)} filter={profileFilter} profileLabel={tab.label} /></div>
              </div>
            )}
            {denyOpen === n.id && (
              <div className="mr-1 mb-1.5 rounded-lg overflow-hidden" style={{ marginLeft: (depth + 1) * INDENT, border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                <div className="p-3">
                  <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>Visibilidade desta tela por <b>usuário</b> — ✓ libera, ✕ esconde só p/ ele (usuários de <b>{tab.label}</b>).</p>
                  <ActionUsers ab={{ profiles: [], users: n.users ?? [], deny_users: n.deny_users ?? [] }} onChange={patch => setNodeUsers(moduleId, n.id, patch)} filter={profileFilter} />
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
                <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>Visibilidade desta <b>pasta</b> por usuário — ✕ esconde a pasta <b>e todos os filhos</b> só p/ ele (usuários de <b>{tab.label}</b>).</p>
                <ActionUsers ab={{ profiles: [], users: n.users ?? [], deny_users: n.deny_users ?? [] }} onChange={patch => setNodeUsers(moduleId, n.id, patch)} filter={profileFilter} />
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

      {orphanRefs.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning-border)' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span><b>{orphanRefs.length} tela{orphanRefs.length > 1 ? 's' : ''} sem permissão</b> — não aparecer{orphanRefs.length > 1 ? 'ão' : 'á'} no menu. Defina perfis/usuários (chip <Users size={11} className="inline" />) ou remova as referências.</span>
        </div>
      )}

      {view === 'flat'
        ? <FlatView usage={scopedUsage} screens={screens} onPerm={setPermFor} onToggle={k => patchScreen(k, { active: !(screens[k]?.active !== false) })} onLabel={(k, v) => patchScreen(k, { label: v })} />
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
          onChange={p => patchScreen(permFor, p)} onClose={() => setPermFor(null)} filter={profileFilter} profileLabel={tab.label} />
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
      {moving && <MovePicker mods={mods} screens={screens} nodeId={moving} onPick={t => { moveNode(moving, t); setMoving(null) }} onClose={() => setMoving(null)} />}
    </div>
  )
}

/** "Mover para…" — fallback ao drag. Escolhe um destino (raiz de módulo ou grupo); exclui a própria subárvore. */
function MovePicker({ mods, screens, nodeId, onPick, onClose }: { mods: Mod[]; screens: Record<string, NavScreen>; nodeId: string; onPick: (t: Target) => void; onClose: () => void }) {
  const node = useMemo(() => { for (const m of mods) { const f = findNode(m.items, nodeId); if (f) return f } return null }, [mods, nodeId])
  const moverLabel = node?.screen ? screenLabel(screens[node.screen], node.screen) : (node?.label ?? 'item')
  const excluded = useMemo(() => { const s = new Set<string>(); const c = (n: NavTreeNode) => { s.add(n.id); n.children?.forEach(c) }; if (node) c(node); return s }, [node])
  // destino = qualquer nó (grupo OU tela). Mover p/ dentro de uma tela = virar filho (submenu).
  const renderDest = (nodes: NavTreeNode[], moduleId: number, depth: number): React.ReactNode[] => nodes.flatMap(g => {
    if (excluded.has(g.id)) return []
    const isScr = !!g.screen
    const label = isScr ? screenLabel(screens[g.screen!], g.screen!) : (g.label ?? '')
    return [
      <button key={g.id} onClick={() => onPick({ type: 'group', moduleId, groupId: g.id })} className="flex items-center gap-1.5 w-full text-left py-1.5 text-[12px] rounded-md hover:bg-[var(--surface-hover)]" style={{ paddingLeft: 12 + depth * 16, paddingRight: 8, color: 'var(--text)' }}>
        {isScr ? <FileText size={13} style={{ color: 'var(--text-light)' }} /> : <Folder size={13} style={{ color: 'var(--primary)' }} />} {label}{isScr && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>(como filho)</span>}
      </button>,
      ...renderDest(g.children ?? [], moduleId, depth + 1),
    ]
  })
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold inline-flex items-center gap-2 min-w-0" style={{ color: 'var(--text)' }}><FolderInput size={15} style={{ color: 'var(--primary)' }} className="shrink-0" /> <span className="truncate">Mover &quot;{moverLabel}&quot; para…</span></div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="shrink-0"><X size={16} /></button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-auto">
          {mods.map(m => (
            <div key={m.id} className="mb-1">
              <button onClick={() => onPick({ type: 'module', moduleId: m.id })} className="flex items-center gap-1.5 w-full text-left py-1.5 px-2 text-[13px] font-semibold rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)' }}>
                <Network size={13} style={{ color: 'var(--text-muted)' }} /> {m.label} <span className="text-[10px] font-normal" style={{ color: 'var(--text-light)' }}>(raiz)</span>
              </button>
              {renderDest(m.items, m.id, 1)}
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
          O item vai para o fim do destino. Telas não duplicam no mesmo nível (reuso em outro módulo é permitido).
        </div>
      </div>
    </div>
  )
}

/** Visão LISTA (flat) — todas as telas referenciadas, sem hierarquia; foco em escanear permissões. */
function FlatView({ usage, screens, onPerm, onToggle, onLabel }: { usage: Record<string, string[]>; screens: Record<string, NavScreen>; onPerm: (k: string) => void; onToggle: (k: string) => void; onLabel: (k: string, v: string) => void }) {
  const keys = Object.keys(usage).sort((a, b) => screenLabel(screens[a], a).localeCompare(screenLabel(screens[b], b)))
  return (
    <div className="ds-card p-0 overflow-hidden">
      {keys.length === 0 && <p className="text-[12px] text-center py-6" style={{ color: 'var(--text-light)' }}>Nenhuma tela na estrutura.</p>}
      {keys.map((k, i) => {
        const s = screens[k]; const off = s?.active === false; const mods = usage[k] ?? []
        return (
          <div key={k} className="flex items-center gap-2 px-3 group" style={{ height: 38, borderTop: i ? '1px solid var(--border)' : 'none', opacity: off ? 0.55 : 1 }}>
            <FileText size={13} className="shrink-0" style={{ color: 'var(--text-light)' }} />
            <input value={screenLabel(s, k)} onChange={e => onLabel(k, e.target.value)} className="bg-transparent text-[13px] outline-none min-w-0" style={{ color: 'var(--text)', width: 220 }} />
            <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0">
              {mods.map(mod => <span key={mod} className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{mod}</span>)}
              {mods.length > 1 && <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-light)' }}><Repeat size={10} /></span>}
            </div>
            <button onClick={() => onPerm(k)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={noPerm(s) ? { background: 'var(--warning-bg)', color: 'var(--warning-border)' } : { background: 'var(--primary-soft)', color: 'var(--primary)' }}><Users size={11} /> {s?.profiles.length ?? 0}{s?.users.length ? `+${s.users.length}` : ''}</button>
            <button onClick={() => onToggle(k)} title={off ? 'Inativo' : 'Ativo'} className="shrink-0">{off ? <EyeOff size={14} style={{ color: 'var(--text-light)' }} /> : <Eye size={14} style={{ color: 'var(--success-border)' }} />}</button>
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
  const Cur = iconComp(value, fallback ?? Folder)
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen(o => !o)} title="Escolher ícone" className="p-0.5 rounded hover:bg-[var(--surface-hover)]"><Cur size={15} style={{ color: 'var(--primary)' }} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 p-2 grid grid-cols-8 gap-0.5 rounded-lg shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 250 }}>
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
  const term = q.trim().toLowerCase()
  const results = term
    ? NAV_CATALOG.filter(c => c.label.toLowerCase().includes(term) || c.group.toLowerCase().includes(term) || c.key.toLowerCase().includes(term))
    : NAV_CATALOG
  const close = () => { setOpen(false); setQ('') }
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen(o => !o)} title="Inserir no menu uma tela já existente do sistema (referência)"
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg ${prominent ? 'text-[12px] font-medium py-1.5 px-3' : `text-[12px] border border-dashed ${compact ? 'px-2 py-1' : 'py-1.5 px-3'}`}`}
        style={prominent ? { background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <Plus size={prominent ? 14 : 12} /> {childMode ? 'filho' : (prominent ? 'Adicionar tela' : 'tela')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute z-30 left-0 mt-1 w-72 rounded-lg shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
function ScreenPermBody({ screen, usage, onChange, filter, profileLabel }: { screen: NavScreen; usage: string[]; onChange: (p: Partial<NavScreen>) => void; filter: { type: string; coord: string }; profileLabel: string }) {
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
      <ScreenActionsEditor screen={screen} onChange={onChange} filter={filter} />
    </div>
  )
}

/** Ações da tela: catálogo editável (admin adiciona/remove) + override por USUÁRIO. */
function ScreenActionsEditor({ screen, onChange, filter }: { screen: NavScreen; onChange: (p: Partial<NavScreen>) => void; filter: { type: string; coord: string } }) {
  const { screenActions, setScreenActionsFor } = useNavConfig()
  const [openAction, setOpenAction] = useState<string | null>(null)
  const [newAction, setNewAction] = useState('')
  const [busy, setBusy] = useState(false)
  const actions = screenActions[screen.key] ?? []
  const get = (a: string): ScreenAbility => screen.abilities?.[a] ?? { profiles: [], users: [], deny_users: [] }
  const setA = (a: string, patch: Partial<ScreenAbility>) =>
    onChange({ abilities: { ...(screen.abilities ?? {}), [a]: { ...get(a), ...patch } } })

  const addAction = async () => {
    const label = newAction.trim(); if (!label || busy) return
    setBusy(true)
    try { const r = await api.post<{ data: ScreenActionDef[] }>('/nav-screen-actions', { screen_key: screen.key, label }); setScreenActionsFor(screen.key, r.data ?? []); setNewAction(''); toast.success('Ação adicionada') }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setBusy(false) }
  }
  const removeAction = async (ak: string) => {
    if (!confirm('Remover esta ação do catálogo desta tela?')) return
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
          return (
            <div key={a} className="rounded-lg p-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }} title={def.description ?? undefined}>{def.label}</span>
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
                <button onClick={() => removeAction(a)} title="Remover ação do catálogo" className="shrink-0"><Trash2 size={12} style={{ color: 'var(--text-light)' }} /></button>
              </div>
              {open && <ActionUsers ab={ab} onChange={patch => setA(a, patch)} filter={filter} />}
            </div>
          )
        })}
      </div>
      {/* adicionar ação ao catálogo desta tela */}
      <div className="flex gap-2 mt-2">
        <input value={newAction} onChange={e => setNewAction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addAction() }} placeholder="Nova ação (ex.: Resetar senha)" className="ds-input flex-1 text-[12px] px-2 py-1.5" />
        <button onClick={addAction} disabled={!newAction.trim() || busy} className="ds-btn-secondary text-[12px] px-3 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1"><Plus size={13} /> Ação</button>
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--text-light)' }}>Cadastre <b>todas</b> as ações da tela. Por usuário: ✓ libera, ✕ bloqueia. A busca traz só usuários do perfil desta aba.</p>
    </div>
  )
}

/** Override por usuário (lista auditável): cada usuário ✔ permitido (verde) ou ✖ bloqueado (vermelho). */
function ActionUsers({ ab, onChange, filter }: { ab: ScreenAbility; onChange: (p: Partial<ScreenAbility>) => void; filter: { type: string; coord: string } }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ id: number; name: string; email: string }[]>([])
  const [picked, setPicked] = useState<Record<number, string>>({})

  const search = useCallback((term: string) => {
    if (!filter.type && term.trim().length < 2) { setHits([]); return }
    const params = new URLSearchParams()
    if (term.trim()) params.set('search', term.trim())
    if (filter.type) params.set('type', filter.type)
    if (filter.coord) params.set('coordinator_type', filter.coord)
    api.get<{ data: { id: number; name: string; email: string }[] }>(`/notifications/users?${params.toString()}`)
      .then(r => setHits(r.data ?? [])).catch(() => {})
  }, [filter.type, filter.coord])
  useEffect(() => { const t = setTimeout(() => search(q), 250); return () => clearTimeout(t) }, [q, search])

  // adiciona já como PERMITIDO (verde); pode bloquear depois
  const add = (u: { id: number; name: string }) => {
    setPicked(p => ({ ...p, [u.id]: u.name })); setQ(''); setHits([])
    if (!ab.users.includes(u.id) && !ab.deny_users.includes(u.id)) onChange({ users: [...ab.users, u.id] })
  }
  const setBlocked = (id: number, blocked: boolean) => blocked
    ? onChange({ deny_users: [...new Set([...ab.deny_users, id])], users: ab.users.filter(x => x !== id) })
    : onChange({ users: [...new Set([...ab.users, id])], deny_users: ab.deny_users.filter(x => x !== id) })
  const remove = (id: number) => onChange({ users: ab.users.filter(x => x !== id), deny_users: ab.deny_users.filter(x => x !== id) })

  const rows = [...ab.users.map(id => ({ id, blocked: false })), ...ab.deny_users.map(id => ({ id, blocked: true }))]

  return (
    <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: '1px dashed var(--border)' }}>
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-light)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Adicionar usuário (override)…" className="ds-input w-full block" style={{ fontSize: 12, height: 30, paddingTop: 0, paddingBottom: 0, paddingLeft: 26, paddingRight: 8 }} />
        {hits.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-auto rounded-lg shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {hits.map(u => <button key={u.id} onClick={() => add(u)} className="block w-full text-left px-3 py-1 text-[12px] hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)' }}>{u.name} <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{u.email}</span></button>)}
          </div>
        )}
      </div>
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
    </div>
  )
}

function PermModal({ screen, usage, onChange, onClose, filter, profileLabel }: { screen: NavScreen; usage: string[]; onChange: (p: Partial<NavScreen>) => void; onClose: () => void; filter: { type: string; coord: string }; profileLabel: string }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold inline-flex items-center gap-2 min-w-0" style={{ color: 'var(--text)' }}><Users size={15} style={{ color: 'var(--primary)' }} className="shrink-0" /> <span className="truncate">Permissões · {screen.label || screen.key}</span></div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="shrink-0"><X size={16} /></button>
        </div>
        <div className="p-4"><ScreenPermBody screen={screen} usage={usage} onChange={onChange} filter={filter} profileLabel={profileLabel} /></div>
        <div className="px-4 py-3 flex justify-end border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="ds-btn-primary text-sm px-4 py-1.5 rounded-lg">Pronto</button>
        </div>
      </div>
    </div>
  )
}
