// ─────────────────────────────────────────────────────────────────────────────
// Prosight C3 — Ambientes: cliente da projeção SEGURA real (/prosight/environments).
// Espelha o SafeEnvironment do backend (allowlist). O backend é a autoridade do
// escopo/segurança; aqui só consumimos. NUNCA há secret/host/porta/URL no payload.
// Health/RPO ao vivo pertencem ao Conector (Bloco B) → sempre "aguardando_conector".
// ─────────────────────────────────────────────────────────────────────────────

import { api } from '@/lib/api'

export interface SafeEnvironment {
  id: number
  customer_id: number
  name: string
  type: 'prod' | 'homolog' | 'dev' | 'dr'
  status: { code: 'ativo' | 'inativo' | 'manutencao' | 'indefinido'; label: string; note: string }
  components: string[]
  appservers: { name: string; version: string | null; build: string | null; patch: string | null }[]
  databases: { engine: string }[]
  links: { label: string; kind: string }[]
  responsible_name: string | null
  created_at: string | null
  updated_at: string | null
  live: { health: string; rpo: string }
}

/** Ambientes reais (registro do Cofre) da empresa. Empresa é obrigatória no backend. */
export async function fetchProsightEnvironments(customerId: number): Promise<SafeEnvironment[]> {
  const r = await api.get<{ data: { customer_id: number; environments: SafeEnvironment[] } }>(
    `/prosight/environments?customer_id=${customerId}`,
  )
  return r.data.environments
}
