// Módulos de navegação (Serviços / Administrativo). Camada de NAVEGAÇÃO apenas —
// não tem relação com permissões. Quais módulos cada perfil acessa é configurado no
// "Cadastro de Perfil" (backend ProfileModule) e vem em user.modules.

import type { User } from '@/types'

export type ModuleId = 'servicos' | 'administrativo' | 'crm'

export const MODULES: { id: ModuleId; label: string; emoji: string }[] = [
  { id: 'servicos',       label: 'Serviços',       emoji: '🛠' },
  { id: 'administrativo', label: 'Administrativo', emoji: '📊' },
  { id: 'crm',            label: 'CRM',            emoji: '🤝' },
]

export const MODULE_LABEL: Record<ModuleId, string> = {
  servicos: 'Serviços',
  administrativo: 'Administrativo',
  crm: 'CRM',
}

// Fallback por perfil quando user.modules não veio (cache antigo / login sem o campo).
// Espelha ProfileModule::DEFAULTS no backend. Cliente NÃO tem módulos (mantém portal).
const DEFAULTS: Record<string, ModuleId[]> = {
  admin:          ['servicos', 'administrativo', 'crm'],
  administrativo: ['administrativo', 'crm'],
  coordenador:    ['servicos', 'administrativo'],
  consultor:      ['servicos'],
  parceiro_admin: ['servicos'],
}

const VALID = new Set<ModuleId>(['servicos', 'administrativo', 'crm'])

/** Módulos efetivos do usuário (user.modules, ou fallback por type). Cliente → []. */
export function modulesForUser(user: User | null | undefined): ModuleId[] {
  if (!user) return []
  const raw = Array.isArray(user.modules) ? user.modules : null
  const list = raw ?? DEFAULTS[user.type ?? ''] ?? []
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
