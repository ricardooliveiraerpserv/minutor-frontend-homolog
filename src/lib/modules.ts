// Módulos de navegação. Camada de NAVEGAÇÃO apenas — não tem relação com permissões.
// Quais módulos cada perfil acessa é configurado no "Cadastro de Perfil" (backend ProfileModule)
// e vem em user.modules. POR ENQUANTO só Administrativo + Serviços (administrativo primeiro).
// O type mantém crm/help_desk só p/ a sidebar tagear grupos (que ficam inertes — VALID limita a 2).

import type { User } from '@/types'

export type ModuleId = 'administrativo' | 'servicos' | 'crm' | 'help_desk'

// Catálogo EXPOSTO (apps launcher) — só os 2 ativos, administrativo PRIMEIRO.
export const MODULES: { id: ModuleId; label: string; emoji: string }[] = [
  { id: 'administrativo', label: 'Administrativo', emoji: '📊' },
  { id: 'servicos',       label: 'Serviços',       emoji: '🛠' },
]

export const MODULE_LABEL: Record<ModuleId, string> = {
  administrativo: 'Administrativo',
  servicos: 'Serviços',
  crm: 'CRM',
  help_desk: 'Help Desk',
}

// Fallback por perfil quando user.modules não veio. Espelha ProfileModule::DEFAULTS no backend.
const DEFAULTS: Record<string, ModuleId[]> = {
  admin:          ['administrativo', 'servicos'],
  administrativo: ['administrativo'],
  coordenador:    ['administrativo', 'servicos'],
  consultor:      ['servicos'],
  parceiro_admin: ['servicos'],
}

// Só estes 2 valem por enquanto (filtra crm/help_desk que possam vir do backend/cache).
const VALID = new Set<ModuleId>(['administrativo', 'servicos'])

/** Módulos efetivos do usuário (user.modules, ou fallback por type). Cliente → []. */
export function modulesForUser(user: User | null | undefined): ModuleId[] {
  if (!user) return []
  const m = (user as { modules?: string[] }).modules
  const list = (Array.isArray(m) ? m : null) ?? DEFAULTS[user.type ?? ''] ?? []
  return list.filter((m): m is ModuleId => VALID.has(m as ModuleId))
}

export const LS_MODULE_KEY = 'minutor_modulo'

/** Lê o módulo lembrado (válido para o usuário). */
export function readStoredModule(allowed: ModuleId[]): ModuleId | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LS_MODULE_KEY) as ModuleId | null
    return v && allowed.includes(v) ? v : null
  } catch {
    return null
  }
}

export function writeStoredModule(m: ModuleId): void {
  try { window.localStorage.setItem(LS_MODULE_KEY, m) } catch { /* ignore */ }
}
