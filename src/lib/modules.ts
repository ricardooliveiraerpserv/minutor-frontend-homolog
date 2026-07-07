// Módulos de navegação — DINÂMICOS (definidos no Configurador, vêm de /nav-config). ModuleId = key (string).
// Mantém uma camada de COMPAT (MODULES / modulesForUser / MODULE_LABEL / MODULE_HOME) para telas legadas
// que ainda referenciam o sistema estático; o sistema atual usa useModules() (nav-config dinâmico).

import type { User } from '@/types'

export type ModuleId = string

export const MODULES: { id: ModuleId; label: string; emoji: string }[] = [
  { id: 'servicos',       label: 'Serviços',       emoji: '🛠' },
  { id: 'administrativo', label: 'Administrativo', emoji: '📊' },
  { id: 'crm',            label: 'CRM',            emoji: '🤝' },
]

export const MODULE_LABEL: Record<string, string> = {
  servicos: 'Serviços',
  administrativo: 'Administrativo',
  crm: 'CRM',
}

// Home de cada módulo (compat p/ troca de módulo pelo fluxo antigo).
export const MODULE_HOME: Record<string, string> = {
  servicos: '/timesheets',
  administrativo: '/dashboard',
  crm: '/crm/pipeline',
}

// Fallback por perfil quando user.modules não veio (cache antigo / login sem o campo).
const DEFAULTS: Record<string, ModuleId[]> = {
  admin:          ['servicos', 'administrativo', 'crm'],
  administrativo: ['administrativo', 'crm'],
  coordenador:    ['servicos', 'administrativo'],
  consultor:      ['servicos'],
  parceiro_admin: ['servicos'],
}

/** Compat (sistema estático): módulos efetivos do usuário por user.modules ou fallback por type. */
export function modulesForUser(user: User | null | undefined): ModuleId[] {
  if (!user) return []
  const raw = Array.isArray(user.modules) ? user.modules : null
  return raw ?? DEFAULTS[user.type ?? ''] ?? []
}

export const LS_MODULE_KEY = 'minutor_modulo'

/** Lê o módulo lembrado (se ainda válido para o usuário). */
export function readStoredModule(allowed: string[]): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LS_MODULE_KEY)
    return v && allowed.includes(v) ? v : null
  } catch {
    return null
  }
}

export function writeStoredModule(m: string): void {
  try { window.localStorage.setItem(LS_MODULE_KEY, m) } catch { /* ignore */ }
}
