// Módulos de navegação — agora DINÂMICOS (definidos no Configurador, vêm de /nav-config).
// Camada de NAVEGAÇÃO apenas. ModuleId é a key do módulo (string).

export type ModuleId = string

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
